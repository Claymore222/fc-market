using FcMarket.Api.Data;
using FcMarket.Api.Domain;
using FcMarket.Api.FieldMaps;
using FcMarket.Api.Market;
using Microsoft.Data.Sqlite;
using Microsoft.Extensions.Logging.Abstractions;

namespace FcMarket.Tests;

/// <summary>
/// FC 27'nin gerçek export biçimi (ilk snapshot, 17.10.2029): sözleşme players'ta, kadın oyuncular DB'de,
/// serbest oyuncular "NG - FA" takımında, skill moves 0 tabanlı, istatistik kaynağı yok.
/// </summary>
public sealed class Fc27FormatTests : IDisposable
{
    private readonly string _dbPath = Path.Combine(Path.GetTempPath(), $"fcmarket-fc27-{Guid.NewGuid():N}.db");

    public Fc27FormatTests()
    {
        using (var con = new SqliteConnection($"Data Source={_dbPath}"))
        {
            con.Open();
            using var cmd = con.CreateCommand();
            cmd.CommandText = """
                CREATE TABLE snapshots (snapshot_id TEXT PRIMARY KEY, save_uid TEXT, game_date TEXT, exported_at TEXT,
                    user_teamid INTEGER, user_team_name TEXT, transfer_budget INTEGER, wage_budget INTEGER);
                -- Aynı oyun gününde iki snapshot (elle + yeniden): S0 daha önce alındı
                INSERT INTO snapshots VALUES ('S0', 'SAVE', '2029-10-17', '2026-10-16T17:41:22Z', 326, 'Fenerbahçe SK', 123890000, NULL),
                                             ('S1', 'SAVE', '2029-10-17', '2026-10-16T17:47:27Z', 326, 'Fenerbahçe SK', 123890000, NULL);
                CREATE TABLE raw_players (snapshot_id TEXT NOT NULL, playerid, overallrating, potential, preferredposition1,
                    skillmoves, weakfootabilitytypecode, gender, wage, contractvaliduntil);
                INSERT INTO raw_players VALUES
                  ('S1', 1, 92, 93, 25, 2, 3, 0, 615624, 2034),
                  ('S1', 2, 70, 75, 14, 0, 2, 0, 850, 2031),
                  ('S1', 3, 88, 90, 27, 3, 4, 1, 9000, 2030),
                  ('S0', 1, 91, 93, 25, 2, 3, 0, 615624, 2034);
                CREATE TABLE raw_player_names (snapshot_id TEXT NOT NULL, playerid, name, club_teamid);
                INSERT INTO raw_player_names VALUES ('S1', 1, 'Erling Haaland', 10), ('S1', 2, 'Kenan Fatkic', 111592),
                  ('S1', 3, 'Linda Caicedo', 243), ('S0', 1, 'Erling Haaland', 10);
                CREATE TABLE raw_teams (snapshot_id TEXT NOT NULL, teamid, teamname);
                INSERT INTO raw_teams VALUES ('S1', 10, 'Manchester City'), ('S1', 111592, 'NG - FA'), ('S1', 243, 'Real Madrid');
                -- 1352 = milli takım satırı (lig istatistiği 0)
                CREATE TABLE raw_teamplayerlinks (snapshot_id TEXT NOT NULL, playerid, teamid, leagueappearances, leaguegoals, yellows, reds);
                INSERT INTO raw_teamplayerlinks VALUES ('S1', 1, 10, 9, 11, 1, 0), ('S1', 1, 1352, 0, 0, 0, 0);
                """;
            cmd.ExecuteNonQuery();
        }
        SqliteConnection.ClearAllPools();
    }

    public void Dispose()
    {
        SqliteConnection.ClearAllPools();
        foreach (var f in new[] { _dbPath, _dbPath + "-wal", _dbPath + "-shm" })
            if (File.Exists(f)) File.Delete(f);
    }

    private MarketService Service(bool includeWomen = false)
    {
        var market = TestConfig.Market;
        market.IncludeWomen = includeWomen;
        var loader = new MarketLoader(new Valuator(TestConfig.Valuation), new OpportunityScorer(TestConfig.Opportunity),
            TestConfig.Season, market);
        return new MarketService(new CareerDb(_dbPath),
            new FieldMapProvider(Path.Combine(TestConfig.RepoRoot, "config", "field-map.json"), NullLogger<FieldMapProvider>.Instance),
            loader, market, TestConfig.PositionRatingsFile, new FaceStore(Path.Combine(Path.GetTempPath(), "yok")),
            NullLogger<MarketService>.Instance);
    }

    [Fact]
    public void Women_are_hidden_unless_enabled()
    {
        Assert.Equal([1, 2], Service().Get(null).Players.Select(p => p.Id).Order());
        Assert.Equal([1, 2, 3], Service(includeWomen: true).Get(null).Players.Select(p => p.Id).Order());
    }

    [Fact]
    public void Contract_comes_from_players_table()
    {
        var p = Service().Get(null).Find(1)!;
        Assert.Equal(2034, p.ContractEnd);
        Assert.Equal(4, p.ContractYearsLeft); // 2029/30 sezonu → 2034 − 2030
        Assert.Equal(615624, p.Wage);
        Assert.False(p.IsFreeAgent);
        Assert.Equal("Manchester City", p.Club);
    }

