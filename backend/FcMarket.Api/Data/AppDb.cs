using Dapper;
using Microsoft.Data.Sqlite;

namespace FcMarket.Api.Data;

/// <summary>
/// app.db: uygulamanın kendi verisi (shortlist). fc_career.db'den ayrı dosya; yalnızca backend yazar.
/// Şema ilk açılışta kurulur, eksik tablolar her açılışta eklenir.
/// </summary>
public sealed class AppDb(string path)
{
    static AppDb() => DefaultTypeMap.MatchNamesWithUnderscores = true;

    private readonly object _lock = new();
    private bool _migrated;

    public string Path { get; } = path;

    private const string Schema = """
        CREATE TABLE IF NOT EXISTS shortlist (
            save_uid          TEXT    NOT NULL,
            player_id         INTEGER NOT NULL,
            note              TEXT,
            tags              TEXT    NOT NULL DEFAULT '[]',
            target_price      INTEGER,
            added_at          TEXT    NOT NULL,
            added_name        TEXT,
            added_snapshot_id TEXT,
            added_game_date   TEXT,
            added_overall     INTEGER,
            added_potential   INTEGER,
            added_club_id     INTEGER,
            added_club        TEXT,
            PRIMARY KEY (save_uid, player_id)
        );
        CREATE TABLE IF NOT EXISTS app_settings (
            key TEXT PRIMARY KEY, value TEXT NOT NULL, updated_at TEXT NOT NULL
        );
        CREATE TABLE IF NOT EXISTS manager_profiles (
            career_key TEXT NOT NULL, view_mode TEXT NOT NULL, profile_json TEXT NOT NULL,
            version INTEGER NOT NULL, updated_at TEXT NOT NULL, snapshot_id TEXT NOT NULL,
            snapshot_revision INTEGER NOT NULL, config_version TEXT NOT NULL,
            PRIMARY KEY(career_key,view_mode)
        );
        CREATE TABLE IF NOT EXISTS analysis_runs (
            id TEXT PRIMARY KEY, career_key TEXT NOT NULL, view_mode TEXT NOT NULL,
            snapshot_id TEXT NOT NULL, snapshot_revision INTEGER NOT NULL,
            config_version TEXT NOT NULL, profile_hash TEXT NOT NULL, created_at TEXT NOT NULL,
            input_json TEXT NOT NULL, report_json TEXT NOT NULL
        );
        CREATE TABLE IF NOT EXISTS recruitment_runs (
            id TEXT PRIMARY KEY, analysis_id TEXT NOT NULL, formation TEXT NOT NULL, slot TEXT NOT NULL,
            rules_version TEXT NOT NULL, created_at TEXT NOT NULL, rules_json TEXT NOT NULL, result_json TEXT NOT NULL
        );
        CREATE TABLE IF NOT EXISTS transfer_plans (
            career_key TEXT NOT NULL, view_mode TEXT NOT NULL, draft_json TEXT NOT NULL,
            result_json TEXT NOT NULL, version INTEGER NOT NULL, updated_at TEXT NOT NULL,
            PRIMARY KEY(career_key,view_mode)
        );
        """;

    public string? Setting(string key)
    {
        using var con = Open();
        return con.QuerySingleOrDefault<string>("SELECT value FROM app_settings WHERE key=@key", new { key });
    }

    public void SaveSetting(string key, string value)
    {
        using var con = Open();
        con.Execute("INSERT INTO app_settings VALUES (@key,@value,@at) ON CONFLICT(key) DO UPDATE SET value=excluded.value,updated_at=excluded.updated_at",
            new { key, value, at = DateTimeOffset.UtcNow.ToString("O") });
    }

    public SqliteConnection Open()
    {
        var dir = System.IO.Path.GetDirectoryName(System.IO.Path.GetFullPath(Path));
        if (!string.IsNullOrEmpty(dir)) Directory.CreateDirectory(dir);
        var con = new SqliteConnection(new SqliteConnectionStringBuilder
        {
            DataSource = Path,
            Mode = SqliteOpenMode.ReadWriteCreate,
            Pooling = true,
        }.ToString());
        con.Open();
        lock (_lock)
        {
            if (!_migrated)
            {
                con.Execute("PRAGMA journal_mode=WAL;");
                con.Execute(Schema);
                _migrated = true;
            }
        }
        return con;
    }
}
