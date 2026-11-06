using FcMarket.Api.Data;
using FcMarket.Api.Domain;
using FcMarket.Api.FieldMaps;
using FcMarket.Api.Market;
using Microsoft.Data.Sqlite;
using Microsoft.Extensions.Logging.Abstractions;

namespace FcMarket.Tests;

/// <summary>
/// Gerçek SQLite dosyasıyla uçtan uca: eksik tablo/kolonlar çökertmemeli, metrikler hesaplanmalı,
/// filtre/sıralama doğru çalışmalı. Şema importer.py'nin ürettiğiyle aynı biçimde (raw_*, snapshot_id).
/// </summary>
public sealed class MarketTests : IDisposable
{
    private readonly string _dbPath = Path.Combine(Path.GetTempPath(), $"fcmarket-test-{Guid.NewGuid():N}.db");
    private readonly string _facesDir = Path.Combine(Path.GetTempPath(), $"fcmarket-faces-{Guid.NewGuid():N}");
    private readonly string _appDbPath = Path.Combine(Path.GetTempPath(), $"fcmarket-app-{Guid.NewGuid():N}.db");
    private readonly MarketService _service;
    private readonly ShortlistService _shortlist;
    private readonly FeedService _feed;

    private static readonly DateOnly Epoch = new(1582, 10, 14);
    private static int Days(string date) => DateOnly.Parse(date).DayNumber - Epoch.DayNumber;

    public MarketTests()
    {
        using (var con = new SqliteConnection($"Data Source={_dbPath}"))
        {
            con.Open();
            Exec(con, """
                CREATE TABLE snapshots (snapshot_id TEXT PRIMARY KEY, save_uid TEXT, game_date TEXT, exported_at TEXT,
                    reason TEXT, user_teamid INTEGER, user_team_name TEXT, transfer_budget INTEGER, wage_budget INTEGER,
                    exporter_version TEXT, files TEXT, imported_at TEXT);
                INSERT INTO snapshots (snapshot_id, save_uid, game_date, exported_at, user_teamid, user_team_name, transfer_budget)
                VALUES ('S_20260901', 'SAVE1', '2026-09-01', '2026-10-16T20:00:00Z', 1, 'Ev FK', 20000000),
                       ('S_20261101', 'SAVE1', '2026-11-01', '2026-10-16T20:00:01Z', 1, 'Ev FK', 18000000);
                -- weakfootabilitytypecode, sözleşme alanları ve özelliklerin çoğu YOK; leagues, nations, teamplayerlinks YOK
                CREATE TABLE raw_players (snapshot_id TEXT NOT NULL, playerid, overallrating, potential, birthdate,
                    preferredposition1, preferredposition2, nationality, preferredfoot, acceleration, sprintspeed, gkdiving);
                CREATE TABLE raw_player_names (snapshot_id TEXT NOT NULL, playerid, name, club_teamid);
                CREATE TABLE raw_teams (snapshot_id TEXT NOT NULL, teamid, teamname);
                CREATE TABLE raw_leagueteamlinks (snapshot_id TEXT NOT NULL, leagueid, teamid);
                """);
            foreach (var snap in new[] { "S_20260901", "S_20261101" })
            {
                var late = snap == "S_20261101";
                Exec(con, $"""
                    INSERT INTO raw_players VALUES
                      ('{snap}', 1, {(late ? 72 : 70)}, 88, {Days("2007-05-01")}, 25, -1, 48, 2, 80, 84, 10),
                      ('{snap}', 2, 81, 82, {Days("1995-01-10")}, 5, -1, 14, 1, 60, 62, 12),
                      ('{snap}', 3, 75, 80, {Days("2001-12-31")}, 0, -1, 48, 1, 40, 41, 77),
                      ('{snap}', 4, NULL, NULL, NULL, 99, -1, NULL, NULL, NULL, NULL, NULL);
                    INSERT INTO raw_player_names VALUES ('{snap}', 1, 'Arda Şimşek', 10), ('{snap}', 2, 'İlkay Öztürk', {(late ? 11 : 10)}),
                      ('{snap}', 3, 'Kaleci Bir', 11);
                    INSERT INTO raw_teams VALUES ('{snap}', 10, 'Alfa SK'), ('{snap}', 11, 'Beta FK');
                    INSERT INTO raw_leagueteamlinks VALUES ('{snap}', 68, 10), ('{snap}', 200, 10), ('{snap}', 13, 11);
                    """);
            }
        }
        SqliteConnection.ClearAllPools();

        var fieldMapPath = Path.Combine(TestConfig.RepoRoot, "config", "field-map.json");
        var loader = new MarketLoader(new Valuator(TestConfig.Valuation), new OpportunityScorer(TestConfig.Opportunity),
            TestConfig.Season, TestConfig.Market);
        _service = new MarketService(new CareerDb(_dbPath), new FieldMapProvider(fieldMapPath, NullLogger<FieldMapProvider>.Instance),
            loader, TestConfig.Market, TestConfig.PositionRatingsFile, new FaceStore(_facesDir), NullLogger<MarketService>.Instance);
        _shortlist = new ShortlistService(new AppDb(_appDbPath), _service);
        _feed = new FeedService(new CareerDb(_dbPath), new FieldMapProvider(fieldMapPath, NullLogger<FieldMapProvider>.Instance),
            _service, _shortlist, TestConfig.Market, new FeedOptions());
    }

