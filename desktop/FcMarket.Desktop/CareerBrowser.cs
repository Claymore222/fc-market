using System.Diagnostics;
using System.Text.Json;
using Microsoft.Web.WebView2.Core;
using Microsoft.Web.WebView2.WinForms;

namespace FcMarket.Desktop;

/// <summary>Owns only the UI runtime. Recoveries never restart importers, alter saves or clear the WebView profile.</summary>
sealed class CareerBrowser : UserControl
{
    readonly Uri origin;
    readonly string profile;
    readonly Action<string, string> log;
    readonly BrowserRecoveryPolicy policy = new();
    readonly Panel notice = new() { Dock = DockStyle.Fill, BackColor = Color.FromArgb(16, 28, 46) };
    readonly Label text = new() { Dock = DockStyle.Fill, TextAlign = ContentAlignment.MiddleCenter, ForeColor = Color.FromArgb(216, 229, 245), Padding = new Padding(24) };
    readonly Button retry = new() { Text = "Ekranı yeniden aç", Dock = DockStyle.Bottom, Height = 48, Visible = false, FlatStyle = FlatStyle.Flat, ForeColor = Color.FromArgb(216, 229, 245), BackColor = Color.FromArgb(32, 55, 80) };
    readonly CancellationTokenSource lifetime = new();
    WebView2? view;
    CoreWebView2Environment? environment;
    string address;
    readonly bool softwareRendering;
    bool creating;
    bool closed;
    bool inCareer;
    public void SetInCareer(bool value) => inCareer = value;
    public event Func<string, Task>? MessageReceived;
    /// <summary>The page opened or a retry notice is on screen; the startup screen must not cover either.</summary>
    public event Action? Settled;

