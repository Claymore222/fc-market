"""Atomic, provenance-aware import. All game field references come from config.

The existing export importer is used only for its schema/views/lock helpers.
It is never edited and no bytecode is written in exporter/.
"""
from __future__ import annotations

import csv
from datetime import date, datetime, timezone
import hashlib
import importlib.util
import json
import math
from pathlib import Path
import re
import sqlite3
import sys

from . import career
from .reader import ROOT, FormatError, Save, checked, parse_bytes, unpack


def load_config():
    return (json.loads((ROOT / "config/save-map.json").read_text(encoding="utf-8")),
            json.loads((ROOT / "config/field-map.json").read_text(encoding="utf-8")))


def legacy_module():
    spec = importlib.util.spec_from_file_location("fc_export_importer", ROOT / "exporter/tools/importer.py")
    module = importlib.util.module_from_spec(spec)
    old = sys.dont_write_bytecode
    try:
        sys.dont_write_bytecode = True
        spec.loader.exec_module(module)
    finally:
        sys.dont_write_bytecode = old
    return module


legacy = legacy_module()


def ident(name):
    if not re.fullmatch(r"[A-Za-z_][A-Za-z0-9_]*", name):
        raise ValueError(f"Unsafe identifier: {name}")
    return '"' + name + '"'


def now():
    return datetime.now(timezone.utc).isoformat()


def slot_uid(title, team):
    return "slot-" + hashlib.sha256(f"{title}|{team}".encode()).hexdigest()[:24]


def identity(save: Save, source: Path, mapping: dict, fields: dict) -> dict:
    h = mapping["header"]
    anchor = save.container.find(bytes.fromhex(h["anchorHex"]))
    if anchor < 0:
        raise FormatError("Career header not found")
    day, month, year = checked(save.container, anchor + h["dateOffset"], 3)
    game_date = date(h["yearBase"] + year, month, day).isoformat()
    team = unpack("<I", save.container, anchor + h["teamOffset"])[0]
    title = checked(save.container, h["titleOffset"], h["titleLength"]).split(b"\0", 1)[0].decode("utf-8")
    im = mapping["identity"]
    matches = [r[im["uid"]] for r in save.tables.get(im["table"], type("Empty", (), {"rows": []})()).rows
               if all(r.get(k) == v for k, v in im["match"].items())]
    if len(matches) > 1:
        raise FormatError("Ambiguous Live Editor UID")
    # Dosya adı her kayıtta değişir; LE kimliği yokken kariyeri yuva başlığı ve takım tanır.
    uid = matches[0] if matches else slot_uid(title, team)
    if not re.fullmatch(r"[A-Za-z0-9_-]{8,80}", uid):
        raise FormatError("Invalid career UID")
    tm = fields["team"]
    teams = save.tables[tm["table"]].rows
    team_name = next((r[tm["name"]] for r in teams if r[tm["id"]] == team), None)
    # The title survives filename changes when the game rewrites a slot.
    slot = hashlib.sha256((uid + "\0" + title).encode()).hexdigest()[:24]
    # Gözlem zamanı = oyunun dosyayı yazdığı an (içeri aktarma anı değil): varsayılan kariyer/dal bunu kullanır.
    written = datetime.fromtimestamp(source.stat().st_mtime, timezone.utc).isoformat() if source.exists() else None
    return {"save_uid": uid, "game_date": game_date, "user_teamid": team, "user_team_name": team_name,
            "slot": slot, "slot_title": title, "source_path": str(source.resolve()), "exported_at": written}


def fingerprint(tables: dict, fields: dict) -> str:
    """Use all core player/link data to avoid merging divergent same-day branches."""
    digest = hashlib.sha256()
    for section, key in (("player", "id"), ("squadLink", "playerId")):
        name = fields[section]["table"]
        rows = tables.get(name, [])
        normalized = [json.dumps(r, sort_keys=True, ensure_ascii=False, separators=(",", ":")) for r in rows]
        digest.update("\n".join(sorted(normalized)).encode())
    return digest.hexdigest()


