#!/usr/bin/env python3
"""
importer.py — fc_export.lua çıktısını SQLite'a aktarır.

Kullanım:
    python importer.py C:/FCExport                 # tek seferlik import
    python importer.py C:/FCExport --watch 10      # 10 sn'de bir yeni snapshot/event kontrol et
    python importer.py C:/FCExport --db my.db      # farklı veritabanı dosyası

Sadece Python standart kütüphanesi kullanır (kurulum gerekmez).

Kurallar:
  * Sadece manifest.jsonl'de listelenen snapshot'lar okunur (yarım yazılmış dosyalar okunmaz).
  * Aynı snapshot iki kez import edilmez (idempotent).
  * Her ham tablo "raw_<tablo>" olarak saklanır ve "snapshot_id" kolonu eklenir.
  * FC sürümleri arasında yeni kolon gelirse tablo otomatik genişletilir.
  * events.jsonl artımlı okunur (kaldığı byte'tan devam eder).
  * playerid/teamid kolonu olan raw tablolara (snapshot_id, playerid|teamid) index'i eklenir.
  * Her save'in son snapshot'ı player_current tablosuna düz olarak yazılır (yeni snapshot gelince yenilenir).
  * Aynı veritabanına aynı anda tek importer yazar (<db>.lock); ikincisi hata verip çıkar.
  * Her snapshot bir dala atanır (snapshots.branch): oyun tarihi geri giderse (eski kayıt, kopya slot) yeni dal.
"""
from __future__ import annotations

import argparse
import csv
import json
import re
import sqlite3
import sys
import time
from pathlib import Path

DEFAULT_DB = "fc_career.db"
SAFE_IDENT = re.compile(r"^[A-Za-z_][A-Za-z0-9_]*$")


def log(msg: str) -> None:
    print(f"[importer] {msg}", flush=True)


def ident(name: str) -> str:
    """SQL tanımlayıcısını güvenli hale getir (tablo/kolon adları dosyadan geliyor)."""
    clean = re.sub(r"[^A-Za-z0-9_]", "_", name.strip())
    if not clean or not SAFE_IDENT.match(clean):
        clean = "c_" + clean
    return f'"{clean}"'


def convert(value: str):
    """CSV hücresini int/float/str'e çevir (SQLite doğru sıralasın diye)."""
    if value == "":
        return None
    try:
        if re.fullmatch(r"-?\d+", value):
            return int(value)
        if re.fullmatch(r"-?\d+\.\d+([eE][-+]?\d+)?", value):
            return float(value)
    except ValueError:
        pass
    return value


# ---------------------------------------------------------------------------
# Şema
# ---------------------------------------------------------------------------
BASE_SCHEMA = """
CREATE TABLE IF NOT EXISTS snapshots (
    snapshot_id      TEXT PRIMARY KEY,
    save_uid         TEXT,
    game_date        TEXT,
    exported_at      TEXT,
    reason           TEXT,
    user_teamid      INTEGER,
    user_team_name   TEXT,
    transfer_budget  INTEGER,
    wage_budget      INTEGER,
    exporter_version TEXT,
    files            TEXT,
    imported_at      TEXT DEFAULT (datetime('now'))
);
CREATE TABLE IF NOT EXISTS events (
    id         INTEGER PRIMARY KEY AUTOINCREMENT,
    save_uid   TEXT,
    game_date  TEXT,
    event      TEXT,
    event_id   INTEGER,
    real_time  TEXT
);
CREATE INDEX IF NOT EXISTS ix_events_save_date ON events(save_uid, game_date);
CREATE TABLE IF NOT EXISTS schema_fields (
    snapshot_id TEXT,
    table_name  TEXT,
    field_name  TEXT,
    field_type  TEXT,
    depth       INTEGER,
    rangelow    INTEGER,
    rangehigh   INTEGER
);
CREATE TABLE IF NOT EXISTS _state (
    key   TEXT PRIMARY KEY,
    value TEXT
);
CREATE TABLE IF NOT EXISTS branches (
    save_uid       TEXT NOT NULL,
    branch         INTEGER NOT NULL,
    parent_branch  INTEGER,
    fork_date      TEXT,
    first_snapshot TEXT,
    PRIMARY KEY (save_uid, branch)
);
"""

# Eski veritabanlarına eklenen snapshots kolonları
SNAPSHOT_EXTRA_COLUMNS = {"branch": "INTEGER", "branch_reason": "TEXT"}


