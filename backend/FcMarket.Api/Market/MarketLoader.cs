using System.Globalization;
using FcMarket.Api.Data;
using FcMarket.Api.Domain;
using FcMarket.Api.FieldMaps;
using Microsoft.Data.Sqlite;

namespace FcMarket.Api.Market;

/// <summary>Bir snapshot'ı field-map üzerinden okuyup <see cref="MarketData"/> kurar.</summary>
public sealed class MarketLoader(Valuator valuator, OpportunityScorer scorer, SeasonOptions season, MarketOptions market)
{
    public SnapshotInfo ToInfo(SnapshotRow s) => new(
        s.SnapshotId, s.SaveUid, s.Date, Metrics.SeasonEndYear(s.Date, season.StartMonth), s.ExportedAt,
        (int?)s.UserTeamid, s.UserTeamName, s.TransferBudget, s.WageBudget, s.Branch, s.CareerKey, s.Source, s.Revision);

    /// <param name="saveSnapshots">Dalın geçmişi (<see cref="CareerDb.Lineage"/>), eskiden yeniye; sonuncusu yüklenecek olan.</param>
    public MarketData Load(SqliteConnection con, FieldMap map, IReadOnlyList<SnapshotRow> saveSnapshots)
    {
        var schema = ResolvedSchema.FromDb(map, con);
        var current = saveSnapshots[^1];
        var info = ToInfo(current);
        var snap = current.SnapshotId;

        var previous = saveSnapshots.Count > 1 ? saveSnapshots[^2] : null;
        var window = Math.Max(2, market.GrowthWindowSnapshots);
        var windowStart = saveSnapshots.Count > 1 ? saveSnapshots[Math.Max(0, saveSnapshots.Count - window)] : null;

        var P = map.Player;
        var names = Keyed(con, schema, map.Names, snap, "playerId", ["name", "clubTeamId"]);
        var teams = Keyed(con, schema, map.Team, snap, "id", ["name"]);
        var teamLeague = Keyed(con, schema, map.LeagueTeamLink, snap, "teamId", ["leagueId"], orderBy: "leagueId");
        var leagues = Keyed(con, schema, map.League, snap, "id", ["name"]);
        var nations = Keyed(con, schema, map.Nation, snap, "id", ["name", "isoCode"]);
        var contracts = Keyed(con, schema, map.Contract, snap, "playerId", ["wage", "endYear"]);
        var prevOvr = previous is null ? new() : Keyed(con, schema, P, previous.SnapshotId, "id", ["overall"]);
        var startOvr = windowStart is null ? new()
            : windowStart == previous ? prevOvr
            : Keyed(con, schema, P, windowStart.SnapshotId, "id", ["overall"]);

        var cards = CardStats(con, schema, snap);

        string[] fields = ["overall", "potential", "birthdate", "position1", "position2", "nationality", "foot",
            "height", "weight", "skillMoves", "weakFoot", "gender", "position3", "position4", "position5", "position6", "position7",
            "role1", "role2", "role3", "role4", "role5", "role6", "role7", "role8", "role9",
            "playStyles1", "playStyles2", "playStylesPlus1", "playStylesPlus2"];
        var players = new List<MarketPlayer>();
        var epoch = map.Epoch;
        var hideGender = market.IncludeWomen ? null : map.WomenGenderCode;

        foreach (var (id, v) in Keyed(con, schema, P, snap, "id", fields))
        {
            if (hideGender is { } hg && Int(v[11]) == hg) continue;
            int? ovr = Int(v[0]), pot = Int(v[1]);
            var birth = Metrics.BirthDate(Int(v[2]), epoch);
            var age = Metrics.Age(birth, info.GameDate);
            var pos = map.PositionLabel(Int(v[3]));
            var nationId = Int(v[5]);
            var footCode = Int(v[6]);
            var positions = new[] { v[3], v[4] }.Concat(v.Skip(12).Take(5)).Select(x => map.PositionLabel(Int(x)))
                .OfType<string>().Distinct().ToArray();

            object?[]? n = names.GetValueOrDefault(id);
            var name = Str(n?[0]) ?? $"#{id}";
            var clubId = Int(n?[1]);
            var leagueId = clubId is { } c ? Int(teamLeague.GetValueOrDefault(c)?[0]) : null;

            // Serbest oyuncuda kayıtlı maaş ayrı gösterilir; aktif sözleşmeye/değer hesabına katılmaz.
            var isFree = map.IsFreeAgentTeam(clubId);
            var recordedContract = contracts.GetValueOrDefault(id);
            var contract = isFree ? null : recordedContract;
            int? endYear = Int(contract?[1]) is { } year && year != map.ContractPlaceholderYear ? year : null;
            var yearsLeft = isFree ? 0 : Metrics.ContractYearsLeft(endYear, info.SeasonEndYear);

            var prev = Int(prevOvr.GetValueOrDefault(id)?[0]);
            double? growth = windowStart is null ? null
                : Metrics.GrowthPerMonth(ovr, Int(startOvr.GetValueOrDefault(id)?[0]), info.GameDate, windowStart.Date);

            var card = cards.GetValueOrDefault(id);
            var value = valuator.Estimate(ovr, pot, age, yearsLeft, pos, Long(contract?[0]));
            var opp = scorer.Score(ovr, pot, growth, yearsLeft, age);

            players.Add(new MarketPlayer
            {
                Id = id,
                Name = name,
                SearchKey = MarketPlayer.Normalize(name),
                Age = age,
                BirthDate = birth,
                Position = pos,
                Position2 = map.PositionLabel(Int(v[4])),
                Positions = positions,
                NaturalPositionGroups = positions.Select(map.PositionGroupOf).OfType<string>().Distinct().ToArray(),
                PositionGroup = map.PositionGroupOf(pos),
                Overall = ovr,
                Potential = pot,
                OvrDelta = ovr is { } o && prev is { } p ? o - p : null,
                GrowthPerMonth = growth,
                NationId = nationId,
                Nation = nationId is { } ni ? Str(nations.GetValueOrDefault(ni)?[0]) : null,
                NationCode = nationId is { } nc ? IsoCode(Str(nations.GetValueOrDefault(nc)?[1])) : null,
                ClubId = clubId,
                Club = isFree ? map.FreeAgents.Label : clubId is { } ci ? Str(teams.GetValueOrDefault(ci)?[0]) : null,
                IsFreeAgent = isFree,
                LeagueId = leagueId,
                League = leagueId is { } li ? Str(leagues.GetValueOrDefault(li)?[0]) : null,
                FootCode = footCode,
                Foot = map.FootLabel(footCode),
                Height = Int(v[7]),
                Weight = Int(v[8]),
                SkillMoves = map.WithOffset("skillMoves", Int(v[9])),
                WeakFoot = map.WithOffset("weakFoot", Int(v[10])),
                Wage = Long(contract?[0]),
                RecordedWage = Long(recordedContract?[0]),
                ContractEnd = endYear,
                ContractYearsLeft = yearsLeft,
                Value = value.Value,
                ValueBreakdown = value,
                Opportunity = opp.Score,
                OpportunityBreakdown = opp,
                Pace = card?[0], Shooting = card?[1], Passing = card?[2],
                Dribbling = card?[3], Defending = card?[4], Physical = card?[5],
                GkDiving = card?[6], GkHandling = card?[7], GkKicking = card?[8], GkReflexes = card?[9], GkPositioning = card?[10],
                RoleCodes = v.Skip(17).Take(9).Select(Int).OfType<int>().Where(code => code > 0).Distinct().ToArray(),
                PlayStyleIds = PlayerAbilities.KnownStyleBits(map, v[26], v[27]),
                PlayStylePlusIds = PlayerAbilities.KnownStyleBits(map, v[28], v[29]),
            });
        }

        return new MarketData
        {
            Snapshot = info,
            Previous = previous is null ? null : ToInfo(previous),
            Schema = schema,
            Players = players,
        };
    }

