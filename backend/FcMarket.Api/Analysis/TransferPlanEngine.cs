using FcMarket.Api.Data;
using FcMarket.Api.Domain;
using FcMarket.Api.Market;

namespace FcMarket.Api.Analysis;

/// <summary>Joint cash/wage screening and a fresh capacity-one roster allocation. No game writes.</summary>
public static class TransferPlanEngine
{
    public static void Validate(TransferPlanDraft draft, AnalysisContext ctx, TransferPlanConfig cfg)
    {
        if (cfg.MaxMoves is < 1 or > 100 || cfg.MaxAmount is < 1 or > 10_000_000_000_000 || string.IsNullOrWhiteSpace(cfg.Version) ||
            new[] { cfg.FeeRange, cfg.WageRange }.Any(r => r is not { Length: 2 } || r[0] is <= 0 or > 1 || r[1] is < 1 or > 10))
            throw new DataUnavailableException("Transfer paketi ayarları geçersiz.");
        if (draft is null || !ctx.Catalog.Formations.ContainsKey(draft.Formation ?? "") ||
            draft.Transfers is null || draft.Sales is null || draft.Promotions is null)
            throw new BadRequestException("Paket dizilişi ve oyuncu listeleri gerekli.");
        var ids = draft.Transfers.Select(x => x?.PlayerId ?? -1).Concat(draft.Sales.Select(x => x?.PlayerId ?? -1))
            .Concat(draft.Promotions.Select(x => x?.PlayerId ?? -1)).ToArray();
        if (ids.Length > cfg.MaxMoves || ids.Any(id => id <= 0) || ids.Distinct().Count() != ids.Length)
            throw new BadRequestException($"Paket en fazla {cfg.MaxMoves} farklı oyuncu içerebilir; oyuncu iki işlemde kullanılamaz.");
        var amounts = draft.Transfers.Concat(draft.Promotions).SelectMany(x => new[] { x.Fee, x.WeeklyWage, x.SigningFee })
            .Concat(draft.Sales.Select(x => x.Proceeds));
        if (amounts.Any(n => n is < 0 || n > cfg.MaxAmount)) throw new BadRequestException("Senaryo tutarı geçerli aralığın dışında.");
        if (draft.Promotions.Any(x => x.Fee is not null and not 0)) throw new BadRequestException("Akademi terfisine bonservis girilemez.");
    }

    /// <summary>Squad after a scenario: sales leave, arrivals join and also leave their league rivals.</summary>
    public static AnalysisContext Project(AnalysisContext ctx, IReadOnlySet<int> removed, IReadOnlyCollection<AnalysisPlayer> arrivals)
    {
        var incoming = arrivals.Select(p => p.Id).ToHashSet();
        var updated = ctx.Players.Where(p => !removed.Contains(p.Id)).Concat(arrivals).ToArray();
        if (updated.Select(p => p.Id).Distinct().Count() != updated.Length) throw new BadRequestException("Oyuncu kadroya iki kez eklenemez.");
        return ctx with { Players = updated, LeagueClubs = ctx.LeagueClubs?.Select(c => c with {
            Players = c.Players.Where(p => !incoming.Contains(p.Id)).ToArray() }).ToArray() };
    }

