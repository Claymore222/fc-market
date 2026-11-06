using FcMarket.Api.Market;

namespace FcMarket.Api.Analysis;

public sealed class RecruitmentConfig
{
    public string Version { get; set; } = "1";
    public Dictionary<string, RecruitmentArchetype> Positions { get; set; } = [];
    public Dictionary<string, RecruitmentModifier> Modifiers { get; set; } = [];
    public Dictionary<string, RecruitmentModifier> Roles { get; set; } = [];
    public Dictionary<string, RecruitmentWeights> Weights { get; set; } = [];
    public int Limit { get; set; } = 8;
    public int MinimumUpgrade { get; set; } = 1;
    public int DevelopmentDiscount { get; set; } = 10;
    public int MinimumGrowth { get; set; } = 4;
    public int CriticalGap { get; set; } = 25;
    public int HighLineThreshold { get; set; } = 65;
    public double MinimumFitUpgrade { get; set; } = 2;
    public double LeagueQualityWeight { get; set; } = .2;
    public int LeagueMinimumPlayers { get; set; } = 5;
    public int TagThreshold { get; set; } = 80;
    public int RotationMaxAboveStarter { get; set; } = 0;
    public double RolePlusBonus { get; set; } = 1;
    public double RoleExpertBonus { get; set; } = 2;
    public double StyleBonus { get; set; } = .25;
    public double StylePlusBonus { get; set; } = .5;
    public double StyleBonusCap { get; set; } = 1.5;
    public double FootBonus { get; set; } = .5;
    public double LeagueBonus { get; set; } = .5;
    public double GainScale { get; set; } = 3;
    public double PotentialScale { get; set; } = 3;
    public double GrowthScale { get; set; } = 2;
    public double YouthScale { get; set; } = 1;
    public int GrowthMaxAge { get; set; } = 28;
    public double ProjectAgePenalty { get; set; } = 3;
    public int ShortTermAge { get; set; } = 30;
    public Dictionary<string, double> AgePenalty { get; set; } = new() { ["win-now"] = .25, ["balanced"] = .75, ["develop"] = 1.5 };
    public RecruitmentWeights DevelopmentGroup { get; set; } = new(.45, .1, .45);
    public int WageMinimumPlayers { get; set; } = 12;
    public int WageMinimumOverall { get; set; } = 55;
    public int ReachOverallGap { get; set; } = 12;
    public double ReachFeeMultiple { get; set; } = 3;
    public double ReachWageMultiple { get; set; } = 2;
    public int ReachPrestigeGap { get; set; } = 5;
}
public sealed class RecruitmentArchetype
{
    public string Label { get; set; } = "";
    public Dictionary<string, double> Attributes { get; set; } = [];
    public string[] Critical { get; set; } = [];
    public int[] Styles { get; set; } = [];
}
public sealed class RecruitmentModifier
{
    public string Label { get; set; } = "";
    public string[] Positions { get; set; } = [];
    public Dictionary<string, double> Attributes { get; set; } = [];
    public int[] Styles { get; set; } = [];
    public Dictionary<string, string> PreferredFoot { get; set; } = [];
    public int? MinimumHeight { get; set; }
    public int? MaximumHeight { get; set; }
}
public sealed record RecruitmentWeights(double Attributes, double Quality, double Development);
public sealed record RecruitmentTarget(string Position, string Label, IReadOnlyList<string> Preferences,
    Dictionary<string, double> Attributes, string[] Critical, int[] Styles, int? RoleId, string? PreferredFoot,
    int? StarterMinimum, int? RotationMinimum, int? DevelopmentMinimum, Dictionary<string, string>? Labels = null,
    int? MinimumHeight = null, int? MaximumHeight = null);
public sealed record TransferEvidence(long Amount, DateOnly Date, int? FromTeamId, string? FromClub, int? ToTeamId, string? ToClub, string SnapshotId);
public sealed record RecruitmentLeagueContext(int? LeagueId, string? Name, double? StarterReference, int MeasuredClubs);
public sealed record RecruitmentPlayer(MarketPlayer Player, Dictionary<string, int?> Attributes, bool RolesKnown, bool StylesKnown, TransferEvidence? LastTransfer = null,
    Dictionary<string, int>? PositionRatings = null, int? ClubPrestige = null);
/// <summary>ln wage = a + b × OVR, fitted on the user's club or league. A local going rate, not a wage demand.</summary>
public sealed record WageCurve(double Intercept, double Slope, string Source, int Players)
{
    public long Estimate(int overall) => (long)Math.Round(Math.Exp(Intercept + Slope * overall) / 100, MidpointRounding.AwayFromZero) * 100;
    public static WageCurve? Fit(IEnumerable<(int Overall, long Wage)> rows, string source)
    {
        var xy = rows.Select(r => (X: (double)r.Overall, Y: Math.Log(r.Wage))).ToArray();
        if (xy.Length < 2) return null;
        var mx = xy.Average(r => r.X); var my = xy.Average(r => r.Y);
        var spread = xy.Sum(r => (r.X - mx) * (r.X - mx));
        if (spread <= 0) return null;
        var slope = xy.Sum(r => (r.X - mx) * (r.Y - my)) / spread;
        return slope <= 0 ? null : new(my - slope * mx, slope, source, xy.Length);
    }
}
public sealed record RecruitmentCost(long? FeeLow, long? FeeHigh, long? WageLow, long? WageHigh, string Status,
    long? ReferenceAmount = null, string? ReferenceKind = null, long? ExpectedWage = null);
public sealed record CandidateAttribute(string Key, string Label, int Value, double Weight);
public sealed record RecruitmentCandidate(int Id, string Name, string? Club, int? ClubId, string? League, string[] Positions,
    int? Age, int? Overall, int? Potential, double Score, double AttributeScore, double QualityScore, double? DevelopmentScore,
    double Bonus, int KnownAttributes, int TotalAttributes, int? RoleLevel, string[] Styles, string[] StylesPlus,
    long? EstimatedValue, long? CurrentWage, bool RecordedWageOnly, bool IsFreeAgent, RecruitmentCost Cost,
    int? ComparedPlayerId, string? ComparedPlayerName, int? OverallGain, double? AttributeGain,
    IReadOnlyList<CandidateAttribute> Strengths, IReadOnlyList<CandidateAttribute> Weaknesses, IReadOnlyList<string> Reasons,
    TransferEvidence? LastTransfer = null, string[]? Tags = null, double? LeagueOverallDifference = null, int? PositionRating = null);
public sealed record RecruitmentGroup(string Key, string Label, int? MinimumOverall, int Total, IReadOnlyList<RecruitmentCandidate> Candidates,
    IReadOnlyList<RecruitmentCandidate>? OverBudget = null, int OverBudgetTotal = 0);
public sealed record InternalAlternative(int Id, string Name, int? Overall, double? AttributeScore, string? AssignedSlot, string Note);
public sealed record RecruitmentResult(string ReportId, SnapshotInfo Snapshot, string ScopeKey, string ViewMode, string ConfigVersion,
    string Formation, string Slot, RecruitmentTarget Target, int PoolSize, Dictionary<string, int> Excluded,
    IReadOnlyList<InternalAlternative> Internal, IReadOnlyList<RecruitmentGroup> Groups, IReadOnlyList<string> Warnings,
    Dictionary<string, AnalysisOrigin?>? Sources = null, RecruitmentLeagueContext? League = null, WageCurve? Wages = null);
