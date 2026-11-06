using System.Globalization;

namespace FcMarket.Api.Domain;

/// <summary>Takvim hesapları. Hepsi gerçek tarih değil, oyun tarihi (snapshots.game_date) ile çalışır.</summary>
public static class Metrics
{
    public static DateOnly? BirthDate(int? daysSinceEpoch, DateOnly epoch)
    {
        if (daysSinceEpoch is not { } days || days <= 0) return null;
        try { return epoch.AddDays(days); }
        catch (ArgumentOutOfRangeException) { return null; }
    }

    /// <summary>Tam yıl olarak yaş.</summary>
    public static int? Age(DateOnly? birth, DateOnly gameDate)
    {
        if (birth is not { } b || b > gameDate) return null;
        var age = gameDate.Year - b.Year;
        if (gameDate.Month < b.Month || (gameDate.Month == b.Month && gameDate.Day < b.Day)) age--;
        return age;
    }

    /// <summary>Oyun tarihinin içinde bulunduğu sezonun bitiş yılı (2026-08 → 2027, 2027-03 → 2027).</summary>
    public static int SeasonEndYear(DateOnly gameDate, int startMonth) =>
        gameDate.Month >= startMonth ? gameDate.Year + 1 : gameDate.Year;

    /// <summary>Sezon etiketi (2026-07-02 → "2026/27", 2030-01-31 → "2029/30").</summary>
    public static string SeasonLabel(DateOnly gameDate, int startMonth = 7)
    {
        var endYear = SeasonEndYear(gameDate, startMonth);
        return string.Create(CultureInfo.InvariantCulture, $"{endYear - 1}/{endYear % 100:D2}");
    }

    /// <summary>Sözleşmede kalan sezon sayısı; bu sezon bitiyorsa 0.</summary>
    public static int? ContractYearsLeft(int? endYear, int seasonEndYear) =>
        endYear is { } e ? Math.Max(0, e - seasonEndYear) : null;

    /// <summary>Aylık ΔOVR. Aralık bir aydan kısaysa null.</summary>
    public static double? GrowthPerMonth(int? ovrNow, int? ovrThen, DateOnly now, DateOnly then)
    {
        if (ovrNow is not { } a || ovrThen is not { } b) return null;
        var months = (now.DayNumber - then.DayNumber) / 30.4375;
        return months < 0.9 ? null : Math.Round((a - b) / months, 2);
    }
}

public sealed record ValueBreakdown(
    long? Value,
    int? Overall,
    double? Base,
    double AgeMultiplier,
    string AgeRule, // "young" (potansiyel primi), "band" (yaş bandı), "curve" (sürekli eğri) ya da "unknown"
    int? AgeBandMin,
    int? AgeBandMax,
    double ContractMultiplier,
    int? ContractYearsLeft,
    double PositionMultiplier,
    string? Position,
    // Formül parametreleri: UI "neden bu değer" açıklamasını bunlarla kurar.
    double BaseValue,
    double BaseOverall,
    double Exponent,
    int YoungMaxAge,
    double YoungPotentialFactor,
    double YoungMaxMultiplier,
    long RoundTo,
    double WageMultiplier = 1.0,
    long? Wage = null,
    double ReferenceWage = 0,
    double WageElasticity = 0,
    int PeakAge = 0,
    double AgeDeclinePerYear = 0,
    double YouthPremiumPerYear = 0);