    [Fact]
    public void Free_agent_gets_label_and_no_contract()
    {
        var p = Service().Get(null).Find(2)!;
        Assert.True(p.IsFreeAgent);
        Assert.Equal("Serbest", p.Club);
        Assert.Equal(111592, p.ClubId);
        Assert.Null(p.ContractEnd);
        Assert.Null(p.Wage);
        Assert.Equal(850, p.RecordedWage);
        Assert.Null(p.ValueBreakdown.Wage);
        Assert.Equal(1, p.ValueBreakdown.WageMultiplier);
        Assert.Equal(0, p.ContractYearsLeft);
        Assert.Equal(0, p.ValueBreakdown.ContractYearsLeft);
    }

    [Fact]
    public void Free_agents_count_as_expiring_contracts()
    {
        var r = Service().Players(new PlayerQuery { ContractEndsBy = 2030 });
        Assert.Equal([2], r.Items.Select(p => p.Id));
    }

    [Fact]
    public void Wage_sort_matches_displayed_recorded_wage()
    {
        Assert.Equal([2, 1], Service().Players(new PlayerQuery { Sort = "wage", Dir = "asc" }).Items.Select(p => p.Id));
    }

    [Fact]
    public void All_positions_are_ordered_distinct_and_equipment_codes_preserved()
    {
        using (var con = new SqliteConnection($"Data Source={_dbPath}"))
        {
            con.Open();
            using var cmd = con.CreateCommand();
            cmd.CommandText = """
                ALTER TABLE raw_players ADD COLUMN preferredposition2;
                ALTER TABLE raw_players ADD COLUMN preferredposition3;
                ALTER TABLE raw_players ADD COLUMN preferredposition4;
                ALTER TABLE raw_players ADD COLUMN preferredposition5;
                ALTER TABLE raw_players ADD COLUMN preferredposition6;
                ALTER TABLE raw_players ADD COLUMN preferredposition7;
                ALTER TABLE raw_players ADD COLUMN shoetypecode;
                ALTER TABLE raw_players ADD COLUMN shoedesigncode;
                ALTER TABLE raw_players ADD COLUMN shoecolorcode1;
                ALTER TABLE raw_players ADD COLUMN shoecolorcode2;
                ALTER TABLE raw_players ADD COLUMN gkglovetypecode;
                UPDATE raw_players SET preferredposition2=3, preferredposition3=14, preferredposition4=-1,
                  preferredposition5=5, preferredposition6=27, preferredposition7=99,
                  shoetypecode=87, shoedesigncode=0, shoecolorcode1=30, shoecolorcode2=31, gkglovetypecode=133
                  WHERE playerid=2;
                """;
            cmd.ExecuteNonQuery();
        }
        var d = Service().Detail(2, null);
        Assert.Equal(["CM", "RB", "CB", "LW", "P99"], d.Player.Positions);
        Assert.Equal(new PlayerEquipment(87, 0, 30, 31, 133), d.Profile.Equipment);
    }

    [Fact]
    public void Missing_positions_equipment_and_wage_remain_unknown()
    {
        using (var con = new SqliteConnection($"Data Source={_dbPath}"))
        {
            con.Open();
            using var cmd = con.CreateCommand();
            cmd.CommandText = "UPDATE raw_players SET wage=NULL WHERE playerid=2";
            cmd.ExecuteNonQuery();
        }
        var d = Service().Detail(2, null);
        Assert.Equal(["CM"], d.Player.Positions);
        Assert.Equal(new PlayerEquipment(null, null, null, null, null), d.Profile.Equipment);
        Assert.Null(d.Player.RecordedWage);
    }

    [Fact]
    public void Free_agent_filter_includes_or_excludes_them()
    {
        var service = Service();
        Assert.Equal([2], service.Players(new PlayerQuery { FreeAgent = true }).Items.Select(p => p.Id));
        Assert.DoesNotContain(2, service.Players(new PlayerQuery { FreeAgent = false }).Items.Select(p => p.Id));
        Assert.Empty(service.Players(new PlayerQuery { ContractEndsBy = 2030, FreeAgent = false }).Items);
    }

    [Fact]
    public void Skill_moves_are_shifted_to_stars()
    {
        var data = Service().Get(null);
        Assert.Equal(3, data.Find(1)!.SkillMoves); // oyunda 2 → 3★
        Assert.Equal(1, data.Find(2)!.SkillMoves); // 0 → 1★
        Assert.Equal(3, data.Find(1)!.WeakFoot);   // zayıf ayak zaten 1–5
    }

    [Fact]
    public void History_keeps_latest_snapshot_per_game_day()
    {
        var h = Service().History(1, null);
        Assert.Equal("S1", Assert.Single(h).SnapshotId);
        Assert.Equal(92, h[0].Overall);
    }

    [Fact]
    public void Missing_stats_source_is_only_warning()
    {
        // 0.4.0 öncesi export'larda prevcompetitionstats yok: istatistik boş, yalnız uyarı.
        var service = Service();
        Assert.Null(service.Detail(1, null).Stats);
        Assert.Contains("Tablo yok: raw_prevcompetitionstats (stats). İlgili kolonlar boş gösterilecek.",
            service.Get(null).Schema.Warnings);
    }
}