def get_state(con: sqlite3.Connection, key: str, default: str = "") -> str:
    row = con.execute("SELECT value FROM _state WHERE key = ?", (key,)).fetchone()
    return row[0] if row else default


def set_state(con: sqlite3.Connection, key: str, value: str) -> None:
    con.execute(
        "INSERT INTO _state(key, value) VALUES(?, ?) "
        "ON CONFLICT(key) DO UPDATE SET value = excluded.value",
        (key, value),
    )


def table_columns(con: sqlite3.Connection, table: str) -> list[str]:
    return [r[1] for r in con.execute(f"PRAGMA table_info({ident(table)})")]


def ensure_raw_table(con: sqlite3.Connection, table: str, columns: list[str]) -> None:
    existing = table_columns(con, table)
    if not existing:
        cols = ", ".join(f"{ident(c)}" for c in columns)
        con.execute(f"CREATE TABLE {ident(table)} (snapshot_id TEXT NOT NULL, {cols})")
        con.execute(
            f"CREATE INDEX IF NOT EXISTS {ident('ix_' + table + '_snap')} "
            f"ON {ident(table)}(snapshot_id)"
        )
        ensure_raw_indexes(con, table)
        return
    existing_clean = {c.lower() for c in existing}
    for c in columns:
        clean = ident(c).strip('"')
        if clean.lower() not in existing_clean:
            log(f"  {table}: yeni kolon eklendi -> {clean}")
            con.execute(f"ALTER TABLE {ident(table)} ADD COLUMN {ident(c)}")
            existing_clean.add(clean.lower())
    ensure_raw_indexes(con, table)


# Bu kolonlar varsa (snapshot_id, kolon) bileşik index'i kurulur: view join'leri ve oyuncu geçmişi için.
INDEXED_KEYS = ("playerid", "teamid")


def ensure_raw_indexes(con: sqlite3.Connection, table: str) -> None:
    cols = {c.lower(): c for c in table_columns(con, table)}
    for key in INDEXED_KEYS:
        if key not in cols:
            continue
        name = ident(f"ix_{table}_snap_{key}").strip('"')
        if con.execute("SELECT 1 FROM sqlite_master WHERE type='index' AND name=?", (name,)).fetchone():
            continue
        con.execute(f"CREATE INDEX {ident(name)} ON {ident(table)}(snapshot_id, {ident(cols[key])})")
        log(f"  index eklendi: {name}")


# ---------------------------------------------------------------------------
# Import
# ---------------------------------------------------------------------------
def import_csv(con: sqlite3.Connection, export_dir: Path, snap: str, name: str) -> int:
    path = export_dir / f"{snap}__{name}.csv"
    if not path.exists():
        log(f"  eksik dosya, atlandı: {path.name}")
        return 0
    with path.open(newline="", encoding="utf-8", errors="replace") as fh:
        reader = csv.reader(fh)
        try:
            header = next(reader)
        except StopIteration:
            return 0
        raw = f"raw_{name}"
        ensure_raw_table(con, raw, header)
        cols = ", ".join(ident(c) for c in header)
        marks = ", ".join("?" for _ in range(len(header) + 1))
        sql = f"INSERT INTO {ident(raw)} (snapshot_id, {cols}) VALUES ({marks})"
        batch, n = [], 0
        for row in reader:
            if len(row) < len(header):
                row += [""] * (len(header) - len(row))
            batch.append([snap] + [convert(v) for v in row[: len(header)]])
            if len(batch) >= 5000:
                con.executemany(sql, batch)
                n += len(batch)
                batch.clear()
        if batch:
            con.executemany(sql, batch)
            n += len(batch)
    return n


def import_schema(con: sqlite3.Connection, export_dir: Path, snap: str) -> None:
    path = export_dir / f"{snap}__schema.json"
    if not path.exists():
        return
    try:
        schema = json.loads(path.read_text(encoding="utf-8", errors="replace"))
    except json.JSONDecodeError as exc:
        log(f"  schema.json okunamadı: {exc}")
        return
    con.execute("DELETE FROM schema_fields")  # sadece en son şemayı tut
    rows = []
    for tname, fields in (schema or {}).items():
        for f in fields or []:
            rows.append((snap, tname, f.get("name"), str(f.get("type")),
                         f.get("depth"), f.get("rangelow"), f.get("rangehigh")))
    con.executemany("INSERT INTO schema_fields VALUES (?,?,?,?,?,?,?)", rows)
    log(f"  şema: {len(schema or {})} tablo, {len(rows)} alan")


