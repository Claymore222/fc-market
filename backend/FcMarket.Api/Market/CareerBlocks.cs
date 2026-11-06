using System.Globalization;
using FcMarket.Api.Data;
using Microsoft.Data.Sqlite;

namespace FcMarket.Api.Market;

/// <summary>
/// Kariyer kaydının veritabanı dışı blokları (tools/saveimport/career.py → raw_career_*): yarışma ağacı, fikstür ve
/// sonuçlar, canlı puan tablosu, oyuncu sezon istatistikleri. Alan adları field-map careerCompetition/careerFixture/
/// careerStanding/careerStat'tan. Tablo yoksa (yalnız LE export'u) <see cref="Load"/> null döner.
/// </summary>
public sealed class CareerBlocks
{
    public sealed record Fixture(int Index, int CompetitionId, int Round, DateOnly Date, int Time, int HomeSlot, int AwaySlot,
        int? HomeGoals, int? AwayGoals, bool Played);

    public sealed record StandingSlot(int Index, int Group, int TeamId, int[] Home, int[] Away, int Points);

    public required IReadOnlyList<Fixture> Fixtures { get; init; }
    public required IReadOnlyDictionary<int, StandingSlot> Standings { get; init; }
    public required IReadOnlyDictionary<int, string> CompetitionCodes { get; init; }

    /// <summary>
    /// Kariyer bloklarının okunacağı snapshot. Yalnız LE export'undan gelen snapshot'ta (kaydetmeden önceki günler ya da
    /// kayıt başka bir dala bağlandıysa) bloklar yoktur ve export'un fikstür/tablo verisi oyunun bayat başlangıç verisidir;
    /// o zaman aynı save'in bu tarihe kadarki en yeni kayıt bloğu kullanılır.
    /// </summary>
    public static string SourceSnapshot(SqliteConnection con, ResolvedSchema s, string snap)
    {
        if (!s.HasTable(s.Map.CareerFixture)) return snap;
        var table = s.Table(s.Map.CareerFixture);
        var branchFilter = CareerDb.HasBranches(con) ? "AND b.branch IS a.branch " : "";
        using var cmd = con.CreateCommand();
        cmd.CommandText = $"SELECT b.snapshot_id FROM snapshots a JOIN snapshots b ON b.save_uid = a.save_uid AND b.game_date <= a.game_date " +
                          $"WHERE a.snapshot_id = $snap {branchFilter}AND EXISTS (SELECT 1 FROM {table} f WHERE f.snapshot_id = b.snapshot_id) " +
                          "ORDER BY b.snapshot_id = $snap DESC, b.game_date DESC, b.exported_at DESC LIMIT 1";
        cmd.Parameters.AddWithValue("$snap", snap);
        return cmd.ExecuteScalar() as string ?? snap;
    }

    public static CareerBlocks? Load(SqliteConnection con, ResolvedSchema s, string snap, bool allowFallback = true)
    {
        var map = s.Map;
        if (!s.HasTable(map.CareerFixture) || !s.HasTable(map.CareerStanding)) return null;
        if (allowFallback) snap = SourceSnapshot(con, s, snap);
        var codes = Rows(con, s, map.CareerCompetition, snap, ["id", "code"])
            .Where(r => MarketLoader.Int(r[0]) is not null)
            .GroupBy(r => MarketLoader.Int(r[0])!.Value).ToDictionary(g => g.Key, g => MarketLoader.Str(g.First()[1]) ?? "");
        var standings = new Dictionary<int, StandingSlot>();
        foreach (var r in Rows(con, s, map.CareerStanding, snap, ["index", "group", "teamId", "homeWins", "homeDraws", "homeLosses",
                     "homeGoalsFor", "homeGoalsAgainst", "awayWins", "awayDraws", "awayLosses", "awayGoalsFor", "awayGoalsAgainst", "points"]))
        {
            int V(int i) => MarketLoader.Int(r[i]) ?? 0;
            if (MarketLoader.Int(r[0]) is { } idx)
                standings[idx] = new StandingSlot(idx, V(1), MarketLoader.Int(r[2]) ?? -1, [V(3), V(4), V(5), V(6), V(7)],
                    [V(8), V(9), V(10), V(11), V(12)], V(13));
        }
        var fixtures = new List<Fixture>();
        foreach (var r in Rows(con, s, map.CareerFixture, snap, ["index", "competitionId", "round", "date", "time", "homeSlot", "awaySlot",
                     "homeGoals", "awayGoals", "status"]))
        {
            int? V(int i) => MarketLoader.Int(r[i]);
            if (V(3) is not { } ymd || !DateOnly.TryParseExact(ymd.ToString(CultureInfo.InvariantCulture), "yyyyMMdd",
                    CultureInfo.InvariantCulture, DateTimeStyles.None, out var date)) continue;
            var played = V(9) is > 0;
            fixtures.Add(new Fixture(V(0) ?? 0, V(1) ?? 0, V(2) ?? 0, date, V(4) ?? 0, V(5) ?? 0, V(6) ?? 0,
                played ? V(7) : null, played ? V(8) : null, played));
        }
        return new CareerBlocks { Fixtures = fixtures, Standings = standings, CompetitionCodes = codes };
    }