    public static TransferPlanResult Compute(TransferPlanSource source, AnalysisContext ctx, ManagerProfile profile,
        TransferPlanDraft draft, IReadOnlyList<AnalysisPlayer> arrivals, IReadOnlyList<TransferPlanPlayer> players, TransferPlanConfig? rules = null)
    {
        var scenarioProfile = profile with { Formation = draft.Formation, SecondaryFormation = null, DeparturePlayerIds = [] };
        var removed = draft.Sales.Select(s => s.PlayerId).ToHashSet();
        var baseline = DepthAnalysis.Compute(ctx, scenarioProfile).Formations.Single();
        var after = DepthAnalysis.Compute(Project(ctx, removed, arrivals), scenarioProfile);
        var buys = players.Where(p => p.Action != "sale").ToArray();
        var sales = players.Where(p => p.Action == "sale").ToArray();
        long Sum(IEnumerable<long?> values) => values.OfType<long>().Sum();
        var fees = Sum(buys.Select(p => p.Fee)); var feeMissing = buys.Count(p => p.Fee is null);
        var wages = Sum(buys.Select(p => p.WeeklyWage)); var wageMissing = buys.Count(p => p.WeeklyWage is null);
        var signing = Sum(buys.Select(p => p.SigningFee)); var signingMissing = buys.Count(p => p.SigningFee is null);
        var proceeds = Sum(sales.Select(p => p.Fee)); var proceedsMissing = sales.Count(p => p.Fee is null);
        var release = Sum(sales.Select(p => p.WeeklyWage)); var releaseMissing = sales.Count(p => p.WeeklyWage is null);
        decimal? feeBudget = profile.TransferBudget * ((100 - profile.ReservePercent) / 100m);
        decimal? wageBudget = profile.WeeklyWageBudget * ((100 - profile.ReservePercent) / 100m);
        decimal? remaining = feeMissing == 0 ? feeBudget - fees - signing : null;
        decimal? wageRemaining = wageMissing == 0 ? wageBudget - wages : null;
        decimal? conditionalRemaining = proceedsMissing == 0 ? remaining + proceeds : null;
        decimal? conditionalWage = releaseMissing == 0 ? wageRemaining + release : null;
        // Even with missing costs, a known lower bound can already exceed the budget. Unknown sale credit is never 0.
        var above = proceedsMissing == 0 && feeBudget + proceeds < fees + signing || releaseMissing == 0 && wageBudget + release < wages;
        var missing = conditionalRemaining is null || conditionalWage is null;
        var conditional = sales.Length > 0 || signingMissing > 0 || buys.Any(p => p.FeeSource != "user" && p.Action != "promotion" || p.WageSource != "user");
        var status = above ? "above" : missing ? "unknown" : conditional ? "conditional" : "within";
        var cfg = rules ?? new();
        long Spread(long amount, bool estimated, double factor) => estimated ? (long)Math.Round(amount * factor, MidpointRounding.AwayFromZero) : amount;
        long Total(Func<TransferPlanPlayer, long> pick) => buys.Sum(pick);
        // A user amount is the scenario and a free agent has no fee; only labelled estimates spread.
        var range = feeMissing + wageMissing > 0 || buys.Length == 0 ? null : new PlanCostRange(
            Total(p => Spread(p.Fee!.Value, p.FeeSource is "value-model" or "last-transfer", cfg.FeeRange[0])),
            Total(p => Spread(p.Fee!.Value, p.FeeSource is "value-model" or "last-transfer", cfg.FeeRange[1])),
            Total(p => Spread(p.WeeklyWage!.Value, p.WageSource == "estimate", cfg.WageRange[0])),
            Total(p => Spread(p.WeeklyWage!.Value, p.WageSource == "estimate", cfg.WageRange[1])), null);
        if (range is not null && feeBudget is { } fullFee && wageBudget is { } fullWage)
            range = range with { HighFitsBudget = range.FeeHigh + signing <= fullFee + proceeds && range.WageHigh <= fullWage + release };
        var warnings = new List<NeedReason>
        {
            new("scenario", "Bu paket bir senaryodur; oyunda transfer, satış, terfi veya taktik değişikliği yapmaz."),
            new("asking-price", "Referans bedel ve tahmini maaş, kulübün veya oyuncunun talebi değildir. Kullanıcı tutarları da yalnız senaryo girdisidir."),
            new("depth", "Kadroya giriş/çıkış sonrası ilk 11 ve bağımsız rotasyon yeniden atanır; tek oyuncu iki ayrı yedek sayılmaz.")
        };
        if (range is not null) warnings.Add(new("range", "Olası aralık, referans bedelin ve tahmini maaşın varsayılan çarpanlarıdır; oyunun isteyeceği tutar değildir."));
        if (signingMissing > 0) warnings.Add(new("extras", $"{signingMissing} oyuncunun imza/temsilci gibi ek ücretleri bilinmiyor; kalan bütçe bu bilinmeyen ücretler hariçtir."));
        if (feeMissing + wageMissing > 0) warnings.Add(new("missing-cost", "Eksik maliyetler sıfır sayılmadı; gösterilen bilinen toplam tam paket maliyeti değildir."));
        if (sales.Length > 0) warnings.Add(new("sale", "Satışlar gerçekleşmiş gelir değildir. Senaryoda verilen satış tutarının ve oyuncunun mevcut haftalık maaşının tamamının bütçeye açıldığı varsayılır; satış geliri kesintileri bilinmiyor."));
        if (draft.Promotions.Length > 0) warnings.Add(new("promotion", "Akademi oyuncusu yalnız terfi senaryosunda derinliğe katıldı; potansiyeli bugünkü reytingi veya gelişim garantisi değildir."));
        var placed = after.Formations.Single().Slots.SelectMany(s => new[] { s.StarterId, s.RotationId, s.DevelopmentId }).OfType<int>().ToHashSet();
        foreach (var arrival in arrivals.Where(p => !placed.Contains(p.Id)))
            warnings.Add(new("unassigned", arrival.Name + ": modelin bağımsız ilk 11, rotasyon veya gelişim seçeneklerine yerleşmedi; aynı ihtiyacın ikinci kez giderildiği varsayılmadı."));
        if (after.Formations.Single().FilledStarters < baseline.FilledStarters || after.Formations.Single().FilledRotation < baseline.FilledRotation)
            warnings.Add(new("depth-loss", "Bu senaryoda bağımsız ilk 11 veya rotasyon kapsamı azalıyor. Satışları ve mevki dağılımını yeniden incele."));
        warnings.AddRange(after.Warnings.Select(w => new NeedReason("coverage", w)));
        return new(source, ctx.Snapshot, DateTimeOffset.UtcNow.ToString("O"), players,
            new(feeBudget, wageBudget, fees, feeMissing, wages, wageMissing, signing, signingMissing,
                proceeds, proceedsMissing, release, releaseMissing, remaining, wageRemaining, conditionalRemaining, conditionalWage, status, range),
            baseline, after.Formations.Single(), warnings);
    }
}
