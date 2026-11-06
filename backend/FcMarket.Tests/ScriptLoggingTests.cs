using System.Text;
using FcMarket.Desktop;

namespace FcMarket.Tests;

public sealed class ScriptLoggingTests : IDisposable
{
    readonly string temp = Path.Combine(Path.GetTempPath(), "fcm-logs-" + Guid.NewGuid().ToString("N"));

    [Fact]
    public void Wrapper_preserves_body_settings_and_library_returns_and_is_idempotent()
    {
        const string body = "-- özel ayarlar\r\nlocal DRY_RUN = false\r\nreturn { value = 3 }\r\n";
        var bytes = ScriptLogging.Wrap(TestConfig.RepoRoot, "fcm_common", body, temp);
        var logged = Encoding.UTF8.GetString(bytes);
        Assert.Equal(body, ScriptLogging.Unwrap(logged));
        Assert.Equal(bytes, ScriptLogging.Wrap(TestConfig.RepoRoot, "fcm_common", logged, temp));
        Assert.Contains("CALLBACK_ERROR", logged);
        Assert.Contains("table.unpack(__fcm_result, 2", logged);
        Assert.Contains("true)", logged); // library output can follow its calling script
    }

    [Fact]
    public void Edited_bodies_are_never_silently_unwrapped_or_overwritten()
    {
        var logged = Encoding.UTF8.GetString(ScriptLogging.Wrap(TestConfig.RepoRoot, "fc_assets", "print('original')", temp));
        Assert.Throws<InvalidOperationException>(() => ScriptLogging.Unwrap(logged.Replace("print('original')", "print('edited')")));
        Assert.Throws<ArgumentException>(() => ScriptLogging.Wrap(TestConfig.RepoRoot, "../other", "", temp));
    }

    [Fact]
    public void Component_logs_are_separate_utf8_files_and_append_concurrent_messages()
    {
        var logs = new AppLogs(temp);
        Parallel.For(0, 25, i => logs.Write("saveimport", "satır " + i));
        logs.Write("assets", "Türkçe yüz: çğıöşü");
        Assert.Equal(25, File.ReadAllLines(logs.FileFor("saveimport")).Length);
        Assert.Contains("Türkçe yüz: çğıöşü", File.ReadAllText(logs.FileFor("assets")));
        Assert.NotEqual(logs.FileFor("assets"), logs.FileFor("saveimport"));
        Assert.Throws<ArgumentException>(() => logs.Write("../bad", "no"));
    }

    public void Dispose() { if (Directory.Exists(temp)) Directory.Delete(temp, recursive: true); }
}
