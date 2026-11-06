using System.Globalization;
using FcMarket.Api.Data;
using FcMarket.Api.Market;

namespace FcMarket.Api.Analysis;

public static class RecruitmentEngine
{
    public static void Validate(RecruitmentConfig c, IReadOnlyDictionary<string, string> attributes)
    {
        bool Weights(Dictionary<string, double>? a) => a is not null && a.Count > 0 && a.All(x =>
            attributes.ContainsKey(x.Key) && double.IsFinite(x.Value) && x.Value > 0 && x.Value <= 100);
        if (string.IsNullOrWhiteSpace(c.Version) || c.Positions is null || c.Modifiers is null || c.Roles is null || c.Weights is null ||
            new[] { "GK", "RB", "LB", "RWB", "LWB", "CB", "CDM", "CM", "CAM", "RM", "LM", "RW", "LW", "ST" }
                .Any(p => !c.Positions.TryGetValue(p, out var a) || a is null || !Weights(a.Attributes) || a.Critical is null ||
                    a.Critical.Length == 0 || a.Critical.Any(k => !a.Attributes.ContainsKey(k)) || a.Styles is null) ||
            c.Modifiers.Values.Concat(c.Roles.Values).Any(m => m is null || !Weights(m.Attributes) || m.Positions is null || m.Styles is null || m.PreferredFoot is null ||
                m.MinimumHeight is < 100 or > 230 || m.MaximumHeight is < 100 or > 230 || m.MinimumHeight > m.MaximumHeight) ||
            new[] { "win-now", "balanced", "develop" }.Any(h => !c.Weights.TryGetValue(h, out var w) || w is null ||
                new[] { w.Attributes, w.Quality, w.Development }.Any(v => !double.IsFinite(v) || v < 0) ||
                Math.Abs(w.Attributes + w.Quality + w.Development - 1) > .00001 || w.Attributes < .5) ||
            c.Limit is < 1 or > 20 || c.MinimumUpgrade is < 0 or > 10 || c.DevelopmentDiscount is < 0 or > 30 ||
            c.MinimumGrowth is < 0 or > 30 || c.CriticalGap is < 0 or > 40 || c.HighLineThreshold is < 0 or > 100 ||
            !double.IsFinite(c.MinimumFitUpgrade) || c.MinimumFitUpgrade is < 0 or > 20 ||
            new[] { c.RolePlusBonus, c.RoleExpertBonus, c.StyleBonus, c.StylePlusBonus, c.StyleBonusCap, c.FootBonus, c.LeagueBonus,
                c.GainScale, c.PotentialScale, c.GrowthScale, c.YouthScale }.Any(v => !double.IsFinite(v) || v < 0 || v > 10) ||
            c.RoleExpertBonus < c.RolePlusBonus || !double.IsFinite(c.LeagueQualityWeight) || c.LeagueQualityWeight is < 0 or > .5 ||
            c.LeagueMinimumPlayers is < 1 or > 11 || c.TagThreshold is < 40 or > 99 || c.RotationMaxAboveStarter is < 0 or > 10 ||
            c.GrowthMaxAge is < 20 or > 40 || !double.IsFinite(c.ProjectAgePenalty) || c.ProjectAgePenalty < 0 || c.ShortTermAge is < 20 or > 45 ||
            c.AgePenalty is null || new[] { "win-now", "balanced", "develop" }.Any(h => !c.AgePenalty.TryGetValue(h, out var a) || !double.IsFinite(a) || a < 0) ||
            c.DevelopmentGroup is not { } g || new[] { g.Attributes, g.Quality, g.Development }.Any(v => !double.IsFinite(v) || v < 0) ||
            Math.Abs(g.Attributes + g.Quality + g.Development - 1) > .00001 || c.WageMinimumPlayers < 2 ||
            c.ReachOverallGap < 0 || c.ReachFeeMultiple < 1 || c.ReachWageMultiple < 1 || c.ReachPrestigeGap < 0)
            throw new DataUnavailableException("Oyuncu öneri kuralları geçersiz veya özellik eşlemesi eksik.");
    }

