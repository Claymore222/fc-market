using FcMarket.Api.Domain;

namespace FcMarket.Tests;

public class MetricsTests
{
    private static readonly DateOnly Epoch = new(1582, 10, 14);

    [Fact]
    public void BirthDate_counts_days_from_epoch()
    {
        var birth = new DateOnly(2004, 3, 15);
        var days = birth.DayNumber - Epoch.DayNumber;
        Assert.Equal(birth, Metrics.BirthDate(days, Epoch));
    }

    [Theory]
    [InlineData(null)]
    [InlineData(0)]
    [InlineData(-5)]
    public void BirthDate_is_null_for_missing_or_invalid(int? days) =>
        Assert.Null(Metrics.BirthDate(days, Epoch));

    [Theory]
    [InlineData("2004-03-15", "2026-03-14", 21)] // doğum gününden bir gün önce
    [InlineData("2004-03-15", "2026-03-15", 22)] // doğum günü
    [InlineData("2004-03-15", "2027-01-01", 22)]
    [InlineData("2004-02-29", "2026-02-28", 21)] // artık yıl
    public void Age_uses_game_date(string birth, string gameDate, int expected) =>
        Assert.Equal(expected, Metrics.Age(DateOnly.Parse(birth), DateOnly.Parse(gameDate)));

    [Fact]
    public void Age_is_null_when_birth_unknown_or_in_future()
    {
        Assert.Null(Metrics.Age(null, new DateOnly(2026, 8, 1)));
        Assert.Null(Metrics.Age(new DateOnly(2030, 1, 1), new DateOnly(2026, 8, 1)));
    }

    [Theory]
    [InlineData("2026-07-01", 2027)]
    [InlineData("2026-08-15", 2027)]
    [InlineData("2027-01-01", 2027)]
    [InlineData("2027-06-30", 2027)]
    public void SeasonEndYear_rolls_over_in_start_month(string gameDate, int expected) =>
        Assert.Equal(expected, Metrics.SeasonEndYear(DateOnly.Parse(gameDate), startMonth: 7));

    [Theory]
    [InlineData(2027, 2027, 0)]
    [InlineData(2029, 2027, 2)]
    [InlineData(2026, 2027, 0)] // süresi geçmiş -> 0, negatif değil
    public void ContractYearsLeft_is_relative_to_season_end(int endYear, int seasonEnd, int expected) =>
        Assert.Equal(expected, Metrics.ContractYearsLeft(endYear, seasonEnd));

    [Fact]
    public void ContractYearsLeft_is_null_without_contract() =>
        Assert.Null(Metrics.ContractYearsLeft(null, 2027));

    [Fact]
    public void GrowthPerMonth_is_monthly_delta()
    {
        var rate = Metrics.GrowthPerMonth(84, 82, new DateOnly(2027, 1, 1), new DateOnly(2026, 9, 1));
        Assert.NotNull(rate);
        Assert.Equal(0.5, rate!.Value, precision: 2);
    }

    [Fact]
    public void GrowthPerMonth_needs_at_least_a_month_and_both_values()
    {
        Assert.Null(Metrics.GrowthPerMonth(84, 82, new DateOnly(2026, 9, 10), new DateOnly(2026, 9, 1)));
        Assert.Null(Metrics.GrowthPerMonth(84, null, new DateOnly(2027, 1, 1), new DateOnly(2026, 9, 1)));
    }
}
