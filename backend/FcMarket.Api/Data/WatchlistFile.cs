using System.Globalization;
using Dapper;

namespace FcMarket.Api.Data;

/// <summary>
/// fc_export.lua'nın günlük hafif export'u için izleme listesi: shortlist'teki oyuncular, export klasöründe
/// watchlist.txt (satır başına bir playerid). Yalnız export klasörüne yazılır; oyuna hiçbir şey yazılmaz.
/// Klasör yoksa sessizce atlanır.
/// </summary>
public sealed class WatchlistFile(string exportDir, AppDb appDb, ILogger<WatchlistFile> log)
{
    public const string FileName = "watchlist.txt";

    public string Path { get; } = System.IO.Path.Combine(exportDir, FileName);

    public void Write()
    {
        if (!Directory.Exists(exportDir)) return;
        try
        {
            using var con = appDb.Open();
            var ids = con.Query<long>("SELECT DISTINCT player_id FROM shortlist ORDER BY player_id").ToList();
            var temporary = Path + ".tmp";
            File.WriteAllLines(temporary, ids.Select(x => x.ToString(CultureInfo.InvariantCulture)));
            File.Move(temporary, Path, overwrite: true);
        }
        catch (Exception ex) when (ex is IOException or UnauthorizedAccessException)
        {
            log.LogWarning("İzleme listesi yazılamadı ({Path}): {Error}", Path, ex.Message);
        }
    }
}
