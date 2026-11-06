namespace FcMarket.Api.Data;

/// <summary>Ayarlar → Veri ve depolama: hangi veri nerede ve ne kadar yer kaplıyor. Yalnız okur, hiçbir dosyaya yazmaz.</summary>
public sealed class StorageInfo(string careerDb, string appDb, string exportDir, string backupsDir, IReadOnlyList<string> imageDirs)
{
    public StorageReport Get()
    {
        var career = Files(careerDb);
        var items = new List<StorageItem>
        {
            new("careerDb", "Kariyer veritabanı", careerDb, career, 1, File.Exists(careerDb)),
            new("appDb", "Uygulama verisi", appDb, Files(appDb), 1, File.Exists(appDb)),
            Folder("exports", "Live Editor export'ları", exportDir, skip: [careerDb, careerDb + "-wal", careerDb + "-shm", careerDb + ".lock"]),
            Folder("backups", "Kayıt yedekleri", backupsDir),
        };
        var images = imageDirs.Select(d => Folder("images", "", d)).ToList();
        items.Add(new("images", "Görseller (yüz, arma, bayrak)", imageDirs.Count > 0 ? Path.GetDirectoryName(imageDirs[0]) ?? imageDirs[0] : "",
            images.Sum(i => i.Bytes), images.Sum(i => i.Files), images.Any(i => i.Exists)));
        return new(items, items.Sum(i => i.Bytes));
    }

    /// <summary>SQLite dosyası ve yanındaki WAL/SHM.</summary>
    static long Files(string db) => new[] { db, db + "-wal", db + "-shm" }.Where(File.Exists).Sum(f => new FileInfo(f).Length);

    static StorageItem Folder(string id, string label, string dir, string[]? skip = null)
    {
        if (!Directory.Exists(dir)) return new(id, label, dir, 0, 0, false);
        var excluded = new HashSet<string>((skip ?? []).Select(Path.GetFullPath), StringComparer.OrdinalIgnoreCase);
        long bytes = 0; var count = 0;
        var options = new EnumerationOptions { RecurseSubdirectories = true, IgnoreInaccessible = true, AttributesToSkip = FileAttributes.ReparsePoint };
        foreach (var file in new DirectoryInfo(dir).EnumerateFiles("*", options))
        {
            if (excluded.Contains(file.FullName)) continue;
            bytes += file.Length; count++;
        }
        return new(id, label, dir, bytes, count, true);
    }
}

public sealed record StorageItem(string Id, string Label, string Path, long Bytes, int Files, bool Exists);
public sealed record StorageReport(IReadOnlyList<StorageItem> Items, long TotalBytes);
