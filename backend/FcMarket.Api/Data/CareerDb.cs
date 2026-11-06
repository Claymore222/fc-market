using System.Globalization;
using System.Text.RegularExpressions;
using Dapper;
using Microsoft.Data.Sqlite;

namespace FcMarket.Api.Data;

/// <summary>Veritabanı yok ya da okunamıyor. Endpoint'ler 503 döner.</summary>
public sealed class DataUnavailableException(string message, Exception? inner = null) : Exception(message, inner);

/// <summary>Kayıt bulunamadı (save, oyuncu). Endpoint'ler 404 döner.</summary>
public sealed class NotFoundException(string message) : Exception(message);

/// <summary>
/// Kariyer anahtarı: "saveUid" ya da "saveUid@dal". Kopyalanan slotlar ve eski kayda dönüş aynı Save UID'yi taşır;
/// importer bunları dallara ayırır (snapshots.branch). Dal verilmezse son okunmuş disk kaydı; açık dal arşiv ucudur.
/// </summary>
public readonly record struct CareerKey(string? SaveUid, long? Branch)
{
    public static CareerKey Parse(string? key)
    {
        if (string.IsNullOrWhiteSpace(key)) return new(null, null);
        var at = key.LastIndexOf('@');
        return at > 0 && long.TryParse(key[(at + 1)..], NumberStyles.None, CultureInfo.InvariantCulture, out var b)
            ? new(key[..at], b)
            : new(key, null);
    }

    public static string Format(string saveUid, long? branch) => branch is null ? saveUid : $"{saveUid}@{branch}";
}

public sealed class BranchRow
{
    public long Branch { get; set; }
    public long? ParentBranch { get; set; }
    public string? ForkDate { get; set; }
}

public sealed class SaveSlotRow
{
    public long Branch { get; set; }
    public string Title { get; set; } = "";
    public string SourcePath { get; set; } = "";
    public string? LastDate { get; set; }
}

public sealed class SnapshotRow
{
    public string SnapshotId { get; set; } = "";
    public string SaveUid { get; set; } = "";
    public long? Branch { get; set; }
    public string? BranchReason { get; set; }
    public string CareerKey => Data.CareerKey.Format(SaveUid, Branch);
    public string GameDate { get; set; } = "";
    public string? ExportedAt { get; set; }
    public long? UserTeamid { get; set; }
    public string? UserTeamName { get; set; }
    public long? TransferBudget { get; set; }
    public long? WageBudget { get; set; }
    public string Source { get; set; } = "export";
    public long Revision { get; set; }

    public DateOnly Date =>
        DateOnly.TryParseExact(GameDate, "yyyy-MM-dd", CultureInfo.InvariantCulture, DateTimeStyles.None, out var d)
            ? d
            : DateOnly.MinValue;
}

public sealed class EventCount
{
    public string GameDate { get; set; } = "";
    public string Event { get; set; } = "";
    public int Count { get; set; }

    public DateOnly? Date =>
        DateOnly.TryParseExact(GameDate, "yyyy-MM-dd", CultureInfo.InvariantCulture, DateTimeStyles.None, out var d) ? d : null;
}

/// <summary>
/// fc_career.db erişimi. Dosya importer'ındır: her zaman Mode=ReadOnly açılır, asla yazılmaz.
/// snapshots/events/schema_fields importer'ın kendi şemasıdır (oyun alanı değil), o yüzden adları burada sabit.
/// </summary>
public sealed partial class CareerDb(string path)
{
    static CareerDb() => DefaultTypeMap.MatchNamesWithUnderscores = true;

    public string Path { get; } = path;

    private const string SnapshotColumns =
        "snapshot_id, save_uid, game_date, exported_at, user_teamid, user_team_name, transfer_budget, wage_budget";

    /// <summary>Dal desteğinden önceki importer'ın veritabanında branch kolonları yok: NULL gelir.</summary>
    private static string SnapshotSelect(SqliteConnection con) =>
        SnapshotColumns + (HasBranches(con) ? ", branch, branch_reason" : ", NULL AS branch, NULL AS branch_reason")
        + (con.ExecuteScalar<long>("SELECT COUNT(*) FROM pragma_table_info('snapshots') WHERE name='source'") > 0
            ? ", source, revision" : ", 'export' AS source, 0 AS revision");

    public static bool HasBranches(SqliteConnection con) =>
        con.ExecuteScalar<long>("SELECT COUNT(*) FROM pragma_table_info('snapshots') WHERE name = 'branch'") > 0;

    public SqliteConnection Open()
    {
        if (!File.Exists(Path))
            throw new DataUnavailableException($"Veritabanı bulunamadı: {Path}. Önce importer'ı çalıştır.");
        var cs = new SqliteConnectionStringBuilder
        {
            DataSource = Path,
            Mode = SqliteOpenMode.ReadOnly,
            Pooling = true,
        }.ToString();
        try
        {
            var con = new SqliteConnection(cs);
            con.Open();
            return con;
        }
        catch (SqliteException ex)
        {
            throw new DataUnavailableException($"Veritabanı açılamadı: {ex.Message}", ex);
        }
    }

