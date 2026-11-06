using FcMarket.Api.Data;

namespace FcMarket.Tests;

public sealed class StorageInfoTests : IDisposable
{
    readonly string dir = Path.Combine(Path.GetTempPath(), "fcm-storage-" + Guid.NewGuid().ToString("N"));

    string Write(string relative, int bytes)
    {
        var path = Path.Combine(dir, relative);
        Directory.CreateDirectory(Path.GetDirectoryName(path)!);
        File.WriteAllBytes(path, new byte[bytes]);
        return path;
    }

    [Fact] public void Sizes_each_area_once_and_keeps_the_career_db_out_of_the_export_folder()
    {
        var career = Write("export/fc_career.db", 100); Write("export/fc_career.db-wal", 10);
        Write("export/a__players.csv", 7); Write("export/assets/x.png", 3);
        var app = Write("data/app.db", 20);
        Write("data/save-backups/CmMgrC1.abc.save", 50);
        Write("data/images/faces/1.png", 4); Write("data/images/crests/2.png", 6);
        var report = new StorageInfo(career, app, Path.Combine(dir, "export"), Path.Combine(dir, "data/save-backups"),
            [Path.Combine(dir, "data/images/faces"), Path.Combine(dir, "data/images/crests"), Path.Combine(dir, "data/images/flags")]).Get();
        var by = report.Items.ToDictionary(i => i.Id);
        Assert.Equal(110, by["careerDb"].Bytes);
        Assert.Equal(20, by["appDb"].Bytes);
        Assert.Equal((10, 2), (by["exports"].Bytes, by["exports"].Files));
        Assert.Equal(50, by["backups"].Bytes);
        Assert.Equal((10, 2, true), (by["images"].Bytes, by["images"].Files, by["images"].Exists));
        Assert.Equal(200, report.TotalBytes);
    }

    [Fact] public void Missing_files_and_folders_report_zero_without_throwing()
    {
        var report = new StorageInfo(Path.Combine(dir, "no.db"), Path.Combine(dir, "no-app.db"), Path.Combine(dir, "none"),
            Path.Combine(dir, "none2"), []).Get();
        Assert.All(report.Items, i => Assert.Equal(0, i.Bytes));
        Assert.All(report.Items, i => Assert.False(i.Exists));
    }

    public void Dispose() { if (Directory.Exists(dir)) Directory.Delete(dir, true); }
}
