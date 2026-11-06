using FcMarket.Api.Data;
using FcMarket.Api.Domain;
using FcMarket.Api.FieldMaps;
using FcMarket.Api.Market;
using Microsoft.Data.Sqlite;
using Microsoft.Extensions.Logging.Abstractions;

namespace FcMarket.Tests;

/// <summary>
/// Kariyer dalları: dal 1 Kasım'a kadar oynandı, sonra Ekim başındaki kayıt yüklenip dal 2 oynanıyor (en son export
/// dal 2'de). Dal desteği importer.py'nin snapshots.branch / branches tablolarıyla aynı biçimde.
/// </summary>
public sealed class BranchTests : IDisposable
{
    private readonly string _dbPath = Path.Combine(Path.GetTempPath(), $"fcmarket-branch-{Guid.NewGuid():N}.db");
    private readonly string _facesDir = Path.Combine(Path.GetTempPath(), $"fcmarket-faces-{Guid.NewGuid():N}");
    private readonly MarketService _service;

    public BranchTests()
    {
        using (var con = new SqliteConnection($"Data Source={_dbPath}"))
        {
            con.Open();
            using var cmd = con.CreateCommand();
            cmd.CommandText = """
                CREATE TABLE snapshots (snapshot_id TEXT PRIMARY KEY, save_uid TEXT, game_date TEXT, exported_at TEXT,
                    reason TEXT, user_teamid INTEGER, user_team_name TEXT, transfer_budget INTEGER, wage_budget INTEGER,
                    exporter_version TEXT, files TEXT, imported_at TEXT, branch INTEGER, branch_reason TEXT);
                CREATE TABLE branches (save_uid TEXT NOT NULL, branch INTEGER NOT NULL, parent_branch INTEGER,
                    fork_date TEXT, first_snapshot TEXT, PRIMARY KEY (save_uid, branch));
                INSERT INTO snapshots (snapshot_id, save_uid, game_date, exported_at, user_teamid, user_team_name, branch, branch_reason)
                VALUES ('A', 'SAVE1', '2026-09-01', '2026-10-20T10:00:00Z', 1, 'Ev FK', 1, 'ilk snapshot'),
                       ('B', 'SAVE1', '2026-10-01', '2026-10-20T10:01:00Z', 1, 'Ev FK', 1, 'devam'),
                       ('C', 'SAVE1', '2026-11-01', '2026-10-20T10:02:00Z', 1, 'Ev FK', 1, 'devam'),
                       ('D', 'SAVE1', '2026-10-01', '2026-10-21T10:00:00Z', 1, 'Ev FK', 2, 'yeni dal'),
                       ('E', 'SAVE1', '2026-10-20', '2026-10-21T10:01:00Z', 1, 'Ev FK', 2, 'devam'),
                       ('X', 'SAVE2', '2027-05-01', '2026-10-19T10:00:00Z', 5, 'Başka FK', 1, 'ilk snapshot');
                INSERT INTO branches VALUES ('SAVE1', 1, NULL, NULL, 'A'), ('SAVE1', 2, 1, '2026-10-01', 'D'),
                       ('SAVE2', 1, NULL, NULL, 'X');
                CREATE TABLE raw_players (snapshot_id TEXT NOT NULL, playerid, overallrating, potential);
                CREATE TABLE raw_player_names (snapshot_id TEXT NOT NULL, playerid, name, club_teamid);
                CREATE TABLE raw_teams (snapshot_id TEXT NOT NULL, teamid, teamname);
                INSERT INTO raw_players VALUES ('A', 1, 70, 85), ('B', 1, 71, 85), ('C', 1, 74, 86),
                       ('D', 1, 71, 85), ('E', 1, 72, 88), ('X', 9, 60, 70);
                INSERT INTO raw_player_names VALUES ('A', 1, 'Genç', 10), ('B', 1, 'Genç', 10), ('C', 1, 'Genç', 10),
                       ('D', 1, 'Genç', 10), ('E', 1, 'Genç', 10), ('X', 9, 'Diğer', 10);
                INSERT INTO raw_teams VALUES ('A', 10, 'Alfa'), ('B', 10, 'Alfa'), ('C', 10, 'Alfa'), ('D', 10, 'Alfa'),
                       ('E', 10, 'Alfa'), ('X', 10, 'Alfa');
                """;
            cmd.ExecuteNonQuery();
        }
        SqliteConnection.ClearAllPools();

        var fieldMapPath = Path.Combine(TestConfig.RepoRoot, "config", "field-map.json");
        var loader = new MarketLoader(new Valuator(TestConfig.Valuation), new OpportunityScorer(TestConfig.Opportunity),
            TestConfig.Season, TestConfig.Market);
        _service = new MarketService(new CareerDb(_dbPath), new FieldMapProvider(fieldMapPath, NullLogger<FieldMapProvider>.Instance),
            loader, TestConfig.Market, TestConfig.PositionRatingsFile, new FaceStore(_facesDir), NullLogger<MarketService>.Instance);
    }