def initialize(con):
    con.executescript(legacy.BASE_SCHEMA)
    legacy.ensure_branches(con)
    columns = {r[1] for r in con.execute("PRAGMA table_info(snapshots)")}
    for name, definition in (("source", "TEXT NOT NULL DEFAULT 'export'"), ("revision", "INTEGER NOT NULL DEFAULT 0")):
        if name not in columns:
            con.execute(f"ALTER TABLE snapshots ADD COLUMN {name} {definition}")
    con.executescript("""
        CREATE TABLE IF NOT EXISTS save_slots (
          slot TEXT PRIMARY KEY, save_uid TEXT NOT NULL, branch INTEGER NOT NULL,
          title TEXT NOT NULL, source_path TEXT NOT NULL, last_date TEXT);
        CREATE TABLE IF NOT EXISTS snapshot_sources (
          source_key TEXT PRIMARY KEY, snapshot_id TEXT NOT NULL, source TEXT NOT NULL,
          content_hash TEXT, backup_path TEXT, observed_at TEXT NOT NULL);
        CREATE TABLE IF NOT EXISTS snapshot_tables (
          snapshot_id TEXT NOT NULL, table_name TEXT NOT NULL, source TEXT NOT NULL,
          PRIMARY KEY(snapshot_id, table_name));
        CREATE TABLE IF NOT EXISTS snapshot_fingerprints (
          snapshot_id TEXT PRIMARY KEY, fingerprint TEXT NOT NULL);
        CREATE TABLE IF NOT EXISTS save_block_versions (source_key TEXT PRIMARY KEY, version INTEGER NOT NULL);
        CREATE TABLE IF NOT EXISTS save_heads (
          slot TEXT PRIMARY KEY, snapshot_id TEXT NOT NULL, source_path TEXT NOT NULL, written_at TEXT NOT NULL);
        CREATE TABLE IF NOT EXISTS import_issues (
          source_key TEXT PRIMARY KEY, file_name TEXT NOT NULL, message TEXT NOT NULL,
          first_seen TEXT NOT NULL, last_seen TEXT NOT NULL);
        CREATE TABLE IF NOT EXISTS import_warnings (
          source_key TEXT PRIMARY KEY, file_name TEXT NOT NULL, message TEXT NOT NULL,
          first_seen TEXT NOT NULL, last_seen TEXT NOT NULL);
        -- Günlük export'ların takip edilen oyuncuları: kayan günlük snapshot silinse de gün gün geçmiş kalır.
        CREATE TABLE IF NOT EXISTS player_daily (
          save_uid TEXT NOT NULL, branch INTEGER, game_date TEXT NOT NULL, playerid INTEGER NOT NULL,
          overall INTEGER, potential INTEGER, teamid INTEGER, PRIMARY KEY(save_uid, branch, game_date, playerid));
        -- Sezonlar arası kalıcı transfer arşivi: oyun yeni sezonda kayıt içi tabloyu sıfırlasa da geçmiş sezonlar korunur.
        CREATE TABLE IF NOT EXISTS career_transfer_archive (
          save_uid TEXT NOT NULL, branch INTEGER NOT NULL DEFAULT 0, season TEXT NOT NULL,
          transfer_date TEXT NOT NULL, playerid INTEGER NOT NULL, from_teamid INTEGER NOT NULL,
          to_teamid INTEGER NOT NULL, fee INTEGER, wage INTEGER, clause INTEGER,
          source TEXT NOT NULL, snapshot_id TEXT NOT NULL,
          PRIMARY KEY(save_uid, branch, transfer_date, playerid, from_teamid, to_teamid));
        CREATE INDEX IF NOT EXISTS ix_career_transfer_archive_career
          ON career_transfer_archive(save_uid, branch, season, transfer_date);
    """)
    legacy.ensure_views(con)
    con.commit()


def record_issue(con, key, file_name, message):
    stamp = now()
    con.execute("INSERT INTO import_issues VALUES (?,?,?,?,?) ON CONFLICT(source_key) DO UPDATE SET "
                "file_name=excluded.file_name,message=excluded.message,last_seen=excluded.last_seen",
                (key, str(file_name), str(message)[:2000], stamp, stamp))


def saved_head(con, info, snap):
    """Track the bytes currently read from a disk slot, even when their hash was already imported."""
    con.execute("INSERT INTO save_heads VALUES (?,?,?,?) ON CONFLICT(slot) DO UPDATE SET "
                "snapshot_id=excluded.snapshot_id,source_path=excluded.source_path,written_at=excluded.written_at",
                (info["slot"], snap, info["source_path"], info.get("exported_at") or now()))


def raw_tables(con):
    return [r[0] for r in con.execute("SELECT name FROM sqlite_master WHERE type='table' AND name LIKE 'raw\\_%' ESCAPE '\\'")]


def read_rows(con, table, snap):
    name = "raw_" + table
    if name not in raw_tables(con):
        return []
    cur = con.execute(f"SELECT * FROM {ident(name)} WHERE snapshot_id=?", (snap,))
    columns = [d[0] for d in cur.description]
    return [{k: v for k, v in zip(columns, r) if k != "snapshot_id"} for r in cur]


def replace_rows(con, snap, table, columns, rows, source):
    name = "raw_" + table
    if not columns:
        return
    con.execute(f"CREATE TABLE IF NOT EXISTS {ident(name)} (snapshot_id TEXT NOT NULL)")
    present = {r[1] for r in con.execute(f"PRAGMA table_info({ident(name)})")}
    for col in columns:
        if col not in present:
            con.execute(f"ALTER TABLE {ident(name)} ADD COLUMN {ident(col)}")
    con.execute(f"CREATE INDEX IF NOT EXISTS {ident('ix_save_' + table)} ON {ident(name)}(snapshot_id)")
    legacy.ensure_raw_indexes(con, name)
    con.execute(f"DELETE FROM {ident(name)} WHERE snapshot_id=?", (snap,))
    sql = f"INSERT INTO {ident(name)} (snapshot_id,{','.join(map(ident, columns))}) VALUES ({','.join('?' for _ in range(len(columns)+1))})"
    con.executemany(sql, ((snap, *(r.get(c) for c in columns)) for r in rows))
    con.execute("INSERT OR REPLACE INTO snapshot_tables VALUES (?,?,?)", (snap, table, source))
    con.execute("DELETE FROM schema_fields WHERE table_name=?", (table,))
    con.executemany("INSERT INTO schema_fields VALUES (?,?,?,?,?,?,?)", ((snap, table, c, None, None, None, None) for c in columns))


def new_branch(con, uid, snap, reason, parent=None, fork_date=None):
    branch = con.execute("SELECT COALESCE(MAX(branch),0)+1 FROM branches WHERE save_uid=?", (uid,)).fetchone()[0]
    con.execute("INSERT INTO branches VALUES (?,?,?,?,?)", (uid, branch, parent, fork_date, snap))
    return branch


