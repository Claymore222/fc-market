using FcMarket.Api.Data;
using FcMarket.Api.Domain;
using FcMarket.Api.FieldMaps;
using FcMarket.Api.Market;
using Microsoft.Data.Sqlite;
using Microsoft.Extensions.Logging.Abstractions;

namespace FcMarket.Tests;

/// <summary>
/// Kulüp görünümü: kadro rolleri (ilk 11 / yedek / rezerv / kiralık), diziliş ataması, duran toplar, lig tablosu.
/// Oyundaki gibi ilk 11 oyuncuları diziliş kodlarına karışık bağlı (sol bek CAM kodunda vb.).
/// </summary>
public sealed class ClubTests : IDisposable
{
    private readonly string _dbPath = Path.Combine(Path.GetTempPath(), $"fcmarket-club-{Guid.NewGuid():N}.db");
    private readonly string _facesDir = Path.Combine(Path.GetTempPath(), $"fcmarket-faces-{Guid.NewGuid():N}");
    private readonly ClubService _club;
    private readonly MarketService _market;

    // playerid, ana pozisyon kodu, OVR, oyundaki kadro yeri (28 yedek, 29 rezerv)
    private static readonly (int Id, int Pos, int Ovr, int Slot)[] Squad =
    [
        (1, 0, 80, 25), (2, 3, 75, 0), (3, 5, 78, 18), (4, 5, 77, 3), (5, 7, 74, 4), (6, 10, 79, 12),
        (7, 10, 76, 6), (8, 12, 75, 7), (9, 18, 82, 9), (10, 16, 74, 11), (11, 25, 83, 16),
        (12, 0, 70, 28), (13, 25, 72, 28), (14, 14, 65, 29),
    ];

    public ClubTests()
    {
        using (var con = new SqliteConnection($"Data Source={_dbPath}"))
        {
            con.Open();
            var sql = new System.Text.StringBuilder("""
                CREATE TABLE snapshots (snapshot_id TEXT PRIMARY KEY, save_uid TEXT, game_date TEXT, exported_at TEXT,
                    reason TEXT, user_teamid INTEGER, user_team_name TEXT, transfer_budget INTEGER, wage_budget INTEGER,
                    exporter_version TEXT, files TEXT, imported_at TEXT);
                INSERT INTO snapshots (snapshot_id, save_uid, game_date, exported_at, user_teamid, user_team_name)
                VALUES ('S', 'SAVE', '2026-11-01', '2026-10-20T10:00:00Z', 1, 'Ev FK');
                CREATE TABLE raw_career_teamofweek (snapshot_id TEXT NOT NULL, artificialkey, matchrating, month, playerid, weekswon);
                INSERT INTO raw_career_teamofweek VALUES ('S', 0, 84, 9, 15, 2);
                CREATE TABLE raw_career_playerawards (snapshot_id TEXT NOT NULL, artificialkey, count, playerid, season, teamid, typeid);
                INSERT INTO raw_career_playerawards VALUES ('S', 0, 1, 15, 2, 1, 4), ('S', 1, 2, 16, 3, 1, 0);
                CREATE TABLE raw_career_managerawards (snapshot_id TEXT NOT NULL, artificialkey, count, receiveddate, season, teamid, typeid);
                INSERT INTO raw_career_managerawards VALUES ('S', 0, 4, 162337, 1, 1, 0);
                CREATE TABLE raw_prevcompetitionstats (snapshot_id TEXT NOT NULL, playerid, teamid, competitionid, appearances, goals,
                    assists, yellowcards, redcards, cleansheets);
                INSERT INTO raw_prevcompetitionstats VALUES ('S', 15, 1, 68, 20, 6, 4, 3, 0, 0), ('S', 15, 1, 7, 3, 1, 0, 1, 1, 0);
                CREATE TABLE raw_players (snapshot_id TEXT NOT NULL, playerid, overallrating, potential, preferredposition1,
                    contractvaliduntil, wage, role1, role2, role3, trait1, trait2, icontrait1, icontrait2,
                    bodytypecode, emotion, growthprofile, isretiring, height, agility, strength, acceleration, sprintspeed);
                CREATE TABLE raw_player_names (snapshot_id TEXT NOT NULL, playerid, name, club_teamid);
                CREATE TABLE raw_teams (snapshot_id TEXT NOT NULL, teamid, teamname, overallrating, captainid, penaltytakerid,
                    teamcolor1r, teamcolor1g, teamcolor1b, rivalteam, leftcornerkicktakerid, rightcornerkicktakerid,
                    leftfreekicktakerid, rightfreekicktakerid, throwerleft, cksupport1, cksupport2, buildupplay);
                CREATE TABLE raw_leagues (snapshot_id TEXT NOT NULL, leagueid, leaguename, level, countryid);
                CREATE TABLE raw_leagueteamlinks (snapshot_id TEXT NOT NULL, leagueid, teamid, currenttableposition, points,
                    nummatchesplayed, homewins, awaywins, homedraws, awaydraws, homelosses, awaylosses, homegf, awaygf, homega, awayga, prevleagueid);
                CREATE TABLE raw_teamplayerlinks (snapshot_id TEXT NOT NULL, playerid, teamid, jerseynumber, position, form, injury);
                CREATE TABLE raw_playerloans (snapshot_id TEXT NOT NULL, playerid, teamidloanedfrom, loandateend);
                -- oyun tarihi 2026-11-01 = 1582-10-14 + 162186 gün
                CREATE TABLE raw_fixtures (snapshot_id TEXT NOT NULL, fixtureid, fixturedate, fixturetime, hometeamid, awayteamid,
                    competitionid, hometeamleaguepos, awayteamleaguepos);
                INSERT INTO raw_fixtures VALUES ('S', 1, 162176, 68400, 1, 2, 68, 2, 1), ('S', 2, 162203, 57600, 2, 1, 68, 1, 2),
                    ('S', 3, 162206, 72000, 3, 4, 68, 5, 6), ('S', 4, 161900, 72000, 1, 2, 68, 1, 1);
                CREATE TABLE raw_career_playermatchratinghistory (snapshot_id TEXT NOT NULL, artificialkey, date, minsplayed, playerid, position, rating);
                INSERT INTO raw_career_playermatchratinghistory VALUES ('S', 1, 20260810, 90, 9, 18, 75), ('S', 2, 20260817, 80, 9, 18, 65),
                    ('S', 3, 20260301, 90, 9, 18, 99);
                CREATE TABLE raw_career_youthplayers (snapshot_id TEXT NOT NULL, playerid, playertier, potentialvariance, monthsinsquad);
                INSERT INTO raw_career_youthplayers VALUES ('S', 14, 2, 5, 3);
                CREATE TABLE raw_career_scouts (snapshot_id TEXT NOT NULL, scoutid, firstname, lastname, experience, knowledge, nationality, regionid);
                INSERT INTO raw_career_scouts VALUES ('S', 1, 'Ali', 'Göz', 3, 4, 48, 2);
                INSERT INTO raw_teams VALUES ('S', 1, 'Ev FK', 78, 9, 11, 255, 210, 0, 2, 6, 6, 8, 10, 5, 3, 3, 2),
                    ('S', 2, 'Rakip SK', 75, NULL, NULL, 0, 0, 0, 1, NULL, NULL, NULL, NULL, NULL, NULL, NULL, 7);
                INSERT INTO raw_leagues VALUES ('S', 68, 'Test Ligi', 1, 48), ('S', 69, 'Test 1. Lig', 2, 48), ('S', 13, 'Başka Ülke', 1, 14);
                INSERT INTO raw_leagueteamlinks VALUES ('S', 68, 1, 2, 4, 3, 1, 0, 0, 1, 0, 1, 2, 1, 1, 2, 68),
                    ('S', 68, 2, 1, 7, 3, 1, 1, 1, 0, 0, 0, 3, 2, 1, 0, 69),
                    ('S', 13, 5, 1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 14), ('S', 13, 6, 1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 13);
                -- 15: kiralık gelen (sahibi takım 2), 16: takım 2'ye kiralanmış oyuncumuz
                INSERT INTO raw_players VALUES ('S', 15, 68, 80, 14, 2027, 900, 133, 26, 7, 5243476, 16, 2097153, 0, 2, 1, 5, 0, 174, 89, 64, 95, 89),
                    ('S', 16, 66, 79, 25, 2030, 500, 0, 0, 0, 0, 0, 0, 0, 333, 9, 2, 1, 192, 55, 89, 78, 81);
                INSERT INTO raw_player_names VALUES ('S', 15, 'Kiralık Gelen', 1), ('S', 16, 'Kiralık Giden', 2);
                INSERT INTO raw_teamplayerlinks VALUES ('S', 15, 1, 30, 29, 3, 0), ('S', 16, 2, 40, 28, 3, 0);
                -- 14: bitişi oyun tarihinden önce (bayat playerloans satırı), kiralık sayılmamalı
                INSERT INTO raw_playerloans VALUES ('S', 15, 2, 163283), ('S', 16, 1, 163283), ('S', 14, 2, 160000);
                """);
            foreach (var (id, pos, ovr, slot) in Squad)
                sql.Append($"""
                    INSERT INTO raw_players VALUES ('S', {id}, {ovr}, {ovr + 5}, {pos}, {(id == 4 ? 2027 : 2029)}, 1000, 0, 0, 0, 0, 0, 0, 0, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL);
                    INSERT INTO raw_player_names VALUES ('S', {id}, 'Oyuncu {id}', 1);
                    INSERT INTO raw_teamplayerlinks VALUES ('S', {id}, 1, {id}, {slot}, 3, {(id == 13 ? 1 : 0)});
                    """);
            using var cmd = con.CreateCommand();
            cmd.CommandText = sql.ToString();
            cmd.ExecuteNonQuery();
        }
        SqliteConnection.ClearAllPools();

        (_market, _club) = Services();
    }

