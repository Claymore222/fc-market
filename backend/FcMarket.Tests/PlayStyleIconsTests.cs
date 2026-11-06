using System.Net;
using System.Security.Cryptography;
using FcMarket.Api.Data;
using Microsoft.Extensions.Logging.Abstractions;

namespace FcMarket.Tests;

public sealed class PlayStyleIconsTests : IDisposable
{
    readonly string dir = Path.Combine(Path.GetTempPath(), "fcm-playstyles-" + Guid.NewGuid().ToString("N"));
    static readonly byte[] Png = [0x89, 0x50, 0x4E, 0x47, 1, 2, 3];

    sealed class FakeHandler(byte[] body) : HttpMessageHandler
    {
        public List<string> Requests { get; } = [];
        protected override Task<HttpResponseMessage> SendAsync(HttpRequestMessage request, CancellationToken cancel)
        {
            Requests.Add(request.RequestUri!.ToString());
            return Task.FromResult(new HttpResponseMessage(HttpStatusCode.OK) { Content = new ByteArrayContent(body) });
        }
    }

    (PlayStyleIcons Icons, FakeHandler Http) Make(byte[] served, string sha)
    {
        Directory.CreateDirectory(dir);
        var config = Path.Combine(dir, "assets.json");
        File.WriteAllText(config, "{\"assets\":{\"finesse-shot\":{\"url\":\"https://example.test/Finesse.png\",\"sha256\":\"" + sha + "\"}}}");
        var handler = new FakeHandler(served);
        return (new PlayStyleIcons(config, Path.Combine(dir, "icons"), new HttpClient(handler), NullLogger<PlayStyleIcons>.Instance), handler);
    }

    [Fact] public async Task Downloads_once_when_checksum_matches_then_serves_from_disk()
    {
        var (icons, http) = Make(Png, Convert.ToHexString(SHA256.HashData(Png)).ToLowerInvariant());
        var path = await icons.Find("finesse-shot");
        Assert.Equal(Png, File.ReadAllBytes(path!));
        Assert.Equal(path, await icons.Find("finesse-shot"));
        Assert.Single(http.Requests);
    }

    [Fact] public async Task Rejects_bytes_with_a_different_checksum_and_does_not_retry_immediately()
    {
        var (icons, http) = Make(Png, new string('0', 64));
        Assert.Null(await icons.Find("finesse-shot"));
        Assert.Null(await icons.Find("finesse-shot"));
        Assert.Single(http.Requests);
        Assert.False(Directory.Exists(Path.Combine(dir, "icons")) && Directory.EnumerateFiles(Path.Combine(dir, "icons")).Any());
    }

    [Theory] [InlineData("unknown")] [InlineData("../assets")] [InlineData("..\\..\\x")]
    public async Task Only_listed_names_are_fetched(string slug)
    {
        var (icons, http) = Make(Png, Convert.ToHexString(SHA256.HashData(Png)));
        Assert.Null(await icons.Find(slug));
        Assert.Empty(http.Requests);
    }

    public void Dispose() { if (Directory.Exists(dir)) Directory.Delete(dir, true); }
}
