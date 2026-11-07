using System.Collections.Concurrent;
using System.Globalization;
using System.Diagnostics;
using System.Diagnostics.CodeAnalysis;
using System.Security.Cryptography;
using System.Text;
using System.Text.Json;
using Dapper;
using FcMarket.Api.Data;
using FcMarket.Api.Domain;
using FcMarket.Api.FieldMaps;
using FcMarket.Api.Market;
using Microsoft.Data.Sqlite;

namespace FcMarket.Api.Analysis;

public sealed class SquadAnalysisService(CareerDb db, AppDb appDb, FieldMapProvider maps, MarketLoader loader,
    ReloadingJsonFile<AnalysisConfig> rules, ReloadingJsonFile<PositionRatingConfig> positionRatings, ILogger<SquadAnalysisService> logger)
{
    readonly ConcurrentDictionary<string, IReadOnlyList<LeagueClub>> leagueClubs = new();
    static readonly JsonSerializerOptions Json = new(JsonSerializerDefaults.Web);
    sealed record ProfileRow(string ProfileJson, long Version, string UpdatedAt, string SnapshotId, long SnapshotRevision, string ConfigVersion);
    static long? Number(object? value) => long.TryParse(Convert.ToString(value, CultureInfo.InvariantCulture), out var n) ? n : null;
    static int? Int(object? value) => Number(value) is >= int.MinValue and <= int.MaxValue and var n ? (int?)n : null;
    static int? Attribute(object? value) => Int(value) is >= 0 and <= 100 and var n ? n : null;

    static string[] RegisteredPositions(FieldMap map, IEnumerable<int?> codes) => codes.Select(map.PositionLabel)
        .OfType<string>().Where(pos => pos != "CF" && map.PositionGroups.Values.Any(g => g.Contains(pos))).Distinct().ToArray();

    /// <summary>Estimated rating in each registered position. Unknown attributes give no rating, never a low one.</summary>
    Dictionary<string, int>? Ratings(FieldMap map, IReadOnlyDictionary<string, int?> attributes, string[] positions, int? overall)
    {
        var raw = new Dictionary<string, int?>();
        foreach (var (key, value) in attributes) if (map.AnalysisAttributes.TryGetValue(key, out var column)) raw[column] = value;
        var ratings = PositionRatings.Compute(positionRatings.Current, raw, positions.FirstOrDefault(), overall)
            .Where(r => r.Rating is not null && positions.Contains(r.Position)).ToDictionary(r => r.Position, r => r.Rating!.Value);
        return ratings.Count == 0 ? null : ratings;
    }

    /// <summary>Every club of the user's league from this snapshot, read once per revision for the like-with-like comparison.</summary>
    IReadOnlyList<LeagueClub> LeagueClubs(SqliteConnection con, ResolvedSchema schema, FieldMap map, SnapshotInfo snap)
    {
        var key = snap.SnapshotId + "|" + snap.Revision + "|" + snap.UserTeamId;
        if (leagueClubs.TryGetValue(key, out var cached)) return cached;
        if (snap.UserTeamId is not { } userTeam || !schema.HasTable(map.LeagueTeamLink) || !schema.HasTable(map.SquadLink) || !schema.HasTable(map.Player) ||
            schema.Column(map.SquadLink, "teamId") is not { } teamColumn || schema.Column(map.Player, "id") is not { } idColumn) return [];
        var links = MarketLoader.Keyed(con, schema, map.LeagueTeamLink, snap.SnapshotId, "teamId", ["leagueId"], orderBy: "leagueId");
        if (!links.TryGetValue(userTeam, out var own) || Int(own[0]) is not { } leagueId) return [];
        var teams = links.Where(x => Int(x.Value[0]) == leagueId).Select(x => x.Key).Order().ToArray();
        var names = MarketLoader.Keyed(con, schema, map.Team, snap.SnapshotId, "id", ["name"]);
        List<object?[]> Rows(string table, string[] columns, string column, IReadOnlyCollection<int> values)
        {
            using var cmd = con.CreateCommand();
            cmd.Parameters.AddWithValue("$snap", snap.SnapshotId);
            var parameters = values.Select((v, i) => { var p = "$v" + i; cmd.Parameters.AddWithValue(p, v); return p; }).ToArray();
            cmd.CommandText = $"SELECT {string.Join(',', columns)} FROM {table} WHERE snapshot_id=$snap AND {column} IN ({string.Join(',', parameters)})";
            var rows = new List<object?[]>();
            using var r = cmd.ExecuteReader();
            while (r.Read()) rows.Add(Enumerable.Range(0, columns.Length).Select(i => r.IsDBNull(i) ? null : r.GetValue(i)).ToArray());
            return rows;
        }
        var squads = Rows(schema.Table(map.SquadLink), [teamColumn, schema.Select(map.SquadLink, "playerId")], teamColumn, teams)
            .Select(r => (Team: Int(r[0]), Player: Int(r[1]))).Where(r => r.Team is not null && r.Player is not null).ToArray();
        string[] fields = ["overall", .. Enumerable.Range(1, 7).Select(i => "position" + i)];
        var attributeKeys = map.AnalysisAttributes.Keys.ToArray();
        string[] columns = [idColumn, .. fields.Select(f => schema.Select(map.Player, f)), .. attributeKeys.Select(k => schema.RawColumn(map.Player, map.AnalysisAttributes[k]) ?? "NULL")];
        var players = new Dictionary<int, AnalysisPlayer>();
        foreach (var r in Rows(schema.Table(map.Player), columns, idColumn, squads.Select(x => x.Player!.Value).Distinct().ToArray()))
        {
            if (Int(r[0]) is not { } id || players.ContainsKey(id)) continue;
            var overall = Attribute(r[1]);
            var positions = RegisteredPositions(map, Enumerable.Range(2, 7).Select(i => Int(r[i])));
            var attributes = attributeKeys.Select((k, i) => (k, v: Attribute(r[9 + i]))).ToDictionary(x => x.k, x => x.v);
            players[id] = new(id, "#" + id, null, overall, null, positions, null, null, null, null, null, null, null, [], [], new(null, "missing", null), null, null, null,
                Ratings(map, attributes, positions, overall));
        }
        IReadOnlyList<LeagueClub> clubs = squads.GroupBy(x => x.Team!.Value).Select(g => new LeagueClub(g.Key, MarketLoader.Str(names.GetValueOrDefault(g.Key)?[0]),
            g.Select(x => players.GetValueOrDefault(x.Player!.Value)).OfType<AnalysisPlayer>().DistinctBy(p => p.Id).ToArray())).ToArray();
        if (leagueClubs.Count >= 4) leagueClubs.Clear();
        return leagueClubs[key] = clubs;
    }

    /// <param name="reviewTeamId">Kulüp incelemesi: başka bir takımın kadrosu aynı motorla, o takım "kendi takımı" sayılarak
    /// okunur. Yalnız kullanıcı kulübüne ait girdiler (bütçe, maaş alanı, yönetim hedefi) bu durumda boş kalır.</param>
    public AnalysisContext Context(string? saveUid, int? reviewTeamId = null)
    {
        var timer = Stopwatch.StartNew();
        var cfg = rules.Current;
        if (rules.Error is not null || cfg.Formations is null || cfg.Formations.Count == 0 || cfg.Choices is null || cfg.SlotAliases is null ||
            cfg.Formations.Values.Any(slots => slots is null || slots.Length != 11 || slots.Distinct().Count() != 11 || slots.Contains("CF")) ||
            new[] { "attack", "defense", "tempo", "horizon", "matchMode" }.Any(key => !cfg.Choices.TryGetValue(key, out var choices) || choices is null || choices.Count == 0))
            throw new DataUnavailableException("Analiz ayarları okunamadı veya geçersiz.");
        var map = maps.Current;
        if (maps.Error is not null) throw new DataUnavailableException("Analiz için alan eşlemesi okunamadı.");
        using var con = db.Open();
        // One SQLite read snapshot for identity, raw values and provenance; no live/fallback ClubView blending.
        con.Execute("BEGIN;");
        try
        {
            var selected = db.LatestSnapshot(con, saveUid);
            var snap = loader.ToInfo(selected);
            var schema = ResolvedSchema.FromDb(map, con);
            var configHash = Convert.ToHexString(SHA256.HashData(Encoding.UTF8.GetBytes(
                JsonSerializer.Serialize(new { cfg, map }, Json))))[..12];
            var configVersion = cfg.Version + "-" + configHash;
            var sources = CareerDb.TableExists(con, "snapshot_tables")
                ? con.Query<(string TableName, string Source)>("SELECT table_name,source FROM snapshot_tables WHERE snapshot_id=@id", new { id = snap.SnapshotId })
                    .ToDictionary(x => x.TableName, x => x.Source) : [];
            AnalysisOrigin Origin(Dictionary<string, string> section)
            {
                var kind = sources.GetValueOrDefault(section.GetValueOrDefault(FieldMap.TableKey, ""), "unknown");
                // Daily snapshots carry forward untouched tables; their original observation day is not stored.
                var inherited = snap.Source == "daily" && kind != "daily";
                return new(snap.SnapshotId, inherited ? null : snap.GameDate, inherited ? "inherited" : kind);
            }
            var ids = new HashSet<int>();
            List<Dictionary<string, object?>> Read(Dictionary<string, string> section, string[] fields,
                string? filter = null, object? value = null, string? idsField = null)
            {
                if (!schema.HasTable(section) || filter is not null && schema.Column(section, filter) is null) return [];
                if (idsField is not null && (ids.Count == 0 || schema.Column(section, idsField) is null)) return [];
                using var cmd = con.CreateCommand();
                var columns = fields.Select(f => schema.Select(section, f));
                cmd.CommandText = $"SELECT {string.Join(',', columns)} FROM {schema.Table(section)} WHERE snapshot_id=$snap";
                cmd.Parameters.AddWithValue("$snap", snap.SnapshotId);
                if (filter is not null)
                {
                    cmd.CommandText += $" AND {schema.Column(section, filter)}=$value";
                    cmd.Parameters.AddWithValue("$value", value ?? DBNull.Value);
                }
                if (idsField is not null)
                {
                    var parameters = ids.Select((id, i) => { var p = "$id" + i; cmd.Parameters.AddWithValue(p, id); return p; }).ToArray();
                    cmd.CommandText += $" AND {schema.Column(section, idsField)} IN ({string.Join(',', parameters)})";
                }
                var rows = new List<Dictionary<string, object?>>();
                using var r = cmd.ExecuteReader();
                while (r.Read()) rows.Add(fields.Select((f, i) => (f, v: r.IsDBNull(i) ? null : r.GetValue(i))).ToDictionary(x => x.f, x => x.v));
                return rows;
            }
            object? Cell(Dictionary<string, object?>? r, string f) => r?.GetValueOrDefault(f);
            Dictionary<int, Dictionary<string, object?>> Indexed(List<Dictionary<string, object?>> rows, string key) => rows
                .Where(r => Int(Cell(r, key)) is not null).GroupBy(r => Int(Cell(r, key))!.Value).ToDictionary(g => g.Key, g => g.First());
            var review = reviewTeamId is { } reviewed && reviewed != snap.UserTeamId;
            if (review)
            {
                var row = Read(map.Team, ["name"], "id", reviewTeamId).FirstOrDefault() ?? throw new NotFoundException("Takım bulunamadı.");
                snap = snap with { UserTeamId = reviewTeamId, UserTeamName = Convert.ToString(Cell(row, "name")), TransferBudget = null, WageBudget = null };
            }

            var links = Read(map.SquadLink, ["playerId", "slot", "injury", "form"], "teamId", snap.UserTeamId);
            ids.UnionWith(links.Select(r => Int(Cell(r, "playerId"))).OfType<int>());
            if (ids.Count > 1000) throw new DataUnavailableException("Kadro bağlantılarının kapsamı beklenenden büyük; kaynak veriyi kontrol et.");
            string[] roleKeys = Enumerable.Range(1, 9).Select(i => "role" + i).ToArray();
            string[] styleKeys = ["playStyles1", "playStyles2", "playStylesPlus1", "playStylesPlus2"];
            string[] coreKeys = ["id", "birthdate", "overall", "potential", "position1", "position2", "position3", "position4", "position5", "position6", "position7", "foot", .. roleKeys, .. styleKeys];
            var core = Indexed(Read(map.Player, coreKeys, idsField: "id"), "id");
            var names = Indexed(Read(map.Names, ["playerId", "name"], idsField: "playerId"), "playerId");
            var contracts = Indexed(Read(map.Contract, ["playerId", "wage", "endYear"], idsField: "playerId"), "playerId");
            var fitness = Indexed(Read(map.CareerFitness, ["playerId", "fitness", "severity", "phase", "daysToFit", "returnDate"], idsField: "playerId"), "playerId");
            var loans = Indexed(Read(map.Loan, ["playerId", "fromTeamId", "endDate"], idsField: "playerId"), "playerId");
            // Bulk attribute read. Player rows and attributes share the same table order only via an explicit id column.
            var attributeKeys = map.AnalysisAttributes.Keys.ToArray();
            var attrs = new Dictionary<int, Dictionary<string, int?>>();
            if (schema.HasTable(map.Player) && schema.Column(map.Player, "id") is { } pid && attributeKeys.Length > 0)
            {
                using var cmd = con.CreateCommand();
                cmd.CommandText = $"SELECT {pid},{string.Join(',', attributeKeys.Select(k => schema.RawColumn(map.Player, map.AnalysisAttributes[k]) ?? "NULL"))} FROM {schema.Table(map.Player)} WHERE snapshot_id=$snap";
                cmd.Parameters.AddWithValue("$snap", snap.SnapshotId);
                if (ids.Count == 0) cmd.CommandText += " AND 0";
                else
                {
                    var parameters = ids.Select((id, i) => { var p = "$id" + i; cmd.Parameters.AddWithValue(p, id); return p; }).ToArray();
                    cmd.CommandText += $" AND {pid} IN ({string.Join(',', parameters)})";
                }
                using var r = cmd.ExecuteReader();
                while (r.Read()) if (Int(r.IsDBNull(0) ? null : r.GetValue(0)) is { } id && ids.Contains(id))
                    attrs[id] = attributeKeys.Select((k, i) => (k, v: Attribute(r.IsDBNull(i + 1) ? null : r.GetValue(i + 1)))).ToDictionary(x => x.k, x => x.v);
            }
            var players = ids.Order().Select(id =>
            {
                core.TryGetValue(id, out var p); contracts.TryGetValue(id, out var c); fitness.TryGetValue(id, out var fit);
                var link = links.First(r => Int(Cell(r, "playerId")) == id);
                var positions = RegisteredPositions(map, Enumerable.Range(1, 7).Select(i => Int(Cell(p, "position" + i))));
                var slot = Int(Cell(link, "slot")) is { } sl && sl < map.SquadSlots.Bench && sl != map.SquadSlots.Reserve
                    ? map.SlotPositions.GetValueOrDefault(sl.ToString(CultureInfo.InvariantCulture)) : null;
                AnalysisValue Obs(object? value, Dictionary<string, string> section, string? note = null) =>
                    new(value, value is null ? "missing" : "known", value is null ? null : Origin(section), note);
                var loan = loans.GetValueOrDefault(id);
                var loanEnd = Metrics.BirthDate(Int(Cell(loan, "endDate")), map.Epoch);
                var currentLoan = loanEnd >= snap.GameDate && Int(Cell(loan, "fromTeamId")) is not null;
                var name = Convert.ToString(Cell(names.GetValueOrDefault(id), "name"));
                var playerAttributes = attrs.GetValueOrDefault(id) ?? attributeKeys.ToDictionary(k => k, _ => (int?)null);
                return new AnalysisPlayer(id, string.IsNullOrWhiteSpace(name) ? "#" + id : name,
                    Metrics.Age(Metrics.BirthDate(Int(Cell(p, "birthdate")), map.Epoch), snap.GameDate),
                    Attribute(Cell(p, "overall")), Attribute(Cell(p, "potential")), positions, slot,
                    Number(Cell(c, "wage")), Int(Cell(c, "endYear")), Attribute(Cell(fit, "fitness")),
                    roleKeys.Any(k => Cell(p, k) is not null) ? roleKeys.Select(k => Int(Cell(p, k))).OfType<int>().Where(n => n > 0).Distinct().ToArray() : null,
                    styleKeys.Take(2).Any(k => Cell(p, k) is not null) ? PlayerAbilities.KnownStyleBits(map, Cell(p, styleKeys[0]), Cell(p, styleKeys[1])) : null,
                    styleKeys.Skip(2).Any(k => Cell(p, k) is not null) ? PlayerAbilities.KnownStyleBits(map, Cell(p, styleKeys[2]), Cell(p, styleKeys[3])) : null,
                    playerAttributes,
                    new() { ["injuryFlag"] = Obs(Int(Cell(link, "injury")), map.SquadLink),
                        ["fitness"] = Obs(Attribute(Cell(fit, "fitness")), map.CareerFitness),
                        ["severity"] = Obs(Int(Cell(fit, "severity")), map.CareerFitness),
                        ["phase"] = Obs(Int(Cell(fit, "phase")), map.CareerFitness),
                        ["daysToFit"] = Obs(Int(Cell(fit, "daysToFit")), map.CareerFitness),
                        ["returnDate"] = Obs(Int(Cell(fit, "returnDate")), map.CareerFitness) },
                    new(currentLoan ? new { fromTeamId = Int(Cell(loan, "fromTeamId")), endDate = loanEnd } : null,
                        currentLoan ? "unverified" : "missing", currentLoan ? Origin(map.Loan) : null, "Kiralık tablosu bayat olabilir; kayıt yoksa kiralık değildir sonucu çıkarılmaz."),
                    Int(Cell(link, "slot")), Int(Cell(link, "form")),
                    Int(Cell(p, "foot")) is { } foot ? map.Feet.GetValueOrDefault(foot.ToString(CultureInfo.InvariantCulture)) : null,
                    Ratings(map, playerAttributes, positions, Attribute(Cell(p, "overall"))));
            }).ToArray();
            var finance = review ? null : Read(map.CareerFinance, ["transferBudget", "wageHeadroom"]).FirstOrDefault();
            var team = Read(map.Team, ["buildUpPlay", "defensiveDepth"], "id", snap.UserTeamId).FirstOrDefault();
            var transfer = Number(Cell(finance, "transferBudget"));
            AnalysisValue Val(object? value, AnalysisOrigin? origin, string? note = null, bool unverified = false) =>
                new(value, value is null ? "missing" : unverified ? "unverified" : "known", value is null ? null : origin, note);
            var inputs = new Dictionary<string, AnalysisValue>
            {
                ["transferBudget"] = Val(transfer ?? snap.TransferBudget, transfer is not null ? Origin(map.CareerFinance) : new(snap.SnapshotId, snap.GameDate, "snapshot"), "EUR; kullanıcının ayıracağı tutar ayrı bir tercihtir."),
                ["weeklyWageHeadroom"] = Val(Number(Cell(finance, "wageHeadroom")), Origin(map.CareerFinance), "EUR / hafta; sezonluk maaş bütçesi kullanılmaz."),
                ["buildUpPlay"] = Val(Int(Cell(team, "buildUpPlay")), Origin(map.Team), "Aktif kullanıcı taktiğini yansıttığı doğrulanmadı.", true),
                ["defensiveDepth"] = Val(Int(Cell(team, "defensiveDepth")), Origin(map.Team), "Aktif kullanıcı taktiğini yansıttığı doğrulanmadı.", true)
            };
            var slots = players.Select(p => p.Slot).OfType<string>().ToArray();
            var suggested = slots.Length == 11 ? cfg.Formations.FirstOrDefault(f => f.Value.Order().SequenceEqual(slots.Order())).Key : null;
            var coverage = new List<AnalysisCoverage>();
            void Cover(string key, string label, int known, int total, Dictionary<string, string> section, string? note = null) =>
                coverage.Add(new(key, label, known, total, total == 0 || known == 0 ? "missing" : known == total ? "known" : "partial", known > 0 ? Origin(section) : null, note));
            Cover("roster", "Kadro bağlantıları", players.Length, players.Length, map.SquadLink, "Oyuncu yerleri kayıttaki ham ilk 11 yerleridir; yerleştirme analizi yapılmadı.");
            Cover("overall", "Genel reyting", players.Count(p => p.Overall is not null), players.Length, map.Player);
            Cover("potential", "Potansiyel", players.Count(p => p.Potential is not null), players.Length, map.Player);
            Cover("age", "Yaş", players.Count(p => p.Age is not null), players.Length, map.Player);
            Cover("positions", "Kayıtlı mevkiler", players.Count(p => p.Positions.Length > 0), players.Length, map.Player);
            Cover("attributes", "Oyuncu özellikleri", players.Sum(p => p.Attributes.Values.Count(v => v is not null)), players.Length * attributeKeys.Length, map.Player);
            Cover("roles", "Rol alanları", ids.Sum(id => roleKeys.Count(k => Cell(core.GetValueOrDefault(id), k) is not null)), players.Length * roleKeys.Length, map.Player, "Sıfır rol kodu, okunmuş ama yatkınlık işareti olmayan alandır; atanan görev değildir.");
            Cover("playStyles", "PlayStyle alanları", ids.Sum(id => styleKeys.Count(k => Cell(core.GetValueOrDefault(id), k) is not null)), players.Length * styleKeys.Length, map.Player);
            Cover("wages", "Haftalık maaş", players.Count(p => p.WeeklyWage is not null), players.Length, map.Contract, "Mevcut ücret, yeni transferin maaş talebi değildir.");
            Cover("contracts", "Sözleşme bitişi", players.Count(p => p.ContractEnd is not null), players.Length, map.Contract);
            Cover("fitness", "Kondisyon", players.Count(p => p.Fitness is not null), players.Length, map.CareerFitness, "Satır yoksa 100 kondisyon veya sağlıklı kabul edilmez.");
            Cover("loans", "Kiralık kayıtları", players.Count(p => p.Loan.Value is not null), players.Length, map.Loan, "Kapsam ve güncellik doğrulanmalı; olmayan satırlar kiralık değildir anlamına gelmez.");
            var leagues = Read(map.League, ["id", "name"]).Where(r => Int(Cell(r, "id")) is not null)
                .Select(r => new AnalysisLeague(Int(Cell(r, "id"))!.Value, Convert.ToString(Cell(r, "name")) ?? "?" )).DistinctBy(l => l.Id).OrderBy(l => l.Name).ToArray();
            var roles = map.Roles.Where(r => int.TryParse(r.Key, out _) && r.Value.Position != "CF")
                .Select(r => new AnalysisRole(int.Parse(r.Key), r.Value.Name, r.Value.Position ?? "")).Where(r => r.Position.Length > 0).ToArray();
            logger.LogInformation("Squad context {Scope} snapshot {Snapshot} revision {Revision} source {Source} rules {Config} players {Players} incomplete {Incomplete} elapsedMs {Elapsed}",
                snap.CareerKey, snap.SnapshotId, snap.Revision, snap.Source, configVersion, players.Length, coverage.Count(c => c.State != "known"), timer.ElapsedMilliseconds);
            return new(snap, (snap.CareerKey ?? snap.SaveUid) + (review ? "#team" + reviewTeamId : ""), snap.Source == "save" ? "saved" : "preview", configVersion,
                suggested, players, inputs, coverage, cfg, roles, leagues,
                review ? null : ClubService.Objectives(con, schema, snap.SnapshotId, _ => null)?.FirstOrDefault(o => o.Kind == 0), LeagueClubs(con, schema, map, snap));
        }
        finally { con.Execute("ROLLBACK;"); }
    }

    public AnalysisProfileView Get(string? saveUid)
    {
        var context = Context(saveUid);
        using var con = appDb.Open();
        var row = con.QuerySingleOrDefault<ProfileRow>("SELECT profile_json,version,updated_at,snapshot_id,snapshot_revision,config_version FROM manager_profiles WHERE career_key=@key AND view_mode=@mode",
            new { key = context.ScopeKey, mode = context.ViewMode });
        return new(context, row is null ? new() { Formation = context.SuggestedFormation } : JsonSerializer.Deserialize<ManagerProfile>(row.ProfileJson, Json)!,
            row?.Version ?? 0, row?.UpdatedAt, row?.SnapshotId, row?.SnapshotRevision, row?.ConfigVersion);
    }

    public AnalysisProfileView Save(string? saveUid, SaveManagerProfile body)
    {
        var ctx = Context(saveUid);
        if (ctx.Snapshot.SnapshotId != body.SnapshotId || ctx.Snapshot.Revision != body.SnapshotRevision || ctx.ConfigVersion != body.ConfigVersion)
            throw new AnalysisConflictException("Kariyer verisi veya profil seçenekleri değişti. Güncel veriyi yükleyip tekrar kaydet.");
        Validate(body.Profile, ctx);
        using var con = appDb.Open();
        var args = new { key = ctx.ScopeKey, mode = ctx.ViewMode, json = JsonSerializer.Serialize(body.Profile, Json),
            at = DateTimeOffset.UtcNow.ToString("O"), snap = ctx.Snapshot.SnapshotId, rev = ctx.Snapshot.Revision, cfg = ctx.ConfigVersion, expected = body.ExpectedVersion };
        var changed = body.ExpectedVersion == 0
            ? con.Execute("INSERT OR IGNORE INTO manager_profiles VALUES (@key,@mode,@json,1,@at,@snap,@rev,@cfg)", args)
            : con.Execute("UPDATE manager_profiles SET profile_json=@json,version=version+1,updated_at=@at,snapshot_id=@snap,snapshot_revision=@rev,config_version=@cfg WHERE career_key=@key AND view_mode=@mode AND version=@expected", args);
        if (changed != 1) throw new AnalysisConflictException("Profil başka bir pencerede değiştirildi. Güncel profili yükle.");
        logger.LogInformation("Manager profile saved {Scope} {Mode} version {Version} snapshot {Snapshot} revision {Revision}", ctx.ScopeKey, ctx.ViewMode, body.ExpectedVersion + 1, body.SnapshotId, body.SnapshotRevision);
        // Return precisely the saved input context, not a newly selected snapshot that could advance during the write.
        return new(ctx, body.Profile, body.ExpectedVersion + 1, args.at, args.snap, args.rev, args.cfg);
    }

    public DepthReport Run(string? saveUid, SaveManagerProfile body)
    {
        var timer = Stopwatch.StartNew();
        var view = Get(saveUid); var ctx = view.Context;
        if (ctx.Snapshot.SnapshotId != body.SnapshotId || ctx.Snapshot.Revision != body.SnapshotRevision ||
            ctx.ConfigVersion != body.ConfigVersion || view.Version != body.ExpectedVersion)
            throw new AnalysisConflictException("Analiz için kullanılan kariyer veya profil değişti. Güncel profili yükle.");
        Validate(body.Profile, ctx);
        var (formations, warnings) = DepthAnalysis.Compute(ctx, body.Profile);
        string Hash(string value) => Convert.ToHexString(SHA256.HashData(Encoding.UTF8.GetBytes(value)));
        var profileJson = JsonSerializer.Serialize(body.Profile, Json);
        var hash = Hash(profileJson);
        var id = Hash(JsonSerializer.Serialize(new { ctx.ScopeKey, ctx.ViewMode, ctx.Snapshot.SnapshotId,
            ctx.Snapshot.Revision, ctx.ConfigVersion, profileHash = hash, engine = "depth-2" }, Json));
        var at = DateTimeOffset.UtcNow.ToString("O");
        var report = new DepthReport(id, at, ctx.Snapshot, ctx.ScopeKey, ctx.ViewMode, ctx.ConfigVersion,
            ctx.Catalog.Depth.Version, hash, body.Profile, profileJson != JsonSerializer.Serialize(view.Profile, Json), formations, warnings, body.ExpectedVersion);
        var fresh = Context(saveUid);
        if (fresh.Snapshot.SnapshotId != ctx.Snapshot.SnapshotId || fresh.Snapshot.Revision != ctx.Snapshot.Revision || fresh.ConfigVersion != ctx.ConfigVersion)
            throw new AnalysisConflictException("Analiz sırasında kariyer verisi değişti. Güncel profili yükle.");
        using var con = appDb.Open();
        using var tx = con.BeginTransaction();
        var version = con.QuerySingleOrDefault<long?>("SELECT version FROM manager_profiles WHERE career_key=@key AND view_mode=@mode",
            new { key = ctx.ScopeKey, mode = ctx.ViewMode }, tx) ?? 0;
        if (version != body.ExpectedVersion) throw new AnalysisConflictException("Analiz sırasında profil başka bir pencerede değişti. Güncel profili yükle.");
        con.Execute("""
            INSERT INTO analysis_runs VALUES (@id,@key,@mode,@snap,@rev,@cfg,@hash,@at,@input,@report)
            ON CONFLICT(id) DO UPDATE SET created_at=excluded.created_at,input_json=excluded.input_json,report_json=excluded.report_json
            """, new { id, key = ctx.ScopeKey, mode = ctx.ViewMode, snap = ctx.Snapshot.SnapshotId, rev = ctx.Snapshot.Revision,
                cfg = ctx.ConfigVersion, hash, at, input = JsonSerializer.Serialize(new { context = ctx, profile = body.Profile }, Json),
                report = JsonSerializer.Serialize(report, Json) }, tx);
        tx.Commit();
        logger.LogInformation("Squad depth {Report} scope {Scope} mode {Mode} snapshot {Snapshot} revision {Revision} rules {Rules} profile {Profile} players {Players} needs {Needs} elapsedMs {Elapsed}",
            id, ctx.ScopeKey, ctx.ViewMode, ctx.Snapshot.SnapshotId, ctx.Snapshot.Revision, ctx.ConfigVersion, hash, ctx.Players.Count,
            formations.Sum(f => f.Slots.Count(s => s.Priority != "sufficient")), timer.ElapsedMilliseconds);
        return report;
    }

    static void Validate(ManagerProfile p, AnalysisContext ctx)
    {
        void Require([DoesNotReturnIf(false)] bool ok, string message) { if (!ok) throw new BadRequestException(message); }
        Require(p is not null, "Profil gerekli.");
        Require(p.Formation is not null && ctx.Catalog.Formations.ContainsKey(p.Formation), "Ana dizilişi seç.");
        Require(p.SecondaryFormation is null || ctx.Catalog.Formations.ContainsKey(p.SecondaryFormation) && p.SecondaryFormation != p.Formation, "Alternatif diziliş farklı ve geçerli olmalı.");
        Require(p.Attack is { Length: > 0 and <= 5 } && p.Attack.Distinct().Count() == p.Attack.Length && p.Attack.All(a => ctx.Catalog.Choices["attack"].ContainsKey(a)), "Hücum tercihini kontrol et.");
        foreach (var (key, value) in new[] { ("defense", p.Defense), ("tempo", p.Tempo), ("horizon", p.Horizon), ("matchMode", p.MatchMode) })
            Require(value is not null && ctx.Catalog.Choices[key].ContainsKey(value), "Geçersiz profil tercihi: " + key);
        Require(p.DefensiveLine is null or >= 0 and <= 100, "Savunma çizgisi 0–100 arasında olmalı.");
        Require(p.TransferBudget is null or >= 0 and <= 1_000_000_000_000 && p.WeeklyWageBudget is null or >= 0 and <= 1_000_000_000, "Ayrılan bütçe negatif veya sınır dışında olamaz.");
        Require(p.ReservePercent is >= 0 and <= 90 && p.TargetTransfers is >= 0 and <= 11, "Güvenlik payı veya transfer sayısı geçersiz.");
        Require(p.MinAge is null or >= 14 and <= 60 && p.MaxAge is null or >= 14 and <= 60 && !(p.MinAge > p.MaxAge), "Yaş aralığını kontrol et.");
        Require(p.PreferredLeagueIds is { Length: <= 20 } && p.PreferredLeagueIds.All(id => ctx.Leagues.Any(l => l.Id == id)), "Lig tercihini kontrol et.");
        Require(p.ProtectedPlayerIds is { Length: <= 100 } && p.DeparturePlayerIds is { Length: <= 100 } &&
            p.ProtectedPlayerIds.Concat(p.DeparturePlayerIds).All(id => ctx.Players.Any(x => x.Id == id)) && !p.ProtectedPlayerIds.Intersect(p.DeparturePlayerIds).Any(), "Oyuncu tercihlerini kontrol et; aynı oyuncu iki listede olamaz.");
        Require(p.RolePreferences is not null && p.RolePreferences.Count <= 2, "Rol tercihleri geçersiz.");
        Require(p.PlayerPreferences is not null && p.PlayerPreferences.Count <= 14 && p.PlayerPreferences.All(x =>
            ctx.Catalog.PlayerPreferenceChoices.TryGetValue(x.Key, out var choices) && choices.ContainsKey(x.Value)), "Oyuncu tarzı tercihlerini kontrol et.");
        foreach (var (formation, slots) in p.RolePreferences)
        {
            Require(formation == p.Formation || formation == p.SecondaryFormation, "Rol tercihi seçili dizilişe ait olmalı.");
            Require(slots is not null && slots.Count <= 11 && ctx.Catalog.Formations.TryGetValue(formation, out _), "Rol yerleri geçersiz.");
            foreach (var (slot, code) in slots)
                Require(ctx.Catalog.Formations[formation].Contains(slot) && ctx.Roles.Any(r => r.Id == code && r.Position == ctx.Catalog.Position(slot)), "Rol seçilen mevkiye uygun değil: " + slot);
        }
    }
}
