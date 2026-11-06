using System.Globalization;
using System.Collections.Concurrent;
using FcMarket.Api.Analysis;
using FcMarket.Api.Data;
using FcMarket.Api.Domain;
using FcMarket.Api.FieldMaps;
using Microsoft.Data.Sqlite;

namespace FcMarket.Api.Market;

/// <summary>
/// Save'in en son snapshot'ını belleğe alır ve sorguları oradan cevaplar. Importer yeni snapshot eklerse
/// bir sonraki istekte otomatik olarak yenisi yüklenir (snapshots tablosu her istekte kontrol edilir, ucuz).
/// </summary>
public sealed class MarketService(CareerDb db, FieldMapProvider fieldMaps, MarketLoader loader, MarketOptions options,
    ReloadingJsonFile<PositionRatingConfig> positionRatings, FaceStore faces, ILogger<MarketService> logger)
{
    private const int MaxCachedSnapshots = 4;
    private readonly ConcurrentDictionary<string, Lazy<MarketData>> _cache = new();

    public MarketOptions Options => options;

    public MarketData Get(string? saveUid)
    {
        using var con = db.Open();
        var map = fieldMaps.Current;
        var latest = db.LatestSnapshot(con, saveUid);
        var key = $"{latest.SnapshotId}|{latest.Revision}|{fieldMaps.Version}";

        var lazy = _cache.GetOrAdd(key, _ => new Lazy<MarketData>(() => Build(map, latest),
            LazyThreadSafetyMode.ExecutionAndPublication));
        try
        {
            return lazy.Value;
        }
        catch
        {
            _cache.TryRemove(key, out _); // hatayı cache'leme, sonraki istek yeniden denesin
            throw;
        }
    }

    private MarketData Build(FieldMap map, SnapshotRow tip)
    {
        var sw = System.Diagnostics.Stopwatch.StartNew();
        using var con = db.Open();
        var snaps = db.Lineage(con, tip.SaveUid, tip.Branch, tip.SnapshotId);
        MarketData data;
        try
        {
            data = loader.Load(con, map, snaps);
        }
        catch (SqliteException ex)
        {
            throw new DataUnavailableException($"Snapshot okunamadı: {ex.Message}", ex);
        }
        logger.LogInformation("Piyasa yüklendi: {Snapshot} ({Count} oyuncu, {Ms} ms)",
            data.Snapshot.SnapshotId, data.Players.Count, sw.ElapsedMilliseconds);
        foreach (var w in data.Schema.Warnings) logger.LogWarning("field-map: {Warning}", w);
        _ = Task.Run(() =>
        {
            try { MarketQuery.Warm(data); }
            catch (Exception ex) { logger.LogDebug("Sıralama ön hazırlığı atlandı: {Message}", ex.Message); }
        });

        while (_cache.Count > MaxCachedSnapshots)
        {
            var oldest = _cache.Where(kv => kv.Value.IsValueCreated)
                .OrderBy(kv => kv.Value.Value.LoadedAt).Select(kv => kv.Key).FirstOrDefault();
            if (oldest is null) break;
            _cache.TryRemove(oldest, out _);
        }
        return data;
    }

    public PagedPlayers Players(PlayerQuery q) =>
        MarketQuery.Run(Get(q.SaveUid), q, options.DefaultPageSize, options.MaxPageSize);

    public FilterOptions FilterOptions(string? saveUid)
    {
        var data = Get(saveUid);
        var map = data.Schema.Map;
        var ps = data.Players;

        var groupOrder = map.PositionGroups.Keys.ToList();
        var positions = ps.SelectMany(p => p.Positions).GroupBy(p => p)
            .Select(g => new PositionOption(g.Key, map.PositionGroupOf(g.Key), g.Count()))
            .OrderBy(p => p.Group is null ? int.MaxValue : groupOrder.IndexOf(p.Group))
            .ThenBy(p => map.Positions.Values.ToList().IndexOf(p.Label))
            .ToList();

        return new FilterOptions(
            data.Snapshot,
            Leagues: ps.Where(p => p.LeagueId is not null)
                .GroupBy(p => p.LeagueId!.Value)
                .Select(g => new IdOption(g.Key, g.First().League ?? $"Lig {g.Key}", g.Count()))
                .OrderBy(o => o.Name).ToList(),
            Clubs: ps.Where(p => p.ClubId is not null)
                .GroupBy(p => p.ClubId!.Value)
                .Select(g => new ClubOption(g.Key, g.First().Club ?? $"Takım {g.Key}", g.First().LeagueId, g.Count()))
                .OrderBy(o => o.Name).ToList(),
            Nations: ps.Where(p => p.NationId is not null)
                .GroupBy(p => p.NationId!.Value)
                .Select(g => new IdOption(g.Key, g.First().Nation ?? $"Ülke {g.Key}", g.Count()))
                .OrderBy(o => o.Name).ToList(),
            Positions: positions,
            PositionGroups: map.PositionGroups.Select(g => new PositionGroupOption(g.Key, g.Value)).ToList(),
            Feet: ps.Where(p => p.Foot is not null)
                .GroupBy(p => p.Foot!)
                .Select(g => new FootOption(g.First().FootCode, g.Key, g.Count()))
                .OrderBy(o => o.Code).ToList(),
            Ranges: new Ranges(
                Range(ps.Select(p => p.Age)), Range(ps.Select(p => p.Overall)), Range(ps.Select(p => p.Potential)),
                Range(ps.Select(p => p.ContractEnd)),
                ps.Max(p => p.Value)),
            Roles: ps.SelectMany(p => p.RoleCodes.Select(c => c % 100).Distinct()).GroupBy(c => c)
                .Select(g => new IdOption(g.Key, map.Roles.GetValueOrDefault(g.Key.ToString(CultureInfo.InvariantCulture)) is { } role
                    ? $"{role.Name} · {role.Position}" : $"Rol #{g.Key}", g.Count())).OrderBy(o => o.Name).ToList(),
            PlayStyles: StyleOptions(ps, map, false), PlayStylesPlus: StyleOptions(ps, map, true));
    }

    private static IReadOnlyList<IdOption> StyleOptions(IReadOnlyList<MarketPlayer> players, FieldMap map, bool plus) =>
        players.SelectMany(p => (plus ? p.PlayStylePlusIds : p.PlayStyleIds.Concat(p.PlayStylePlusIds)).Distinct())
            .GroupBy(b => b).Select(g => new IdOption(g.Key,
                map.PlayStyles[g.Key.ToString(CultureInfo.InvariantCulture)] + (plus ? "+" : ""),
                g.Count())).OrderBy(o => o.Name).ToList();

    private static int[]? Range(IEnumerable<int?> values)
    {
        var v = values.Where(x => x is not null).Select(x => x!.Value).ToList();
        return v.Count == 0 ? null : [v.Min(), v.Max()];
    }

    public PlayerDetail Detail(int id, string? saveUid)
    {
        var data = Get(saveUid);
        var p = data.Find(id) ?? throw new NotFoundException($"Oyuncu bulunamadı: {id}");
        var s = data.Schema;
        var map = s.Map;
        using var con = db.Open();

        // Özellikler: sadece bu oyuncu için tek satır.
        var ratingCfg = positionRatings.Current;
        var attrValues = Attributes(con, data, [id]).GetValueOrDefault(id) ?? new Dictionary<string, int?>();

        var isGk = p.PositionGroup == "GK"; // kanonik grup anahtarı (field-map positionGroups)
        List<AttributeGroup> Grouped(IEnumerable<KeyValuePair<string, List<string>>> source) => source
            .Select(g =>
            {
                var attrs = g.Value.Select(a => new AttributeValue(a, map.AttributeLabels.GetValueOrDefault(a) ?? a,
                    attrValues.GetValueOrDefault(a))).ToList();
                var known = attrs.Where(a => a.Value is not null).Select(a => a.Value!.Value).ToList();
                return new AttributeGroup(g.Key, known.Count > 0 ? (int)Math.Round(known.Average()) : null, attrs);
            }).ToList();
        var groups = Grouped(map.AttributeGroups.Where(g => isGk || g.Key != map.GoalkeeperGroup));
        var categories = Grouped(map.AttributeCategories);

        return new PlayerDetail(data.Snapshot, p, p.ValueBreakdown, p.OpportunityBreakdown, groups,
            PositionRatings.Compute(ratingCfg, attrValues, p.Position, p.Overall),
            faces.Find(id) is not null,
            new ContractInfo(p.Wage, p.ContractEnd, p.ContractYearsLeft), LoadStats(con, s, data, id),
            categories, LoadProfile(con, s, data.Snapshot.SnapshotId, id, data.Snapshot.GameDate),
            LoadSeasonReference(con, data, id), LoadMatchRatings(con, data, id));
    }

    /// <summary>Optional save tables, always scoped to the selected snapshot. Unknown award enums stay codes.</summary>
    public static CareerRecords LoadCareerRecords(SqliteConnection con, MarketData data)
    {
        var map = data.Schema.Map;
        string Name(int id) => data.Find(id)?.Name ?? $"#{id}";
        var week = CareerRows(con, data, map.TeamOfWeek, ["playerId", "rating", "weeks", "month"])
            .Where(r => MarketLoader.Int(r[0]) is > 0)
            .Select(r => new WeeklyPlayer(MarketLoader.Int(r[0])!.Value, Name(MarketLoader.Int(r[0])!.Value),
                MarketLoader.Int(r[1]), MarketLoader.Int(r[2]), MarketLoader.Int(r[3]))).ToList();
        var awards = CareerRows(con, data, map.PlayerAward, ["playerId", "teamId", "type", "season", "count"])
            .Where(r => MarketLoader.Int(r[0]) is > 0)
            .Select(r => new PlayerAward(MarketLoader.Int(r[0])!.Value, Name(MarketLoader.Int(r[0])!.Value),
                MarketLoader.Int(r[1]), MarketLoader.Int(r[2]), MarketLoader.Int(r[3]), MarketLoader.Int(r[4])))
            .OrderByDescending(r => r.Season).ThenBy(r => r.Type).ToList();
        var managers = CareerRows(con, data, map.ManagerAward, ["teamId", "type", "season", "count", "date"])
            .Select(r => new ManagerAward(MarketLoader.Int(r[0]), MarketLoader.Int(r[1]), MarketLoader.Int(r[2]),
                MarketLoader.Int(r[3]), SafeDay(map.Epoch, MarketLoader.Int(r[4]))))
            .OrderByDescending(r => r.Date).ToList();
        return new CareerRecords(data.Schema.HasTable(map.TeamOfWeek), data.Schema.HasTable(map.PlayerAward),
            data.Schema.HasTable(map.ManagerAward), week, awards, managers);
    }

    private static DateOnly? SafeDay(DateOnly epoch, int? days) =>
        days is > 0 && days <= DateOnly.MaxValue.DayNumber - epoch.DayNumber ? epoch.AddDays(days.Value) : null;

    private static List<object?[]> CareerRows(SqliteConnection con, MarketData data, Dictionary<string, string> section,
        string[] fields, int? playerId = null)
    {
        var s = data.Schema;
        if (!s.HasTable(section)) return [];
        if (playerId is not null && s.Column(section, "playerId") is null) return [];
        using var cmd = con.CreateCommand();
        cmd.CommandText = $"SELECT {string.Join(",", fields.Select(f => s.Select(section, f)))} FROM {s.Table(section)} WHERE snapshot_id=$snap"
            + (playerId is not null ? $" AND {s.Column(section, "playerId")}=$player" : "");
        cmd.Parameters.AddWithValue("$snap", data.Snapshot.SnapshotId);
        if (playerId is { } id) cmd.Parameters.AddWithValue("$player", id);
        using var reader = cmd.ExecuteReader();
        var rows = new List<object?[]>();
        while (reader.Read()) rows.Add(Enumerable.Range(0, fields.Length).Select(i => reader.IsDBNull(i) ? null : reader.GetValue(i)).ToArray());
        return rows;
    }

    private static SeasonReference? LoadSeasonReference(SqliteConnection con, MarketData data, int id)
    {
        var map = data.Schema.Map;
        var row = CareerRows(con, data, map.SeasonGrowth, ["overall"], id).FirstOrDefault();
        if (row is null) return null;
        // The table has no date. Do not fabricate a July 1 historical observation.
        return new SeasonReference(MarketLoader.Int(row[0]), data.Find(id)?.Overall);
    }

    private static List<MatchRating> LoadMatchRatings(SqliteConnection con, MarketData data, int id) =>
        CareerRows(con, data, data.Schema.Map.MatchRating, ["date", "minutes", "rating"], id)
            .Select(r => new MatchRating(DateOnly.TryParseExact(MarketLoader.Int(r[0])?.ToString(CultureInfo.InvariantCulture),
                    "yyyyMMdd", CultureInfo.InvariantCulture, DateTimeStyles.None, out var day) ? day : null,
                MarketLoader.Int(r[1]), MarketLoader.Int(r[2])))
            .Where(r => r.Date is not null && r.Date <= data.Snapshot.GameDate)
            .OrderByDescending(r => r.Date).ToList();

    /// <summary>
    /// Oyuncuların özellikleri (field-map attributeGroups + pozisyon ağırlıklarındaki alanlar): oyuncu -> özellik -> değer.
    /// Tablo/kolon yoksa eksik değerler null.
    /// </summary>
    public Dictionary<int, Dictionary<string, int?>> Attributes(SqliteConnection con, MarketData data, IReadOnlyCollection<int> ids)
    {
        var s = data.Schema;
        var map = s.Map;
        var result = new Dictionary<int, Dictionary<string, int?>>();
        var present = map.AllAttributes()
            .Concat(positionRatings.Current.Positions.Values.SelectMany(w => w.Keys))
            .Distinct()
            .Select(a => (Attr: a, Col: s.RawColumn(map.Player, a)))
            .Where(a => a.Col is not null).ToList();
        if (ids.Count == 0 || present.Count == 0 || s.Column(map.Player, "id") is not { } idCol) return result;

        using var cmd = con.CreateCommand();
        var marks = string.Join(", ", ids.Select((_, i) => $"$id{i}"));
        cmd.CommandText = $"SELECT {idCol}, {string.Join(", ", present.Select(a => a.Col))} FROM {s.Table(map.Player)} " +
                          $"WHERE snapshot_id = $snap AND {idCol} IN ({marks})";
        cmd.Parameters.AddWithValue("$snap", data.Snapshot.SnapshotId);
        var n = 0;
        foreach (var id in ids) cmd.Parameters.AddWithValue($"$id{n++}", id);
        using var r = cmd.ExecuteReader();
        while (r.Read())
        {
            if (MarketLoader.Int(r.IsDBNull(0) ? null : r.GetValue(0)) is not { } pid || result.ContainsKey(pid)) continue;
            var values = new Dictionary<string, int?>();
            for (var i = 0; i < present.Count; i++)
                values[present[i].Attr] = MarketLoader.Int(r.IsDBNull(i + 1) ? null : r.GetValue(i + 1));
            result[pid] = values;
        }
        return result;
    }

    /// <summary>Oyuncu kartı bilgileri: serbest kalma bedeli, kulübe katılış, uluslararası ün, forma no.</summary>
    private static PlayerProfile LoadProfile(SqliteConnection con, ResolvedSchema s, string snap, int id, DateOnly? today = null)
    {
        var map = s.Map;
        object?[]? row = null;
        if (s.Column(map.Player, "id") is { } idCol)
        {
            string[] f = ["releaseClause", "joinDate", "internationalRep", "role1", "role2", "role3", "role4", "role5", "role6",
                "role7", "role8", "role9", "playStyles1", "playStyles2", "playStylesPlus1", "playStylesPlus2",
                "bodyType", "emotion", "growthProfile", "isRetiring", "height", "agility", "strength", "acceleration", "sprintSpeed",
                "bootType", "bootDesign", "bootColor1", "bootColor2", "gloveType"];
            using var cmd = con.CreateCommand();
            cmd.CommandText = $"SELECT {string.Join(", ", f.Select(x => s.Select(map.Player, x)))} FROM {s.Table(map.Player)} " +
                              $"WHERE snapshot_id = $snap AND {idCol} = $id LIMIT 1";
            cmd.Parameters.AddWithValue("$snap", snap);
            cmd.Parameters.AddWithValue("$id", id);
            using var r = cmd.ExecuteReader();
            if (r.Read()) row = Enumerable.Range(0, f.Length).Select(i => r.IsDBNull(i) ? null : r.GetValue(i)).ToArray();
        }
        int? jersey = null;
        var link = map.SquadLink;
        if (s.HasTable(link) && s.Column(link, "playerId") is { } pid && s.Column(link, "jersey") is { } jcol)
        {
            using var cmd = con.CreateCommand();
            cmd.CommandText = $"SELECT {jcol} FROM {s.Table(link)} WHERE snapshot_id = $snap AND {pid} = $id LIMIT 1";
            cmd.Parameters.AddWithValue("$snap", snap);
            cmd.Parameters.AddWithValue("$id", id);
            jersey = MarketLoader.Int(cmd.ExecuteScalar());
        }
        var joined = MarketLoader.Int(row?[1]) is { } days && days > 0 ? map.Epoch.AddDays(days) : (DateOnly?)null;
        var clause = MarketLoader.Long(row?[0]);
        var roles = new List<PlayerRole>();
        for (var i = 3; i < 12; i++)
            if (MarketLoader.Int(row?[i]) is { } code && code > 0)
            {
                var label = map.Roles.GetValueOrDefault((code % 100).ToString(CultureInfo.InvariantCulture));
                roles.Add(new PlayerRole(code, label?.Name ?? $"Rol #{code % 100}", label?.Position, code >= 100 ? 2 : 1));
            }
        var categories = new Dictionary<string, string>();
        string StyleName(int b) => map.PlayStyles[b.ToString(CultureInfo.InvariantCulture)];
        List<string> Styles(object? low, object? high)
        {
            var names = new List<string>();
            foreach (var b in PlayerAbilities.KnownStyleBits(map, low, high))
            {
                names.Add(StyleName(b));
                if (map.PlayStyleCategories.FirstOrDefault(c => c.Value.Contains(b)).Key is { } cat) categories[StyleName(b)] = cat;
            }
            return names;
        }
        string? Label(Dictionary<string, string> labels, object? v, string unknown) =>
            MarketLoader.Int(v) is { } code ? labels.GetValueOrDefault(code.ToString(CultureInfo.InvariantCulture)) ?? $"{unknown} {code}" : null;
        var traits = map.PlayerTraits;
        var body = MarketLoader.Int(row?[16]) is >= 10 ? traits.UniqueBodyType : Label(traits.BodyTypes, row?[16], "Tip");
        var accel = map.AccelerationType.Classify(MarketLoader.Int(row?[20]), MarketLoader.Int(row?[21]), MarketLoader.Int(row?[22]),
            MarketLoader.Int(row?[23]), MarketLoader.Int(row?[24]));
        var styles = Styles(row?[12], row?[13]);
        var plus = Styles(row?[14], row?[15]);
        var lastTransfer = today is { } td ? TransferEvidenceReader.Read(con, s, snap, td, includeFree: true).GetValueOrDefault(id) : null;
        return new PlayerProfile(clause is > 0 ? clause : null, joined, MarketLoader.Int(row?[2]), jersey, roles,
            styles, plus,
            accel, body, Label(traits.Emotions, row?[17], "Kod"), Label(traits.GrowthProfiles, row?[18], "Profil"),
            MarketLoader.Int(row?[19]) is { } ret ? ret != 0 : null, categories,
            new PlayerEquipment(MarketLoader.Int(row?[25]), MarketLoader.Int(row?[26]), MarketLoader.Int(row?[27]),
                MarketLoader.Int(row?[28]), MarketLoader.Int(row?[29])), lastTransfer);
    }

    private static SeasonStats? LoadStats(SqliteConnection con, ResolvedSchema s, MarketData data, int id)
    {
        var snap = data.Snapshot.SnapshotId;
        if (LoadSaveStats(con, s, data, id) is { } saved) return saved;
        var st = s.Map.Stats;
        if (!s.HasTable(st) || s.Column(st, "playerId") is not { } pid) return null;
        string[] f = ["competitionId", "appearances", "goals", "assists", "ratingSum", "yellow", "red", "cleanSheets", "motm"];
        using var cmd = con.CreateCommand();
        cmd.CommandText = $"SELECT {string.Join(", ", f.Select(x => s.Select(st, x)))} FROM {s.Table(st)} " +
                          $"WHERE snapshot_id = $snap AND {pid} = $id";
        cmd.Parameters.AddWithValue("$snap", snap);
        cmd.Parameters.AddWithValue("$id", id);
        using var r = cmd.ExecuteReader();
        var rows = new List<StatLine>();
        while (r.Read())
        {
            object? V(int i) => r.IsDBNull(i) ? null : r.GetValue(i);
            rows.Add(StatLine.Create(MarketLoader.Int(V(0)), MarketLoader.Int(V(1)), MarketLoader.Int(V(2)),
                MarketLoader.Int(V(3)), MarketLoader.Double(V(4)), MarketLoader.Int(V(5)), MarketLoader.Int(V(6)),
                MarketLoader.Int(V(7)), MarketLoader.Int(V(8))));
        }
        // Kaynak tabloda satır olup istatistik kolonları yoksa (ör. örnek verinin teamplayerlinks'i) panel boş kalsın.
        if (rows.All(x => x.Appearances is null && x.Goals is null && x.Assists is null && x.RatingSum is null
                          && x.Yellow is null && x.Red is null && x.CleanSheets is null && x.Motm is null)) return null;
        // Lig yarışmalarının adı oyuncu verisindeki lig adlarından; kupalar için ad tablosu export'ta yok.
        var leagueNames = data.Players.Where(x => x.LeagueId is not null && x.League is not null)
            .GroupBy(x => x.LeagueId!.Value).ToDictionary(g => g.Key, g => g.First().League!);
        rows = rows.Select(x => x with { Competition = x.CompetitionId is { } c ? leagueNames.GetValueOrDefault(c) : null }).ToList();
        static int? Sum(IEnumerable<int?> xs) => xs.Any(x => x is not null) ? xs.Sum(x => x ?? 0) : null;
        var ratingSum = rows.Any(x => x.RatingSum is not null) ? rows.Sum(x => x.RatingSum ?? 0) : (double?)null;
        var total = StatLine.Create(null, Sum(rows.Select(x => x.Appearances)), Sum(rows.Select(x => x.Goals)),
            Sum(rows.Select(x => x.Assists)), ratingSum, Sum(rows.Select(x => x.Yellow)), Sum(rows.Select(x => x.Red)),
            Sum(rows.Select(x => x.CleanSheets)), Sum(rows.Select(x => x.Motm)));
        return new SeasonStats(total, rows);
    }

    /// <summary>Kariyer kaydındaki bu sezonun oyuncu istatistikleri (yarışma başına); kayıt yoksa null.</summary>
    private const int RecentMatchLimit = 5;

    private static SeasonStats? LoadSaveStats(SqliteConnection con, ResolvedSchema s, MarketData data, int id)
    {
        var rows = CareerBlocks.StatRows(con, s, data.Snapshot.SnapshotId, ["competitionId", "appearances", "goals", "assists", "ratingTotal",
            "yellow", "red", "cleanSheets", "minutes"], "playerId", id);
        if (rows.Count == 0) return null;
        var codes = new Dictionary<int, string>();
        if (s.HasTable(s.Map.CareerCompetition))
            foreach (var kv in MarketLoader.Keyed(con, s, s.Map.CareerCompetition, CareerBlocks.SourceSnapshot(con, s, data.Snapshot.SnapshotId), "id", ["code"]))
                codes[kv.Key] = MarketLoader.Str(kv.Value[0]) ?? "";
        var leagueNames = data.Players.Where(x => x.LeagueId is not null && x.League is not null)
            .GroupBy(x => x.LeagueId!.Value).ToDictionary(g => g.Key, g => g.First().League!);
        var lines = rows.Select(r =>
        {
            int? V(int i) => MarketLoader.Int(r[i]);
            var comp = V(0);
            return StatLine.Create(comp, V(1), V(2), V(3), V(4) is { } rt ? rt / 10.0 : null, V(5), V(6), V(7), null) with
            {
                Minutes = V(8),
                Competition = comp is { } c ? CareerBlocks.CompetitionName(codes.GetValueOrDefault(c), leagueNames.GetValueOrDefault, s.Map.CompetitionLabels) : null,
            };
        }).OrderByDescending(x => x.Appearances ?? 0).ToList();
        static int? Sum(IEnumerable<int?> xs) => xs.Any(x => x is not null) ? xs.Sum(x => x ?? 0) : null;
        var total = StatLine.Create(null, Sum(lines.Select(x => x.Appearances)), Sum(lines.Select(x => x.Goals)), Sum(lines.Select(x => x.Assists)),
            lines.Any(x => x.RatingSum is not null) ? lines.Sum(x => x.RatingSum ?? 0) : null, Sum(lines.Select(x => x.Yellow)),
            Sum(lines.Select(x => x.Red)), Sum(lines.Select(x => x.CleanSheets)), null) with { Minutes = Sum(lines.Select(x => x.Minutes)) };
        var recent = CareerBlocks.RecentMatchRows(con, s, data.Snapshot.SnapshotId, ["date", "competitionId", "minutes", "rating"], id)
            .Select(r => (Date: MarketLoader.Int(r[0]) ?? 0, Competition: MarketLoader.Int(r[1]), Minutes: MarketLoader.Int(r[2]) ?? 0, Rating: MarketLoader.Int(r[3]) ?? 0))
            .OrderByDescending(r => r.Date).Take(RecentMatchLimit)
            .Select(r => new RecentMatch($"{r.Date / 10000:D4}-{r.Date / 100 % 100:D2}-{r.Date % 100:D2}",
                lines.FirstOrDefault(x => x.CompetitionId == r.Competition)?.Competition, r.Minutes, r.Rating / 10.0)).ToList();
        return new SeasonStats(total, lines, "save") { Recent = recent };
    }

    public List<HistoryPoint> History(int id, string? saveUid)
    {
        var data = Get(saveUid);
        if (data.Find(id) is null) throw new NotFoundException($"Oyuncu bulunamadı: {id}");
        var s = data.Schema;
        var map = s.Map;
        using var con = db.Open();
        var snaps = db.Lineage(con, data.Snapshot.SaveUid, data.Snapshot.Branch, data.Snapshot.SnapshotId);
        if (s.Column(map.Player, "id") is not { } idCol) return [];

        var nameJoin = s.HasTable(map.Names) && s.Column(map.Names, "playerId") is { } npid
            ? $"LEFT JOIN {s.Table(map.Names)} n ON n.snapshot_id = p.snapshot_id AND n.{npid} = p.{idCol}"
            : null;
        var club = nameJoin is null ? "NULL" : s.Select(map.Names, "clubTeamId", "n");
        var teamJoin = nameJoin is not null && s.HasTable(map.Team) && s.Column(map.Team, "id") is { } tid
                       && s.Column(map.Names, "clubTeamId") is { } nclub
            ? $"LEFT JOIN {s.Table(map.Team)} t ON t.snapshot_id = p.snapshot_id AND t.{tid} = n.{nclub}"
            : null;
        var clubName = teamJoin is null ? "NULL" : s.Select(map.Team, "name", "t");

        using var cmd = con.CreateCommand();
        cmd.CommandText =
            $"SELECT p.snapshot_id, {s.Select(map.Player, "overall", "p")}, {s.Select(map.Player, "potential", "p")}, " +
            $"{club}, {clubName} FROM {s.Table(map.Player)} p {nameJoin} {teamJoin} " +
            $"WHERE p.{idCol} = $id AND p.snapshot_id IN (SELECT snapshot_id FROM snapshots WHERE save_uid = $save)";
        cmd.Parameters.AddWithValue("$id", id);
        cmd.Parameters.AddWithValue("$save", data.Snapshot.SaveUid);
        var bySnap = new Dictionary<string, (int? Ovr, int? Pot, int? ClubId, string? Club)>();
        using (var r = cmd.ExecuteReader())
            while (r.Read())
            {
                object? V(int i) => r.IsDBNull(i) ? null : r.GetValue(i);
                bySnap.TryAdd(r.GetString(0), (MarketLoader.Int(V(1)), MarketLoader.Int(V(2)), MarketLoader.Int(V(3)), MarketLoader.Str(V(4))));
            }

        // Aynı oyun gününde birden fazla snapshot olabilir (elle + otomatik): günün en son alınanı kalır.
        var daily = CareerDb.PerGameDay(snaps.Where(s => bySnap.ContainsKey(s.SnapshotId)));

        // Günlük hafif export'ların geçmişi (tools/saveimport player_daily): kayan günlük snapshot silinse de günler kalır.
        var points = daily.Select(x => (x.SnapshotId, x.Date, bySnap[x.SnapshotId])).ToList();
        if (CareerDb.TableExists(con, "player_daily"))
        {
            var have = points.Select(x => x.Date).ToHashSet();
            var clubs = MarketLoader.Keyed(con, s, map.Team, data.Snapshot.SnapshotId, "id", ["name"]);
            using var dcmd = con.CreateCommand();
            dcmd.CommandText = "SELECT game_date, overall, potential, teamid FROM player_daily WHERE save_uid = $save AND branch IS $branch AND playerid = $id AND game_date <= $day";
            dcmd.Parameters.AddWithValue("$save", data.Snapshot.SaveUid);
            dcmd.Parameters.AddWithValue("$branch", (object?)data.Snapshot.Branch ?? DBNull.Value);
            dcmd.Parameters.AddWithValue("$id", id);
            dcmd.Parameters.AddWithValue("$day", data.Snapshot.GameDate.ToString("yyyy-MM-dd"));
            using var r = dcmd.ExecuteReader();
            while (r.Read())
                if (DateOnly.TryParse(r.GetString(0), CultureInfo.InvariantCulture, out var day) && have.Add(day))
                {
                    object? V(int i) => r.IsDBNull(i) ? null : r.GetValue(i);
                    var team = MarketLoader.Int(V(3));
                    points.Add(("daily:" + r.GetString(0), day, (MarketLoader.Int(V(1)), MarketLoader.Int(V(2)), team,
                        team is { } t ? MarketLoader.Str(clubs.GetValueOrDefault(t)?[0]) : null)));
                }
        }

        var result = new List<HistoryPoint>();
        int? lastClub = null;
        foreach (var (snapId, date, h) in points.OrderBy(x => x.Date))
        {
            var changed = result.Count > 0 && h.ClubId != lastClub;
            result.Add(new HistoryPoint(snapId, date, h.Item1, h.Item2, h.ClubId, h.Club, changed));
            lastClub = h.ClubId;
        }
        return result;
    }

    /// <summary>
    /// Save'ler, en son gözlemlenen önce. Latest aktif dalın ucudur (save'in en son export edilen dalı); Branches
    /// birden fazla oyun dalı varsa (kopya slot, eski kayda dönüş) hepsini listeler.
    /// </summary>
    public List<SaveInfo> Saves()
    {
        using var con = db.Open();
        if (!CareerDb.TableExists(con, "snapshots")) return [];
        var rows = db.Snapshots(con);
        // LE kimliği gelmeden alınmış kayıtlar (slot-...) aynı takımın kimlikli kariyeri ilerleyince listeyi kalabalıklaştırmaz.
        var identified = rows.Where(s => !s.SaveUid.StartsWith("slot-", StringComparison.Ordinal) && s.UserTeamid is not null)
            .GroupBy(s => s.UserTeamid!.Value).ToDictionary(g => g.Key, g => g.Max(s => s.GameDate)!);
        bool Superseded(IGrouping<string, SnapshotRow> g) => g.Key.StartsWith("slot-", StringComparison.Ordinal) && g.Last() is { UserTeamid: { } team } last &&
            identified.TryGetValue((int)team, out var newest) && string.CompareOrdinal(newest, g.Max(s => s.GameDate)) >= 0;
        return rows
            .GroupBy(s => s.SaveUid)
            .Where(g => !Superseded(g))
            .Select(g =>
            {
                var active = db.LatestSnapshot(con, g.Key);
                var parents = db.Branches(con, g.Key).ToDictionary(b => b.Branch);
                var slots = db.SaveSlots(con, g.Key);
                var branches = g.Where(s => s.Branch is not null).GroupBy(s => s.Branch!.Value)
                    .Select(b =>
                    {
                        var tip = b.Last();
                        var row = parents.GetValueOrDefault(b.Key);
                        return new BranchInfo(b.Key, tip.CareerKey, row?.ParentBranch, ParseDate(row?.ForkDate),
                            b.Count(), b.First().Date, tip.Date, b.Max(s => s.ExportedAt), b.First().BranchReason,
                            b.Key == active.Branch, slots.Where(x => x.Branch == b.Key)
                                .Select(x => new BranchSaveSlot(x.Title, x.SourcePath.Replace('\\', '/').Split('/').Last(), ParseDate(x.LastDate)))
                                .ToList());
                    })
                    .OrderBy(b => b.Branch).ToList();
                var lastExport = g.Max(s => s.ExportedAt);
                return (Info: new SaveInfo(g.Key, (int?)active.UserTeamid, active.UserTeamName, g.Count(), g.First().Date,
                    active.Date, loader.ToInfo(active), branches), lastExport);
            })
            .OrderByDescending(s => s.lastExport, StringComparer.Ordinal)
            .Select(s => s.Info)
            .ToList();
    }

    private static DateOnly? ParseDate(string? s) =>
        DateOnly.TryParseExact(s, "yyyy-MM-dd", System.Globalization.CultureInfo.InvariantCulture,
            System.Globalization.DateTimeStyles.None, out var d) ? d : null;

    /// <summary>Seçili kariyer dalının gördüğü snapshot'lar, yeniden eskiye.</summary>
    public List<SnapshotInfo> Snapshots(string? saveUid)
    {
        using var con = db.Open();
        var tip = db.LatestSnapshot(con, saveUid);
        return db.Lineage(con, tip.SaveUid, tip.Branch, tip.SnapshotId).Select(loader.ToInfo).Reverse().ToList();
    }

    public SyncInfo Sync(string? saveUid)
    {
        using var con = db.Open();
        var issues = db.ImportIssues(con);
        var warnings = db.ImportWarnings(con);
        if (!CareerDb.TableExists(con, "snapshots") || !db.Snapshots(con).Any())
            return new(null, null, null, issues, warnings);
        var current = db.LatestSnapshot(con, saveUid);
        var saved = db.SavedSnapshot(con, current.SaveUid);
        var pending = db.UnconfirmedExport(con, current.SaveUid);
        return new(loader.ToInfo(current), saved is null ? null : loader.ToInfo(saved),
            pending is null ? null : loader.ToInfo(pending), issues, warnings);
    }
}