    public void Dispose()
    {
        SqliteConnection.ClearAllPools();
        foreach (var f in new[] { _dbPath, _dbPath + "-wal", _dbPath + "-shm", _appDbPath, _appDbPath + "-wal", _appDbPath + "-shm" })
            if (File.Exists(f)) File.Delete(f);
        if (Directory.Exists(_facesDir)) Directory.Delete(_facesDir, recursive: true);
    }

    private static void Exec(SqliteConnection con, string sql)
    {
        using var cmd = con.CreateCommand();
        cmd.CommandText = sql;
        cmd.ExecuteNonQuery();
    }

    [Fact]
    public void Loads_latest_snapshot_with_missing_tables_as_nulls()
    {
        var data = _service.Get(null);
        Assert.Equal("S_20261101", data.Snapshot.SnapshotId);
        Assert.Equal(2027, data.Snapshot.SeasonEndYear);
        Assert.Equal(4, data.Players.Count);

        var p = data.Find(1)!;
        Assert.Equal("Arda Şimşek", p.Name);
        Assert.Equal(19, p.Age); // oyun tarihi 2026-11-01
        Assert.Equal("ST", p.Position);
        Assert.Equal("ATT", p.PositionGroup);
        Assert.Equal("Sol", p.Foot);
        Assert.Equal("Alfa SK", p.Club);
        Assert.Equal(68, p.LeagueId); // birden fazla lig -> en küçük id
        Assert.Null(p.League);        // leagues tablosu yok
        Assert.Null(p.Nation);        // nations tablosu yok
        Assert.Null(p.WeakFoot);      // kolon yok
        Assert.Null(p.ContractEnd);   // sözleşme kolonu yok
        Assert.Equal(2, p.OvrDelta);
        Assert.Equal(82, p.Pace); // 0,45 × 80 + 0,55 × 84 = 82,2 (kart değeri tahmini)
        Assert.Null(p.Shooting);  // şut özellikleri yok
        Assert.Equal(10, p.GkDiving); // ham kayıt; kart ortalaması değil
        Assert.Null(p.GkHandling); // eksik kolon sıfır varsayılmaz
        Assert.Equal(1.0, p.GrowthPerMonth!.Value, precision: 1);
        Assert.NotNull(p.Value);
        Assert.NotNull(p.Opportunity);

        Assert.Contains(data.Schema.Warnings, w => w.Contains("players.contractvaliduntil"));
        Assert.Contains(data.Schema.Warnings, w => w.Contains("weakfootabilitytypecode"));
    }

