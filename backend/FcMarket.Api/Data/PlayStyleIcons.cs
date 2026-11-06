using System.Collections.Concurrent;
using System.Security.Cryptography;
using System.Text.Json;

namespace FcMarket.Api.Data;

/// <summary>
/// PlayStyle rozetleri EA'nın görselidir; repoya ve pakete konmaz. İlk istendiğinde config/playstyle-assets.json'daki
/// sabit EA adresinden indirilir, SHA-256 tutarsa kullanıcının görsel klasörüne yazılır, sonra hep yerelden sunulur.
/// İsteğe kullanıcı verisi eklenmez; yalnız listede adı geçen dosyalar indirilir.
/// </summary>
public sealed class PlayStyleIcons(string configPath, string directory, HttpClient http, ILogger<PlayStyleIcons> logger)
{
    sealed record Asset(string Url, string Sha256);
    readonly Lazy<IReadOnlyDictionary<string, Asset>> assets = new(() => Load(configPath));
    readonly ConcurrentDictionary<string, Lazy<Task<string?>>> pending = new();
    // Ağ yoksa her sayfa açılışında yeniden denemeyelim: başarısız indirme 10 dk bekler.
    readonly ConcurrentDictionary<string, DateTime> failedAt = new();

    static IReadOnlyDictionary<string, Asset> Load(string path)
    {
        if (!File.Exists(path)) return new Dictionary<string, Asset>();
        using var doc = JsonDocument.Parse(File.ReadAllText(path));
        return doc.RootElement.GetProperty("assets").EnumerateObject().ToDictionary(p => p.Name,
            p => new Asset(p.Value.GetProperty("url").GetString()!, p.Value.GetProperty("sha256").GetString()!));
    }

    /// <summary>Yerel dosya yolu; slug listede yoksa ya da indirilemezse null.</summary>
    public async Task<string?> Find(string slug, CancellationToken cancel = default)
    {
        if (!assets.Value.TryGetValue(slug, out var asset)) return null;
        var path = Path.Combine(directory, slug + ".png");
        if (File.Exists(path)) return path;
        if (failedAt.TryGetValue(slug, out var at) && DateTime.UtcNow - at < TimeSpan.FromMinutes(10)) return null;
        var task = pending.GetOrAdd(slug, _ => new Lazy<Task<string?>>(() => Download(slug, asset, path)));
        try { return await task.Value.WaitAsync(cancel); }
        finally { if (task.Value.IsCompleted) pending.TryRemove(slug, out _); }
    }

    async Task<string?> Download(string slug, Asset asset, string path)
    {
        try
        {
            var bytes = await http.GetByteArrayAsync(asset.Url);
            if (!Convert.ToHexString(SHA256.HashData(bytes)).Equals(asset.Sha256, StringComparison.OrdinalIgnoreCase))
                throw new InvalidDataException("SHA-256 eşleşmedi");
            Directory.CreateDirectory(directory);
            var temp = path + "." + Guid.NewGuid().ToString("N") + ".tmp";
            await File.WriteAllBytesAsync(temp, bytes);
            File.Move(temp, path, overwrite: true);
            failedAt.TryRemove(slug, out _);
            return path;
        }
        catch (Exception ex) when (ex is HttpRequestException or TaskCanceledException or InvalidDataException or IOException or UnauthorizedAccessException)
        {
            failedAt[slug] = DateTime.UtcNow;
            logger.LogWarning("PlayStyle görseli indirilemedi ({Slug}): {Message}", slug, ex.Message);
            return null;
        }
    }
}