def save_branch(con, info, candidate):
    slot = con.execute("SELECT s.branch,s.game_date FROM save_heads h JOIN snapshots s ON s.snapshot_id=h.snapshot_id "
                       "WHERE h.slot=?", (info["slot"],)).fetchone()
    slot = slot or con.execute("SELECT branch,last_date FROM save_slots WHERE slot=?", (info["slot"],)).fetchone()
    if slot and info["game_date"] >= (slot[1] or ""):
        # Kaydedilmeden bırakılan bir oturum eski kayda dönüşte ayrı dal açtıysa, kayıt şu an oynanan dalın export'uyla
        # eşleşir: yuva o dala geçer (başka bir yuvanın dalı değilse).
        moved = con.execute("SELECT branch FROM snapshots WHERE snapshot_id=?", (candidate,)).fetchone() if candidate else None
        if moved and moved[0] != slot[0] and not con.execute(
                "SELECT 1 FROM save_slots WHERE save_uid=? AND branch=? AND slot<>?", (info["save_uid"], moved[0], info["slot"])).fetchone():
            con.execute("UPDATE save_slots SET branch=? WHERE slot=?", (moved[0], info["slot"]))
            return moved[0]
        if not candidate and con.execute("SELECT 1 FROM snapshots WHERE save_uid=? AND branch=? AND game_date>?",
                                         (info["save_uid"], slot[0], info["game_date"])).fetchone():
            branch = new_branch(con, info["save_uid"], "", "save rollback", slot[0], info["game_date"])
            con.execute("UPDATE save_slots SET branch=? WHERE slot=?", (branch, info["slot"]))
            return branch
        return slot[0]
    branch = None
    if not slot and candidate:
        branch = con.execute("SELECT branch FROM snapshots WHERE snapshot_id=?", (candidate,)).fetchone()[0]
        used = con.execute("SELECT 1 FROM save_slots WHERE save_uid=? AND branch=?", (info["save_uid"], branch)).fetchone()
        if used:
            branch = None
    if branch is None:
        # Aynı kariyerin yeni yuvası geçmişini kaybetmesin: o güne kadarki en yeni daldan ayrılmış sayılır.
        parent = con.execute("SELECT branch FROM snapshots WHERE save_uid=? AND game_date<=? AND branch IS NOT NULL "
                             "ORDER BY game_date DESC, exported_at DESC LIMIT 1", (info["save_uid"], info["game_date"])).fetchone()
        branch = new_branch(con, info["save_uid"], candidate or "", "save slot", parent[0] if parent else None,
                            info["game_date"] if parent else None)
    con.execute("INSERT OR REPLACE INTO save_slots VALUES (?,?,?,?,?,?)",
                (info["slot"], info["save_uid"], branch, info["slot_title"], info["source_path"], info["game_date"]))
    return branch


