using Dapper;
using FcMarket.Api.Data;
using FcMarket.Api.Domain;
using FcMarket.Api.FieldMaps;
using FcMarket.Api.Market;
using Microsoft.Data.Sqlite;
using Microsoft.Extensions.Logging.Abstractions;

namespace FcMarket.Tests;

public sealed class MatchAnalysisTests : IDisposable
{
    readonly string db = Path.Combine(Path.GetTempPath(), "fc-matches-" + Guid.NewGuid().ToString("N") + ".db");
    readonly MatchAnalysisService service;
    public MatchAnalysisTests()
    {
        Edit("""
            CREATE TABLE snapshots(snapshot_id TEXT PRIMARY KEY,save_uid TEXT,game_date TEXT,exported_at TEXT,user_teamid INTEGER,
              user_team_name TEXT,transfer_budget INTEGER,wage_budget INTEGER,branch INTEGER,branch_reason TEXT,source TEXT,revision INTEGER);
            INSERT INTO snapshots VALUES('S','A','2030-07-28','2026-10-30T01:00:00',10,'Ev',NULL,NULL,1,'ilk','save',1),
              ('P','A','2030-07-31','2026-10-30T02:00:00',10,'Ev',NULL,NULL,1,'devam','export',0),
              ('F','A','2030-08-01','2026-10-29T00:00:00',10,'Ev',NULL,NULL,1,'devam','save',0),
              ('B','A','2030-07-31','2026-10-30T03:00:00',10,'Ev',NULL,NULL,2,'dal','export',0),
              ('X','Z','2030-07-31','2026-10-30T00:00:00',90,'Başka',NULL,NULL,1,'ilk','save',0);
            CREATE TABLE save_heads(slot TEXT,snapshot_id TEXT,source_path TEXT,written_at TEXT);
            INSERT INTO save_heads VALUES('one','S','test','2026-10-30T04:00:00');
            CREATE TABLE raw_career_competitions(snapshot_id TEXT,compid,code);
            INSERT INTO raw_career_competitions VALUES('S',10,'C68'),('S',20,'CRTR');
            CREATE TABLE raw_career_standings(snapshot_id TEXT,standingindex,groupid,teamid);
            INSERT INTO raw_career_standings VALUES('S',0,1,10),('S',1,1,20),('S',2,2,30),('S',3,2,40);
            CREATE TABLE raw_career_fixtures(snapshot_id TEXT,fixtureindex,compid,round,date,time,homeslot,awayslot,homegoals,awaygoals,status);
            INSERT INTO raw_career_fixtures VALUES
              ('S',1,20,1,20300719,1600,0,1,3,0,1),('S',2,20,2,20300723,1600,1,0,0,1,1),
              ('S',3,20,3,20300727,1600,0,1,4,2,1),('S',4,10,1,20300718,1600,0,1,0,0,1),
              ('S',5,10,2,20300717,1600,1,0,2,0,1),('S',6,10,3,20300716,1600,0,1,1,2,1),
              ('S',7,10,4,20300729,1600,0,1,9,0,1),('S',8,10,5,20300726,1600,0,1,0,0,0),
              ('S',9,10,6,20300725,1600,0,1,NULL,0,1),('S',10,10,7,20300724,1600,2,3,8,0,1),
              ('S',11,20,1,20300719,1600,0,1,3,0,1),('F',1,20,1,20300730,1600,0,1,9,9,1);
            CREATE TABLE raw_teams(snapshot_id TEXT,teamid,teamname);
            INSERT INTO raw_teams VALUES('S',10,'Ev'),('S',20,'Rakip');
            CREATE TABLE raw_leagues(snapshot_id TEXT,leagueid,leaguename);
            INSERT INTO raw_leagues VALUES('S',68,'Süper Lig');
            """);
        service = new(new CareerDb(db), new FieldMapProvider(Path.Combine(TestConfig.RepoRoot, "config/field-map.json"), NullLogger<FieldMapProvider>.Instance),
            new MarketLoader(new Valuator(TestConfig.Valuation), new OpportunityScorer(TestConfig.Opportunity), TestConfig.Season, TestConfig.Market),
            NullLogger<MatchAnalysisService>.Instance);
    }
    void Edit(string sql) { using var con = new SqliteConnection($"Data Source={db}"); con.Open(); con.Execute(sql); }
    [Fact] public void Last_five_uses_our_score_and_ignores_future_unplayed_duplicates_and_unrelated_games()
    {
        var v = service.Get("A");
        Assert.Equal("S", v.Snapshot.SnapshotId); Assert.Equal("S", v.FixtureSource!.SnapshotId);
        Assert.Equal(6, v.Available); Assert.Equal([3, 2, 1, 4, 5], v.Matches.Select(m => m.Id));
        Assert.Equal(new MatchSummary(5, 3, 1, 1, 8, 4, 3, 3), v.Summary);
        Assert.False(v.Matches[1].IsHome); Assert.Equal(1, v.Matches[1].GoalsFor); Assert.Equal("W", v.Matches[1].Result);
        Assert.Equal("D", v.Matches[3].Result); Assert.Equal(0, v.Matches[3].GoalsFor);
        Assert.All(v.Matches, m => Assert.Equal("Rakip", m.Opponent));
    }
    [Fact] public void Competition_filter_and_larger_windows_do_not_fabricate_missing_games()
    {
        var v = service.Get("A", 10, 20);
        Assert.Equal(3, v.Available); Assert.Equal(3, v.Summary!.Played); Assert.Equal(3, v.Summary.Won);
        Assert.All(v.Matches, m => Assert.Equal("Hazırlık turnuvası", m.Competition));
        Assert.Equal(6, service.Get("A", 20).Summary!.Played);
        Assert.Null(service.Get("A", 5, 999).Summary); Assert.Empty(service.Get("A", 5, 999).Matches);
    }
    [Fact] public void Preview_has_explicit_older_fixture_source_and_never_reads_a_future_or_other_branch()
    {
        Edit("UPDATE snapshots SET branch=3 WHERE snapshot_id='F'; UPDATE snapshots SET exported_at='2026-10-30T05:00:00' WHERE snapshot_id='P'");
        var v = service.Get("A@1");
        Assert.Equal("P", v.Snapshot.SnapshotId); Assert.Equal("S", v.FixtureSource!.SnapshotId);
        Assert.DoesNotContain(v.Matches, m => m.GoalsFor == 9);
        Assert.Null(service.Get("A@2").FixtureSource); Assert.Null(service.Get("A@2").Summary);
        Assert.Null(service.Get("Z").Summary);
    }
    [Fact] public void Missing_blocks_are_unknown_and_old_database_has_no_warning_requirement()
    {
        Edit("DROP TABLE raw_career_fixtures");
        var v = service.Get("A"); Assert.Null(v.Summary); Assert.Null(v.FixtureSource); Assert.Empty(v.Matches);
        using var con = new CareerDb(db).Open(); Assert.Empty(new CareerDb(db).ImportWarnings(con));
    }
    [Fact] public void Daily_inherited_blocks_do_not_replace_the_actual_save_source_date()
    {
        Edit("UPDATE snapshots SET branch=3 WHERE snapshot_id='F'; UPDATE snapshots SET source='daily' WHERE snapshot_id='P'; " +
             "INSERT INTO raw_career_fixtures SELECT 'P',fixtureindex,compid,round,date,time,homeslot,awayslot,homegoals,awaygoals,status FROM raw_career_fixtures WHERE snapshot_id='S'");
        var v = service.Get("A@1"); Assert.Equal("P", v.Snapshot.SnapshotId); Assert.Equal("S", v.FixtureSource!.SnapshotId);
    }
    [Fact] public void Import_warnings_are_separate_from_failed_sources()
    {
        Edit("CREATE TABLE import_warnings(file_name TEXT,message TEXT,last_seen TEXT); INSERT INTO import_warnings VALUES('names','truncated','2026-10-30')");
        using var con = new CareerDb(db).Open();
        Assert.Empty(new CareerDb(db).ImportIssues(con)); Assert.Equal("truncated", new CareerDb(db).ImportWarnings(con).Single().Message);
    }
    [Theory] [InlineData(0)] [InlineData(6)] [InlineData(100)]
    public void Invalid_windows_fail(int n) => Assert.Throws<BadRequestException>(() => service.Get("A", n));
    public void Dispose() { SqliteConnection.ClearAllPools(); File.Delete(db); }
}
