using System.Text.Json;
using FcMarket.Api.FieldMaps;

namespace FcMarket.Api.Data;

/// <summary>Değişince yeniden okunan JSON config dosyası. Okunamazsa son geçerli (ya da boş) değer kullanılır.</summary>
public sealed class ReloadingJsonFile<T>(string path, ILogger logger) where T : class, new()
{
    private readonly object _lock = new();
    private DateTime _stamp;
    private T? _value;

    public string Path { get; } = path;
    public string? Error { get; private set; }

    public T Current
    {
        get
        {
            lock (_lock)
            {
                var stamp = File.Exists(Path) ? File.GetLastWriteTimeUtc(Path) : DateTime.MinValue;
                if (_value is not null && stamp == _stamp) return _value;
                try
                {
                    _value = JsonSerializer.Deserialize<T>(File.ReadAllText(Path), FieldMap.JsonOptions) ?? new T();
                    Error = null;
                    logger.LogInformation("Config yüklendi: {Path}", Path);
                }
                catch (Exception ex)
                {
                    Error = $"{System.IO.Path.GetFileName(Path)} okunamadı: {ex.Message}";
                    logger.LogWarning("{Error}", Error);
                    _value ??= new T();
                }
                _stamp = stamp;
                return _value;
            }
        }
    }
}

/// <summary>
/// Oyuncu yüz görselleri: yerel klasörde &lt;playerid&gt;.png|.jpg|.webp. İnternetten hiçbir şey çekilmez.
/// Klasörü dolduracak bir export henüz yok (bkz. docs/data-dictionary.md).
/// </summary>
/// <summary>
/// Oyundan çıkarılan arma (crests/<teamid>.png), bayrak (flags/<nationid>.png), kupa (trophies/<lig ya da yarışma kodu>.png)
/// ve lig logoları (league-logos/<leagueid>.png); tools/assets üretir.
/// </summary>
public sealed record GameImages(FaceStore Crests, FaceStore Flags, FaceStore? Trophies = null, FaceStore? Leagues = null);

/// <summary>Kimliğe göre yerel görsel (<id>.png/.jpg/.webp): oyuncu yüzü, arma ya da bayrak klasörü.</summary>
public sealed class FaceStore(string directory)
{
    private static readonly (string Ext, string Type)[] Formats =
        [(".png", "image/png"), (".jpg", "image/jpeg"), (".jpeg", "image/jpeg"), (".webp", "image/webp")];

    public string Directory { get; } = directory;

    public (string Path, string ContentType)? Find(int playerId)
    {
        if (!System.IO.Directory.Exists(Directory)) return null;
        foreach (var (ext, type) in Formats)
        {
            var path = System.IO.Path.Combine(Directory, playerId.ToString(System.Globalization.CultureInfo.InvariantCulture) + ext);
            if (File.Exists(path)) return (path, type);
        }
        return null;
    }
}
