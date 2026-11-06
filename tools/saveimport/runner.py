"""One-shot / polling folder importer. No source file is locked or modified."""
from pathlib import Path
from datetime import datetime, timezone
import hashlib
import json
import sqlite3
import time

from .reader import read_save, FormatError
from .store import BLOCK_VERSION, initialize, legacy, load_config, import_exports, import_save, upgrade_backed_up_saves, refresh, record_issue


def check_destinations(sources, database, backups):
    for source in sources:
        parent = source.resolve().parent
        for destination in (database.resolve(), backups.resolve()):
            if destination == parent or parent in destination.parents:
                raise ValueError("Database/backups must be outside the game's save directory")


DEFAULT_KEEP_BACKUPS = 10

# Başarıyla içe aktarılmış kayıt dosyalarının (yol, boyut, zaman) hafızası; açılışta değişmemiş kayıtlar kopyalanıp
# yeniden ayrıştırılmaz. Okuyucu sürümü ya da eşleme ayarları değişince hafıza geçersiz sayılır.
FILE_STATE_SQL = ("CREATE TABLE IF NOT EXISTS import_file_state (path TEXT PRIMARY KEY, size INTEGER NOT NULL, "
                  "mtime_ns INTEGER NOT NULL, version TEXT NOT NULL)")


def reader_version(mapping, fields):
    config = json.dumps([mapping, fields], sort_keys=True, ensure_ascii=False).encode()
    return f"{BLOCK_VERSION}:{hashlib.sha256(config).hexdigest()[:16]}"


def known_files(database: Path, version: str) -> dict:
    """Salt-okur bakış; tablo ya da DB yoksa boş. Kilit almaz, yazıcıyı beklemez."""
    if not database.is_file():
        return {}
    try:
        con = sqlite3.connect(f"file:{database.as_posix()}?mode=ro", uri=True, timeout=5)
        try:
            rows = con.execute("SELECT path,size,mtime_ns FROM import_file_state WHERE version=?", (version,)).fetchall()
        finally:
            con.close()
    except sqlite3.Error:
        return {}
    return {path: (size, mtime) for path, size, mtime in rows}


def prune_backups(backups: Path, keep: int):
    """Kayıt yedeklerinden en yeni `keep` tanesini tutar (her biri ~16 MB); yarım kalmış kopyaları da siler.
    Oyunun kayıt klasörüne dokunmaz: yedek klasörü check_destinations ile ondan ayrı."""
    if keep < 1 or not backups.is_dir():
        return 0
    files = sorted(backups.glob("*.save"), key=lambda f: f.stat().st_mtime_ns, reverse=True)
    removed = 0
    for old in files[keep:] + [f for f in backups.glob("*.partial") if time.time() - f.stat().st_mtime > 3600]:
        try:
            old.unlink()
            removed += 1
        except OSError:
            pass
    return removed


