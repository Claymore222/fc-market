using FcMarket.Api.Market;

namespace FcMarket.Tests;

public sealed class AdvancedScoutTests
{
    private static readonly MarketPlayer[] Players =
    [
        new() { Id = 1, Wage = 5000, RecordedWage = 5000, ContractYearsLeft = 2, WeakFoot = 4, SkillMoves = 5,
            Position = "CM", PositionGroup = "MID", Positions = ["CM", "RB"], NaturalPositionGroups = ["MID", "DEF"],
            RoleCodes = [133, 26], PlayStyleIds = [0, 32], PlayStylePlusIds = [21] },
        new() { Id = 2, IsFreeAgent = true, RecordedWage = 2400, ContractYearsLeft = 0, WeakFoot = 3, SkillMoves = 2,
            Position = "CB", PositionGroup = "DEF", Positions = ["CB"], RoleCodes = [33], PlayStyleIds = [21] },
        new() { Id = 3, Wage = 1000, ContractYearsLeft = 1, WeakFoot = 5, SkillMoves = 3,
            RoleCodes = [126], PlayStylePlusIds = [0] },
        new() { Id = 4 }, // Kaynak yok; sayısal sınır veya yetenek filtresini geçmemeli.
    ];
    private static int[] Match(PlayerQuery q) => MarketQuery.Filter(Players, q).Select(p => p.Id).ToArray();

    [Fact]
    public void Wage_bounds_use_recorded_free_agent_amount_and_keep_boundaries() =>
        Assert.Equal([1, 2], Match(new() { WageMin = 2400, WageMax = 5000 }));

    [Fact]
    public void Contract_and_stars_compose_with_free_agent_status()
    {
        Assert.Equal([2], Match(new() { FreeAgent = true, ContractYearsMax = 0, WeakFootMin = 3 }));
        Assert.Equal([1], Match(new() { FreeAgent = false, ContractYearsMin = 1, ContractYearsMax = 2, WeakFootMin = 4, SkillMovesMin = 4 }));
    }

    [Fact]
    public void Roles_match_base_code_and_requested_level_on_the_same_role()
    {
        Assert.Equal([1, 2], Match(new() { Role = "33" }));
        Assert.Equal([1], Match(new() { Role = "33", RoleLevelMin = 2 }));
        Assert.Equal([3], Match(new() { Role = "26", RoleLevelMin = 2 }));
        Assert.Equal([1, 3], Match(new() { RoleLevelMin = 2 }));
    }

    [Fact]
    public void Styles_include_plus_while_plus_filter_requires_plus_and_groups_are_anded()
    {
        Assert.Equal([1, 3], Match(new() { PlayStyle = "0" }));
        Assert.Equal([3], Match(new() { PlayStylePlus = "0" }));
        Assert.Equal([1, 2, 3], Match(new() { PlayStyle = "0,21" }));
        Assert.Equal([1], Match(new() { PlayStyle = "32", PlayStylePlus = "21", Role = "33", SkillMovesMin = 5 }));
        Assert.Empty(Match(new() { PlayStyle = "63" }));
    }

    [Fact]
    public void Secondary_position_and_group_are_opt_in()
    {
        Assert.Empty(Match(new() { Pos = "RB" }));
        Assert.Equal([1], Match(new() { Pos = "RB", IncludeSecondary = true }));
        Assert.Equal([1, 2], Match(new() { Pos = "DEF", IncludeSecondary = true }));
        Assert.Equal([2], Match(new() { Pos = "DEF" }));
    }

    [Fact]
    public void Signed_and_high_bit_masks_are_decoded_without_overflow()
    {
        Assert.Equal([0, 31, 32, 63], PlayerAbilities.StyleBits(-2147483647L, -2147483647L));
        Assert.Empty(PlayerAbilities.StyleBits(null, null));
    }

    [Theory]
    [InlineData("role", "abc")]
    [InlineData("role", "100")]
    [InlineData("playStyle", "64")]
    [InlineData("playStylePlus", "-1")]
    public void Invalid_csv_filters_report_bad_request(string field, string value)
    {
        var q = new PlayerQuery();
        if (field == "role") q.Role = value;
        if (field == "playStyle") q.PlayStyle = value;
        if (field == "playStylePlus") q.PlayStylePlus = value;
        Assert.Throws<BadRequestException>(() => Match(q));
    }

    [Fact]
    public void Invalid_ranges_and_levels_report_bad_request()
    {
        foreach (var q in new PlayerQuery[] { new() { WageMin = 100, WageMax = 10 }, new() { WageMin = -1 },
            new() { ContractYearsMin = 2, ContractYearsMax = 0 }, new() { WeakFootMin = 6 }, new() { SkillMovesMin = 0 }, new() { RoleLevelMin = 3 } })
            Assert.Throws<BadRequestException>(() => Match(q));
    }
}
