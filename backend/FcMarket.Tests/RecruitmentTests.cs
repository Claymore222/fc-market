using System.Text.Json;
using FcMarket.Api.Analysis;
using FcMarket.Api.Data;
using FcMarket.Api.Market;

namespace FcMarket.Tests;

public sealed class RecruitmentTests
{
    static readonly JsonSerializerOptions Json = new(JsonSerializerDefaults.Web);
    static RecruitmentConfig Config() => JsonSerializer.Deserialize<RecruitmentConfig>(File.ReadAllText(Path.Combine(TestConfig.RepoRoot, "config/recruitment-profiles.json")), Json)!;
    static AnalysisConfig AnalysisConfig() => JsonSerializer.Deserialize<AnalysisConfig>(File.ReadAllText(Path.Combine(TestConfig.RepoRoot, "config/squad-analysis.json")), Json)!;
    static AnalysisContext Context() => new(new("S", "A", new(2030, 7, 28), 2031, null, 10, "Ev", null, null, 1, "A@1", "save", 1),
        "A@1", "saved", "2-test", "4-3-3", [], [], [], AnalysisConfig(), [], []);
    static DepthReport Report(ManagerProfile? p = null, string position = "CM", int? baseline = 80) => new("R", "now", Context().Snapshot,
        "A@1", "saved", "2-test", "1", "hash", p ?? new() { Formation = "4-3-3", Horizon = "win-now" }, true,
        [new("4-3-3", baseline, baseline - 8, baseline - 14, 0, 0, 0, 0, 0, 0,
            [new("TARGET", position, null, null, null, null, null, null, null, null, "urgent", 100, false, false, [])])], []);
    static RecruitmentPlayer Player(int id, int ovr = 80, int? pot = 90, int? age = 24, string position = "CM",
        int? club = 20, long? wage = 1000, bool free = false, int[]? roles = null, int[]? styles = null, int[]? plus = null,
        Dictionary<string, int?>? attributes = null) => new(new() { Id = id, Name = "Aday " + id, Age = age, Overall = ovr,
            Potential = pot, ClubId = club, Club = "Diğer", Positions = [position], Value = 1000000, Wage = free ? null : wage,
            RecordedWage = wage, IsFreeAgent = free, RoleCodes = roles ?? [], PlayStyleIds = styles ?? [], PlayStylePlusIds = plus ?? [] },
            attributes ?? TestConfig.FieldMap.AnalysisAttributes.Keys.ToDictionary(k => k, _ => (int?)80), true, true);
    static RecruitmentResult Run(RecruitmentPlayer[] players, DepthReport? report = null, HashSet<int>? own = null, RecruitmentConfig? cfg = null, AnalysisContext? ctx = null) =>
        RecruitmentEngine.Build(ctx ?? Context(), report ?? Report(), "4-3-3", "TARGET", players, own ?? [], cfg ?? Config(), "1-test", new Dictionary<string, string>(), TestConfig.FieldMap.PlayStyles);
    static RecruitmentCandidate[] Ranked(RecruitmentResult r) => r.Groups.Single(g => g.Key == "starter").Candidates.ToArray();

