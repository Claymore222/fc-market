using System.Globalization;
using FcMarket.Api.Data;
using FcMarket.Api.Domain;
using FcMarket.Api.FieldMaps;
using Microsoft.Data.Sqlite;

namespace FcMarket.Api.Market;

/// <summary>
/// Kulüp ekranları (Home, Squad): kulüp bilgisi, lig tablosu, kadro (ilk 11 / yedek / rezerv), duran top sorumluları.
/// Hepsi seçili kariyer dalının son snapshot'ından; ham alanlar field-map'ten (team, leagueTeamLink, squadLink, loan).
/// </summary>
public sealed class ClubService(CareerDb db, MarketService market, ReloadingJsonFile<PositionRatingConfig> positionRatings)
{
    /// <summary>Diziliş atamasında oyuncunun kendi mevkisine verilen ek puan (ikinci mevkiye yarısı).</summary>
    private const int NaturalBonus = 4;

    private static readonly string[] TeamFields =
    [
        "name", "overall", "attack", "midfield", "defense", "clubWorth", "captainId", "penaltyTakerId", "freeKickTakerId",
        "leftFreeKickTakerId", "rightFreeKickTakerId", "leftCornerTakerId", "rightCornerTakerId", "longKickTakerId",
        "buildUpPlay", "defensiveDepth", "domesticPrestige", "internationalPrestige", "stadiumCapacity", "foundationYear",
        "leagueTitles", "domesticCups", "clWins", "elWins", "eclWins", "rivalTeamId", "youthDevelopment",
        "color1R", "color1G", "color1B", "color2R", "color2G", "color2B", "popularity",
        "throwInLeftId", "throwInRightId", "cornerSupport1", "cornerSupport2", "cornerSupport3", "cornerSupport4",
        "cornerSupport5", "cornerSupport6", "cornerSupport7", "cornerSupport8", "cornerSupport9",
    ];

    /// <summary>Kupa sayaçları (teams): kariyer boyunca artışları "kazanılan kupa" sayılır.</summary>
    private static readonly (string Field, string Label)[] TrophyFields =
        [("leagueTitles", "Lig şampiyonluğu"), ("domesticCups", "Yerel kupa"), ("clWins", "Şampiyonlar Ligi"),
         ("elWins", "Avrupa Ligi"), ("eclWins", "Konferans Ligi")];

    private static readonly string[] StandingFields =
    [
        "teamId", "tablePosition", "previousPosition", "points", "played", "homeWins", "homeDraws", "homeLosses",
        "awayWins", "awayDraws", "awayLosses", "homeGoalsFor", "homeGoalsAgainst", "awayGoalsFor", "awayGoalsAgainst",
        "objective", "champion",
    ];

    public ClubView Get(string? saveUid, int? teamId)
    {
        var data = market.Get(saveUid);
        var s = data.Schema;
        var map = s.Map;
        var snap = data.Snapshot.SnapshotId;
        var team = teamId ?? data.Snapshot.UserTeamId
                   ?? throw new NotFoundException("Kariyerin kullanıcı takımı bilinmiyor; teamId ver.");
        using var con = db.Open();

        var teams = MarketLoader.Keyed(con, s, map.Team, snap, "id", TeamFields);
        if (!teams.TryGetValue(team, out var t)) throw new NotFoundException($"Takım bulunamadı: {team}");
        string? TeamName(int? id) => id is { } i ? MarketLoader.Str(teams.GetValueOrDefault(i)?[0]) : null;
        int? T(string field) => MarketLoader.Int(t[Array.IndexOf(TeamFields, field)]);

        var leagueId = MarketLoader.Int(MarketLoader.Keyed(con, s, map.LeagueTeamLink, snap, "teamId", ["leagueId"],
            orderBy: "leagueId").GetValueOrDefault(team)?[0]);
        var leagueName = leagueId is { } lid
            ? MarketLoader.Str(MarketLoader.Keyed(con, s, map.League, snap, "id", ["name"]).GetValueOrDefault(lid)?[0])
            : null;

        var club = new ClubInfo(team, TeamName(team) ?? $"Takım {team}", leagueId, leagueName,
            T("overall"), T("attack"), T("midfield"), T("defense"), MarketLoader.Long(t[Array.IndexOf(TeamFields, "clubWorth")]),
            T("buildUpPlay"), T("defensiveDepth"), T("domesticPrestige"), T("internationalPrestige"), T("stadiumCapacity"),
            T("foundationYear"), T("leagueTitles"), T("domesticCups"), T("clWins"), T("elWins"), T("eclWins"),
            T("rivalTeamId"), TeamName(T("rivalTeamId")), T("youthDevelopment"),
            Color(T("color1R"), T("color1G"), T("color1B")), Color(T("color2R"), T("color2G"), T("color2B")), T("popularity"),
            T("buildUpPlay") is { } bp ? map.BuildUpPlayLabels.GetValueOrDefault(bp.ToString(CultureInfo.InvariantCulture)) ?? $"Kod {bp}" : null);

        var table = leagueId is { } l ? Standings(con, s, snap, l, team, TeamName) : [];
        // Kariyer kaydı içe aktarıldıysa canlı tablo, fikstür ve sezon istatistikleri kayıttan (oyunun leagueteamlinks'i bayat).
        var blocks = CareerBlocks.Load(con, s, snap);
        var leagueComp = leagueId is { } lc ? blocks?.LeagueCompetition(lc) : null;
        var live = leagueId is { } lg && blocks is not null ? blocks.LeagueGroup(lg, team) : null;
        if (live is not null)
        {
            var previous = table.ToDictionary(x => x.TeamId, x => x.PreviousPosition);
            table = live.Select(x => new Standing(x.Slot.TeamId, TeamName(x.Slot.TeamId) ?? $"Takım {x.Slot.TeamId}", x.Position, x.Slot.Points,
                x.Slot.Home[0] + x.Slot.Home[1] + x.Slot.Home[2] + x.Slot.Away[0] + x.Slot.Away[1] + x.Slot.Away[2],
                x.Slot.Home[0] + x.Slot.Away[0], x.Slot.Home[1] + x.Slot.Away[1], x.Slot.Home[2] + x.Slot.Away[2],
                x.Slot.Home[3] + x.Slot.Away[3], x.Slot.Home[4] + x.Slot.Away[4], previous.GetValueOrDefault(x.Slot.TeamId),
                x.Slot.TeamId == team)).ToList();
            // Sezon başlamadıysa sıra yok (CMTracker da boş gösterir); takımlar geçen sezon sırasına göre.
            if (table.All(x => x.Played == 0))
                table = table.Select(x => x with { Position = null })
                    .OrderBy(x => x.PreviousPosition ?? int.MaxValue).ThenBy(x => x.Team, StringComparer.Ordinal).ToList();
        }
        var squad = Squad(con, data, team, leagueComp);
        var xiOvr = squad.Where(m => m.Role == SquadRole.XI && m.Player.Overall is not null)
            .Select(m => m.Player.Overall!.Value).ToList();
        var players = squad.Where(m => m.Role != SquadRole.LoanedOut).Select(m => m.Player).ToList();
        var ages = players.Where(p => p.Age is not null).Select(p => p.Age!.Value).ToList();
        var summary = new SquadSummary(players.Count,
            ages.Count > 0 ? Math.Round(ages.Average(), 1) : null,
            players.Sum(p => p.Value ?? 0),
            players.Any(p => p.Wage is not null) ? players.Sum(p => p.Wage ?? 0) : null,
            xiOvr.Count > 0 ? Math.Round(xiOvr.Average(), 1) : null,
            players.Count(p => p.ContractEnd is { } end && end <= data.Snapshot.SeasonEndYear));

        // CMTracker düzeni: sol/sağ aynı oyuncuysa tek satır ("freeKicks", "corners"); genel serbest vuruşçu
        // (freekicktakerid) oyunun taktik ekranında yok, gösterilmez.
        var setPieces = new List<SetPiece>();
        void Add(string role, int? pid)
        {
            if (pid is { } id && data.Find(id) is { } p) setPieces.Add(new SetPiece(role, p.Id, p.Name, p.Overall));
        }
        void Pair(string both, string left, string right, string leftField, string rightField)
        {
            int? l = T(leftField), r = T(rightField);
            if (l is not null && l == r) Add(both, l);
            else { Add(left, l); Add(right, r); }
        }
        Add("captain", T("captainId"));
        Add("penalties", T("penaltyTakerId"));
        Pair("freeKicks", "leftFreeKick", "rightFreeKick", "leftFreeKickTakerId", "rightFreeKickTakerId");
        Pair("corners", "leftCorner", "rightCorner", "leftCornerTakerId", "rightCornerTakerId");
        Add("longFreeKick", T("longKickTakerId"));
        Add("throwInLeft", T("throwInLeftId"));
        Add("throwInRight", T("throwInRightId"));
        // Oyun 9 alanı tekrarlı dolduruyor (5 oyuncu, bazıları iki kez): CMTracker gibi tekil oyuncular.
        var cornerSupport = Enumerable.Range(1, 9).Select(i => T($"cornerSupport{i}")).Where(x => x is > 0).Distinct()
            .Select(x => data.Find(x!.Value)).Where(x => x is not null)
            .Select(x => new SetPiece("cornerSupport", x!.Id, x.Name, x.Overall)).ToList();
        setPieces.AddRange(cornerSupport);

        var leagueNames = MarketLoader.Keyed(con, s, map.League, snap, "id", ["name"]);
        string? CompName(int comp) => CareerBlocks.CompetitionName(blocks?.CompetitionCodes.GetValueOrDefault(comp),
            id => MarketLoader.Str(leagueNames.GetValueOrDefault(id)?[0]), map.CompetitionLabels);
        var fixtures = blocks is not null && blocks.TeamFixtures(team).Any()
            ? SaveFixtures(blocks, team, TeamName, CompName, table)
            : Fixtures(con, s, snap, team, data.Snapshot.SeasonEndYear, TeamName);
        var lineage = db.Lineage(con, data.Snapshot.SaveUid, data.Snapshot.Branch, data.Snapshot.SnapshotId);
        // FC 27 leagueteamlinks'in sıra/puan/maç alanlarını kariyerde güncellemiyor (başlangıç verisi kalıyor): önceki bir
        // sezonun snapshot'ıyla birebir aynıysa bu alanlar gösterilmez; yalnız geçen sezon sırası (güncelleniyor) kalır.
        var stale = live is null && TableIsStale(con, s, lineage, data.Snapshot);
        if (stale)
            table = table.Select(x => x with { Position = null, Points = null, Played = null, Won = null, Drawn = null, Lost = null,
                    GoalsFor = null, GoalsAgainst = null })
                .OrderBy(x => x.PreviousPosition ?? int.MaxValue).ThenBy(x => x.Team, StringComparer.Ordinal).ToList();
        var managerCareer = team == data.Snapshot.UserTeamId ? ManagerCareer(con, s, lineage, TeamName) : null;
        var user = team == data.Snapshot.UserTeamId;
        var objectives = user ? Objectives(con, s, snap, comp => CareerBlocks.CompetitionName($"C{comp}",
            id => MarketLoader.Str(leagueNames.GetValueOrDefault(id)?[0]), map.CompetitionLabels)) : null;
        var archiveTrophies = ArchiveTrophies(managerCareer, team, objectives);
        var career = new CareerSpan(lineage.Count, lineage.Count > 0 ? lineage[0].Date : data.Snapshot.GameDate,
            Math.Max(lineage.Select(x => Metrics.SeasonEndYear(x.Date, 7)).Distinct().Count(), managerCareer?.Seasons.Count ?? 0),
            archiveTrophies ?? CareerTrophies(con, s, lineage, team, T),
            lineage.Count > 1 ? lineage[^2].Date : null, archiveTrophies is not null ? "archive" : "counters");
        var world = World(con, s, snap, leagueId, TeamName, stale);
        var academy = Academy(con, data);
        var scouts = team == data.Snapshot.UserTeamId ? Scouts(con, data) : [];
        return new ClubView(data.Snapshot, club, table.FirstOrDefault(r => r.IsUser), table, !stale && TableConsistent(table),
            squad, setPieces, summary, fixtures, academy, scouts, career, world, stale,
            MarketService.LoadCareerRecords(con, data), team == data.Snapshot.UserTeamId ? Finance(con, s, snap, lineage) : null,
            blocks is not null ? SeasonRecord(blocks, team, TeamName, CompName) : null,
            ObservedSeasons(con, s, lineage, team, TeamName), managerCareer,
            user ? ScoutNetwork(con, data, snap) : null, user ? Preseason(con, s, snap, TeamName) : null,
            objectives,
            user ? Manager(con, s, snap, TeamName) : null, user ? Discipline(con, data, snap) : null, leagueComp);
    }