    public static RecruitmentTarget Target(DepthReport report, FormationDepth formation, DepthSlot slot, RecruitmentConfig cfg, AnalysisContext ctx)
    {
        if (!cfg.Positions.TryGetValue(slot.Position, out var archetype)) throw new BadRequestException("Bu mevki için öneri profili yok.");
        var weights = new Dictionary<string, double>(archetype.Attributes);
        var preferences = new List<string>(); var styles = new HashSet<int>(archetype.Styles); var feet = new HashSet<string>();
        int? minHeight = null, maxHeight = null;
        var profile = report.Profile;
        var modifiers = profile.Attack.Concat([profile.Defense, profile.Tempo])
            .Concat(profile.DefensiveLine >= cfg.HighLineThreshold ? ["high-line"] : Array.Empty<string>()).Distinct();
        void Apply(RecruitmentModifier m)
        {
            preferences.Add(m.Label);
            foreach (var (key, value) in m.Attributes) weights[key] = weights.GetValueOrDefault(key) + value;
            styles.UnionWith(m.Styles);
            if (m.PreferredFoot.TryGetValue(slot.Position, out var f)) feet.Add(f);
            if (m.MinimumHeight is { } min) minHeight = Math.Max(minHeight ?? min, min);
            if (m.MaximumHeight is { } max) maxHeight = Math.Min(maxHeight ?? max, max);
        }
        foreach (var key in modifiers.Order(StringComparer.Ordinal))
            if (cfg.Modifiers.TryGetValue(key, out var m) && m.Positions.Contains(slot.Position)) Apply(m);
        if (slot.PreferredRoleId is { } role && cfg.Roles.TryGetValue(role.ToString(), out var roleModifier)) Apply(roleModifier);
        if (profile.PlayerPreferences.TryGetValue(slot.Position, out var preference))
        {
            if (!cfg.Modifiers.TryGetValue(preference, out var modifier) || !modifier.Positions.Contains(slot.Position))
                throw new DataUnavailableException("Oyuncu tarzı için öneri kuralı bulunamadı.");
            Apply(modifier);
        }
        var starter = ctx.Players.FirstOrDefault(p => p.Id == slot.StarterId);
        var rotation = ctx.Players.FirstOrDefault(p => p.Id == slot.RotationId);
        int? Floor(int? model, int? current) => model is { } m ? Math.Max(m, current ?? m) : null;
        return new(slot.Position, archetype.Label, preferences, weights, archetype.Critical, styles.Order().ToArray(), slot.PreferredRoleId,
            feet.Count == 1 ? feet.Single() : null, Floor(formation.StarterFloor, starter?.Overall), Floor(formation.RotationFloor, rotation?.Overall),
            formation.RotationFloor is { } rf ? Math.Max(0, rf - cfg.DevelopmentDiscount) : null, null, minHeight, maxHeight);
    }

    public static double? AttributeScore(IReadOnlyDictionary<string, int?> attrs, RecruitmentTarget target)
    {
        // No favourable renormalisation of a few high attributes: all weighted inputs must be known.
        if (target.Attributes.Keys.Any(k => !attrs.TryGetValue(k, out var value) || value is null or < 0 or > 100)) return null;
        return target.Attributes.Sum(x => attrs[x.Key]!.Value * x.Value) / target.Attributes.Values.Sum();
    }

    /// <summary>Growth stops counting past GrowthMaxAge: a veteran's POT is a stored peak, not a future rating.</summary>
    static double? Project(int overall, int? potential, int? age, int reference, int developmentAge, RecruitmentConfig cfg)
    {
        if (potential is not { } pot || age is not { } years) return null;
        var future = years > cfg.GrowthMaxAge ? overall : pot;
        return Math.Clamp(50 + (future - reference) * cfg.PotentialScale + Math.Max(0, future - overall) * cfg.GrowthScale +
            Math.Max(0, developmentAge - years) * cfg.YouthScale - Math.Max(0, years - cfg.GrowthMaxAge) * cfg.ProjectAgePenalty, 0, 100);
    }

