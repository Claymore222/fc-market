using System.Security.Cryptography;
using Dapper;
using FcMarket.Api.Analysis;
using FcMarket.Api.Data;
using FcMarket.Api.Domain;
using FcMarket.Api.FieldMaps;
using FcMarket.Api.Market;
using Microsoft.Data.Sqlite;
using Microsoft.Extensions.Logging.Abstractions;

namespace FcMarket.Tests;

public sealed class SquadAnalysisTests : IDisposable
{
    readonly string dir = Path.Combine(Path.GetTempPath(), "fc-analysis-" + Guid.NewGuid().ToString("N"));
    string Db => Path.Combine(dir, "career.db");
    string App => Path.Combine(dir, "app.db");
    string Map => Path.Combine(dir, "field-map.json");
    string Rules => Path.Combine(dir, "squad-analysis.json");
    string RecruitmentRules => Path.Combine(dir, "recruitment-profiles.json");
    readonly SquadAnalysisService service;
    public SquadAnalysisTests()
    {
        Directory.CreateDirectory(dir);
        File.Copy(Path.Combine(TestConfig.RepoRoot, "config/field-map.json"), Map);
        File.Copy(Path.Combine(TestConfig.RepoRoot, "config/squad-analysis.json"), Rules);
        File.Copy(Path.Combine(TestConfig.RepoRoot, "config/recruitment-profiles.json"), RecruitmentRules);
        Edit("""
            CREATE TABLE snapshots(snapshot_id TEXT PRIMARY KEY,save_uid TEXT,game_date TEXT,exported_at TEXT,
              user_teamid INTEGER,user_team_name TEXT,transfer_budget INTEGER,wage_budget INTEGER,
              branch INTEGER,branch_reason TEXT,source TEXT,revision INTEGER);
            INSERT INTO snapshots VALUES
              ('S','A','2026-07-17','2026-10-30T00:00:00',10,'Ev',500000,9000000,1,'ilk','save',0),
              ('P','A','2026-07-20','2026-10-30T00:01:00',10,'Ev',600000,9000000,1,'devam','export',0),
              ('B','A','2026-07-18','2026-10-30T00:02:00',10,'Ev',700000,9000000,2,'dal','save',0),
              ('X','Z','2027-01-01','2026-10-29T00:00:00',90,'Diğer',NULL,NULL,1,'ilk','save',0);
            CREATE TABLE branches(save_uid TEXT,branch INTEGER,parent_branch INTEGER,fork_date TEXT,first_snapshot TEXT);
            INSERT INTO branches VALUES('A',1,NULL,NULL,'S'),('A',2,1,'2026-07-17','B'),('Z',1,NULL,NULL,'X');
            CREATE TABLE save_heads(slot TEXT PRIMARY KEY,snapshot_id TEXT,source_path TEXT,written_at TEXT);
            INSERT INTO save_heads VALUES('slot','S','copied','2026-10-30T00:00:00');
            CREATE TABLE raw_teamplayerlinks(snapshot_id TEXT,playerid,teamid,position,injury,form);
            CREATE TABLE raw_players(snapshot_id TEXT,playerid,overallrating,potential,birthdate,preferredposition1,
              wage,contractvaliduntil,acceleration,role1,trait1,trait2,icontrait1,icontrait2);
            CREATE TABLE raw_player_names(snapshot_id TEXT,playerid,name);
            CREATE TABLE raw_career_playerfitness(snapshot_id TEXT,playerid,fitness,severity,phase,daystofit,returndate);
            CREATE TABLE raw_career_finance(snapshot_id TEXT,transferbudget,wageheadroom,wagebudget);
            CREATE TABLE raw_teams(snapshot_id TEXT,teamid,buildupplay,defensivedepth);
            CREATE TABLE raw_leagues(snapshot_id TEXT,leagueid,leaguename);
            CREATE TABLE snapshot_tables(snapshot_id TEXT,table_name TEXT,source TEXT);
            INSERT INTO raw_teamplayerlinks VALUES('S',1,10,25,0,3),('S',2,10,28,NULL,NULL),('S',3,99,25,0,3),
              ('P',1,10,25,0,3),('B',1,10,25,0,3),('X',9,90,0,0,3);
            INSERT INTO raw_players VALUES('S',1,80,90,154000,25,0,2030,0,0,0,0,0,0),
              ('S',2,NULL,NULL,NULL,99,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL),
              ('S',3,99,99,154000,25,999999,2035,99,42,1,0,0,0),
              ('P',1,81,91,154000,25,1000,2030,90,142,1,0,0,0),
              ('B',1,82,92,154000,25,1200,2030,80,42,1,0,0,0),
              ('X',9,60,70,154000,0,100,2028,20,1,0,0,0,0);
            INSERT INTO raw_player_names VALUES('S',1,'Bir'),('P',1,'Bir'),('B',1,'Bir'),('X',9,'Başka');
            INSERT INTO raw_career_playerfitness VALUES('S',1,0,0,0,0,NULL),('P',1,100,0,0,0,NULL);
            INSERT INTO raw_career_finance VALUES('S',0,0,9000000);
            INSERT INTO raw_teams VALUES('S',10,2,75);
            INSERT INTO raw_leagues VALUES('S',68,'Lig');
            INSERT INTO snapshot_tables VALUES('S','players','save'),('S','career_playerfitness','export'),
              ('S','teamplayerlinks','save'),('S','career_finance','export'),('P','players','export');
            """);
        service = NewService();
    }
    SquadAnalysisService NewService() => new(new CareerDb(Db), new AppDb(App),
        new FieldMapProvider(Map, NullLogger<FieldMapProvider>.Instance),
        new MarketLoader(new Valuator(TestConfig.Valuation), new OpportunityScorer(TestConfig.Opportunity), TestConfig.Season, TestConfig.Market),
        new ReloadingJsonFile<AnalysisConfig>(Rules, NullLogger.Instance), new ReloadingJsonFile<PositionRatingConfig>(Path.Combine(TestConfig.RepoRoot, "config/position-ratings.json"), NullLogger.Instance), NullLogger<SquadAnalysisService>.Instance);
    void Edit(string sql) { using var c = new SqliteConnection($"Data Source={Db}"); c.Open(); c.Execute(sql); }
    static ManagerProfile Profile() => new() { Formation = "4-2-3-1", Attack = ["wing-play", "direct"], TransferBudget = 0, WeeklyWageBudget = 0,
        RolePreferences = new() { ["4-2-3-1"] = new() { ["ST"] = 42 } }, ProtectedPlayerIds = [1], DeparturePlayerIds = [2], PreferredLeagueIds = [68] };
    static SaveManagerProfile Request(AnalysisProfileView v, ManagerProfile? p = null) => new(v.Context.Snapshot.SnapshotId,
        v.Context.Snapshot.Revision, v.Context.ConfigVersion, v.Version, p ?? Profile());

