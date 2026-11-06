using System.Diagnostics;
using System.Net;
using System.Reflection;
using System.Text.Json;
using System.Net.Sockets;

namespace FcMarket.Desktop;

static class Program
{
    [STAThread]
    static void Main(string[] args)
    {
        ApplicationConfiguration.Initialize();
        using var singleInstance = new Mutex(true, "Local\\FcMarket.Desktop", out var first);
        if (!first) { MessageBox.Show("FC Market zaten açık."); return; }
        var problem = "";
        var layout = args.Length == 3 ? AppLayout.Dev(args[0], args[1], args[2]) : AppLayout.Packaged(out problem);
        if (layout is null) { MessageBox.Show(problem, "FC Market"); return; }
        Application.Run(new MainWindow(layout));
    }
}

/// <summary>
/// Uygulamanın dosya düzeni. Geliştirme: start-desktop.ps1 repo kökü, export klasörü ve Python'u verir; veriler repo
/// içinde kalır. Paket (publish.ps1): kök exe'nin klasörü, API app/api'de; kullanıcı verisi (app.db, görseller, kayıt
/// yedekleri, ayarlar) %LOCALAPPDATA%\FcMarket'te, güncellemede korunur.
/// </summary>
sealed record AppLayout(string Root, string ExportDir, string Python, string ApiDll, string? DataDir)
{
    public static readonly string LocalData = Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData), "FcMarket");

    public static string Version => typeof(AppLayout).Assembly.GetCustomAttribute<AssemblyInformationalVersionAttribute>()?
        .InformationalVersion.Split('+')[0] ?? "0.0.0";

    public static AppLayout Dev(string root, string exportDir, string python) =>
        new(root, exportDir, python, Path.Combine(root, "backend/FcMarket.Api/bin/Release/net9.0/FcMarket.Api.dll"), null);

    /// <summary>settings.json (isteğe bağlı): { "exportDir": "C:\\FCExport", "python": "C:\\...\\python.exe" }.</summary>
    public static AppLayout? Packaged(out string problem)
    {
        var root = AppContext.BaseDirectory.TrimEnd(Path.DirectorySeparatorChar);
        // Release paketi API'yi kendi .NET'iyle (self-contained exe) taşır; eski paketler dll + kurulu .NET.
        var api = Path.Combine(root, "app", "api", "FcMarket.Api.exe");
        if (!File.Exists(api)) api = Path.ChangeExtension(api, ".dll");
        problem = "";
        if (!File.Exists(api)) { problem = $"Uygulama dosyaları eksik: {api}\nPaketi yeniden indirip açın."; return null; }
        Dictionary<string, string>? settings = null;
        var settingsPath = Path.Combine(LocalData, "settings.json");
        try { if (File.Exists(settingsPath)) settings = JsonSerializer.Deserialize<Dictionary<string, string>>(File.ReadAllText(settingsPath).TrimStart('\uFEFF')); }
        catch (JsonException) { problem = $"Ayar dosyası okunamadı: {settingsPath}"; return null; }
        var exportDir = settings?.GetValueOrDefault("exportDir") ?? @"C:\FCExport";
        var bundled = Path.Combine(root, "app", "python", "python.exe");
        var python = settings?.GetValueOrDefault("python") ?? (File.Exists(bundled) ? bundled : FindPython());
        if (python is null) { problem = "Python 3.14 bulunamadı. python.org'dan kurun ya da settings.json'a \"python\" yolunu yazın."; return null; }
        // Varsayılan export klasörü ilk açılışta kurulur (Lua klasör oluşturamaz); elle verilen klasör kullanıcınındır.
        if (!settings?.ContainsKey("exportDir") ?? true)
            foreach (var dir in ExportFolders) Directory.CreateDirectory(Path.Combine(exportDir, dir));
        if (!Directory.Exists(exportDir)) { problem = $"Export klasörü yok: {exportDir}\nKlasörü oluşturun ya da settings.json'a \"exportDir\" yazın."; return null; }
        return new AppLayout(root, exportDir, python, api, LocalData);
    }

    static readonly string[] ExportFolders = ["", "assets", @"assets\heads", @"assets\crests", @"assets\flags", @"assets\playstyles", @"assets\trophies", @"assets\leagues"];

    /// <summary>PATH'teki gerçek python.exe (Microsoft Store kısayolu WindowsApps hariç), yoksa py başlatıcısı.</summary>
    static string? FindPython()
    {
        var dirs = (Environment.GetEnvironmentVariable("PATH") ?? "").Split(Path.PathSeparator, StringSplitOptions.RemoveEmptyEntries);
        foreach (var name in new[] { "python.exe", "py.exe" })
            foreach (var dir in dirs)
            {
                var candidate = Path.Combine(dir.Trim(), name);
                if (!dir.Contains("WindowsApps", StringComparison.OrdinalIgnoreCase) && File.Exists(candidate)) return candidate;
            }
        return null;
    }
}