    public CareerBrowser(Uri origin, string profile, Action<string, string> log)
    {
        this.origin = origin; this.profile = profile; this.log = log; address = origin.ToString();
        Dock = DockStyle.Fill;
        BackColor = Color.FromArgb(16, 28, 46);
        var processes = Process.GetProcessesByName("RTSS");
        softwareRendering = BrowserRecoveryPolicy.SoftwareRendering(processes.Length > 0, Environment.GetEnvironmentVariable("FC_MARKET_RENDERING"));
        foreach (var process in processes) process.Dispose();
        notice.Controls.Add(text); notice.Controls.Add(retry); Controls.Add(notice);
        retry.Click += async (_, _) => await RecoverAsync("user retry", manual: true);
    }
    public async Task StartAsync() => await CreateAsync();
    public void Post(object message)
    {
        try { view?.CoreWebView2?.PostWebMessageAsJson(JsonSerializer.Serialize(message, new JsonSerializerOptions { PropertyNamingPolicy = JsonNamingPolicy.CamelCase })); }
        catch (Exception ex) when (ex is InvalidOperationException or System.Runtime.InteropServices.COMException)
        { log("webview", "POST FAILED " + ex.Message); }
    }
    void ShowNotice(string message, bool canRetry)
    {
        if (IsDisposed || lifetime.IsCancellationRequested) return;
        text.Text = message; retry.Visible = canRetry; retry.Enabled = canRetry;
        notice.Visible = true; notice.BringToFront();
        if (canRetry) Settled?.Invoke();
    }
    async Task CreateAsync()
    {
        creating = true;
        try
        {
            ShowNotice("FC MARKET\nEkran hazırlanıyor…", false);
            var old = view; view = null; environment = null;
            if (old is not null) { Controls.Remove(old); old.Dispose(); }
            var next = new WebView2 { Dock = DockStyle.Fill, DefaultBackgroundColor = Color.FromArgb(16, 28, 46) };
            view = next; Controls.Add(next); notice.BringToFront();
            var options = new CoreWebView2EnvironmentOptions(softwareRendering ? "--disable-gpu" : "");
            var env = await CoreWebView2Environment.CreateAsync(userDataFolder: profile, options: options);
            if (lifetime.IsCancellationRequested) return;
            environment = env;
            env.BrowserProcessExited += (_, e) =>
            {
                if (!ReferenceEquals(environment, env) || lifetime.IsCancellationRequested) return;
                log("webview", $"BROWSER EXIT pid={e.BrowserProcessId} kind={e.BrowserProcessExitKind}");
                if (e.BrowserProcessExitKind == CoreWebView2BrowserProcessExitKind.Failed)
                    BeginInvoke((Action)(() => _ = RecoverAsync("browser exited")));
            };
            await next.EnsureCoreWebView2Async(env);
            if (lifetime.IsCancellationRequested || !ReferenceEquals(view, next)) return;
            var core = next.CoreWebView2;
            core.Settings.AreDefaultContextMenusEnabled = false;
            core.NewWindowRequested += (_, e) => e.Handled = true;
            core.NavigationStarting += (_, e) => { if (!BrowserRecoveryPolicy.Allowed(e.Uri, origin)) e.Cancel = true; };
            core.SourceChanged += (_, _) => { if (BrowserRecoveryPolicy.Allowed(core.Source, origin)) address = core.Source; };
            core.ProcessFailed += (_, e) =>
            {
                if (!ReferenceEquals(view, next) || lifetime.IsCancellationRequested) return;
                log("webview", $"PROCESS FAILED kind={e.ProcessFailedKind} reason={e.Reason} exit={e.ExitCode} module={e.FailureSourceModulePath} description={e.ProcessDescription} url={address}");
                switch (e.ProcessFailedKind)
                {
                    // Wait for BrowserProcessExited: it guarantees runtime resources were released.
                    case CoreWebView2ProcessFailedKind.BrowserProcessExited:
                        ShowNotice("Görüntü motoru kapandı. Ekran yeniden hazırlanıyor…", true); break;
                    case CoreWebView2ProcessFailedKind.RenderProcessExited:
                        BeginInvoke((Action)(() => _ = RecoverAsync("renderer exited"))); break;
                    case CoreWebView2ProcessFailedKind.RenderProcessUnresponsive:
                        ShowNotice("Ekran yanıt vermiyor. İstersen ekranı yeniden açabilirsin.\nKaydedilmemiş form değişiklikleri yenilenebilir.", true); break;
                    // GPU and utility failures normally recover inside WebView2; log without a reload loop.
                }
            };
            core.NavigationCompleted += (_, e) =>
            {
                if (!ReferenceEquals(view, next) || lifetime.IsCancellationRequested) return;
                if (e.IsSuccess) { if (inCareer) Post(new { type = "resumeCareer" }); notice.Visible = false; Settled?.Invoke(); log("webview", "NAVIGATION OK " + address); }
                else { log("webview", "NAVIGATION FAILED " + e.WebErrorStatus); ShowNotice("Ekran yüklenemedi. Yerel sunucu hazır olduğunda yeniden deneyebilirsin.", true); }
            };
            core.WebMessageReceived += async (_, e) =>
            {
                if (!BrowserRecoveryPolicy.Allowed(e.Source, origin) || !ReferenceEquals(view, next)) return;
                try
                {
                    using var message = JsonDocument.Parse(e.WebMessageAsJson);
                    if (message.RootElement.TryGetProperty("type", out var type) && type.GetString() == "uiError")
                        log("ui", e.WebMessageAsJson[..Math.Min(e.WebMessageAsJson.Length, 16000)]);
                    else if (MessageReceived is { } received) await received(e.WebMessageAsJson);
                }
                catch (Exception ex) when (ex is JsonException or InvalidOperationException or System.Runtime.InteropServices.COMException)
                { log("webview", "MESSAGE FAILED " + ex.Message); }
            };
            if (inCareer) await core.AddScriptToExecuteOnDocumentCreatedAsync("window.__fcmEntered = true;");
            log("webview", $"CREATED runtime={env.BrowserVersionString} rendering={(softwareRendering ? "software" : "hardware")} profile={profile}");
            core.Navigate(BrowserRecoveryPolicy.Allowed(address, origin) ? address : origin.ToString());
        }
        finally { creating = false; }
    }
    async Task RecoverAsync(string reason, bool manual = false)
    {
        if (lifetime.IsCancellationRequested || creating) return;
        if (!policy.TryBegin(manual, DateTimeOffset.UtcNow))
        {
            if (!policy.Recovering) ShowNotice("Görüntü motoru tekrar kapandı. Ekranı yeniden deneyebilirsin.\nKaydedilmiş kariyer verileri korunuyor.", true);
            return;
        }
        log("webview", "RECOVER " + reason);
        try { await CreateAsync(); }
        catch (Exception ex)
        {
            if (!lifetime.IsCancellationRequested) { log("webview", "RECOVERY FAILED " + ex); ShowNotice("Ekran yeniden açılamadı. Tekrar deneyebilirsin.\nKaydedilmiş veriler korunuyor.", true); }
        }
        finally { policy.Complete(); }
    }
    protected override void Dispose(bool disposing)
    {
        if (disposing && !closed) { closed = true; lifetime.Cancel(); environment = null; view?.Dispose(); lifetime.Dispose(); }
        base.Dispose(disposing);
    }
}