public sealed record SyncInfo(SnapshotInfo? Current, SnapshotInfo? Saved, SnapshotInfo? PendingExport, List<ImportIssue> Issues,
    List<ImportIssue>? Warnings = null);

public sealed record IdOption(int Id, string Name, int Count);
public sealed record ClubOption(int Id, string Name, int? LeagueId, int Count);
public sealed record PositionOption(string Label, string? Group, int Count);
public sealed record PositionGroupOption(string Key, IReadOnlyList<string> Positions);
public sealed record FootOption(int? Code, string Label, int Count);
public sealed record Ranges(int[]? Age, int[]? Overall, int[]? Potential, int[]? ContractEnd, long? MaxValue);
public sealed record FilterOptions(
    SnapshotInfo Snapshot, IReadOnlyList<IdOption> Leagues, IReadOnlyList<ClubOption> Clubs, IReadOnlyList<IdOption> Nations,
    IReadOnlyList<PositionOption> Positions, IReadOnlyList<PositionGroupOption> PositionGroups, IReadOnlyList<FootOption> Feet,
    Ranges Ranges, IReadOnlyList<IdOption>? Roles = null, IReadOnlyList<IdOption>? PlayStyles = null,
    IReadOnlyList<IdOption>? PlayStylesPlus = null);

public sealed record AttributeValue(string Key, string Label, int? Value);
public sealed record AttributeGroup(string Name, int? Score, IReadOnlyList<AttributeValue> Attributes);
public sealed record ContractInfo(long? Wage, int? EndYear, int? YearsLeft);