    private (MarketService, ClubService) Services()
    {
        var fieldMapPath = Path.Combine(TestConfig.RepoRoot, "config", "field-map.json");
        var loader = new MarketLoader(new Valuator(TestConfig.Valuation), new OpportunityScorer(TestConfig.Opportunity),
            TestConfig.Season, TestConfig.Market);
        var db = new CareerDb(_dbPath);
        var market = new MarketService(db, new FieldMapProvider(fieldMapPath, NullLogger<FieldMapProvider>.Instance),
            loader, TestConfig.Market, TestConfig.PositionRatingsFile, new FaceStore(_facesDir), NullLogger<MarketService>.Instance);
        return (market, new ClubService(db, market, TestConfig.PositionRatingsFile));
    }

    public void Dispose()
    {
        SqliteConnection.ClearAllPools();
        foreach (var f in new[] { _dbPath, _dbPath + "-wal", _dbPath + "-shm" })
            if (File.Exists(f)) File.Delete(f);
        if (Directory.Exists(_facesDir)) Directory.Delete(_facesDir, recursive: true);
    }

    [Fact]
    public void Starting_eleven_is_placed_on_natural_slots()
    {
        var xi = _club.Get(null, null).Squad.Where(m => m.Role == SquadRole.XI).ToDictionary(m => m.Player.Id, m => m.Slot);
        Assert.Equal(11, xi.Count);
        Assert.Equal("GK", xi[1]);
        Assert.Equal("RB", xi[2]);
        Assert.Equal(["LCB", "RCB"], new[] { xi[3], xi[4] }.Order());
        Assert.Equal("LB", xi[5]);
        Assert.Equal(["LDM", "RDM"], new[] { xi[6], xi[7] }.Order());
        Assert.Equal("RM", xi[8]);
        Assert.Equal("CAM", xi[9]);
        Assert.Equal("LM", xi[10]);
        Assert.Equal("ST", xi[11]);
    }

