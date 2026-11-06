using FcMarket.Api.Market;

namespace FcMarket.Api.Analysis;

public sealed class TransferPlanConfig
{
    public string Version { get; set; } = "1";
    public int MaxMoves { get; set; } = 30;
    public long MaxAmount { get; set; } = 1_000_000_000_000;
    public double[] FeeRange { get; set; } = [0.5, 1.75];
    public double[] WageRange { get; set; } = [0.9, 1.5];
}
/// <summary>Kept apart from TransferPlanConfig: tuning the search must not mark saved packages as stale.</summary>
public sealed class TransferSuggestionConfig
{
    public string Version { get; set; } = "";
    public int MaxBuys { get; set; }
    public int CandidatesPerPosition { get; set; }
    public double RotationWeight { get; set; }
    public double GapPoints { get; set; }
    public double MinGain { get; set; }
    public double ResolveBonus { get; set; }
    public double RotationHeadroom { get; set; }
    public double DropPenalty { get; set; }
    public int CloseChecks { get; set; }
    public Dictionary<string, TransferSuggestionGoal> Goals { get; set; } = new();
}
public sealed class TransferSuggestionGoal
{
    public double CostWeight { get; set; }
    public string[] Needs { get; set; } = [];
    public bool MustClose { get; set; }
}
public sealed record TransferPlanSource(string ScopeKey, string ViewMode, string SnapshotId, long Revision,
    string ConfigVersion, string RecruitmentVersion, string PlanVersion, long ProfileVersion);
public sealed record PlanAcquisition(int PlayerId, long? Fee = null, long? WeeklyWage = null, long? SigningFee = null);
public sealed record PlanSale(int PlayerId, long? Proceeds = null);
public sealed record TransferPlanDraft(string Formation, PlanAcquisition[] Transfers, PlanSale[] Sales, PlanAcquisition[] Promotions);
public sealed record TransferPlanRequest(TransferPlanSource Source, long ExpectedVersion, TransferPlanDraft Draft);
public sealed record TransferPlanPlayer(int PlayerId, string Name, string[] Positions, string Action,
    long? Fee, string FeeSource, long? WeeklyWage, string WageSource, long? SigningFee);
/// <summary>HighFitsBudget is null when a budget is unknown; the range itself is an assumption, not an asking price.</summary>
public sealed record PlanCostRange(long FeeLow, long FeeHigh, long WageLow, long WageHigh, bool? HighFitsBudget);
public sealed record PlanBudget(decimal? TransferBudget, decimal? WeeklyWageBudget, long KnownFees, int UnknownFees,
    long KnownWeeklyWages, int UnknownWeeklyWages, long KnownSigningFees, int UnknownSigningFees,
    long KnownSaleProceeds, int UnknownSaleProceeds, long KnownWageRelease, int UnknownWageRelease,
    decimal? RemainingWithoutSales, decimal? WageRemainingWithoutSales, decimal? RemainingWithSales,
    decimal? WageRemainingWithSales, string Status, PlanCostRange? Range = null);
public sealed record TransferPlanResult(TransferPlanSource Source, SnapshotInfo Snapshot, string CreatedAt,
    IReadOnlyList<TransferPlanPlayer> Players, PlanBudget Budget, FormationDepth Before, FormationDepth After,
    IReadOnlyList<NeedReason> Warnings);
public sealed record TransferPlanView(TransferPlanSource CurrentSource, long Version, string? UpdatedAt,
    TransferPlanDraft? Draft, TransferPlanResult? Result, bool Stale);
public sealed record TransferPlanSuggestionRequest(TransferPlanSource Source, string Formation);
public sealed record PlanSuggestionPick(int PlayerId, string Name, string? Slot, string Role, int? RatingBefore, int? RatingAfter);
public sealed record TransferPlanSuggestion(string Goal, TransferPlanDraft? Draft, TransferPlanResult? Result,
    IReadOnlyList<PlanSuggestionPick> Picks, int OpenNeedsBefore, int OpenNeedsAfter, double? XiBefore, double? XiAfter, string? SameAs, string? Empty = null);
public sealed record TransferPlanSuggestions(TransferPlanSource Source, string Formation, IReadOnlyList<TransferPlanSuggestion> Packages,
    int UnknownCostSkipped, IReadOnlyList<NeedReason> Notes);
public sealed record RecruitmentScenarioPool(IReadOnlyList<RecruitmentPlayer> Players, IReadOnlySet<int> OwnIds, WageCurve? Wages);