    /// <summary>Kart değeri sırası (field-map cardStats anahtarları).</summary>
    public static readonly string[] CardKeys = ["pace", "shooting", "passing", "dribbling", "defending", "physical"];
    private static readonly string[] GoalkeeperKeys = ["gkDiving", "gkHandling", "gkKicking", "gkReflexes", "gkPositioning"];

    /// <summary>
    /// Oyuncu başına kart değerleri (PAC..PHY), field-map cardStats ağırlıklarıyla. Ağırlığın yarısından azı bilinen
    /// değer boş kalır. Oyun bu değerleri tutmaz; sonuç tahminidir.
    /// </summary>
    private static Dictionary<int, int?[]> CardStats(SqliteConnection con, ResolvedSchema s, string snap)
    {
        var map = s.Map;
        var result = new Dictionary<int, int?[]>();
        var goalkeeperAttrs = GoalkeeperKeys.Select(k => map.AnalysisAttributes.GetValueOrDefault(k)).ToArray();
        var attrs = CardKeys.SelectMany(k => map.CardStats.GetValueOrDefault(k)?.Keys ?? Enumerable.Empty<string>())
            .Concat(goalkeeperAttrs.OfType<string>())
            .Distinct().Select(a => (Attr: a, Col: s.RawColumn(map.Player, a))).Where(a => a.Col is not null).ToList();
        if (attrs.Count == 0 || s.Column(map.Player, "id") is not { } idCol) return result;

        using var cmd = con.CreateCommand();
        cmd.CommandText = $"SELECT {idCol}, {string.Join(", ", attrs.Select(a => a.Col))} FROM {s.Table(map.Player)} WHERE snapshot_id = $snap";
        cmd.Parameters.AddWithValue("$snap", snap);
        using var r = cmd.ExecuteReader();
        var values = new Dictionary<string, int?>(attrs.Count);
        while (r.Read())
        {
            if (Int(r.IsDBNull(0) ? null : r.GetValue(0)) is not { } id || result.ContainsKey(id)) continue;
            for (var i = 0; i < attrs.Count; i++) values[attrs[i].Attr] = Int(r.IsDBNull(i + 1) ? null : r.GetValue(i + 1));
            var card = new int?[CardKeys.Length + GoalkeeperKeys.Length];
            for (var k = 0; k < CardKeys.Length; k++)
                if (map.CardStats.GetValueOrDefault(CardKeys[k]) is { } weights
                    && PositionRatings.Raw(weights, values, 0.5) is { } v)
                    card[k] = Math.Clamp((int)Math.Round(v, MidpointRounding.AwayFromZero), 1, 99);
            for (var k = 0; k < GoalkeeperKeys.Length; k++)
                if (goalkeeperAttrs[k] is { } attr && values.GetValueOrDefault(attr) is >= 0 and <= 99 and var actual)
                    card[CardKeys.Length + k] = actual;
            result[id] = card;
        }
        return result;
    }

