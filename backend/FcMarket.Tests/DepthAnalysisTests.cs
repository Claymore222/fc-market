using System.Text.Json;
using FcMarket.Api.Analysis;
using FcMarket.Api.Data;

namespace FcMarket.Tests;

public sealed class DepthAnalysisTests
{
    static readonly JsonSerializerOptions Json = new(JsonSerializerDefaults.Web);
    static readonly DateOnly Day = new(2030, 7, 28);
    static AnalysisConfig Config() => JsonSerializer.Deserialize<AnalysisConfig>(File.ReadAllText(Path.Combine(TestConfig.RepoRoot, "config/squad-analysis.json")), Json)!;
    static AnalysisValue Value(object? v, string state = "known", string kind = "save") => new(v, state, new("S", kind == "inherited" ? null : Day, kind));
    static AnalysisPlayer Player(int id, string[] positions, int? overall = 80, int? age = 25, int? pot = 85) => new(id, "Oyuncu " + id,
        age, overall, pot, positions, null, null, 2034, null, null, null, null, [], [], Value(null, "missing"), null, null, null);
    static AnalysisPlayer[] Roster()
    {
        var cfg = Config();
        return Enumerable.Range(0, 22).Select(i => Player(i + 1, [cfg.Position(cfg.Formations["4-3-3"][i % 11])])).ToArray();
    }
    static AnalysisContext Context(AnalysisPlayer[] players, AnalysisConfig? cfg = null) => new(
        new("S", "A", Day, 2031, null, 10, "Kulüp", null, null, 1, "A@1", "save", 1),
        "A@1", "saved", "2-test", "4-3-3", players, [], [], cfg ?? Config(), [], []);
    static ManagerProfile Profile(string horizon = "balanced") => new() { Formation = "4-3-3", Horizon = horizon };
    static FormationDepth Run(AnalysisPlayer[] players, ManagerProfile? p = null, AnalysisConfig? cfg = null) =>
        DepthAnalysis.Compute(Context(players, cfg), p ?? Profile()).Formations.Single();
    static IEnumerable<int> Assigned(FormationDepth f) => f.Slots.SelectMany(s => new[] { s.StarterId, s.RotationId }).OfType<int>();