public sealed record StatLine(int? CompetitionId, int? Appearances, int? Goals, int? Assists, double? RatingSum,
    double? AverageRating, int? Yellow, int? Red, int? CleanSheets, int? Motm)
{
    /// <summary>Yarışma adı (lig ise ya da competitionLabels'ta varsa); kodu yoksa null.</summary>
    public string? Competition { get; init; }
    /// <summary>Oynanan dakika (yalnız kariyer kaydından).</summary>
    public int? Minutes { get; init; }

    public static StatLine Create(int? comp, int? app, int? goals, int? assists, double? ratingSum, int? yellow, int? red,
        int? cleanSheets, int? motm) =>
        new(comp, app, goals, assists, ratingSum,
            ratingSum is { } rs && app is > 0 ? Math.Round(rs / app.Value, 2) : null,
            yellow, red, cleanSheets, motm);
}

/// <param name="Source">"save": kariyer kaydındaki bu sezon; "export": prevcompetitionstats (kariyer öncesi başlangıç verisi).</param>
public sealed record SeasonStats(StatLine Total, IReadOnlyList<StatLine> Competitions, string Source = "export")
{
    public IReadOnlyList<RecentMatch> Recent { get; init; } = [];
}

public sealed record RecentMatch(string Date, string? Competition, int Minutes, double Rating);