    /// <summary>
    /// Bir bölümün tablosunu snapshot için okur: anahtar -> istenen alanlar. Tablo ya da anahtar kolonu yoksa boş,
    /// eksik alanlar null. Aynı anahtarın ilk satırı alınır.
    /// </summary>
    public static Dictionary<int, object?[]> Keyed(SqliteConnection con, ResolvedSchema s, Dictionary<string, string> section,
        string snapshotId, string key, string[] fields, string? orderBy = null)
    {
        var result = new Dictionary<int, object?[]>();
        if (!s.HasTable(section) || s.Column(section, key) is null) return result;

        var select = string.Join(", ", new[] { key }.Concat(fields).Select(f => s.Select(section, f)));
        var order = orderBy is not null && s.Column(section, orderBy) is not null ? $" ORDER BY {s.Select(section, orderBy)}" : "";
        using var cmd = con.CreateCommand();
        cmd.CommandText = $"SELECT {select} FROM {s.Table(section)} WHERE snapshot_id = $snap{order}";
        cmd.Parameters.AddWithValue("$snap", snapshotId);
        using var r = cmd.ExecuteReader();
        while (r.Read())
        {
            if (Int(r.IsDBNull(0) ? null : r.GetValue(0)) is not { } k || result.ContainsKey(k)) continue;
            var vals = new object?[fields.Length];
            for (var i = 0; i < fields.Length; i++)
                vals[i] = r.IsDBNull(i + 1) ? null : r.GetValue(i + 1);
            result[k] = vals;
        }
        return result;
    }

    /// <summary>
    /// FC 27 nations.isocountrycode ülke adıyla bitişik geliyor ("TRTürkiye"): baştaki iki büyük harf ISO 3166 kodu.
    /// </summary>
    public static string? IsoCode(string? raw) =>
        raw is { Length: >= 2 } && raw[0] is >= 'A' and <= 'Z' && raw[1] is >= 'A' and <= 'Z' ? raw[..2] : null;

    // SQLite dinamik tipli: aynı kolon long, double ya da string gelebilir.
    public static int? Int(object? v) => v switch
    {
        null => null,
        long l => (int)l,
        int i => i,
        double d => (int)Math.Round(d),
        string s when int.TryParse(s, NumberStyles.Integer, CultureInfo.InvariantCulture, out var i) => i,
        string s when double.TryParse(s, NumberStyles.Float, CultureInfo.InvariantCulture, out var d) => (int)Math.Round(d),
        _ => null,
    };

    public static long? Long(object? v) => v switch
    {
        null => null,
        long l => l,
        double d => (long)Math.Round(d),
        string s when long.TryParse(s, NumberStyles.Integer, CultureInfo.InvariantCulture, out var l) => l,
        _ => Int(v),
    };

    public static double? Double(object? v) => v switch
    {
        null => null,
        long l => l,
        double d => d,
        string s when double.TryParse(s, NumberStyles.Float, CultureInfo.InvariantCulture, out var d) => d,
        _ => null,
    };

    public static string? Str(object? v) => v switch
    {
        null => null,
        string s => s,
        IFormattable f => f.ToString(null, CultureInfo.InvariantCulture),
        _ => v.ToString(),
    };
}
