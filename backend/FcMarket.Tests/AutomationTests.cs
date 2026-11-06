using System.Text.Json;
using FcMarket.Desktop;

namespace FcMarket.Tests;

public sealed class AutomationTests : IDisposable
{
    const string Export = "-- bundled export\nlocal CONFIG = {\n ENABLE_EVENT_LOG = true,\n AUTO_SNAPSHOT_ON_MONTH = true,\n AUTO_DAILY = true,\n AUTO_SESSION_SNAPSHOT = true,\n}\n";
    readonly string temp = Path.Combine(Path.GetTempPath(), "fcm-automation-" + Guid.NewGuid().ToString("N"));
    string Root => Path.Combine(temp, "app");
    string Local => Path.Combine(temp, "local");
    string Le => Path.Combine(temp, "le");
    AutomationManager Manager => new(Root, Local, [Le], Path.Combine(temp, "exports"));
    string Script(string folder, string file = "fc_export.lua") => Path.Combine(Le, "lua", folder, file);

    [Fact]
    public void Export_schedule_defaults_to_monthly_is_saved_and_rejects_unknown_values()
    {
        Assert.Equal("monthly", Manager.Status().Schedule);
        Assert.Equal("weekly", Manager.SetSchedule("weekly").Schedule);
        Assert.Equal("weekly\n", File.ReadAllText(Path.Combine(temp, "exports", "export_schedule.txt")));
        Assert.Equal("weekly", Manager.Status().Schedule);
        Assert.Throws<InvalidOperationException>(() => Manager.SetSchedule("hourly"));
        File.WriteAllText(Path.Combine(temp, "exports", "export_schedule.txt"), "bozuk");
        Assert.Equal("monthly", Manager.Status().Schedule);
    }

    public AutomationTests()
    {
        Directory.CreateDirectory(Path.Combine(Root, "exporter", "lua"));
        Directory.CreateDirectory(Path.Combine(Le, "lua"));
        Directory.CreateDirectory(Path.Combine(Root, "tools", "scriptlogging"));
        File.Copy(Path.Combine(TestConfig.RepoRoot, "tools", "scriptlogging", "fc_logging.lua"), Path.Combine(Root, "tools", "scriptlogging", "fc_logging.lua"));
        File.WriteAllText(Path.Combine(Root, "exporter", "lua", "fc_export.lua"), Export);
        File.WriteAllText(Path.Combine(Root, "exporter", "lua", "fc_assets.lua"), "-- bundled assets");
    }

    [Fact]
    public void Autorun_goes_to_the_data_folder_named_by_the_live_editor_log_and_scripts_stay_in_the_install()
    {
        var data = Path.Combine(temp, "le-data");
        Directory.CreateDirectory(data); Directory.CreateDirectory(Path.Combine(Le, "Logs"));
        File.WriteAllText(Path.Combine(Le, "Logs", "live_editor_01-11-2026.log"), $"23:10:01\tINFO\tFC 27 Live Editor\n23:10:01\tINFO\tLoad Config From {data}\\le_config.json\n");
        var state = Manager.Set("export", true);
        Assert.Equal(Path.Combine(data, "lua", "autorun", "fc_export.lua"), state.Scripts[0].Path);
        Assert.True(File.Exists(state.Scripts[0].Path) && state.Scripts[0].Matches);
        Assert.False(File.Exists(Script("autorun")));
        Assert.Equal(Script("scripts", "fc_assets.lua"), Manager.Set("assets", true).Scripts[1].Path);
    }

    [Fact]
    public void Enable_disable_reopen_and_enable_preserve_unrelated_files_and_backup()
    {
        Assert.False(Manager.Status().Scripts[0].Installed);
        Assert.False(Directory.Exists(Path.Combine(Le, "lua", "autorun"))); // status is read-only
        var enabled = Manager.Set("export", true);
        Assert.True(enabled.Scripts[0].Matches);
        File.WriteAllText(Script("autorun", "other.lua"), "keep");
        Manager.Set("export", false);
        Assert.False(File.Exists(Script("autorun")));
        Assert.Equal("keep", File.ReadAllText(Script("autorun", "other.lua")));
        Assert.Equal(Export, ScriptLogging.Unwrap(File.ReadAllText(Directory.GetFiles(Path.Combine(Local, "automation", "backups")).Single())));
        Assert.False(Manager.Status().Scripts[0].Installed); // new manager reads actual disk state
        Assert.True(Manager.Set("export", true).Scripts[0].Installed);
    }

    [Theory]
    [InlineData(true)]
    [InlineData(false)]
    public void Customized_script_is_not_overwritten_or_removed(bool enabled)
    {
        Directory.CreateDirectory(Path.Combine(Le, "lua", "autorun"));
        File.WriteAllText(Script("autorun"), "-- user version");
        Assert.NotNull(Manager.Status().Scripts[0].Problem);
        Assert.Throws<InvalidOperationException>(() => Manager.Set("export", enabled));
        Assert.Equal("-- user version", File.ReadAllText(Script("autorun")));
    }