    /// <summary>Clearly out of reach for this club, whatever the budget label says. Unknown values never exclude.</summary>
    static bool Unreachable(RecruitmentPlayer input, ManagerProfile profile, RecruitmentConfig cfg, int reference, int? ownPrestige, long? topWage)
    {
        var p = input.Player; var cost = Cost(p, profile, cfg, input.LastTransfer);
        var feeBudget = profile.TransferBudget * ((100 - profile.ReservePercent) / 100m);
        return p.Overall - reference > cfg.ReachOverallGap ||
            feeBudget > 0 && cost.ReferenceAmount > feeBudget * (decimal)cfg.ReachFeeMultiple ||
            topWage is not null && cost.WageLow > topWage * cfg.ReachWageMultiple ||
            ownPrestige is not null && input.ClubPrestige - ownPrestige >= cfg.ReachPrestigeGap;
    }

    public static RecruitmentCost Cost(MarketPlayer p, ManagerProfile profile, RecruitmentConfig cfg, TransferEvidence? transfer = null,
        WageCurve? wages = null, long? topWage = null)
    {
        // No asking price is available. A recorded old fee or a value model is a labelled screening reference only.
        long? reference = p.IsFreeAgent ? 0 : transfer?.Amount ?? (p.Value is >= 0 ? p.Value : null);
        var kind = p.IsFreeAgent ? "free-agent" : transfer is not null ? "last-transfer" : reference is not null ? "value-model" : null;
        var wage = p.IsFreeAgent ? p.RecordedWage : p.Wage;
        if (wage < 0) wage = null;
        var feeBudget = profile.TransferBudget * ((100 - profile.ReservePercent) / 100m);
        var wageBudget = profile.WeeklyWageBudget * ((100 - profile.ReservePercent) / 100m);
        // A player earning less today still has to fit the buying club's pay scale.
        long? expected = wages is not null && p.Overall is { } overall ? Math.Max(wage ?? 0, wages.Estimate(overall)) : wage;
        var feeAbove = feeBudget is not null && reference > feeBudget; var wageAbove = wageBudget is not null && expected > wageBudget;
        var status = feeAbove ? "reference-above"
            : wageAbove ? expected <= topWage ? "reference-wage" : "reference-above"
            : feeBudget is null || wageBudget is null || reference is null || expected is null ? "unknown" : "reference-within";
        return new(p.IsFreeAgent ? 0 : null, p.IsFreeAgent ? 0 : null, wage, wage, status, reference, kind, expected);
    }