def import_data(con, tables, columns, info, source, source_key, mapping, fields, digest=None, backup=None):
    """Caller owns BEGIN IMMEDIATE and commits once; a failure rolls back everything."""
    if con.execute("SELECT 1 FROM snapshot_sources WHERE source_key=?", (source_key,)).fetchone():
        return None
    uid, day = info["save_uid"], info["game_date"]
    date.fromisoformat(day)
    fp = fingerprint(tables, fields)
    same_day = con.execute("SELECT snapshot_id,branch,source FROM snapshots WHERE save_uid=? AND game_date=?",
                           (uid, day)).fetchall()
    candidates = []
    for snap, branch, origin in same_day:
        known = con.execute("SELECT fingerprint FROM snapshot_fingerprints WHERE snapshot_id=?", (snap,)).fetchone()
        existing_fp = known[0] if known else fingerprint(
            {fields[s]["table"]: read_rows(con, fields[s]["table"], snap) for s in ("player", "squadLink")}, fields)
        if existing_fp == fp:
            candidates.append(snap)
    if source == "save":
        # A source already bound to another slot never merges into this slot.
        export_candidates = [s for s in candidates if not con.execute(
            "SELECT 1 FROM snapshot_sources WHERE snapshot_id=? AND source='save'", (s,)).fetchone()]
        # Birden çok eşleşme (ör. kaydedilmemiş bir oturumun export'u ve sonraki oturumunki): en son export edilen, şu an
        # oynanan oturumdur.
        candidate = max(export_candidates, key=lambda s: con.execute(
            "SELECT exported_at FROM snapshots WHERE snapshot_id=?", (s,)).fetchone()[0] or "") if export_candidates else None
        branch = save_branch(con, info, candidate)
        # A different same-day export is an unconfirmed observation, never overwrite it with a save.
        own = [s for s, b, origin in same_day if b == branch and (origin == "save" or s in candidates)]
        if digest is not None:
            own = [s for s in own if s == candidate or con.execute(
                "SELECT 1 FROM snapshot_sources WHERE snapshot_id=? AND source='save' AND content_hash=?",
                (s, digest)).fetchone()]
        snap = own[-1] if own else candidate
        con.execute("UPDATE save_slots SET last_date=?,source_path=? WHERE slot=?", (day, info["source_path"], info["slot"]))
    else:
        existing_export = info.get("snapshot_id")
        if existing_export and con.execute("SELECT 1 FROM snapshots WHERE snapshot_id=?", (existing_export,)).fetchone():
            candidates = [existing_export]
        if len(candidates) > 1:
            raise FormatError("Export matches multiple save slots; import an unambiguous export/slot pair")
        snap = candidates[0] if candidates else None
        if snap and con.execute("SELECT 1 FROM snapshots WHERE save_uid=? AND branch IS "
                                "(SELECT branch FROM snapshots WHERE snapshot_id=?) AND game_date>? LIMIT 1",
                                (uid, snap, day)).fetchone():
            # Returning to identical historical bytes is still a rollback, not a continuation of that branch's future.
            snap = None
        branch = con.execute("SELECT branch FROM snapshots WHERE snapshot_id=?", (snap,)).fetchone()[0] if snap else None
    if not snap:
        snap = info.get("snapshot_id") if source == "export" else f"save_{uid}_{info['slot']}_{day.replace('-', '')}"
        if con.execute("SELECT 1 FROM snapshots WHERE snapshot_id=?", (snap,)).fetchone():
            snap += "_" + hashlib.sha256(source_key.encode()).hexdigest()[:16]
        con.execute("INSERT INTO snapshots(snapshot_id,save_uid,game_date,exported_at,reason,source,files) VALUES(?,?,?,?,?,?,?)",
                    (snap, uid, day, info.get("exported_at") or now(), source, source, "[]"))
        if branch is None:
            legacy.assign_branch(con, snap)
            branch = con.execute("SELECT branch FROM snapshots WHERE snapshot_id=?", (snap,)).fetchone()[0]
    con.execute("UPDATE snapshots SET branch=?,branch_reason=COALESCE(branch_reason,?),revision=revision+1 WHERE snapshot_id=?",
                (branch, "kayıt yuvası: " + info.get("slot_title", "export"), snap))
    con.execute("UPDATE branches SET first_snapshot=? WHERE save_uid=? AND branch=? AND first_snapshot=''", (snap, uid, branch))
    existing_save = con.execute("SELECT 1 FROM snapshot_sources WHERE snapshot_id=? AND source='save'", (snap,)).fetchone()
    for table, rows in tables.items():
        preferred = table not in mapping["merge"]["exportOnlyTables"]
        prior = con.execute("SELECT source FROM snapshot_tables WHERE snapshot_id=? AND table_name=?", (snap, table)).fetchone()
        if source == "export" and preferred and (prior and prior[0] == "save"):
            continue
        if source == "save" and not preferred:
            continue
        replace_rows(con, snap, table, columns[table], rows, source)
    # Preserve export-only budgets when a save overlays the same day.
    for key in mapping["merge"]["exportMetadata"]:
        if info.get(key) is not None:
            if source == "export":
                con.execute(f"UPDATE snapshots SET {ident(key)}=? WHERE snapshot_id=?", (info[key], snap))
            else:
                con.execute(f"UPDATE snapshots SET {ident(key)}=COALESCE({ident(key)},?) WHERE snapshot_id=?", (info[key], snap))
    con.execute("UPDATE snapshots SET source=? WHERE snapshot_id=?", ("save" if source == "save" or existing_save else "export", snap))
    con.execute("INSERT INTO snapshot_sources VALUES (?,?,?,?,?,?)", (source_key, snap, source, digest, str(backup) if backup else None, now()))
    con.execute("INSERT OR REPLACE INTO snapshot_fingerprints VALUES (?,?)", (snap, fp))
    hydrate_names(con, snap, uid, day, fields, mapping)
    files = [r[0] for r in con.execute("SELECT table_name FROM snapshot_tables WHERE snapshot_id=? ORDER BY table_name", (snap,))]
    con.execute("UPDATE snapshots SET files=? WHERE snapshot_id=?", (json.dumps(files), snap))
    if source == "save":
        saved_head(con, info, snap)
    return snap


def borrowed_names(con, uid, missing, fields):
    """Export'u olmayan kariyerde adlar başka kariyerlerin export'undan: aynı oyuncu = aynı playerid ve aynı doğum tarihi.
    Oyunun temel oyuncuları her kariyerde aynı id'yi taşır; sonradan üretilen (regen) oyuncular kariyerler arasında aynı id'yi
    alabilir, doğum tarihi onları ayırır. Her kariyerin adları olan en son snapshot'ı kullanılır."""
    names, player = fields["names"], fields["player"]
    if "raw_" + names["table"] not in raw_tables(con):
        return {}
    found, done = {}, set()
    has_names = (f"SELECT 1 FROM {ident('raw_' + names['table'])} WHERE snapshot_id=? AND {ident(names['name'])} IS NOT NULL LIMIT 1")
    for other, other_uid in con.execute("SELECT snapshot_id, save_uid FROM snapshots WHERE save_uid<>? AND source<>'daily' "
                                        "ORDER BY game_date DESC, exported_at DESC", (uid,)).fetchall():
        if other_uid in done or not con.execute(has_names, (other,)).fetchone():
            continue
        done.add(other_uid)
        born = {r[player["id"]]: r.get(player["birthdate"]) for r in read_rows(con, player["table"], other)}
        for r in read_rows(con, names["table"], other):
            pid, name = r[names["playerId"]], r[names["name"]]
            if name and pid in missing and pid not in found and pid in born and born[pid] == missing[pid]:
                found[pid] = name
        if len(found) == len(missing):
            break
    return found