/// <param name="AttributeCategories">Detay ekranındaki 7 özellik başlığı (field-map attributeCategories).</param>
public sealed record PlayerDetail(
    SnapshotInfo Snapshot, MarketPlayer Player, ValueBreakdown Value, OpportunityBreakdown Opportunity,
    IReadOnlyList<AttributeGroup> AttributeGroups, IReadOnlyList<PositionRating> PositionRatings, bool HasFace,
    ContractInfo Contract, SeasonStats? Stats, IReadOnlyList<AttributeGroup> AttributeCategories, PlayerProfile Profile,
    SeasonReference? SeasonReference = null, IReadOnlyList<MatchRating>? MatchRatings = null);

public sealed record WeeklyPlayer(int PlayerId, string Name, int? Rating, int? Weeks, int? Month);
public sealed record PlayerAward(int PlayerId, string Name, int? TeamId, int? Type, int? Season, int? Count);
public sealed record ManagerAward(int? TeamId, int? Type, int? Season, int? Count, DateOnly? Date);
public sealed record CareerRecords(bool HasTeamOfWeek, bool HasPlayerAwards, bool HasManagerAwards,
    IReadOnlyList<WeeklyPlayer> TeamOfWeek, IReadOnlyList<PlayerAward> PlayerAwards, IReadOnlyList<ManagerAward> ManagerAwards);
