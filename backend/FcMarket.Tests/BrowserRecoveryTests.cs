using FcMarket.Desktop;

namespace FcMarket.Tests;
public sealed class BrowserRecoveryTests
{
    [Fact] public void Reentrant_events_do_not_create_multiple_controls_and_crash_loops_are_bounded()
    {
        var policy = new BrowserRecoveryPolicy(); var now = DateTimeOffset.UtcNow;
        Assert.True(policy.TryBegin(false, now)); Assert.False(policy.TryBegin(false, now)); Assert.False(policy.TryBegin(true, now));
        policy.Complete(); Assert.True(policy.TryBegin(false, now.AddSeconds(5))); policy.Complete();
        Assert.False(policy.TryBegin(false, now.AddSeconds(10)));
        Assert.True(policy.TryBegin(true, now.AddSeconds(11))); policy.Complete();
        Assert.True(policy.TryBegin(false, now.AddMinutes(3)));
    }
    [Theory]
    [InlineData(false, null, false)] [InlineData(true, null, true)]
    [InlineData(true, "hardware", false)] [InlineData(false, "software", true)]
    [InlineData(true, "invalid", true)]
    public void Overlay_compatibility_is_scoped_and_hardware_remains_default_without_RTSS(bool overlay, string? preference, bool expected)
        => Assert.Equal(expected, BrowserRecoveryPolicy.SoftwareRendering(overlay, preference));
    [Theory]
    [InlineData("http://127.0.0.1:5127/squad?player=1", true)]
    [InlineData("http://127.0.0.1:5127/", true)]
    [InlineData("http://127.0.0.1:5189/", false)]
    [InlineData("https://127.0.0.1:5127/", false)]
    [InlineData("http://evil.test/", false)]
    [InlineData("http://user@127.0.0.1:5127/", false)]
    [InlineData("about:blank", false)]
    public void Recovery_cannot_navigate_away_from_the_local_app(string uri, bool expected)
        => Assert.Equal(expected, BrowserRecoveryPolicy.Allowed(uri, new Uri("http://127.0.0.1:5127/")));
}