    [Fact]
    public void Folder_selection_survives_reopen_preserves_settings_and_never_falls_back()
    {
        Directory.CreateDirectory(Local);
        File.WriteAllText(Path.Combine(Local, "settings.json"), "{\"exportDir\":\"elsewhere\",\"python\":\"python.exe\"}");
        var other = Path.Combine(temp, "other-le");
        Directory.CreateDirectory(Path.Combine(other, "lua"));
        Manager.ChooseFolder(other);
        Assert.Equal(other, Manager.Status().Folder);
        var settings = JsonSerializer.Deserialize<Dictionary<string, string>>(File.ReadAllText(Path.Combine(Local, "settings.json")))!;
        Assert.Equal("elsewhere", settings["exportDir"]);
        Assert.Equal("python.exe", settings["python"]);
        Directory.Delete(Path.Combine(other, "lua"));
        Assert.False(Manager.Status().Valid);
        Assert.Equal(other, Manager.Status().Folder);
        Assert.Throws<InvalidOperationException>(() => Manager.Set("export", true));
    }

    [Fact]
    public void Assets_are_manual_only_and_legacy_autorun_can_only_be_removed()
    {
        Manager.Set("assets", true);
        Assert.True(File.Exists(Script("scripts", "fc_assets.lua")));
        Assert.False(File.Exists(Script("autorun", "fc_assets.lua")));
        Assert.Throws<InvalidOperationException>(() => Manager.Set("legacyAssets", true));
        Directory.CreateDirectory(Path.Combine(Le, "lua", "autorun"));
        File.Copy(Path.Combine(Root, "exporter", "lua", "fc_assets.lua"), Script("autorun", "fc_assets.lua"));
        Manager.Set("legacyAssets", false);
        Assert.False(File.Exists(Script("autorun", "fc_assets.lua")));
        Assert.True(File.Exists(Script("scripts", "fc_assets.lua")));
        Manager.Set("assets", false);
        Assert.False(File.Exists(Script("scripts", "fc_assets.lua")));
    }

    [Fact]
    public void Manual_export_disables_all_hooks_and_preserves_original_and_autorun_setting()
    {
        Manager.Set("export", true);
        var enabled = Manager.Set("manualExport", true).Scripts.Single(s => s.Id == "manualExport");
        Assert.True(enabled.Matches);
        var content = ScriptLogging.Unwrap(File.ReadAllText(Script("scripts", "fc_export_manual.lua")));
        Assert.DoesNotContain("= true,", content);
        Assert.Contains("AUTO_DAILY = false,", content);
        Assert.Contains("ENABLE_EVENT_LOG = false,", content);
        Assert.Contains("AUTO_SNAPSHOT_ON_MONTH = false,", content);
        Assert.Contains("AUTO_SESSION_SNAPSHOT = false,", content);
        Assert.Equal(Export, File.ReadAllText(Path.Combine(Root, "exporter", "lua", "fc_export.lua")));
        Assert.True(File.Exists(Script("autorun")));
        Manager.Set("export", false);
        Assert.True(Manager.Status().Scripts.Single(s => s.Id == "manualExport").Matches);
        Manager.Set("manualExport", false);
        Assert.False(File.Exists(Script("scripts", "fc_export_manual.lua")));
    }

    [Fact]
    public void Manual_export_refuses_changed_configuration_and_customized_installed_script()
    {
        Manager.Set("manualExport", true);
        var target = Script("scripts", "fc_export_manual.lua");
        File.AppendAllText(target, "-- user version");
        Assert.Throws<InvalidOperationException>(() => Manager.Set("manualExport", false));
        Assert.EndsWith("-- user version", File.ReadAllText(target));
        File.WriteAllText(Path.Combine(Root, "exporter", "lua", "fc_export.lua"), "-- incompatible version");
        Assert.False(Manager.Status().Scripts.Single(s => s.Id == "manualExport").Bundled);
        Assert.Throws<InvalidOperationException>(() => Manager.Set("manualExport", true));
        Assert.EndsWith("-- user version", File.ReadAllText(target));
    }

    [Fact]
    public void Recognized_plain_script_can_upgrade_logging_with_backup_and_without_changing_its_body()
    {
        Directory.CreateDirectory(Path.Combine(Le, "lua", "scripts"));
        File.WriteAllText(Script("scripts", "fc_assets.lua"), "-- bundled assets");
        Assert.False(Manager.Status().Scripts.Single(s => s.Id == "assets").Logged);
        var state = Manager.Set("assets", true).Scripts.Single(s => s.Id == "assets");
        Assert.True(state.Logged);
        Assert.True(state.Matches);
        Assert.Equal("-- bundled assets", ScriptLogging.Unwrap(File.ReadAllText(state.Path!)));
        Assert.Equal("-- bundled assets", File.ReadAllText(Directory.GetFiles(Path.Combine(Local, "automation", "backups")).Single()));
    }

    [Theory]
    [InlineData("../other")]
    [InlineData("fc_clone_player.lua")]
    public void Arbitrary_scripts_are_rejected(string id) => Assert.Throws<InvalidOperationException>(() => Manager.Set(id, true));

    [Fact]
    public void Invalid_folder_and_missing_package_are_reported_without_writes()
    {
        Assert.Throws<InvalidOperationException>(() => Manager.ChooseFolder(temp));
        File.Delete(Path.Combine(Root, "exporter", "lua", "fc_export.lua"));
        Assert.False(Manager.Status().Scripts[0].Bundled);
        Assert.Throws<InvalidOperationException>(() => Manager.Set("export", true));
        Assert.False(File.Exists(Script("autorun")));
    }

    public void Dispose() => Directory.Delete(temp, recursive: true);
}