    private static DateOnly? Ymd(int? v) => v is { } ymd && DateOnly.TryParseExact(ymd.ToString(CultureInfo.InvariantCulture), "yyyyMMdd",
        CultureInfo.InvariantCulture, DateTimeStyles.None, out var d) ? d : null;

    /// <summary>
    /// Ana takım gözlemci ağı (kariyer kaydı, field-map careerScoutNetwork): işe alınmışlar kapsadığı ülkeyle, işe alınabilirler
    /// ve yeni gözlemcilerin geleceği tarih. Altyapı gözlemcileri (career_scouts) ayrıdır. Blok yoksa null.
    /// </summary>
    private static ScoutNetworkView? ScoutNetwork(SqliteConnection con, MarketData data, string snap)
    {
        var s = data.Schema;
        var rows = MarketLoader.Keyed(con, s, s.Map.CareerScoutNetwork, CareerBlocks.SourceSnapshot(con, s, snap), "key",
            ["list", "coverNation", "nationality", "experience", "judgement", "firstName", "lastName", "newScoutsDate"], "key");
        if (rows.Count == 0) return null;
        var nations = MarketLoader.Keyed(con, s, s.Map.Nation, data.Snapshot.SnapshotId, "id", ["name", "isoCode"]);
        NetworkScout Scout(object?[] v, bool hired)
        {
            var cover = hired ? MarketLoader.Int(v[1]) : null;
            var nat = MarketLoader.Int(v[2]);
            var c = cover is { } ci ? nations.GetValueOrDefault(ci) : null;
            var n = nat is { } ni ? nations.GetValueOrDefault(ni) : null;
            return new NetworkScout($"{MarketLoader.Str(v[5])} {MarketLoader.Str(v[6])}".Trim(), cover, MarketLoader.Str(c?[0]),
                MarketLoader.IsoCode(MarketLoader.Str(c?[1])), nat, MarketLoader.Str(n?[0]), MarketLoader.IsoCode(MarketLoader.Str(n?[1])),
                MarketLoader.Int(v[3]), MarketLoader.Int(v[4]));
        }
        return new ScoutNetworkView(Ymd(MarketLoader.Int(rows.First().Value[7])),
            rows.Where(kv => MarketLoader.Str(kv.Value[0]) == "hired").Select(kv => Scout(kv.Value, true)).ToList(),
            rows.Where(kv => MarketLoader.Str(kv.Value[0]) == "available").Select(kv => Scout(kv.Value, false)).ToList());
    }

    /// <summary>
    /// Bu sezonun yönetim hedefleri (kariyer kaydı, field-map careerBoardObjectives): yarışma başına hedef, üst ve asgari basamak
    /// (0–17, 17 = kazan). Fenerbahçe 24.07.2030 CMTracker'la birebir. Blok yoksa null.
    /// </summary>
    public static List<BoardObjective>? Objectives(SqliteConnection con, ResolvedSchema s, string snap, Func<int, string?> compName)
    {
        var rows = MarketLoader.Keyed(con, s, s.Map.CareerBoardObjectives, CareerBlocks.SourceSnapshot(con, s, snap), "objectiveId",
            ["compId", "kind", "target", "stretch", "minimum"]);
        if (rows.Count == 0) return null;
        return rows.Select(kv =>
        {
            int? V(int i) => MarketLoader.Int(kv.Value[i]);
            var comp = V(0) ?? 0;
            return new BoardObjective(comp, compName(comp), V(1) ?? 0, V(2), V(3), V(4));
        }).OrderBy(x => x.Kind).ToList();
    }

    /// <summary>
    /// Menajer karnesi (kariyer kaydı, field-map careerManager): haftalık maaş ve kariyer kazancı (EUR), kariyerin en farklı
    /// galibiyeti/mağlubiyeti, zorluk (0–6) ve devre süresi. Fenerbahçe 24.07.2030 CMTracker'la birebir. Blok yoksa null.
    /// </summary>
    private static ManagerInfo? Manager(SqliteConnection con, ResolvedSchema s, string snap, Func<int?, string?> teamName)
    {
        var rows = MarketLoader.Keyed(con, s, s.Map.CareerManager, CareerBlocks.SourceSnapshot(con, s, snap), "recordId",
            ["wage", "earnings", "lossDate", "lossOpponent", "lossFor", "lossAgainst", "winDate", "winOpponent", "winFor", "winAgainst",
             "season", "difficulty", "halfLength"]);
        if (rows.Count == 0) return null;
        var v = rows.First().Value;
        int? V(int i) => MarketLoader.Int(v[i]);
        RecordMatch? Match(int date, int opp, int f, int a) => Ymd(V(date)) is { } d && V(f) is { } gf && V(a) is { } ga
            ? new RecordMatch(d, V(opp), teamName(V(opp)), gf, ga, null) : null;
        return new ManagerInfo(MarketLoader.Long(v[0]), MarketLoader.Long(v[1]), V(10), V(11), V(12), Match(6, 7, 8, 9), Match(2, 3, 4, 5));
    }

    /// <summary>
    /// Kart birikimi ve cezalar (kariyer kaydı, field-map careerSuspensions): oyuncu başına sarı kart ve ceza maçı. Yarışma kodu
    /// (0/1565/1900) ham bırakılır; yerel/kıtasal eşlemesi doğrulanmadı. Blok yoksa null.
    /// </summary>
    private static List<DisciplineRow>? Discipline(SqliteConnection con, MarketData data, string snap)
    {
        var s = data.Schema;
        var rows = MarketLoader.Keyed(con, s, s.Map.CareerSuspensions, CareerBlocks.SourceSnapshot(con, s, snap), "rowKey",
            ["playerId", "yellows", "ban", "compKey"]);
        if (rows.Count == 0) return null;
        return rows.Select(kv =>
        {
            int? V(int i) => MarketLoader.Int(kv.Value[i]);
            var pid = V(0) ?? 0;
            return new DisciplineRow(pid, data.Find(pid)?.Name ?? $"Oyuncu {pid}", V(1) ?? 0, V(2) ?? 0, V(3) ?? 0);
        }).OrderByDescending(x => x.Ban).ThenByDescending(x => x.Yellows).ToList();
    }

    /// <summary>Hazırlık turnuvası davetleri (kariyer kaydı, field-map careerPreseason); ödül EUR. Blok yoksa null.</summary>
    private static PreseasonView? Preseason(SqliteConnection con, ResolvedSchema s, string snap, Func<int?, string?> teamName)
    {
        var rows = MarketLoader.Keyed(con, s, s.Map.CareerPreseason, CareerBlocks.SourceSnapshot(con, s, snap), "compId",
            ["key", "teamIds", "prize", "entered", "confirmedDate"]);
        if (rows.Count == 0) return null;
        var invites = rows.Select(kv =>
        {
            var ids = (MarketLoader.Str(kv.Value[1]) ?? "").Split(',', StringSplitOptions.RemoveEmptyEntries)
                .Select(x => int.TryParse(x, out var i) ? i : (int?)null).ToList();
            return new PreseasonInvite(kv.Key, MarketLoader.Str(kv.Value[0]) ?? "", MarketLoader.Int(kv.Value[3]) == 1,
                MarketLoader.Long(kv.Value[2]) ?? 0, ids.Select(i => teamName(i) ?? $"Takım #{i}").ToList());
        }).OrderByDescending(x => x.Entered).ThenByDescending(x => x.Prize).ToList();
        return new PreseasonView(Ymd(MarketLoader.Int(rows.First().Value[4])), invites);
    }