/// <summary>PLAN §4.3: value = base × ageMult × contrMult × posMult, RoundTo'ya yuvarlanır.</summary>
public sealed class Valuator(ValuationOptions o)
{
    public ValueBreakdown Estimate(int? ovr, int? pot, int? age, int? contractYearsLeft, string? position, long? wage = null)
    {
        double? @base = ovr is { } r ? o.BaseValue * Math.Exp(o.Exponent * (r - o.BaseOverall)) : null;

        double ageMult = 1.0;
        string ageRule = "unknown";
        int? bandMin = null, bandMax = null;
        if (age is { } ca && o.AgeCurve)
        {
            ageRule = "curve";
            ageMult = ca <= o.PeakAge
                ? Math.Exp(o.YouthPremiumPerYear * (o.PeakAge - ca))
                : Math.Exp(-o.AgeDeclinePerYear * (ca - o.PeakAge));
        }
        else if (age is { } a)
        {
            if (a <= o.YoungMaxAge)
            {
                ageRule = "young";
                bandMax = o.YoungMaxAge;
                var gap = ovr is { } ov && pot is { } po ? Math.Max(0, po - ov) : 0;
                ageMult = Math.Min(o.YoungMaxMultiplier, 1 + o.YoungPotentialFactor * gap);
            }
            else
            {
                ageRule = "band";
                var min = o.YoungMaxAge + 1;
                var bands = o.AgeBands.OrderBy(b => b.MaxAge).ToList();
                for (var i = 0; i < bands.Count; i++)
                {
                    var last = i == bands.Count - 1;
                    if (a <= bands[i].MaxAge || last)
                    {
                        ageMult = bands[i].Multiplier;
                        bandMin = min;
                        bandMax = last ? null : bands[i].MaxAge;
                        break;
                    }
                    min = bands[i].MaxAge + 1;
                }
            }
        }

        var contractMult = contractYearsLeft is { } y
            && o.ContractMultipliers.TryGetValue(y.ToString(CultureInfo.InvariantCulture), out var cm)
                ? cm
                : o.ContractDefault;

        var posMult = position is not null && o.PositionMultipliers.TryGetValue(position, out var pm)
            ? pm
            : o.PositionDefault;

        var wageMult = o.WageElasticity != 0 && wage is > 0 && o.ReferenceWage > 0
            ? Math.Pow(wage.Value / o.ReferenceWage, o.WageElasticity)
            : 1.0;

        long? value = null;
        if (@base is { } bv)
        {
            var raw = bv * ageMult * contractMult * posMult * wageMult;
            value = o.RoundTo > 0 ? (long)Math.Round(raw / o.RoundTo, MidpointRounding.AwayFromZero) * o.RoundTo : (long)raw;
        }

        return new ValueBreakdown(value, ovr, @base is { } x ? Math.Round(x) : null, Math.Round(ageMult, 3), ageRule,
            bandMin, bandMax, contractMult, contractYearsLeft, posMult, position,
            o.BaseValue, o.BaseOverall, o.Exponent, o.YoungMaxAge, o.YoungPotentialFactor, o.YoungMaxMultiplier, o.RoundTo,
            Math.Round(wageMult, 3), wage, o.ReferenceWage, o.WageElasticity, o.PeakAge, o.AgeDeclinePerYear, o.YouthPremiumPerYear);
    }
}

/// <param name="Key">growthRoom | growthRate | contract | age</param>
/// <param name="Score">0–1 arası bileşen puanı; veri yoksa null (skora katılmaz).</param>
/// <param name="Raw">Ham girdi: POT−OVR, aylık ΔOVR, kalan yıl ya da yaş.</param>
public sealed record OpportunityComponent(string Key, double Weight, double? Score, double? Raw);

public sealed record OpportunityBreakdown(int? Score, IReadOnlyList<OpportunityComponent> Components);

/// <summary>Fırsat skoru (0–100): bilinen bileşenlerin ağırlıklı ortalaması.</summary>
public sealed class OpportunityScorer(OpportunityOptions o)
{
    public const string GrowthRoom = "growthRoom", GrowthRate = "growthRate", Contract = "contract", Age = "age";

    public OpportunityBreakdown Score(int? ovr, int? pot, double? growthPerMonth, int? contractYearsLeft, int? age)
    {
        double? room = ovr is { } a && pot is { } b ? Math.Max(0, b - a) : null;

        double? contractScore = contractYearsLeft is { } y
            ? o.ContractScores.TryGetValue(y.ToString(CultureInfo.InvariantCulture), out var s) ? s : o.ContractDefault
            : null;

        double? ageScore = age is { } ag
            ? Clamp01((o.AgeZero - (double)ag) / Math.Max(1, o.AgeZero - o.AgeFull))
            : null;

        var components = new List<OpportunityComponent>
        {
            new(GrowthRoom, W(GrowthRoom), room is { } r ? Clamp01(r / o.GrowthRoomMax) : null, room),
            new(GrowthRate, W(GrowthRate), growthPerMonth is { } g ? Clamp01(g / o.GrowthRateMax) : null, growthPerMonth),
            new(Contract, W(Contract), contractScore, contractYearsLeft),
            new(Age, W(Age), ageScore, age),
        };

        var known = components.Where(c => c.Score is not null && c.Weight > 0).ToList();
        var weight = known.Sum(c => c.Weight);
        int? total = weight > 0
            ? (int)Math.Round(100 * known.Sum(c => c.Weight * c.Score!.Value) / weight, MidpointRounding.AwayFromZero)
            : null;

        return new OpportunityBreakdown(total,
            components.Select(c => c with { Score = c.Score is { } v ? Math.Round(v, 3) : null }).ToList());
    }

    private double W(string key) => o.Weights.TryGetValue(key, out var w) ? w : 0;

    private static double Clamp01(double v) => Math.Clamp(v, 0, 1);
}
