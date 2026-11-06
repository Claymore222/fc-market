using FcMarket.Api.Domain;

namespace FcMarket.Tests;

public class ValuationTests
{
    /// <summary>Bant modeli (PLAN §4.3): eski davranış, açık seçeneklerle.</summary>
    private static readonly ValuationOptions Bands = new()
    {
        BaseValue = 1_500_000, BaseOverall = 60, Exponent = 0.16, YoungMaxAge = 21, YoungPotentialFactor = 0.04,
        YoungMaxMultiplier = 2.0,
        AgeBands = [new() { MaxAge = 28, Multiplier = 1.0 }, new() { MaxAge = 31, Multiplier = 0.7 }, new() { MaxAge = 99, Multiplier = 0.4 }],
        ContractMultipliers = new() { ["0"] = 0.4, ["1"] = 0.7 }, ContractDefault = 1.0,
        PositionMultipliers = new() { ["GK"] = 0.8, ["ST"] = 1.1, ["LW"] = 1.1, ["RW"] = 1.1, ["CAM"] = 1.1 }, PositionDefault = 1.0,
        RoundTo = 50_000,
    };

    private readonly Valuator _v = new(Bands);

    // PLAN §4.3: 60→1.5M, 70→7.4M, 80→37M, 85→82M (25 yaş, 3 yıl sözleşme, CM: tüm çarpanlar 1.0)
    [Theory]
    [InlineData(60, 1_500_000)]
    [InlineData(70, 7_450_000)]
    [InlineData(80, 36_800_000)]
    [InlineData(85, 81_900_000)]
    public void Base_value_follows_exponential_curve(int ovr, long expected)
    {
        var b = _v.Estimate(ovr, ovr, age: 25, contractYearsLeft: 3, position: "CM");
        Assert.Equal(expected, b.Value);
        Assert.Equal(1.0, b.AgeMultiplier);
        Assert.Equal(1.0, b.ContractMultiplier);
        Assert.Equal(1.0, b.PositionMultiplier);
    }

    [Theory]
    [InlineData(19, 70, 80, 1.4, "young")]   // 1 + 0.04 × 10
    [InlineData(18, 60, 90, 2.0, "young")]   // 1 + 0.04 × 30 = 2.2 → üst sınır 2.0
    [InlineData(21, 75, 75, 1.0, "young")]
    [InlineData(22, 75, 75, 1.0, "band")]
    [InlineData(28, 75, 75, 1.0, "band")]
    [InlineData(29, 75, 75, 0.7, "band")]
    [InlineData(31, 75, 75, 0.7, "band")]
    [InlineData(32, 75, 75, 0.4, "band")]
    [InlineData(40, 75, 75, 0.4, "band")]
    public void Age_multiplier(int age, int ovr, int pot, double expected, string rule)
    {
        var b = _v.Estimate(ovr, pot, age, 3, "CM");
        Assert.Equal(expected, b.AgeMultiplier, precision: 3);
        Assert.Equal(rule, b.AgeRule);
    }

    [Fact]
    public void Age_band_bounds_are_reported_for_ui()
    {
        var mid = _v.Estimate(75, 75, 30, 3, "CM");
        Assert.Equal((29, 31), (mid.AgeBandMin!.Value, mid.AgeBandMax!.Value));
        var old = _v.Estimate(75, 75, 33, 3, "CM");
        Assert.Equal(32, old.AgeBandMin);
        Assert.Null(old.AgeBandMax); // son bant üstten açık
    }

    [Theory]
    [InlineData(0, 0.4)]
    [InlineData(1, 0.7)]
    [InlineData(2, 1.0)]
    [InlineData(5, 1.0)]
    [InlineData(null, 1.0)] // sözleşme bilinmiyor
    public void Contract_multiplier(int? yearsLeft, double expected) =>
        Assert.Equal(expected, _v.Estimate(75, 75, 25, yearsLeft, "CM").ContractMultiplier);

    [Theory]
    [InlineData("GK", 0.8)]
    [InlineData("ST", 1.1)]
    [InlineData("LW", 1.1)]
    [InlineData("RW", 1.1)]
    [InlineData("CAM", 1.1)]
    [InlineData("CB", 1.0)]
    [InlineData(null, 1.0)]
    public void Position_multiplier(string? pos, double expected) =>
        Assert.Equal(expected, _v.Estimate(75, 75, 25, 3, pos).PositionMultiplier);

    [Fact]
    public void Value_is_product_of_factors_rounded_to_50k()
    {
        // 84 OVR, 94 POT, 21 yaş, sözleşme bu sezon bitiyor, LM
        var b = _v.Estimate(84, 94, 21, 0, "LM");
        var raw = 1_500_000 * Math.Exp(0.16 * 24) * 1.4 * 0.4 * 1.0;
        Assert.Equal((long)Math.Round(raw / 50_000) * 50_000, b.Value);
        Assert.Equal(0, b.Value!.Value % 50_000);
    }

    [Fact]
    public void Unknown_overall_gives_no_value() =>
        Assert.Null(_v.Estimate(null, 80, 20, 2, "ST").Value);

    [Fact]
    public void Unknown_age_uses_neutral_multiplier()
    {
        var b = _v.Estimate(75, 85, null, 3, "CM");
        Assert.Equal(1.0, b.AgeMultiplier);
        Assert.Equal("unknown", b.AgeRule);
    }

    [Fact]
    public void Repo_config_uses_calibrated_curve_with_wage()
    {
        var v = new Valuator(TestConfig.Valuation);
        // CMTracker örnekleri (28.10.2026): değer ≈ 20 % içinde. 83 OVR, 27 yaş, maaş 41K → ~18M; 69 OVR, 19 yaş, 3,3K → ~3,6M.
        var hendriks = v.Estimate(83, 83, 28, 3, "CB", 41_000).Value!.Value;
        Assert.InRange(hendriks, 18_000_000 * 0.7, 18_000_000 * 1.3);
        var jang = v.Estimate(69, 80, 19, 3, "GK", 3_300).Value!.Value;
        Assert.InRange(jang, 3_600_000 * 0.6, 3_600_000 * 1.5);
    }

    [Fact]
    public void Wage_multiplier_follows_elasticity()
    {
        var o = new ValuationOptions { BaseValue = 1_000_000, BaseOverall = 60, Exponent = 0, ReferenceWage = 10_000, WageElasticity = 0.5, RoundTo = 1 };
        var v = new Valuator(o);
        Assert.Equal(2.0, v.Estimate(60, 60, null, 3, "CM", 40_000).WageMultiplier, precision: 3);
        Assert.Equal(1.0, v.Estimate(60, 60, null, 3, "CM", null).WageMultiplier); // maaş bilinmiyor → nötr
        Assert.Equal(1.0, new Valuator(Bands).Estimate(60, 60, 25, 3, "CM", 40_000).WageMultiplier); // esneklik 0
    }

    [Theory]
    [InlineData(24, 1.0)]
    [InlineData(20, 2.117)]  // e^(0,1875 × 4)
    [InlineData(30, 0.301)]  // e^(−0,2 × 6)
    public void Age_curve(int age, double expected)
    {
        var o = new ValuationOptions { AgeCurve = true, PeakAge = 24, AgeDeclinePerYear = 0.2, YouthPremiumPerYear = 0.1875, RoundTo = 1 };
        var b = new Valuator(o).Estimate(70, 80, age, 3, "CM");
        Assert.Equal(expected, b.AgeMultiplier, precision: 3);
        Assert.Equal("curve", b.AgeRule);
    }
}
