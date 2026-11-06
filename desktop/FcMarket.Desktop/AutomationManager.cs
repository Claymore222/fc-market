using System.Security.Cryptography;
using System.Text;
using System.Text.Json;
using System.Text.RegularExpressions;

namespace FcMarket.Desktop;

// Only bundled, read-only scripts (and the manual export variant) are allowed.
sealed class AutomationManager(string root, string localData, string[]? candidates = null, string exportDirectory = @"C:\FCExport")
{
    readonly string settingsPath = Path.Combine(localData, "settings.json");
    readonly string schedulePath = Path.Combine(exportDirectory, "export_schedule.txt");
    const string DefaultSchedule = "monthly";
    static readonly string[] Schedules = ["daily", "weekly", "monthly", "quarterly"];
    static readonly (string Id, string File, string Folder)[] Scripts =
        [("export", "fc_export.lua", "autorun"), ("assets", "fc_assets.lua", "scripts"), ("legacyAssets", "fc_assets.lua", "autorun"),
         ("manualExport", "fc_export_manual.lua", "scripts")];

    byte[] PlainBytes(string id, string file)
    {
        var source = Path.Combine(root, "exporter", "lua", id == "manualExport" ? "fc_export.lua" : file);
        if (id != "manualExport") return File.ReadAllBytes(source);
        // Keep exporter/ untouched. Fail closed if its configuration changes in a later version.
        var content = File.ReadAllText(source);
        foreach (var flag in new[] { "ENABLE_EVENT_LOG", "AUTO_SNAPSHOT_ON_MONTH", "AUTO_DAILY", "AUTO_SESSION_SNAPSHOT" })
        {
            var pattern = new Regex(@"(?m)^([\t ]*" + flag + @"[\t ]*=[\t ]*)(?:true|false)([\t ]*,)");
            if (pattern.Matches(content).Count != 1)
                throw new InvalidOperationException("Manuel export hazırlanamadı; paket script ayarları değişmiş: " + flag);
            content = pattern.Replace(content, m => m.Groups[1].Value + "false" + m.Groups[2].Value);
        }
        return Encoding.UTF8.GetBytes("-- FC Market: MANUEL EXPORT. Yalnız şimdi snapshot alır; event/gün/ay/oturum otomasyonu kapalı.\n" + content);
    }

    byte[] ScriptBytes(string id, string file) => ScriptLogging.Wrap(root, Path.GetFileNameWithoutExtension(file),
        Encoding.UTF8.GetString(PlainBytes(id, file)), exportDirectory);

    Dictionary<string, string> Settings() => File.Exists(settingsPath)
        ? JsonSerializer.Deserialize<Dictionary<string, string>>(File.ReadAllText(settingsPath).TrimStart('\uFEFF')) ?? [] : [];

    string Schedule()
    {
        var saved = File.Exists(schedulePath) ? File.ReadLines(schedulePath).FirstOrDefault()?.Trim() : null;
        return saved is not null && Schedules.Contains(saved) ? saved : DefaultSchedule;
    }

    /// <summary>The running script reads this file every game day, so a change needs no reinstall or game restart.</summary>
    public AutomationStatus SetSchedule(string mode)
    {
        if (!Schedules.Contains(mode)) throw new InvalidOperationException("Geçersiz export sıklığı.");
        Directory.CreateDirectory(exportDirectory);
        var temp = schedulePath + ".tmp";
        File.WriteAllText(temp, mode + "\n");
        File.Move(temp, schedulePath, overwrite: true);
        return Status();
    }

    /// <summary>LE runs autorun scripts from its data folder, which can differ from the install; only its own log names that folder.</summary>
    static string AutorunRoot(string install)
    {
        var logs = Path.Combine(install, "Logs");
        var latest = Directory.Exists(logs) ? new DirectoryInfo(logs).GetFiles("live_editor_*.log")
            .Where(f => !f.Name.StartsWith("live_editor_launcher")).MaxBy(f => f.LastWriteTimeUtc) : null;
        if (latest is null) return install;
        using var stream = new FileStream(latest.FullName, FileMode.Open, FileAccess.Read, FileShare.ReadWrite | FileShare.Delete);
        using var reader = new StreamReader(stream);
        for (var i = 0; i < 20 && reader.ReadLine() is { } line; i++)
            if (Regex.Match(line, @"Load Config From (.+)[\\/]le_config\.json") is { Success: true } m)
                return Directory.Exists(m.Groups[1].Value.Trim()) ? Path.GetFullPath(m.Groups[1].Value.Trim()) : install;
        return install;
    }