    [Fact] public void Full_depth_has_22_distinct_players_and_no_need()
    {
        var f = Run(Roster());
        Assert.Equal((11, 11), (f.FilledStarters, f.FilledRotation)); Assert.Equal(22, Assigned(f).Distinct().Count());
        Assert.All(f.Slots, s => { Assert.Equal("sufficient", s.Priority); Assert.Equal(0, s.NeedScore); });
    }
    [Fact] public void Shared_CB_CDM_reserve_is_not_counted_twice()
    {
        var players = Roster().Where(p => p.Id is not (14 or 17)).Append(Player(30, ["CB", "CDM"])).ToArray();
        var f = Run(players);
        Assert.Equal((11, 10), (f.FilledStarters, f.FilledRotation)); Assert.Equal(21, Assigned(f).Distinct().Count());
        Assert.Single(Assigned(f), id => id == 30); Assert.Single(f.Slots, s => s.Priority == "window");
    }
    [Fact] public void Joint_assignment_avoids_greedy_versatile_player_trap()
    {
        var players = Roster().Where(p => p.Id is not (2 or 5 or 13 or 16))
            .Append(Player(2, ["RB", "LB"], 99)).Append(Player(5, ["RB"], 80)).ToArray();
        var f = Run(players);
        Assert.Equal(11, f.FilledStarters); Assert.Equal(5, f.Slots.Single(s => s.Slot == "RB").StarterId);
        Assert.Equal(2, f.Slots.Single(s => s.Slot == "LB").StarterId);
    }
    [Fact] public void Missing_goalkeeper_is_distinct_urgent_need_never_filled_by_CB()
    {
        var gk = Run(Roster().Where(p => !p.Positions.Contains("GK")).ToArray()).Slots.Single(s => s.Slot == "GK");
        Assert.Null(gk.StarterId); Assert.Null(gk.RotationId); Assert.Equal("urgent", gk.Priority);
        Assert.Equal(100, gk.NeedScore); Assert.False(gk.Conditional);
    }
    [Fact] public void Two_CB_places_require_four_independent_options()
    {
        var cb = Run(Roster().Where(p => p.Id != 15).ToArray()).Slots.Where(s => s.Position == "CB").ToArray();
        Assert.Equal(2, cb.Count(s => s.StarterId is not null)); Assert.Single(cb, s => s.RotationId is null);
    }
    [Theory] [InlineData(7, "short-absence")] [InlineData(60, "long-absence")]
    public void Dated_injury_creates_temporary_gap_without_permanent_starter_need(int days, string code)
    {
        var players = Roster().Where(p => p.Id != 21).Select(p => p.Id == 10 ? p with {
            Availability = new() { ["returnDate"] = Value(int.Parse(Day.AddDays(days).ToString("yyyyMMdd"))) } } : p).ToArray();
        var st = Run(players).Slots.Single(s => s.Slot == "ST");
        Assert.Equal(10, st.StarterId); Assert.Null(st.ReadyStarterId); Assert.True(st.TemporaryGap);
        Assert.Equal("window", st.Priority); Assert.Contains(st.Reasons, r => r.Code == code);
    }
    [Fact] public void Injury_promotes_reserve_in_today_scenario_only()
    {
        var p = Roster().Select(p => p.Id == 10 ? p with { Overall = 90,
            Availability = new() { ["returnDate"] = Value(20300804) } } : p).ToArray();
        var st = Run(p).Slots.Single(s => s.Slot == "ST");
        Assert.Equal((10, 21, 21), (st.StarterId, st.RotationId, st.ReadyStarterId));
        Assert.Equal("sufficient", st.Priority); Assert.True(st.TemporaryGap);
    }
    [Theory] [InlineData("inherited")] [InlineData("unknown")]
    public void Unverified_return_never_silently_removes_player(string kind)
    {
        var p = Roster().Select(p => p.Id == 10 ? p with { Overall = 90,
            Availability = new() { ["returnDate"] = Value(20300804, kind: kind), ["injuryFlag"] = Value(1) } } : p).ToArray();
        var st = Run(p).Slots.Single(s => s.Slot == "ST");
        Assert.Equal(10, st.ReadyStarterId); Assert.False(st.TemporaryGap);
        Assert.Contains(st.Reasons, r => r.Code == "injury-unverified");
    }
    [Fact] public void Unknown_positions_and_OVR_are_conditional_not_zero_or_proven_vacancy()
    {
        var p = Roster().Select(p => p.Id == 10 ? p with { Positions = [], Overall = null } : p).ToArray();
        var result = DepthAnalysis.Compute(Context(p), Profile());
        Assert.All(result.Formations.Single().Slots, s => Assert.True(s.Conditional));
        Assert.Contains(result.Warnings, w => w.Contains("mevkisi bilinmiyor"));
        Assert.Contains(result.Warnings, w => w.Contains("0 reyting sayılmadı"));
    }
    [Fact] public void Empty_roster_returns_conditional_gaps_without_fabricated_reference()
    {
        var f = Run([]); Assert.Null(f.TeamReference); Assert.Equal(0, f.FilledStarters);
        Assert.All(f.Slots, s => { Assert.True(s.Conditional); Assert.Null(s.StarterId); Assert.Null(s.DevelopmentId); });
    }
    [Fact] public void Insufficient_OVR_does_not_claim_sufficient_quality()
    {
        var f = Run(Roster().Select(p => p with { Overall = null }).ToArray());
        Assert.All(f.Slots, s => { Assert.Equal("unknown", s.Priority); Assert.Null(s.NeedScore); });
    }
    [Fact] public void Real_zero_OVR_is_kept_and_produces_quality_gap()
    {
        var st = Run(Roster().Select(p => p.Positions.Contains("ST") ? p with { Overall = 0 } : p).ToArray()).Slots.Single(s => s.Slot == "ST");
        Assert.Equal("window", st.Priority); Assert.Contains(st.Reasons, r => r.Code == "starter-quality");
    }
    [Fact] public void Team_relative_threshold_changes_with_project_and_not_fixed_club_OVR()
    {
        var p = Roster().Select(p => p.Positions.Contains("ST") ? p with { Overall = 72 } : p).ToArray();
        Assert.Equal("window", Run(p, Profile("win-now")).Slots.Single(s => s.Slot == "ST").Priority);
        Assert.Equal("sufficient", Run(p, Profile("develop")).Slots.Single(s => s.Slot == "ST").Priority);
        Assert.Equal("sufficient", Run(Roster().Select(p => p with { Overall = 50 }).ToArray()).Slots[0].Priority);
    }
    [Fact] public void Contract_expiry_affects_future_not_today_and_renewal_is_first_alternative()
    {
        var st = Run(Roster().Select(p => p.Positions.Contains("ST") ? p with { ContractEnd = 2031 } : p).ToArray()).Slots.Single(s => s.Slot == "ST");
        Assert.NotNull(st.StarterId); Assert.NotNull(st.RotationId); Assert.Null(st.NextSeasonStarterId);
        Assert.Equal("next-season", st.Priority); Assert.Contains(st.Reasons, r => r.Code == "contract" && r.Text.Contains("yenileme"));
    }
    [Fact] public void Age_alone_never_creates_transfer_or_sale_need()
    {
        Assert.All(Run(Roster().Select(p => p with { Age = 36 }).ToArray()).Slots,
            s => { Assert.Equal("sufficient", s.Priority); Assert.Contains(s.Reasons, r => r.Code == "age-planning"); });
    }
    [Fact] public void Development_options_are_extra_distinct_players_not_promises()
    {
        var f = Run(Roster().Append(Player(30, ["ST", "RW"], 50, 18, 95)).ToArray());
        var young = f.Slots.Where(s => s.DevelopmentId == 30).ToArray();
        Assert.Single(young); Assert.DoesNotContain(30, Assigned(f));
        Assert.Contains(young[0].Reasons, r => r.Code == "development" && r.Text.Contains("garantisi değildir"));
    }
    [Fact] public void Confirmed_outgoing_loan_excluded_unverified_record_retained()
    {
        var p = Roster().Select(p => p.Id == 10 ? p with { Loan = Value(new { fromTeamId = 10, endDate = Day.AddMonths(5) }), Overall = 90 } : p).ToArray();
        Assert.DoesNotContain(10, Assigned(Run(p)));
        p = p.Select(p => p.Id == 10 ? p with { Loan = p.Loan with { State = "unverified" } } : p).ToArray();
        Assert.Contains(10, Assigned(Run(p)));
    }
    [Fact] public void Incoming_loan_expiry_affects_future_only()
    {
        var p = Roster().Select(p => p.Positions.Contains("ST") ? p with { Loan = Value(new { fromTeamId = 99, endDate = new DateOnly(2031, 6, 30) }) } : p).ToArray();
        var st = Run(p).Slots.Single(s => s.Slot == "ST");
        Assert.NotNull(st.StarterId); Assert.Null(st.NextSeasonStarterId); Assert.Equal("next-season", st.Priority);
    }
    [Fact] public void Departure_preference_is_not_actual_sale_and_unknown_wage_has_no_penalty()
    {
        var f = Run(Roster(), Profile() with { DeparturePlayerIds = [10] });
        Assert.Contains(10, Assigned(f)); Assert.Equal("sufficient", f.Slots.Single(s => s.Slot == "ST").Priority);
    }
    [Fact] public void Alternative_is_independent_and_input_permutation_keeps_same_assignments()
    {
        var profile = Profile() with { SecondaryFormation = "4-4-2" };
        var a = DepthAnalysis.Compute(Context(Roster()), profile).Formations;
        var b = DepthAnalysis.Compute(Context(Roster().Reverse().ToArray()), profile).Formations;
        Assert.Equal(2, a.Count); Assert.Equal(JsonSerializer.Serialize(a), JsonSerializer.Serialize(b));
        Assert.All(a, f => Assert.Equal(Assigned(f).Count(), Assigned(f).Distinct().Count()));
    }
    static AnalysisPlayer Rated(AnalysisPlayer p, params (string Position, int Rating)[] ratings) => p with { PositionRatings = ratings.ToDictionary(r => r.Position, r => r.Rating) };
    static LeagueClub[] Rivals(int overall, int count = 9, int? stOverall = null) => Enumerable.Range(0, count).Select(c => new LeagueClub(100 + c, "Rakip", Enumerable.Range(0, 22)
        .Select(i => { var pos = Config().Position(Config().Formations["4-3-3"][i % 11]); return Player(1000 * (c + 1) + i, [pos], pos == "ST" ? stOverall ?? overall : overall); }).ToArray())).ToArray();
    static AnalysisPlayer Saved(AnalysisPlayer p, string slot) => p with { Slot = slot };