def hydrate_names(con, snap, uid, day, fields, mapping):
    """Carry labels only within a career; recompute club IDs from current save links."""
    names = fields["names"]
    for table in [names["table"], *mapping["merge"]["staticTables"]]:
        if read_rows(con, table, snap):
            continue
        for (previous,) in con.execute("SELECT snapshot_id FROM snapshots WHERE save_uid=? AND game_date<=? AND snapshot_id<>? ORDER BY game_date DESC,exported_at DESC", (uid, day, snap)):
            rows = read_rows(con, table, previous)
            if rows:
                replace_rows(con, snap, table, list(rows[0]), rows, "labels")
                break
    rows = read_rows(con, names["table"], snap)
    known_names = {r[names["playerId"]]: r for r in rows}
    player = fields["player"]
    players = read_rows(con, player["table"], snap)
    rows = [dict(known_names.get(r[player["id"]],
            {names["playerId"]: r[player["id"]], names["name"]: None, names["clubTeamId"]: None}))
            for r in players]
    if not rows:
        return
    missing = {r[player["id"]]: r.get(player["birthdate"]) for r in players if known_names.get(r[player["id"]], {}).get(names["name"]) is None}
    if missing:
        borrowed = borrowed_names(con, uid, missing, fields)
        for row in rows:
            if row[names["name"]] is None and row[names["playerId"]] in borrowed:
                row[names["name"]] = borrowed[row[names["playerId"]]]
    link, league, league_link = fields["squadLink"], fields["league"], fields["leagueTeamLink"]
    domestic = {r[league["id"]] for r in read_rows(con, league["table"], snap) if r.get(league["international"]) == 0}
    clubs = {r[league_link["teamId"]] for r in read_rows(con, league_link["table"], snap) if r.get(league_link["leagueId"]) in domestic}
    affiliations = {}
    for row in read_rows(con, link["table"], snap):
        if row[link["teamId"]] in clubs:
            affiliations.setdefault(row[link["playerId"]], row[link["teamId"]])
    for row in rows:
        row[names["clubTeamId"]] = affiliations.get(row[names["playerId"]])
    replace_rows(con, snap, names["table"], list(rows[0]), rows, "export-labels/save-clubs")


def import_save(con, save, source_path, copy, mapping, fields, written_at=None):
    info = identity(save, source_path, mapping, fields)
    if written_at is not None:
        info["exported_at"] = written_at
    digest = hashlib.sha256(save.container).hexdigest()
    tables = {n: t.rows for n, t in save.tables.items()}
    columns = {n: [f.name for f in t.fields] for n, t in save.tables.items()}
    # Veritabanı dışı kariyer blokları (fikstür, canlı tablo, oyuncu istatistikleri); geçerlilik kaydın kendi tablolarıyla.
    tm, pl = fields["team"], fields["player"]
    team_ids = {r.get(tm["id"]) for r in tables.get(tm["table"], [])}
    player_ids = {r.get(pl["id"]) for r in tables.get(pl["table"], [])}
    blocks = career.read_career(save.payload, team_ids.__contains__, player_ids.__contains__, info["user_teamid"])
    key = f"save:{info['slot']}:{digest}"
    known = con.execute("SELECT snapshot_id FROM snapshot_sources WHERE source_key=?", (key,)).fetchone()
    if known:
        last_hash = con.execute("SELECT content_hash FROM snapshot_sources WHERE snapshot_id=? AND source='save' "
                                "ORDER BY observed_at DESC,rowid DESC LIMIT 1", (known[0],)).fetchone()
        if last_hash and last_hash[0] != digest:
            # Older versions reused one same-day snapshot for different save bytes. Reconstruct the current disk
            # version instead of pointing at rows subsequently overwritten by another observation.
            con.execute("DELETE FROM snapshot_sources WHERE source_key=?", (key,))
            known = None
    if known:
        saved_head(con, info, known[0])
        return upgrade_blocks(con, key, known[0], blocks)
    for name, rows in blocks.items():
        if rows:
            tables[name], columns[name] = rows, list(rows[0])
    snap = import_data(con, tables, columns, info, "save", key, mapping, fields, digest, copy)
    con.execute("INSERT OR REPLACE INTO save_block_versions VALUES (?,?)", (key, BLOCK_VERSION))
    save_budget(con, snap, blocks)
    archive_transfers(con, snap, blocks)
    return snap


def save_budget(con, snap, blocks):
    """Kayıttan gelen bütçe Live Editor olmadan da anlık görüntü başlığına yazılır; export'un değeri korunur."""
    rows = blocks.get("career_finance")
    if rows:
        con.execute("UPDATE snapshots SET transfer_budget=? WHERE snapshot_id=? AND transfer_budget IS NULL", (rows[0]["transferbudget"], snap))


def season_label(iso_date: str, start_month: int = 7) -> str:
    d = date.fromisoformat(iso_date)
    start = d.year if d.month >= start_month else d.year - 1
    return f"{start}/{str(start + 1)[-2:]}"


def archive_transfers(con, snap, blocks):
    """Kayıttan çözülen dünya ve kulüp transferlerini sezon etiketiyle kalıcı arşive yazar."""
    rows = blocks.get("career_transfers")
    if not rows or not snap:
        return
    meta = con.execute("SELECT save_uid, COALESCE(branch, 0), game_date FROM snapshots WHERE snapshot_id=?", (snap,)).fetchone()
    if not meta:
        return
    uid, branch, game_date = meta
    batch = []
    for r in rows:
        ymd = int(r["date"])
        y, m, d = ymd // 10000, ymd // 100 % 100, ymd % 100
        try:
            iso_date = date(y, m, d).isoformat()
        except ValueError:
            continue
        if game_date and iso_date > game_date:
            continue
        batch.append((uid, branch, season_label(iso_date), iso_date, int(r["playerid"]), int(r["fromteamid"]),
                      int(r["toteamid"]), r.get("fee"), r.get("wage"), r.get("clause"), r.get("source") or "world", snap))
    if not batch:
        return
    con.executemany("""
        INSERT INTO career_transfer_archive
          (save_uid, branch, season, transfer_date, playerid, from_teamid, to_teamid, fee, wage, clause, source, snapshot_id)
        VALUES (?,?,?,?,?,?,?,?,?,?,?,?)
        ON CONFLICT(save_uid, branch, transfer_date, playerid, from_teamid, to_teamid) DO UPDATE SET
          fee=COALESCE(excluded.fee, career_transfer_archive.fee),
          wage=COALESCE(excluded.wage, career_transfer_archive.wage),
          clause=COALESCE(excluded.clause, career_transfer_archive.clause),
          source=excluded.source,
          snapshot_id=excluded.snapshot_id
    """, batch)