sealed class MainWindow : Form
{
    readonly CareerBrowser browser;
    readonly LoadingScreen status = new();
    readonly CancellationTokenSource lifetime = new();
    readonly List<Process> children = [];
    readonly AppLayout layout;
    readonly string root, exportDir, python;
    readonly string logPath = Path.Combine(AppLayout.LocalData, "desktop.log");
    readonly object logLock = new();
    readonly AppLogs logs;
    // Oyunun kayıt klasörü ve kullanıcının "Kayıt dosyası ekle" ile seçtiği dosyalar (başka klasör, başka bilgisayardan kopya).
    readonly string gameSaves = Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData), "EA SPORTS FC 27", "settings");
    readonly string addedSavesPath = Path.Combine(AppLayout.LocalData, "added-saves.json");
    Process? watcher;
    AutomationManager Automation => new(root, AppLayout.LocalData, exportDirectory: exportDir);
    // Açılışta kariyer seçimi küçük dikey pencerede; kariyere girince tam boy.
    static readonly Size LauncherSize = new(460, 900), CareerSize = new(1600, 1040);

    public MainWindow(AppLayout layout)
    {
        this.layout = layout; root = layout.Root; exportDir = layout.ExportDir; python = layout.Python;
        logs = new AppLogs(exportDir);
        browser = new CareerBrowser(new Uri("http://127.0.0.1:5127/"), Path.Combine(AppLayout.LocalData, "WebView2"), WriteLog);
        browser.MessageReceived += OnWebMessageAsync;
        browser.Settled += () => status.Visible = false;
        Text = $"FC Market {AppLayout.Version} · Career Companion";
        Icon = Icon.ExtractAssociatedIcon(Application.ExecutablePath);
        BackColor = Color.FromArgb(16, 28, 46);
        var workArea = Screen.FromPoint(Cursor.Position).WorkingArea;
        Size = new Size(Math.Min(LauncherSize.Width, workArea.Width), Math.Min(LauncherSize.Height, workArea.Height));
        MinimumSize = new Size(Math.Min(400, Size.Width), Math.Min(560, Size.Height));
        StartPosition = FormStartPosition.CenterScreen;
        // Durum yazısı (hazırlanıyor / hata) WebView'in üstünde olmalı; yoksa ikisi de Fill olduğundan siyah ekran görünür.
        Controls.Add(browser); Controls.Add(status);
        status.BringToFront();
        Shown += async (_, _) => await StartAsync();
        FormClosed += (_, _) => { lifetime.Cancel(); StopChildren(); WriteLog("desktop", "END FC Market"); browser.Dispose(); };
    }

    Process StartChild(string executable, params string[] args)
    {
        var info = new ProcessStartInfo(executable) { WorkingDirectory = root, UseShellExecute = false, CreateNoWindow = true, RedirectStandardOutput = true, RedirectStandardError = true };
        // ASP.NET loads appsettings.json relative to the content root (working directory).
        // The built API directory contains the copied configuration; repo root does not.
        var api = executable == "dotnet" || Path.GetFileName(executable).Equals("FcMarket.Api.exe", StringComparison.OrdinalIgnoreCase);
        if (api) info.WorkingDirectory = Path.GetDirectoryName(executable == "dotnet" ? args[0] : executable)!;
        foreach (var arg in args) info.ArgumentList.Add(arg);
        info.Environment["FC_CAREER_DB"] = Path.Combine(exportDir, "fc_career.db");
        info.Environment["FC_EXPORT_DIR"] = exportDir;
        info.Environment["FC_LOG_CAPTURED"] = "1";
        info.Environment["PYTHONIOENCODING"] = "utf-8";
        if (layout.DataDir is { } data)
        {
            // Paket: kullanıcı verisi kurulum klasörü dışında, güncellemede korunur.
            info.Environment["FC_APP_DB"] = Path.Combine(data, "app.db");
            info.Environment["FC_FACES_DIR"] = Path.Combine(data, "images", "faces");
            info.Environment["FC_CRESTS_DIR"] = Path.Combine(data, "images", "crests");
            info.Environment["FC_FLAGS_DIR"] = Path.Combine(data, "images", "flags");
            info.Environment["FC_TROPHIES_DIR"] = Path.Combine(data, "images", "trophies");
            info.Environment["FC_LEAGUE_LOGOS_DIR"] = Path.Combine(data, "images", "league-logos");
            info.Environment["FC_PLAYSTYLES_DIR"] = Path.Combine(data, "images", "playstyle-icons");
            info.Environment["FC_SAVE_BACKUPS_DIR"] = Path.Combine(data, "save-backups");
        }
        info.Environment["Server__Host"] = "127.0.0.1";
        info.Environment["Server__Port"] = "5127";
        var process = new Process { StartInfo = info };
        var component = api ? "api" : args.Contains("tools.assets") ? "assets" : "saveimport";
        WriteLog(component, "START " + Path.GetFileName(executable) + " " + string.Join(" ", args));
        DataReceivedEventHandler log = (_, e) => { if (e.Data != null) WriteLog(component, e.Data); };
        process.OutputDataReceived += log; process.ErrorDataReceived += log;
        process.EnableRaisingEvents = true;
        process.Exited += (_, _) => { try { WriteLog(component, "END exit_code=" + process.ExitCode); } catch (InvalidOperationException) { } };
        process.Start(); children.Add(process);
        process.BeginOutputReadLine(); process.BeginErrorReadLine();
        return process;
    }

    async Task StartAsync()
    {
        try
        {
            Directory.CreateDirectory(Path.GetDirectoryName(logPath)!);
            WriteLog("desktop", $"START FC Market {AppLayout.Version}");
            // Never attach to or terminate another application using this port.
            var probe = new TcpListener(IPAddress.Loopback, 5127);
            try { probe.Start(); } catch (SocketException) { throw new InvalidOperationException("5127 portu kullanımda. Önce açık FC Market sunucusunu kapatın."); }
            finally { probe.Stop(); }
            // Açılış içe aktarmayı beklemez: API son başarılı verilerle hemen açılır, izleyicinin ilk turu yeni ya da
            // değişen kayıtları arka planda aktarır (değişmeyenler atlanır). Sayfa /api/sync ile yeni veriyi kendisi alır.
            status.ShowStage("Veri servisi başlatılıyor…", "Kariyerler hazırlanıyor…");
            var backend = layout.ApiDll.EndsWith(".exe", StringComparison.OrdinalIgnoreCase)
                ? StartChild(layout.ApiDll) : StartChild("dotnet", layout.ApiDll);
            StartWatcher();
            using var http = new HttpClient { Timeout = TimeSpan.FromSeconds(2) };
            var ready = false;
            for (var attempt = 0; attempt < 90; attempt++)
            {
                lifetime.Token.ThrowIfCancellationRequested();
                if (backend.HasExited || watcher!.HasExited) throw new InvalidOperationException("Yerel veri servisi beklenmedik şekilde kapandı.");
                try { using var response = await http.GetAsync("http://127.0.0.1:5127/api/health", lifetime.Token); ready = response.IsSuccessStatusCode; }
                catch (HttpRequestException) { }
                catch (TaskCanceledException) when (!lifetime.IsCancellationRequested) { }
                if (ready) break;
                await Task.Delay(1000, lifetime.Token);
            }
            if (!ready) throw new TimeoutException("Yerel sunucu zamanında başlatılamadı.");
            lifetime.Token.ThrowIfCancellationRequested();
            status.ShowStage("Ekran hazırlanıyor…");
            await browser.StartAsync();
            _ = WatchAssetsAsync();
        }
        catch (OperationCanceledException) when (lifetime.IsCancellationRequested) { }
        catch (Exception ex)
        {
            WriteLog("desktop", "ERROR " + ex);
            StopChildren();
            if (!IsDisposed) status.ShowError($"FC Market başlatılamadı\n\n{ex.Message}\n\nAyrıntılar: {logPath}\nWebView2 Runtime kurulu olmalıdır.");
        }
    }

    string[] AddedSaves()
    {
        try { return File.Exists(addedSavesPath) ? JsonSerializer.Deserialize<string[]>(File.ReadAllText(addedSavesPath)) ?? [] : []; }
        catch (JsonException) { return []; }
    }

    /// <summary>İzlenecek kayıtlar: oyunun klasörü (varsa) ve elle eklenen, hâlâ duran dosyalar.</summary>
    // Keep missing paths too: a first career/save folder or a temporarily absent added file may appear later.
    string[] SaveSources() => [gameSaves, .. AddedSaves().Where(p => !string.IsNullOrWhiteSpace(p))];

    /// <summary>
    /// Kayıt varsa birleşik içe aktarıcı (kayıt + Live Editor export'u: tam, aylık ve günlük hafif); yoksa yalnız export.
    /// Kayıtlar salt-okunur kopyalanır, oyunun dosyasına yazılmaz.
    /// </summary>
    string[] ImportArgs(bool watch, string[] sources, bool includeExports = true)
    {
        var db = Path.Combine(exportDir, "fc_career.db");
        string[] backups = layout.DataDir is { } dataDir ? ["--backups", Path.Combine(dataDir, "save-backups")] : [];
        return ["-m", "tools.saveimport", watch ? "watch" : "import", .. sources, .. includeExports ? new[] { "--export-dir", exportDir } : [], "--db", db,
            .. watch ? new[] { "--interval", "10" } : [], .. backups];
    }

    void StartWatcher() => watcher = StartChild(python, ImportArgs(watch: true, SaveSources()));

    void StopWatcher()
    {
        if (watcher is null) return;
        try { if (!watcher.HasExited) watcher.Kill(entireProcessTree: true); }
        catch (InvalidOperationException) { }
        children.Remove(watcher);
        watcher = null;
    }

    /// <summary>Sayfadan gelen istekler: { type: "enterCareer" | "showLauncher" | "addSave" }.</summary>
    async Task OnWebMessageAsync(string json)
    {
        string? type;
        using var message = ParseMessage(json);
        if (message is null) return;
        try { type = message.RootElement.GetProperty("type").GetString(); }
        catch (Exception ex) when (ex is JsonException or KeyNotFoundException or InvalidOperationException) { return; }
        switch (type)
        {
            case "enterCareer": browser.SetInCareer(true); BeginInvoke(() => ResizeCentered(CareerSize, new Size(1024, 720))); break;
            case "showLauncher": browser.SetInCareer(false); BeginInvoke(() => ResizeCentered(LauncherSize, new Size(400, 560))); break;
            case "addSave": await AddSaveAsync(); break;
            case "automationStatus": case "automationFolder": case "automationSet": case "automationSchedule":
                AutomationMessage(type, message.RootElement); break;
        }
    }

    static JsonDocument? ParseMessage(string json)
    {
        try { return JsonDocument.Parse(json); } catch (JsonException) { return null; }
    }

    void AutomationMessage(string type, JsonElement message)
    {
        try
        {
            AutomationStatus state;
            if (type == "automationFolder")
            {
                using var dialog = new FolderBrowserDialog { Description = "Live Editor ana klasörünü seç (içinde lua bulunmalı)", UseDescriptionForTitle = true };
                state = dialog.ShowDialog(this) == DialogResult.OK
                    ? Automation.ChooseFolder(dialog.SelectedPath) : Automation.Status();
            }
            else if (type == "automationSet")
                state = Automation.Set(message.GetProperty("id").GetString() ?? "", message.GetProperty("enabled").GetBoolean());
            else if (type == "automationSchedule")
                state = Automation.SetSchedule(message.GetProperty("mode").GetString() ?? "");
            else state = Automation.Status();
            browser.Post(new { type = "automation", ok = true, state });
        }
        catch (Exception ex) when (ex is IOException or UnauthorizedAccessException or InvalidOperationException or JsonException or KeyNotFoundException or ArgumentException)
        { Post(new { type = "automation", ok = false, message = ex.Message }); }
    }

    void ResizeCentered(Size size, Size minimum)
    {
        if (IsDisposed) return;
        if (WindowState == FormWindowState.Maximized) WindowState = FormWindowState.Normal;
        var area = Screen.FromControl(this).WorkingArea;
        var target = new Size(Math.Min(size.Width, area.Width), Math.Min(size.Height, area.Height));
        var clampMin = new Size(Math.Min(minimum.Width, target.Width), Math.Min(minimum.Height, target.Height));
        if (clampMin.Width < MinimumSize.Width || clampMin.Height < MinimumSize.Height) MinimumSize = clampMin;
        Bounds = new Rectangle(area.Left + (area.Width - target.Width) / 2, area.Top + (area.Height - target.Height) / 2, target.Width, target.Height);
        MinimumSize = clampMin;
    }

    void Post(object message) => browser.Post(message);

    /// <summary>
    /// Kullanıcının seçtiği kayıt dosyasını (oyunun klasörü dışında da olabilir) bir kez içe aktarır ve sonraki
    /// açılışlarda izlenmesi için added-saves.json'a yazar. İçe aktarıcı veritabanını kilitlediği için izleyici bu sırada durur.
    /// </summary>
    async Task AddSaveAsync()
    {
        using var dialog = new OpenFileDialog
        {
            Title = "FC 27 kariyer kaydını seç",
            Filter = "Kariyer kaydı (CmMgrC…)|CmMgrC*|Tüm dosyalar|*.*",
            InitialDirectory = Directory.Exists(gameSaves) ? gameSaves : Environment.GetFolderPath(Environment.SpecialFolder.MyDocuments),
            CheckFileExists = true,
        };
        if (dialog.ShowDialog(this) != DialogResult.OK) { Post(new { type = "saveAdded", ok = false, cancelled = true }); return; }
        var file = dialog.FileName;
        Post(new { type = "saveAdding", file = Path.GetFileName(file) });
        StopWatcher();
        try
        {
            var import = StartChild(python, ImportArgs(watch: false, [file], includeExports: false));
            await import.WaitForExitAsync(lifetime.Token);
            if (import.ExitCode != 0)
            {
                Post(new { type = "saveAdded", ok = false, message = $"{Path.GetFileName(file)} okunamadı. FC 27 kariyer kaydı olduğundan emin ol (ayrıntı: {logPath})." });
                return;
            }
            var inGameFolder = Path.GetFullPath(Path.GetDirectoryName(file)!).Equals(Path.GetFullPath(gameSaves), StringComparison.OrdinalIgnoreCase);
            var added = AddedSaves();
            if (!inGameFolder && !added.Contains(file, StringComparer.OrdinalIgnoreCase))
                File.WriteAllText(addedSavesPath, JsonSerializer.Serialize(added.Append(file).ToArray(), new JsonSerializerOptions { WriteIndented = true }));
            Post(new { type = "saveAdded", ok = true, file = Path.GetFileName(file) });
        }
        catch (OperationCanceledException) { }
        finally { if (!lifetime.IsCancellationRequested) StartWatcher(); }
    }

    /// <summary>
    /// fc_assets.lua ya da fc_trophies.lua oyunda çalışınca (assets_manifest.json / trophies_probe.txt yenilenir) yeni görselleri PNG'ye
    /// çevirir; 30 sn'de bir bakar. Hedef: paket → %LOCALAPPDATA%\FcMarket\images, geliştirme → repo kökü.
    /// </summary>
    async Task WatchAssetsAsync()
    {
        var assets = Path.Combine(exportDir, "assets");
        string[] markers = [Path.Combine(assets, "assets_manifest.json"), Path.Combine(assets, "trophies_probe.txt")];
        var dest = layout.DataDir is { } data ? Path.Combine(data, "images") : root;
        var stamp = Path.Combine(dest, "images-converted.txt");
        try
        {
            while (!lifetime.IsCancellationRequested)
            {
                if (markers.Any(File.Exists))
                {
                    var written = string.Join("|", markers.Select(m => File.Exists(m) ? File.GetLastWriteTimeUtc(m).Ticks : 0));
                    if (!Directory.Exists(Path.Combine(dest, "faces")) || !File.Exists(stamp) || File.ReadAllText(stamp) != written)
                    {
                        var convert = StartChild(python, "-m", "tools.assets", "convert", assets, "--dest", dest);
                        await convert.WaitForExitAsync(lifetime.Token);
                        if (convert.ExitCode == 0) { Directory.CreateDirectory(dest); File.WriteAllText(stamp, written); }
                    }
                }
                await Task.Delay(TimeSpan.FromSeconds(30), lifetime.Token);
            }
        }
        catch (OperationCanceledException) { }
        catch (IOException ex) { WriteLog("assets", "ERROR " + ex); }
    }

    void WriteLog(string component, string message)
    {
        lock (logLock)
        {
            try { logs.Write(component, message); }
            catch (Exception ex) when (ex is IOException or UnauthorizedAccessException) { Debug.WriteLine(ex); }
            try { File.AppendAllText(logPath, $"{DateTimeOffset.UtcNow:O} [{component}] {message}{Environment.NewLine}"); }
            catch (Exception ex) when (ex is IOException or UnauthorizedAccessException) { Debug.WriteLine(ex); }
        }
    }

    void StopChildren()
    {
        foreach (var process in children)
        {
            try { if (!process.HasExited) process.Kill(entireProcessTree: true); }
            catch (InvalidOperationException) { }
        }
    }
}
