using System.Text.Json;
using FcMarket.Api.Analysis;
using FcMarket.Api.Market;

namespace FcMarket.Tests;

public sealed class TransferPlanTests
{
    static AnalysisConfig Config() => JsonSerializer.Deserialize<AnalysisConfig>(File.ReadAllText(Path.Combine(TestConfig.RepoRoot, "config/squad-analysis.json")), new JsonSerializerOptions(JsonSerializerDefaults.Web))!;
    static AnalysisPlayer Player(int id, params string[] positions) => new(id, "P" + id, 24, 80, 90, positions,
        null, 10, 2035, null, null, null, null, [], [], new(null, "missing", null), null, null, null);
    static AnalysisContext Context()
    {
        var cfg = Config();
        var players = Enumerable.Range(0, 22).Select(i => Player(i + 1, cfg.Position(cfg.Formations["4-3-3"][i % 11]))).ToArray();
        return new(new("S", "A", new(2030, 7, 28), 2031, null, 10, "Club", null, null, 1, "A@1", "save", 1),
            "A@1", "saved", "cfg", "4-3-3", players, [], [], cfg, [], []);
    }
    static TransferPlanSource Source() => new("A@1", "saved", "S", 1, "cfg", "r", "p", 0);
    static TransferPlanPlayer Buy(int id, long? fee = 60, long? wage = 10, long? signing = 0) =>
        new(id, "P" + id, ["CB"], "transfer", fee, "user", wage, "user", signing);
    static TransferPlanResult Run(TransferPlanPlayer[] moves, PlanSale[]? sales = null, AnalysisPlayer[]? arrivals = null,
        AnalysisContext? ctx = null, ManagerProfile? profile = null) => TransferPlanEngine.Compute(Source(), ctx ?? Context(),
            profile ?? new() { Formation = "4-3-3", TransferBudget = 100, WeeklyWageBudget = 100, ReservePercent = 0 },
            new("4-3-3", [], sales ?? [], []), arrivals ?? [], moves);

