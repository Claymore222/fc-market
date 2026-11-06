using System.Globalization;
using System.Text.Json;
using FcMarket.Api.Data;
using FcMarket.Api.Market;

namespace FcMarket.Api.Analysis;

/// <summary>Deterministic, joint XI/rotation allocation. Every player has capacity one in each scenario.</summary>
public static class DepthAnalysis
{
    static int? Number(object? value) => value is JsonElement e
        ? e.ValueKind == JsonValueKind.Number && e.TryGetInt32(out var n) ? n : null
        : int.TryParse(Convert.ToString(value, CultureInfo.InvariantCulture), out var parsed) ? parsed : null;

    static DateOnly? ReturnDate(AnalysisPlayer p, AnalysisContext ctx)
    {
        if (!p.Availability.TryGetValue("returnDate", out var v) || v.State != "known" ||
            v.Origin?.GameDate != ctx.Snapshot.GameDate || v.Origin.Kind is not ("save" or "export" or "daily")) return null;
        return DateOnly.TryParseExact(Number(v.Value)?.ToString(CultureInfo.InvariantCulture), "yyyyMMdd", CultureInfo.InvariantCulture,
            DateTimeStyles.None, out var day) && day > ctx.Snapshot.GameDate ? day : null;
    }

    static (int? From, DateOnly? End)? Loan(AnalysisPlayer p)
    {
        if (p.Loan.Value is null) return null;
        var e = JsonSerializer.SerializeToElement(p.Loan.Value);
        return e.ValueKind == JsonValueKind.Object ?
            (e.TryGetProperty("fromTeamId", out var from) ? Number(from) : null,
             e.TryGetProperty("endDate", out var end) && DateOnly.TryParse(end.GetString(), out var date) ? date : null) : null;
    }

    /// <summary>Estimated rating in a registered position. Never above OVR: the estimate cannot flatter a player.</summary>
    public static int? Rating(AnalysisPlayer p, string position) =>
        p.Overall is { } overall && p.PositionRatings is { } ratings && ratings.TryGetValue(position, out var rating) ? Math.Min(overall, rating) : p.Overall;

    public static void ValidateRules(DepthRules? r)
    {
        if (r is null || string.IsNullOrWhiteSpace(r.Version) || r.MinBaselinePlayers is < 1 or > 11 ||
            r.DevelopmentAge is < 14 or > 30 || r.MatureAge is < 25 or > 45 || r.MatureGoalkeeperAge is < 25 or > 50 ||
            r.LongAbsenceDays is < 1 or > 365 || r.StarterGap is null || r.RotationGap is null ||
            new[] { "win-now", "balanced", "develop" }.Any(h => !r.StarterGap.TryGetValue(h, out var a) || a is < 0 or > 30 ||
                !r.RotationGap.TryGetValue(h, out var b) || b < a || b > 40 ||
                r.Need is null || !r.Need.StarterDeficit.TryGetValue(h, out var c) || c < 0 || !r.Need.RotationDeficit.TryGetValue(h, out var d) || d < 0) ||
            r.Need.BottomShare is < 0 or > 1 || r.Need.MinLeagueClubs < 2 || r.Need.MinClubPlayers < 11 || r.Need.MinimumXiGain < 1)
            throw new DataUnavailableException("Kadro derinliği kuralları geçersiz.");
    }

    // The loan table is explicitly unverified in the adapter. Never silently remove a player on that basis.
    static bool ConfirmedLoanOut(AnalysisContext ctx, AnalysisPlayer p) => p.Loan.State == "known" && Loan(p) is { } loan &&
        loan.From == ctx.Snapshot.UserTeamId && loan.End >= ctx.Snapshot.GameDate;

