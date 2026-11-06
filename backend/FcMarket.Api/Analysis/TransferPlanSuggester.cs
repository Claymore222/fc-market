using FcMarket.Api.Data;

namespace FcMarket.Api.Analysis;

public sealed record SuggestionCandidate(AnalysisPlayer Player, long Fee, long WeeklyWage);
public sealed record SuggestionPicks(string Goal, IReadOnlyList<SuggestionCandidate> Picks);

/// <summary>
/// Rule-based greedy search for three package goals. Levels are the fast capacity-one allocation; needs come from a full
/// depth run after each pick, so a filled place stops attracting spending. It is a heuristic, not a proven optimum.
/// </summary>
public static class TransferPlanSuggester
{
    public static readonly string[] Goals = ["low", "balanced", "high"];

    public static void Validate(TransferSuggestionConfig cfg)
    {
        if (string.IsNullOrWhiteSpace(cfg.Version) || cfg.MaxBuys is < 1 or > 11 || cfg.CandidatesPerPosition is < 1 or > 100 ||
            cfg.RotationWeight is < 0 or > 1 || cfg.GapPoints is < 0 or > 40 || cfg.MinGain < 0 || cfg.ResolveBonus < 0 ||
            cfg.RotationHeadroom < 0 || cfg.DropPenalty < 0 || cfg.CloseChecks is < 1 or > 50 || Goals.Any(id =>
                !cfg.Goals.TryGetValue(id, out var g) || g.CostWeight < 0 || g.Needs.Length == 0))
            throw new DataUnavailableException("Otomatik paket ayarları geçersiz.");
    }

    public static IReadOnlyList<SuggestionPicks> Search(AnalysisContext ctx, ManagerProfile profile, decimal feeBudget, decimal wageBudget,
        IReadOnlyList<SuggestionCandidate> candidates, TransferSuggestionConfig cfg)
    {
        var limit = Math.Min(profile.TargetTransfers, cfg.MaxBuys);
        var ordered = candidates.OrderBy(c => c.Player.Id).ToArray();
        var levels = new Dictionary<string, (int? Starter, int? Rotation)[]>();
        var depths = new Dictionary<string, FormationDepth>();
        static string Key(IEnumerable<SuggestionCandidate> set) => string.Join(',', set.Select(c => c.Player.Id).Order());
        (int? Starter, int? Rotation)[] Levels(IReadOnlyCollection<SuggestionCandidate> set)
        {
            var key = Key(set);
            return levels.TryGetValue(key, out var found) ? found : levels[key] = DepthAnalysis.SlotLevels(ctx, profile.Formation!, set.Select(c => c.Player));
        }
        FormationDepth Depth(IReadOnlyCollection<SuggestionCandidate> set)
        {
            var key = Key(set);
            return depths.TryGetValue(key, out var found) ? found : depths[key] = DepthAnalysis.Compute(
                TransferPlanEngine.Project(ctx, new HashSet<int>(), set.Select(c => c.Player).ToArray()), profile).Formations.Single();
        }
        return Goals.Select(id =>
        {
            var goal = cfg.Goals[id]; var picks = new List<SuggestionCandidate>(); var dropped = new HashSet<SuggestionCandidate>();
            double[] Weights(FormationDepth depth) => depth.Slots.Select(s => goal.Needs.Contains(s.Priority) ? (s.NeedScore ?? 0) / 100d : 0).ToArray();
            var start = Depth([]); var pruned = false;
            do
            {
                while (picks.Count < limit)
                {
                    var depth = Depth(picks); var weights = Weights(depth);
                    if (weights.All(w => w == 0)) break;
                    var now = Levels(picks); long fees = picks.Sum(c => c.Fee), wages = picks.Sum(c => c.WeeklyWage);
                    var scored = new List<(SuggestionCandidate Candidate, double Score)>();
                    foreach (var candidate in ordered)
                    {
                        if (picks.Contains(candidate) || dropped.Contains(candidate) || fees + candidate.Fee > feeBudget || wages + candidate.WeeklyWage > wageBudget) continue;
                        var gain = Gain(weights, now, Levels([.. picks, candidate]), depth, cfg);
                        if (gain < cfg.MinGain) continue;
                        var share = (Share(candidate.Fee, feeBudget) + Share(candidate.WeeklyWage, wageBudget)) / 2;
                        scored.Add((candidate, gain / (1 + goal.CostWeight * share)));
                    }
                    // Stable order: a tied score must not depend on the board's listing order.
                    var best = scored.OrderByDescending(x => x.Score).ThenBy(x => x.Candidate.Player.Id).Select(x => x.Candidate)
                        .Take(goal.MustClose ? cfg.CloseChecks : 1)
                        .FirstOrDefault(c => !goal.MustClose || OpenNeeds(Depth([.. picks, c]), goal) < OpenNeeds(depth, goal));
                    if (best is null) break;
                    picks.Add(best);
                }
                // A later pick can reshuffle the allocation and leave an earlier one without a role; its place is searched again.
                pruned = false;
                foreach (var pick in picks.ToArray())
                {
                    if (Gain(Weights(start), Levels(picks.Where(c => c != pick).ToArray()), Levels(picks), start, cfg) >= cfg.MinGain) continue;
                    picks.Remove(pick); dropped.Add(pick); pruned = true;
                }
            } while (pruned);
            return new SuggestionPicks(id, picks);
        }).ToArray();
    }

    static double Share(long amount, decimal budget) => budget > 0 ? (double)(amount / budget) : 0;

    static int OpenNeeds(FormationDepth depth, TransferSuggestionGoal goal) => depth.Slots.Count(s => goal.Needs.Contains(s.Priority));

    // A filled gap is worth a fixed step below the model floor: an empty place has no rating to subtract.
    // Reaching the floor earns a bonus, and reserve quality far above the floor is not worth paying for.
    // Coverage outranks quality in the allocation, so filling a reserve place can weaken a covered slot; that costs too.
    static double Gain(double[] weights, (int? Starter, int? Rotation)[] now, (int? Starter, int? Rotation)[] next,
        FormationDepth depth, TransferSuggestionConfig cfg)
    {
        double Step(int? before, int? after, int? floor, double? headroom)
        {
            if (after is not { } a) return 0;
            double Capped(double level) => floor is { } f && headroom is { } h ? Math.Min(level, f + h) : level;
            double old = before ?? (floor ?? a) - cfg.GapPoints;
            return Capped(a) - Capped(old) + (floor is { } line && old < line && a >= line ? cfg.ResolveBonus : 0);
        }
        static double Drop(int? before, int? after) => before is { } b && after is { } a ? Math.Max(0, b - a) : 0;
        return weights.Select((weight, i) => weight * (Step(now[i].Starter, next[i].Starter, depth.StarterFloor, null) +
            cfg.RotationWeight * Step(now[i].Rotation, next[i].Rotation, depth.RotationFloor, cfg.RotationHeadroom)) -
            cfg.DropPenalty * (Drop(now[i].Starter, next[i].Starter) + cfg.RotationWeight * Drop(now[i].Rotation, next[i].Rotation))).Sum();
    }
}