    [Fact]
    public void Goalkeeper_attributes_use_latest_snapshot_and_preserve_zero_missing_and_invalid_values()
    {
        using var json = System.Text.Json.JsonDocument.Parse(File.ReadAllText(Path.Combine(TestConfig.RepoRoot, "config", "field-map.json")));
        string Field(string key) => json.RootElement.GetProperty("analysisAttributes").GetProperty(key).GetString()!;
        using (var con = new SqliteConnection($"Data Source={_dbPath}"))
        {
            con.Open();
            foreach (var key in new[] { "gkHandling", "gkKicking", "gkReflexes", "gkPositioning" })
                Exec(con, $"ALTER TABLE raw_players ADD COLUMN [{Field(key)}]");
            Exec(con, $"UPDATE raw_players SET [{Field("gkHandling")}] = 99 WHERE snapshot_id='S_20260901'");
            Exec(con, $"UPDATE raw_players SET [{Field("gkHandling")}] = 101, [{Field("gkKicking")}] = 0, [{Field("gkPositioning")}] = 91 WHERE playerid=3 AND snapshot_id='S_20261101'");
        }
        var keeper = _service.Get(null).Find(3)!;
        Assert.Equal(77, keeper.GkDiving);
        Assert.Null(keeper.GkHandling);
        Assert.Equal(0, keeper.GkKicking);
        Assert.Null(keeper.GkReflexes);
        Assert.Equal(91, keeper.GkPositioning);
    }

    [Fact]
    public void Player_with_unknown_fields_still_loads()
    {
        var p = _service.Get(null).Find(4)!;
        Assert.Equal("#4", p.Name);
        Assert.Equal("P99", p.Position);
        Assert.Null(p.PositionGroup);
        Assert.Null(p.Age);
        Assert.Null(p.Value);
    }

    [Fact]
    public void Detail_handles_missing_attributes_and_stats()
    {
        var d = _service.Detail(1, null);
        Assert.Null(d.Stats);
        Assert.DoesNotContain(d.AttributeGroups, g => g.Name == "Kaleci");
        var pace = d.AttributeGroups.Single(g => g.Name == "Hız");
        Assert.Equal(82, pace.Score);
        Assert.Equal("Sprint hızı", pace.Attributes.Single(a => a.Key == "sprintspeed").Label);
        Assert.Null(d.AttributeGroups.Single(g => g.Name == "Pas").Score);

        var gk = _service.Detail(3, null);
        Assert.Contains(gk.AttributeGroups, g => g.Name == "Kaleci");

        // Detay başlıkları (7 kategori) kaleci olmayanda da hepsi; profil kolonları yoksa boş.
        Assert.Equal(["Hücum", "Beceri", "Hareket", "Güç", "Zihinsel", "Savunma", "Kaleci"], d.AttributeCategories.Select(c => c.Name));
        Assert.Equal(82, d.AttributeCategories.Single(c => c.Name == "Hareket").Score); // yalnızca hız özellikleri var
        Assert.Equal((null, null, null, null), (d.Profile.ReleaseClause, d.Profile.JoinDate, d.Profile.InternationalRep, d.Profile.Jersey));
        Assert.Empty(d.Profile.Roles!);
        Assert.Empty(d.Profile.PlayStyles!);
    }

    [Fact]
    public void Detail_has_position_ratings_calibrated_to_overall()
    {
        var d = _service.Detail(1, null); // ST, OVR 72; sadece hız özellikleri var
        var st = d.PositionRatings.Single(r => r.Position == "ST");
        Assert.Null(st.Rating); // bilinen ağırlık %50'nin altında -> boş

        var gk = _service.Detail(3, null); // GK, OVR 75: gkdiving + acceleration/sprintspeed var, gerisi yok
        Assert.Contains(gk.PositionRatings, r => r.Position == "GK");
        Assert.All(gk.PositionRatings, r => Assert.True(r.Rating is null or (>= 1 and <= 99)));
    }

    [Fact]
    public void Face_is_found_only_in_local_folder()
    {
        Assert.False(_service.Detail(1, null).HasFace);
        Directory.CreateDirectory(_facesDir);
        File.WriteAllBytes(Path.Combine(_facesDir, "1.png"), [0x89, 0x50, 0x4E, 0x47]);
        Assert.True(_service.Detail(1, null).HasFace);
        Assert.Equal("image/png", new FaceStore(_facesDir).Find(1)!.Value.ContentType);
        Assert.Null(new FaceStore(_facesDir).Find(2));
    }