    [Fact] public void Adapter_uses_disk_head_own_roster_and_preserves_real_zero_and_unknown()
    {
        var c = service.Get("A").Context;
        Assert.Equal(("S", "A@1", "saved"), (c.Snapshot.SnapshotId, c.ScopeKey, c.ViewMode));
        Assert.Equal([1, 2], c.Players.Select(p => p.Id));
        var one = c.Players[0]; var two = c.Players[1];
        Assert.Equal(0, one.WeeklyWage); Assert.Equal(0, one.Fitness); Assert.Equal(0, one.Attributes["acceleration"]);
        Assert.Equal(25, one.SquadSlot); Assert.Equal(3, one.Form); Assert.Null(one.Foot);
        Assert.Empty(one.Roles!); Assert.Empty(one.PlayStyles!); Assert.Equal("known", one.Availability["injuryFlag"].State);
        Assert.Null(two.WeeklyWage); Assert.Null(two.Fitness); Assert.Null(two.Age); Assert.Null(two.Roles); Assert.Null(two.PlayStyles);
        Assert.Equal("#2", two.Name); Assert.Empty(two.Positions); Assert.Equal("missing", two.Availability["injuryFlag"].State);
        Assert.Null(two.Loan.Value); Assert.Equal("missing", two.Loan.State);
        Assert.Equal(34, one.Attributes.Count); Assert.Null(one.Attributes["stamina"]);
        Assert.Equal(0L, c.Inputs["transferBudget"].Value); Assert.Equal(0L, c.Inputs["weeklyWageHeadroom"].Value);
        Assert.Equal("export", c.Inputs["transferBudget"].Origin!.Kind);
        Assert.Equal("unverified", c.Inputs["defensiveDepth"].State);
        Assert.DoesNotContain("CF", c.Catalog.Formations.SelectMany(f => f.Value));
        Assert.DoesNotContain(c.Roles, r => r.Position == "CF");
    }
    [Fact] public void Coverage_counts_fields_not_just_rows_and_keeps_provenance()
    {
        var c = service.Context("A");
        var attrs = c.Coverage.Single(x => x.Key == "attributes");
        Assert.Equal((1, 68, "partial", "save"), (attrs.Known, attrs.Total, attrs.State, attrs.Origin!.Kind));
        var roles = c.Coverage.Single(x => x.Key == "roles"); Assert.Equal((1, 18), (roles.Known, roles.Total));
        Assert.Equal(new DateOnly(2026, 7, 17), attrs.Origin.GameDate);
        Assert.Equal("S", attrs.Origin.SnapshotId);
        Assert.Equal(1, c.Coverage.Single(x => x.Key == "fitness").Known);
    }
    [Fact] public void Missing_finance_and_fitness_never_borrow_from_another_snapshot_or_seasonal_budget()
    {
        var c = service.Context("A@2");
        Assert.Equal(700000L, c.Inputs["transferBudget"].Value);
        Assert.Equal("snapshot", c.Inputs["transferBudget"].Origin!.Kind);
        Assert.Null(c.Inputs["weeklyWageHeadroom"].Value); Assert.Null(c.Players[0].Fitness);
        Assert.Equal("missing", c.Inputs["defensiveDepth"].State);
        Assert.Equal("unknown", c.Coverage.Single(x => x.Key == "overall").Origin!.Kind);
    }
    [Fact] public void Merely_opening_does_not_persist_defaults_and_save_survives_restart()
    {
        var first = service.Get("A"); Assert.Equal(0, first.Version);
        using (var app = new AppDb(App).Open()) Assert.Equal(0, app.ExecuteScalar<int>("SELECT count(*) FROM manager_profiles"));
        var saved = service.Save("A", Request(first)); Assert.Equal(1, saved.Version);
        var reopened = NewService().Get("A");
        Assert.Equal(0, reopened.Profile.TransferBudget); Assert.Equal(0, reopened.Profile.WeeklyWageBudget);
        Assert.Equal(["wing-play", "direct"], reopened.Profile.Attack); Assert.Equal(42, reopened.Profile.RolePreferences["4-2-3-1"]["ST"]);
        Assert.Equal("S", reopened.SavedSnapshotId); Assert.NotNull(reopened.UpdatedAt);
    }
    [Fact] public void Save_branch_and_preview_profiles_do_not_leak_even_with_same_canonical_branch()
    {
        service.Save("A", Request(service.Get("A")));
        var preview = service.Get("A@1");
        Assert.Equal("A@1", preview.Context.ScopeKey); Assert.Equal("preview", preview.Context.ViewMode); Assert.Equal(0, preview.Version);
        service.Save("A@1", Request(preview, new() { Formation = "4-4-2", Horizon = "develop" }));
        service.Save("A@2", Request(service.Get("A@2"), new() { Formation = "3-5-2" }));
        Assert.Equal("4-2-3-1", service.Get("A").Profile.Formation);
        Assert.Equal("4-4-2", service.Get("A@1").Profile.Formation);
        Assert.Equal("3-5-2", service.Get("A@2").Profile.Formation);
        Assert.Equal(0, service.Get("Z").Version);
    }
    [Fact] public void New_disk_head_resolves_new_branch_and_restores_its_preferences()
    {
        service.Save("A", Request(service.Get("A")));
        Edit("UPDATE save_heads SET snapshot_id='B',written_at='2026-10-30T00:03:00'");
        Assert.Equal("A@2", service.Get("A").Context.ScopeKey); Assert.Equal(0, service.Get("A").Version);
        service.Save("A", Request(service.Get("A"), new() { Formation = "4-3-3" }));
        Edit("UPDATE save_heads SET snapshot_id='S'");
        Assert.Equal("4-2-3-1", service.Get("A").Profile.Formation);
    }
    [Fact] public void Stale_revision_head_config_and_version_are_rejected_without_overwrite()
    {
        var first = service.Get("A"); service.Save("A", Request(first));
        Assert.Throws<AnalysisConflictException>(() => service.Save("A", Request(first)));
        var saved = service.Get("A");
        Assert.Throws<AnalysisConflictException>(() => service.Save("A", Request(saved) with { ConfigVersion = "old" }));
        Edit("UPDATE snapshots SET revision=1 WHERE snapshot_id='S'");
        Assert.Throws<AnalysisConflictException>(() => service.Save("A", Request(saved)));
        var revised = service.Get("A");
        Edit("UPDATE save_heads SET snapshot_id='B'");
        Assert.Throws<AnalysisConflictException>(() => service.Save("A", Request(revised)));
        Assert.Equal(0, service.Get("A@1").Version); // preview remains separate
        Edit("UPDATE save_heads SET snapshot_id='S'");
        Assert.Equal(1, service.Get("A").Version);
    }
    public static IEnumerable<object[]> InvalidProfiles()
    {
        var p = Profile();
        yield return [p with { Formation = "CF" }]; yield return [p with { Attack = [] }];
        yield return [p with { SecondaryFormation = p.Formation }]; yield return [p with { TransferBudget = -1 }];
        yield return [p with { DefensiveLine = 101 }]; yield return [p with { ReservePercent = 91 }];
        yield return [p with { MinAge = 30, MaxAge = 20 }]; yield return [p with { PreferredLeagueIds = [9999] }];
        yield return [p with { ProtectedPlayerIds = [3] }]; yield return [p with { DeparturePlayerIds = [1] }];
        yield return [p with { RolePreferences = new() { ["4-2-3-1"] = new() { ["ST"] = 11 } } }];
        yield return [p with { RolePreferences = new() { ["4-4-2"] = new() { ["ST"] = 42 } } }];
        yield return [p with { Attack = null! }]; yield return [p with { RolePreferences = null! }];
    }
    [Theory, MemberData(nameof(InvalidProfiles))] public void Invalid_preferences_fail_without_persisting(ManagerProfile p)
    {
        Assert.Throws<BadRequestException>(() => service.Save("A", Request(service.Get("A"), p)));
        Assert.Equal(0, service.Get("A").Version);
    }
    [Fact] public void Field_map_drives_attribute_names_and_source_database_is_unchanged()
    {
        var json = File.ReadAllText(Map).Replace("\"acceleration\": \"acceleration\"", "\"acceleration\": \"potential\"");
        File.WriteAllText(Map, json);
        SqliteConnection.ClearAllPools();
        var before = SHA256.HashData(File.ReadAllBytes(Db));
        var s = NewService(); Assert.Equal(90, s.Context("A").Players[0].Attributes["acceleration"]);
        s.Save("A", Request(s.Get("A")));
        SqliteConnection.ClearAllPools();
        Assert.Equal(before, SHA256.HashData(File.ReadAllBytes(Db)));
        using var source = new CareerDb(Db).Open(); Assert.Throws<SqliteException>(() => source.Execute("DELETE FROM snapshots"));
    }
    [Fact] public void Absent_roster_and_tables_produce_empty_context_not_invented_players()
    {
        Edit("DROP TABLE raw_teamplayerlinks; DROP TABLE raw_players; DROP TABLE raw_career_finance");
        var c = service.Context("Z"); Assert.Empty(c.Players); Assert.Null(c.SuggestedFormation);
        Assert.Null(c.Inputs["transferBudget"].Value); Assert.All(c.Coverage, x => Assert.Equal("missing", x.State));
        Assert.Throws<NotFoundException>(() => service.Get("missing"));
    }
    [Fact] public void Daily_carry_forward_does_not_claim_a_new_observation_day()
    {
        Edit("UPDATE snapshots SET source='daily' WHERE snapshot_id='P'");
        var c = service.Context("A@1");
        Assert.Equal("inherited", c.Coverage.Single(x => x.Key == "overall").Origin!.Kind);
        Assert.Null(c.Coverage.Single(x => x.Key == "overall").Origin!.GameDate);
    }
    [Fact] public void New_config_keeps_old_preferences_but_marks_their_version_and_rejects_old_requests()
    {
        var before = service.Get("A"); service.Save("A", Request(before));
        File.WriteAllText(Rules, File.ReadAllText(Rules).Replace("\"version\": \"4\"", "\"version\": \"5\""));
        var newer = NewService(); var view = newer.Get("A");
        Assert.NotEqual(view.Context.ConfigVersion, view.SavedConfigVersion);
        Assert.Equal("4-2-3-1", view.Profile.Formation);
        Assert.Throws<AnalysisConflictException>(() => newer.Save("A", Request(before)));
    }
    [Fact] public void Broken_config_or_field_mapping_is_an_explicit_data_error()
    {
        File.WriteAllText(Rules, "{\"formations\":{\"broken\":[\"CF\"]}}");
        Assert.Throws<DataUnavailableException>(() => NewService().Get("A"));
        File.Copy(Path.Combine(TestConfig.RepoRoot, "config/squad-analysis.json"), Rules, true);
        File.WriteAllText(Map, "invalid json");
        Assert.Throws<DataUnavailableException>(() => NewService().Get("A"));
    }
    [Fact] public void Depth_report_persists_reproducible_input_without_saving_draft_or_changing_career()
    {
        SqliteConnection.ClearAllPools();
        var before = SHA256.HashData(File.ReadAllBytes(Db));
        var v = service.Get("A");
        var report = service.Run("A", Request(v));
        Assert.True(report.Draft); Assert.Equal("S", report.Snapshot.SnapshotId);
        Assert.Equal(0, NewService().Get("A").Version);
        var repeat = NewService().Run("A", Request(v)); Assert.Equal(report.Id, repeat.Id);
        using (var c = new AppDb(App).Open())
        {
            Assert.Equal(1, c.QuerySingle<int>("SELECT count(*) FROM analysis_runs"));
            var input = c.QuerySingle<string>("SELECT input_json FROM analysis_runs");
            Assert.Contains("\"scopeKey\":\"A@1\"", input); Assert.Contains("\"formation\":\"4-2-3-1\"", input);
        }
        SqliteConnection.ClearAllPools(); Assert.Equal(before, SHA256.HashData(File.ReadAllBytes(Db)));
    }
    [Fact] public void Report_identity_separates_career_branch_preview_revision_and_profile()
    {
        var profile = new ManagerProfile { Formation = "4-3-3" };
        var ids = new List<string>();
        foreach (var key in new[] { "A", "A@1", "A@2", "Z" }) ids.Add(service.Run(key, Request(service.Get(key), profile)).Id);
        ids.Add(service.Run("A", Request(service.Get("A"), profile with { Horizon = "develop" })).Id);
        Edit("UPDATE snapshots SET revision=1 WHERE snapshot_id='S'");
        ids.Add(service.Run("A", Request(service.Get("A"), profile)).Id);
        Assert.Equal(6, ids.Distinct().Count());
        using var c = new AppDb(App).Open(); Assert.Equal(6, c.QuerySingle<int>("SELECT count(*) FROM analysis_runs"));
    }
    [Fact] public void Stale_analysis_and_invalid_profile_fail_without_storing_report()
    {
        var v = service.Get("A");
        Assert.Throws<AnalysisConflictException>(() => service.Run("A", Request(v) with { ConfigVersion = "old" }));
        Assert.Throws<BadRequestException>(() => service.Run("A", Request(v, Profile() with { Formation = "CF" })));
        service.Save("A", Request(v));
        Assert.Throws<AnalysisConflictException>(() => service.Run("A", Request(v)));
        var newer = service.Get("A"); Edit("UPDATE snapshots SET revision=1 WHERE snapshot_id='S'");
        Assert.Throws<AnalysisConflictException>(() => service.Run("A", Request(newer)));
        using var c = new AppDb(App).Open(); Assert.Equal(0, c.QuerySingle<int>("SELECT count(*) FROM analysis_runs"));
    }
    RecruitmentService NewRecruitment() => new(new CareerDb(Db), new AppDb(App), service,
        new FieldMapProvider(Map, NullLogger<FieldMapProvider>.Instance),
        new MarketLoader(new Valuator(TestConfig.Valuation), new OpportunityScorer(TestConfig.Opportunity), TestConfig.Season, TestConfig.Market),
        new ReloadingJsonFile<RecruitmentConfig>(RecruitmentRules, NullLogger.Instance), new ReloadingJsonFile<PositionRatingConfig>(Path.Combine(TestConfig.RepoRoot, "config/position-ratings.json"), NullLogger.Instance), NullLogger<RecruitmentService>.Instance);
    void RecruitmentPool()
    {
        Edit("""
            ALTER TABLE raw_player_names ADD COLUMN club_teamid INTEGER;
            UPDATE raw_player_names SET club_teamid=10;
            INSERT INTO raw_players(snapshot_id,playerid,overallrating,potential,birthdate,preferredposition1,wage,contractvaliduntil) VALUES
              ('S',4,80,90,154000,25,1000,2035),('S',5,80,90,154000,25,1000,2035),
              ('S',6,80,90,154000,25,1000,2035),('S',7,80,90,154000,25,1000,2035),
              ('S',999,85,95,154000,25,1000,2035);
            INSERT INTO raw_teamplayerlinks VALUES ('S',4,10,28,0,3),('S',5,10,28,0,3),('S',6,10,28,0,3),('S',7,10,28,0,3);
            INSERT INTO raw_player_names VALUES ('S',4,'Dört',10),('S',5,'Beş',10),('S',6,'Altı',10),('S',7,'Yedi',10),('S',999,'Dış Aday',20);
            INSERT INTO raw_teams VALUES('S',20,2,50);
            """);
        using var con = new SqliteConnection($"Data Source={Db}"); con.Open();
        foreach (var raw in TestConfig.FieldMap.AnalysisAttributes.Values.Distinct())
        {
            if (raw != "acceleration") con.Execute($"ALTER TABLE raw_players ADD COLUMN \"{raw}\" INTEGER");
            con.Execute($"UPDATE raw_players SET \"{raw}\"=80 WHERE snapshot_id='S'");
        }
    }
    [Fact] public void Recruitment_reads_exact_snapshot_bulk_fields_and_preserves_source_database()
    {
        RecruitmentPool(); SqliteConnection.ClearAllPools(); var before = SHA256.HashData(File.ReadAllBytes(Db));
        var view = service.Get("A"); var report = service.Run("A", Request(view, Profile() with { TransferBudget = 100_000_000, WeeklyWageBudget = 100_000 })); var r = NewRecruitment();
        var first = r.Get("A", report.Id, "4-2-3-1", "ST");
        Assert.Equal("S", first.Snapshot.SnapshotId); Assert.Contains(first.Groups[0].Candidates, p => p.Id == 999 && p.Name == "Dış Aday");
        Assert.DoesNotContain(first.Groups.SelectMany(g => g.Candidates), p => view.Context.Players.Any(o => o.Id == p.Id));
        Assert.Equal(first, r.Get("A", report.Id, "4-2-3-1", "ST")); // bounded cache hit
        using (var audit = new AppDb(App).Open())
        {
            Assert.Equal(1, audit.QuerySingle<int>("SELECT count(*) FROM recruitment_runs"));
            Assert.Contains("recruitment-3", audit.QuerySingle<string>("SELECT rules_json FROM recruitment_runs"));
            Assert.Contains("Dış Aday", System.Text.Json.JsonDocument.Parse(audit.QuerySingle<string>("SELECT result_json FROM recruitment_runs"))
                .RootElement.GetProperty("groups")[0].GetProperty("candidates")[0].GetProperty("name").GetString());
        }
        SqliteConnection.ClearAllPools(); Assert.Equal(before, SHA256.HashData(File.ReadAllBytes(Db)));
    }
    [Fact] public void Recruitment_rejects_foreign_scope_invalid_target_and_new_revision_even_after_cache_hit()
    {
        RecruitmentPool(); var report = service.Run("A", Request(service.Get("A"))); var r = NewRecruitment();
        r.Get("A", report.Id, "4-2-3-1", "ST");
        Assert.Throws<NotFoundException>(() => r.Get("Z", report.Id, "4-2-3-1", "ST"));
        Assert.Throws<NotFoundException>(() => r.Get("A@1", report.Id, "4-2-3-1", "ST"));
        Assert.Throws<BadRequestException>(() => r.Get("A", report.Id, "4-3-3", "ST"));
        Edit("UPDATE snapshots SET revision=1 WHERE snapshot_id='S'");
        Assert.Throws<AnalysisConflictException>(() => r.Get("A", report.Id, "4-2-3-1", "ST"));
    }
    [Fact] public void Recruitment_rejects_profile_changed_in_another_window()
    {
        RecruitmentPool(); var report = service.Run("A", Request(service.Get("A"))); var r = NewRecruitment();
        r.Get("A", report.Id, "4-2-3-1", "ST");
        service.Save("A", Request(service.Get("A")));
        Assert.Throws<AnalysisConflictException>(() => r.Get("A", report.Id, "4-2-3-1", "ST"));
    }
    [Fact] public void Recruitment_excludes_active_possible_own_loan_and_bad_rules_are_visible()
    {
        RecruitmentPool();
        Edit("CREATE TABLE raw_playerloans(snapshot_id TEXT,playerid,teamidloanedfrom,loandateend);");
        var end = new DateOnly(2035, 6, 30).DayNumber - TestConfig.FieldMap.Epoch.DayNumber;
        Edit($"INSERT INTO raw_playerloans VALUES('S',999,10,{end})");
        var report = service.Run("A", Request(service.Get("A")));
        Assert.All(NewRecruitment().Get("A", report.Id, "4-2-3-1", "ST").Groups, g => { Assert.Empty(g.Candidates); Assert.Empty(g.OverBudget!); });
        File.WriteAllText(RecruitmentRules, "invalid");
        Assert.Throws<DataUnavailableException>(() => NewRecruitment().Get("A", report.Id, "4-2-3-1", "ST"));
    }
    [Fact] public void Transfer_board_opens_without_questions_covers_all_positions_and_never_auto_saves_profile()
    {
        RecruitmentPool(); var b = new RecruitmentBoardService(service, NewRecruitment()).Get("A");
        Assert.Equal(12, b.Positions.Count); Assert.Equal("default", b.FormationSource); Assert.Equal("save", b.TransferBudgetSource);
        Assert.Equal(0, b.View.Profile.TransferBudget); Assert.Equal(0, service.Get("A").Version);
        Assert.Contains(b.Positions, p => !p.InFormation && p.Position == "RW");
        Assert.DoesNotContain(b.Positions, p => p.Position is "RWB" or "LWB");
        Assert.All(b.Positions, p => { Assert.Equal("S", p.Recommendations.Snapshot.SnapshotId); Assert.Equal("A@1", p.Recommendations.ScopeKey); });
        Assert.DoesNotContain(b.Positions, p => p.Position == "CF");
    }
    [Fact] public void Player_style_preferences_persist_per_scope_and_invalid_options_are_rejected()
    {
        var p = Profile() with { PlayerPreferences = new() { ["ST"] = "target-striker", ["RB"] = "technical-back" } };
        service.Save("A", Request(service.Get("A"), p));
        Assert.Equal("target-striker", NewService().Get("A").Profile.PlayerPreferences["ST"]);
        Assert.Empty(service.Get("A@1").Profile.PlayerPreferences); Assert.Empty(service.Get("Z").Profile.PlayerPreferences);
        Assert.Throws<BadRequestException>(() => service.Save("A", Request(service.Get("A"), p with { PlayerPreferences = new() { ["ST"] = "not-a-style" } })));
    }
    [Fact] public void League_clubs_stay_out_of_stored_and_returned_context_but_reach_the_engine()
    {
        RecruitmentPool(); Edit("CREATE TABLE raw_leagueteamlinks(snapshot_id TEXT,leagueid,teamid); INSERT INTO raw_leagueteamlinks VALUES('S',68,10)");
        var view = service.Get("A");
        Assert.Contains(view.Context.LeagueClubs!, c => c.TeamId == 10 && c.Players.Any(p => p.Id == 4 && p.Overall == 80 && p.PositionRatings!["ST"] == 80));
        Assert.DoesNotContain("leagueClubs", System.Text.Json.JsonSerializer.Serialize(view.Context, new System.Text.Json.JsonSerializerOptions(System.Text.Json.JsonSerializerDefaults.Web)));
    }
    TransferPlanService NewTransferPlan()
    {
        var db = new CareerDb(Db); var app = new AppDb(App);
        var map = new FieldMapProvider(Map, NullLogger<FieldMapProvider>.Instance);
        var loader = new MarketLoader(new Valuator(TestConfig.Valuation), new OpportunityScorer(TestConfig.Opportunity), TestConfig.Season, TestConfig.Market);
        var ratings = new ReloadingJsonFile<PositionRatingConfig>(Path.Combine(TestConfig.RepoRoot, "config/position-ratings.json"), NullLogger.Instance);
        var market = new MarketService(db, map, loader, TestConfig.Market, ratings, new FaceStore(Path.Combine(dir, "faces")), NullLogger<MarketService>.Instance);
        var recruitment = NewRecruitment();
        return new(app, service, new RecruitmentBoardService(service, recruitment), recruitment, new ClubService(db, market, ratings),
            new ReloadingJsonFile<TransferPlanConfig>(Path.Combine(TestConfig.RepoRoot, "config/transfer-plans.json"), NullLogger.Instance), ratings,
            new ReloadingJsonFile<TransferSuggestionConfig>(Path.Combine(TestConfig.RepoRoot, "config/transfer-suggestions.json"), NullLogger.Instance), NullLogger<TransferPlanService>.Instance);
    }
    [Fact] public void Transfer_package_persists_only_in_app_db_and_isolates_branches_and_preview()
    {
        RecruitmentPool(); SqliteConnection.ClearAllPools(); var before = SHA256.HashData(File.ReadAllBytes(Db));
        var plans = NewTransferPlan(); var empty = plans.Get("A");
        var request = new TransferPlanRequest(empty.CurrentSource, 0, new("4-2-3-1", [new(999, 100, 10, 0)], [], []));
        var saved = plans.Save("A", request);
        Assert.Equal(1, saved.Version); Assert.Equal(999, Assert.Single(NewTransferPlan().Get("A").Draft!.Transfers).PlayerId);
        Assert.Equal(0, plans.Get("A@1").Version); Assert.Equal(0, plans.Get("A@2").Version); Assert.Equal(0, plans.Get("Z").Version);
        Assert.Throws<AnalysisConflictException>(() => plans.Save("A", request));
        Assert.Equal(1, plans.Get("A").Version);
        SqliteConnection.ClearAllPools(); Assert.Equal(before, SHA256.HashData(File.ReadAllBytes(Db)));
    }
    [Fact] public void Suggested_packages_write_nothing_and_match_a_manual_preview()
    {
        RecruitmentPool(); var plans = NewTransferPlan(); var source = plans.Get("A").CurrentSource;
        var list = plans.Suggest("A", new(source, "4-2-3-1"));
        Assert.Equal(TransferPlanSuggester.Goals, list.Packages.Select(p => p.Goal));
        Assert.Equal(0, plans.Get("A").Version);
        foreach (var package in list.Packages.Where(p => p.Draft is not null))
        {
            var manual = plans.Preview("A", new(source, 0, package.Draft!));
            Assert.Equal(package.Result!.Budget, manual.Budget);
            Assert.DoesNotContain(package.Result.Players, p => p.Fee is null || p.WeeklyWage is null);
        }
        Assert.Throws<AnalysisConflictException>(() => plans.Suggest("Z", new(source, "4-2-3-1")));
        Assert.Throws<BadRequestException>(() => plans.Suggest("A", new(source, "9-9-9")));
    }
    [Fact] public void Transfer_package_keeps_old_result_but_rejects_new_revision_and_profile_conflicts()
    {
        RecruitmentPool(); var plans = NewTransferPlan(); var empty = plans.Get("A");
        var request = new TransferPlanRequest(empty.CurrentSource, 0, new("4-2-3-1", [new(999)], [], []));
        plans.Save("A", request);
        Edit("UPDATE snapshots SET revision=1 WHERE snapshot_id='S'");
        var old = plans.Get("A"); Assert.True(old.Stale); Assert.Equal(0, old.Result!.Source.Revision);
        Assert.Throws<AnalysisConflictException>(() => plans.Save("A", request with { ExpectedVersion = 1 }));
        var refreshed = request with { Source = old.CurrentSource, ExpectedVersion = 1 };
        plans.Save("A", refreshed); Assert.False(plans.Get("A").Stale);
        service.Save("A", Request(service.Get("A")));
        Assert.True(plans.Get("A").Stale);
        Assert.Throws<AnalysisConflictException>(() => plans.Preview("A", refreshed));
        Assert.Throws<AnalysisConflictException>(() => plans.Preview("Z", refreshed));
    }
    [Fact] public void Transfer_package_rejects_own_buys_unknown_players_and_protected_sales()
    {
        RecruitmentPool(); var plans = NewTransferPlan();
        TransferPlanRequest RequestPlan(TransferPlanDraft draft) => new(plans.Get("A").CurrentSource, 0, draft);
        Assert.Throws<BadRequestException>(() => plans.Preview("A", RequestPlan(new("4-2-3-1", [new(1)], [], []))));
        Assert.Throws<BadRequestException>(() => plans.Preview("A", RequestPlan(new("4-2-3-1", [new(999999)], [], []))));
        Assert.Throws<BadRequestException>(() => plans.Preview("A", RequestPlan(new("4-2-3-1", [], [], [new(999)]))));
        service.Save("A", Request(service.Get("A")));
        Assert.Throws<BadRequestException>(() => plans.Preview("A", RequestPlan(new("4-2-3-1", [], [new(1, 100)], []))));
        Assert.Equal(0, plans.Get("A").Version);
    }
    public void Dispose() { SqliteConnection.ClearAllPools(); Directory.Delete(dir, true); }
}
