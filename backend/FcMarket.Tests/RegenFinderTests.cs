using FcMarket.Api.Market;

namespace FcMarket.Tests;

public sealed class RegenFinderTests
{
    private static RegenPerson Person(string birth = "1988-08-21", int nation = 37, int position = 25, int potential = 92, bool retiring = false) =>
        new(1, DateOnly.Parse(birth), nation, position, potential, 84, retiring);

    [Theory]
    [InlineData("2008-08-21", 92, "Güçlü")]
    [InlineData("2008-08-21", 93, "Güçlü")]
    [InlineData("2008-08-21", 89, "Olası")]
    [InlineData("2008-08-21", 88, null)]
    [InlineData("2008-08-22", 92, null)]
    public void Confidence_needs_the_same_birthday_and_a_close_potential(string birth, int potential, string? expected) =>
        Assert.Equal(expected, RegenFinder.Confidence(Person(), Person(birth, potential: potential)));

    [Fact]
    public void Nation_and_position_must_match()
    {
        Assert.Null(RegenFinder.Confidence(Person(), Person("2008-08-21", nation: 38)));
        Assert.Null(RegenFinder.Confidence(Person(), Person("2008-08-21", position: 14)));
    }

    [Fact]
    public void A_missing_young_player_is_not_treated_as_retired()
    {
        var today = new DateOnly(2030, 7, 31);
        Assert.False(RegenFinder.Departed(Person("2000-01-01"), today));
        Assert.True(RegenFinder.Departed(Person("1997-01-01"), today));
        Assert.True(RegenFinder.Departed(Person("2000-01-01", retiring: true), today));
    }
}