    [Fact]
    public void Squad_roles_loans_and_summary()
    {
        var view = _club.Get(null, null);
        var role = view.Squad.ToDictionary(m => m.Player.Id, m => m.Role);
        Assert.Equal(SquadRole.Sub, role[12]);
        Assert.Equal(SquadRole.Sub, role[13]);
        Assert.Equal(SquadRole.Reserve, role[14]);
        Assert.Equal(SquadRole.Reserve, role[15]);
        Assert.Equal(SquadRole.LoanedOut, role[16]);
        Assert.Equal(2, view.Squad.Single(m => m.Player.Id == 15).LoanFromTeamId);
        Assert.Null(view.Squad.Single(m => m.Player.Id == 16).LoanFromTeamId);
        Assert.True(view.Squad.Single(m => m.Player.Id == 13).Injured);
        Assert.Null(view.Squad.Single(m => m.Player.Id == 14).LoanFromTeamId); // bayat kiralık yok sayılır
        Assert.Equal(30, view.Squad.Single(m => m.Player.Id == 15).Jersey);

        // Sıra: ilk 11, yedek, rezerv, kiralık giden; grup içinde kaleci önce.
        Assert.Equal(SquadRole.XI, view.Squad[0].Role);
        Assert.Equal(1, view.Squad[0].Player.Id);
        Assert.Equal(SquadRole.LoanedOut, view.Squad[^1].Role);

        Assert.Equal(15, view.Summary.Players); // kiralık giden sayılmaz
        Assert.Equal(Math.Round(Squad.Take(11).Average(p => p.Ovr), 1), view.Summary.BestXiAverage);
        Assert.Equal(14 * 1000 + 900, view.Summary.Wages);
        Assert.Equal(2, view.Summary.ExpiringThisSeason); // sezon 26/27: 2027'de bitenler (4 ve 15)
    }

    [Fact]
    public void Club_info_and_set_pieces()
    {
        var view = _club.Get(null, null);
        Assert.Equal("Ev FK", view.Club.Name);
        Assert.Equal("Test Ligi", view.Club.League);
        Assert.Equal("#ffd200", view.Club.Color1);
        Assert.Equal("Rakip SK", view.Club.RivalTeam);
        Assert.Equal([("captain", 9), ("penalties", 11), ("leftFreeKick", 8), ("rightFreeKick", 10), ("corners", 6),
            ("throwInLeft", 5), ("cornerSupport", 3)], view.SetPieces.Select(s => (s.Role, s.PlayerId)));
        Assert.Equal("Dengeli", view.Club.BuildUpPlayLabel);
        Assert.Equal("Kod 7", _club.Get(null, 2).Club.BuildUpPlayLabel);
        Assert.Null(view.Club.ClubWorth); // kolon yok
    }

    [Fact]
    public void League_table_and_consistency()
    {
        var view = _club.Get(null, null);
        Assert.Equal(["Rakip SK", "Ev FK"], view.Table.Select(t => t.Team));
        Assert.Equal(2, view.Standing!.Position);
        Assert.Equal((1, 1, 1, 3, 3), (view.Standing.Won!.Value, view.Standing.Drawn!.Value, view.Standing.Lost!.Value,
            view.Standing.GoalsFor!.Value, view.Standing.GoalsAgainst!.Value));
        Assert.True(view.TableConsistent);

        Assert.False(ClubService.TableConsistent([
            new Standing(1, "A", 1, 0, 6, 0, 0, 0, 0, 0, 1, true), // 6 maç ama galibiyet/puan 0 (bayat kayıt)
        ]));
    }

    [Fact]
    public void Other_team_and_missing_team()
    {
        Assert.Equal("Rakip SK", _club.Get(null, 2).Club.Name);
        Assert.Throws<NotFoundException>(() => _club.Get(null, 999));
    }

    [Fact]
    public void Fixtures_season_ratings_academy_and_scouts()
    {
        var view = _club.Get(null, null);
        Assert.Equal([1, 2], view.Fixtures.Select(f => f.Id!.Value)); // 3 başka takımların maçı, 4 önceki sezondan (bayat)
        var next = view.Fixtures[1];
        Assert.Equal((new DateOnly(2026, 11, 18), "16:00", "Rakip SK", false), (next.Date, next.Time, next.HomeTeam, next.IsHome));

        var m9 = view.Squad.Single(m => m.Player.Id == 9);
        Assert.Equal((2, 170, 7.0), (m9.Appearances!.Value, m9.Minutes!.Value, m9.AverageRating!.Value)); // geçen sezonki 99 sayılmaz
        Assert.Null(view.Squad.Single(m => m.Player.Id == 1).Appearances);

        var academy = Assert.Single(view.Academy);
        Assert.Equal((14, 2, 5), (academy.Player.Id, academy.Tier!.Value, academy.PotentialVariance!.Value));
        var scout = Assert.Single(view.Scouts);
        Assert.Equal(("Ali Göz", 3, 4), (scout.Name, scout.Experience!.Value, scout.Knowledge!.Value));
        Assert.Empty(_club.Get(null, 2).Scouts); // başka kulüpte gözlemci gösterilmez
    }