def import_snapshot(con: sqlite3.Connection, export_dir: Path, entry: dict) -> None:
    snap = entry["snapshot_id"]
    meta_path = export_dir / f"{snap}__meta.json"
    meta = {}
    if meta_path.exists():
        try:
            meta = json.loads(meta_path.read_text(encoding="utf-8", errors="replace"))
        except json.JSONDecodeError:
            log(f"  meta.json bozuk: {meta_path.name}")
    files = entry.get("files") or meta.get("files") or []
    log(f"snapshot {snap}  (oyun tarihi {entry.get('game_date')}, {len(files)} dosya)")
    with con:
        for name in files:
            n = import_csv(con, export_dir, snap, name)
            log(f"  {name:<24} {n:>7} satır")
        import_schema(con, export_dir, snap)
        con.execute(
            "INSERT INTO snapshots (snapshot_id, save_uid, game_date, exported_at, reason, "
            "user_teamid, user_team_name, transfer_budget, wage_budget, exporter_version, files) "
            "VALUES (?,?,?,?,?,?,?,?,?,?,?)",
            (
                snap,
                entry.get("save_uid") or meta.get("save_uid"),
                entry.get("game_date") or meta.get("game_date"),
                entry.get("exported_at") or meta.get("exported_at"),
                entry.get("reason"),
                meta.get("user_teamid"),
                meta.get("user_team_name"),
                meta.get("transfer_budget"),
                meta.get("wage_budget"),
                meta.get("exporter_version"),
                json.dumps(files),
            ),
        )
        assign_branch(con, snap)


# ---------------------------------------------------------------------------
# Dallar: kopyalanan kayıt slotları aynı Save UID'yi taşır ve eski bir kayıt yüklenince oyun tarihi geri gider.
# Aynı save'in birbirinden ayrılan oyunlarını "dal" olarak ayırırız:
#   * Yeni snapshot, ucu (son snapshot'ı) kendi tarihinden ileri olmayan bir dalın devamıdır.
#   * Böyle birden fazla dal varsa oyuncu verisi (OVR/POT) uca en çok benzeyen seçilir; nedeni kaydedilir.
#   * Hiçbir dala uymuyorsa (tarih bütün uçlardan geride) yeni dal açılır.
# Aynı tarihte iki kopya slot kesin ayrılamaz; branch_reason bu belirsizliği arayüze taşır.
# ---------------------------------------------------------------------------
def branch_tips(con: sqlite3.Connection, save_uid) -> list[tuple[int, str, str]]:
    """(dal, uç snapshot_id, uç oyun tarihi) listesi."""
    tips = []
    for (branch,) in con.execute(
        "SELECT DISTINCT branch FROM snapshots WHERE save_uid IS ? AND branch IS NOT NULL ORDER BY branch",
        (save_uid,),
    ).fetchall():
        snap, date = con.execute(
            "SELECT snapshot_id, game_date FROM snapshots WHERE save_uid IS ? AND branch = ? "
            "ORDER BY game_date DESC, exported_at DESC, rowid DESC LIMIT 1",
            (save_uid, branch),
        ).fetchone()
        tips.append((branch, snap, date or ""))
    return tips


def player_difference(con: sqlite3.Connection, snap_a: str, snap_b: str) -> int | None:
    """İki snapshot arasında OVR'ı ya da POT'u farklı (veya birinde olmayan) oyuncu sayısı; veri yoksa None."""
    cols = {c.lower() for c in table_columns(con, "raw_players")}
    if not {"playerid", "overallrating", "potential"} <= cols:
        return None
    if not con.execute("SELECT 1 FROM raw_players WHERE snapshot_id = ? LIMIT 1", (snap_b,)).fetchone():
        return None
    common, same = con.execute(
        "SELECT COUNT(*), SUM(a.overallrating IS b.overallrating AND a.potential IS b.potential) "
        "FROM raw_players a JOIN raw_players b ON b.playerid = a.playerid AND b.snapshot_id = ? "
        "WHERE a.snapshot_id = ?",
        (snap_b, snap_a),
    ).fetchone()
    total_a = con.execute("SELECT COUNT(*) FROM raw_players WHERE snapshot_id = ?", (snap_a,)).fetchone()[0]
    total_b = con.execute("SELECT COUNT(*) FROM raw_players WHERE snapshot_id = ?", (snap_b,)).fetchone()[0]
    return (total_a - common) + (total_b - common) + (common - (same or 0))