    /// <summary>
    /// Bu kulüpte kazanılan kupalar, kayıttaki sezon arşivinden (oyunun kulüp sayaçları kariyerde artmıyor). Arşiv yoksa null.
    /// Lig şampiyonluğu CMTracker final sıralarıyla doğrulandı; yerel/kıtasal kupa alanları DOĞRULANACAK.
    /// </summary>
    /// Görsel için yarışma kimliği: lig sezonun lig kimliği; yerel/kıtasal kupa bu sezonun yönetim hedeflerinden (yoksa null).
    private static List<TrophyWon>? ArchiveTrophies(ManagerCareerView? career, int team, IReadOnlyList<BoardObjective>? objectives)
    {
        if (career is null || career.Seasons.All(x => x.LeagueTitles is null)) return null;
        var mine = career.Seasons.Where(x => x.TeamId == team).ToList();
        var result = new List<TrophyWon>();
        void Add(string label, int n, int? comp) { if (n > 0) result.Add(new TrophyWon(label, n, comp)); }
        int? Comp(int kind) => objectives?.FirstOrDefault(o => o.Kind == kind)?.CompetitionId;
        string Name(int kind, string fallback) => objectives?.FirstOrDefault(o => o.Kind == kind)?.Competition ?? fallback;
        Add("Lig şampiyonluğu", mine.Sum(x => x.LeagueTitles ?? 0), mine.LastOrDefault(x => x.LeagueTitles > 0)?.LeagueId);
        Add(Name(1, "Yerel kupa"), mine.Sum(x => x.DomesticCups ?? 0), Comp(1));
        Add(Name(2, "Avrupa kupası"), mine.Sum(x => x.ContinentalCups ?? 0), Comp(2));
        return result;
    }

    private static ManagerCareerView? ManagerCareer(SqliteConnection con, ResolvedSchema s, IReadOnlyList<SnapshotRow> lineage,
        Func<int?, string?> teamName)
    {
        var map = s.Map;
        string[] fields = ["teamId", "leagueId", "position", "objective", "objectiveStatus", "played", "won", "drawn", "lost",
            "goalsFor", "goalsAgainst", "points", "jobSecurity", "biggestBuy", "biggestSale", "leagueTitles", "domesticCups",
            "continentalCups", "biggestBuyFee", "biggestSaleFee"];
        foreach (var source in lineage.Reverse())
        {
            var rows = MarketLoader.Keyed(con, s, map.CareerSeasonHistory, source.SnapshotId, "seasonIndex", fields);
            if (rows.Count == 0) continue;
            if (rows.Values.Any(v => Enumerable.Range(5, 6).Any(i => MarketLoader.Int(v[i]) is null or < 0))) continue;
            var last = rows.Keys.Max();
            var endYear = Metrics.SeasonEndYear(source.Date, 7);
            var seasons = rows.OrderByDescending(kv => kv.Key).Select(kv =>
            {
                var v = kv.Value;
                int? V(int i) => MarketLoader.Int(v[i]);
                string? Label(Dictionary<string, string> labels, int i) => V(i) is { } code
                    ? labels.GetValueOrDefault(code.ToString(CultureInfo.InvariantCulture)) ?? $"Kod {code}" : null;
                return new ManagerSeason(kv.Key, endYear - last + kv.Key, V(0), teamName(V(0)), V(1), V(2),
                    Label(map.CareerObjectiveLabels, 3), Label(map.CareerObjectiveStatusLabels, 4), V(5) ?? 0, V(6) ?? 0,
                    V(7) ?? 0, V(8) ?? 0, V(9) ?? 0, V(10) ?? 0, V(11), V(12), MarketLoader.Str(v[13]), MarketLoader.Str(v[14]), kv.Key < last,
                    V(15), V(16), V(17), MarketLoader.Long(v[18]) is > 0 ? MarketLoader.Long(v[18]) : null,
                    MarketLoader.Long(v[19]) is > 0 ? MarketLoader.Long(v[19]) : null);
            }).ToList();
            return new ManagerCareerView(source.SnapshotId, source.Date, seasons, seasons.Sum(x => x.Played), seasons.Sum(x => x.Won),
                seasons.Sum(x => x.Drawn), seasons.Sum(x => x.Lost), seasons.Sum(x => x.GoalsFor), seasons.Sum(x => x.GoalsAgainst));
        }
        return null;
    }

    /// <summary>Aynı dalın her sezonundaki en son gerçek kayıt bloğu; export fallback'i ve sezonlar arası toplam yok.</summary>
    private static IReadOnlyList<ObservedSeason> ObservedSeasons(SqliteConnection con, ResolvedSchema s,
        IReadOnlyList<SnapshotRow> lineage, int team, Func<int?, string?> teamName)
    {
        if (!s.HasTable(s.Map.CareerFixture) || !s.HasTable(s.Map.CareerStanding)) return [];
        var result = new List<ObservedSeason>();
        foreach (var season in lineage.GroupBy(x => Metrics.SeasonEndYear(x.Date, 7)).OrderByDescending(g => g.Key))
        {
            foreach (var snap in season.OrderByDescending(x => x.Date).ThenByDescending(x => x.ExportedAt))
            {
                var exact = CareerBlocks.Load(con, s, snap.SnapshotId, allowFallback: false);
                if (exact is null || exact.Fixtures.Count == 0) continue;
                // Sıra/puan güncel kayıttan; başka dalın veya başka sezonun bloğu kullanılmaz.
                if (!exact.TeamFixtures(team).Any(f => Metrics.SeasonEndYear(f.Date, 7) == season.Key)) continue;
                var scoped = new CareerBlocks { Fixtures = exact.Fixtures.Where(f => Metrics.SeasonEndYear(f.Date, 7) == season.Key && f.Date <= snap.Date).ToList(),
                    Standings = exact.Standings, CompetitionCodes = exact.CompetitionCodes };
                var record = SeasonRecord(scoped, team, teamName, _ => null) ?? new SeasonRecordView(0, 0, 0, 0, 0, 0, null, null);
                result.Add(new ObservedSeason(season.Key, snap.Date, snap.SnapshotId, team, record));
                break;
            }
        }
        return result;
    }

    /// <summary>
    /// Lig tablosu bayat mı: dalda önceki bir sezona ait en yakın snapshot'la karşılaştırılır; takımların en az %90'ının
    /// sıra, maç ve puanı aynıysa tablo kariyerde güncellenmiyor demektir. Tek sezonluk geçmişte karar verilemez (false).
    /// </summary>
    private static bool TableIsStale(SqliteConnection con, ResolvedSchema s, List<SnapshotRow> lineage, SnapshotInfo now)
    {
        var before = lineage.Where(x => DateOnly.TryParse(x.GameDate, CultureInfo.InvariantCulture, out var d)
                                        && Metrics.SeasonEndYear(d, 7) < now.SeasonEndYear).LastOrDefault();
        if (before is null || !s.HasTable(s.Map.LeagueTeamLink)) return false;
        Dictionary<int, (int?, int?, int?)> Load(string snap) =>
            MarketLoader.Keyed(con, s, s.Map.LeagueTeamLink, snap, "teamId", ["tablePosition", "played", "points"])
                .ToDictionary(kv => kv.Key, kv => (MarketLoader.Int(kv.Value[0]), MarketLoader.Int(kv.Value[1]), MarketLoader.Int(kv.Value[2])));
        return SameTable(Load(before.SnapshotId), Load(now.SnapshotId));
    }

    /// <summary>İki sezondaki (sıra, maç, puan) kayıtlarının en az %90'ı aynıysa true.</summary>
    public static bool SameTable(IReadOnlyDictionary<int, (int?, int?, int?)> before, IReadOnlyDictionary<int, (int?, int?, int?)> now)
    {
        var common = now.Keys.Where(before.ContainsKey).ToList();
        return common.Count > 0 && common.Count(k => before[k] == now[k]) >= 0.9 * common.Count;
    }

    /// <summary>
    /// Kariyerde kazanılan kupalar: dalın ilk snapshot'ındaki kupa sayaçlarına göre artış. Yalnız izlenen dönem;
    /// hangi gün kazanıldığı bilinmez (artışın görüldüğü snapshot).
    /// </summary>
    private static List<TrophyWon> CareerTrophies(SqliteConnection con, ResolvedSchema s, List<SnapshotRow> lineage, int team,
        Func<string, int?> now)
    {
        if (lineage.Count < 2) return [];
        var first = MarketLoader.Keyed(con, s, s.Map.Team, lineage[0].SnapshotId, "id", TrophyFields.Select(t => t.Field).ToArray())
            .GetValueOrDefault(team);
        if (first is null) return [];
        var result = new List<TrophyWon>();
        for (var i = 0; i < TrophyFields.Length; i++)
            if (now(TrophyFields[i].Field) is { } n && MarketLoader.Int(first[i]) is { } f && n > f)
                result.Add(new TrophyWon(TrophyFields[i].Label, n - f));
        return result;
    }