    /// <summary>XI and rotation levels only, without league or contract work, so a package search can try many candidates.</summary>
    public static (int? Starter, int? Rotation)[] SlotLevels(AnalysisContext ctx, string formation, IEnumerable<AnalysisPlayer> extra)
    {
        var cfg = ctx.Catalog; var slots = cfg.Formations[formation];
        var pool = ctx.Players.Concat(extra).DistinctBy(p => p.Id).OrderBy(p => p.Id).Where(p => !ConfirmedLoanOut(ctx, p)).ToArray();
        var assigned = Assign(slots, pool, cfg);
        int? Level(AnalysisPlayer? p, string position) => p is null ? null : Rating(p, position);
        return slots.Select((slot, i) => (Level(assigned[i], cfg.Position(slot)), Level(assigned[i + slots.Length], cfg.Position(slot)))).ToArray();
    }

    public static (IReadOnlyList<FormationDepth> Formations, IReadOnlyList<string> Warnings) Compute(AnalysisContext ctx, ManagerProfile profile)
    {
        var cfg = ctx.Catalog; var r = cfg.Depth;
        ValidateRules(r);
        var players = ctx.Players.DistinctBy(p => p.Id).OrderBy(p => p.Id).ToArray();
        var pool = players.Where(p => !ConfirmedLoanOut(ctx, p)).ToArray();
        var unknownPositions = pool.Count(p => p.Positions.Length == 0);
        var warnings = new List<string>
        {
            "Model değerlendirmesi: kayıtlı mevkiler ve özelliklerden tahmini mevki reytingi kullanılır (OVR'ı aşmaz); oyunun resmî mevki reytingi veya maç başarısı tahmini değildir.",
            "İki tam 11 üzerinden bağımsız rotasyon stres testi yapılır; bu, 22 oyuncu transfer etme veya maç kadrosu zorunluluğu değildir.",
            "Alternatif diziliş ayrı bir senaryodur; iki dizilişin açıkları toplanmaz.",
            "Gelecek sezon hesabı sözleşme bitiş yılını mevcut sezonun bitiş yılıyla kıyaslar; kesin ayrılış günü bilinmez. Yenileme yapılmadığı varsayılır.",
            "Bu ihtiyaç endeksi kayıtlı mevkiler, mevki reytingi ve lig kıyası içindir. Rol/oyun tarzı uyumu, mevki için açılan oyuncu önerilerinde ayrıca hesaplanır.",
            "Ceza bilgisi, kadro dışındaki akademi oyuncuları ve kiralıktan dönüşler bu kapsamda yok; eksik oyuncular hazır alternatife eklenmez."
        };
        if (players.Length == 0) warnings.Add("Kadro verisi bulunamadı; boş yerler gerçek transfer ihtiyacı olarak yorumlanamaz.");
        if (unknownPositions > 0) warnings.Add($"{unknownPositions} oyuncunun mevkisi bilinmiyor. Görünen boşluklar koşulludur; gerçek yokluk sonucu çıkarılamaz.");
        var missingOvr = pool.Count(p => p.Overall is null);
        if (missingOvr > 0) warnings.Add($"{missingOvr} oyuncunun OVR bilgisi yok; bu oyuncular 0 reyting sayılmadı, kalite sonuçları koşulludur.");
        if (players.Any(p => p.Loan.State != "known")) warnings.Add("Kiralık kayıtlarının güncelliği doğrulanmadı. Olası kiralık giriş/çıkışlar koşullu nottur; kadrodan otomatik düşürülmedi.");
        var unknownAvailability = pool.Count(p => !p.Availability.TryGetValue("returnDate", out var v) || v.State != "known" ||
            v.Origin?.GameDate != ctx.Snapshot.GameDate || v.Origin.Kind is not ("save" or "export" or "daily"));
        if (unknownAvailability > 0) warnings.Add($"{unknownAvailability} oyuncunun güncel dönüş bilgisi yok. Bugünkü havuz, yalnız doğrulanmış tarihli sakatlıkları dışlar; kalan oyuncuların sağlıklı olduğu iddia edilmez.");
        if (pool.Any(p => p.ContractEnd is null)) warnings.Add("Eksik sözleşme bitişleri gelecek sezon havuzunda korunur; gelecek derinliği üst sınırdır.");
        if (profile.DeparturePlayerIds.Length > 0) warnings.Add("Ayrılabilir tercihi gerçekleşmiş satış değildir. Bu oyuncular kadrodan düşürülmedi; satış senaryosu sonraki aşamadadır.");
        var result = new List<FormationDepth>();
        foreach (var formation in new[] { profile.Formation, profile.SecondaryFormation }.OfType<string>().Distinct())
        {
            var slots = cfg.Formations[formation];
            var structural = Assign(slots, pool, cfg);
            var ready = Assign(slots, pool.Where(p => ReturnDate(p, ctx) is null).ToArray(), cfg);
            var future = Assign(slots, pool.Where(p => p.ContractEnd is null || p.ContractEnd > ctx.Snapshot.SeasonEndYear)
                .Where(p => !(p.Loan.State == "known" && Loan(p) is { } loan && loan.From != ctx.Snapshot.UserTeamId &&
                    loan.End < new DateOnly(ctx.Snapshot.SeasonEndYear, 7, 1))).ToArray(), cfg);
            // The level of the XI that actually fits this formation, not the 11 best OVRs of any position.
            var xi = slots.Select((slot, i) => structural[i] is { } p ? Rating(p, cfg.Position(slot)) : null).OfType<int>().ToArray();
            // With too few placed players (unknown positions) the best known OVRs are the only honest level left.
            var level0 = xi.Length >= r.MinBaselinePlayers ? xi : pool.Select(p => p.Overall).OfType<int>().OrderDescending().Take(11).ToArray();
            int? reference = level0.Length < r.MinBaselinePlayers ? null : (int)Math.Round(level0.Average(), MidpointRounding.AwayFromZero);
            int? firstFloor = reference is { } level ? Math.Max(0, level - r.StarterGap[profile.Horizon]) : null;
            int? secondFloor = reference is { } level2 ? Math.Max(0, level2 - r.RotationGap[profile.Horizon]) : null;
            var (lines, league) = League(ctx, slots, structural);
            var allocated = structural.OfType<AnalysisPlayer>().Select(p => p.Id).ToHashSet();
            // Development options are additional players; never count an XI/rotation player a third time.
            var development = Assign(slots, pool.Where(p => !allocated.Contains(p.Id) && p.Age <= r.DevelopmentAge &&
                reference is not null && p.Potential >= reference).ToArray(), cfg, development: true);
            var reports = slots.Select((slot, i) =>
            {
                var first = structural[i]; var second = structural[i + slots.Length];
                var position = cfg.Position(slot); int? firstRating = first is null ? null : Rating(first, position), secondRating = second is null ? null : Rating(second, position);
                var reasons = new List<NeedReason>(); var priority = "sufficient"; int? score = 0;
                var conditional = unknownPositions > 0 || missingOvr > 0;
                void Add(string code, string text) => reasons.Add(new(code, text));
                if (first is null) { priority = "urgent"; score = 100; Add("starter-gap", "Bu yer için bağımsız ilk seçenek atanamadı."); }
                else if (second is null) { priority = "window"; score = 70; Add("rotation-gap", "İlk seçenek var; başka yere sayılmayan bağımsız rotasyon oyuncusu yok."); }
                if (firstRating is { } ovr && firstFloor is { } floor && ovr < floor)
                { if (priority != "urgent") priority = "window"; score = Math.Max(score ?? 0, Math.Min(95, 75 + floor - ovr)); Add("starter-quality", $"İlk seçeneğin mevki reytingi {ovr}; takımın {reference} referansına göre model tabanı {floor}."); }
                if (secondRating is { } backup && secondFloor is { } reserveFloor && backup < reserveFloor)
                { if (priority == "sufficient") priority = "window"; score = Math.Max(score ?? 0, Math.Min(69, 50 + reserveFloor - backup)); Add("rotation-quality", $"Rotasyon mevki reytingi {backup}; model tabanı {reserveFloor}."); }
                if (reference is null || first is not null && firstRating is null || second is not null && secondRating is null)
                { conditional = true; Add("quality-unknown", "Kalite kıyasını tamamlamak için OVR bilgisi yetersiz."); if (priority == "sufficient") { priority = "unknown"; score = null; } }
                if (conditional) Add("conditional", "Eksik mevki/kalite bilgisi nedeniyle bu sonuç koşulludur.");
                double leaguePressure = 0;
                if (lines.GetValueOrDefault(position) is { } line)
                {
                    var need = r.Need;
                    double starterDeficit = Deficit(line.Starter, line.StarterMedian), rotationDeficit = Deficit(line.Rotation, line.RotationMedian);
                    leaguePressure = Math.Min(need.LeagueCap, starterDeficit * need.StarterPoint + rotationDeficit * need.RotationPoint);
                    bool Bottom(int? rank) => rank > line.Clubs * (1 - need.BottomShare);
                    var weakStarter = Bottom(line.StarterRank) && starterDeficit >= need.StarterDeficit[profile.Horizon];
                    var weakRotation = Bottom(line.RotationRank) && rotationDeficit >= need.RotationDeficit[profile.Horizon];
                    if (weakStarter) Add("league-starter", $"İlk seçenekler ligde zayıf kalıyor: {line.Starter:0.0}, lig medyanı {line.StarterMedian:0.0}, {line.StarterRank}. sıra / {line.Clubs} kulüp.");
                    if (weakRotation) Add("league-rotation", $"Yedekler ligde zayıf kalıyor: {line.Rotation:0.0}, lig medyanı {line.RotationMedian:0.0}, {line.RotationRank}. sıra / {line.Clubs} kulüp.");
                    if (weakStarter || weakRotation)
                    {
                        if (priority is "sufficient" or "unknown") priority = "window";
                        score = Math.Max(score ?? 0, 50 + (int)Math.Round(leaguePressure));
                    }
                    else Add("league-line", $"Lig kıyası: ilk seçenekler {line.StarterRank}. sıra / {line.Clubs}, yedekler {line.RotationRank}. sıra / {line.Clubs}.");
                }
                var expiring = new[] { first, second }.OfType<AnalysisPlayer>().Where(p => p.ContractEnd <= ctx.Snapshot.SeasonEndYear).ToArray();
                var contractPressure = (first?.ContractEnd <= ctx.Snapshot.SeasonEndYear ? r.Need.StarterContract : 0) + (second?.ContractEnd <= ctx.Snapshot.SeasonEndYear ? r.Need.RotationContract : 0);
                if (expiring.Length > 0)
                {
                    Add("contract", string.Join(", ", expiring.Select(p => p.Name)) + ": sözleşme bitiş yılı sezon sonuna ulaşıyor. Önce yenileme seçeneğini değerlendir; ayrılış kesin değil.");
                    if (priority is "sufficient" or "unknown") priority = "next-season";
                }
                if (first is not null && second is not null && future[i + slots.Length] is null)
                {
                    Add("future-gap", "Sözleşmesi yenilenecekler hariç tutulduğunda gelecek sezonda bağımsız rotasyon açığı var.");
                    contractPressure += r.Need.FutureGap;
                    if (priority is "sufficient" or "unknown") priority = "next-season";
                }
                var ageLimit = position == "GK" ? r.MatureGoalkeeperAge : r.MatureAge;
                if (first?.Age >= ageLimit) contractPressure += r.Need.MatureStarter;
                if (first?.Age >= ageLimit && second?.Age >= ageLimit)
                    Add("age-planning", $"İki seçeneğin yaşı da {ageLimit} veya üstü. Ardıl planı değerlendir; yaş tek başına satış veya düşüş kanıtı değildir.");
                var temporary = (first is not null && ready[i] is null) || (second is not null && ready[i + slots.Length] is null);
                if (temporary) Add("temporary-gap", "Tarihli sakatlıklar dışlandığında bugün ek açık oluşuyor. Bu, tek başına kalıcı transfer ihtiyacı değildir.");
                foreach (var p in new[] { first, second }.OfType<AnalysisPlayer>())
                {
                    if (ReturnDate(p, ctx) is { } day)
                        Add(day.DayNumber - ctx.Snapshot.GameDate.DayNumber >= r.LongAbsenceDays ? "long-absence" : "short-absence",
                            $"{p.Name}: beklenen dönüş {day:dd.MM.yyyy}. Tarih gözlemidir; maç oynamaya hazır olma garantisi değildir.");
                    else if (p.Availability.TryGetValue("injuryFlag", out var flag) && Number(flag.Value) > 0)
                        Add("injury-unverified", $"{p.Name}: sakatlık işareti var; güncel dönüş tarihi doğrulanmadan havuzdan çıkarılmadı.");
                    if (p.Fitness is { } fit) Add("fitness", $"{p.Name}: gözlenen kondisyon {fit}/100; tek ölçümden kalıcı transfer kararı üretilmez.");
                    if (Loan(p) is { } loan) Add("loan", $"{p.Name}: kiralık kaydı ({loan.End:dd.MM.yyyy}); güncelliği ve yönü kontrol edilmeli.");
                    if (profile.DeparturePlayerIds.Contains(p.Id)) Add("departure-preference", $"{p.Name} ayrılabilir olarak işaretli; satış gerçekleşmeden kapsamdan düşürülmez.");
                }
                if (development[i] is { } young) Add("development", $"{young.Name}: ek gelişim alternatifi, {young.Age} yaş, POT {young.Potential}. Potansiyel gelişim garantisi değildir.");
                if (players.Length == 0) { priority = "unknown"; score = null; Add("roster-unknown", "Kadro kaynağı eksik; bu yer için ihtiyaç kararı verilemez."); }
                if (priority == "sufficient") Add("covered", "Kayıtlı mevkilere göre ilk seçenek ve bağımsız rotasyon var; mevcut model yapısal takviye gerektirmiyor.");
                // Bands stay apart; inside a band, contract risk and the league gap separate otherwise equal needs.
                score = priority switch
                {
                    "next-season" => Math.Min(49, 20 + contractPressure + (int)Math.Round(leaguePressure)),
                    "window" => Math.Min(95, (score ?? 0) + contractPressure),
                    "sufficient" => Math.Min(19, (int)Math.Round(leaguePressure)),
                    _ => score
                };
                return new DepthSlot(slot, cfg.Position(slot), first?.Id, second?.Id, ready[i]?.Id, ready[i + slots.Length]?.Id,
                    future[i]?.Id, future[i + slots.Length]?.Id, development[i]?.Id,
                    profile.RolePreferences.GetValueOrDefault(formation)?.GetValueOrDefault(slot) is > 0 and var role ? role : null,
                    priority, score, conditional, temporary, reasons, firstRating, secondRating);
            }).ToArray();
            result.Add(new(formation, reference, firstFloor, secondFloor, structural.Take(11).Count(p => p is not null),
                structural.Skip(11).Count(p => p is not null), ready.Take(11).Count(p => p is not null), ready.Skip(11).Count(p => p is not null),
                future.Take(11).Count(p => p is not null), future.Skip(11).Count(p => p is not null), reports,
                lines.Values.ToArray(), league, Contracts(ctx, pool, slots, structural), Lineup(pool, cfg, c => ReturnDate(c, ctx) is null)));
        }
        if (result.All(f => f.TeamReference is null)) warnings.Add("Takım seviyesi için yeterli OVR yok. Kalite açığı ve gelişim hedefi hesaplanmadı.");
        return (result, warnings);
    }