def assign_branch(con: sqlite3.Connection, snap: str) -> None:
    save_uid, date = con.execute(
        "SELECT save_uid, game_date FROM snapshots WHERE snapshot_id = ?", (snap,)
    ).fetchone()
    date = date or ""
    tips = [t for t in branch_tips(con, save_uid) if t[1] != snap]
    candidates = [t for t in tips if t[2] <= date]
    if not tips:
        branch, reason = 1, "ilk snapshot"
        con.execute(
            "INSERT OR IGNORE INTO branches (save_uid, branch, parent_branch, fork_date, first_snapshot) "
            "VALUES (?, 1, NULL, NULL, ?)", (save_uid, snap))
    elif len(candidates) == 1:
        branch, reason = candidates[0][0], "devam"
    elif candidates:
        # En yeni uç önde: eşit benzerlikte min() ilkini, yani tarihi en yakın dalı seçer.
        scored = [(player_difference(con, snap, tip), b)
                  for b, tip, _ in sorted(candidates, key=lambda t: t[2], reverse=True)]
        if all(s[0] is not None for s in scored):
            diff, branch = min(scored, key=lambda s: s[0])
            reason = f"devam, {len(candidates)} aday dal: oyuncu verisi en benzer ({diff} oyuncu farklı)"
        else:
            branch = max(candidates, key=lambda t: t[2])[0]
            reason = f"devam, {len(candidates)} aday dal: en yakın tarih (oyuncu verisi yok)"
    else:
        # Tarih bütün dalların ucundan geride: eski kayıt yüklendi ya da kopya slot. Ata dal, bu tarihten önceki
        # en yakın snapshot'ı içeren dal; yoksa (ilk snapshot'tan da eski) dal 1.
        prev = con.execute(
            "SELECT branch FROM snapshots WHERE save_uid IS ? AND branch IS NOT NULL AND game_date <= ? "
            "AND snapshot_id <> ? ORDER BY game_date DESC, exported_at DESC, rowid DESC LIMIT 1",
            (save_uid, date, snap),
        ).fetchone()
        parent = prev[0] if prev else 1
        branch = max(t[0] for t in tips) + 1
        latest = max(t[2] for t in tips)
        reason = f"yeni dal: oyun tarihi {latest} tarihinden geri gitti (eski kayıt ya da kopya slot)"
        con.execute(
            "INSERT INTO branches (save_uid, branch, parent_branch, fork_date, first_snapshot) VALUES (?,?,?,?,?)",
            (save_uid, branch, parent, date, snap))
    con.execute("UPDATE snapshots SET branch = ?, branch_reason = ? WHERE snapshot_id = ?", (branch, reason, snap))
    log(f"  dal {branch}: {reason}")


def ensure_branches(con: sqlite3.Connection) -> None:
    """Eski veritabanı: kolonları ekle ve dalı olmayan snapshot'lara import sırasıyla dal ata."""
    cols = {c.lower() for c in table_columns(con, "snapshots")}
    with con:
        for name, kind in SNAPSHOT_EXTRA_COLUMNS.items():
            if name not in cols:
                con.execute(f"ALTER TABLE snapshots ADD COLUMN {name} {kind}")
        pending = [r[0] for r in con.execute(
            "SELECT snapshot_id FROM snapshots WHERE branch IS NULL ORDER BY rowid").fetchall()]
        for snap in pending:
            assign_branch(con, snap)
    if pending:
        log(f"{len(pending)} eski snapshot'a dal atandı")


def import_events(con: sqlite3.Connection, export_dir: Path) -> int:
    path = export_dir / "events.jsonl"
    if not path.exists():
        return 0
    offset = int(get_state(con, "events_offset", "0") or 0)
    size = path.stat().st_size
    if size < offset:  # dosya silinip yeniden oluşturulmuş
        offset = 0
    with path.open("rb") as fh:
        fh.seek(offset)
        data = fh.read()
    # Son satır yarım olabilir: sadece tam satırları işle
    last_nl = data.rfind(b"\n")
    if last_nl < 0:
        return 0
    chunk = data[: last_nl + 1]
    rows = []
    for line in chunk.decode("utf-8", errors="replace").splitlines():
        line = line.strip()
        if not line:
            continue
        try:
            e = json.loads(line)
        except json.JSONDecodeError:
            continue
        rows.append((e.get("save_uid"), e.get("game_date"), e.get("event"),
                     e.get("event_id"), e.get("real_time")))
    with con:
        con.executemany(
            "INSERT INTO events (save_uid, game_date, event, event_id, real_time) VALUES (?,?,?,?,?)",
            rows,
        )
        set_state(con, "events_offset", str(offset + len(chunk)))
    return len(rows)