    /// <summary>Lig yarışmasının kimliği: yarışma kodu "C" + leagues.leagueid.</summary>
    public int? LeagueCompetition(int leagueId)
    {
        var code = "C" + leagueId.ToString(CultureInfo.InvariantCulture);
        return CompetitionCodes.Where(kv => kv.Value == code).Select(kv => (int?)kv.Key).FirstOrDefault();
    }

    public int? TeamOf(int slot) => Standings.TryGetValue(slot, out var s) && s.TeamId >= 0 ? s.TeamId : null;

    /// <summary>
    /// Kullanıcının lig grubundaki canlı puan tablosu (sıra kayıtta yok: puan, averaj, atılan gol). Lig fikstürü ya da
    /// grubu bulunamazsa null.
    /// </summary>
    public List<(StandingSlot Slot, int Position)>? LeagueGroup(int leagueId, int team)
    {
        if (LeagueCompetition(leagueId) is not { } comp) return null;
        var slots = Fixtures.Where(f => f.CompetitionId == comp).SelectMany(f => new[] { f.HomeSlot, f.AwaySlot }).ToHashSet();
        var mine = slots.Select(x => Standings.GetValueOrDefault(x)).FirstOrDefault(x => x?.TeamId == team);
        if (mine is null) return null;
        return Standings.Values.Where(x => x.Group == mine.Group && x.TeamId >= 0)
            .OrderByDescending(x => x.Points)
            .ThenByDescending(x => x.Home[3] + x.Away[3] - x.Home[4] - x.Away[4])
            .ThenByDescending(x => x.Home[3] + x.Away[3])
            .Select((x, i) => (x, i + 1)).ToList();
    }

    /// <summary>Takımın maçları (tarih sırasıyla).</summary>
    public IEnumerable<Fixture> TeamFixtures(int team) =>
        Fixtures.Where(f => TeamOf(f.HomeSlot) == team || TeamOf(f.AwaySlot) == team).OrderBy(f => f.Date).ThenBy(f => f.Time);

    public const string UnknownCompetition = "Diğer yarışma";

    /// <summary>Yarışma adı: lig ise ligin adı, değilse field-map competitionLabels (kod); ham kod gösterilmez.</summary>
    public static string? CompetitionName(string? code, Func<int, string?> leagueName, IReadOnlyDictionary<string, string> labels)
    {
        if (string.IsNullOrEmpty(code)) return null;
        if (labels.TryGetValue(code, out var label)) return label;
        if (code.StartsWith('C') && int.TryParse(code.AsSpan(1), NumberStyles.None, CultureInfo.InvariantCulture, out var league)
            && leagueName(league) is { } name) return name;
        return UnknownCompetition;
    }

    /// <summary>Oyuncu sezon istatistikleri satırları (field-map careerStat), istenen oyuncular/takım için.</summary>
    public static List<object?[]> StatRows(SqliteConnection con, ResolvedSchema s, string snap, string[] fields, string filterField, int value) =>
        RowsWhere(con, s, s.Map.CareerStat, snap, fields, filterField, value);

    /// <summary>Oyuncunun kayıttaki son maç satırları (field-map careerRecentMatch).</summary>
    public static List<object?[]> RecentMatchRows(SqliteConnection con, ResolvedSchema s, string snap, string[] fields, int playerId) =>
        RowsWhere(con, s, s.Map.CareerRecentMatch, snap, fields, "playerId", playerId);

    private static List<object?[]> RowsWhere(SqliteConnection con, ResolvedSchema s, Dictionary<string, string> sec, string snap, string[] fields, string filterField, int value)
    {
        if (!s.HasTable(sec) || s.Column(sec, filterField) is not { } col) return [];
        snap = SourceSnapshot(con, s, snap);
        using var cmd = con.CreateCommand();
        cmd.CommandText = $"SELECT {string.Join(", ", fields.Select(f => s.Select(sec, f)))} FROM {s.Table(sec)} " +
                          $"WHERE snapshot_id = $snap AND {col} = $v";
        cmd.Parameters.AddWithValue("$snap", snap);
        cmd.Parameters.AddWithValue("$v", value);
        using var r = cmd.ExecuteReader();
        var rows = new List<object?[]>();
        while (r.Read()) rows.Add(Enumerable.Range(0, fields.Length).Select(i => r.IsDBNull(i) ? null : r.GetValue(i)).ToArray());
        return rows;
    }

    private static List<object?[]> Rows(SqliteConnection con, ResolvedSchema s, Dictionary<string, string> sec, string snap, string[] fields)
    {
        if (!s.HasTable(sec)) return [];
        using var cmd = con.CreateCommand();
        cmd.CommandText = $"SELECT {string.Join(", ", fields.Select(f => s.Select(sec, f)))} FROM {s.Table(sec)} WHERE snapshot_id = $snap";
        cmd.Parameters.AddWithValue("$snap", snap);
        using var r = cmd.ExecuteReader();
        var rows = new List<object?[]>();
        while (r.Read()) rows.Add(Enumerable.Range(0, fields.Length).Select(i => r.IsDBNull(i) ? null : r.GetValue(i)).ToArray());
        return rows;
    }
}