    /// <summary>
    /// Dünya: kullanıcının ülkesinde bu sezon lig değiştiren takımlar (leagueTeamLink.prevLeagueId; seviyeye göre yükselen
    /// ya da düşen) ve birinci seviye liglerin liderleri. Birden çok takım aynı anda 1. görünen lig atlanır (bayat tablo).
    /// </summary>
    private static WorldInfo World(SqliteConnection con, ResolvedSchema s, string snap, int? userLeague, Func<int?, string?> teamName,
        bool staleTable = false)
    {
        var map = s.Map;
        string[] lf = ["name", "level", "countryId", "international", "women"];
        var leagues = MarketLoader.Keyed(con, s, map.League, snap, "id", lf);
        string? LName(int? id) => id is { } i ? MarketLoader.Str(leagues.GetValueOrDefault(i)?[0]) : null;
        int? Level(int? id) => id is { } i ? MarketLoader.Int(leagues.GetValueOrDefault(i)?[1]) : null;
        int? Country(int? id) => id is { } i ? MarketLoader.Int(leagues.GetValueOrDefault(i)?[2]) : null;
        bool Senior(int id) => leagues.TryGetValue(id, out var l) && MarketLoader.Int(l[3]) != 1 && MarketLoader.Int(l[4]) != 1;

        var sec = map.LeagueTeamLink;
        var moves = new List<LeagueMove>();
        var leaders = new List<LeagueLeader>();
        if (!s.HasTable(sec)) return new WorldInfo(moves, leaders);
        // Tablo bayatsa liderler yerine geçen sezonun şampiyonları (previousPosition kariyerde güncelleniyor).
        string[] f = ["teamId", "leagueId", "prevLeagueId", staleTable ? "previousPosition" : "tablePosition"];
        using var cmd = con.CreateCommand();
        cmd.CommandText = $"SELECT {string.Join(", ", f.Select(x => s.Select(sec, x)))} FROM {s.Table(sec)} WHERE snapshot_id = $snap";
        cmd.Parameters.AddWithValue("$snap", snap);
        var rows = new List<(int Team, int League, int? Prev, int? Pos)>();
        using (var r = cmd.ExecuteReader())
            while (r.Read())
            {
                int? V(int i) => MarketLoader.Int(r.IsDBNull(i) ? null : r.GetValue(i));
                if (V(0) is { } t && V(1) is { } l) rows.Add((t, l, V(2), V(3)));
            }

        var country = Country(userLeague);
        foreach (var x in rows.Where(x => x.Prev is > 0 && x.Prev != x.League && Senior(x.League)
                                          && (country is null || Country(x.League) == country)))
        {
            var (now, before) = (Level(x.League), Level(x.Prev));
            if (now is null || before is null || now == before) continue;
            moves.Add(new LeagueMove(x.Team, teamName(x.Team) ?? $"Takım {x.Team}", x.League, LName(x.League), x.Prev!.Value,
                LName(x.Prev), now < before));
        }
        foreach (var g in rows.Where(x => x.Pos == 1 && Senior(x.League) && Level(x.League) == 1).GroupBy(x => x.League))
            if (g.Count() == 1)
                leaders.Add(new LeagueLeader(g.Key, LName(g.Key), g.First().Team, teamName(g.First().Team)));
        return new WorldInfo(
            moves.OrderBy(m => m.League, StringComparer.Ordinal).ThenByDescending(m => m.Promoted).ToList(),
            leaders.OrderBy(l => l.League, StringComparer.Ordinal).ToList(), staleTable);
    }

    /// <summary>
    /// Takımın maçları (field-map fixture): oyun tarihinden önceki 5 ve sonraki 8 maç. Tarih 1582-10-14'ten gün, saat gece
    /// yarısından saniye (72000 = 20:00). Skor tabloda yok. FC 27 tabloyu kariyerde güncellemiyor (17.07.2030 kaydında 332
    /// maçın hepsi Ekim 2026): bu sezonun başından (1 Temmuz) eski maçlar bayat sayılıp atlanır.
    /// </summary>
    private static List<FixtureRow> Fixtures(SqliteConnection con, ResolvedSchema s, string snap, int team,
        int seasonEndYear, Func<int?, string?> teamName)
    {
        var sec = s.Map.Fixture;
        if (!s.HasTable(sec) || s.Column(sec, "homeTeamId") is not { } home || s.Column(sec, "awayTeamId") is not { } away) return [];
        string[] f = ["id", "date", "time", "homeTeamId", "awayTeamId", "competitionId", "homeLeaguePos", "awayLeaguePos"];
        using var cmd = con.CreateCommand();
        cmd.CommandText = $"SELECT {string.Join(", ", f.Select(x => s.Select(sec, x)))} FROM {s.Table(sec)} " +
                          $"WHERE snapshot_id = $snap AND ({home} = $team OR {away} = $team)";
        cmd.Parameters.AddWithValue("$snap", snap);
        cmd.Parameters.AddWithValue("$team", team);
        var all = new List<FixtureRow>();
        using (var r = cmd.ExecuteReader())
            while (r.Read())
            {
                int? V(int i) => MarketLoader.Int(r.IsDBNull(i) ? null : r.GetValue(i));
                if (V(1) is not { } days || days <= 0) continue;
                if (s.Map.Epoch.AddDays(days) < new DateOnly(seasonEndYear - 1, 7, 1)) continue;
                var time = V(2) is { } t && t >= 0 ? $"{t / 3600 % 24:00}:{t / 60 % 60:00}" : null;
                all.Add(new FixtureRow(V(0), s.Map.Epoch.AddDays(days), time, V(3), teamName(V(3)), V(4), teamName(V(4)),
                    V(5), V(3) == team, V(6), V(7)));
            }
        var ordered = all.OrderBy(x => x.Date).ThenBy(x => x.Time, StringComparer.Ordinal).ToList();
        return ordered;
    }

    /// <summary>Kayıttaki takımın tüm fikstürü (skorlar dahil); lig sırası canlı tablodan.</summary>
    private static List<FixtureRow> SaveFixtures(CareerBlocks blocks, int team, Func<int?, string?> teamName,
        Func<int, string?> compName, IReadOnlyList<Standing> table)
    {
        var pos = table.Where(x => x.Position is not null).ToDictionary(x => x.TeamId, x => x.Position);
        var rows = blocks.TeamFixtures(team).Select(f =>
        {
            int? h = blocks.TeamOf(f.HomeSlot), a = blocks.TeamOf(f.AwaySlot);
            return new FixtureRow(f.Index, f.Date, $"{f.Time / 100:00}:{f.Time % 100:00}", h, teamName(h), a, teamName(a), f.CompetitionId,
                h == team, h is { } hh ? pos.GetValueOrDefault(hh) : null, a is { } aa ? pos.GetValueOrDefault(aa) : null,
                f.HomeGoals, f.AwayGoals, compName(f.CompetitionId), f.Round);
        }).ToList();
        return rows;
    }

    /// <summary>
    /// Bu sezonun maç karnesi (hazırlık maçları dahil, oyunun "Kariyer Özeti" gibi): kayıttaki oynanmış fikstürlerden.
    /// Oyunda ayrı alan yok; Gençlerbirliği kayıtlarında oyunun ekranıyla (3-2-0-1, 4-2-1-1 ve goller) birebir.
    /// </summary>
    private static SeasonRecordView? SeasonRecord(CareerBlocks blocks, int team, Func<int?, string?> teamName, Func<int, string?> compName)
    {
        var played = blocks.TeamFixtures(team).Where(f => f.Played && f.HomeGoals is not null && f.AwayGoals is not null)
            .Select(f =>
            {
                var home = blocks.TeamOf(f.HomeSlot) == team;
                var opp = home ? blocks.TeamOf(f.AwaySlot) : blocks.TeamOf(f.HomeSlot);
                return (f, For: home ? f.HomeGoals!.Value : f.AwayGoals!.Value, Against: home ? f.AwayGoals!.Value : f.HomeGoals!.Value, Opp: opp);
            }).ToList();
        if (played.Count == 0) return null;
        RecordMatch? Pick(Func<int, bool> want, bool max)
        {
            var c = played.Where(x => want(x.For - x.Against));
            var best = (max ? c.OrderByDescending(x => x.For - x.Against) : c.OrderBy(x => x.For - x.Against)).ThenBy(x => x.f.Date).FirstOrDefault();
            return best.Opp is null && best.f is null ? null
                : new RecordMatch(best.f.Date, best.Opp, teamName(best.Opp), best.For, best.Against, compName(best.f.CompetitionId));
        }
        return new SeasonRecordView(played.Count, played.Count(x => x.For > x.Against), played.Count(x => x.For == x.Against),
            played.Count(x => x.For < x.Against), played.Sum(x => x.For), played.Sum(x => x.Against),
            Pick(d => d > 0, true), Pick(d => d < 0, false));
    }

    /// <summary>
    /// Altyapı akademisi (field-map youthPlayer): oyuncu kaydı piyasada varsa onunla birlikte. Akademi takımındaki
    /// youthPlayer satırı olmayan oyuncular da (ör. 19 yaşındaki eski genç) eklenir; CMTracker de onları sayar.
    /// </summary>
    private static List<AcademyPlayer> Academy(SqliteConnection con, MarketData data)
    {
        var s = data.Schema;
        var list = MarketLoader.Keyed(con, s, s.Map.YouthPlayer, data.Snapshot.SnapshotId, "playerId", ["tier", "potentialVariance", "monthsInSquad"])
            .Select(kv => (P: data.Find(kv.Key), V: kv.Value))
            .Where(x => x.P is not null)
            .Select(x => new AcademyPlayer(x.P!, MarketLoader.Int(x.V[0]), MarketLoader.Int(x.V[1]), MarketLoader.Int(x.V[2])))
            .ToList();
        var teams = list.Select(a => a.Player.ClubId).Where(t => t is not null && t != data.Snapshot.UserTeamId).ToHashSet();
        var known = list.Select(a => a.Player.Id).ToHashSet();
        list.AddRange(data.Players.Where(p => teams.Contains(p.ClubId) && !known.Contains(p.Id)).Select(p => new AcademyPlayer(p, null, null, null)));
        return list.OrderByDescending(a => a.Player.Potential ?? 0).ToList();
    }