    [Fact]
    public void History_tracks_overall_and_club_changes()
    {
        var h = _service.History(2, null);
        Assert.Equal(2, h.Count);
        Assert.Equal(["Alfa SK", "Beta FK"], h.Select(x => x.Club));
        Assert.False(h[0].ClubChanged);
        Assert.True(h[1].ClubChanged);
    }

    [Fact]
    public void History_includes_daily_export_points()
    {
        using (var con = new SqliteConnection($"Data Source={_dbPath}"))
        {
            con.Open();
            using var cmd = con.CreateCommand();
            // 2026-10-05 araya girer; 2026-11-01 snapshot'la aynı gün tekrar eklenmez
            cmd.CommandText = """
                CREATE TABLE player_daily (save_uid TEXT, branch INTEGER, game_date TEXT, playerid INTEGER, overall INTEGER,
                    potential INTEGER, teamid INTEGER);
                INSERT INTO player_daily VALUES ('SAVE1', NULL, '2026-10-05', 2, 77, 85, NULL), ('SAVE1', NULL, '2026-11-01', 2, 1, 1, NULL);
                """;
            cmd.ExecuteNonQuery();
        }
        SqliteConnection.ClearAllPools();
        var h = _service.History(2, null);
        Assert.Equal([new DateOnly(2026, 9, 1), new DateOnly(2026, 10, 5), new DateOnly(2026, 11, 1)], h.Select(x => x.GameDate));
        Assert.Equal(77, h[1].Overall);
        Assert.NotEqual(1, h[2].Overall);
    }

    [Fact]
    public void Unknown_player_and_save_are_not_found()
    {
        Assert.Throws<NotFoundException>(() => _service.Detail(999, null));
        Assert.Throws<NotFoundException>(() => _service.Get("NOPE"));
    }

    [Fact]
    public void Missing_database_is_unavailable_not_crash()
    {
        var db = new CareerDb(Path.Combine(Path.GetTempPath(), $"yok-{Guid.NewGuid():N}.db"));
        Assert.Throws<DataUnavailableException>(() => db.Open());
    }

    [Fact]
    public void Search_ignores_case_and_turkish_diacritics()
    {
        Assert.Equal([2], Ids(new PlayerQuery { Q = "ilkay oz" }));
        Assert.Equal([1], Ids(new PlayerQuery { Q = "SIMSEK" }));
    }

    [Fact]
    public void Filters_combine()
    {
        Assert.Equal([1], Ids(new PlayerQuery { AgeMax = 21, PotMin = 85 }));
        Assert.Equal([2, 1], Ids(new PlayerQuery { Pos = "DEF,ST" }));
        Assert.Equal([3], Ids(new PlayerQuery { Pos = "GK" }));
        Assert.Equal([2, 3], Ids(new PlayerQuery { Club = "11" }));
        Assert.Equal([1], Ids(new PlayerQuery { Foot = "Sol" }));
        Assert.Equal([1], Ids(new PlayerQuery { Foot = "2" }));
        Assert.Empty(Ids(new PlayerQuery { ContractEndsBy = 2030 })); // sözleşme verisi yok -> eşleşmez
    }

    [Fact]
    public void Sort_puts_nulls_last_in_both_directions()
    {
        Assert.Equal([2, 3, 1, 4], Ids(new PlayerQuery { Sort = "ovr", Dir = "desc" }));
        Assert.Equal([1, 3, 2, 4], Ids(new PlayerQuery { Sort = "ovr", Dir = "asc" }));
    }

    [Fact]
    public void Multi_sort_uses_secondary_key()
    {
        // Kulübe göre artan (Alfa: 1; Beta: 2, 3), sonra POT azalan; kulübü olmayan (4) sonda
        Assert.Equal([1, 2, 3, 4], Ids(new PlayerQuery { Sort = "club,pot", Dir = "asc,desc" }));
        Assert.Equal([1, 3, 2, 4], Ids(new PlayerQuery { Sort = "club,pot", Dir = "asc,asc" }));
    }