    public static RecruitmentResult Build(AnalysisContext ctx, DepthReport report, string formationName, string slotName,
        IReadOnlyList<RecruitmentPlayer> pool, IReadOnlySet<int> ownIds, RecruitmentConfig cfg, string configVersion,
        IReadOnlyDictionary<string, string> labels, IReadOnlyDictionary<string, string> styleLabels, RecruitmentLeagueContext? league = null,
        WageCurve? wages = null, int? ownPrestige = null)
    {
        var formation = report.Formations.FirstOrDefault(f => f.Formation == formationName) ?? throw new BadRequestException("Rapor bu dizilişi içermiyor.");
        var slot = formation.Slots.FirstOrDefault(s => s.Slot == slotName) ?? throw new BadRequestException("Rapor bu yeri içermiyor.");
        var target = Target(report, formation, slot, cfg, ctx);
        target = target with { Labels = target.Attributes.Keys.ToDictionary(k => k, k => labels.GetValueOrDefault(k, k)) };
        var profile = report.Profile;
        var position = slot.Position;
        var topWage = ctx.Players.Max(p => p.WeeklyWage);
        var wageBudget = profile.WeeklyWageBudget * ((100 - profile.ReservePercent) / 100m);
        int? Level(int? id) => ctx.Players.FirstOrDefault(p => p.Id == id) is { } own ? DepthAnalysis.Rating(own, position) : null;
        var counts = new Dictionary<string, int>();
        void Exclude(string key) => counts[key] = counts.GetValueOrDefault(key) + 1;
        var groups = new Dictionary<string, List<RecruitmentCandidate>> { ["starter"] = [], ["rotation"] = [], ["development"] = [] };
        var warnings = new List<string>
        {
            "Uyum endeksi yerel model puanıdır; maç başarısı olasılığı veya oyunun resmî reytingi değildir.",
            "İstenen bonservis ve yeni maaş talebi bilinmiyor. Son transfer bedeli varsa tarihli kayıt olarak gösterilir; değer modeli yalnız bütçe ön elemesidir. Beklenen maaş, kulübünün veya liginin OVR-maaş düzeninden tahmindir; talep değildir. İmza/temsilci ücretleri bilinmiyor.",
            "Adaylar tek tek değerlendirilir. Gruplar alternatif amaçlardır; aynı oyuncu birden çok grupta bulunabilir. Birlikte transfer paketi ve ortak bütçe henüz hesaplanmaz.",
            "Rotasyon grubunda ilk seçeneğin OVR üstündeki oyuncular ilk 11 grubuna bırakılır; yıldız oyuncu sırf puanı yüksek diye yedek önerisi yapılmaz.",
            "Transfer listesi, kulübün kabulü, oyuncunun gelme isteği, tescil kuralları ve güncel sakatlık/ceza uygunluğu doğrulanmış değildir.",
            "Eksik özellikler sıfır sayılmaz; hedef profilin tüm ağırlıklı özellikleri bilinmiyorsa puan üretilmez. Kiralık tablosu bayat olabilir; kendi kiralığı olabilecek oyuncu dış aday yapılmaz.",
            "Tercih edilen ligler küçük bir ek katkıdır; yaş aralığı ve kayıtlı mevki zorunlu koşuldur. Maç biçimi gizli simülasyon formülü gibi kullanılmaz."
        };
        if (target.Preferences.Count == 0) warnings.Add("Bu yer için genel mevki profili kullanılıyor; özel stil/rol katkısı yok.");
        if (formation.TeamReference is null) warnings.Add("Takımın kalite referansı yetersiz; transfer adayları sıralanmadı.");
        var internalOptions = ctx.Players.Where(p => p.Positions.Contains(slot.Position)).Select(p =>
        {
            var used = formation.Slots.FirstOrDefault(s => s.StarterId == p.Id || s.RotationId == p.Id);
            var note = used is null ? "Yapısal atamada kullanılmamış kadro içi seçenek; sağlık ve kaliteyi kontrol et."
                : used.Slot == slot.Slot ? "Bu yerin mevcut ilk seçenek/rotasyon havuzunda."
                : $"Zaten {used.Slot} yerinde kullanılıyor; buraya kaydırmak o yerde açık oluşturabilir. Bağımsız yedek değildir.";
            return new InternalAlternative(p.Id, p.Name, p.Overall, AttributeScore(p.Attributes, target), used?.Slot, note);
        }).OrderByDescending(p => p.AttributeScore).ThenBy(p => p.Id).Take(cfg.Limit).ToArray();

        foreach (var input in pool.OrderBy(p => p.Player.Id))
        {
            var p = input.Player;
            if (ownIds.Contains(p.Id) || p.ClubId == ctx.Snapshot.UserTeamId) { Exclude("own-or-loan"); continue; }
            if (p.ClubId is null && !p.IsFreeAgent) { Exclude("ownership-unknown"); continue; }
            if (!p.Positions.Contains(slot.Position)) { Exclude("position"); continue; }
            if ((profile.MinAge is not null || profile.MaxAge is not null) && p.Age is null) { Exclude("age-unknown"); continue; }
            if (p.Age < profile.MinAge || p.Age > profile.MaxAge) { Exclude("age-range"); continue; }
            if ((target.MinimumHeight is not null || target.MaximumHeight is not null) && p.Height is null) { Exclude("height-unknown"); continue; }
            if (p.Height < target.MinimumHeight || p.Height > target.MaximumHeight) { Exclude("height-range"); continue; }
            if (p.Overall is null or < 0 or > 100) { Exclude("overall-unknown"); continue; }
            if (formation.TeamReference is null) continue;
            if (Unreachable(input, profile, cfg, formation.TeamReference.Value, ownPrestige, topWage)) { Exclude("unreachable"); continue; }
            var fit = AttributeScore(input.Attributes, target);
            if (fit is null) { Exclude("attributes-missing"); continue; }
            if (target.Critical.Any(k => input.Attributes.GetValueOrDefault(k) < Math.Max(0, formation.TeamReference.Value - cfg.CriticalGap)))
            { Exclude("critical-floor"); continue; }
            // The candidate's level in this position; a registered secondary position does not count at full OVR.
            var rating = input.PositionRatings is { } own && own.TryGetValue(position, out var estimated) ? Math.Min(estimated, p.Overall.Value) : p.Overall.Value;
            foreach (var (key, candidates) in groups)
            {
                var minimum = key == "starter" ? target.StarterMinimum : key == "rotation" ? target.RotationMinimum : target.DevelopmentMinimum;
                if (minimum is null || rating < minimum) continue;
                var starterOverall = Level(slot.StarterId) ?? formation.TeamReference;
                if (key == "rotation" && rating > starterOverall + cfg.RotationMaxAboveStarter) { Exclude("rotation:starter-level"); continue; }
                if (key == "development" && (p.Age is null || p.Age > ctx.Catalog.Depth.DevelopmentAge || p.Potential is null ||
                    p.Potential < formation.TeamReference || p.Potential - p.Overall < cfg.MinimumGrowth)) continue;
                var comparedId = key == "starter" ? slot.StarterId : key == "rotation" ? slot.RotationId : slot.DevelopmentId;
                var compared = ctx.Players.FirstOrDefault(x => x.Id == comparedId);
                var comparedFit = compared is null ? null : AttributeScore(compared.Attributes, target);
                var comparedLevel = compared is null ? null : DepthAnalysis.Rating(compared, position);
                if (key != "development" && comparedLevel is { } current &&
                    rating < current + cfg.MinimumUpgrade && !(comparedFit is { } cf && fit >= cf + cfg.MinimumFitUpgrade))
                { Exclude(key + ":no-improvement"); continue; }
                // Purposes need different balances: a youth investment is judged on its future whatever the club's horizon.
                var weights = key == "development" ? cfg.DevelopmentGroup : cfg.Weights[profile.Horizon];
                var project = Project(p.Overall.Value, p.Potential, p.Age, formation.TeamReference.Value, ctx.Catalog.Depth.DevelopmentAge, cfg);
                if (weights.Development > 0 && project is null) { Exclude(key + ":project-missing"); continue; }
                var quality = Math.Clamp(50 + (rating - (comparedLevel ?? (key == "development" ? formation.TeamReference.Value : minimum.Value))) * cfg.GainScale, 0, 100);
                if (league?.StarterReference is { } leagueReference)
                    quality = quality * (1 - cfg.LeagueQualityWeight) + Math.Clamp(50 + (rating - leagueReference) * cfg.GainScale, 0, 100) * cfg.LeagueQualityWeight;
                var observedRoles = target.RoleId is { } role ? p.RoleCodes.Where(code => code % 100 == role)
                    .Select(code => code >= 100 ? 2 : 1).ToArray() : [];
                int? roleLevel = target.RoleId is null ? null : observedRoles.Length > 0 ? observedRoles.Max() : input.RolesKnown ? 0 : null;
                var roleBonus = roleLevel == 2 ? cfg.RoleExpertBonus : roleLevel == 1 ? cfg.RolePlusBonus : 0;
                var plus = p.PlayStylePlusIds.Intersect(target.Styles).ToArray();
                var normal = p.PlayStyleIds.Intersect(target.Styles).Except(plus).ToArray();
                var styleBonus = Math.Min(cfg.StyleBonusCap, normal.Length * cfg.StyleBonus + plus.Length * cfg.StylePlusBonus);
                var bonus = roleBonus + styleBonus + (target.PreferredFoot is not null && p.Foot == target.PreferredFoot ? cfg.FootBonus : 0) +
                    (p.LeagueId is { } candidateLeagueId && profile.PreferredLeagueIds.Contains(candidateLeagueId) ? cfg.LeagueBonus : 0);
                var shortTerm = cfg.ShortTermAge + (position == "GK" ? ctx.Catalog.Depth.MatureGoalkeeperAge - ctx.Catalog.Depth.MatureAge : 0);
                var yearsPast = Math.Max(0, (p.Age ?? 0) - shortTerm);
                var score = Math.Round(Math.Clamp(fit.Value * weights.Attributes + quality * weights.Quality + (project ?? 0) * weights.Development + bonus -
                    yearsPast * cfg.AgePenalty[profile.Horizon], 0, 100), 1);
                var cost = Cost(p, profile, cfg, input.LastTransfer, wages, topWage);
                var reasons = new List<string>
                {
                    $"{slot.Position} kayıtlı mevkileri arasında; {target.Attributes.Count}/{target.Attributes.Count} hedef özellik biliniyor.",
                    $"Profil özellik endeksi {fit:0.0}; kalite katkısı {quality:0.0}. {slot.Position} reytingi {rating}, genel OVR {p.Overall} (model tabanı {minimum}).",
                    compared is null ? "Bu amaç için atanmış bağımsız seçenek yok; yeni alternatif sağlar." : $"{compared.Name} ile {slot.Position} reytingi farkı {rating - comparedLevel:+0;-0;0}; özellik farkı {(comparedFit is null ? "bilinmiyor" : (fit - comparedFit)?.ToString("+0.0;-0.0;0.0"))}."
                };
                if (yearsPast > 0) reasons.Add($"{p.Age} yaş: kısa vadeli çözüm; kalan verimli yıl ve yeniden satış değeri sınırlı.");
                if (cost.Status == "reference-wage") reasons.Add($"Beklenen maaş ~{Euro(cost.ExpectedWage)}/hafta, ayrılan alan {Euro(wageBudget)}. Önce satış veya biten sözleşmeyle maaş alanı gerekir.");
                else if (cost.ExpectedWage > cost.WageLow) reasons.Add($"Bugünkü maaşı {Euro(cost.WageLow)}; maaş düzeninize göre beklenen ~{Euro(cost.ExpectedWage)}/hafta.");
                if (key == "development") reasons.Add($"{p.Age} yaş, POT {p.Potential}: gelecek yatırımı. Bugünkü ilk 11 katkısı veya gelişim garantisi değildir.");
                if (league?.StarterReference is { } lr) reasons.Add($"{league.Name ?? "Seçili lig"}: ölçülen {league.MeasuredClubs} kulübün ilk 11 referansı {lr:0.0} OVR; aday farkı {p.Overall - lr:+0.0;-0.0;0.0}.");
                if (!input.RolesKnown) reasons.Add("Rol alanları eksik; rol aşinalığı yok diye yorumlanmadı.");
                if (roleLevel > 0) reasons.Add($"İstenen rolde {(roleLevel == 2 ? "++" : "+")} aşinalık işareti var; atanmış görev değildir.");
                else if (roleLevel == 0) reasons.Add("İstenen rol için +/++ işareti yok; rolde oynayamaz sonucu çıkarılmaz.");
                if (!input.StylesKnown) reasons.Add("Oyun stili alanları eksik; stil desteği doğrulanamadı.");
                if (p.IsFreeAgent) reasons.Add("Serbest oyuncu kaydı: bonservis varsayımı 0, toplam maliyet 0 değildir; yeni ücret talebi bilinmiyor.");
                if (p.Wage is null && !p.IsFreeAgent || p.IsFreeAgent && p.RecordedWage is null) reasons.Add("Maaş verisi eksik; maliyet uygunluğu kanıtlanamıyor.");
                var measured = target.Attributes.Select(a => new CandidateAttribute(a.Key, labels.GetValueOrDefault(a.Key, a.Key), input.Attributes[a.Key]!.Value, a.Value)).ToArray();
                candidates.Add(new(p.Id, p.Name, p.Club, p.ClubId, p.League, p.Positions.ToArray(), p.Age, p.Overall, p.Potential,
                    score, Math.Round(fit.Value, 1), Math.Round(quality, 1), project is { } pr ? Math.Round(pr, 1) : null, bonus,
                    measured.Length, measured.Length, roleLevel, normal.Select(id => styleLabels.GetValueOrDefault(id.ToString(), "#" + id)).ToArray(),
                    plus.Select(id => styleLabels.GetValueOrDefault(id.ToString(), "#" + id)).ToArray(), p.Value, p.IsFreeAgent ? p.RecordedWage : p.Wage,
                    p.IsFreeAgent, p.IsFreeAgent, cost, compared?.Id, compared?.Name, rating - comparedLevel,
                    comparedFit is { } prior ? Math.Round(fit.Value - prior, 1) : null,
                    measured.OrderByDescending(a => a.Value).ThenBy(a => a.Key).Take(3).ToArray(),
                    measured.OrderBy(a => a.Value).ThenBy(a => a.Key).Take(2).ToArray(), reasons,
                    input.LastTransfer, Tags(input, report.Profile, cfg, target.Position), league?.StarterReference is { } reference ? Math.Round(p.Overall.Value - reference, 1) : null, rating));
            }
        }
        int CostOrder(string status) => status switch { "reference-within" => 0, "unknown" => 1, _ => 2 };
        var result = groups.Select(g =>
        {
            // Over-budget players never pad the main list; they stay visible as a separate, clearly labelled set.
            var ranked = g.Value.OrderBy(c => CostOrder(c.Cost.Status)).ThenByDescending(c => c.Score).ThenBy(c => c.Id).ToArray();
            var above = ranked.Where(c => c.Cost.Status == "reference-above").ToArray();
            return new RecruitmentGroup(g.Key, g.Key == "starter" ? "İlk 11'e katkı" : g.Key == "rotation" ? "Hazır rotasyon" : "Genç yatırım",
                g.Key == "starter" ? target.StarterMinimum : g.Key == "rotation" ? target.RotationMinimum : target.DevelopmentMinimum,
                g.Value.Count, ranked.Where(c => c.Cost.Status != "reference-above").Take(cfg.Limit).ToArray(), above.Take(cfg.Limit).ToArray(), above.Length);
        }).ToArray();
        var sources = new[] { "attributes", "positions", "roles", "playStyles", "wages", "contracts" }
            .ToDictionary(k => k, k => ctx.Coverage.FirstOrDefault(c => c.Key == k)?.Origin);
        if (sources.Values.Any(o => o is null || o.Kind is "unknown" or "inherited" || o.GameDate is null))
            warnings.Add("Bazı alanların kaynağı/gözlem günü bilinmiyor veya tablo devralınmış. Snapshot günü bütün alanların yeniden gözlendiği anlamına gelmez.");
        return new(report.Id, report.Snapshot, report.ScopeKey, report.ViewMode, configVersion, formationName, slotName, target,
            pool.Count, counts, internalOptions, result, warnings, sources, league, wages);
    }