    [Fact] public void Same_OVR_profiles_reverse_ranking_for_press_and_low_block()
    {
        var a = Player(1); var b = Player(2);
        foreach (var k in new[] { "stamina", "aggression", "reactions" }) { a.Attributes[k] = 95; b.Attributes[k] = 60; }
        foreach (var k in new[] { "defensiveAwareness", "interceptions", "strength" }) { a.Attributes[k] = 60; b.Attributes[k] = 95; }
        Assert.Equal(1, Ranked(Run([a, b], Report(new() { Formation = "4-3-3", Defense = "high-press", Horizon = "win-now" })))[0].Id);
        Assert.Equal(2, Ranked(Run([a, b], Report(new() { Formation = "4-3-3", Defense = "low-block", Horizon = "win-now" })))[0].Id);
    }
    [Fact] public void Young_high_potential_and_ready_player_change_order_with_project()
    {
        var young = Player(1, ovr: 80, pot: 99, age: 18); var ready = Player(2, ovr: 84, pot: 84, age: 29);
        Assert.Equal(2, Ranked(Run([young, ready]))[0].Id);
        Assert.Equal(1, Ranked(Run([young, ready], Report(new() { Formation = "4-3-3", Horizon = "develop" })))[0].Id);
    }
    [Fact] public void Missing_weighted_attribute_never_creates_favourable_high_score()
    {
        var p = Player(1); p.Attributes["stamina"] = null;
        var result = Run([p]); Assert.Empty(Ranked(result)); Assert.Equal(1, result.Excluded["attributes-missing"]);
    }
    [Fact] public void Critical_defending_floor_blocks_fast_but_weak_CB_even_with_expert_role()
    {
        var p = Player(1, position: "CB", roles: [113]); p.Attributes["defensiveAwareness"] = 20;
        var r = Run([p], Report(position: "CB")); Assert.Empty(Ranked(r)); Assert.Equal(1, r.Excluded["critical-floor"]);
    }
    [Fact] public void Own_loans_unknown_ownership_wrong_position_and_age_are_excluded()
    {
        var r = Run([Player(1, club: 10), Player(2), Player(3, club: null), Player(4, position: "ST"), Player(5, age: 35)],
            Report(new() { Formation = "4-3-3", Horizon = "win-now", MaxAge = 30 }), [2]);
        Assert.Empty(Ranked(r)); Assert.Equal(2, r.Excluded["own-or-loan"]);
        Assert.Equal(1, r.Excluded["ownership-unknown"]); Assert.Equal(1, r.Excluded["position"]); Assert.Equal(1, r.Excluded["age-range"]);
    }
    [Fact] public void Unknown_age_is_not_zero_when_age_filter_is_active()
    {
        var r = Run([Player(1, age: null)], Report(new() { Formation = "4-3-3", Horizon = "win-now", MaxAge = 25 }));
        Assert.Empty(Ranked(r)); Assert.Equal(1, r.Excluded["age-unknown"]);
    }
    [Fact] public void Missing_POT_is_allowed_for_win_now_but_not_fabricated_for_project_score()
    {
        Assert.Single(Ranked(Run([Player(1, pot: null)])));
        var r = Run([Player(1, pot: null)], Report(new() { Formation = "4-3-3", Horizon = "develop" }));
        Assert.Empty(Ranked(r)); Assert.Equal(1, r.Excluded["starter:project-missing"]);
    }
    [Fact] public void Under_ready_floor_youth_is_only_a_development_option()
    {
        var r = Run([Player(1, ovr: 60, age: 18, pot: 95)]);
        Assert.Empty(r.Groups.Single(g => g.Key == "starter").Candidates);
        Assert.Empty(r.Groups.Single(g => g.Key == "rotation").Candidates);
        Assert.Single(r.Groups.Single(g => g.Key == "development").Candidates);
    }
    [Fact] public void Missing_team_reference_produces_no_recommendations()
    {
        var r = Run([Player(1)], Report(baseline: null)); Assert.All(r.Groups, g => Assert.Empty(g.Candidates));
        Assert.Contains(r.Warnings, w => w.Contains("kalite referansı yetersiz"));
    }
    [Fact] public void Role_and_style_bonuses_are_bounded_and_do_not_double_count_same_plus_style()
    {
        var report = Report(position: "ST"); var f = report.Formations[0];
        report = report with { Formations = [f with { Slots = [f.Slots[0] with { PreferredRoleId = 42 }] }] };
        var a = Player(1, position: "ST", roles: [142], styles: [0], plus: [0]);
        var p = Ranked(Run([a], report)).Single(); Assert.Equal(2, p.RoleLevel);
        Assert.Equal(Config().RoleExpertBonus + Config().StylePlusBonus, p.Bonus); Assert.Empty(p.Styles); Assert.Single(p.StylesPlus);
    }
    [Fact] public void Partial_role_metadata_keeps_observed_plus_but_never_claims_absence()
    {
        var report = Report(position: "ST"); var f = report.Formations[0];
        report = report with { Formations = [f with { Slots = [f.Slots[0] with { PreferredRoleId = 42 }] }] };
        Assert.Null(Ranked(Run([Player(1, position: "ST") with { RolesKnown = false }], report)).Single().RoleLevel);
        Assert.Equal(2, Ranked(Run([Player(1, position: "ST", roles: [142]) with { RolesKnown = false }], report)).Single().RoleLevel);
    }
    [Fact] public void Hybrid_wing_preferences_do_not_silently_force_one_foot()
    {
        var r = Run([], Report(new() { Formation = "4-3-3", Attack = ["wing-play", "inside-forwards"] }, "RW"));
        Assert.Null(r.Target.PreferredFoot); Assert.Equal(2, r.Target.Preferences.Count);
    }
    [Fact] public void Unknown_wage_is_not_free_and_zero_budget_is_not_unknown()
    {
        var cfg = Config(); var p = Player(1, free: true, wage: null).Player;
        var profile = new ManagerProfile { TransferBudget = 0, WeeklyWageBudget = 0 };
        var c = RecruitmentEngine.Cost(p, profile, cfg); Assert.Equal(0, c.FeeLow); Assert.Null(c.WageLow); Assert.Equal("unknown", c.Status);
        Assert.Equal("reference-above", RecruitmentEngine.Cost(Player(2).Player, profile, cfg).Status);
        Assert.Equal("unknown", RecruitmentEngine.Cost(Player(2).Player, new(), cfg).Status);
    }
    [Fact] public void Budget_reference_never_becomes_an_invented_asking_price()
    {
        var p = Player(1).Player; var cfg = Config();
        var cost = RecruitmentEngine.Cost(p, new() { TransferBudget = 2000000, WeeklyWageBudget = 2000, ReservePercent = 0 }, cfg);
        Assert.Equal("reference-within", cost.Status); Assert.Null(cost.FeeLow); Assert.Null(cost.FeeHigh);
        Assert.Equal("value-model", cost.ReferenceKind); Assert.Equal(1000000, cost.ReferenceAmount);
        Assert.Equal("reference-within", RecruitmentEngine.Cost(p, new() { TransferBudget = 1000000, WeeklyWageBudget = 2000, ReservePercent = 0 }, cfg).Status);
        Assert.Equal("reference-above", RecruitmentEngine.Cost(p, new() { TransferBudget = 1000000, WeeklyWageBudget = 2000, ReservePercent = 50 }, cfg).Status);
    }
    [Fact] public void Known_zero_wage_is_kept_and_budget_sort_prefers_estimate_within_budget()
    {
        var r = Run([Player(1, ovr: 90, wage: null), Player(2, wage: 0)], Report(new() { Formation = "4-3-3", Horizon = "win-now", TransferBudget = 2000000, WeeklyWageBudget = 10 }));
        Assert.Equal(2, Ranked(r)[0].Id); Assert.Equal(0, Ranked(r)[0].CurrentWage);
    }
    [Fact] public void Ranking_is_deterministic_and_card_limit_does_not_destroy_total_count()
    {
        var players = Enumerable.Range(1, 20).Select(i => Player(i)).ToArray();
        var a = Run(players); var b = Run(players.Reverse().ToArray());
        Assert.Equal(20, a.Groups[0].Total); Assert.Equal(10, Ranked(a).Length);
        Assert.Equal(JsonSerializer.Serialize(a), JsonSerializer.Serialize(b));
    }
    [Fact] public void Internal_versatile_option_already_used_elsewhere_has_warning_not_free_reserve_claim()
    {
        var ctx = Context();
        var own = new AnalysisPlayer(10, "İç", 25, 80, 85, ["CM", "CDM"], null, null, 2034, null, [], [], [], Player(1).Attributes, [], new(null, "missing", null), null, null, null);
        ctx = ctx with { Players = [own] };
        var report = Report(); var f = report.Formations[0];
        report = report with { Formations = [f with { Slots = [f.Slots[0], f.Slots[0] with { Slot = "CDM", StarterId = 10 }] }] };
        var r = Run([], report, ctx: ctx); Assert.Contains("açık oluşturabilir", r.Internal.Single().Note);
    }
    [Fact] public void Broken_or_unknown_attribute_rules_fail_explicitly()
    {
        var cfg = Config(); RecruitmentEngine.Validate(cfg, TestConfig.FieldMap.AnalysisAttributes);
        cfg.Positions["CM"].Attributes["invented"] = 1;
        Assert.Throws<DataUnavailableException>(() => RecruitmentEngine.Validate(cfg, TestConfig.FieldMap.AnalysisAttributes));
    }
    [Fact] public void Inherited_table_keeps_unknown_observation_day_in_recommendation_provenance()
    {
        var ctx = Context() with { Coverage = [new("attributes", "Özellikler", 1, 1, "known", new("S", null, "inherited"))] };
        var r = Run([Player(1)], ctx: ctx);
        Assert.Equal("inherited", r.Sources!["attributes"]!.Kind); Assert.Null(r.Sources["attributes"]!.GameDate);
        Assert.Contains(r.Warnings, w => w.Contains("yeniden gözlendiği anlamına gelmez"));
    }
    [Fact] public void Historical_fee_is_a_reference_not_a_new_asking_price()
    {
        var history = new TransferEvidence(9000000, new(2029, 7, 1), 20, "Eski", 30, "Yeni", "S");
        var c = RecruitmentEngine.Cost(Player(1).Player, new() { TransferBudget = 10000000, WeeklyWageBudget = 10000, ReservePercent = 0 }, Config(), history);
        Assert.Equal("last-transfer", c.ReferenceKind); Assert.Equal(9000000, c.ReferenceAmount);
        Assert.Null(c.FeeLow); Assert.Null(c.FeeHigh);
    }
    [Fact] public void Personal_fast_and_technical_back_preferences_change_ranking_without_a_question_requirement()
    {
        var fast = Player(1, position: "RB"); var technical = Player(2, position: "RB");
        foreach (var k in new[] { "acceleration", "sprintSpeed" }) { fast.Attributes[k] = 95; technical.Attributes[k] = 65; }
        foreach (var k in new[] { "ballControl", "shortPassing", "dribbling" }) { fast.Attributes[k] = 65; technical.Attributes[k] = 95; }
        var p = new ManagerProfile { Formation = "4-3-3", Horizon = "win-now", PlayerPreferences = new() { ["RB"] = "quick-back" } };
        Assert.Equal(1, Ranked(Run([fast, technical], Report(p, "RB")))[0].Id);
        Assert.Equal(2, Ranked(Run([fast, technical], Report(p with { PlayerPreferences = new() { ["RB"] = "technical-back" } }, "RB")))[0].Id);
    }
    [Fact] public void Pivot_height_condition_never_treats_unknown_height_as_short_or_tall()
    {
        var tall = Player(1, position: "ST"); tall = tall with { Player = new MarketPlayer { Id = 1, Name = "Uzun", ClubId = 20, Age = 24, Overall = 80, Potential = 90, Height = 190, Positions = ["ST"] } };
        var unknown = Player(2, position: "ST");
        var r = Run([tall, unknown], Report(new() { Formation = "4-3-3", Horizon = "win-now", PlayerPreferences = new() { ["ST"] = "target-striker" } }, "ST"));
        Assert.Equal(1, Ranked(r).Single().Id); Assert.Equal(1, r.Excluded["height-unknown"]);
        Assert.Contains("Pivot santrfor", Ranked(r).Single().Tags!);
    }
    [Fact] public void League_reference_uses_club_top_elevens_not_other_leagues_or_unknown_as_zero()
    {
        var players = Enumerable.Range(1, 22).Select(i => new MarketPlayer { Id = i, ClubId = i <= 11 ? 10 : 20, LeagueId = 1, Overall = i <= 11 ? 60 : 80 })
            .Append(new MarketPlayer { Id = 99, ClubId = 30, LeagueId = 2, Overall = 99 });
        var league = RecruitmentService.LeagueContext(players, 1, "Lig", 5);
        Assert.Equal(70, league.StarterReference); Assert.Equal(2, league.MeasuredClubs);
        Assert.Null(RecruitmentService.LeagueContext(players, 2, "Diğer", 5).StarterReference);
        Assert.Null(RecruitmentService.LeagueContext(players, null, null, 5).StarterReference);
        var r = RecruitmentEngine.Build(Context(), Report(), "4-3-3", "TARGET", [Player(1)], new HashSet<int>(), Config(), "v2",
            new Dictionary<string, string>(), TestConfig.FieldMap.PlayStyles, league);
        Assert.Equal(10, Ranked(r).Single().LeagueOverallDifference);
    }
    static WageCurve Curve(long wageAt60 = 2000, double slope = .15) => new(Math.Log(wageAt60) - slope * 60, slope, "club", 20);
    [Fact] public void Wage_curve_fits_rates_and_refuses_flat_or_inverted_scales()
    {
        var curve = WageCurve.Fit([(60, 2000), (70, 8000), (80, 32000)], "club")!;
        Assert.Equal(8000, curve.Estimate(70)); Assert.Null(WageCurve.Fit([(70, 8000), (80, 2000)], "club")); Assert.Null(WageCurve.Fit([(70, 8000)], "club"));
    }
    [Fact] public void Low_paid_target_is_checked_against_the_buying_clubs_pay_scale()
    {
        var p = Player(1, ovr: 72, wage: 2500).Player; var cfg = Config();
        var profile = new ManagerProfile { TransferBudget = 5000000, WeeklyWageBudget = 4000, ReservePercent = 0 };
        Assert.Equal("reference-within", RecruitmentEngine.Cost(p, profile, cfg).Status);
        var cost = RecruitmentEngine.Cost(p, profile, cfg, null, Curve(), 15000);
        Assert.Equal("reference-wage", cost.Status); Assert.True(cost.ExpectedWage > 4000); Assert.Equal(2500, cost.WageLow);
        Assert.Equal("reference-above", RecruitmentEngine.Cost(p, profile, cfg, null, Curve(), 5000).Status);
        Assert.Equal(40000, RecruitmentEngine.Cost(Player(2, ovr: 60, wage: 40000).Player, profile, cfg, null, Curve(), 15000).ExpectedWage);
    }
    [Fact] public void Veteran_potential_is_not_future_growth()
    {
        var veteran = Player(1, ovr: 74, pot: 88, age: 35); var prime = Player(2, ovr: 74, pot: 88, age: 24);
        var r = Run([veteran, prime], Report(new() { Formation = "4-3-3", Horizon = "develop" }, baseline: 70));
        var ranked = Ranked(r); Assert.Equal(2, ranked[0].Id);
        Assert.True(ranked[1].DevelopmentScore < 50); Assert.Equal(100, ranked[0].DevelopmentScore);
        Assert.Contains(ranked[1].Reasons, x => x.Contains("kısa vadeli"));
    }
    [Fact] public void Goalkeepers_get_a_later_short_term_age()
    {
        var keeper = Player(1, ovr: 74, pot: 74, age: 33, position: "GK"); var outfielder = Player(2, ovr: 74, pot: 74, age: 33);
        Assert.DoesNotContain(Ranked(Run([keeper], Report(position: "GK", baseline: 70))).Single().Reasons, x => x.Contains("kısa vadeli"));
        Assert.Contains(Ranked(Run([outfielder], Report(baseline: 70))).Single().Reasons, x => x.Contains("kısa vadeli"));
    }
    [Fact] public void Development_group_favours_potential_even_when_the_club_wants_results_now()
    {
        var high = Player(1, ovr: 68, pot: 88, age: 20); var ready = Player(2, ovr: 72, pot: 76, age: 22);
        var report = Report(new() { Formation = "4-3-3", Horizon = "win-now" }, baseline: 70);
        Assert.Equal(1, Run([high, ready], report).Groups.Single(g => g.Key == "development").Candidates[0].Id);
    }
    [Fact] public void Unreachable_players_leave_the_lists_and_unknown_values_do_not_exclude()
    {
        var profile = new ManagerProfile { Formation = "4-3-3", Horizon = "win-now", TransferBudget = 1000000, ReservePercent = 0 };
        var star = Player(1, ovr: 80) with { ClubPrestige = 10 }; var unknown = Player(2, ovr: 80);
        var r = RecruitmentEngine.Build(Context(), Report(profile), "4-3-3", "TARGET", [star, unknown], new HashSet<int>(), Config(), "v",
            new Dictionary<string, string>(), TestConfig.FieldMap.PlayStyles, null, null, 2);
        Assert.Equal(1, r.Excluded["unreachable"]);
        var fee = Config(); fee.ReachFeeMultiple = 1;
        Assert.Equal(2, Run([Player(1), Player(2)], Report(new() { Formation = "4-3-3", Horizon = "win-now", TransferBudget = 1000000, ReservePercent = 0 }), cfg: fee).Groups[0].Total);
        Assert.Equal(1, Run([Player(1)], Report(new() { Formation = "4-3-3", Horizon = "win-now", TransferBudget = 500000, ReservePercent = 0 }), cfg: fee).Excluded["unreachable"]);
        Assert.Equal(1, Run([Player(1)], Report(new() { Formation = "4-3-3", Horizon = "win-now", TransferBudget = 0, ReservePercent = 0 }), cfg: fee).Groups[0].OverBudgetTotal);
        Assert.Equal(1, Run([Player(1, ovr: 95)], Report(baseline: 80)).Excluded["unreachable"]);
    }
    [Fact] public void Over_budget_players_are_listed_apart_from_the_main_recommendations()
    {
        var profile = new ManagerProfile { Formation = "4-3-3", Horizon = "win-now", TransferBudget = 2000000, WeeklyWageBudget = 2000, ReservePercent = 0 };
        var cheap = Player(1, ovr: 80); var dear = Player(2, ovr: 84, wage: 90000);
        var group = Run([cheap, dear], Report(profile)).Groups.Single(g => g.Key == "starter");
        Assert.Equal(1, group.Candidates.Single().Id); Assert.Equal(2, group.OverBudget!.Single().Id); Assert.Equal((2, 1), (group.Total, group.OverBudgetTotal));
    }
    [Fact] public void Position_rating_decides_minimums_and_comparison_not_headline_OVR()
    {
        var keeper = Player(1, ovr: 85, position: "CM") with { PositionRatings = new() { ["CM"] = 70 } };
        var r = Run([keeper, Player(2, ovr: 78)]);
        Assert.Equal(2, Ranked(r).Single().Id);
        Assert.Equal(78, Ranked(r).Single().PositionRating);
    }
    [Fact] public void Overqualified_stars_are_kept_in_starter_group_instead_of_being_called_reserves()
    {
        var r = Run([Player(1, ovr: 90), Player(2, ovr: 78)]);
        Assert.Contains(r.Groups.Single(g => g.Key == "starter").Candidates, p => p.Id == 1);
        Assert.DoesNotContain(r.Groups.Single(g => g.Key == "rotation").Candidates, p => p.Id == 1);
        Assert.Contains(r.Groups.Single(g => g.Key == "rotation").Candidates, p => p.Id == 2);
    }
}