public sealed record SeasonReference(int? Overall, int? CurrentOverall);
public sealed record MatchRating(DateOnly? Date, int? Minutes, int? Rating);

/// <param name="ReleaseClause">Serbest kalma bedeli; 0 ya da yoksa null.</param>
/// <param name="InternationalRep">Uluslararası ün (1–5 yıldız).</param>
/// <param name="Roles">Taktik roller (FC 27); Level 2 = "++".</param>
/// <param name="PlayStylesPlus">Oyun stili+ (icontrait).</param>
/// <param name="AccelerationType">Özelliklerden tahmin (field-map accelerationType).</param>
public sealed record PlayerProfile(long? ReleaseClause, DateOnly? JoinDate, int? InternationalRep, int? Jersey,
    IReadOnlyList<PlayerRole>? Roles = null, IReadOnlyList<string>? PlayStyles = null, IReadOnlyList<string>? PlayStylesPlus = null,
    string? AccelerationType = null, string? BodyType = null, string? Emotion = null, string? GrowthProfile = null, bool? Retiring = null,
    IReadOnlyDictionary<string, string>? StyleCategories = null, PlayerEquipment? Equipment = null,
    TransferEvidence? LastTransfer = null);

/// <summary>Oyundaki ekipman kodları; ürün/renk adları henüz doğrulanmadı.</summary>
public sealed record PlayerEquipment(int? BootType, int? BootDesign, int? BootColor1, int? BootColor2, int? GloveType);