    [Theory]
    [InlineData(false)]
    [InlineData(true)]
    public void Calendar_returns_all_recorded_fixtures_beyond_the_overview_window(bool saveBlocks)
    {
        using (var con = new SqliteConnection($"Data Source={_dbPath}"))
        {
            con.Open();
            using var cmd = con.CreateCommand();
            cmd.CommandText = saveBlocks ? """
                CREATE TABLE raw_career_competitions (snapshot_id, compid, code, level, parentid);
                INSERT INTO raw_career_competitions VALUES ('S', 1512, 'C68', 3, 1);
                CREATE TABLE raw_career_standings (snapshot_id, standingindex, groupid, teamid, homewins, homedraws,
                    homelosses, homegf, homega, awaywins, awaydraws, awaylosses, awaygf, awayga, points);
                INSERT INTO raw_career_standings VALUES ('S', 1, 1513, 1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0),
                    ('S', 2, 1513, 2, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0);
                CREATE TABLE raw_career_fixtures (snapshot_id, fixtureindex, compid, round, date, time, homeslot, awayslot,
                    homegoals, awaygoals, status);
                WITH RECURSIVE n(v) AS (VALUES(1) UNION ALL SELECT v+1 FROM n WHERE v<20)
                INSERT INTO raw_career_fixtures SELECT 'S', v, 1512, v,
                    CASE WHEN v<=6 THEN 20261001+v ELSE 20261101+v END, 1900, 1, 2,
                    CASE WHEN v<=6 THEN 2 ELSE 255 END, CASE WHEN v<=6 THEN 0 ELSE 255 END,
                    CASE WHEN v<=6 THEN 1 ELSE 0 END FROM n;
                """ : """
                DELETE FROM raw_fixtures;
                WITH RECURSIVE n(v) AS (VALUES(1) UNION ALL SELECT v+1 FROM n WHERE v<20)
                INSERT INTO raw_fixtures SELECT 'S', v,
                    CASE WHEN v<=6 THEN 162170+v ELSE 162203+v END, 68400, 1, 2, 68, 2, 1 FROM n;
                """;
            cmd.ExecuteNonQuery();
        }
        SqliteConnection.ClearAllPools();
        var (_, club) = Services();
        var fixtures = club.Get(null, null).Fixtures;
        Assert.Equal(20, fixtures.Count);
        Assert.Equal(Enumerable.Range(1, 20), fixtures.Select(f => f.Id!.Value));
        Assert.Equal(6, fixtures.Count(f => f.Date < new DateOnly(2026, 11, 1)));
        Assert.Equal(14, fixtures.Count(f => f.Date >= new DateOnly(2026, 11, 1)));
        if (saveBlocks) Assert.Equal(6, fixtures.Count(f => f.HomeGoals is not null));
    }

    [Fact]
    public void Player_roles_and_playstyles_from_codes()
    {
        var p = _market.Detail(15, null).Profile;
        Assert.Equal([("Yarı kanat", "CAM", 2), ("İçe kat eden forvet", "RM", 1), ("Rol #7", null, 1)],
            p.Roles!.Select(r => (r.Name, r.Position, r.Level)));
        Assert.Equal(["Sert şut", "İsabetli kafa", "Yerden sert şut", "Hızlı pas", "Teknik", "İlk dokunuş", "Uzun uzanma"], p.PlayStyles);
        Assert.Equal(["Plase şut", "Süratli"], p.PlayStylesPlus);
        Assert.Equal(("shooting", "ballControl", "goalkeeper"), (p.StyleCategories!["Sert şut"], p.StyleCategories["Süratli"], p.StyleCategories["Uzun uzanma"]));
        Assert.Equal(("Patlayıcı", "Normal 1", "Çok sakin", "Tam teknisyen", false),
            (p.AccelerationType, p.BodyType, p.Emotion, p.GrowthProfile, p.Retiring));
        var q = _market.Detail(16, null).Profile;
        Assert.Equal(("Uzun", "Özel", "Kod 9", "Profil 2", true), (q.AccelerationType, q.BodyType, q.Emotion, q.GrowthProfile, q.Retiring));
    }

    [Fact]
    public void Player_stats_from_competition_table()
    {
        var st = _market.Detail(15, null).Stats!;
        Assert.Equal((23, 7, 4, 4, 1, 0), (st.Total.Appearances, st.Total.Goals, st.Total.Assists, st.Total.Yellow, st.Total.Red, st.Total.CleanSheets));
        Assert.Equal([(68, "Test Ligi"), (7, null)], st.Competitions.Select(x => (x.CompetitionId, x.Competition)));
        Assert.Null(st.Total.AverageRating);
        Assert.Null(_market.Detail(16, null).Stats);
    }

    [Theory]
    [InlineData(178, 95, 59, 89, 91, "Patlayıcı")]  // Estêvão
    [InlineData(160, 90, 61, 82, 91, "Kontrollü")]  // hızlanma sprintin çok altında
    [InlineData(186, 99, 67, 91, 89, "Kontrollü")]  // boy 182'den uzun
    [InlineData(190, 73, 83, 77, 84, "Uzun")]
    [InlineData(187, 45, 64, 33, 39, "Kontrollü")]  // boy 188'den kısa
    public void Acceleration_type_rule(int h, int agi, int str, int acc, int spr, string expected) =>
        Assert.Equal(expected, new AccelerationTypeRule().Classify(h, agi, str, acc, spr));

    [Fact]
    public void Career_records_from_save_tables()
    {
        var r = _club.Get(null, null).Records!;
        Assert.True(r.HasTeamOfWeek && r.HasPlayerAwards && r.HasManagerAwards);
        Assert.Equal((15, 84, 2, 9), (r.TeamOfWeek[0].PlayerId, r.TeamOfWeek[0].Rating, r.TeamOfWeek[0].Weeks, r.TeamOfWeek[0].Month));
        Assert.Equal([3, 2], r.PlayerAwards.Select(a => a.Season!.Value)); // en yeni sezon önce
        var m = Assert.Single(r.ManagerAwards);
        Assert.Equal((4, new DateOnly(2027, 4, 1)), (m.Count, m.Date));
    }