    [Fact]
    public void Cached_sort_order_is_reused_by_filtered_queries()
    {
        Assert.Equal([1, 2, 3, 4], Ids(new PlayerQuery { Sort = "POT", Dir = "desc" }));
        Assert.Equal([2, 3], Ids(new PlayerQuery { Sort = "pot", Dir = "desc", Club = "11" }));
        Assert.Equal([3, 2], Ids(new PlayerQuery { Sort = "pot", Dir = "asc", Club = "11" }));
    }

    [Fact]
    public void Paging_returns_total_and_clamps_page_size()
    {
        var r = _service.Players(new PlayerQuery { PageSize = 2, Page = 2 });
        Assert.Equal(4, r.Total);
        Assert.Equal([1, 4], r.Items.Select(p => p.Id));
        Assert.Equal(TestConfig.Market.MaxPageSize, _service.Players(new PlayerQuery { PageSize = 100_000 }).PageSize);
    }

    [Fact]
    public void Bad_sort_key_is_bad_request() =>
        Assert.Throws<BadRequestException>(() => _service.Players(new PlayerQuery { Sort = "drop table" }));

    [Fact]
    public void Filter_options_are_derived_from_market()
    {
        var o = _service.FilterOptions(null);
        Assert.Equal(["Alfa SK", "Beta FK"], o.Clubs.Select(c => c.Name));
        Assert.Equal(["Lig 13", "Lig 68"], o.Leagues.Select(l => l.Name).Order());
        Assert.Equal(["GK", "CB", "ST", "P99"], o.Positions.Select(p => p.Label));
        Assert.Equal([19, 31], o.Ranges.Age!);
    }

    [Fact]
    public void Shortlist_changes_rewrite_watchlist_file_for_daily_export()
    {
        var dir = Directory.CreateTempSubdirectory("fcmarket-export-").FullName;
        try
        {
            var appDb = new AppDb(_appDbPath);
            var watch = new WatchlistFile(dir, appDb, NullLogger<WatchlistFile>.Instance);
            var shortlist = new ShortlistService(appDb, _service, watch);
            shortlist.Add(3, null);
            shortlist.Add(1, null);
            Assert.Equal(["1", "3"], File.ReadAllLines(watch.Path));
            shortlist.Remove(3, null);
            Assert.Equal(["1"], File.ReadAllLines(watch.Path));
            new WatchlistFile(Path.Combine(dir, "yok"), appDb, NullLogger<WatchlistFile>.Instance).Write(); // klasör yoksa sessiz
        }
        finally { Directory.Delete(dir, true); }
    }

    [Fact]
    public void Shortlist_add_captures_state_and_is_idempotent()
    {
        var item = _shortlist.Add(1, null);
        Assert.Equal(72, item.AddedOverall);
        Assert.Equal(10, item.AddedClubId);
        Assert.Equal("Alfa SK", item.AddedClub);
        Assert.Equal(new DateOnly(2026, 11, 1), item.AddedGameDate);
        Assert.Equal(0, item.OverallChange);
        Assert.False(item.ClubChanged);
        _shortlist.Add(1, null);
        Assert.Equal(1, _shortlist.List(null).Count);
        Assert.Throws<NotFoundException>(() => _shortlist.Add(999, null));
    }

    [Fact]
    public void Shortlist_update_validates_and_totals()
    {
        _shortlist.Add(1, null);
        _shortlist.Add(3, null);
        var u = _shortlist.Update(1, null, new ShortlistUpdate("  sol bek yedeği ", ["genç", "Genç", " ", "ucuz"], 4_000_000));
        Assert.Equal("sol bek yedeği", u.Note);
        Assert.Equal(["genç", "ucuz"], u.Tags);
        _shortlist.Update(3, null, new ShortlistUpdate(null, null, 1_500_000));

        var list = _shortlist.List(null);
        Assert.Equal(5_500_000, list.TargetPriceTotal);
        Assert.Equal([1, 3], list.Items.Select(i => i.PlayerId));
        Assert.Equal("Arda Şimşek", list.Items[0].Player!.Name);

        Assert.Throws<BadRequestException>(() => _shortlist.Update(1, null, new ShortlistUpdate(null, null, -1)));
        Assert.Throws<BadRequestException>(() => _shortlist.Update(1, null, new ShortlistUpdate(new string('x', 501), null, null)));
        Assert.Throws<NotFoundException>(() => _shortlist.Update(2, null, new ShortlistUpdate(null, null, null)));

        _shortlist.Remove(3, null);
        Assert.Equal([1], _shortlist.List(null).Items.Select(i => i.PlayerId));
    }