    /// <summary>Gözlemciler (field-map scout); yalnız kullanıcı takımı için anlamlı.</summary>
    private static List<ScoutInfo> Scouts(SqliteConnection con, MarketData data)
    {
        var s = data.Schema;
        var nations = MarketLoader.Keyed(con, s, s.Map.Nation, data.Snapshot.SnapshotId, "id", ["name", "isoCode"]);
        return MarketLoader.Keyed(con, s, s.Map.Scout, data.Snapshot.SnapshotId, "id",
                ["firstName", "lastName", "experience", "knowledge", "nationality", "region"])
            .Select(kv =>
            {
                var v = kv.Value;
                var nat = MarketLoader.Int(v[4]);
                var n = nat is { } ni ? nations.GetValueOrDefault(ni) : null;
                var name = string.Join(" ", new[] { MarketLoader.Str(v[0]), MarketLoader.Str(v[1]) }.Where(x => !string.IsNullOrWhiteSpace(x)));
                return new ScoutInfo(kv.Key, name.Length > 0 ? name : $"Gözlemci {kv.Key}", MarketLoader.Int(v[2]), MarketLoader.Int(v[3]),
                    MarketLoader.Str(n?[0]), MarketLoader.IsoCode(MarketLoader.Str(n?[1])), MarketLoader.Int(v[5]), nat);
            }).OrderBy(x => x.Id).ToList();
    }

    /// <summary>
    /// Sezon istatistiği (field-map matchRating): oyuncu → (maç, dakika, ortalama puan). Tarih yyyymmdd; sezon 1 Temmuz'da
    /// başlar. Puanlar 10'dan büyükse 0–100 ölçeği sayılıp 10'a bölünür. DOĞRULANACAK.
    /// </summary>
    /// <summary>Kayıttaki oyuncu istatistiklerinden bu sezonun lig maçı, dakika ve ortalama puanı (puan toplamı onda bir).</summary>
    private static Dictionary<int, (int Apps, int Minutes, double? Rating)> SaveSeason(SqliteConnection con, MarketData data, int team, int comp)
    {
        var result = new Dictionary<int, (int, int, double?)>();
        foreach (var r in CareerBlocks.StatRows(con, data.Schema, data.Snapshot.SnapshotId,
                     ["playerId", "competitionId", "appearances", "minutes", "ratingTotal"], "teamId", team))
            if (MarketLoader.Int(r[1]) == comp && MarketLoader.Int(r[0]) is { } pid)
            {
                var apps = MarketLoader.Int(r[2]) ?? 0;
                result[pid] = (apps, MarketLoader.Int(r[3]) ?? 0, apps > 0 ? Math.Round((MarketLoader.Int(r[4]) ?? 0) / 10.0 / apps, 2) : null);
            }
        return result;
    }

    private static Dictionary<int, (int Apps, int Minutes, double? Rating)> SeasonRatings(SqliteConnection con, MarketData data,
        IReadOnlySet<int> ids)
    {
        var s = data.Schema;
        var sec = s.Map.MatchRating;
        var result = new Dictionary<int, (int, int, double?)>();
        if (ids.Count == 0 || !s.HasTable(sec) || s.Column(sec, "playerId") is not { } pid || s.Column(sec, "date") is not { } date) return result;
        var seasonStart = (data.Snapshot.SeasonEndYear - 1) * 10000 + 701;
        using var cmd = con.CreateCommand();
        cmd.CommandText = $"SELECT {pid}, {s.Select(sec, "minutes")}, {s.Select(sec, "rating")} FROM {s.Table(sec)} " +
                          $"WHERE snapshot_id = $snap AND {date} >= $start";
        cmd.Parameters.AddWithValue("$snap", data.Snapshot.SnapshotId);
        cmd.Parameters.AddWithValue("$start", seasonStart);
        var rows = new List<(int Id, int? Min, int? Rating)>();
        using (var r = cmd.ExecuteReader())
            while (r.Read())
                if (MarketLoader.Int(r.IsDBNull(0) ? null : r.GetValue(0)) is { } id && ids.Contains(id))
                    rows.Add((id, MarketLoader.Int(r.IsDBNull(1) ? null : r.GetValue(1)), MarketLoader.Int(r.IsDBNull(2) ? null : r.GetValue(2))));
        var scale = rows.Any(x => x.Rating > 10) ? 10.0 : 1.0;
        foreach (var g in rows.GroupBy(x => x.Id))
        {
            var rated = g.Where(x => x.Rating is > 0).Select(x => x.Rating!.Value / scale).ToList();
            result[g.Key] = (g.Count(x => x.Min is null or > 0), g.Sum(x => Math.Max(0, x.Min ?? 0)),
                rated.Count > 0 ? Math.Round(rated.Average(), 2) : null);
        }
        return result;
    }

    /// <summary>
    /// Takım veritabanı (CMTracker Scout → Teams): oyuncusu olan her kulüp; oyunun takım reytingleri ve kadrodan
    /// hesaplanan sayılar. Serbest oyuncu takımları hariç.
    /// </summary>
    public TeamsView Teams(string? saveUid)
    {
        var data = market.Get(saveUid);
        var s = data.Schema;
        var map = s.Map;
        using var con = db.Open();
        var teams = MarketLoader.Keyed(con, s, map.Team, data.Snapshot.SnapshotId, "id", TeamFields);
        var rows = data.Players.Where(p => p.ClubId is { } c && !map.IsFreeAgentTeam(c))
            .GroupBy(p => p.ClubId!.Value)
            .Select(g =>
            {
                var t = teams.GetValueOrDefault(g.Key);
                int? T(string f) => t is null ? null : MarketLoader.Int(t[Array.IndexOf(TeamFields, f)]);
                var ages = g.Where(p => p.Age is not null).Select(p => p.Age!.Value).ToList();
                var top = g.OrderByDescending(p => p.Overall ?? 0).ToList();
                var best11 = top.Take(11).Where(p => p.Overall is not null).Select(p => p.Overall!.Value).ToList();
                var first = g.First();
                return new TeamRow(g.Key, (t is null ? null : MarketLoader.Str(t[0])) ?? first.Club ?? $"Takım {g.Key}",
                    first.LeagueId, first.League, T("overall"), T("attack"), T("midfield"), T("defense"),
                    Color(T("color1R"), T("color1G"), T("color1B")), Color(T("color2R"), T("color2G"), T("color2B")),
                    g.Count(), ages.Count > 0 ? Math.Round(ages.Average(), 1) : null, g.Sum(p => p.Value ?? 0),
                    best11.Count > 0 ? Math.Round(best11.Average(), 1) : null,
                    top[0].Id, top[0].Name, top[0].Overall, g.Key == data.Snapshot.UserTeamId);
            })
            .OrderByDescending(r => r.Overall ?? 0).ThenBy(r => r.Name, StringComparer.Ordinal)
            .ToList();
        return new TeamsView(data.Snapshot, rows);
    }

    private static string? Color(int? r, int? g, int? b) =>
        r is { } rr && g is { } gg && b is { } bb ? $"#{Math.Clamp(rr, 0, 255):x2}{Math.Clamp(gg, 0, 255):x2}{Math.Clamp(bb, 0, 255):x2}" : null;

    private static List<Standing> Standings(SqliteConnection con, ResolvedSchema s, string snap, int leagueId, int userTeam,
        Func<int?, string?> teamName)
    {
        var sec = s.Map.LeagueTeamLink;
        if (!s.HasTable(sec) || s.Column(sec, "leagueId") is not { } leagueCol) return [];
        using var cmd = con.CreateCommand();
        cmd.CommandText = $"SELECT {string.Join(", ", StandingFields.Select(f => s.Select(sec, f)))} FROM {s.Table(sec)} " +
                          $"WHERE snapshot_id = $snap AND {leagueCol} = $league";
        cmd.Parameters.AddWithValue("$snap", snap);
        cmd.Parameters.AddWithValue("$league", leagueId);
        var rows = new List<Standing>();
        using var r = cmd.ExecuteReader();
        while (r.Read())
        {
            int? V(string f) { var i = Array.IndexOf(StandingFields, f); return MarketLoader.Int(r.IsDBNull(i) ? null : r.GetValue(i)); }
            if (V("teamId") is not { } tid) continue;
            int? Sum(string a, string b) => V(a) is { } x && V(b) is { } y ? x + y : null;
            rows.Add(new Standing(tid, teamName(tid) ?? $"Takım {tid}", V("tablePosition"),
                V("points"), V("played"), Sum("homeWins", "awayWins"), Sum("homeDraws", "awayDraws"),
                Sum("homeLosses", "awayLosses"), Sum("homeGoalsFor", "awayGoalsFor"),
                Sum("homeGoalsAgainst", "awayGoalsAgainst"),
                V("previousPosition"), tid == userTeam));
        }
        return rows.OrderBy(x => x.Position ?? int.MaxValue).ThenBy(x => x.Team, StringComparer.Ordinal).ToList();
    }

    /// <summary>
    /// Tablo sayıları kendi içinde tutarlı mı: oynanan = G+B+M ve puan = 3G+B. Oyun bu tabloyu bellekte güncel
    /// tutmayabiliyor (FC 27'de maç sayısı artarken galibiyet/puan 0 kalan kayıtlar görüldü); tutarsızsa arayüz yalnızca sırayı gösterir.
    /// </summary>
    public static bool TableConsistent(IReadOnlyList<Standing> table) =>
        table.Count > 0 && table.Any(r => r.Played > 0) && table.All(r =>
            r.Played is { } pl && r.Won is { } w && r.Drawn is { } d && r.Lost is { } lo && r.Points is { } pt
            && w + d + lo == pl && pt == 3 * w + d);