# ---------------------------------------------------------------------------
# Kolaylık view'ları (kolonlar yoksa sessizce atlanır)
# ---------------------------------------------------------------------------
VIEWS = {
    # Her save dalının en son snapshot'ı
    "v_latest_snapshot": """
        CREATE VIEW v_latest_snapshot AS
        SELECT s.* FROM snapshots s
        WHERE s.snapshot_id = (
            SELECT s2.snapshot_id FROM snapshots s2
            WHERE s2.save_uid = s.save_uid AND s2.branch IS s.branch
            ORDER BY s2.game_date DESC, s2.exported_at DESC LIMIT 1)
    """,
    # Oyuncu + isim + kulüp (her snapshot için)
    "v_player": """
        CREATE VIEW v_player AS
        SELECT p.*, n.name AS player_name,
               n.club_teamid AS club_teamid, t.teamname AS club_name
        FROM raw_players p
        LEFT JOIN raw_player_names n
               ON n.snapshot_id = p.snapshot_id AND n.playerid = p.playerid
        LEFT JOIN raw_teams t
               ON t.snapshot_id = p.snapshot_id AND t.teamid = n.club_teamid
    """,
    # En son snapshot'taki oyuncular
    "v_player_latest": """
        CREATE VIEW v_player_latest AS
        SELECT v.* FROM v_player v
        JOIN v_latest_snapshot s ON s.snapshot_id = v.snapshot_id
    """,
    # Oyuncu gelişim geçmişi (OVR/POT zaman serisi)
    "v_player_history": """
        CREATE VIEW v_player_history AS
        SELECT s.save_uid, s.branch, s.game_date, p.playerid, p.overallrating, p.potential
        FROM raw_players p JOIN snapshots s ON s.snapshot_id = p.snapshot_id
    """,
}


def ensure_views(con: sqlite3.Connection) -> None:
    for name, sql in VIEWS.items():
        exists = con.execute(
            "SELECT sql FROM sqlite_master WHERE type='view' AND name=?", (name,)
        ).fetchone()
        if exists and " ".join(exists[0].split()) == " ".join(sql.split()):
            continue
        if exists:  # tanım değişmiş (ör. dal desteği): yeniden kur
            con.execute(f"DROP VIEW {ident(name)}")
        try:
            con.execute(sql)
        except sqlite3.OperationalError as exc:
            # Gerekli tablo/kolon henüz yok (örn. ilk import öncesi) -> sonra tekrar denenir
            log(f"view atlandı ({name}): {exc}")


# ---------------------------------------------------------------------------
# player_current: v_player_latest'in index'li düz kopyası (her save'in son snapshot'ı)
# ---------------------------------------------------------------------------
def object_exists(con: sqlite3.Connection, kind: str, name: str) -> bool:
    return con.execute(
        "SELECT 1 FROM sqlite_master WHERE type=? AND name=?", (kind, name)
    ).fetchone() is not None


def latest_snapshot_ids(con: sqlite3.Connection) -> str:
    return ",".join(sorted(r[0] for r in con.execute("SELECT snapshot_id FROM v_latest_snapshot")))


def player_current_stale(con: sqlite3.Connection) -> bool:
    if not object_exists(con, "view", "v_player_latest"):
        return False
    return (not object_exists(con, "table", "player_current")
            or get_state(con, "player_current_snapshots") != latest_snapshot_ids(con))


def refresh_player_current(con: sqlite3.Connection) -> None:
    """
    v_player_latest'i player_current tablosuna yazar. Önce player_current_new kurulur, sonra tek
    transaction'da eskisiyle yer değiştirir: okuyucular hiçbir zaman boş ya da yarım tablo görmez.
    """
    started = time.perf_counter()
    snaps = latest_snapshot_ids(con)
    con.execute("DROP TABLE IF EXISTS player_current_new")
    # v_player_latest ile aynı satırlar. IN biçimi raw_players'ı index'ten okur; view'ın kendisi her satır
    # için son snapshot'ı yeniden hesaplıyor (20k × 12 snapshot'ta ~6 kat yavaş).
    con.execute(
        "CREATE TABLE player_current_new AS SELECT v.* FROM v_player v "
        "WHERE v.snapshot_id IN (SELECT snapshot_id FROM v_latest_snapshot)"
    )
    con.execute("BEGIN IMMEDIATE")
    try:
        con.execute("DROP TABLE IF EXISTS player_current")
        con.execute("ALTER TABLE player_current_new RENAME TO player_current")
        con.execute("CREATE INDEX ix_player_current_snap_playerid ON player_current(snapshot_id, playerid)")
        set_state(con, "player_current_snapshots", snaps)
        con.commit()
    except Exception:
        con.rollback()
        raise
    n = con.execute("SELECT COUNT(*) FROM player_current").fetchone()[0]
    log(f"player_current yenilendi: {n} oyuncu ({(time.perf_counter() - started) * 1000:.0f} ms)")


