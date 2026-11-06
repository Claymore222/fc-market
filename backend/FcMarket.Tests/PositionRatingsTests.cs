using FcMarket.Api.Domain;

namespace FcMarket.Tests;

public class PositionRatingsTests
{
    private static PositionRatingConfig Config(bool calibrate = true) => new()
    {
        CalibrateToOverall = calibrate,
        MinKnownWeight = 0.5,
        Positions = new()
        {
            ["ST"] = new() { ["finishing"] = 0.6, ["positioning"] = 0.4 },
            ["CB"] = new() { ["standingtackle"] = 0.5, ["defensiveawareness"] = 0.5 },
            ["GK"] = new() { ["gkdiving"] = 1.0 },
        },
    };

    private static Dictionary<string, int?> Attrs(params (string, int?)[] xs) => xs.ToDictionary(x => x.Item1, x => x.Item2);

    [Fact]
    public void Raw_is_weighted_average()
    {
        var raw = PositionRatings.Raw(new() { ["a"] = 0.75, ["b"] = 0.25 }, Attrs(("a", 80), ("b", 60)), 0.5);
        Assert.Equal(75, raw!.Value, precision: 6);
    }

    [Fact]
    public void Missing_attributes_are_renormalized_until_threshold()
    {
        var w = new Dictionary<string, double> { ["a"] = 0.6, ["b"] = 0.4 };
        Assert.Equal(80, PositionRatings.Raw(w, Attrs(("a", 80)), 0.5)!.Value, precision: 6); // %60 bilinen
        Assert.Null(PositionRatings.Raw(w, Attrs(("b", 80)), 0.5));                         // %40 bilinen
        Assert.Null(PositionRatings.Raw(w, Attrs(("a", null), ("b", null)), 0.5));
    }

    [Fact]
    public void Primary_position_is_calibrated_to_overall_and_others_shift_equally()
    {
        var attrs = Attrs(("finishing", 80), ("positioning", 70), ("standingtackle", 50), ("defensiveawareness", 40), ("gkdiving", 12));
        var r = PositionRatings.Compute(Config(), attrs, "ST", overall: 79).ToDictionary(x => x.Position, x => x.Rating);
        // ST ham = 76 → OVR 79'a eşitlenir (+3); CB ham 45 → 48; GK 12 → 15
        Assert.Equal(79, r["ST"]);
        Assert.Equal(48, r["CB"]);
        Assert.Equal(15, r["GK"]);
    }

    [Fact]
    public void Without_calibration_raw_values_are_rounded()
    {
        var attrs = Attrs(("finishing", 80), ("positioning", 70), ("standingtackle", 50), ("defensiveawareness", 40));
        var r = PositionRatings.Compute(Config(calibrate: false), attrs, "ST", 79).ToDictionary(x => x.Position, x => x.Rating);
        Assert.Equal(76, r["ST"]);
        Assert.Equal(45, r["CB"]);
        Assert.Null(r["GK"]);
    }

    [Fact]
    public void Unknown_primary_or_overall_skips_calibration()
    {
        var attrs = Attrs(("finishing", 80), ("positioning", 70));
        Assert.Equal(76, PositionRatings.Compute(Config(), attrs, "P21", 90).Single(x => x.Position == "ST").Rating);
        Assert.Equal(76, PositionRatings.Compute(Config(), attrs, "ST", null).Single(x => x.Position == "ST").Rating);
    }

    [Fact]
    public void Ratings_are_clamped()
    {
        var attrs = Attrs(("finishing", 99), ("positioning", 99), ("gkdiving", 1));
        var r = PositionRatings.Compute(Config(), attrs, "GK", overall: 99).ToDictionary(x => x.Position, x => x.Rating);
        Assert.Equal(99, r["GK"]);
        Assert.Equal(99, r["ST"]); // 99 + 98 → 99'a sabitlenir
    }

    [Fact]
    public void Repo_config_uses_only_mapped_attributes()
    {
        var cfg = TestConfig.PositionRatingsFile.Current;
        var map = TestConfig.FieldMap;
        var known = map.AllAttributes().ToHashSet();
        Assert.Equal(14, cfg.Positions.Count);
        Assert.DoesNotContain("CF", cfg.Positions.Keys);
        Assert.All(cfg.Positions, p =>
        {
            Assert.All(p.Value.Keys, a => Assert.True(known.Contains(a), $"{p.Key}: {a} field-map'te yok"));
            Assert.InRange(p.Value.Values.Sum(), 0.9, 1.1);
        });
        // field-map'teki her pozisyon etiketinin bir formülü olmalı
        Assert.All(map.Positions.Values, label => Assert.True(cfg.Positions.ContainsKey(label), $"formül yok: {label}"));
    }

    [Fact]
    public void Repo_config_ranks_a_striker_above_goalkeeper()
    {
        var cfg = TestConfig.PositionRatingsFile.Current;
        var attrs = TestConfig.FieldMap.AllAttributes().ToDictionary(a => a, a => (int?)(a.StartsWith("gk") ? 12 : 80));
        attrs["finishing"] = 88;
        var r = PositionRatings.Compute(cfg, attrs, "ST", 82).ToDictionary(x => x.Position, x => x.Rating);
        Assert.Equal(82, r["ST"]);
        Assert.True(r["GK"] < 30);
        Assert.True(r["CB"] < r["ST"]);
    }
}