    private List<SquadMember> Squad(SqliteConnection con, MarketData data, int team, int? leagueComp = null)
    {
        var s = data.Schema;
        var map = s.Map;
        var snap = data.Snapshot.SnapshotId;
        var link = map.SquadLink;
        var members = new List<(MarketPlayer P, int? Jersey, int? Slot, int? Form, bool Injured)>();
        if (s.HasTable(link) && s.Column(link, "teamId") is { } teamCol && s.Column(link, "playerId") is { } pidCol)
        {
            string[] f = ["jersey", "slot", "form", "injury"];
            using var cmd = con.CreateCommand();
            cmd.CommandText = $"SELECT {pidCol}, {string.Join(", ", f.Select(x => s.Select(link, x)))} FROM {s.Table(link)} " +
                              $"WHERE snapshot_id = $snap AND {teamCol} = $team";
            cmd.Parameters.AddWithValue("$snap", snap);
            cmd.Parameters.AddWithValue("$team", team);
            using var r = cmd.ExecuteReader();
            var seen = new HashSet<int>();
            while (r.Read())
            {
                object? V(int i) => r.IsDBNull(i) ? null : r.GetValue(i);
                if (MarketLoader.Int(V(0)) is not { } pid || !seen.Add(pid) || data.Find(pid) is not { } p) continue;
                members.Add((p, MarketLoader.Int(V(1)), MarketLoader.Int(V(2)), MarketLoader.Int(V(3)), MarketLoader.Int(V(4)) is > 0));
            }
        }
        else
        {
            // Kadro tablosu yoksa: kulübü bu takım olan oyuncular, yerleri bilinmeden.
            members.AddRange(data.Players.Where(p => p.ClubId == team).Select(p => (p, (int?)null, (int?)null, (int?)null, false)));
        }

        var loans = Loans(con, s, snap, data.Snapshot.GameDate);
        var morale = Morale(con, s, snap);
        var fitness = Fitness(con, s, snap, data.Snapshot.GameDate);
        var bench = map.SquadSlots.Bench;
        var reserve = map.SquadSlots.Reserve;
        var starters = members.Where(m => m.Slot is { } sl && sl < bench && sl != reserve).ToList();
        var slots = AssignSlots(con, data, starters.Select(m => (m.P, map.SlotPositions.GetValueOrDefault(
            m.Slot!.Value.ToString(CultureInfo.InvariantCulture)) ?? $"P{m.Slot}")).ToList());

        var season = leagueComp is { } lcomp && SaveSeason(con, data, team, lcomp) is { Count: > 0 } saved
            ? saved : SeasonRatings(con, data, members.Select(m => m.P.Id).ToHashSet());
        var result = members.Select(m =>
        {
            var role = m.Slot is null ? SquadRole.Unknown
                : m.Slot < bench && m.Slot != reserve ? SquadRole.XI
                : m.Slot == bench ? SquadRole.Sub : SquadRole.Reserve;
            var slot = slots.GetValueOrDefault(m.P.Id);
            loans.TryGetValue(m.P.Id, out var loan);
            var loanedIn = loan.From is { } from && from != team;
            var has = season.TryGetValue(m.P.Id, out var st);
            var fit = fitness?.GetValueOrDefault(m.P.Id) ?? (fitness is null ? null : PlayerFitness.Full);
            return new SquadMember(m.P, m.Jersey, role, slot.Label, slot.Rating, m.Form, m.Injured || fit?.Injured == true,
                loanedIn ? loan.From : null, loanedIn ? loan.End : null,
                has ? st.Apps : null, has ? st.Minutes : null, has ? st.Rating : null, morale.GetValueOrDefault(m.P.Id), fit);
        }).ToList();

        // Kulübün başka takımlara kiraladığı oyuncular (kadro listesinde değiller).
        var inSquad = result.Select(m => m.Player.Id).ToHashSet();
        foreach (var (pid, loan) in loans.Where(kv => kv.Value.From == team && !inSquad.Contains(kv.Key)))
            if (data.Find(pid) is { } p)
                result.Add(new SquadMember(p, null, SquadRole.LoanedOut, null, null, null, false, null, loan.End));

        return result
            .OrderBy(m => m.Role)
            .ThenBy(m => GroupOrder(map, m.Player.PositionGroup))
            .ThenByDescending(m => m.Player.Overall ?? 0)
            .ToList();
    }

    /// <summary>Kullanıcı kulübünün bütçesi ve son finans hareketleri (kariyer kaydından, EUR).</summary>
    private static ClubFinance? Finance(SqliteConnection con, ResolvedSchema s, string snap, IReadOnlyList<SnapshotRow> lineage)
    {
        var map = s.Map;
        if (!s.HasTable(map.CareerFinance)) return null;
        var source = CareerBlocks.SourceSnapshot(con, s, snap);
        string[] f = ["transferBudgetStart", "transferBudget", "wageBudget", "wageBudgetLeft", "wageHeadroom"];
        using var cmd = con.CreateCommand();
        cmd.CommandText = $"SELECT {string.Join(", ", f.Select(x => s.Select(map.CareerFinance, x)))} FROM {s.Table(map.CareerFinance)} " +
                          "WHERE snapshot_id = $snap LIMIT 1";
        cmd.Parameters.AddWithValue("$snap", source);
        using var r = cmd.ExecuteReader();
        if (!r.Read()) return null;
        long? V(int i) => r.IsDBNull(i) ? null : Convert.ToInt64(r.GetValue(i), CultureInfo.InvariantCulture);
        var txs = new List<FinanceTransaction>();
        if (s.HasTable(map.CareerTransaction))
            foreach (var (_, t) in MarketLoader.Keyed(con, s, map.CareerTransaction, source, "index", ["amount", "kind", "date", "income"]))
            {
                if (MarketLoader.Int(t[2]) is not { } ymd || !DateOnly.TryParseExact(ymd.ToString(CultureInfo.InvariantCulture), "yyyyMMdd",
                        CultureInfo.InvariantCulture, DateTimeStyles.None, out var date)) continue;
                var kind = MarketLoader.Int(t[1]);
                var income = MarketLoader.Int(t[3]) is > 0;
                var amount = MarketLoader.Int(t[0]) ?? 0;
                txs.Add(new FinanceTransaction(date, kind, kind is { } k ? map.TransactionKinds.GetValueOrDefault(k.ToString(CultureInfo.InvariantCulture)) : null,
                    income ? amount : -amount));
            }
        var categoryRows = MarketLoader.Keyed(con, s, map.CareerFinanceCategory, source, "kind", ["income", "expense"]);
        // Blok sürümü yenilenmeden oluşturulmuş günlük snapshot'ta yeni tablo olmayabilir. Yalnız aynı gün/dalın
        // gerçek kaydı kullanılabilir; başka günün sezon toplamı güncelmiş gibi taşınmaz.
        if (categoryRows.Count == 0 && lineage.Count > 0)
            foreach (var candidate in lineage.Where(x => x.Date == lineage[^1].Date).Reverse())
            {
                categoryRows = MarketLoader.Keyed(con, s, map.CareerFinanceCategory, candidate.SnapshotId, "kind", ["income", "expense"]);
                if (categoryRows.Count > 0) break;
            }
        return new ClubFinance(V(0), V(1), V(2), V(3), V(4),
            txs.OrderByDescending(t => t.Date).ThenByDescending(t => Math.Abs(t.Amount)).ToList(),
            categoryRows
                .Select(kv => new FinanceCategory(kv.Key, map.TransactionKinds.GetValueOrDefault(kv.Key.ToString(CultureInfo.InvariantCulture)),
                    MarketLoader.Long(kv.Value[0]) ?? 0, MarketLoader.Long(kv.Value[1]) ?? 0)).OrderBy(c => c.Kind).ToList());
    }

    /// <summary>
    /// Kondisyon ve sakatlık (kariyer kaydı, tüm oyuncular). Blokta yalnız kondisyonu tam olmayan ya da sakat oyuncular var;
    /// blok varken listede olmayan oyuncu tam kondisyonda (CMTracker'ın kadro ortalamasıyla birebir). Blok yoksa null.
    /// Sakat: beklenen dönüş tarihi bugünden sonra.
    /// </summary>
    private static Dictionary<int, PlayerFitness>? Fitness(SqliteConnection con, ResolvedSchema s, string snap, DateOnly today)
    {
        var sec = s.Map.CareerFitness;
        if (!s.HasTable(sec)) return null;
        var rows = MarketLoader.Keyed(con, s, sec, CareerBlocks.SourceSnapshot(con, s, snap), "playerId",
            ["fitness", "severity", "phase", "returnDate", "daysToFit", "injuryType"]);
        if (rows.Count == 0) return null;
        return rows.Where(kv => MarketLoader.Int(kv.Value[0]) is not null).ToDictionary(kv => kv.Key, kv =>
        {
            int? V(int i) => MarketLoader.Int(kv.Value[i]);
            DateOnly? back = V(3) is { } ymd && DateOnly.TryParseExact(ymd.ToString(CultureInfo.InvariantCulture), "yyyyMMdd",
                CultureInfo.InvariantCulture, DateTimeStyles.None, out var d) ? d : null;
            var injured = back is { } b && b > today;
            return new PlayerFitness(V(0)!.Value, injured, injured ? V(1) : null, injured ? V(2) : null, injured ? back : null,
                V(4) is > 0 ? V(4) : null, injured ? V(5) : null);
        });
    }