    [Fact]
    public void Save_blocks_give_live_table_fixtures_and_season_stats()
    {
        using (var con = new SqliteConnection($"Data Source={_dbPath}"))
        {
            con.Open();
            using var cmd = con.CreateCommand();
            // Test Ligi (68) = yarışma 1512, grup 1513; takım 1 iki maçta 4 puan, takım 2 bir puan
            cmd.CommandText = """
                CREATE TABLE raw_career_competitions (snapshot_id TEXT NOT NULL, compid, code, level, parentid);
                INSERT INTO raw_career_competitions VALUES ('S', 1512, 'C68', 3, 1), ('S', 1487, 'C268', 3, 1);
                CREATE TABLE raw_career_standings (snapshot_id TEXT NOT NULL, standingindex, groupid, teamid, homewins, homedraws,
                    homelosses, homegf, homega, awaywins, awaydraws, awaylosses, awaygf, awayga, points);
                INSERT INTO raw_career_standings VALUES ('S', 1, 1513, 1, 1, 0, 0, 2, 0, 0, 1, 0, 1, 1, 4),
                    ('S', 2, 1513, 2, 0, 1, 0, 1, 1, 0, 0, 1, 0, 2, 1), ('S', 3, 1490, 1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0),
                    ('S', 4, 1490, 2, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0);
                CREATE TABLE raw_career_fixtures (snapshot_id TEXT NOT NULL, fixtureindex, compid, round, date, time, homeslot, awayslot,
                    homegoals, awaygoals, status);
                INSERT INTO raw_career_fixtures VALUES ('S', 1, 1512, 1, 20260815, 1900, 1, 2, 2, 0, 1),
                    ('S', 2, 1512, 2, 20260822, 1700, 2, 1, 1, 1, 1), ('S', 3, 1487, 1, 20261205, 1730, 3, 4, 255, 255, 0);
                CREATE TABLE raw_career_playerstats (snapshot_id TEXT NOT NULL, teamid, playerid, compid, appearances, minutes, goals,
                    assists, yellowcards, redcards, ratingtotal, cleansheets, goalsconceded);
                INSERT INTO raw_career_playerstats VALUES ('S', 1, 9, 1512, 2, 180, 1, 1, 1, 0, 150, 1, 1), ('S', 1, 9, 1487, 1, 90, 0, 0, 0, 0, 70, 1, 0);
                CREATE TABLE raw_career_playermorale (snapshot_id TEXT NOT NULL, playerid, temperament, teamperformance,
                    playerperformance, unknown1, unknown2, contract, morale, playingtime, events);
                INSERT INTO raw_career_playermorale VALUES ('S', 9, 3, 30, 0, 80, 95, 71, 14, 76, 'CM_Morale_Update_PlaytimeUnhappy');
                CREATE TABLE raw_career_playerfitness (snapshot_id TEXT NOT NULL, playerid, fitness, severity, injurytype, bodypart,
                    returndate, phase, daystofit, unknown);
                INSERT INTO raw_career_playerfitness VALUES ('S', 9, 0, 3, 16, 38, 20990908, 3, 20, 0), ('S', 2, 66, 0, 0, 0, NULL, 0, 0, 0),
                    ('S', 3, 90, 2, 1, 1, 20000101, 6, 0, 0);
                CREATE TABLE raw_career_finance (snapshot_id TEXT NOT NULL, balance, transferbudgetstart, transferbudget, wagebudget,
                    wagebudgetleft, wageheadroom, unknown);
                INSERT INTO raw_career_finance VALUES ('S', 418964000, 52600568, 36916049, 56412980, 55955950, 319865, 0);
                CREATE TABLE raw_career_transactions (snapshot_id TEXT NOT NULL, txindex, amount, kind, date, income);
                INSERT INTO raw_career_transactions VALUES ('S', 5, 4281000, 13, 20300714, 1), ('S', 6, 1066250, 16, 20300714, 0),
                    ('S', 8, 3000000, 99, 20300701, 0);
                CREATE TABLE raw_career_financecategories (snapshot_id,kind,income,expense);
                INSERT INTO raw_career_financecategories VALUES ('S',13,4281000,0),('S',16,0,1066250);
                """;
            cmd.ExecuteNonQuery();
        }
        SqliteConnection.ClearAllPools();
        var (market, club) = Services(); // yeni tablolar şema önbelleğine girsin

        var view = club.Get(null, null);
        Assert.False(view.TableStale);
        Assert.True(view.TableConsistent);
        Assert.Equal(1512, view.LeagueCompetitionId); // leagueId=68 aynı kod sistemi değildir.
        Assert.Equal([(1, 1, 4, 2), (2, 2, 1, 2)], view.Table.Select(r => (r.TeamId, r.Position!.Value, r.Points!.Value, r.Played!.Value)));
        Assert.Equal((1, 1, 0, 3, 1), (view.Standing!.Won!.Value, view.Standing.Drawn!.Value, view.Standing.Lost!.Value,
            view.Standing.GoalsFor!.Value, view.Standing.GoalsAgainst!.Value));
        Assert.Equal([(2, 0, "Test Ligi"), (1, 1, "Test Ligi")], view.Fixtures.Where(f => f.HomeGoals is not null)
            .Select(f => (f.HomeGoals!.Value, f.AwayGoals!.Value, f.Competition)));
        var cup = view.Fixtures.Single(f => f.HomeGoals is null);
        Assert.Equal(("17:30", "Türkiye Kupası"), (cup.Time, cup.Competition));
        var m9 = view.Squad.Single(m => m.Player.Id == 9);
        Assert.Equal((2, 180, 7.5), (m9.Appearances!.Value, m9.Minutes!.Value, m9.AverageRating!.Value));
        Assert.Equal((14, 3, 30, 0, 71, 76), (m9.Morale!.Value, m9.Morale.Temperament!.Value, m9.Morale.TeamPerformance!.Value,
            m9.Morale.PlayerPerformance!.Value, m9.Morale.Contract!.Value, m9.Morale.PlayingTime!.Value));
        Assert.Equal(["CM_Morale_Update_PlaytimeUnhappy"], m9.Morale.Events);
        Assert.Null(view.Squad.First(m => m.Player.Id != 9).Morale);
        Assert.Equal((0, true, 3, 3, 20), (m9.Fitness!.Value, m9.Fitness.Injured, m9.Fitness.Severity!.Value, m9.Fitness.Phase!.Value,
            m9.Fitness.DaysToFit!.Value));
        Assert.True(m9.Injured);
        var byId = view.Squad.ToDictionary(m => m.Player.Id);
        Assert.Equal((66, false), (byId[2].Fitness!.Value, byId[2].Fitness!.Injured));
        Assert.Equal((90, false, null), (byId[3].Fitness!.Value, byId[3].Fitness!.Injured, byId[3].Fitness!.Severity)); // dönüş geçmişte
        Assert.Equal(100, view.Squad.First(m => m.Player.Id is not (9 or 2 or 3)).Fitness!.Value); // listede yok = tam
        var rec = view.SeasonRecord!;
        Assert.Equal((2, 1, 1, 0, 3, 1), (rec.Played, rec.Won, rec.Drawn, rec.Lost, rec.GoalsFor, rec.GoalsAgainst));
        Assert.Equal((2, 0, 2), (rec.BiggestWin!.For, rec.BiggestWin.Against, rec.BiggestWin.OpponentId!.Value));
        Assert.Null(rec.BiggestLoss);
        var observed = Assert.Single(view.ObservedSeasons!);
        Assert.Equal((2027, "S", new DateOnly(2026, 11, 1)), (observed.SeasonEndYear, observed.SnapshotId, observed.AsOf));
        Assert.Equal(rec.Played, observed.Record.Played);
        var fin = view.Finance!;
        Assert.Equal((4281000L, 1066250L), (fin.Categories!.Sum(c => c.Income), fin.Categories!.Sum(c => c.Expense)));
        Assert.Equal((52600568L, 36916049L, 319865L), (fin.TransferBudgetStart!.Value, fin.TransferBudget!.Value, fin.WageHeadroom!.Value));
        Assert.Equal([("Forma satışı", 4281000L), ("Oyuncu maaşları", -1066250L), (null, -3000000L)],
            fin.Transactions.Select(t => (t.Label, t.Amount)));

        var stats = market.Detail(9, null).Stats!;
        Assert.Equal("save", stats.Source);
        Assert.Equal((3, 270, 1, 1), (stats.Total.Appearances!.Value, stats.Total.Minutes!.Value, stats.Total.Goals!.Value, stats.Total.Assists!.Value));
        Assert.Equal(["Test Ligi", "Türkiye Kupası"], stats.Competitions.Select(x => x.Competition));
        var options = market.FilterOptions(null);
        Assert.Contains(options.Roles!, r => r.Id == 33 && r.Name == "Yarı kanat · CAM");
        Assert.Contains(options.PlayStyles!, r => r.Id == 0);
        Assert.Contains(options.PlayStylesPlus!, r => r.Id == 0);
        Assert.Contains(15, market.Players(new PlayerQuery { Role = "33", RoleLevelMin = 2, PlayStylePlus = "0" }).Items.Select(p => p.Id));
    }

