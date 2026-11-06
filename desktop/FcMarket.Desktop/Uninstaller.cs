namespace FcMarket.Desktop;

/// <summary>
/// Kaldırıcı (installer\FcMarket.iss) program dosyaları silinmeden önce <c>FcMarket.exe --uninstall [--purge]</c> çalıştırır.
/// 1) Live Editor'e koyduğumuz script'ler kaldırılır; yoksa autorun'daki fc_export.lua uygulama gittikten sonra da oyunda
///    export almaya devam ederdi. Yalnız bizim paketimizle birebir aynı dosyalar silinir (AutomationManager.Set yedekler);
///    kullanıcının değiştirdiği bir dosya korunur.
/// 2) --purge: FC Market'in ürettiği veriler silinir: %LOCALAPPDATA%\FcMarket (kısa liste, planlar, görseller, kayıt
///    yedekleri, ayarlar) ve export klasöründeki kariyer veritabanı, loglar ve uygulama dosyaları. Live Editor'ün yazdığı
///    CSV/görsel export'ları ve oyunun kayıt dosyaları korunur.
/// </summary>
static class Uninstaller
{
    static readonly string[] ScriptIds = ["export", "manualExport", "assets", "legacyAssets"];
    static readonly string[] OwnExportFiles = ["fc_career.db", "fc_career.db-wal", "fc_career.db-shm", "fc_career.db.lock",
        "watchlist.txt", "export_schedule.txt"];

    public sealed record Result(List<string> RemovedScripts, List<string> KeptScripts, List<string> Deleted, List<string> Failed);

    public static Result Run(AutomationManager automation, string localData, string exportDir, bool purge)
    {
        var result = new Result([], [], [], []);
        AutomationStatus? status = null;
        try { status = automation.Status(); }
        catch (Exception ex) when (ex is IOException or UnauthorizedAccessException or InvalidOperationException) { result.Failed.Add("script durumu: " + ex.Message); }
        foreach (var script in status?.Scripts.Where(s => s.Installed && ScriptIds.Contains(s.Id)) ?? [])
        {
            if (!script.Matches) { result.KeptScripts.Add(script.Path!); continue; }
            try { automation.Set(script.Id, false); result.RemovedScripts.Add(script.Path!); }
            catch (Exception ex) when (ex is IOException or UnauthorizedAccessException or InvalidOperationException)
            { result.KeptScripts.Add(script.Path!); result.Failed.Add($"{script.Path}: {ex.Message}"); }
        }
        if (!purge) return result;
        foreach (var file in OwnExportFiles.Select(f => Path.Combine(exportDir, f)))
            Delete(file, result);
        Delete(Path.Combine(exportDir, "logs"), result);
        Delete(localData, result);
        return result;
    }

    static void Delete(string path, Result result)
    {
        try
        {
            if (File.Exists(path)) { File.Delete(path); result.Deleted.Add(path); }
            else if (Directory.Exists(path))
            {
                // Bağlantı klasörü (junction) izlenmez: yalnız bağlantının kendisi kaldırılır, hedefi silinmez.
                if ((new DirectoryInfo(path).Attributes & FileAttributes.ReparsePoint) != 0) Directory.Delete(path, false);
                else Directory.Delete(path, true);
                result.Deleted.Add(path);
            }
        }
        catch (Exception ex) when (ex is IOException or UnauthorizedAccessException) { result.Failed.Add($"{path}: {ex.Message}"); }
    }
}