    /// <summary>Kullanıcı takımının oyuncu morali (kariyer kaydından; yalnız LE export'u varsa son kaydın bloğu).</summary>
    private static Dictionary<int, PlayerMorale> Morale(SqliteConnection con, ResolvedSchema s, string snap)
    {
        var sec = s.Map.CareerMorale;
        if (!s.HasTable(sec)) return [];
        var rows = MarketLoader.Keyed(con, s, sec, CareerBlocks.SourceSnapshot(con, s, snap), "playerId",
            ["morale", "temperament", "teamPerformance", "playerPerformance", "contract", "playingTime", "events"]);
        return rows.Where(kv => MarketLoader.Int(kv.Value[0]) is not null).ToDictionary(kv => kv.Key, kv =>
        {
            int? V(int i) => MarketLoader.Int(kv.Value[i]);
            var events = MarketLoader.Str(kv.Value[6])?.Split(',', StringSplitOptions.RemoveEmptyEntries) ?? [];
            return new PlayerMorale(V(0)!.Value, V(1), V(2), V(3), V(4), V(5), events);
        });
    }

    private static int GroupOrder(FieldMap map, string? group)
    {
        var i = group is null ? -1 : map.PositionGroups.Keys.ToList().IndexOf(group);
        return i < 0 ? int.MaxValue : i;
    }

    /// <summary>
    /// Süren kiralıklar: oyuncu → (sahibi kulüp, bitiş). FC 27'de playerloans bayat kalabiliyor (bitişi oyun tarihinden
    /// önce olan satırlar); bitişi geçmiş ya da bilinmeyen kiralık sayılmaz.
    /// </summary>
    public static Dictionary<int, (int? From, string? End)> Loans(SqliteConnection con, ResolvedSchema s, string snap, DateOnly gameDate)
    {
        var result = new Dictionary<int, (int?, string?)>();
        foreach (var (pid, v) in MarketLoader.Keyed(con, s, s.Map.Loan, snap, "playerId", ["fromTeamId", "endDate"]))
        {
            if (MarketLoader.Int(v[1]) is not { } days || days <= 0) continue;
            var end = s.Map.Epoch.AddDays(days);
            if (end < gameDate) continue;
            result[pid] = (MarketLoader.Int(v[0]), end.ToString("yyyy-MM-dd", CultureInfo.InvariantCulture));
        }
        return result;
    }

    /// <summary>
    /// İlk 11'in diziliş yerleri. Oyun ilk 11'i ve dizilişin pozisyon kodlarını tutuyor ama oyuncuyu hangi koda
    /// yerleştirdiği kayıtta güvenilir değil (sol kanat stoper yerinde görünebiliyor). Oyuncuları kodlara, pozisyon
    /// genellerinin toplamı en büyük olacak şekilde dağıtırız (açgözlü atama + ikili değişimle iyileştirme).
    /// </summary>
    private Dictionary<int, (string? Label, int? Rating)> AssignSlots(SqliteConnection con, MarketData data,
        List<(MarketPlayer P, string Slot)> starters)
    {
        var result = new Dictionary<int, (string?, int?)>();
        if (starters.Count == 0) return result;
        var cfg = positionRatings.Current;
        var attrs = market.Attributes(con, data, starters.Select(x => x.P.Id).ToList());
        var slots = starters.Select(x => x.Slot).ToList();
        var players = starters.Select(x => x.P).ToList();

        var score = new int[players.Count, slots.Count];
        for (var i = 0; i < players.Count; i++)
        {
            var p = players[i];
            var ratings = PositionRatings.Compute(cfg, attrs.GetValueOrDefault(p.Id) ?? new Dictionary<string, int?>(),
                p.Position, p.Overall).ToDictionary(r => r.Position, r => r.Rating);
            for (var j = 0; j < slots.Count; j++)
            {
                var basePos = BasePosition(cfg, slots[j]);
                score[i, j] = basePos is not null && ratings.GetValueOrDefault(basePos) is { } rating ? rating
                    : basePos == p.Position && p.Overall is { } o ? o
                    : (p.Overall ?? 40) - 25;
                // Puanlar yakınsa oyuncunun kendi mevkisi öne geçsin (CAM oyuncusu kanatta değil CAM'de).
                if (basePos is not null && basePos == p.Position) score[i, j] += NaturalBonus;
                else if (basePos is not null && basePos == p.Position2) score[i, j] += NaturalBonus / 2;
            }
        }

        // Açgözlü: en yüksek puanlı (oyuncu, yer) çiftlerinden başla.
        var assign = new int[players.Count];
        Array.Fill(assign, -1);
        var used = new bool[slots.Count];
        foreach (var (i, j) in Enumerable.Range(0, players.Count)
                     .SelectMany(i => Enumerable.Range(0, slots.Count).Select(j => (i, j)))
                     .OrderByDescending(x => score[x.i, x.j]))
        {
            if (assign[i] >= 0 || used[j]) continue;
            assign[i] = j;
            used[j] = true;
        }

        // İkili değişim: toplamı artıran takas kalmayana kadar.
        for (var improved = true; improved;)
        {
            improved = false;
            for (var a = 0; a < players.Count; a++)
            for (var b = a + 1; b < players.Count; b++)
            {
                int ja = assign[a], jb = assign[b];
                if (score[a, jb] + score[b, ja] > score[a, ja] + score[b, jb])
                {
                    (assign[a], assign[b]) = (jb, ja);
                    improved = true;
                }
            }
        }

        for (var i = 0; i < players.Count; i++)
        {
            var j = assign[i];
            var bonus = BasePosition(cfg, slots[j]) is { } bp && (bp == players[i].Position || bp == players[i].Position2)
                ? (bp == players[i].Position ? NaturalBonus : NaturalBonus / 2) : 0;
            result[players[i].Id] = (slots[j], score[i, j] - bonus);
        }
        return result;
    }

    /// <summary>Yer kodunun pozisyon ağırlığı: RCB → CB, LDM → CDM, RS → ST, RAM → CAM; config'te varsa olduğu gibi.</summary>
    public static string? BasePosition(PositionRatingConfig cfg, string slot)
    {
        if (cfg.Positions.ContainsKey(slot)) return slot;
        if (slot.Length > 1 && (slot[0] == 'R' || slot[0] == 'L'))
        {
            var rest = slot[1..];
            if (cfg.Positions.ContainsKey(rest)) return rest;
            var alias = rest switch { "DM" => "CDM", "AM" => "CAM", "S" => "ST", "CM" => "CM", _ => null };
            if (alias is not null && cfg.Positions.ContainsKey(alias)) return alias;
        }
        return slot == "SW" && cfg.Positions.ContainsKey("CB") ? "CB" : null;
    }
}

/// <param name="BestXi">En yüksek OVR'lı 11 oyuncunun ortalaması.</param>
public sealed record TeamRow(int Id, string Name, int? LeagueId, string? League, int? Overall, int? Attack, int? Midfield,
    int? Defense, string? Color1, string? Color2, int Players, double? AverageAge, long SquadValue, double? BestXi,
    int BestPlayerId, string BestPlayer, int? BestPlayerOverall, bool IsUser);

public sealed record TeamsView(SnapshotInfo Snapshot, IReadOnlyList<TeamRow> Teams);

/// <summary>Kadro rolü. Sıralama değeri ekrandaki sırayı belirler.</summary>
public enum SquadRole { XI, Sub, Reserve, Unknown, LoanedOut }

public sealed record ClubInfo(int Id, string Name, int? LeagueId, string? League, int? Overall, int? Attack, int? Midfield,
    int? Defense, long? ClubWorth, int? BuildUpPlay, int? DefensiveDepth, int? DomesticPrestige, int? InternationalPrestige,
    int? StadiumCapacity, int? FoundationYear, int? LeagueTitles, int? DomesticCups, int? ClWins, int? ElWins, int? EclWins,
    int? RivalTeamId, string? RivalTeam, int? YouthDevelopment, string? Color1, string? Color2, int? Popularity = null,
    string? BuildUpPlayLabel = null);

/// <param name="CompetitionId">Kupa görseli için lig kimliği ya da yarışma kodu (trophies/<id>.png); bilinmiyorsa null.</param>
public sealed record TrophyWon(string Trophy, int Count, int? CompetitionId = null);

/// <param name="Snapshots">Dalın gördüğü snapshot sayısı.</param>
/// <param name="SeasonsTracked">İzlenen sezon sayısı (snapshot tarihleri ya da daha uzunsa kayıttaki sezon arşivi).</param>
/// <param name="PreviousSnapshotDate">Bir önceki snapshot'ın oyun tarihi ("son yüklemeden beri").</param>
/// <param name="TrophiesSource">"archive": kayıttaki sezon arşivi (güvenilir); "counters": kulüp sayaçlarındaki artış (kariyerde
/// güncellenmediği görüldü; boş liste "kupa yok" anlamına gelmez).</param>
public sealed record CareerSpan(int Snapshots, DateOnly FirstGameDate, int SeasonsTracked, IReadOnlyList<TrophyWon> TrophiesWon,
    DateOnly? PreviousSnapshotDate, string TrophiesSource = "counters");

/// <param name="Promoted">true: üst lige çıktı; false: düştü.</param>
public sealed record LeagueMove(int TeamId, string Team, int LeagueId, string? League, int FromLeagueId, string? FromLeague, bool Promoted);

public sealed record LeagueLeader(int LeagueId, string? League, int TeamId, string? Team);

/// <param name="LeadersFromLastSeason">Lig tablosu bayatsa liderler geçen sezonun şampiyonlarıdır.</param>
public sealed record WorldInfo(IReadOnlyList<LeagueMove> Moves, IReadOnlyList<LeagueLeader> Leaders, bool LeadersFromLastSeason = false);

/// <param name="Position">Lig sırası (1 tabanlı, oyunun currenttableposition alanı).</param>
public sealed record Standing(int TeamId, string Team, int? Position, int? Points, int? Played, int? Won, int? Drawn,
    int? Lost, int? GoalsFor, int? GoalsAgainst, int? PreviousPosition, bool IsUser);