    [Fact]
    public void Export_only_snapshot_uses_latest_save_blocks()
    {
        using var con = new SqliteConnection($"Data Source={_dbPath}");
        con.Open();
        using (var cmd = con.CreateCommand())
        {
            // S: kayıt blokları var. E: aynı save'in sonraki günü, yalnız LE export'u (blok yok). Eski: S'den önceki gün.
            cmd.CommandText = """
                CREATE TABLE raw_career_fixtures (snapshot_id TEXT NOT NULL, fixtureindex, compid, round, date, time, homeslot, awayslot,
                    homegoals, awaygoals, status);
                INSERT INTO raw_career_fixtures VALUES ('S', 1, 1512, 1, 20260815, 1900, 1, 2, 2, 0, 1);
                INSERT INTO snapshots (snapshot_id, save_uid, game_date, exported_at)
                    SELECT 'E', save_uid, date(game_date, '+1 day'), '2099-01-01T00:00:00Z' FROM snapshots WHERE snapshot_id = 'S';
                INSERT INTO snapshots (snapshot_id, save_uid, game_date, exported_at)
                    SELECT 'Eski', save_uid, date(game_date, '-1 day'), '2000-01-01T00:00:00Z' FROM snapshots WHERE snapshot_id = 'S';
                """;
            cmd.ExecuteNonQuery();
        }
        var map = new FieldMapProvider(Path.Combine(TestConfig.RepoRoot, "config", "field-map.json"), NullLogger<FieldMapProvider>.Instance).Current;
        var s = ResolvedSchema.FromDb(map, con);
        Assert.Equal("S", CareerBlocks.SourceSnapshot(con, s, "E"));
        Assert.Equal("S", CareerBlocks.SourceSnapshot(con, s, "S"));
        Assert.Equal("Eski", CareerBlocks.SourceSnapshot(con, s, "Eski")); // önceki günde kayıt bloğu yok: kendisi
    }

    [Fact]
    public void Stale_table_detected_across_seasons()
    {
        var a = new Dictionary<int, (int?, int?, int?)> { [1] = (6, 6, 0), [2] = (9, 6, 0), [3] = (1, 6, 18) };
        Assert.True(ClubService.SameTable(a, new Dictionary<int, (int?, int?, int?)>(a)));
        Assert.False(ClubService.SameTable(a, new Dictionary<int, (int?, int?, int?)> { [1] = (1, 3, 9), [2] = (2, 3, 6), [3] = (1, 6, 18) }));
        Assert.False(ClubService.SameTable(a, new Dictionary<int, (int?, int?, int?)>()));
        Assert.False(_club.Get(null, null).TableStale); // tek snapshot: karar verilemez
    }

    [Fact]
    public void World_moves_and_leaders()
    {
        var view = _club.Get(null, null);
        var move = Assert.Single(view.World.Moves); // başka ülkedeki lig değişimi (takım 5) sayılmaz
        Assert.Equal(("Rakip SK", "Test 1. Lig", true), (move.Team, move.FromLeague, move.Promoted));
        var leader = Assert.Single(view.World.Leaders); // Başka Ülke'de iki takım birden 1. → belirsiz, atlanır
        Assert.Equal(("Test Ligi", "Rakip SK"), (leader.League, leader.Team));
        Assert.Equal(1, view.Career.Snapshots);
        Assert.Empty(view.Career.TrophiesWon);
    }

    [Fact]
    public void Teams_lists_clubs_with_ratings_and_squad_numbers()
    {
        var teams = _club.Teams(null).Teams;
        Assert.Equal(["Ev FK", "Rakip SK"], teams.Select(t => t.Name)); // OVR 78 > 75
        var home = teams[0];
        Assert.True(home.IsUser);
        Assert.Equal(78, home.Overall);
        Assert.Equal(15, home.Players); // 14 + kiralık gelen
        Assert.Equal(11, home.BestPlayerId); // OVR 83
        Assert.Equal("#ffd200", home.Color1);
        Assert.Equal(1, teams[1].Players); // kiralık giden oyuncumuz orada
    }