# ---------------------------------------------------------------------------
# Tek örnek kilidi: iki importer aynı snapshot'ı aynı anda eklemesin (ör. start.ps1 iki kez açılırsa).
# İşletim sistemi kilidi süreç bitince kendiliğinden kalkar; çöken importer kilit bırakmaz.
# ---------------------------------------------------------------------------
def acquire_lock(db: Path):
    fh = open(f"{db}.lock", "a+")
    try:
        if sys.platform == "win32":
            import msvcrt
            fh.seek(0)
            msvcrt.locking(fh.fileno(), msvcrt.LK_NBLCK, 1)
        else:
            import fcntl
            fcntl.flock(fh.fileno(), fcntl.LOCK_EX | fcntl.LOCK_NB)
    except OSError:
        fh.close()
        return None
    return fh


# ---------------------------------------------------------------------------
def run_once(con: sqlite3.Connection, export_dir: Path) -> tuple[int, int]:
    manifest = export_dir / "manifest.jsonl"
    new_snaps = 0
    if manifest.exists():
        done = {r[0] for r in con.execute("SELECT snapshot_id FROM snapshots")}
        for line in manifest.read_text(encoding="utf-8", errors="replace").splitlines():
            line = line.strip()
            if not line:
                continue
            try:
                entry = json.loads(line)
            except json.JSONDecodeError:
                continue
            # Günlük hafif export'lar (fc_export.lua 0.5.0, partial=true) tam snapshot değildir: tools/saveimport bindirir.
            if entry.get("partial"):
                continue
            if entry.get("snapshot_id") and entry["snapshot_id"] not in done:
                import_snapshot(con, export_dir, entry)
                done.add(entry["snapshot_id"])
                new_snaps += 1
    new_events = import_events(con, export_dir)
    if new_snaps:
        ensure_views(con)
    if player_current_stale(con):  # yeni snapshot ya da önceki yenileme yarıda kalmış
        refresh_player_current(con)
    return new_snaps, new_events


def main(argv: list[str] | None = None) -> int:
    ap = argparse.ArgumentParser(description="FC export klasörünü SQLite'a aktar")
    ap.add_argument("export_dir", type=Path, help="fc_export.lua OUT_DIR klasörü")
    ap.add_argument("--db", type=Path, default=Path(DEFAULT_DB), help="SQLite dosyası")
    ap.add_argument("--watch", type=float, default=0, help="N saniyede bir kontrol et (0 = tek sefer)")
    args = ap.parse_args(argv)

    if not args.export_dir.is_dir():
        log(f"klasör bulunamadı: {args.export_dir}")
        return 1

    lock = acquire_lock(args.db)
    if lock is None:
        log(f"başka bir importer bu veritabanına yazıyor: {args.db} (ikinci bir start.ps1 açık mı?)")
        return 2

    con = sqlite3.connect(args.db)
    con.execute("PRAGMA journal_mode=WAL")  # dashboard okurken import yazabilsin
    con.executescript(BASE_SCHEMA)
    ensure_branches(con)
    with con:  # eski sürümle oluşmuş veritabanlarına bileşik index'leri ekle
        for (table,) in con.execute(
            "SELECT name FROM sqlite_master WHERE type='table' AND name LIKE 'raw\\_%' ESCAPE '\\'"
        ).fetchall():
            ensure_raw_indexes(con, table)
    ensure_views(con)

    try:
        while True:
            snaps, events = run_once(con, args.export_dir)
            if snaps or events or not args.watch:
                log(f"tamam: {snaps} yeni snapshot, {events} yeni event -> {args.db}")
            if not args.watch:
                break
            time.sleep(args.watch)
    except KeyboardInterrupt:
        log("durduruldu")
    finally:
        con.close()
        lock.close()
    return 0


if __name__ == "__main__":
    sys.exit(main())