    public void Dispose()
    {
        SqliteConnection.ClearAllPools();
        foreach (var f in new[] { _dbPath, _dbPath + "-wal", _dbPath + "-shm" })
            if (File.Exists(f)) File.Delete(f);
        if (Directory.Exists(_facesDir)) Directory.Delete(_facesDir, recursive: true);
    }

    [Theory]
    [InlineData(null, null, null)]
    [InlineData("SAVE1", "SAVE1", null)]
    [InlineData("SAVE1@2", "SAVE1", 2L)]
    [InlineData("a@b@3", "a@b", 3L)]
    [InlineData("SAVE1@x", "SAVE1@x", null)]
    public void Career_key_parses_save_and_branch(string? key, string? save, long? branch) =>
        Assert.Equal(new CareerKey(save, branch), CareerKey.Parse(key));

    [Fact]
    public void Default_is_most_recently_observed_branch_not_furthest_date()
    {
        var data = _service.Get(null);
        Assert.Equal("E", data.Snapshot.SnapshotId); // dal 1'in 1 Kasım'ı daha ileri ama en son oynanan dal 2
        Assert.Equal("SAVE1@2", data.Snapshot.CareerKey);
        Assert.Equal("E", _service.Get("SAVE1").Snapshot.SnapshotId);
    }

    [Fact]
    public void Explicit_branch_loads_its_tip()
    {
        Assert.Equal("C", _service.Get("SAVE1@1").Snapshot.SnapshotId);
        Assert.Equal("X", _service.Get("SAVE2").Snapshot.SnapshotId);
        Assert.Throws<NotFoundException>(() => _service.Get("SAVE1@7"));
    }

    [Fact]
    public void Growth_compares_with_previous_snapshot_of_same_branch()
    {
        Assert.Equal(1, _service.Get("SAVE1@2").Find(1)!.OvrDelta); // E 72 - D 71 (dal 1'in C=74'ü değil)
        Assert.Equal(3, _service.Get("SAVE1@1").Find(1)!.OvrDelta); // C 74 - B 71
    }

    [Fact]
    public void History_follows_branch_lineage()
    {
        var b2 = _service.History(1, "SAVE1@2");
        Assert.Equal(["2026-09-01", "2026-10-01", "2026-10-20"], b2.Select(h => h.GameDate.ToString("yyyy-MM-dd")));
        Assert.Equal([70, 71, 72], b2.Select(h => h.Overall!.Value));

        var b1 = _service.History(1, "SAVE1@1");
        Assert.Equal([70, 71, 74], b1.Select(h => h.Overall!.Value));
        Assert.Equal(["E", "D", "A"], _service.Snapshots("SAVE1@2").Select(s => s.SnapshotId));
    }

    [Fact]
    public void Same_day_save_merge_invalidates_cached_market()
    {
        Assert.Equal(72, _service.Get("SAVE1@2").Find(1)!.Overall);
        using (var con = new SqliteConnection($"Data Source={_dbPath}"))
        {
            con.Open();
            using var cmd = con.CreateCommand();
            cmd.CommandText = """
                ALTER TABLE snapshots ADD COLUMN source TEXT NOT NULL DEFAULT 'export';
                ALTER TABLE snapshots ADD COLUMN revision INTEGER NOT NULL DEFAULT 0;
                UPDATE snapshots SET source='save',revision=1 WHERE snapshot_id='E';
                UPDATE raw_players SET overallrating=76 WHERE snapshot_id='E';
                """;
            cmd.ExecuteNonQuery();
        }
        var updated = _service.Get("SAVE1@2");
        Assert.Equal(76, updated.Find(1)!.Overall);
        Assert.Equal("save", updated.Snapshot.Source);
        Assert.Equal(1, updated.Snapshot.Revision);
    }