    static double Deficit(double? own, double? median) => own is { } o && median is { } m ? Math.Max(0, m - o) : 0;

    static (Dictionary<string, LineBenchmark> Lines, LeagueStrength? Strength) League(AnalysisContext ctx, string[] slots, AnalysisPlayer?[] own)
    {
        var cfg = ctx.Catalog; var need = cfg.Depth.Need;
        var clubs = ctx.LeagueClubs?.Where(c => c.TeamId != ctx.Snapshot.UserTeamId && c.Players.Count >= need.MinClubPlayers).ToArray() ?? [];
        if (clubs.Length < need.MinLeagueClubs) return ([], null);
        var others = clubs.Select(c => Assign(slots, c.Players.OrderBy(p => p.Id).ToArray(), cfg)).ToArray();
        double? Line(AnalysisPlayer?[] assigned, int start, string? position)
        {
            var ratings = slots.Select((slot, i) => (Position: cfg.Position(slot), Player: assigned[start + i]))
                .Where(x => position is null || x.Position == position).Select(x => x.Player is { } p ? Rating(p, x.Position) : null).OfType<int>().ToArray();
            return ratings.Length == 0 ? null : ratings.Average();
        }
        (double? Own, double? Median, int? Rank) Compare(int start, string? position)
        {
            var value = Line(own, start, position);
            var rivals = others.Select(a => Line(a, start, position)).OfType<double>().Order().ToArray();
            if (rivals.Length == 0) return (value, null, null);
            var middle = rivals.Length / 2;
            var median = rivals.Length % 2 == 0 ? (rivals[middle - 1] + rivals[middle]) / 2 : rivals[middle];
            return (Round(value), Round(median), value is { } v ? 1 + rivals.Count(o => o > v) : rivals.Length + 1);
        }
        var lines = slots.Select(cfg.Position).Distinct().ToDictionary(position => position, position =>
        {
            var first = Compare(0, position); var second = Compare(slots.Length, position);
            return new LineBenchmark(position, first.Own, first.Median, first.Rank, second.Own, second.Median, second.Rank, clubs.Length + 1);
        });
        var xi = Compare(0, null);
        return (lines, new(xi.Own, xi.Median, xi.Rank, clubs.Length + 1));
    }

