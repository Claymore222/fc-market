using FcMarket.Api.Data;
using FcMarket.Api.Endpoints;
using Microsoft.Data.Sqlite;

namespace FcMarket.Tests;

public sealed class AppSettingsTests : IDisposable
{
    readonly string dir = Path.Combine(Path.GetTempPath(), "fcm-settings-" + Guid.NewGuid().ToString("N"));
    string App => Path.Combine(dir, "app.db");

    [Fact] public void Setting_is_empty_until_saved_then_overwritten_and_survives_reopening()
    {
        Assert.Null(new AppDb(App).Setting("theme"));
        new AppDb(App).SaveSetting("theme", "ice"); new AppDb(App).SaveSetting("theme", "paper");
        Assert.Equal("paper", new AppDb(App).Setting("theme"));
    }
    [Theory] [InlineData("moon", true)] [InlineData("ivory", true)] [InlineData(null, false)] [InlineData("", false)]
    [InlineData("a", false)] [InlineData("Moon", false)] [InlineData("moon;drop", false)] [InlineData("averyveryveryverylongtheme", false)]
    public void Theme_id_must_be_a_short_lowercase_word(string? theme, bool valid) => Assert.Equal(valid, ThemeSetting.Valid(theme));

    public void Dispose() { SqliteConnection.ClearAllPools(); if (Directory.Exists(dir)) Directory.Delete(dir, true); }
}