    [Fact]
    public void Feed_reports_transfers_for_everyone_and_small_changes_for_watched()
    {
        var all = _feed.Get(new FeedQuery());
        Assert.Equal(2, all.SnapshotCount);
        var t = Assert.Single(all.Items);
        Assert.Equal((FeedService.Transfer, 2, "Alfa SK", "Beta FK", 13), (t.Type, t.PlayerId, t.FromClub, t.ToClub, t.LeagueId));
        Assert.Equal(new DateOnly(2026, 11, 1), t.Date);
        Assert.Equal(FeedService.KindPermanent, t.Kind); // kiralık tablosu yok, serbest takım değil

        // Arda +2 OVR: eşiğin (3) altında, shortlist'e girince haber olur
        _shortlist.Add(1, null);
        var watched = _feed.Get(new FeedQuery { WatchedOnly = true });
        var g = Assert.Single(watched.Items);
        Assert.Equal((FeedService.Growth, 1, 70, 72, true, "Alfa SK"), (g.Type, g.PlayerId!.Value, g.Before!.Value, g.After!.Value, g.Shortlisted, g.ToClub));

        Assert.Equal([FeedService.Transfer], _feed.Get(new FeedQuery { Types = "transfer" }).Items.Select(i => i.Type));
        Assert.Equal("2026/27", all.CurrentSeason);
        Assert.Equal(["2026/27"], all.Seasons);
        Assert.Equal("2026/27", t.Season);
    }

    [Fact]
    public void Feed_merges_career_transfer_archive_across_seasons_and_deduplicates_snapshot_diff()
    {
        using (var con = new SqliteConnection($"Data Source={_dbPath}"))
        {
            con.Open();
            Exec(con, """
                CREATE TABLE career_transfer_archive(
                  save_uid TEXT, branch INTEGER, season TEXT, transfer_date TEXT,
                  playerid INTEGER, from_teamid INTEGER, to_teamid INTEGER,
                  fee INTEGER, wage INTEGER, clause INTEGER, source TEXT, snapshot_id TEXT);
                INSERT INTO career_transfer_archive VALUES
                  ('SAVE1', 0, '2026/27', '2026-10-15', 2, 10, 11, 5350000, 47500, 8450000, 'world', 'S_20261101'),
                  ('SAVE1', 0, '2025/26', '2025-08-10', 1, 11, 10, 1200000, 12000, NULL, 'world', 'S_20260901');
                """);
        }
        var res = _feed.Get(new FeedQuery { Types = "transfer" });
        Assert.Equal("2026/27", res.CurrentSeason);
        Assert.Equal(["2026/27", "2025/26"], res.Seasons);
        Assert.Equal(2, res.Items.Count); // 2 numaralı oyuncunun 100->200 snapshot farkı arşiv kaydıyla tekilleşti
        Assert.Equal((2, new DateOnly(2026, 10, 15), 5350000L, 47500L, 8450000L, "2026/27"),
            (res.Items[0].PlayerId, res.Items[0].Date, res.Items[0].Fee, res.Items[0].Wage, res.Items[0].ReleaseClause, res.Items[0].Season));
        Assert.Equal((1, new DateOnly(2025, 8, 10), 1200000L, "2025/26"),
            (res.Items[1].PlayerId, res.Items[1].Date, res.Items[1].Fee, res.Items[1].Season));

        var only2526 = _feed.Get(new FeedQuery { Types = "transfer", Season = "2025/26" });
        Assert.Equal([1], only2526.Items.Select(x => x.PlayerId!.Value));
    }

    private List<int> Ids(PlayerQuery q) => _service.Players(q).Items.Select(p => p.Id).ToList();
}
