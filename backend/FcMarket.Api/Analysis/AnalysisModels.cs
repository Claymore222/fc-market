using System.Text.Json.Serialization;
using FcMarket.Api.Market;

namespace FcMarket.Api.Analysis;

public sealed class AnalysisConfig
{
    public string Version { get; set; } = "1";
    public Dictionary<string, string[]> Formations { get; set; } = [];
    public Dictionary<string, string> SlotAliases { get; set; } = [];
    public Dictionary<string, Dictionary<string, string>> Choices { get; set; } = [];
    public DepthRules Depth { get; set; } = new();
    public Dictionary<string, Dictionary<string, string>> PlayerPreferenceChoices { get; set; } = [];
    public string Position(string slot) => SlotAliases.GetValueOrDefault(slot, slot);
}

public sealed record ManagerProfile
{
    public string? Formation { get; init; }
    public string? SecondaryFormation { get; init; }
    public string[] Attack { get; init; } = ["balanced"];
    public string Defense { get; init; } = "mid-block";
    public string Tempo { get; init; } = "balanced";
    public int? DefensiveLine { get; init; }
    public string Horizon { get; init; } = "balanced";
    public string MatchMode { get; init; } = "mixed";
    public long? TransferBudget { get; init; }
    public long? WeeklyWageBudget { get; init; }
    public int ReservePercent { get; init; } = 15;
    public int TargetTransfers { get; init; } = 2;
    public int? MinAge { get; init; }
    public int? MaxAge { get; init; }
    public int[] PreferredLeagueIds { get; init; } = [];
    public int[] ProtectedPlayerIds { get; init; } = [];
    public int[] DeparturePlayerIds { get; init; } = [];
    public Dictionary<string, Dictionary<string, int>> RolePreferences { get; init; } = [];
    public Dictionary<string, string> PlayerPreferences { get; init; } = [];
}

public sealed record AnalysisOrigin(string SnapshotId, DateOnly? GameDate, string Kind);
public sealed record AnalysisValue(object? Value, string State, AnalysisOrigin? Origin, string? Note = null);
public sealed record AnalysisCoverage(string Key, string Label, int Known, int Total, string State, AnalysisOrigin? Origin, string? Note = null);
public sealed record AnalysisPlayer(int Id, string Name, int? Age, int? Overall, int? Potential, string[] Positions,
    string? Slot, long? WeeklyWage, int? ContractEnd, int? Fitness, int[]? Roles, int[]? PlayStyles, int[]? PlayStylesPlus,
    Dictionary<string, int?> Attributes, Dictionary<string, AnalysisValue> Availability, AnalysisValue Loan,
    int? SquadSlot, int? Form, string? Foot, Dictionary<string, int>? PositionRatings = null);
public sealed record AnalysisRole(int Id, string Name, string Position);
public sealed record AnalysisLeague(int Id, string Name);
public sealed record LeagueClub(int TeamId, string? Name, IReadOnlyList<AnalysisPlayer> Players);
public sealed record AnalysisContext(SnapshotInfo Snapshot, string ScopeKey, string ViewMode, string ConfigVersion,
    string? SuggestedFormation, IReadOnlyList<AnalysisPlayer> Players, Dictionary<string, AnalysisValue> Inputs,
    IReadOnlyList<AnalysisCoverage> Coverage, AnalysisConfig Catalog, IReadOnlyList<AnalysisRole> Roles,
    IReadOnlyList<AnalysisLeague> Leagues, BoardObjective? LeagueObjective = null,
    [property: JsonIgnore] IReadOnlyList<LeagueClub>? LeagueClubs = null);
public sealed record AnalysisProfileView(AnalysisContext Context, ManagerProfile Profile, long Version, string? UpdatedAt,
    string? SavedSnapshotId, long? SavedSnapshotRevision, string? SavedConfigVersion = null);
public sealed record SaveManagerProfile(string SnapshotId, long SnapshotRevision, string ConfigVersion, long ExpectedVersion,
    ManagerProfile Profile);
public sealed class AnalysisConflictException(string message) : Exception(message);