    [Fact]
    public void Slot_careers_hide_only_when_the_same_team_has_a_career_as_new()
    {
        void Add(string id, string uid, string date, int team)
        {
            using var con = new SqliteConnection($"Data Source={_dbPath}"); con.Open();
            using var cmd = con.CreateCommand();
            cmd.CommandText = $"INSERT INTO snapshots (snapshot_id, save_uid, game_date, exported_at, user_teamid, user_team_name, branch) VALUES ('{id}','{uid}','{date}','2026-10-31T10:00:00Z',{team},'T',NULL)";
            cmd.ExecuteNonQuery();
        }
        Add("O", "slot-old", "2026-07-22", 1924); Add("K", "slot-keep", "2026-07-22", 7);
        Assert.Contains(_service.Saves(), s => s.SaveUid == "slot-old");
        Add("L", "REALUID", "2026-07-23", 1924);
        SqliteConnection.ClearAllPools();
        var saves = _service.Saves().Select(s => s.SaveUid).ToArray();
        Assert.DoesNotContain("slot-old", saves); Assert.Contains("REALUID", saves); Assert.Contains("slot-keep", saves);
    }

    [Fact]
    public void Saves_list_branches_and_active_one()
    {
        var saves = _service.Saves();
        Assert.Equal(["SAVE1", "SAVE2"], saves.Select(s => s.SaveUid)); // en son gözlemlenen önce
        var s1 = saves[0];
        Assert.Equal("SAVE1@2", s1.Latest.CareerKey);
        Assert.Equal(new DateOnly(2026, 10, 20), s1.LastGameDate);
        Assert.Equal(2, s1.Branches.Count);
        var b2 = s1.Branches.Single(b => b.Branch == 2);
        Assert.True(b2.Active);
        Assert.Equal(1, b2.ParentBranch);
        Assert.Equal(new DateOnly(2026, 10, 1), b2.ForkDate);
        Assert.Equal("yeni dal", b2.Reason);
        Assert.False(s1.Branches.Single(b => b.Branch == 1).Active);
        Assert.Equal(new DateOnly(2026, 11, 1), s1.Branches.Single(b => b.Branch == 1).LastGameDate);
    }

    [Fact]
    public void Save_slot_labels_stay_with_their_career_and_do_not_invent_lineage()
    {
        using var con = new SqliteConnection($"Data Source={_dbPath}");
        con.Open();
        using var cmd = con.CreateCommand();
        cmd.CommandText = """
            CREATE TABLE save_slots (slot TEXT PRIMARY KEY,save_uid TEXT,branch INTEGER,title TEXT,source_path TEXT,last_date TEXT);
            INSERT INTO save_slots VALUES
              ('a','SAVE1',1,'Maç öncesi','C:\private\CmMgrC-one','2026-11-01'),
              ('b','SAVE1',2,'Maç sonrası','C:\private\CmMgrC-two','2026-10-20'),
              ('c','SAVE2',1,'Başka kariyer','/private/CmMgrC-other','2027-05-01');
            UPDATE branches SET parent_branch=NULL,fork_date=NULL WHERE save_uid='SAVE1' AND branch=2;
            """;
        cmd.ExecuteNonQuery();
        var save = _service.Saves().Single(s => s.SaveUid == "SAVE1");
        var second = save.Branches.Single(b => b.Branch == 2);
        Assert.Equal(new BranchSaveSlot("Maç sonrası", "CmMgrC-two", new DateOnly(2026, 10, 20)), Assert.Single(second.Slots!));
        Assert.Null(second.ParentBranch);
        Assert.Null(second.ForkDate);
        Assert.Equal(["D", "E"], _service.History(1, "SAVE1@2").Select(h => h.SnapshotId));
        Assert.Equal("Maç öncesi", Assert.Single(save.Branches.Single(b => b.Branch == 1).Slots!).Title);
    }