public sealed record PlayerRole(int Code, string Name, string? Position, int Level);

public sealed record HistoryPoint(string SnapshotId, DateOnly GameDate, int? Overall, int? Potential, int? ClubId,
    string? Club, bool ClubChanged);

public sealed record SaveInfo(string SaveUid, int? UserTeamId, string? UserTeamName, int SnapshotCount,
    DateOnly FirstGameDate, DateOnly LastGameDate, SnapshotInfo Latest, IReadOnlyList<BranchInfo> Branches);

/// <param name="Reason">Importer'ın dalı açma/atama nedeni (ilk snapshot'ınki).</param>
/// <param name="Active">Son okunan disk kaydının dalı; disk işaretçisi yoksa en son gözlemlenen dal.</param>
public sealed record BranchInfo(long Branch, string CareerKey, long? ParentBranch, DateOnly? ForkDate, int SnapshotCount,
    DateOnly FirstGameDate, DateOnly LastGameDate, string? LastExportedAt, string? Reason, bool Active,
    IReadOnlyList<BranchSaveSlot>? Slots = null);

/// <summary>İçe aktarıcının yuvayla doğruladığı bağlantı; tam kullanıcı dosya yolu API'ye taşınmaz.</summary>
public sealed record BranchSaveSlot(string Title, string FileName, DateOnly? GameDate);