public sealed class DepthRules
{
    public string Version { get; set; } = "1";
    public int MinBaselinePlayers { get; set; } = 5;
    public Dictionary<string, int> StarterGap { get; set; } = new() { ["win-now"] = 6, ["balanced"] = 8, ["develop"] = 10 };
    public Dictionary<string, int> RotationGap { get; set; } = new() { ["win-now"] = 12, ["balanced"] = 14, ["develop"] = 16 };
    public int DevelopmentAge { get; set; } = 23;
    public int MatureAge { get; set; } = 30;
    public int MatureGoalkeeperAge { get; set; } = 34;
    public int LongAbsenceDays { get; set; } = 45;
    public DepthNeedRules Need { get; set; } = new();
}
public sealed class DepthNeedRules
{
    public int MinLeagueClubs { get; set; } = 8;
    public int MinClubPlayers { get; set; } = 16;
    public double BottomShare { get; set; } = .34;
    public Dictionary<string, double> StarterDeficit { get; set; } = new() { ["win-now"] = 1, ["balanced"] = 1.5, ["develop"] = 2.5 };
    public Dictionary<string, double> RotationDeficit { get; set; } = new() { ["win-now"] = 3, ["balanced"] = 4, ["develop"] = 6 };
    public double StarterPoint { get; set; } = 6;
    public double RotationPoint { get; set; } = 2;
    public double LeagueCap { get; set; } = 40;
    public int StarterContract { get; set; } = 12;
    public int RotationContract { get; set; } = 6;
    public int FutureGap { get; set; } = 6;
    public int MatureStarter { get; set; } = 4;
    public int MinimumXiGain { get; set; } = 2;
}
public sealed record NeedReason(string Code, string Text);
public sealed record DepthSlot(string Slot, string Position, int? StarterId, int? RotationId, int? ReadyStarterId,
    int? ReadyRotationId, int? NextSeasonStarterId, int? NextSeasonRotationId, int? DevelopmentId,
    int? PreferredRoleId, string Priority, int? NeedScore, bool Conditional, bool TemporaryGap, IReadOnlyList<NeedReason> Reasons,
    int? StarterRating = null, int? RotationRating = null);
/// <summary>Same allocation in every league club, so a line average is compared like with like.</summary>
public sealed record LineBenchmark(string Position, double? Starter, double? StarterMedian, int? StarterRank,
    double? Rotation, double? RotationMedian, int? RotationRank, int Clubs);
public sealed record LeagueStrength(double? Own, double? Median, int? Rank, int Clubs);
public sealed record ContractPlanItem(int PlayerId, string Name, int? Age, int? Rating, string? Slot, string Role, long? WeeklyWage, string Action);
public sealed record ContractPlan(int EndYear, int Players, int Squad, int Starters, long? Wages, long? WageBill, IReadOnlyList<ContractPlanItem> Items);
public sealed record XiOption(string Slot, string Position, int CurrentId, string CurrentName, int? CurrentRating,
    int BetterId, string BetterName, int? BetterRating, int Gain, string? Note);
public sealed record XiReview(double? SavedAverage, double? ImprovedAverage, IReadOnlyList<XiOption> Options);
public sealed record FormationDepth(string Formation, int? TeamReference, int? StarterFloor, int? RotationFloor,
    int FilledStarters, int FilledRotation, int ReadyStarters, int ReadyRotation, int NextSeasonStarters,
    int NextSeasonRotation, IReadOnlyList<DepthSlot> Slots, IReadOnlyList<LineBenchmark>? Lines = null,
    LeagueStrength? League = null, ContractPlan? Contracts = null, XiReview? Xi = null);
public sealed record DepthReport(string Id, string CreatedAt, SnapshotInfo Snapshot, string ScopeKey, string ViewMode,
    string ConfigVersion, string RulesVersion, string ProfileHash, ManagerProfile Profile, bool Draft,
    IReadOnlyList<FormationDepth> Formations, IReadOnlyList<string> Warnings, long ProfileVersion = 0);