    /// <summary>Save'in (verilmezse hepsinin) bütün dallardaki snapshot'ları; oyun tarihi, sonra export sırası.</summary>
    public List<SnapshotRow> Snapshots(SqliteConnection con, string? saveUid = null) =>
        con.Query<SnapshotRow>(
            $"SELECT {SnapshotSelect(con)} FROM snapshots " +
            "WHERE (@saveUid IS NULL OR save_uid = @saveUid) ORDER BY game_date, exported_at",
            new { saveUid }).AsList();

    public List<BranchRow> Branches(SqliteConnection con, string saveUid) =>
        TableExists(con, "branches")
            ? con.Query<BranchRow>("SELECT branch, parent_branch, fork_date FROM branches WHERE save_uid = @saveUid",
                new { saveUid }).AsList()
            : [];

    public List<SaveSlotRow> SaveSlots(SqliteConnection con, string saveUid) =>
        TableExists(con, "save_slots")
            ? con.Query<SaveSlotRow>("SELECT branch,title,source_path,last_date FROM save_slots WHERE save_uid=@saveUid ORDER BY title,slot",
                new { saveUid }).AsList()
            : [];

    /// <summary>
    /// Dalın gördüğü geçmiş: kendi snapshot'ları + ata dalların ayrılma tarihinden önceki snapshot'ları
    /// (eskiden yeniye). Dal yoksa (eski veritabanı) save'in tüm snapshot'ları.
    /// </summary>
    public List<SnapshotRow> Lineage(SqliteConnection con, string saveUid, long? branch, string? throughSnapshot = null)
    {
        var all = Snapshots(con, saveUid);
        if (branch is null) return Through(all, throughSnapshot);
        var parents = Branches(con, saveUid).ToDictionary(b => b.Branch);
        var result = new List<SnapshotRow>();
        long? current = branch;
        string? before = null; // bu tarihten önceki snapshot'lar (ata dal için ayrılma tarihi)
        var seen = new HashSet<long>();
        while (current is { } b && seen.Add(b))
        {
            result.AddRange(all.Where(s => s.Branch == b && (before is null || string.CompareOrdinal(s.GameDate, before) < 0)));
            if (!parents.TryGetValue(b, out var row) || row.ParentBranch is null) break;
            if (row.ForkDate is { } fork && (before is null || string.CompareOrdinal(fork, before) < 0)) before = fork;
            current = row.ParentBranch;
        }
        return Through(result.OrderBy(s => s.GameDate, StringComparer.Ordinal)
            .ThenBy(s => s.ExportedAt, StringComparer.Ordinal).ToList(), throughSnapshot);
    }

    static List<SnapshotRow> Through(List<SnapshotRow> rows, string? snapshot)
    {
        if (snapshot is null) return rows;
        var index = rows.FindIndex(s => s.SnapshotId == snapshot);
        if (index < 0) throw new NotFoundException("Snapshot geçmişte bulunamadı: " + snapshot);
        return rows.Take(index + 1).ToList();
    }

    public SnapshotRow? SavedSnapshot(SqliteConnection con, string? saveUid) =>
        TableExists(con, "save_heads") ? con.QueryFirstOrDefault<SnapshotRow>(
            $"SELECT {SnapshotSelect(con)} FROM snapshots WHERE snapshot_id=(" +
            "SELECT h.snapshot_id FROM save_heads h JOIN snapshots s ON s.snapshot_id=h.snapshot_id " +
            "WHERE (@saveUid IS NULL OR s.save_uid=@saveUid) " +
            "ORDER BY julianday(h.written_at) DESC,h.rowid DESC LIMIT 1)", new { saveUid }) : null;

    public SnapshotRow? UnconfirmedExport(SqliteConnection con, string saveUid)
    {
        if (!TableExists(con, "save_heads")) return null; // legacy databases have no reliable disk observation
        return con.QueryFirstOrDefault<SnapshotRow>(
            $"SELECT {SnapshotSelect(con)} FROM snapshots WHERE save_uid=@saveUid AND source IN ('export','daily') " +
            "AND (julianday(exported_at) > (SELECT MAX(julianday(h.written_at)) FROM save_heads h " +
            "JOIN snapshots s ON s.snapshot_id=h.snapshot_id WHERE s.save_uid=@saveUid) " +
            "OR NOT EXISTS (SELECT 1 FROM save_heads h JOIN snapshots s ON s.snapshot_id=h.snapshot_id WHERE s.save_uid=@saveUid)) " +
            "ORDER BY julianday(exported_at) DESC,rowid DESC LIMIT 1", new { saveUid });
    }

    public List<ImportIssue> ImportIssues(SqliteConnection con) => TableExists(con, "import_issues")
        ? con.Query<ImportIssue>("SELECT file_name,message FROM import_issues ORDER BY last_seen DESC LIMIT 20").AsList() : [];