    [Fact]
    public void Manager_season_archive_preserves_counters_security_and_objective_labels()
    {
        using (var con = new SqliteConnection($"Data Source={_dbPath}"))
        {
            con.Open();
            using var cmd = con.CreateCommand();
            cmd.CommandText = """
                CREATE TABLE raw_career_seasonhistory (snapshot_id,teamid,seasonindex,leagueid,position,objective,objectivestatus,
                  played,won,drawn,lost,goalsfor,goalsagainst,points,jobsecurity,biggestbuy,biggestsale);
                INSERT INTO raw_career_seasonhistory VALUES ('S',1,1,68,1,7,2,53,42,7,4,150,46,133,84,'Antony','Espí'),
                  ('S',1,2,68,NULL,7,0,2,2,0,0,4,0,6,74,NULL,'Jörgensen');
                """;
            cmd.ExecuteNonQuery();
        }
        SqliteConnection.ClearAllPools();
        var (_, club) = Services();
        var career = club.Get(null, null).ManagerCareer!;
        Assert.Equal((55, 44, 7, 4, 154, 46), (career.Played, career.Won, career.Drawn, career.Lost, career.GoalsFor, career.GoalsAgainst));
        Assert.Equal(74, career.Seasons[0].JobSecurity);
        Assert.False(career.Seasons[0].Completed);
        Assert.Equal("Ligi kazan", career.Seasons[0].Objective);
        Assert.Equal("Sürüyor", career.Seasons[0].ObjectiveStatus);
        Assert.Equal("Karşılandı", career.Seasons[1].ObjectiveStatus);
        Assert.True(career.Seasons[1].Completed);
        Assert.Equal([2027, 2026], career.Seasons.Select(s => s.SeasonEndYear));
        Assert.All(career.Seasons, s => Assert.Null(s.Position)); // Ham +10 kodu final sırası olarak doğrulanmadı.
        Assert.Null(club.Get(null, 2).ManagerCareer);
    }

    [Fact]
    public void Trophies_come_from_the_season_archive_for_this_club_only()
    {
        using (var con = new SqliteConnection($"Data Source={_dbPath}"))
        {
            con.Open();
            using var cmd = con.CreateCommand();
            cmd.CommandText = """
                CREATE TABLE raw_career_seasonhistory (snapshot_id,teamid,seasonindex,leagueid,position,objective,objectivestatus,
                  played,won,drawn,lost,goalsfor,goalsagainst,points,jobsecurity,biggestbuy,biggestsale,leaguetitles,domesticcups,
                  continentalcups,biggestbuyfee,biggestsalefee);
                INSERT INTO raw_career_seasonhistory VALUES ('S',1,1,68,1,7,2,53,42,7,4,150,46,133,84,'Antony','Espí',1,1,0,90000000,0),
                  ('S',1,2,68,NULL,7,1,38,30,5,3,90,30,95,80,NULL,NULL,1,0,0,0,0),
                  ('S',9,3,68,NULL,7,0,2,2,0,0,4,0,6,74,NULL,NULL,1,0,1,0,0);
                """;
            cmd.ExecuteNonQuery();
        }
        SqliteConnection.ClearAllPools();
        var (_, club) = Services();
        var view = club.Get(null, null);
        Assert.Equal("archive", view.Career.TrophiesSource);
        Assert.Equal(3, view.Career.SeasonsTracked); // tek snapshot var, sezonlar kayıt arşivinden
        Assert.Equal([("Lig şampiyonluğu", 2), ("Yerel kupa", 1)], view.Career.TrophiesWon.Select(t => (t.Trophy, t.Count)));
        Assert.Equal(90_000_000, view.ManagerCareer!.Seasons.Single(x => x.BiggestBuy == "Antony").BiggestBuyFee);
        Assert.Null(view.ManagerCareer.Seasons.Single(x => x.BiggestBuy == "Antony").BiggestSaleFee);
    }

    [Fact]
    public void Academy_placeholder_contract_year_is_not_a_contract()
    {
        using (var con = new SqliteConnection($"Data Source={_dbPath}"))
        {
            con.Open();
            using var cmd = con.CreateCommand();
            cmd.CommandText = "UPDATE raw_players SET contractvaliduntil = 2000 WHERE playerid = 15";
            cmd.ExecuteNonQuery();
        }
        SqliteConnection.ClearAllPools();
        var (market, _) = Services();
        var player = market.Get(null).Find(15)!;
        Assert.Null(player.ContractEnd);
        Assert.Null(player.ContractYearsLeft);
    }

    [Fact]
    public void Scout_network_and_preseason_invites_come_from_the_save_blocks()
    {
        using (var con = new SqliteConnection($"Data Source={_dbPath}"))
        {
            con.Open();
            using var cmd = con.CreateCommand();
            cmd.CommandText = """
                CREATE TABLE raw_career_scoutnetwork (snapshot_id,scoutkey,list,slot,covernation,nationality,experience,judgement,
                  firstname,lastname,newscoutsdate);
                INSERT INTO raw_career_scoutnetwork VALUES ('S',100,'available',0,4,48,1,3,'Ali','Kaya',20300728),
                  ('S',0,'hired',0,18,48,4,4,'Anil','Kara',20300728);
                CREATE TABLE raw_career_preseason (snapshot_id,compid,key,teamids,prize,entered,confirmeddate);
                INSERT INTO raw_career_preseason VALUES ('S',844,'cm_pst_eu_shield','1,99',3900000,0,20300712),
                  ('S',840,'cm_pst_eu_intl_cup','1,2',4000000,1,20300712);
                """;
            cmd.ExecuteNonQuery();
        }
        SqliteConnection.ClearAllPools();
        var (_, club) = Services();
        var view = club.Get(null, null);
        Assert.Equal(new DateOnly(2030, 7, 28), view.ScoutNetwork!.NewScoutsDate);
        Assert.Equal("Anil Kara", Assert.Single(view.ScoutNetwork.Hired).Name);
        Assert.Equal(18, view.ScoutNetwork.Hired[0].CoverNationId);
        Assert.Null(Assert.Single(view.ScoutNetwork.Available).CoverNationId);
        Assert.Equal(["cm_pst_eu_intl_cup", "cm_pst_eu_shield"], view.Preseason!.Invites.Select(i => i.Key));
        Assert.True(view.Preseason.Invites[0].Entered);
        Assert.Equal(new DateOnly(2030, 7, 12), view.Preseason.ConfirmedDate);
        Assert.Equal("Takım #99", view.Preseason.Invites[1].Teams[1]);
        Assert.Null(club.Get(null, 2).ScoutNetwork);
    }