def run_once(source: Path, database: Path, backups: Path, export_dir: Path | None = None,
             keep_backups: int = DEFAULT_KEEP_BACKUPS, seen: dict | None = None):
    """source: kayıt klasörü, tek kayıt dosyası ya da bunların listesi (oyunun klasörü + elle eklenen dosyalar).
    seen: izleyicinin hafızası (yol → (boyut, zaman)); değişmemiş kayıtlar yeniden kopyalanıp açılmaz."""
    sources = []
    for item in source if isinstance(source, (list, tuple)) else [source]:
        sources += item.glob("CmMgrC*") if item.is_dir() else [item]
    sources = sorted({p for p in sources if p.is_file()}, key=lambda p: p.stat().st_mtime_ns)
    check_destinations(sources, database, backups)
    mapping, fields = load_config()
    version = reader_version(mapping, fields)
    stored = known_files(database, version)
    copies, failures, read_errors = [], [], []
    for path in sources:
        stat = path.stat()
        if seen is not None and seen.get(str(path)) == (stat.st_size, stat.st_mtime_ns):
            continue
        if stored.get(str(path.resolve())) == (stat.st_size, stat.st_mtime_ns):
            if seen is not None:
                seen[str(path)] = (stat.st_size, stat.st_mtime_ns)
            continue
        try:
            save, copy = read_save(path, backups)
            copies.append((path, save, copy, stat))
        except (OSError, ValueError) as exc:
            failures.append(f"{path.name}: {exc}")
            read_errors.append((path, str(exc)))
    lock = legacy.acquire_lock(database)
    if lock is None:
        raise RuntimeError("Another importer owns the database; stop it or retry next poll")
    con = sqlite3.connect(database, timeout=30)
    try:
        con.execute("PRAGMA journal_mode=WAL")
        initialize(con)
        con.execute("BEGIN IMMEDIATE")
        try:
            for (key,) in con.execute("SELECT source_key FROM import_issues WHERE source_key LIKE 'save-file:%'").fetchall():
                if not Path(key[len('save-file:'):]).exists():
                    con.execute("DELETE FROM import_issues WHERE source_key=?", (key,))
            for path, error in read_errors:
                record_issue(con, "save-file:" + str(path.resolve()), path.name, error)
            exports = import_exports(con, export_dir, mapping, fields, failures) if export_dir else 0
            saves, successful = upgrade_backed_up_saves(con, fields), []
            for path, save, copy, copied_stat in copies:
                key = "save-file:" + str(path.resolve())
                con.execute("SAVEPOINT save_item")
                try:
                    written = datetime.fromtimestamp(copied_stat.st_mtime, timezone.utc).isoformat()
                    saves += import_save(con, save, path, copy, mapping, fields, written_at=written) is not None
                    con.execute("DELETE FROM import_issues WHERE source_key=?", (key,))
                    con.execute("RELEASE save_item")
                    successful.append((path, copied_stat))
                except (OSError, ValueError, sqlite3.IntegrityError) as exc:
                    con.execute("ROLLBACK TO save_item")
                    con.execute("RELEASE save_item")
                    record_issue(con, key, path.name, exc)
                    failures.append(f"{path.name}: {exc}")
            if exports or saves:
                refresh(con)
            con.execute(FILE_STATE_SQL)
            con.executemany("INSERT OR REPLACE INTO import_file_state VALUES (?,?,?,?)",
                            ((str(path.resolve()), st.st_size, st.st_mtime_ns, version) for path, st in successful))
            con.commit()
        except Exception:
            con.rollback()
            raise
        if seen is not None:
            for path, copied_stat in successful:
                # A second game write after the copy must remain visible to the next poll.
                seen[str(path)] = (copied_stat.st_size, copied_stat.st_mtime_ns)
        if copies:
            prune_backups(backups, keep_backups)
        if export_dir:
            try:
                legacy.import_events(con, export_dir)
                con.execute("DELETE FROM import_issues WHERE source_key='events'")
            except (OSError, ValueError, TypeError, AttributeError, OverflowError) as exc:
                record_issue(con, "events", "events.jsonl", exc)
                failures.append(f"events.jsonl: {exc}")
            con.commit()
        return {"exports": exports, "saves": saves, "errors": failures, "database": str(database)}
    finally:
        con.close()
        lock.close()


def watch(source, database, backups, export_dir, seconds, keep_backups=DEFAULT_KEEP_BACKUPS):
    if seconds < 1:
        raise ValueError("Watch interval must be at least one second")
    seen = {}
    while True:
        try:
            result = run_once(source, database, backups, export_dir, keep_backups, seen)
            if result["exports"] or result["saves"] or result["errors"]:
                print(result, flush=True)
        except (OSError, ValueError, TypeError, OverflowError, RuntimeError, sqlite3.Error) as exc:
            print(f"Import deferred: {exc}", flush=True)
        time.sleep(seconds)