    public List<ImportIssue> ImportWarnings(SqliteConnection con) => TableExists(con, "import_warnings")
        ? con.Query<ImportIssue>("SELECT file_name,message FROM import_warnings ORDER BY last_seen DESC LIMIT 20").AsList() : [];

    /// <summary>
    /// Normal anahtar son okunmuş disk kaydını; açık dal anahtarı o dalın arşiv ucunu seçer.
    /// Kayıt işaretçisi olmayan eski DB'lerde en son gözlemlenen dal davranışı korunur.
    /// </summary>
    public SnapshotRow LatestSnapshot(SqliteConnection con, string? careerKey)
    {
        if (!TableExists(con, "snapshots"))
            throw new DataUnavailableException("snapshots tablosu yok. Importer henüz hiç çalışmamış.");
        var (saveUid, branch) = CareerKey.Parse(careerKey);
        // Bare career key is the current disk save. Explicit branches remain available as archive/export previews.
        if (branch is null && SavedSnapshot(con, saveUid) is { } saved) return saved;
        var select = SnapshotSelect(con);
        var observed = con.QueryFirstOrDefault<SnapshotRow>(
            $"SELECT {select} FROM snapshots WHERE (@saveUid IS NULL OR save_uid = @saveUid) " +
            "ORDER BY exported_at DESC, rowid DESC LIMIT 1", new { saveUid });
        if (observed is null)
            throw saveUid is null
                ? new DataUnavailableException("Veritabanında hiç snapshot yok.")
                : new NotFoundException($"Save bulunamadı: {saveUid}");
        branch ??= observed.Branch;
        var branchFilter = HasBranches(con) ? "AND branch IS @branch " : "";
        return con.QueryFirstOrDefault<SnapshotRow>(
                   $"SELECT {select} FROM snapshots WHERE save_uid = @save {branchFilter}" +
                   "ORDER BY game_date DESC, exported_at DESC LIMIT 1",
                   new { save = observed.SaveUid, branch })
               ?? throw new NotFoundException($"Dal bulunamadı: {careerKey}");
    }

    /// <summary>
    /// Aynı oyun gününde birden fazla snapshot varsa (elle + otomatik) günün en son alınanı.
    /// Girdi <see cref="Snapshots"/> sırasında olmalı (oyun tarihi, sonra export zamanı).
    /// </summary>
    public static List<SnapshotRow> PerGameDay(IEnumerable<SnapshotRow> ordered) =>
        ordered.GroupBy(s => s.Date).Select(g => g.Last()).ToList();

    /// <summary>events tablosu: oyun günü + event adı başına sayı (event'ler oyuncu/takım taşımıyor).</summary>
    public List<EventCount> EventCounts(SqliteConnection con, string saveUid) =>
        TableExists(con, "events")
            ? con.Query<EventCount>(
                "SELECT game_date, event, COUNT(*) AS count FROM events WHERE save_uid = @saveUid " +
                "GROUP BY game_date, event", new { saveUid }).AsList()
            : [];

    public static bool TableExists(SqliteConnection con, string table) =>
        con.ExecuteScalar<long>("SELECT COUNT(*) FROM sqlite_master WHERE type IN ('table','view') AND name = @table",
            new { table }) > 0;

    /// <summary>raw_&lt;table&gt; kolonları (snapshot_id hariç); tablo yoksa null.</summary>
    public static IReadOnlySet<string>? RawColumns(SqliteConnection con, string exportTable)
    {
        var raw = RawTableName(exportTable);
        var cols = con.Query<string>($"SELECT name FROM pragma_table_info(@raw)", new { raw })
            .Where(c => !c.Equals("snapshot_id", StringComparison.OrdinalIgnoreCase))
            .ToHashSet(StringComparer.OrdinalIgnoreCase);
        return cols.Count == 0 ? null : cols;
    }

    public static Dictionary<string, IReadOnlySet<string>> SchemaFields(SqliteConnection con)
    {
        if (!TableExists(con, "schema_fields")) return new();
        return con.Query<(string Table, string Field)>("SELECT table_name, field_name FROM schema_fields")
            .GroupBy(r => r.Table, StringComparer.OrdinalIgnoreCase)
            .ToDictionary(g => g.Key,
                g => (IReadOnlySet<string>)g.Select(r => r.Field).ToHashSet(StringComparer.OrdinalIgnoreCase),
                StringComparer.OrdinalIgnoreCase);
    }

    /// <summary>importer.py'deki ident() ile aynı temizleme: export adı -> SQLite adı.</summary>
    public static string ImporterIdent(string name)
    {
        var clean = NonIdentChars().Replace(name.Trim(), "_");
        return clean.Length > 0 && IdentPattern().IsMatch(clean) ? clean : "c_" + clean;
    }

    public static string RawTableName(string exportTable) => ImporterIdent("raw_" + exportTable);

    [GeneratedRegex("[^A-Za-z0-9_]")]
    private static partial Regex NonIdentChars();

    [GeneratedRegex("^[A-Za-z_][A-Za-z0-9_]*$")]
    private static partial Regex IdentPattern();
}

public sealed record ImportIssue(string FileName, string Message);