    [Fact] public void Reference_is_the_formation_XI_and_not_the_best_OVRs_of_any_position()
    {
        var keepers = Enumerable.Range(40, 8).Select(i => Player(i, ["GK"], 95));
        Assert.Equal(80, Run(Roster().Concat(keepers).ToArray().Select(p => p.Positions[0] == "GK" && p.Id < 40 ? p with { Overall = 80 } : p).ToArray()).TeamReference - 1);
    }
    [Fact] public void Position_rating_not_full_OVR_decides_out_of_position_cover()
    {
        var players = Roster().Where(p => p.Id is not (3 or 14 or 15))
            .Append(Rated(Player(50, ["CB"], 90), ("CB", 60))).Append(Player(51, ["CB"], 75)).ToArray();
        var cb = Run(players).Slots.Where(s => s.Position == "CB").ToArray();
        Assert.Contains(cb, s => s.StarterId == 51); Assert.DoesNotContain(cb, s => s.StarterId == 50);
        Assert.Contains(cb, s => s.RotationId == 50 && s.RotationRating == 60);
    }
    [Fact] public void Position_estimate_never_rates_a_player_above_OVR()
    {
        Assert.Equal(80, DepthAnalysis.Rating(Rated(Player(1, ["RM"], 80), ("RM", 88)), "RM"));
        Assert.Equal(80, DepthAnalysis.Rating(Player(1, ["RM"], 80), "RM"));
    }
    [Fact] public void Wing_back_slots_use_real_full_back_positions_because_no_player_is_registered_there()
    {
        Assert.Equal("RB", Config().Position("RWB")); Assert.Equal("LB", Config().Position("LWB"));
        var f = Run(Roster(), Profile() with { Formation = "5-3-2" });
        Assert.NotNull(f.Slots.Single(s => s.Slot == "RWB").StarterId); Assert.NotEqual("urgent", f.Slots.Single(s => s.Slot == "LWB").Priority);
    }
    [Fact] public void League_comparison_flags_a_line_that_covers_every_slot_but_trails_rivals()
    {
        var weak = Roster().Select(p => p.Positions[0] == "ST" ? p with { Overall = 74 } : p).ToArray();
        var f = DepthAnalysis.Compute(Context(weak) with { LeagueClubs = Rivals(80) }, Profile()).Formations.Single();
        var st = f.Slots.Single(s => s.Slot == "ST");
        Assert.Equal("window", st.Priority); Assert.Contains(st.Reasons, r => r.Code == "league-starter" && r.Text.Contains("medyanı"));
        var line = f.Lines!.Single(l => l.Position == "ST");
        Assert.Equal((74d, 80d, 10, 10), (line.Starter, line.StarterMedian, line.StarterRank, line.Clubs));
        Assert.Equal(10, f.League!.Rank);
        Assert.Equal("sufficient", f.Slots.Single(s => s.Slot == "GK").Priority);
    }
    [Fact] public void League_rules_need_enough_clubs_and_never_count_the_users_own_club()
    {
        var weak = Roster().Select(p => p.Positions[0] == "ST" ? p with { Overall = 74 } : p).ToArray();
        var few = DepthAnalysis.Compute(Context(weak) with { LeagueClubs = Rivals(80, 3) }, Profile()).Formations.Single();
        Assert.Null(few.League); Assert.Empty(few.Lines!);
        var own = new LeagueClub(10, "Kulüp", Rivals(99, 1)[0].Players);
        var f = DepthAnalysis.Compute(Context(weak) with { LeagueClubs = [.. Rivals(80), own] }, Profile()).Formations.Single();
        Assert.Equal(10, f.League!.Clubs);
    }
    [Fact] public void Equal_contract_needs_are_separated_by_starter_and_league_risk()
    {
        var players = Roster().Select(p => p.Id switch { 10 or 21 => p with { ContractEnd = 2031 }, 2 => p with { ContractEnd = 2031 }, _ => p }).ToArray();
        var f = DepthAnalysis.Compute(Context(players) with { LeagueClubs = Rivals(80, 9, 84) }, Profile()).Formations.Single();
        var st = f.Slots.Single(s => s.Slot == "ST"); var rb = f.Slots.Single(s => s.Slot == "RB");
        Assert.Equal("next-season", rb.Priority); Assert.True(st.NeedScore > rb.NeedScore);
        Assert.InRange(rb.NeedScore!.Value, 20, 49);
    }
    [Fact] public void Contract_plan_sizes_the_expiring_wage_bill_and_orders_starters_first()
    {
        var players = Roster().Select(p => p with { WeeklyWage = 1000, ContractEnd = p.Id is 10 or 21 ? 2031 : 2034 }).ToArray();
        var plan = Run(players).Contracts!;
        Assert.Equal((2, 22, 1, 2000L, 22000L), (plan.Players, plan.Squad, plan.Starters, plan.Wages!.Value, plan.WageBill!.Value));
        Assert.Equal(("starter", "Önce yenile"), (plan.Items[0].Role, plan.Items[0].Action));
        Assert.Equal("rotation", plan.Items[1].Role);
        Assert.Null(Run(Roster()).Contracts);
    }
    [Fact] public void Xi_review_lists_bench_upgrades_without_reusing_players()
    {
        var cfg = Config(); var slots = cfg.Formations["4-3-3"];
        var players = Roster().Select(p => p.Id <= 11 ? Saved(p, slots[p.Id - 1]) : p).ToArray();
        players = players.Select(p => p.Id == 10 ? p with { Overall = 70, Potential = 85, Age = 19 } : p).ToArray();
        var xi = Run(players).Xi!;
        var swap = Assert.Single(xi.Options);
        Assert.Equal((10, 21, 10), (swap.CurrentId, swap.BetterId, swap.Gain)); Assert.NotNull(swap.Note);
        Assert.Equal(79.1, xi.SavedAverage); Assert.Equal(80, xi.ImprovedAverage);
        Assert.Null(Run(Roster()).Xi);
    }
    [Fact] public void Malformed_rules_fail_visibly()
    {
        var cfg = Config(); cfg.Depth.RotationGap["balanced"] = -1;
        Assert.Throws<DataUnavailableException>(() => Run(Roster(), cfg: cfg));
    }
}