    [Fact] public void Two_individually_affordable_buys_share_one_budget()
    {
        Assert.Equal("within", Run([Buy(30)]).Budget.Status);
        var both = Run([Buy(30), Buy(31)]).Budget;
        Assert.Equal("above", both.Status); Assert.Equal(120, both.KnownFees);
        Assert.Equal(-20, both.RemainingWithoutSales); Assert.Equal(80, both.WageRemainingWithoutSales);
    }
    [Fact] public void Wage_and_fee_limits_are_independent_and_reserve_is_applied_once()
    {
        var b = Run([Buy(30, 20, 50), Buy(31, 20, 40)], profile: new() { Formation = "4-3-3", TransferBudget = 100, WeeklyWageBudget = 100, ReservePercent = 15 }).Budget;
        Assert.Equal(85, b.TransferBudget); Assert.Equal(45, b.RemainingWithoutSales);
        Assert.Equal(-5, b.WageRemainingWithoutSales); Assert.Equal("above", b.Status);
    }
    [Fact] public void Missing_fees_wages_and_extras_never_mean_free()
    {
        var b = Run([Buy(30, null, null, null), Buy(31, 20, 10)]).Budget;
        Assert.Equal((20, 1, 10, 1, 1), (b.KnownFees, b.UnknownFees, b.KnownWeeklyWages, b.UnknownWeeklyWages, b.UnknownSigningFees));
        Assert.Null(b.RemainingWithoutSales); Assert.Null(b.WageRemainingWithoutSales); Assert.Equal("unknown", b.Status);
        var extras = Run([Buy(30, 20, 10, null)]);
        Assert.Equal("conditional", extras.Budget.Status); Assert.Equal(80, extras.Budget.RemainingWithoutSales);
        Assert.Contains(extras.Warnings, w => w.Code == "extras");
    }
    [Fact] public void Missing_budget_is_distinct_from_a_real_zero_budget()
    {
        Assert.Equal("above", Run([Buy(30, 1)], profile: new() { Formation = "4-3-3", TransferBudget = 0, WeeklyWageBudget = 100 }).Budget.Status);
        var unknown = Run([Buy(30, 1)], profile: new() { Formation = "4-3-3", TransferBudget = null, WeeklyWageBudget = 100 }).Budget;
        Assert.Equal("unknown", unknown.Status); Assert.Null(unknown.TransferBudget);
    }
    [Fact] public void Cost_range_spreads_only_estimates_and_warns_when_the_high_end_breaks_the_budget()
    {
        var estimated = Buy(30, 60, 10) with { FeeSource = "value-model", WageSource = "estimate" };
        var r = Run([estimated]);
        Assert.Equal(new PlanCostRange(30, 105, 9, 15, false), r.Budget.Range);
        Assert.Equal("conditional", r.Budget.Status); // the reference itself still fits
        Assert.Contains(r.Warnings, w => w.Code == "range");
        Assert.Equal(new PlanCostRange(60, 60, 10, 10, true), Run([Buy(30)]).Budget.Range); // user amounts stay exact
        var free = Buy(30, 0, 10) with { FeeSource = "free-agent", WageSource = "estimate" };
        Assert.Equal((0, 0), (Run([free]).Budget.Range!.FeeLow, Run([free]).Budget.Range!.FeeHigh));
        Assert.Null(Run([Buy(30, null, 10)]).Budget.Range); // no invented range around an unknown cost
        Assert.Null(Run([]).Budget.Range);
        Assert.Null(Run([estimated], profile: new() { Formation = "4-3-3", TransferBudget = null, WeeklyWageBudget = 100 }).Budget.Range!.HighFitsBudget);
    }
    [Fact] public void A_sale_can_bring_the_high_end_back_inside_the_budget()
    {
        var estimated = Buy(30, 60, 10) with { FeeSource = "value-model", WageSource = "estimate" };
        var sold = new TransferPlanPlayer(1, "GK", ["GK"], "sale", 50, "user", 10, "current", null);
        Assert.True(Run([estimated, sold], [new(1, 50)]).Budget.Range!.HighFitsBudget);
    }
    [Fact] public void Broken_cost_range_settings_are_refused()
    {
        var ctx = Context(); var draft = new TransferPlanDraft("4-3-3", [], [], []);
        Assert.Throws<FcMarket.Api.Data.DataUnavailableException>(() => TransferPlanEngine.Validate(draft, ctx, new() { FeeRange = [2, 1] }));
        Assert.Throws<FcMarket.Api.Data.DataUnavailableException>(() => TransferPlanEngine.Validate(draft, ctx, new() { WageRange = [1] }));
    }
    [Fact] public void Sale_credit_is_conditional_and_leaving_players_are_removed_before_assignment()
    {
        var ctx = Context() with { Players = Context().Players.Where(p => p.Id != 12).ToArray() }; // single GK
        var sold = new TransferPlanPlayer(1, "GK", ["GK"], "sale", 200, "user", 10, "current", null);
        var r = Run([Buy(30, 120), sold], [new(1, 200)], ctx: ctx);
        Assert.Equal(-20, r.Budget.RemainingWithoutSales); Assert.Equal(180, r.Budget.RemainingWithSales);
        Assert.Equal("conditional", r.Budget.Status);
        Assert.Null(r.After.Slots.Single(s => s.Position == "GK").StarterId);
        Assert.NotNull(r.Before.Slots.Single(s => s.Position == "GK").StarterId);
        var unknown = Run([Buy(30, 120), sold with { Fee = null }], [new(1)], ctx: ctx);
        Assert.Null(unknown.Budget.RemainingWithSales); Assert.Equal("unknown", unknown.Budget.Status);
    }
    [Fact] public void A_versatile_arrival_is_one_independent_reserve_not_two()
    {
        var ctx = Context() with { Players = Context().Players.Where(p => p.Id is not (14 or 17)).ToArray() };
        var p = Player(30, "CB", "CDM");
        var r = Run([Buy(30, 0)], arrivals: [p], ctx: ctx);
        Assert.Equal(9, r.Before.FilledRotation); Assert.Equal(10, r.After.FilledRotation);
        Assert.Single(r.After.Slots.SelectMany(s => new[] { s.StarterId, s.RotationId }).OfType<int>(), id => id == 30);
    }
    [Fact] public void Duplicate_moves_and_invalid_amounts_are_rejected_before_calculation()
    {
        var ctx = Context(); var cfg = new TransferPlanConfig();
        Assert.Throws<BadRequestException>(() => TransferPlanEngine.Validate(new("4-3-3", [new(30)], [new(30)], []), ctx, cfg));
        Assert.Throws<BadRequestException>(() => TransferPlanEngine.Validate(new("4-3-3", [new(30, -1)], [], []), ctx, cfg));
        Assert.Throws<BadRequestException>(() => TransferPlanEngine.Validate(new("4-3-3", [], [], [new(30, 1)]), ctx, cfg));
        Assert.Throws<BadRequestException>(() => TransferPlanEngine.Validate(new("invalid", [], [], []), ctx, cfg));
    }
    [Fact] public void A_youth_promotion_uses_current_quality_not_potential_and_keeps_unknown_costs()
    {
        var p = Player(30, "ST") with { Age = 16, Overall = 40, Potential = 99 };
        var move = Buy(30, 0, null, null) with { Action = "promotion", FeeSource = "internal", WageSource = "unknown" };
        var r = TransferPlanEngine.Compute(Source(), Context(), new() { Formation = "4-3-3", TransferBudget = 100, WeeklyWageBudget = 100 },
            new("4-3-3", [], [], [new(30)]), [p], [move]);
        Assert.Equal(r.Before.FilledStarters, r.After.FilledStarters);
        Assert.DoesNotContain(r.After.Slots, slot => slot.StarterId == 30);
        Assert.Equal(1, r.Budget.UnknownWeeklyWages); Assert.Equal(1, r.Budget.UnknownSigningFees);
        Assert.Equal("unknown", r.Budget.Status);
    }
    static TransferSuggestionConfig Rules() => JsonSerializer.Deserialize<TransferSuggestionConfig>(File.ReadAllText(Path.Combine(TestConfig.RepoRoot, "config/transfer-suggestions.json")), new JsonSerializerOptions(JsonSerializerDefaults.Web))!;
    static SuggestionCandidate Offer(int id, string position, int overall, long fee, long wage = 10) => new(Player(id, position) with { Overall = overall, Potential = overall }, fee, wage);
    static AnalysisContext Weak(params int[] missing) => Context() with { Players = Context().Players.Where(p => !missing.Contains(p.Id)).ToArray() };
    static ManagerProfile Plan(int target = 2) => new() { Formation = "4-3-3", TargetTransfers = target, ReservePercent = 0 };
    static int[] Ids(IEnumerable<SuggestionPicks> found, string goal) => found.Single(x => x.Goal == goal).Picks.Select(c => c.Player.Id).ToArray();