/// <param name="Slot">İlk 11'de diziliş yeri (RCB, LDM ...); <see cref="ClubService"/> atamasıyla.</param>
/// <param name="SlotRating">Oyuncunun o yerdeki hesaplanan geneli.</param>
/// <param name="Form">Oyunun form değeri (squadLink.form); ölçeği DOĞRULANACAK.</param>
/// <param name="LoanFromTeamId">Kiralık gelmişse sahibi olan kulüp.</param>
/// <param name="LoanEnd">Kiralık bitiş tarihi (gelen ya da giden).</param>
/// <param name="Appearances">Bu sezonki maç sayısı (matchRating); kayıt yoksa null.</param>
/// <param name="Morale">Kariyer kaydındaki moral (yalnız kullanıcı takımı); yoksa null.</param>
public sealed record SquadMember(MarketPlayer Player, int? Jersey, SquadRole Role, string? Slot, int? SlotRating, int? Form,
    bool Injured, int? LoanFromTeamId, string? LoanEnd, int? Appearances = null, int? Minutes = null, double? AverageRating = null,
    PlayerMorale? Morale = null, PlayerFitness? Fitness = null);

/// <summary>
/// Kondisyon (0–100) ve sakatlık (kariyer kaydı). Severity 3 = ağır, Phase 3 = fizyoterapi (Fenerbahçe 17.07.2030'da
/// CMTracker'la); diğer kodlar DOĞRULANACAK. DaysToFit: tam kondisyona kalan antrenman günü.
/// </summary>
public sealed record PlayerFitness(int Value, bool Injured, int? Severity, int? Phase, DateOnly? ExpectedReturn, int? DaysToFit,
    int? InjuryType)
{
    public static readonly PlayerFitness Full = new(100, false, null, null, null, null, null);
}

/// <summary>
/// Oyuncu morali ve oyunun hesapladığı bileşenler (0–100). Temperament: 0 çok sakin, 1 sakin, 2 normal, 3 asabi, 4 çok asabi.
/// Events: oyunun etkin moral olayları ("CM_Morale_Update_PlaytimeUnhappy" gibi).
/// </summary>
public sealed record PlayerMorale(int Value, int? Temperament, int? TeamPerformance, int? PlayerPerformance, int? Contract,
    int? PlayingTime, IReadOnlyList<string> Events);

/// <param name="HomeGoals">Oynanmış maçın skoru (yalnız kariyer kaydından; LE fikstüründe yok).</param>
public sealed record FixtureRow(int? Id, DateOnly Date, string? Time, int? HomeTeamId, string? HomeTeam, int? AwayTeamId,
    string? AwayTeam, int? CompetitionId, bool IsHome, int? HomeLeaguePosition, int? AwayLeaguePosition,
    int? HomeGoals = null, int? AwayGoals = null, string? Competition = null, int? Round = null);

/// <param name="PotentialVariance">Akademi potansiyel aralığı (gözlemci belirsizliği).</param>
public sealed record AcademyPlayer(MarketPlayer Player, int? Tier, int? PotentialVariance, int? MonthsInSquad);

public sealed record ScoutInfo(int Id, string Name, int? Experience, int? Knowledge, string? Nation, string? NationCode, int? Region,
    int? NationId = null);

/// <param name="Role">captain, penalties, freeKicks (sol = sağ) | leftFreeKick/rightFreeKick, corners | leftCorner/rightCorner,
/// longFreeKick, throwInLeft, throwInRight, cornerSupport (birden çok satır)</param>
public sealed record SetPiece(string Role, int PlayerId, string Name, int? Overall);

/// <param name="Wages">Maaş bilinen oyuncuların toplamı; hiçbiri bilinmiyorsa null.</param>
/// <param name="ExpiringThisSeason">Sözleşmesi bu sezon sonunda biten oyuncu sayısı.</param>
public sealed record SquadSummary(int Players, double? AverageAge, long SquadValue, long? Wages, double? BestXiAverage,
    int ExpiringThisSeason);

/// <param name="TableConsistent">Puan durumu sayıları tutarlı mı (değilse yalnızca sıra gösterilir).</param>
/// <param name="Fixtures">Kayıtlı tüm takım fikstürü (fixtures tablosu varsa).</param>
/// <param name="TableStale">Lig tablosu oyunda güncellenmiyor: sıra/puan boş, satırlar geçen sezon sırasına göre.</param>
public sealed record ClubView(SnapshotInfo Snapshot, ClubInfo Club, Standing? Standing, IReadOnlyList<Standing> Table,
    bool TableConsistent, IReadOnlyList<SquadMember> Squad, IReadOnlyList<SetPiece> SetPieces, SquadSummary Summary,
    IReadOnlyList<FixtureRow> Fixtures, IReadOnlyList<AcademyPlayer> Academy, IReadOnlyList<ScoutInfo> Scouts,
    CareerSpan Career, WorldInfo World, bool TableStale = false, CareerRecords? Records = null, ClubFinance? Finance = null,
    SeasonRecordView? SeasonRecord = null, IReadOnlyList<ObservedSeason>? ObservedSeasons = null, ManagerCareerView? ManagerCareer = null,
    ScoutNetworkView? ScoutNetwork = null, PreseasonView? Preseason = null, IReadOnlyList<BoardObjective>? Objectives = null,
    ManagerInfo? Manager = null, IReadOnlyList<DisciplineRow>? Discipline = null, int? LeagueCompetitionId = null);

/// <param name="Ban">Kalan ceza maçı; Yellows biriken sarı kart; CompetitionKey kayıttaki ham yarışma kodu (anlamı DOĞRULANACAK).</param>
public sealed record DisciplineRow(int PlayerId, string Name, int Yellows, int Ban, int CompetitionKey);

/// <param name="Kind">0 lig, 1 yerel kupa, 2 kıtasal.</param>
/// <param name="Target">Hedef basamak (0–17, 17 = kazan); Stretch üst hedef, Minimum asgari (yoksa null).</param>
public sealed record BoardObjective(int CompetitionId, string? Competition, int Kind, int? Target, int? Stretch, int? Minimum);
/// <param name="Wage">Haftalık menajer maaşı (EUR); Earnings kariyer boyunca kazanılan.</param>
/// <param name="Difficulty">0 Başlangıç … 6 Ultimate; HalfLength dakika.</param>
public sealed record ManagerInfo(long? Wage, long? Earnings, int? Season, int? Difficulty, int? HalfLength, RecordMatch? BiggestWin,
    RecordMatch? BiggestLoss);

/// <param name="NewScoutsDate">İşe alınabilir gözlemci listesinin yenileneceği oyun tarihi.</param>
public sealed record ScoutNetworkView(DateOnly? NewScoutsDate, IReadOnlyList<NetworkScout> Hired, IReadOnlyList<NetworkScout> Available);
/// <param name="CoverNationId">İşe alınmış gözlemcinin kapsadığı ülke (işe alınabilirlerde null).</param>
public sealed record NetworkScout(string Name, int? CoverNationId, string? CoverNation, string? CoverCode, int? NationId,
    string? Nation, string? NationCode, int? Experience, int? Judgement);
public sealed record PreseasonView(DateOnly? ConfirmedDate, IReadOnlyList<PreseasonInvite> Invites);
/// <param name="Key">Oyunun turnuva anahtarı (cm_pst_*); ad arayüzde eşlenir. Prize EUR.</param>
public sealed record PreseasonInvite(int CompetitionId, string Key, bool Entered, long Prize, IReadOnlyList<string> Teams);

public sealed record ManagerCareerView(string SnapshotId, DateOnly AsOf, IReadOnlyList<ManagerSeason> Seasons,
    int Played, int Won, int Drawn, int Lost, int GoalsFor, int GoalsAgainst);
public sealed record ManagerSeason(int Index, int SeasonEndYear, int? TeamId, string? Team, int? LeagueId, int? Position,
    string? Objective, string? ObjectiveStatus, int Played, int Won, int Drawn, int Lost, int GoalsFor, int GoalsAgainst,
    int? Points, int? JobSecurity, string? BiggestBuy, string? BiggestSale, bool Completed, int? LeagueTitles = null,
    int? DomesticCups = null, int? ContinentalCups = null, long? BiggestBuyFee = null, long? BiggestSaleFee = null);

/// <summary>Snapshot tarihine kadar gözlenen maçlar; sezon sonu veya toplam menajer karnesi olduğu varsayılmaz.</summary>
public sealed record ObservedSeason(int SeasonEndYear, DateOnly AsOf, string SnapshotId, int TeamId, SeasonRecordView Record);

/// <summary>Bu sezonun maç karnesi (tüm yarışmalar, hazırlık dahil) ve en farklı galibiyet/mağlubiyet.</summary>
public sealed record SeasonRecordView(int Played, int Won, int Drawn, int Lost, int GoalsFor, int GoalsAgainst,
    RecordMatch? BiggestWin, RecordMatch? BiggestLoss);

public sealed record RecordMatch(DateOnly Date, int? OpponentId, string? Opponent, int For, int Against, string? Competition);

/// <summary>
/// Kulüp bütçesi (kariyer kaydı, EUR). TransferBudgetStart sezon başı, TransferBudget kalan; WageBudget sezonluk maaş bütçesi,
/// WageBudgetLeft kalan (her hafta maaş kadar azalır), WageHeadroom haftalık maaş boşluğu. Transactions oyunun son hareketleri.
/// </summary>
public sealed record ClubFinance(long? TransferBudgetStart, long? TransferBudget, long? WageBudget, long? WageBudgetLeft,
    long? WageHeadroom, IReadOnlyList<FinanceTransaction> Transactions, IReadOnlyList<FinanceCategory>? Categories = null);

public sealed record FinanceCategory(int Kind, string? Label, long Income, long Expense);

/// <param name="Amount">Gelir artı, gider eksi (EUR).</param>
/// <param name="Label">Tür adı (field-map transactionKinds); bilinmiyorsa null.</param>
public sealed record FinanceTransaction(DateOnly Date, int? Kind, string? Label, long Amount);