# Kayıt bloklarının okuyucu sürümü: yeni blok eklenince artar; bilinen kayıtlar yeniden çözülür (3: kondisyon/sakatlık, 4: sezon kupaları/bonservisler, 5: gözlemci ağı ve hazırlık turnuvası, 6: yönetim hedefleri ve menajer karnesi, 7: kart ve cezalar, 8: küçük kulüp bütçesi ve maç kazanmamış menajer, 9: dünya ve kulüp transfer geçmişi).
BLOCK_VERSION = 10


def upgrade_blocks(con, key, snap, blocks):
    """Re-decode known bytes without changing branch, source dates, slot identity or DB player tables."""
    version = con.execute("SELECT version FROM save_block_versions WHERE source_key=?", (key,)).fetchone()
    if version and version[0] >= BLOCK_VERSION: return None
    latest = con.execute("SELECT source_key FROM snapshot_sources WHERE snapshot_id=? AND source='save' "
                         "ORDER BY observed_at DESC,rowid DESC LIMIT 1", (snap,)).fetchone()
    if not latest or latest[0] != key: return None  # An older same-day observation must not replace newer career data.
    changed = False
    for table, rows in blocks.items():
        if rows:
            replace_rows(con, snap, table, list(rows[0]), rows, "save")
            changed = True
    con.execute("INSERT OR REPLACE INTO save_block_versions VALUES (?,?)", (key, BLOCK_VERSION))
    if changed:
        save_budget(con, snap, blocks)
        archive_transfers(con, snap, blocks)
        con.execute("UPDATE snapshots SET revision=revision+1 WHERE snapshot_id=?", (snap,))
        return snap
    return None


def upgrade_backed_up_saves(con, fields) -> int:
    """BLOCK_VERSION arttığında yedeği hâlâ diskte duran eski kayıt anlık görüntülerini de günceller."""
    pending = con.execute("""
        SELECT ss.source_key, ss.snapshot_id, ss.backup_path, s.user_teamid
        FROM snapshot_sources ss
        JOIN snapshots s ON s.snapshot_id = ss.snapshot_id
        LEFT JOIN save_block_versions sbv ON sbv.source_key = ss.source_key
        WHERE ss.source = 'save' AND ss.backup_path IS NOT NULL AND COALESCE(sbv.version, 0) < ?
        ORDER BY s.game_date, ss.observed_at, ss.rowid
    """, (BLOCK_VERSION,)).fetchall()
    tm, pl = fields["team"], fields["player"]
    upgraded = 0
    for key, snap, backup_path, user_teamid in pending:
        path = Path(backup_path)
        if not path.is_file():
            continue
        latest = con.execute("SELECT source_key FROM snapshot_sources WHERE snapshot_id=? AND source='save' "
                             "ORDER BY observed_at DESC,rowid DESC LIMIT 1", (snap,)).fetchone()
        if not latest or latest[0] != key:
            con.execute("INSERT OR REPLACE INTO save_block_versions VALUES (?,?)", (key, BLOCK_VERSION))
            continue
        try:
            save = parse_bytes(path.read_bytes())
            team_ids = {r.get(tm["id"]) for r in save.tables[tm["table"]].rows} if tm["table"] in save.tables else set()
            player_ids = {r.get(pl["id"]) for r in save.tables[pl["table"]].rows} if pl["table"] in save.tables else set()
            blocks = career.read_career(save.payload, team_ids.__contains__, player_ids.__contains__, user_teamid)
            if upgrade_blocks(con, key, snap, blocks) is not None:
                upgraded += 1
        except (OSError, ValueError):
            continue
    return upgraded


PARTIAL_KEYS = {"players": "playerid", "teamplayerlinks": "playerid", "career_playermatchratinghistory": "playerid"}