    static double? Round(double? value) => value is { } v ? Math.Round(v, 1) : null;

    static ContractPlan? Contracts(AnalysisContext ctx, AnalysisPlayer[] pool, string[] slots, AnalysisPlayer?[] assigned)
    {
        var r = ctx.Catalog.Depth; var end = ctx.Snapshot.SeasonEndYear;
        var expiring = pool.Where(p => p.ContractEnd <= end).ToArray();
        if (expiring.Length == 0) return null;
        string? SlotOf(AnalysisPlayer p, int start, int count) => Enumerable.Range(0, count).Where(i => assigned[start + i]?.Id == p.Id).Select(i => slots[i]).FirstOrDefault();
        // The manager's own XI defines who starts when it is known; the model's allocation only fills the gap.
        var savedXi = pool.Count(p => p.Slot is not null) == 11;
        var items = expiring.Select(p =>
        {
            var model = SlotOf(p, 0, slots.Length) ?? SlotOf(p, slots.Length, slots.Length);
            var starter = savedXi ? p.Slot : SlotOf(p, 0, slots.Length); var rotation = starter is null ? model : null; var slot = starter ?? rotation;
            var mature = p.Age >= (p.Positions.FirstOrDefault() == "GK" ? r.MatureGoalkeeperAge : r.MatureAge);
            var role = starter is not null ? "starter" : rotation is not null ? "rotation" : "squad";
            var action = role == "squad" ? "Süresi dolabilir veya düşük maliyetle yenilenir"
                : mature ? "Kısa yenileme veya ardıl planı" : role == "starter" ? "Önce yenile" : "Yenile veya yedek ara";
            return new ContractPlanItem(p.Id, p.Name, p.Age, slot is null ? p.Overall : Rating(p, ctx.Catalog.Position(slot)), slot, role, p.WeeklyWage, action);
        }).OrderBy(x => x.Role == "starter" ? 0 : x.Role == "rotation" ? 1 : 2).ThenByDescending(x => x.Rating ?? -1).ThenBy(x => x.PlayerId).ToArray();
        long? Sum(IEnumerable<AnalysisPlayer> players) => players.All(p => p.WeeklyWage is null) ? null : players.Sum(p => p.WeeklyWage ?? 0);
        return new(end, items.Length, pool.Length, items.Count(x => x.Role == "starter"), Sum(expiring), Sum(pool), items);
    }

