using FcMarket.Desktop;

namespace FcMarket.Tests;

public sealed class UninstallerTests : IDisposable
{
    const string Export = "-- bundled export\nlocal CONFIG = {\n ENABLE_EVENT_LOG = true,\n AUTO_SNAPSHOT_ON_MONTH = true,\n AUTO_DAILY = true,\n AUTO_SESSION_SNAPSHOT = true,\n}\n";
    readonly string temp = Path.Combine(Path.GetTempPath(), "fcm-uninstall-" + Guid.NewGuid().ToString("N"));
    string Root => Path.Combine(temp, "app");
    string Local => Path.Combine(temp, "local");
    string Le => Path.Combine(temp, "le");
    string Exports => Path.Combine(temp, "exports");
    AutomationManager Manager => new(Root, Local, [Le], Exports);

    public UninstallerTests()
    {
        Directory.CreateDirectory(Path.Combine(Root, "exporter", "lua"));
        Directory.CreateDirectory(Path.Combine(Le, "lua"));
        Directory.CreateDirectory(Path.Combine(Root, "tools", "scriptlogging"));
        File.Copy(Path.Combine(TestConfig.RepoRoot, "tools", "scriptlogging", "fc_logging.lua"), Path.Combine(Root, "tools", "scriptlogging", "fc_logging.lua"));
        File.WriteAllText(Path.Combine(Root, "exporter", "lua", "fc_export.lua"), Export);
        File.WriteAllText(Path.Combine(Root, "exporter", "lua", "fc_assets.lua"), "-- bundled assets");
    }

    void Write(string path, string text = "x") { Directory.CreateDirectory(Path.GetDirectoryName(path)!); File.WriteAllText(path, text); }

    [Fact]
    public void Removes_our_live_editor_scripts_and_keeps_data_without_purge()
    {
        var export = Manager.Set("export", true).Scripts.Single(s => s.Id == "export").Path!;
        var assets = Manager.Set("assets", true).Scripts.Single(s => s.Id == "assets").Path!;
        File.WriteAllText(Path.Combine(Path.GetDirectoryName(export)!, "other.lua"), "keep");
        Write(Path.Combine(Exports, "fc_career.db"));
        var result = Uninstaller.Run(Manager, Local, Exports, purge: false);
        Assert.Equal([export, assets], result.RemovedScripts);
        Assert.False(File.Exists(export) || File.Exists(assets));
        Assert.Equal("keep", File.ReadAllText(Path.Combine(Path.GetDirectoryName(export)!, "other.lua")));
        Assert.True(File.Exists(Path.Combine(Exports, "fc_career.db")));
        Assert.True(Directory.Exists(Local));
        Assert.Empty(result.Failed);
    }

    [Fact]
    public void A_script_the_user_changed_is_kept()
    {
        var path = Path.Combine(Le, "lua", "autorun", "fc_export.lua");
        Write(path, "-- user version");
        var result = Uninstaller.Run(Manager, Local, Exports, purge: false);
        Assert.Equal([path], result.KeptScripts);
        Assert.Equal("-- user version", File.ReadAllText(path));
    }

    [Fact]
    public void Purge_deletes_what_fc_market_created_and_keeps_exports_and_saves()
    {
        Write(Path.Combine(Local, "app.db")); Write(Path.Combine(Local, "images", "faces", "1.png")); Write(Path.Combine(Local, "settings.json"), "{}");
        foreach (var f in new[] { "fc_career.db", "fc_career.db-wal", "fc_career.db-shm", "fc_career.db.lock", "watchlist.txt", "export_schedule.txt" })
            Write(Path.Combine(Exports, f));
        Write(Path.Combine(Exports, "logs", "app", "api", "run.log"));
        var csv = Path.Combine(Exports, "84af_20300717__players.csv"); Write(csv);
        var head = Path.Combine(Exports, "assets", "heads", "1.dds"); Write(head);
        var result = Uninstaller.Run(Manager, Local, Exports, purge: true);
        Assert.Empty(result.Failed);
        Assert.False(Directory.Exists(Local));
        Assert.False(Directory.Exists(Path.Combine(Exports, "logs")));
        Assert.Equal([csv, head], Directory.GetFiles(Exports, "*", SearchOption.AllDirectories).Order().ToArray());
    }

    public void Dispose() { if (Directory.Exists(temp)) Directory.Delete(temp, true); }
}