    [Fact]
    public void Disk_checkpoint_is_default_and_export_future_requires_explicit_preview()
    {
        using (var con = new SqliteConnection($"Data Source={_dbPath}"))
        {
            con.Open();
            using var cmd = con.CreateCommand();
            cmd.CommandText = """
                ALTER TABLE snapshots ADD COLUMN source TEXT NOT NULL DEFAULT 'export';
                ALTER TABLE snapshots ADD COLUMN revision INTEGER NOT NULL DEFAULT 0;
                CREATE TABLE save_heads (slot TEXT PRIMARY KEY,snapshot_id TEXT,source_path TEXT,written_at TEXT);
                INSERT INTO save_heads VALUES ('disk','B','test-save','2026-10-20T10:01:00Z');
                UPDATE snapshots SET source='save' WHERE snapshot_id='B';
                CREATE TABLE player_daily (save_uid TEXT,branch INTEGER,game_date TEXT,playerid INTEGER,overall INTEGER,potential INTEGER,teamid INTEGER);
                INSERT INTO player_daily VALUES ('SAVE1',1,'2026-12-01',1,99,99,10);
                """;
            cmd.ExecuteNonQuery();
        }
        var data = _service.Get("SAVE1");
        Assert.Equal("B", data.Snapshot.SnapshotId);
        Assert.Equal(71, data.Find(1)!.Overall);
        Assert.Equal(["B", "A"], _service.Snapshots("SAVE1").Select(s => s.SnapshotId));
        Assert.Equal([70, 71], _service.History(1, "SAVE1").Select(p => p.Overall!.Value));
        Assert.Equal("C", _service.Get("SAVE1@1").Snapshot.SnapshotId);
        var sync = _service.Sync("SAVE1");
        Assert.Equal("B", sync.Saved!.SnapshotId);
        Assert.Equal("E", sync.PendingExport!.SnapshotId);
        Assert.Equal("B", _service.Saves().Single(s => s.SaveUid == "SAVE1").Latest.SnapshotId);
        var db = new CareerDb(_dbPath);
        using var reopened = db.Open();
        Assert.Equal("B", db.LatestSnapshot(reopened, "SAVE1").SnapshotId);
    }

    [Fact]
    public void Disk_head_rewind_and_same_day_revision_are_visible_without_deleting_exports()
    {
        using var con = new SqliteConnection($"Data Source={_dbPath}");
        con.Open();
        using var cmd = con.CreateCommand();
        cmd.CommandText = """
            ALTER TABLE snapshots ADD COLUMN source TEXT NOT NULL DEFAULT 'export';
            ALTER TABLE snapshots ADD COLUMN revision INTEGER NOT NULL DEFAULT 0;
            CREATE TABLE save_heads (slot TEXT PRIMARY KEY,snapshot_id TEXT,source_path TEXT,written_at TEXT);
            INSERT INTO save_heads VALUES ('disk','E','test-save','2026-10-22T10:00:00Z');
            UPDATE snapshots SET source='save' WHERE snapshot_id IN ('A','E');
            """;
        cmd.ExecuteNonQuery();
        Assert.Equal("E", _service.Get("SAVE1").Snapshot.SnapshotId);
        Assert.Null(_service.Sync("SAVE1").PendingExport);
        cmd.CommandText = "UPDATE save_heads SET snapshot_id='A',written_at='2026-10-23T10:00:00Z'";
        cmd.ExecuteNonQuery();
        Assert.Equal("A", _service.Get("SAVE1").Snapshot.SnapshotId);
        cmd.CommandText = "UPDATE snapshots SET revision=revision+1 WHERE snapshot_id='A'; UPDATE raw_players SET overallrating=73 WHERE snapshot_id='A'";
        cmd.ExecuteNonQuery();
        Assert.Equal(1, _service.Sync("SAVE1").Current!.Revision);
        Assert.Equal(73, _service.Get("SAVE1").Find(1)!.Overall);
        Assert.Equal("C", _service.Get("SAVE1@1").Snapshot.SnapshotId);
    }

    [Fact]
    public void Import_issues_are_available_even_when_no_career_has_imported_yet()
    {
        using var con = new SqliteConnection($"Data Source={_dbPath}");
        con.Open();
        using var cmd = con.CreateCommand();
        cmd.CommandText = """
            CREATE TABLE import_issues (source_key TEXT,file_name TEXT,message TEXT,last_seen TEXT);
            INSERT INTO import_issues VALUES ('export:broken','broken','CSV missing','2026-10-29');
            DELETE FROM snapshots;
            """;
        cmd.ExecuteNonQuery();
        var sync = _service.Sync(null);
        Assert.Null(sync.Current);
        Assert.Equal("broken", Assert.Single(sync.Issues).FileName);
    }
}
