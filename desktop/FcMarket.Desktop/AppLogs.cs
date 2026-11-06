using System.Text.RegularExpressions;

namespace FcMarket.Desktop;

sealed class AppLogs(string exportDir)
{
    readonly object gate = new();
    readonly string run = DateTime.UtcNow.ToString("yyyyMMdd_HHmmss_fffffff") + "_" + Environment.ProcessId;
    public string FileFor(string component)
    {
        if (!Regex.IsMatch(component, @"^[A-Za-z0-9_-]+$")) throw new ArgumentException("Geçersiz log bileşeni.");
        return Path.Combine(exportDir, "logs", "app", component, run + ".log");
    }
    public void Write(string component, string message)
    {
        lock (gate)
        {
            var path = FileFor(component);
            Directory.CreateDirectory(Path.GetDirectoryName(path)!);
            File.AppendAllText(path, $"{DateTimeOffset.UtcNow:O} [{component}] {message}{Environment.NewLine}");
        }
    }
}
