using System.Text.Json;
using FcMarket.Api.Analysis;
using FcMarket.Api.FieldMaps;

namespace FcMarket.Tests;

public sealed class ClubReviewTests
{
    static ClubReviewConfig Config() => JsonSerializer.Deserialize<ClubReviewConfig>(
        File.ReadAllText(Path.Combine(TestConfig.RepoRoot, "config", "club-review.json")), FieldMap.JsonOptions)!;

    static AnalysisConfig Analysis() => JsonSerializer.Deserialize<AnalysisConfig>(
        File.ReadAllText(Path.Combine(TestConfig.RepoRoot, "config", "squad-analysis.json")), FieldMap.JsonOptions)!;

    [Fact]
    public void Budget_model_reproduces_every_calibration_point_within_two_percent()
    {
        var model = Config().Budget;
        Assert.True(model.Calibration.Count >= 5);
        foreach (var point in model.Calibration)
        {
            var estimate = ClubReviewService.Budget((int)point.ClubWorth, model)!;
            Assert.InRange(estimate.Estimate, point.TransferBudgetStart * 0.98, point.TransferBudgetStart * 1.02);
            Assert.True(estimate.Low < estimate.Estimate && estimate.Estimate < estimate.High);
            Assert.False(estimate.OutsideCalibration);
        }
    }

    [Theory]
    [InlineData(150_000, false)] // Wrexham: kalibre kulüplerin arasında
    [InlineData(5_000_000, true)] // dev kulüp: eğri uzatılıyor
    [InlineData(1_000, true)]
    public void Estimates_far_from_calibrated_clubs_are_flagged(int worth, bool outside) =>
        Assert.Equal(outside, ClubReviewService.Budget(worth, Config().Budget)!.OutsideCalibration);

    [Theory]
    [InlineData(null)] [InlineData(0)] [InlineData(-5)]
    public void Unknown_club_worth_gives_no_budget(int? worth) => Assert.Null(ClubReviewService.Budget(worth, Config().Budget));

    [Theory]
    [InlineData(30, "Derin savunma çizgisi")] [InlineData(51, "Orta savunma çizgisi")] [InlineData(75, "Yüksek savunma çizgisi")] [InlineData(null, null)]
    public void Defensive_line_label_uses_configured_bands(int? depth, string? label) =>
        Assert.Equal(label, ClubReviewService.DefensiveLineLabel(depth, Config()));

    [Fact]
    public void Formation_is_matched_by_name_then_by_identical_slots_then_by_nearest_shape()
    {
        var cfg = Analysis();
        string[] wrexham = ["GK", "RCB", "CB", "LCB", "RM", "RCM", "LCM", "LM", "RAM", "LAM", "ST"];
        Assert.Equal(("3-4-2-1", true), ClubReviewService.ChooseFormation(cfg, "3-4-2-1", wrexham, null));
        Assert.Equal(("3-4-2-1", true), ClubReviewService.ChooseFormation(cfg, "Özel 3-4-2-1", wrexham, null));
        // 3-4-1-2 tanımlı değil: en çok ortak temel mevkisi olan diziliş seçilir, birebir sayılmaz.
        string[] threeFourOneTwo = ["GK", "RCB", "CB", "LCB", "RM", "RCM", "LCM", "LM", "CAM", "RS", "LS"];
        var (nearest, exact) = ClubReviewService.ChooseFormation(cfg, "3-4-1-2", threeFourOneTwo, null);
        Assert.False(exact);
        Assert.StartsWith("3-", nearest);
        Assert.Equal(("4-3-3", false), ClubReviewService.ChooseFormation(cfg, null, [], "4-3-3"));
        Assert.Equal(((string?)null, false), ClubReviewService.ChooseFormation(cfg, null, [], null));
    }
}
