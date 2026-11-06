using System.Net.Http.Headers;
using System.Security.Cryptography;
using System.Text.Json;
using System.Text.RegularExpressions;

namespace FcMarket.Desktop;

public sealed record UpdateInfo(string Version, string PageUrl, string? Notes, string? SetupUrl, string? ShaUrl);

/// <summary>
/// GitHub'daki son sürümü denetler, kurulum dosyasını indirip SHA-256 ile doğrular. Yalnız bu reponun release
/// dosyalarına gider; istekte kullanıcı ya da kariyer verisi yoktur. Kurmayı çağıran yapar (MainWindow).
/// </summary>
public sealed class Updater(HttpClient http, string repo = "Claymore222/fc-market")
{
    public const string SetupName = "FcMarket-Setup.exe";
    string DownloadPrefix => $"https://github.com/{repo}/releases/download/";

    /// <summary>X.Y.Z karşılaştırması; "v" öneki ve "-dev" gibi ekler yok sayılır. Okunamayan sürüm hiçbir zaman yeni sayılmaz.</summary>
    public static bool IsNewer(string latest, string current)
    {
        static Version? Parse(string s) => Regex.Match(s, @"^v?(\d+)\.(\d+)\.(\d+)") is { Success: true } m
            ? new Version(int.Parse(m.Groups[1].Value), int.Parse(m.Groups[2].Value), int.Parse(m.Groups[3].Value)) : null;
        return Parse(latest) is { } l && Parse(current) is { } c && l > c;
    }

    HttpRequestMessage Get(string url)
    {
        var request = new HttpRequestMessage(HttpMethod.Get, url);
        request.Headers.UserAgent.Add(new ProductInfoHeaderValue("FcMarket-Updater", "1"));
        request.Headers.Accept.Add(new MediaTypeWithQualityHeaderValue("application/vnd.github+json"));
        return request;
    }

    /// <summary>Daha yeni bir sürüm yoksa null.</summary>
    public async Task<UpdateInfo?> CheckAsync(string current, CancellationToken cancel = default)
    {
        using var response = await http.SendAsync(Get($"https://api.github.com/repos/{repo}/releases/latest"), cancel);
        if (response.StatusCode == System.Net.HttpStatusCode.NotFound) return null; // henüz release yok
        response.EnsureSuccessStatusCode();
        using var doc = JsonDocument.Parse(await response.Content.ReadAsStringAsync(cancel));
        var root = doc.RootElement;
        if (root.TryGetProperty("draft", out var draft) && draft.GetBoolean()) return null;
        if (root.TryGetProperty("prerelease", out var pre) && pre.GetBoolean()) return null;
        var tag = root.GetProperty("tag_name").GetString() ?? "";
        if (!IsNewer(tag, current)) return null;
        string? Asset(string name) => root.TryGetProperty("assets", out var assets)
            ? assets.EnumerateArray().Where(a => a.GetProperty("name").GetString() == name)
                .Select(a => a.GetProperty("browser_download_url").GetString()).FirstOrDefault(u => u?.StartsWith(DownloadPrefix) == true)
            : null;
        var page = root.TryGetProperty("html_url", out var html) && html.GetString() is { } h && h.StartsWith($"https://github.com/{repo}/")
            ? h : $"https://github.com/{repo}/releases/latest";
        var notes = root.TryGetProperty("body", out var body) ? body.GetString() : null;
        return new UpdateInfo(tag.TrimStart('v'), page, notes, Asset(SetupName), Asset(SetupName + ".sha256"));
    }

    /// <summary>Kurulumu <paramref name="directory"/>'ye indirir; SHA-256 release'teki .sha256 dosyasıyla tutmazsa siler ve hata verir.</summary>
    public async Task<string> DownloadAsync(UpdateInfo info, string directory, IProgress<int>? progress = null, CancellationToken cancel = default)
    {
        if (info.SetupUrl is null || info.ShaUrl is null) throw new InvalidOperationException("Bu sürümde kurulum dosyası yok.");
        string expected;
        using (var sha = await http.SendAsync(Get(info.ShaUrl), cancel))
        {
            sha.EnsureSuccessStatusCode();
            expected = Regex.Match(await sha.Content.ReadAsStringAsync(cancel), "[0-9a-fA-F]{64}").Value.ToLowerInvariant();
        }
        if (expected.Length != 64) throw new InvalidDataException("SHA-256 dosyası okunamadı.");
        Directory.CreateDirectory(directory);
        var target = Path.Combine(directory, $"FcMarket-Setup-{info.Version}.exe");
        var temp = target + ".part";
        using (var response = await http.SendAsync(Get(info.SetupUrl), HttpCompletionOption.ResponseHeadersRead, cancel))
        {
            response.EnsureSuccessStatusCode();
            var total = response.Content.Headers.ContentLength;
            await using var source = await response.Content.ReadAsStreamAsync(cancel);
            await using var file = File.Create(temp);
            var buffer = new byte[1 << 16];
            long read = 0; var last = -1;
            for (int n; (n = await source.ReadAsync(buffer, cancel)) > 0;)
            {
                await file.WriteAsync(buffer.AsMemory(0, n), cancel);
                read += n;
                if (total > 0 && (int)(read * 100 / total.Value) is var percent && percent != last) { last = percent; progress?.Report(percent); }
            }
        }
        string actual;
        await using (var check = File.OpenRead(temp)) actual = Convert.ToHexString(await SHA256.HashDataAsync(check, cancel)).ToLowerInvariant();
        if (actual != expected) { File.Delete(temp); throw new InvalidDataException("İndirilen dosya doğrulanamadı (SHA-256 farklı)."); }
        File.Move(temp, target, overwrite: true);
        return target;
    }
}