    /// <summary>Bench-for-starter swaps in the saved XI: the improvement available before spending anything.</summary>
    static XiReview? Lineup(AnalysisPlayer[] pool, AnalysisConfig cfg, Func<AnalysisPlayer, bool> available)
    {
        var starters = pool.Where(p => p.Slot is not null).ToArray();
        if (starters.Length != 11) return null;
        var bench = pool.Where(p => p.Slot is null && available(p)).ToArray();
        int? Level(AnalysisPlayer p) => Rating(p, cfg.Position(p.Slot!));
        var swaps = starters.SelectMany(s => bench.Where(b => b.Positions.Contains(cfg.Position(s.Slot!)))
                .Select(b => (Starter: s, Bench: b, Gain: Rating(b, cfg.Position(s.Slot!)) - Level(s))))
            .Where(x => x.Gain >= cfg.Depth.Need.MinimumXiGain)
            .OrderByDescending(x => x.Gain).ThenBy(x => x.Starter.Id).ThenBy(x => x.Bench.Id);
        var options = new List<XiOption>(); var usedStarters = new HashSet<int>(); var usedBench = new HashSet<int>();
        foreach (var x in swaps)
        {
            if (usedStarters.Contains(x.Starter.Id) || !usedBench.Add(x.Bench.Id)) continue;
            usedStarters.Add(x.Starter.Id);
            var position = cfg.Position(x.Starter.Slot!);
            options.Add(new(x.Starter.Slot!, position, x.Starter.Id, x.Starter.Name, Level(x.Starter), x.Bench.Id, x.Bench.Name, Rating(x.Bench, position), x.Gain!.Value,
                x.Starter.Age <= cfg.Depth.DevelopmentAge && x.Starter.Potential - x.Starter.Overall >= 6 ? "Gelişim için oynuyorsa bilinçli tercih olabilir." : null));
        }
        var levels = starters.Select(Level).OfType<int>().ToArray();
        double? saved = levels.Length == 0 ? null : levels.Average();
        return new(Round(saved), Round(saved + (double)options.Sum(o => o.Gain) / 11), options);
    }

