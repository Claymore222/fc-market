using System.Text;
using System.Text.RegularExpressions;
using FcMarket.Desktop;

var root = Path.GetFullPath(args[0]);
var exportDir = Path.GetFullPath(args[1]);
var installations = args.Skip(2).Select(Path.GetFullPath).ToArray();
if (installations.Length == 0) throw new ArgumentException("Live Editor klasörü gerekli.");
var stamp = DateTime.UtcNow.ToString("yyyyMMdd-HHmmss-fffffff");
var backups = Environment.GetEnvironmentVariable("FC_SCRIPT_BACKUPS") ?? Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData), "FcMarket", "automation", "backups", "logging-" + stamp);
var setupDir = Path.Combine(exportDir, "logs", "setup");
Directory.CreateDirectory(setupDir);
foreach (var component in new[] { "desktop", "api", "saveimport", "assets" })
    Directory.CreateDirectory(Path.Combine(exportDir, "logs", "app", component));
var setupLog = Path.Combine(setupDir, stamp + ".log");
File.AppendAllText(setupLog, $"{DateTimeOffset.UtcNow:O} START script log setup\n", Encoding.UTF8);
var count = 0;
foreach (var installation in installations)
foreach (var folder in new[] { "scripts", "autorun" })
{
    var lua = Path.Combine(installation, "lua", folder);
    if (!Directory.Exists(lua)) continue;
    foreach (var path in Directory.EnumerateFiles(lua, "*.lua", SearchOption.AllDirectories))
    {
        var name = Path.GetFileNameWithoutExtension(path);
        if (!Regex.IsMatch(name, @"^(fc_|fcm_|m0_|le_capabilities$|cm_event_logger$)")) continue;
        for (var parent = new FileInfo(path).Directory; parent is not null; parent = parent.Parent)
            if ((parent.Attributes & FileAttributes.ReparsePoint) != 0) throw new IOException("Bağlantı klasörü korunuyor: " + parent.FullName);
        if ((File.GetAttributes(path) & FileAttributes.ReparsePoint) != 0) throw new IOException("Bağlantı dosyası korunuyor: " + path);
        var existing = File.ReadAllBytes(path);
        var body = ScriptLogging.Unwrap(File.ReadAllText(path));
        var content = ScriptLogging.Wrap(root, name, body, exportDir);
        ScriptLogging.Prepare(exportDir, name);
        if (existing.SequenceEqual(content)) continue;
        var backup = Path.Combine(backups, Path.GetFileName(installation), folder, Path.GetRelativePath(lua, path) + ".bak");
        Directory.CreateDirectory(Path.GetDirectoryName(backup)!);
        File.Copy(path, backup, overwrite: false);
        if (!File.ReadAllBytes(backup).SequenceEqual(existing) || !File.ReadAllBytes(path).SequenceEqual(existing))
            throw new IOException("Script değişti; korunuyor: " + path);
        var temp = path + ".fcmarket-" + Guid.NewGuid().ToString("N") + ".tmp";
        try { File.WriteAllBytes(temp, content); File.Move(temp, path, overwrite: true); }
        finally { if (File.Exists(temp)) File.Delete(temp); }
        File.AppendAllText(setupLog, $"{DateTimeOffset.UtcNow:O} INSTALLED {path} BACKUP {backup}\n", Encoding.UTF8);
        count++;
    }
}
Console.WriteLine($"Updated={count}; log={setupLog}; backups={backups}");
File.AppendAllText(setupLog, $"{DateTimeOffset.UtcNow:O} END updated={count}\n", Encoding.UTF8);
