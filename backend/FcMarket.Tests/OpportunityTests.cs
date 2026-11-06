using FcMarket.Api.Domain;

namespace FcMarket.Tests;

public class OpportunityTests
{
    private readonly OpportunityScorer _s = new(TestConfig.Opportunity);

    [Fact]
    public void Perfect_prospect_scores_100()
    {
        // POT−OVR = 20, +1 OVR/ay, sözleşme bitiyor, 19 yaş
        var o = _s.Score(65, 85, 1.0, 0, 19);
        Assert.Equal(100, o.Score);
        Assert.All(o.Components, c => Assert.Equal(1.0, c.Score));
    }

    [Fact]
    public void Veteran_with_long_contract_scores_0()
    {
        var o = _s.Score(80, 80, -0.2, 4, 33);
        Assert.Equal(0, o.Score);
    }

    [Fact]
    public void Score_is_weighted_average_of_components()
    {
        // growthRoom 10/20 = 0.5, growthRate 0.4, contract (1 yıl) 0.6, age 25 → (30−25)/9
        var o = _s.Score(75, 85, 0.4, 1, 25);
        var expected = 100 * (0.35 * 0.5 + 0.25 * 0.4 + 0.2 * 0.6 + 0.2 * (5.0 / 9)) / 1.0;
        Assert.Equal((int)Math.Round(expected, MidpointRounding.AwayFromZero), o.Score);
    }

    [Fact]
    public void Unknown_components_are_skipped_and_weights_renormalized()
    {
        // Tek snapshot: gelişim hızı yok. Kalan üç bileşen tam puan -> yine 100.
        var o = _s.Score(65, 85, null, 0, 19);
        Assert.Equal(100, o.Score);
        var rate = Assert.Single(o.Components, c => c.Key == OpportunityScorer.GrowthRate);
        Assert.Null(rate.Score);
    }

    [Fact]
    public void No_data_gives_null_score() =>
        Assert.Null(_s.Score(null, null, null, null, null).Score);

    [Fact]
    public void Components_expose_raw_inputs_for_ui()
    {
        var o = _s.Score(70, 82, 0.5, 2, 23);
        var raw = o.Components.ToDictionary(c => c.Key, c => c.Raw);
        Assert.Equal(12, raw[OpportunityScorer.GrowthRoom]);
        Assert.Equal(0.5, raw[OpportunityScorer.GrowthRate]);
        Assert.Equal(2, raw[OpportunityScorer.Contract]);
        Assert.Equal(23, raw[OpportunityScorer.Age]);
    }

    [Fact]
    public void Growth_room_is_capped() =>
        Assert.Equal(1.0, _s.Score(50, 90, null, null, null).Components.Single(c => c.Key == "growthRoom").Score);
}
