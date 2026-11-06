using System.Collections.Concurrent;
using System.Diagnostics;
using System.Security.Cryptography;
using System.Text;
using System.Text.Json;
using Dapper;
using FcMarket.Api.Data;
using FcMarket.Api.Domain;
using FcMarket.Api.FieldMaps;
using FcMarket.Api.Market;

namespace FcMarket.Api.Analysis;

public sealed class RecruitmentService(CareerDb db, AppDb appDb, SquadAnalysisService profiles, FieldMapProvider maps,
    MarketLoader loader, ReloadingJsonFile<RecruitmentConfig> rules, ReloadingJsonFile<PositionRatingConfig> positionRatings, ILogger<RecruitmentService> logger)
{
    static readonly JsonSerializerOptions Json = new(JsonSerializerDefaults.Web);
    sealed record Pool(IReadOnlyList<RecruitmentPlayer> Players, HashSet<int> OwnIds, int? LeagueId, string? LeagueName, WageCurve? Wages, int? OwnPrestige);
    readonly ConcurrentDictionary<string, Lazy<Pool>> pools = new();
    readonly ConcurrentDictionary<string, Lazy<RecruitmentResult>> results = new();

    public string RuleVersion
    {
        get
        {
            var cfg = rules.Current;
            if (rules.Error is not null || maps.Error is not null) throw new DataUnavailableException("Öneri ayarları okunamadı.");
            RecruitmentEngine.Validate(cfg, maps.Current.AnalysisAttributes);
            return cfg.Version + "-" + Convert.ToHexString(SHA256.HashData(Encoding.UTF8.GetBytes(JsonSerializer.Serialize(cfg, Json))))[..12];
        }
    }

    public RecruitmentScenarioPool ScenarioPool(string? saveUid, AnalysisContext ctx)
    {
        var key = ctx.Snapshot.SnapshotId + "|" + ctx.Snapshot.Revision + "|" + ctx.ConfigVersion;
        var pending = pools.GetOrAdd(key, _ => new Lazy<Pool>(() => ReadPool(saveUid, ctx), LazyThreadSafetyMode.ExecutionAndPublication));
        try { var pool = pending.Value; return new(pool.Players, pool.OwnIds, pool.Wages); }
        catch { pools.TryRemove(key, out _); throw; }
    }

    public RecruitmentCost ScenarioCost(RecruitmentPlayer player, ManagerProfile profile, RecruitmentScenarioPool pool, long? topWage) =>
        RecruitmentEngine.Cost(player.Player, profile, rules.Current, player.LastTransfer, pool.Wages, topWage);

    static void Current(DepthReport report, AnalysisProfileView current)
    {
        var ctx = current.Context;
        if (ctx.ScopeKey != report.ScopeKey || ctx.ViewMode != report.ViewMode || ctx.Snapshot.SnapshotId != report.Snapshot.SnapshotId ||
            ctx.Snapshot.Revision != report.Snapshot.Revision || ctx.ConfigVersion != report.ConfigVersion || current.Version != report.ProfileVersion)
            throw new AnalysisConflictException("Bu ihtiyaç raporu artık güncel değil. Güncel profil ile kadroyu tekrar analiz et.");
    }

    public RecruitmentResult Get(string? saveUid, string reportId, string formation, string slot)
    {
        var timer = Stopwatch.StartNew();
        var view = profiles.Get(saveUid); var ctx = view.Context;
        using var app = appDb.Open();
        var json = app.QuerySingleOrDefault<string>("SELECT report_json FROM analysis_runs WHERE id=@id AND career_key=@key AND view_mode=@mode",
            new { id = reportId, key = ctx.ScopeKey, mode = ctx.ViewMode }) ?? throw new NotFoundException("İhtiyaç raporu bu kariyerde bulunamadı. Kadroyu analiz et.");
        DepthReport report;
        try { report = JsonSerializer.Deserialize<DepthReport>(json, Json) ?? throw new JsonException(); }
        catch (JsonException ex) { throw new DataUnavailableException("Saklanan analiz raporu okunamadı. Yeniden analiz et.", ex); }
        Current(report, view);
        if (!report.Formations.Any(f => f.Formation == formation && f.Slots.Any(s => s.Slot == slot)))
            throw new BadRequestException("Seçilen diziliş/yeri ihtiyaç raporunda yok.");
        var cfg = rules.Current; var map = maps.Current;
        if (rules.Error is not null || maps.Error is not null) throw new DataUnavailableException("Öneri ayarları okunamadı.");
        RecruitmentEngine.Validate(cfg, map.AnalysisAttributes);
        var ruleHash = RuleVersion;
        var poolKey = ctx.Snapshot.SnapshotId + "|" + ctx.Snapshot.Revision + "|" + ctx.ConfigVersion;
        var key = reportId + "|" + report.ProfileVersion + "|" + formation + "|" + slot + "|" + ruleHash + "|recruitment-3";
        var lazy = results.GetOrAdd(key, resultKey => new Lazy<RecruitmentResult>(() =>
        {
            var pending = pools.GetOrAdd(poolKey, _ => new Lazy<Pool>(() => ReadPool(saveUid, ctx), LazyThreadSafetyMode.ExecutionAndPublication));
            Pool pool;
            try { pool = pending.Value; } catch { pools.TryRemove(poolKey, out _); throw; }
            var labels = map.AnalysisAttributes.ToDictionary(a => a.Key, a => map.AttributeLabels.GetValueOrDefault(a.Value, a.Key));
            return RecruitmentEngine.Build(ctx, report, formation, slot, pool.Players, pool.OwnIds, cfg, ruleHash, labels, map.PlayStyles,
                LeagueContext(pool.Players.Select(p => p.Player), pool.LeagueId, pool.LeagueName, cfg.LeagueMinimumPlayers), pool.Wages, pool.OwnPrestige);
        }, LazyThreadSafetyMode.ExecutionAndPublication));
        RecruitmentResult result;
        try { result = lazy.Value; } catch { results.TryRemove(key, out _); throw; }
        try { Current(report, profiles.Get(saveUid)); }
        catch { results.TryRemove(key, out _); pools.TryRemove(poolKey, out _); throw; }
        // Persist the exact rule snapshot and ranked output for audit, without saving/changing manager preferences.
        app.Execute("INSERT OR IGNORE INTO recruitment_runs VALUES (@id,@analysis,@formation,@slot,@rules,@at,@config,@result)",
            new { id = Convert.ToHexString(SHA256.HashData(Encoding.UTF8.GetBytes(key))), analysis = reportId, formation, slot,
                rules = ruleHash, at = DateTimeOffset.UtcNow.ToString("O"),
                config = JsonSerializer.Serialize(new { engine = "recruitment-3", config = cfg }, Json), result = JsonSerializer.Serialize(result, Json) });
        // Bounded process-local caches; every hit still checks current career, revision, config and profile version.
        if (pools.Count > 2) foreach (var old in pools.Keys.Where(k => k != poolKey).Take(pools.Count - 2)) pools.TryRemove(old, out _);
        if (results.Count > 48) foreach (var old in results.Keys.Where(k => k != key).Take(results.Count - 48)) results.TryRemove(old, out _);
        logger.LogInformation("Recruitment {Report} scope {Scope} snapshot {Snapshot} revision {Revision} rules {Rules} formation {Formation} slot {Slot} pool {Pool} groups {Groups} excluded {Excluded} elapsedMs {Elapsed}",
            reportId, ctx.ScopeKey, ctx.Snapshot.SnapshotId, ctx.Snapshot.Revision, ruleHash, formation, slot,
            result.PoolSize, string.Join(',', result.Groups.Select(g => g.Key + ":" + g.Total)), JsonSerializer.Serialize(result.Excluded), timer.ElapsedMilliseconds);
        return result;
    }

    Pool ReadPool(string? saveUid, AnalysisContext ctx)
    {
        var map = maps.Current;
        using var con = db.Open();
        con.Execute("BEGIN;");
        try
        {
            var selected = db.LatestSnapshot(con, saveUid);
            if (selected.SnapshotId != ctx.Snapshot.SnapshotId || selected.Revision != ctx.Snapshot.Revision)
                throw new AnalysisConflictException("Oyuncu havuzu okunurken kariyer değişti. Yeniden analiz et.");
            // Exact snapshot only. No history-derived performance or another export fills missing attributes.
            var market = loader.Load(con, map, [selected]); var schema = market.Schema;
            var teamLeague = MarketLoader.Keyed(con, schema, map.LeagueTeamLink, selected.SnapshotId, "teamId", ["leagueId"], orderBy: "leagueId");
            var leagueId = ctx.Snapshot.UserTeamId is { } teamId ? MarketLoader.Int(teamLeague.GetValueOrDefault(teamId)?[0]) : null;
            var leagues = MarketLoader.Keyed(con, schema, map.League, selected.SnapshotId, "id", ["name"]);
            var leagueName = leagueId is { } lid ? MarketLoader.Str(leagues.GetValueOrDefault(lid)?[0]) : null;
            var transfers = TransferEvidenceReader.Read(con, schema, selected.SnapshotId, ctx.Snapshot.GameDate);
            var prestige = MarketLoader.Keyed(con, schema, map.Team, selected.SnapshotId, "id", ["internationalPrestige"]);
            int? Prestige(int? team) => team is { } id ? MarketLoader.Int(prestige.GetValueOrDefault(id)?[0]) : null;
            var ratingConfig = positionRatings.Current;
            var own = ctx.Players.Select(p => p.Id).ToHashSet();
            foreach (var (id, values) in MarketLoader.Keyed(con, schema, map.Loan, selected.SnapshotId, "playerId", ["fromTeamId", "endDate"]))
                if (MarketLoader.Int(values[0]) == ctx.Snapshot.UserTeamId && Metrics.BirthDate(MarketLoader.Int(values[1]), map.Epoch) >= ctx.Snapshot.GameDate)
                    own.Add(id);
            var features = new Dictionary<int, (Dictionary<string, int?> Attributes, bool Roles, bool Styles)>();
            var attrs = map.AnalysisAttributes.Keys.ToArray();
            var metadata = Enumerable.Range(1, 9).Select(i => "role" + i).Concat(["playStyles1", "playStyles2", "playStylesPlus1", "playStylesPlus2"]).ToArray();
            if (schema.HasTable(map.Player) && schema.Column(map.Player, "id") is { } pid)
            {
                using var cmd = con.CreateCommand();
                var columns = attrs.Select(a => schema.RawColumn(map.Player, map.AnalysisAttributes[a]) ?? "NULL").Concat(metadata.Select(m => schema.Select(map.Player, m)));
                cmd.CommandText = $"SELECT {pid},{string.Join(',', columns)} FROM {schema.Table(map.Player)} WHERE snapshot_id=$snap";
                cmd.Parameters.AddWithValue("$snap", selected.SnapshotId);
                using var reader = cmd.ExecuteReader();
                while (reader.Read()) if (MarketLoader.Int(reader.IsDBNull(0) ? null : reader.GetValue(0)) is { } id && !features.ContainsKey(id))
                {
                    var values = attrs.Select((a, i) => (a, v: reader.IsDBNull(i + 1) ? null : MarketLoader.Int(reader.GetValue(i + 1))))
                        .ToDictionary(x => x.a, x => x.v is >= 0 and <= 100 ? x.v : null);
                    var roleKnown = Enumerable.Range(1 + attrs.Length, 9).All(i => !reader.IsDBNull(i));
                    var styleKnown = Enumerable.Range(1 + attrs.Length + 9, 4).All(i => !reader.IsDBNull(i));
                    features[id] = (values, roleKnown, styleKnown);
                }
            }
            var cfg = rules.Current;
            var clubWages = ctx.Players.Where(p => p.Overall >= cfg.WageMinimumOverall && p.WeeklyWage > 0).Select(p => (p.Overall!.Value, p.WeeklyWage!.Value)).ToArray();
            var leagueWages = market.Players.Where(p => p.LeagueId == leagueId && p.Overall >= cfg.WageMinimumOverall && p.Wage > 0).Select(p => (p.Overall!.Value, p.Wage!.Value)).ToArray();
            var wages = (clubWages.Length >= cfg.WageMinimumPlayers ? WageCurve.Fit(clubWages, "club") : null) ??
                (leagueId is not null && leagueWages.Length >= cfg.WageMinimumPlayers ? WageCurve.Fit(leagueWages, "league") : null);
            return new(market.Players.Select(p =>
            {
                var f = features.GetValueOrDefault(p.Id); var known = f.Attributes ?? [];
                var raw = map.AnalysisAttributes.Where(a => known.ContainsKey(a.Key)).ToDictionary(a => a.Value, a => known[a.Key]);
                var ratings = known.Count == 0 ? null : PositionRatings.Compute(ratingConfig, raw, p.Positions.FirstOrDefault(), p.Overall)
                    .Where(r => r.Rating is not null && p.Positions.Contains(r.Position)).ToDictionary(r => r.Position, r => r.Rating!.Value);
                return new RecruitmentPlayer(p, known, f.Roles, f.Styles, transfers.GetValueOrDefault(p.Id), ratings, Prestige(p.ClubId));
            }).ToArray(), own, leagueId, leagueName, wages, Prestige(ctx.Snapshot.UserTeamId));
        }
        finally { con.Execute("ROLLBACK;"); }
    }

    public static RecruitmentLeagueContext LeagueContext(IEnumerable<MarketPlayer> players, int? leagueId, string? name, int minimumPlayers)
    {
        if (leagueId is null) return new(null, name, null, 0);
        var teams = players.Where(p => p.LeagueId == leagueId && p.ClubId is not null && p.Overall is >= 0 and <= 100)
            .GroupBy(p => p.ClubId).Select(g => g.Select(p => p.Overall!.Value).OrderDescending().Take(11).ToArray())
            .Where(a => a.Length >= minimumPlayers).Select(a => a.Average()).Order().ToArray();
        double? median = teams.Length < 2 ? null : teams.Length % 2 == 0 ? (teams[teams.Length / 2 - 1] + teams[teams.Length / 2]) / 2 : teams[teams.Length / 2];
        return new(leagueId, name, median is { } m ? Math.Round(m, 1) : null, teams.Length);
    }
}