def import_partial(con, tables, columns, info, source_key, fields):
    """Günlük hafif export (manifest partial=true): aynı kariyerin o güne kadarki en son tam snapshot'ı kopyalanır, günlük
    satırlar oyuncu bazında üzerine yazılır. Kariyer başına tek kayan günlük snapshot tutulur (öncekiler silinir); takip
    edilen oyuncuların değerleri player_daily'ye eklenir. Taban snapshot yoksa atlanır."""
    uid, day, snap = info["save_uid"], info["game_date"], info["snapshot_id"]
    # Oynanan dal: o güne kadarki en son yazılan tam veri. Başka dalın daha yeni günü tabana ve kayan günlüğe karışmaz.
    playing = con.execute("SELECT branch FROM snapshots WHERE save_uid=? AND game_date<=? AND source<>'daily' "
                          "ORDER BY exported_at DESC LIMIT 1", (uid, day)).fetchone()
    if not playing:
        return None
    base = con.execute("SELECT snapshot_id, branch FROM snapshots WHERE save_uid=? AND branch IS ? AND game_date<=? AND source<>'daily' "
                       "ORDER BY game_date DESC, exported_at DESC LIMIT 1", (uid, playing[0], day)).fetchone()
    base_snap, branch = base
    # Aynı gün tam veri (kayıt ya da ay başı export) varsa günlük gereksiz.
    if con.execute("SELECT 1 FROM snapshots WHERE save_uid=? AND game_date=? AND source<>'daily'", (uid, day)).fetchone():
        con.execute("INSERT OR IGNORE INTO snapshot_sources VALUES (?,?,?,?,?,?)", (source_key, base_snap, "daily", None, None, now()))
        return None
    for (old,) in con.execute("SELECT snapshot_id FROM snapshots WHERE save_uid=? AND branch IS ? AND source='daily'", (uid, branch)).fetchall():
        for table in raw_tables(con):
            con.execute(f"DELETE FROM {ident(table)} WHERE snapshot_id=?", (old,))
        for t in ("snapshot_tables", "snapshot_fingerprints", "snapshots"):
            con.execute(f"DELETE FROM {t} WHERE snapshot_id=?", (old,))
    con.execute("INSERT INTO snapshots(snapshot_id,save_uid,game_date,exported_at,reason,source,files,branch,branch_reason,"
                "transfer_budget,wage_budget,user_teamid,user_team_name,exporter_version) "
                "SELECT ?,save_uid,?,?,?,'daily',files,branch,?,?,?,user_teamid,user_team_name,? FROM snapshots WHERE snapshot_id=?",
                (snap, day, info.get("exported_at") or now(), info.get("reason", "auto_day"), f"günlük, taban {base_snap}",
                 info.get("transfer_budget"), info.get("wage_budget"), info.get("exporter_version"), base_snap))
    for table in raw_tables(con):
        cols = [r[1] for r in con.execute(f"PRAGMA table_info({ident(table)})") if r[1] != "snapshot_id"]
        if not cols:
            continue
        sel = ",".join(map(ident, cols))
        con.execute(f"INSERT INTO {ident(table)} (snapshot_id,{sel}) SELECT ?,{sel} FROM {ident(table)} WHERE snapshot_id=?", (snap, base_snap))
    con.execute("INSERT INTO snapshot_tables SELECT ?,table_name,source FROM snapshot_tables WHERE snapshot_id=?", (snap, base_snap))
    for table, rows in tables.items():
        key = PARTIAL_KEYS.get(table)
        if not key or not rows:
            continue
        name = "raw_" + table
        if name not in raw_tables(con):
            replace_rows(con, snap, table, columns[table], rows, "daily")
            continue
        present = {r[1] for r in con.execute(f"PRAGMA table_info({ident(name)})")}
        for col in columns[table]:
            if col not in present:
                con.execute(f"ALTER TABLE {ident(name)} ADD COLUMN {ident(col)}")
        ids = list({r.get(key) for r in rows if r.get(key) is not None})
        for i in range(0, len(ids), 500):
            chunk = ids[i:i + 500]
            con.execute(f"DELETE FROM {ident(name)} WHERE snapshot_id=? AND {ident(key)} IN ({','.join('?' * len(chunk))})", (snap, *chunk))
        cols = columns[table]
        con.executemany(f"INSERT INTO {ident(name)} (snapshot_id,{','.join(map(ident, cols))}) VALUES ({','.join('?' * (len(cols) + 1))})",
                        ((snap, *(r.get(c) for c in cols)) for r in rows))
        con.execute("INSERT OR REPLACE INTO snapshot_tables VALUES (?,?,?)", (snap, table, "daily"))
    p, link = fields["player"], fields["squadLink"]
    teams = {r.get(link["playerId"]): r.get(link["teamId"]) for r in tables.get(link["table"], [])}
    con.executemany("INSERT OR REPLACE INTO player_daily VALUES (?,?,?,?,?,?,?)",
                    ((uid, branch, day, r[p["id"]], r.get(p["overall"]), r.get(p["potential"]), teams.get(r[p["id"]]))
                     for r in tables.get(p["table"], []) if r.get(p["id"]) is not None))
    con.execute("INSERT INTO snapshot_sources VALUES (?,?,?,?,?,?)", (source_key, snap, "daily", None, None, now()))
    return snap


