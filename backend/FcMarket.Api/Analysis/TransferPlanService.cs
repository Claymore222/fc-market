using System.Diagnostics;
using System.Security.Cryptography;
using System.Text;
using System.Text.Json;
using Dapper;
using FcMarket.Api.Data;
using FcMarket.Api.Domain;
using FcMarket.Api.Market;

namespace FcMarket.Api.Analysis;

public sealed class TransferPlanService(AppDb appDb, SquadAnalysisService profiles, RecruitmentBoardService boards,
    RecruitmentService recruitment, ClubService clubs, ReloadingJsonFile<TransferPlanConfig> rules,
    ReloadingJsonFile<PositionRatingConfig> ratings, ReloadingJsonFile<TransferSuggestionConfig> suggestions,
    ILogger<TransferPlanService> logger)
{
    static readonly JsonSerializerOptions Json = new(JsonSerializerDefaults.Web);
    sealed record Row(string DraftJson, string ResultJson, long Version, string UpdatedAt);

    TransferPlanSource Source(AnalysisProfileView view)
    {
        var cfg = rules.Current;
        if (rules.Error is not null || ratings.Error is not null) throw new DataUnavailableException("Paket ayarları okunamadı.");
        var hash = Convert.ToHexString(SHA256.HashData(Encoding.UTF8.GetBytes(JsonSerializer.Serialize(new { cfg, ratings = ratings.Current, engine = "transfer-plan-1" }, Json))))[..12];
        var c = view.Context;
        return new(c.ScopeKey, c.ViewMode, c.Snapshot.SnapshotId, c.Snapshot.Revision, c.ConfigVersion,
            recruitment.RuleVersion, cfg.Version + "-" + hash, view.Version);
    }

    public TransferPlanView Get(string? saveUid)
    {
        var source = Source(profiles.Get(saveUid));
        using var con = appDb.Open();
        var row = con.QuerySingleOrDefault<Row>("SELECT draft_json,result_json,version,updated_at FROM transfer_plans WHERE career_key=@key AND view_mode=@mode",
            new { key = source.ScopeKey, mode = source.ViewMode });
        if (row is null) return new(source, 0, null, null, null, false);
        try
        {
            var draft = JsonSerializer.Deserialize<TransferPlanDraft>(row.DraftJson, Json) ?? throw new JsonException();
            var result = JsonSerializer.Deserialize<TransferPlanResult>(row.ResultJson, Json) ?? throw new JsonException();
            return new(source, row.Version, row.UpdatedAt, draft, result, result.Source != source);
        }
        catch (JsonException ex) { throw new DataUnavailableException("Kaydedilmiş transfer paketi okunamadı; mevcut kayıt korundu.", ex); }
    }

    static void Current(TransferPlanSource? expected, TransferPlanSource current)
    {
        if (expected != current) throw new AnalysisConflictException("Kariyer, dal, profil veya kurallar değişti. Paketi güncel verilerle yeniden hesapla.");
    }

    public TransferPlanResult Preview(string? saveUid, TransferPlanRequest request)
    {
        var timer = Stopwatch.StartNew();
        var view = boards.Get(saveUid).View; var ctx = view.Context; var source = Source(view);
        Current(request.Source, source);
        TransferPlanEngine.Validate(request.Draft, ctx, rules.Current);
        var result = Evaluate(saveUid, view, source, request.Draft);
        Current(source, Source(profiles.Get(saveUid)));
        logger.LogInformation("TransferPlan preview scope {Scope} mode {Mode} snapshot {Snapshot} revision {Revision} moves {Moves} status {Status} elapsedMs {Elapsed}",
            source.ScopeKey, source.ViewMode, source.SnapshotId, source.Revision, result.Players.Count, result.Budget.Status, timer.ElapsedMilliseconds);
        return result;
    }

    static AnalysisPlayer Arrival(RecruitmentPlayer input, AnalysisContext ctx, long? wage)
    {
        var p = input.Player;
        // A new contract's end date is not inferred from the selling club's old contract.
        return new(p.Id, p.Name, p.Age, p.Overall, p.Potential, p.Positions.ToArray(), null, wage,
            null, null, input.RolesKnown ? p.RoleCodes.ToArray() : null,
            input.StylesKnown ? p.PlayStyleIds.ToArray() : null, input.StylesKnown ? p.PlayStylePlusIds.ToArray() : null,
            input.Attributes, [], new(null, "known", new(ctx.Snapshot.SnapshotId, ctx.Snapshot.GameDate, "scenario")),
            null, null, p.Foot, input.PositionRatings);
    }

    TransferPlanResult Evaluate(string? saveUid, AnalysisProfileView view, TransferPlanSource source, TransferPlanDraft draft)
    {
        var ctx = view.Context;
        var pool = recruitment.ScenarioPool(saveUid, ctx);
        var market = pool.Players.ToDictionary(p => p.Player.Id);
        var own = ctx.Players.ToDictionary(p => p.Id);
        var academy = clubs.Get(saveUid, null).Academy.Select(p => p.Player.Id).ToHashSet();
        var arrivals = new List<AnalysisPlayer>(); var moves = new List<TransferPlanPlayer>();
        var topWage = ctx.Players.Select(p => p.WeeklyWage).OfType<long>().DefaultIfEmpty().Max();
        void Add(PlanAcquisition move, bool promotion)
        {
            if (!market.TryGetValue(move.PlayerId, out var input)) throw new BadRequestException("Seçilen oyuncu güncel kariyer verisinde yok: " + move.PlayerId);
            if (pool.OwnIds.Contains(move.PlayerId)) throw new BadRequestException("Kendi kadron veya kiralık verdiğin oyuncu dış transfer olarak eklenemez.");
            if (promotion && !academy.Contains(move.PlayerId)) throw new BadRequestException("Terfi oyuncusu güncel akademide bulunamadı.");
            if (!promotion && academy.Contains(move.PlayerId)) throw new BadRequestException("Kendi akademi oyuncunu transfer yerine terfi senaryosuna ekle.");
            var p = input.Player;
            var cost = recruitment.ScenarioCost(input, view.Profile, pool, topWage);
            var fee = promotion ? 0 : move.Fee ?? cost.ReferenceAmount;
            var wage = move.WeeklyWage ?? cost.ExpectedWage;
            moves.Add(new(p.Id, p.Name, p.Positions.ToArray(), promotion ? "promotion" : "transfer", fee,
                promotion ? "internal" : move.Fee is not null ? "user" : cost.ReferenceKind ?? "unknown", wage,
                move.WeeklyWage is not null ? "user" : wage is not null ? "estimate" : "unknown", move.SigningFee));
            arrivals.Add(Arrival(input, ctx, wage));
        }
        foreach (var move in draft.Transfers) Add(move, false);
        foreach (var move in draft.Promotions) Add(move, true);
        foreach (var sale in draft.Sales)
        {
            if (!own.TryGetValue(sale.PlayerId, out var p)) throw new BadRequestException("Satış oyuncusu güncel kadroda bulunamadı.");
            if (view.Profile.ProtectedPlayerIds.Contains(p.Id)) throw new BadRequestException(p.Name + " dokunulmaz seçilmiş; önce takım planındaki tercihi değiştir.");
            moves.Add(new(p.Id, p.Name, p.Positions, "sale", sale.Proceeds, sale.Proceeds is not null ? "user" : "unknown",
                p.WeeklyWage, "current", null));
        }
        return TransferPlanEngine.Compute(source, ctx, view.Profile, draft, arrivals, moves, rules.Current);
    }

    /// <summary>Read-only: nothing is saved and every package is evaluated exactly like a manual preview.</summary>
    public TransferPlanSuggestions Suggest(string? saveUid, TransferPlanSuggestionRequest request)
    {
        var timer = Stopwatch.StartNew();
        var board = boards.Get(saveUid); var ctx = board.View.Context; var source = Source(board.View);
        Current(request.Source, source);
        var cfg = suggestions.Current;
        if (suggestions.Error is not null) throw new DataUnavailableException("Otomatik paket ayarları okunamadı.");
        TransferPlanSuggester.Validate(cfg);
        TransferPlanEngine.Validate(new(request.Formation, [], [], []), ctx, rules.Current);
        var profile = board.View.Profile with { Formation = request.Formation, SecondaryFormation = null, DeparturePlayerIds = [] };
        decimal? Usable(long? budget) => budget * ((100 - profile.ReservePercent) / 100m);
        if (Usable(profile.TransferBudget) is not { } feeBudget || Usable(profile.WeeklyWageBudget) is not { } wageBudget)
            return new(source, request.Formation, [], 0, [new("budget", "Bonservis veya maaş bütçesi bilinmiyor. Takım planında tutarları girince paket önerilebilir.")]);
        if (profile.TargetTransfers < 1)
            return new(source, request.Formation, [], 0, [new("target", "Takım planında hedef transfer sayısı 0. Paket önermek için hedefi artır.")]);
        var before = DepthAnalysis.Compute(ctx, profile).Formations.Single();
        var searched = cfg.Goals.Values.SelectMany(g => g.Needs).ToHashSet();
        var open = before.Slots.Where(s => searched.Contains(s.Priority)).Select(s => s.Position).ToHashSet();
        var pool = recruitment.ScenarioPool(saveUid, ctx);
        var market = pool.Players.ToDictionary(p => p.Player.Id);
        var academy = clubs.Get(saveUid, null).Academy.Select(p => p.Player.Id).ToHashSet();
        var topWage = ctx.Players.Select(p => p.WeeklyWage).OfType<long>().DefaultIfEmpty().Max();
        var candidates = new List<SuggestionCandidate>(); var unknown = 0;
        foreach (var id in board.Positions.Where(p => open.Contains(p.Position))
            .SelectMany(p => p.Recommendations.Groups.SelectMany(g => g.Candidates).DistinctBy(c => c.Id).Take(cfg.CandidatesPerPosition))
            .Select(c => c.Id).Distinct())
        {
            if (!market.TryGetValue(id, out var input) || pool.OwnIds.Contains(id) || academy.Contains(id)) continue;
            var cost = recruitment.ScenarioCost(input, board.View.Profile, pool, topWage);
            if (cost.ReferenceAmount is not { } fee || cost.ExpectedWage is not { } wage) { unknown++; continue; }
            candidates.Add(new(Arrival(input, ctx, wage), fee, wage));
        }
        var found = TransferPlanSuggester.Search(ctx, profile, feeBudget, wageBudget, candidates, cfg);
        var packages = new List<TransferPlanSuggestion>();
        foreach (var (goal, picks) in found)
        {
            var ids = picks.Select(c => c.Player.Id).Order().ToArray();
            if (ids.Length == 0)
            {
                // An empty package is a finding: nothing to fix differs from nothing affordable.
                var needed = before.Slots.Any(s => cfg.Goals[goal].Needs.Contains(s.Priority));
                packages.Add(new(goal, null, null, [], Open(before), Open(before), Xi(before), Xi(before), null, needed ? "no-fit" : "no-need"));
                continue;
            }
            var sameAs = found.TakeWhile(x => x.Goal != goal).FirstOrDefault(x => x.Picks.Select(c => c.Player.Id).Order().SequenceEqual(ids))?.Goal;
            var draft = new TransferPlanDraft(request.Formation, picks.Select(c => new PlanAcquisition(c.Player.Id)).ToArray(), [], []);
            var result = Evaluate(saveUid, board.View, source, draft);
            packages.Add(new(goal, draft, result, picks.Select(c => Pick(c, result)).ToArray(), Open(result.Before), Open(result.After), Xi(result.Before), Xi(result.After), sameAs));
        }
        Current(source, Source(profiles.Get(saveUid)));
        var notes = new List<NeedReason>
        {
            new("rule", "Paketler kural tabanlı aramayla üretilir; matematiksel olarak en iyi çözüm değildir."),
            new("value", "Katkı, ihtiyaç endeksine ve bugünkü mevki reytingine göre ölçülür. Potansiyel, rol uyumu ve maç başarısı bu sıralamaya girmez."),
            new("scope", "Otomatik paketler satış veya akademi terfisi içermez; taslağa aldıktan sonra ekleyebilirsin.")
        };
        if (unknown > 0) notes.Add(new("unknown-cost", $"{unknown} aday bonservis veya maaşı bilinmediği için dışarıda kaldı; bilinmeyen maliyet ucuz sayılmadı."));
        logger.LogInformation("TransferPlan suggestions scope {Scope} mode {Mode} snapshot {Snapshot} revision {Revision} candidates {Candidates} unknown {Unknown} elapsedMs {Elapsed}",
            source.ScopeKey, source.ViewMode, source.SnapshotId, source.Revision, candidates.Count, unknown, timer.ElapsedMilliseconds);
        return new(source, request.Formation, packages, unknown, notes);
    }

    static int Open(FormationDepth depth) => depth.Slots.Count(s => s.Priority is "urgent" or "window");

    static double? Xi(FormationDepth depth)
    {
        var levels = depth.Slots.Select(s => s.StarterRating).OfType<int>().ToArray();
        return levels.Length == 0 ? null : Math.Round(levels.Average(), 1);
    }

    static PlanSuggestionPick Pick(SuggestionCandidate candidate, TransferPlanResult result)
    {
        var id = candidate.Player.Id;
        foreach (var slot in result.After.Slots)
        {
            var before = result.Before.Slots.Single(s => s.Slot == slot.Slot);
            if (slot.StarterId == id) return new(id, candidate.Player.Name, slot.Slot, "starter", before.StarterRating, slot.StarterRating);
            if (slot.RotationId == id) return new(id, candidate.Player.Name, slot.Slot, "rotation", before.RotationRating, slot.RotationRating);
            if (slot.DevelopmentId == id) return new(id, candidate.Player.Name, slot.Slot, "development", null, null);
        }
        return new(id, candidate.Player.Name, null, "squad", null, null);
    }

    public TransferPlanView Save(string? saveUid, TransferPlanRequest request)
    {
        if (request.ExpectedVersion < 0) throw new BadRequestException("Geçersiz paket sürümü.");
        var result = Preview(saveUid, request); var s = result.Source;
        Current(s, Source(profiles.Get(saveUid)));
        using var con = appDb.Open(); using var tx = con.BeginTransaction();
        var profileVersion = con.QuerySingleOrDefault<long?>("SELECT version FROM manager_profiles WHERE career_key=@key AND view_mode=@mode",
            new { key = s.ScopeKey, mode = s.ViewMode }, tx) ?? 0;
        if (profileVersion != s.ProfileVersion) throw new AnalysisConflictException("Kaydederken takım planı değişti; paketi yeniden hesapla.");
        var args = new { key = s.ScopeKey, mode = s.ViewMode, draft = JsonSerializer.Serialize(request.Draft, Json),
            result = JsonSerializer.Serialize(result, Json), at = result.CreatedAt, expected = request.ExpectedVersion };
        var changed = request.ExpectedVersion == 0
            ? con.Execute("INSERT OR IGNORE INTO transfer_plans VALUES (@key,@mode,@draft,@result,1,@at)", args, tx)
            : con.Execute("UPDATE transfer_plans SET draft_json=@draft,result_json=@result,version=version+1,updated_at=@at WHERE career_key=@key AND view_mode=@mode AND version=@expected", args, tx);
        if (changed != 1) throw new AnalysisConflictException("Paket başka bir pencerede değiştirildi. Yazdıkların korunuyor; kaydedilmiş paketi yükleyip karşılaştır.");
        tx.Commit();
        logger.LogInformation("TransferPlan saved scope {Scope} mode {Mode} version {Version}", s.ScopeKey, s.ViewMode, request.ExpectedVersion + 1);
        return new(s, request.ExpectedVersion + 1, result.CreatedAt, request.Draft, result, false);
    }
}