    [Fact] public void Shipped_suggestion_rules_are_valid() => TransferPlanSuggester.Validate(Rules());
    [Fact] public void Low_goal_takes_the_cheaper_fix_and_high_goal_the_stronger_one()
    {
        var ctx = Weak(12); // keeper rotation is missing
        var found = TransferPlanSuggester.Search(ctx, Plan(1), 300, 300, [Offer(30, "GK", 72, 5), Offer(31, "GK", 90, 100)], Rules());
        Assert.Equal([30], Ids(found, "low")); Assert.Equal([31], Ids(found, "high"));
    }
    [Fact] public void Low_goal_rejects_a_cheap_player_who_leaves_the_need_open()
    {
        var found = TransferPlanSuggester.Search(Weak(12), Plan(1), 1000, 1000, [Offer(30, "GK", 40, 1)], Rules());
        Assert.Empty(Ids(found, "low"));
    }
    [Fact] public void Reserve_quality_far_above_the_floor_is_not_worth_more()
    {
        // Both stay behind the 80 starter and both clear the reserve cap, so the extra quality buys nothing.
        var found = TransferPlanSuggester.Search(Weak(12), Plan(1), 200, 200, [Offer(30, "GK", 79, 150), Offer(31, "GK", 75, 30)], Rules());
        Assert.Equal([31], Ids(found, "high"));
    }
    [Fact] public void Filling_a_reserve_place_may_not_weaken_a_covered_slot_unnoticed()
    {
        // Moving the versatile starter into the keeper gap's chain would lower a covered place, so the direct fix wins.
        var ctx = Context() with { Players = Context().Players.Where(p => p.Id != 13).Select(p => p.Id == 2 ? p with { Positions = ["RB", "CB"] } : p).ToArray() };
        var cfg = Rules(); var slots = ctx.Catalog.Formations["4-3-3"];
        var position = ctx.Catalog.Position(slots[1]);
        var found = TransferPlanSuggester.Search(ctx, Plan(1), 1000, 1000, [Offer(30, position, 78, 5), Offer(31, "CB", 70, 1)], cfg);
        var now = DepthAnalysis.SlotLevels(ctx, "4-3-3", []);
        var after = DepthAnalysis.SlotLevels(ctx, "4-3-3", found.Single(x => x.Goal == "high").Picks.Select(c => c.Player));
        Assert.All(now.Zip(after), pair => Assert.True((pair.Second.Starter ?? 0) >= (pair.First.Starter ?? 0)));
    }
    [Fact] public void Every_pick_in_a_package_still_adds_something_at_the_end()
    {
        var slots = Context().Catalog.Formations["4-3-3"]; var cfg = Context().Catalog;
        var ctx = Weak(12, 13, 14, 15);
        var offers = Enumerable.Range(0, 6).SelectMany(i => new[] { Offer(30 + i, cfg.Position(slots[i]), 74, 5 + i), Offer(40 + i, cfg.Position(slots[i]), 79, 20 + i) }).ToArray();
        var found = TransferPlanSuggester.Search(ctx, Plan(4), 1000, 1000, offers, Rules());
        foreach (var goal in found)
        {
            var all = goal.Picks.Select(c => c.Player).ToArray();
            var full = DepthAnalysis.SlotLevels(ctx, "4-3-3", all);
            Assert.All(all, player => Assert.NotEqual(full, DepthAnalysis.SlotLevels(ctx, "4-3-3", all.Where(p => p != player))));
        }
        Assert.Equal(4, found.Single(x => x.Goal == "high").Picks.Count);
    }
    [Fact] public void Packages_share_one_budget_and_honour_the_target_count()
    {
        var found = TransferPlanSuggester.Search(Weak(12, 13, 14), Plan(2), 100, 100,
            [Offer(30, "GK", 80, 60), Offer(31, "RB", 80, 60), Offer(32, "CB", 80, 60)], Rules());
        Assert.Single(Ids(found, "high")); Assert.Equal(60, found.Single(x => x.Goal == "high").Picks.Sum(c => c.Fee));
        var many = TransferPlanSuggester.Search(Weak(12, 13, 14), Plan(2), 1000, 1000,
            [Offer(30, "GK", 80, 60), Offer(31, "RB", 80, 60), Offer(32, "CB", 80, 60)], Rules());
        Assert.Equal(2, Ids(many, "high").Length);
    }
    [Fact] public void Wages_limit_a_package_even_when_the_fee_fits()
    {
        var found = TransferPlanSuggester.Search(Weak(12), Plan(1), 1000, 5, [Offer(30, "GK", 80, 1, 6)], Rules());
        Assert.All(found, x => Assert.Empty(x.Picks));
    }
    [Fact] public void A_second_player_for_a_covered_place_is_not_bought()
    {
        var found = TransferPlanSuggester.Search(Weak(12), Plan(3), 1000, 1000, [Offer(30, "GK", 72, 5), Offer(31, "GK", 72, 5), Offer(32, "GK", 72, 5)], Rules());
        Assert.Single(Ids(found, "low"));
    }
    [Fact] public void A_covered_squad_gets_no_low_spend_package()
    {
        var found = TransferPlanSuggester.Search(Context(), Plan(), 1000, 1000, [Offer(30, "ST", 95, 1)], Rules());
        Assert.Empty(Ids(found, "low"));
    }
    [Fact] public void Zero_budget_still_allows_a_free_player_but_nothing_else()
    {
        var found = TransferPlanSuggester.Search(Weak(12), Plan(1), 0, 100, [Offer(30, "GK", 80, 1), Offer(31, "GK", 70, 0)], Rules());
        Assert.Equal([31], Ids(found, "high"));
    }
    [Fact] public void Buying_two_more_keepers_does_not_create_two_more_independent_places()
    {
        var r = Run([Buy(30), Buy(31)], arrivals: [Player(30, "GK"), Player(31, "GK")]);
        Assert.Equal(r.Before.FilledRotation, r.After.FilledRotation);
        Assert.Equal(2, r.Warnings.Count(w => w.Code == "unassigned"));
        Assert.Equal(120, r.Budget.KnownFees);
    }
}