def read_export(directory, entry, fields):
    if not isinstance(entry, dict):
        raise FormatError("Export manifest entry must be an object")
    snap = entry.get("snapshot_id")
    if not isinstance(snap, str) or not re.fullmatch(r"[A-Za-z0-9_-]+", snap):
        raise FormatError("Invalid export snapshot ID")
    meta_path = directory / f"{snap}__meta.json"
    if not meta_path.exists():
        raise FormatError(f"Export metadata missing: {meta_path.name}")
    meta = json.loads(meta_path.read_text(encoding="utf-8-sig"))
    if not isinstance(meta, dict):
        raise FormatError("Export metadata must be an object")
    for key in ("snapshot_id", "save_uid", "game_date"):
        if key in meta and key in entry and meta[key] != entry[key]:
            raise FormatError(f"Export metadata/manifest mismatch: {key}")
    info = meta | entry
    if not isinstance(info.get("save_uid"), str) or not re.fullmatch(r"[A-Za-z0-9_-]{8,80}", info["save_uid"]):
        raise FormatError("Invalid export career UID")
    date.fromisoformat(info["game_date"])
    datetime.fromisoformat(info["exported_at"].replace("Z", "+00:00"))
    files = info.get("files")
    if not isinstance(files, list) or not files or any(not isinstance(t, str) for t in files) or len({t.lower() for t in files}) != len(files):
        raise FormatError("Invalid export table list")
    if fields["player"]["table"] not in files:
        raise FormatError("Export has no player table")
    tables, columns = {}, {}
    names = fields['names']
    for table in files:
        ident(table)
        path = directory / f"{snap}__{table}.csv"
        # Preserve invalid bytes until the exact CSV cell can be checked. Never guess a legacy encoding
        # for an otherwise valid UTF-8 file (that would corrupt every intact accented name).
        with path.open(encoding="utf-8-sig", errors="surrogateescape", newline="") as f:
            reader = csv.DictReader(f, strict=True)
            header = reader.fieldnames
            if header and any(any(0xDC80 <= ord(c) <= 0xDCFF for c in col) for col in header):
                raise FormatError(f"Invalid UTF-8 CSV header: {path.name}")
            if not header or len(header) > 1900 or len({c.lower() for c in header}) != len(header) or 'snapshot_id' in {c.lower() for c in header}:
                raise FormatError(f"Invalid CSV header: {path.name}")
            for col in header:
                ident(col)
            columns[table] = header
            rows = []
            for row in reader:
                if None in row or any(v is None for v in row.values()):
                    raise FormatError(f"Incomplete CSV row: {path.name}:{reader.line_num}")
                for col, value in row.items():
                    if not any(0xDC80 <= ord(c) <= 0xDCFF for c in value):
                        continue
                    raw = value.encode('utf-8', errors='surrogateescape')
                    try:
                        raw.decode('utf-8')
                    except UnicodeDecodeError as exc:
                        # Observed LE failure: a fixed-byte-length player name ends in a partial multibyte
                        # character immediately before the CSV delimiter. Other corruption remains fatal.
                        if table != names['table'] or col != names['name'] or exc.reason != 'unexpected end of data' or exc.end != len(raw):
                            raise FormatError(f"Invalid UTF-8 CSV cell: {path.name}:{reader.line_num}:{col}") from exc
                        row[col] = raw[:exc.start].decode('utf-8')
                converted = {k: legacy.convert(v) for k, v in row.items()}
                if any(isinstance(v, float) and not math.isfinite(v) for v in converted.values()):
                    raise FormatError(f"Non-finite CSV number: {path.name}:{reader.line_num}")
                rows.append(converted)
            tables[table] = rows
    if not tables[fields["player"]["table"]]:
        raise FormatError("Export player table is empty")
    return info, tables, columns


def clear_truncated_names(con, fields):
    """Eski içe aktarmalar kesik harfi U+FFFD olarak yazıp uyarı bırakmıştı; ikisi de bir kez temizlenir."""
    if con.execute("DELETE FROM import_warnings WHERE message LIKE '%isim sonundaki eksik UTF-8%'").rowcount <= 0:
        return 0
    table, col = ident("raw_" + fields["names"]["table"]), ident(fields["names"]["name"])
    con.execute(f"UPDATE {table} SET {col}=rtrim({col}, char(65533)) WHERE {col} LIKE '%' || char(65533)")
    return 1


def import_exports(con, directory, mapping, fields, errors=None):
    manifest = directory / "manifest.jsonl"
    active_issues = set()
    def failed(key, file, exc):
        active_issues.add(key)
        record_issue(con, key, file, exc)
        if errors is not None:
            errors.append(f"{file}: {exc}")
    try:
        lines = manifest.read_text(encoding="utf-8-sig").splitlines() if manifest.exists() else []
    except (OSError, ValueError) as exc:
        failed("manifest:read", manifest.name, exc)
        return 0
    count = clear_truncated_names(con, fields)
    for number, line in enumerate(lines, 1):
        if not line.strip():
            continue
        key = "manifest:" + hashlib.sha256(line.encode()).hexdigest()
        con.execute("SAVEPOINT export_item")
        try:
            entry = json.loads(line)
            snap = entry.get("snapshot_id") if isinstance(entry, dict) else None
            if isinstance(snap, str) and re.fullmatch(r"[A-Za-z0-9_-]+", snap):
                key = "export:" + snap
            if not con.execute("SELECT 1 FROM snapshot_sources WHERE source_key=?", (key,)).fetchone():
                info, tables, columns = read_export(directory, entry, fields)
                if info.get("partial"):
                    imported = import_partial(con, tables, columns, info, key, fields)
                else:
                    imported = import_data(con, tables, columns, info, "export", key, mapping, fields)
                if imported:
                    count += 1
            con.execute("DELETE FROM import_issues WHERE source_key=?", (key,))
            con.execute("RELEASE export_item")
        except (OSError, ValueError, TypeError, KeyError, OverflowError, csv.Error, sqlite3.IntegrityError, sqlite3.DataError) as exc:
            con.execute("ROLLBACK TO export_item")
            con.execute("RELEASE export_item")
            failed(key, f"{manifest.name}:{number}" if key.startswith("manifest:") else snap, exc)
    for (key,) in con.execute("SELECT source_key FROM import_issues").fetchall():
        if key.startswith(("manifest:", "export:")) and key not in active_issues:
            con.execute("DELETE FROM import_issues WHERE source_key=?", (key,))
    return count


def refresh(con):
    legacy.ensure_views(con)
    # Same-day merge changes rows without changing snapshot_id, so always rebuild.
    # Keep the materialized view replacement in the caller's transaction.
    try:
        con.execute("DROP TABLE IF EXISTS player_current")
        con.execute("CREATE TABLE player_current AS SELECT * FROM v_player_latest")
        legacy.set_state(con, "player_current_snapshots", legacy.latest_snapshot_ids(con))
    except sqlite3.OperationalError as exc:
        if "no such table" not in str(exc):
            raise