    [Fact]
    public void Board_objectives_and_manager_record_come_from_the_save_blocks()
    {
        using (var con = new SqliteConnection($"Data Source={_dbPath}"))
        {
            con.Open();
            using var cmd = con.CreateCommand();
            cmd.CommandText = """
                CREATE TABLE raw_career_boardobjectives (snapshot_id,objectiveid,compobjid,compid,kind,target,stretch,minimum);
                INSERT INTO raw_career_boardobjectives VALUES ('S',2191,135,223,2,17,NULL,15),('S',2195,1512,68,0,17,NULL,13);
                CREATE TABLE raw_career_manager (snapshot_id,recordid,wage,earnings,lossdate,lossopponent,lossfor,lossagainst,windate,
                  winopponent,winfor,winagainst,season,difficulty,halflength);
                INSERT INTO raw_career_manager VALUES ('S',0,15000,3165000,20280307,99,1,4,20260822,2,10,0,5,6,5);
                """;
            cmd.ExecuteNonQuery();
        }
        SqliteConnection.ClearAllPools();
        var (_, club) = Services();
        var view = club.Get(null, null);
        Assert.Equal([0, 2], view.Objectives!.Select(o => o.Kind));
        Assert.Equal((17, (int?)null, 13), (view.Objectives[0].Target!.Value, view.Objectives[0].Stretch, view.Objectives[0].Minimum!.Value));
        var m = view.Manager!;
        Assert.Equal((15000L, 3165000L, 6, 5), (m.Wage!.Value, m.Earnings!.Value, m.Difficulty!.Value, m.HalfLength!.Value));
        Assert.Equal((new DateOnly(2026, 8, 22), 2, 10, 0), (m.BiggestWin!.Date, m.BiggestWin.OpponentId!.Value, m.BiggestWin.For, m.BiggestWin.Against));
        Assert.Equal(99, m.BiggestLoss!.OpponentId);
        Assert.Null(club.Get(null, 2).Manager);
    }

    [Fact]
    public void Observed_seasons_use_one_exact_snapshot_per_season_and_exclude_other_branches()
    {
        using (var con = new SqliteConnection($"Data Source={_dbPath}"))
        {
            con.Open();
            using var cmd = con.CreateCommand();
            cmd.CommandText = """
                ALTER TABLE snapshots ADD COLUMN branch INTEGER DEFAULT 1;
                ALTER TABLE snapshots ADD COLUMN branch_reason TEXT;
                CREATE TABLE branches (save_uid, branch, parent_branch, fork_date, first_snapshot);
                INSERT INTO branches VALUES ('SAVE', 1, NULL, NULL, 'P'), ('SAVE', 2, NULL, NULL, 'X');
                INSERT INTO snapshots (snapshot_id,save_uid,game_date,exported_at,user_teamid,user_team_name,branch) VALUES
                  ('P','SAVE','2026-05-02','2026-10-18T00:00:00Z',1,'Ev FK',1),
                  ('Q','SAVE','2026-09-01','2026-10-19T00:00:00Z',1,'Ev FK',1),
                  ('X','SAVE','2026-10-30','2026-10-28T00:00:00Z',1,'Ev FK',2);
                CREATE TABLE raw_career_standings (snapshot_id, standingindex, groupid, teamid);
                INSERT INTO raw_career_standings VALUES ('S',1,1513,1),('S',2,1513,2),('P',1,1513,1),('P',2,1513,2),
                  ('Q',1,1513,1),('Q',2,1513,2),('X',1,1513,1),('X',2,1513,2);
                CREATE TABLE raw_career_fixtures (snapshot_id,fixtureindex,compid,round,date,time,homeslot,awayslot,homegoals,awaygoals,status);
                INSERT INTO raw_career_fixtures VALUES ('P',1,1512,1,20260501,1600,1,2,1,0,1),
                  ('Q',1,1512,1,20260817,1600,1,2,4,0,1),('S',1,1512,1,20261017,1600,1,2,2,0,1),
                  ('S',2,1512,2,20261201,1600,1,2,9,0,1),('X',1,1512,1,20261029,1600,1,2,8,0,1);
                """;
            cmd.ExecuteNonQuery();
        }
        SqliteConnection.ClearAllPools();
        var (_, club) = Services();
        var seasons = club.Get("SAVE@1", null).ObservedSeasons!;
        Assert.Equal(["S", "P"], seasons.Select(s => s.SnapshotId));
        Assert.Equal([2027, 2026], seasons.Select(s => s.SeasonEndYear));
        Assert.Equal([2, 1], seasons.Select(s => s.Record.GoalsFor)); // Q/X ve henüz gelmeyen Aralık maçı dahil değil.
        Assert.All(seasons, s => Assert.Equal(1, s.Record.Played));
    }

    [Theory]
    [InlineData("RCB", "CB")]
    [InlineData("LDM", "CDM")]
    [InlineData("RS", "ST")]
    [InlineData("LAM", "CAM")]
    [InlineData("RF", null)]
    [InlineData("CF", null)]
    [InlineData("RWB", "RWB")]
    [InlineData("SW", "CB")]
    public void Slot_codes_map_to_rating_positions(string slot, string? expected) =>
        Assert.Equal(expected, ClubService.BasePosition(TestConfig.PositionRatingsFile.Current, slot));
}