    public AutomationStatus Status()
    {
        var selected = Settings().GetValueOrDefault("liveEditorDir");
        var found = (candidates ?? [@"C:\FC 27 Live Editor", @"C:\FC 27 LE v27.1.6"])
            .Where(p => Directory.Exists(Path.Combine(p, "lua"))).Select(Path.GetFullPath).ToArray();
        // A saved folder is authoritative, including when disconnected/missing. Never silently switch installations.
        selected ??= found.FirstOrDefault();
        var valid = selected is not null && Directory.Exists(Path.Combine(selected, "lua"));
        var states = Scripts.Select(s =>
        {
            var target = selected is null ? null : Path.Combine(s.Folder == "autorun" && valid ? AutorunRoot(selected) : selected, "lua", s.Folder, s.File);
            var exists = target is not null && File.Exists(target);
            byte[]? expected = null;
            string? problem = null;
            try { expected = ScriptBytes(s.Id, s.File); }
            catch (Exception ex) when (ex is IOException or InvalidOperationException) { problem = ex.Message; }
            var bundled = expected is not null;
            var matches = exists && bundled && (Hash(target!) == Hash(expected!) || Hash(target!) == Hash(PlainBytes(s.Id, s.File)));
            return new AutomationScript(s.Id, target, exists, matches, bundled,
                problem ?? (exists && !matches ? "Dosya paket sürümünden farklı; otomatik değiştirilmez." : null),
                exists && File.ReadAllText(target!).StartsWith("-- FC_MARKET_LOGGING_V1\n"));
        }).ToArray();
        return new(selected, valid, found, states, Path.Combine(exportDirectory, "logs"), Schedule());
    }

    public AutomationStatus ChooseFolder(string folder)
    {
        folder = Path.GetFullPath(folder);
        if (!Directory.Exists(Path.Combine(folder, "lua")))
            throw new InvalidOperationException("Live Editor ana klasörünü seç; içinde lua klasörü bulunmalı.");
        EnsureRegularDirectory(folder);
        EnsureRegularDirectory(Path.Combine(folder, "lua"));
        var settings = Settings();
        settings["liveEditorDir"] = folder;
        Directory.CreateDirectory(localData);
        var temp = settingsPath + ".tmp";
        File.WriteAllText(temp, JsonSerializer.Serialize(settings, new JsonSerializerOptions { WriteIndented = true }));
        File.Move(temp, settingsPath, overwrite: true);
        return Status();
    }

    public AutomationStatus Set(string id, bool enabled)
    {
        var script = Scripts.SingleOrDefault(s => s.Id == id);
        if (script == default || (id == "legacyAssets" && enabled))
            throw new InvalidOperationException("Bu script işlemi desteklenmiyor.");
        var state = Status();
        if (!state.Valid || state.Folder is null) throw new InvalidOperationException("Önce Live Editor klasörünü seç.");
        var current = state.Scripts.Single(s => s.Id == id);
        if (!current.Bundled) throw new InvalidOperationException("Paket script'i eksik. Uygulamayı yeniden kur.");
        if (current.Installed && !current.Matches) throw new InvalidOperationException(current.Problem);
        var expected = ScriptBytes(id, script.File);
        var plain = PlainBytes(id, script.File);
        var target = current.Path!;
        var dir = Path.GetDirectoryName(target)!;
        var lua = Path.GetDirectoryName(dir)!;
        EnsureRegularDirectory(state.Folder);
        EnsureRegularDirectory(Path.GetDirectoryName(lua)!);
        if (Directory.Exists(lua)) EnsureRegularDirectory(lua);
        if (Directory.Exists(dir)) EnsureRegularDirectory(dir);
        if (File.Exists(target) && (File.GetAttributes(target) & FileAttributes.ReparsePoint) != 0)
            throw new InvalidOperationException("Bağlantı dosyası değiştirilemez.");
        // An explicit install may upgrade a recognized older, unlogged copy. Back up both upgrades and removals.
        if (current.Installed && (!enabled || Hash(target) != Hash(expected)))
        {
            var backup = Path.Combine(localData, "automation", "backups");
            Directory.CreateDirectory(backup);
            var destination = Path.Combine(backup, $"{id}-{Guid.NewGuid():N}-{script.File}");
            File.Copy(target, destination, overwrite: false);
            if ((Hash(destination) != Hash(expected) && Hash(destination) != Hash(plain)) || Hash(target) != Hash(destination))
                throw new IOException("Script değişti; korunuyor. Yeniden dene.");
        }
        if (enabled && (!current.Installed || Hash(target) != Hash(expected)))
        {
            ScriptLogging.Prepare(exportDirectory, Path.GetFileNameWithoutExtension(script.File));
            Directory.CreateDirectory(dir);
            // Publish the complete file atomically. Never leave a half-written Lua script in autorun.
            var temp = Path.Combine(dir, $".fc-market-{Guid.NewGuid():N}.tmp");
            try
            {
                File.WriteAllBytes(temp, expected);
                File.Move(temp, target, overwrite: current.Installed);
            }
            finally { if (File.Exists(temp)) File.Delete(temp); }
        }
        else if (!enabled && current.Installed)
        {
            File.Delete(target);
        }
        return Status();
    }

    static string Hash(string path) => Convert.ToHexString(SHA256.HashData(File.ReadAllBytes(path)));
    static string Hash(byte[] bytes) => Convert.ToHexString(SHA256.HashData(bytes));
    static void EnsureRegularDirectory(string path)
    {
        // Check ancestors too: a redirected LE root must not make us write into another folder.
        for (var dir = new DirectoryInfo(path); dir is not null; dir = dir.Parent)
            if ((dir.Attributes & FileAttributes.ReparsePoint) != 0)
                throw new InvalidOperationException("Bağlantı klasörü kullanılamaz; Live Editor'ün gerçek klasörünü seç.");
    }
}

sealed record AutomationStatus(string? Folder, bool Valid, string[] Candidates, AutomationScript[] Scripts, string? LogDirectory = null, string Schedule = "monthly");
sealed record AutomationScript(string Id, string? Path, bool Installed, bool Matches, bool Bundled, string? Problem, bool Logged = false);
