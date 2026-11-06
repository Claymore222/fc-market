using System.Net;
using System.Security.Cryptography;
using System.Text;
using FcMarket.Desktop;

namespace FcMarket.Tests;

public sealed class UpdaterTests : IDisposable
{
    readonly string temp = Path.Combine(Path.GetTempPath(), "fcm-update-" + Guid.NewGuid().ToString("N"));
    const string Dl = "https://github.com/Claymore222/fc-market/releases/download/v0.3.0/";
    static readonly byte[] Setup = Encoding.ASCII.GetBytes("MZ fake setup bytes");

    sealed class Fake(Dictionary<string, (HttpStatusCode Code, byte[] Body)> routes) : HttpMessageHandler
    {
        public List<string> Requests { get; } = [];
        protected override Task<HttpResponseMessage> SendAsync(HttpRequestMessage request, CancellationToken cancel)
        {
            var url = request.RequestUri!.ToString();
            Requests.Add(url);
            Assert.Contains("FcMarket-Updater", request.Headers.UserAgent.ToString());
            var (code, body) = routes.TryGetValue(url, out var r) ? r : (HttpStatusCode.NotFound, Array.Empty<byte>());
            return Task.FromResult(new HttpResponseMessage(code) { Content = new ByteArrayContent(body) });
        }
    }

    static string Release(string tag, string downloadBase = Dl, bool prerelease = false) => $$"""
        {"tag_name":"{{tag}}","html_url":"https://github.com/Claymore222/fc-market/releases/tag/{{tag}}","body":"notlar",
         "draft":false,"prerelease":{{(prerelease ? "true" : "false")}},
         "assets":[{"name":"FcMarket-Setup.exe","browser_download_url":"{{downloadBase}}FcMarket-Setup.exe"},
                   {"name":"FcMarket-Setup.exe.sha256","browser_download_url":"{{downloadBase}}FcMarket-Setup.exe.sha256"},
                   {"name":"FcMarket.zip","browser_download_url":"{{downloadBase}}FcMarket.zip"}]}
        """;

    static (Updater, Fake) Make(string release, byte[]? setup = null, string? sha = null)
    {
        var fake = new Fake(new()
        {
            ["https://api.github.com/repos/Claymore222/fc-market/releases/latest"] = (HttpStatusCode.OK, Encoding.UTF8.GetBytes(release)),
            [Dl + "FcMarket-Setup.exe"] = (HttpStatusCode.OK, setup ?? Setup),
            [Dl + "FcMarket-Setup.exe.sha256"] = (HttpStatusCode.OK,
                Encoding.ASCII.GetBytes((sha ?? Convert.ToHexString(SHA256.HashData(Setup)).ToLowerInvariant()) + "  FcMarket-Setup.exe\n")),
        });
        return (new Updater(new HttpClient(fake)), fake);
    }

    [Theory]
    [InlineData("v0.3.0", "0.2.3", true)] [InlineData("v0.2.10", "0.2.9", true)] [InlineData("1.0.0", "0.9.9", true)]
    [InlineData("v0.2.3", "0.2.3", false)] [InlineData("v0.2.2", "0.2.3", false)] [InlineData("v0.3.0", "0.0.0-dev", true)]
    [InlineData("nightly", "0.2.3", false)] [InlineData("v0.3.0", "bozuk", false)]
    public void Compares_semantic_versions(string latest, string current, bool newer) => Assert.Equal(newer, Updater.IsNewer(latest, current));

    [Fact]
    public async Task Newer_release_is_reported_with_its_setup_and_checksum()
    {
        var (updater, _) = Make(Release("v0.3.0"));
        var info = await updater.CheckAsync("0.2.3");
        Assert.NotNull(info);
        Assert.Equal(("0.3.0", Dl + "FcMarket-Setup.exe", Dl + "FcMarket-Setup.exe.sha256", "notlar"), (info!.Version, info.SetupUrl, info.ShaUrl, info.Notes));
    }

    [Fact]
    public async Task Same_older_or_prerelease_versions_are_not_offered()
    {
        Assert.Null(await Make(Release("v0.2.3")).Item1.CheckAsync("0.2.3"));
        Assert.Null(await Make(Release("v0.2.1")).Item1.CheckAsync("0.2.3"));
        Assert.Null(await Make(Release("v0.3.0", prerelease: true)).Item1.CheckAsync("0.2.3"));
        var none = new Updater(new HttpClient(new Fake([])));
        Assert.Null(await none.CheckAsync("0.2.3")); // henüz release yok (404)
    }

    [Fact]
    public async Task Assets_outside_this_repository_are_ignored()
    {
        var (updater, _) = Make(Release("v0.3.0", "https://evil.example/download/"));
        var info = await updater.CheckAsync("0.2.3");
        Assert.Null(info!.SetupUrl);
        await Assert.ThrowsAsync<InvalidOperationException>(() => updater.DownloadAsync(info, temp));
    }

    [Fact]
    public async Task Download_verifies_the_checksum_and_reports_progress()
    {
        var (updater, _) = Make(Release("v0.3.0"));
        var info = (await updater.CheckAsync("0.2.3"))!;
        var seen = new List<int>();
        var path = await updater.DownloadAsync(info, temp, new SyncProgress(seen.Add));
        Assert.Equal(Setup, File.ReadAllBytes(path));
        Assert.Equal("FcMarket-Setup-0.3.0.exe", Path.GetFileName(path));
        Assert.Equal(100, seen.Last());
    }

    [Fact]
    public async Task Tampered_download_is_deleted_and_rejected()
    {
        var (updater, _) = Make(Release("v0.3.0"), setup: Encoding.ASCII.GetBytes("MZ something else"));
        var info = (await updater.CheckAsync("0.2.3"))!;
        await Assert.ThrowsAsync<InvalidDataException>(() => updater.DownloadAsync(info, temp));
        Assert.Empty(Directory.GetFiles(temp));
    }

    sealed class SyncProgress(Action<int> report) : IProgress<int> { public void Report(int value) => report(value); }

    public void Dispose() { if (Directory.Exists(temp)) Directory.Delete(temp, true); }
}