    // Rectangular Hungarian matching. Lexicographic objective: XI coverage, rotation coverage, XI quality,
    // rotation quality, primary-position tie break. Dummy columns represent explicitly unfilled places.
    // A greedy XI pass would consume the only versatile reserve and invent avoidable gaps.
    static AnalysisPlayer?[] Assign(string[] slots, AnalysisPlayer[] players, AnalysisConfig cfg, bool development = false)
    {
        var n = development ? slots.Length : slots.Length * 2; var m = players.Length + n;
        long Cost(int row, int col)
        {
            if (col >= players.Length) return 0;
            var p = players[col]; var pos = cfg.Position(slots[row % slots.Length]);
            if (!p.Positions.Contains(pos)) return 1_000_000_000_000_000L;
            var first = row < slots.Length; var quality = Math.Clamp((development ? p.Potential : Rating(p, pos)) ?? 0, 0, 100);
            return -((first ? 10_000_000_000_000L : 10_000_000_000L) + quality * (first ? 1_000_000L : 100L) + (p.Positions.FirstOrDefault() == pos ? 1 : 0));
        }
        var u = new long[n + 1]; var v = new long[m + 1]; var matched = new int[m + 1]; var way = new int[m + 1];
        for (var i = 1; i <= n; i++)
        {
            matched[0] = i; var j0 = 0; var min = Enumerable.Repeat(long.MaxValue, m + 1).ToArray(); var used = new bool[m + 1];
            do
            {
                used[j0] = true; var i0 = matched[j0]; var delta = long.MaxValue; var j1 = 0;
                for (var j = 1; j <= m; j++) if (!used[j])
                {
                    var cur = Cost(i0 - 1, j - 1) - u[i0] - v[j];
                    if (cur < min[j]) { min[j] = cur; way[j] = j0; }
                    if (min[j] < delta) { delta = min[j]; j1 = j; }
                }
                for (var j = 0; j <= m; j++) if (used[j]) { u[matched[j]] += delta; v[j] -= delta; } else min[j] -= delta;
                j0 = j1;
            } while (matched[j0] != 0);
            do { var j1 = way[j0]; matched[j0] = matched[j1]; j0 = j1; } while (j0 != 0);
        }
        var result = new AnalysisPlayer?[n];
        for (var j = 1; j <= players.Length; j++) if (matched[j] > 0) result[matched[j] - 1] = players[j - 1];
        return result;
    }
}
