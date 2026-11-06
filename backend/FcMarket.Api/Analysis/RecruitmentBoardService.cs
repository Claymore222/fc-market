using System.Globalization;
using System.Text.Json;
using FcMarket.Api.Data;

namespace FcMarket.Api.Analysis;

public sealed record RecruitmentBoardPosition(string Position, bool InFormation, string Formation, string Slot,
    string Priority, int? NeedScore, IReadOnlyList<NeedReason> Reasons, RecruitmentResult Recommendations);
public sealed record RecruitmentBoard(AnalysisProfileView View, string FormationSource, string TransferBudgetSource,
    string WageBudgetSource, IReadOnlyList<RecruitmentBoardPosition> Positions, IReadOnlyList<string> Warnings, int? TeamReference = null,
    LeagueStrength? League = null, IReadOnlyList<LineBenchmark>? Lines = null, ContractPlan? Contracts = null, XiReview? Xi = null);

public sealed class RecruitmentBoardService(SquadAnalysisService profiles, RecruitmentService recommendations)
{
    public RecruitmentBoard Get(string? saveUid)
    {
        var view = profiles.Get(saveUid); var ctx = view.Context; var p = view.Profile; var cfg = ctx.Catalog;
        bool Valid(string? f) => f is not null && cfg.Formations.ContainsKey(f);
        // An unsaved profile only mirrors the save's lineup; it is not the manager's own choice.
        var formationSource = view.Version > 0 && Valid(p.Formation) ? "profile" : ctx.SuggestedFormation is not null ? "save-lineup" : Valid(p.Formation) ? "profile" : "default";
        var formation = Valid(p.Formation) ? p.Formation! : ctx.SuggestedFormation ?? cfg.Formations.Keys.First();
        var secondary = Valid(p.SecondaryFormation) && p.SecondaryFormation != formation ? p.SecondaryFormation : null;
        long? Amount(string key) => ctx.Inputs.TryGetValue(key, out var value) && value.State == "known" &&
            long.TryParse(Convert.ToString(value.Value, CultureInfo.InvariantCulture), out var n) && n >= 0 ? n : null;
        var transferSource = p.TransferBudget is not null ? "profile" : Amount("transferBudget") is not null ? "save" : "unknown";
        var wageSource = p.WeeklyWageBudget is not null ? "profile" : Amount("weeklyWageHeadroom") is not null ? "save" : "unknown";
        p = p with { Formation = formation, SecondaryFormation = secondary,
            TransferBudget = p.TransferBudget ?? Amount("transferBudget"), WeeklyWageBudget = p.WeeklyWageBudget ?? Amount("weeklyWageHeadroom"),
            ProtectedPlayerIds = p.ProtectedPlayerIds.Where(id => ctx.Players.Any(x => x.Id == id)).ToArray(),
            DeparturePlayerIds = p.DeparturePlayerIds.Where(id => ctx.Players.Any(x => x.Id == id)).ToArray(),
            PreferredLeagueIds = p.PreferredLeagueIds.Where(id => ctx.Leagues.Any(l => l.Id == id)).ToArray(),
            PlayerPreferences = p.PlayerPreferences.Where(x => cfg.PlayerPreferenceChoices.TryGetValue(x.Key, out var options) && options.ContainsKey(x.Value)).ToDictionary(),
            RolePreferences = p.RolePreferences.Where(x => x.Key == formation || x.Key == secondary).ToDictionary(x => x.Key,
                x => x.Value.Where(r => cfg.Formations[x.Key].Contains(r.Key) && ctx.Roles.Any(role => role.Id == r.Value && role.Position == cfg.Position(r.Key))).ToDictionary()) };
        var reports = new Dictionary<string, DepthReport>();
        DepthReport Report(string f)
        {
            if (reports.TryGetValue(f, out var existing)) return existing;
            var profile = p with { Formation = f, SecondaryFormation = null, RolePreferences = p.RolePreferences.Where(x => x.Key == f).ToDictionary() };
            return reports[f] = profiles.Run(saveUid, new(ctx.Snapshot.SnapshotId, ctx.Snapshot.Revision, ctx.ConfigVersion, view.Version, profile));
        }
        string[] positions = ["GK", "RB", "CB", "LB", "CDM", "CM", "CAM", "RM", "LM", "RW", "LW", "ST"];
        var output = new List<RecruitmentBoardPosition>();
        foreach (var pos in positions)
        {
            var inFormation = cfg.Formations[formation].Any(s => cfg.Position(s) == pos);
            var template = inFormation ? formation : p.SecondaryFormation is { } sf && cfg.Formations[sf].Any(s => cfg.Position(s) == pos)
                ? sf : cfg.Formations.FirstOrDefault(f => f.Value.Any(s => cfg.Position(s) == pos)).Key;
            if (template is null) continue;
            var report = Report(template); var depth = report.Formations.Single();
            var target = depth.Slots.Where(s => s.Position == pos).OrderByDescending(s => s.NeedScore ?? -1).ThenBy(s => s.Slot, StringComparer.Ordinal).First();
            var result = recommendations.Get(saveUid, report.Id, template, target.Slot);
            output.Add(new(pos, inFormation, template, target.Slot, target.Priority, target.NeedScore, target.Reasons, result));
        }
        var fresh = profiles.Get(saveUid);
        if (fresh.Context.ScopeKey != ctx.ScopeKey || fresh.Context.ViewMode != ctx.ViewMode || fresh.Context.Snapshot.SnapshotId != ctx.Snapshot.SnapshotId ||
            fresh.Context.Snapshot.Revision != ctx.Snapshot.Revision || fresh.Context.ConfigVersion != ctx.ConfigVersion || fresh.Version != view.Version)
            throw new AnalysisConflictException("Öneriler hazırlanırken kariyer veya profil değişti. Yenile.");
        var warnings = new List<string> { "İlk öneriler mevcut verilerle hazırlanır; soru kartları isteğe bağlıdır. Profil kendiliğinden kaydedilmez.",
            "Seçili dizilişte bulunmayan mevkiler alternatif diziliş senaryosudur; ihtiyaçlar birbirine eklenmez.",
            "Bonservis talebi bilinmiyor. Geçmiş transfer varsa yalnız tarihli kanıt; değer modeli bütçe ön elemesidir." };
        if (formationSource == "default") warnings.Add("Kayıttan diziliş çözülemedi; başlangıç şablonu kullanıldı. Tercihlerden değiştirebilirsin.");
        var chosen = Report(formation).Formations.Single();
        return new(view with { Profile = p }, formationSource, transferSource, wageSource, output, warnings, chosen.TeamReference, chosen.League, chosen.Lines, chosen.Contracts, chosen.Xi);
    }
}