    static string Euro(decimal? amount) => amount is { } v ? v.ToString("N0", CultureInfo.GetCultureInfo("tr-TR")) + " €" : "bilinmiyor";

    static string[] Tags(RecruitmentPlayer input, ManagerProfile profile, RecruitmentConfig cfg, string targetPosition)
    {
        var p = input.Player; var a = input.Attributes; var tags = new List<string>();
        bool All(params string[] keys) => keys.All(k => a.GetValueOrDefault(k) >= cfg.TagThreshold);
        bool Has(params string[] positions) => positions.Contains(targetPosition) && p.Positions.Contains(targetPosition);
        if (Has("RB", "LB", "RWB", "LWB"))
        {
            if (All("acceleration", "sprintSpeed")) tags.Add("Hızlı bek");
            if (All("ballControl", "shortPassing")) tags.Add("Teknik bek");
        }
        if (Has("RW", "LW", "RM", "LM"))
        {
            if (All("acceleration", "sprintSpeed")) tags.Add("Hızlı kanat");
            if (All("ballControl", "dribbling")) tags.Add("Teknik kanat");
            if (profile.Formation == "4-3-3" && Has("RW", "LW")) tags.Add("4-3-3 kanadı");
        }
        if (Has("CAM") && All("vision", "shortPassing", "ballControl")) tags.Add("Teknik 10 numara");
        if (Has("CB"))
        {
            if (All("acceleration", "sprintSpeed")) tags.Add("Hızlı stoper");
            if (All("shortPassing", "ballControl")) tags.Add("Top kullanan stoper");
        }
        if (Has("CDM", "CM"))
        {
            if (All("stamina", "reactions")) tags.Add("Dinamik orta saha");
            if (All("shortPassing", "vision")) tags.Add("Pas bağlantısı");
        }
        if (Has("ST"))
        {
            if (p.Height >= cfg.Modifiers.GetValueOrDefault("target-striker")?.MinimumHeight && All("strength", "headingAccuracy")) tags.Add("Pivot santrfor");
            if (All("acceleration", "agility")) tags.Add("Çabuk santrfor");
            if (All("finishing", "positioning")) tags.Add("Bitirici");
        }
        return tags.Distinct().Take(3).ToArray();
    }
}
