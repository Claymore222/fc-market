"""Yıldız aday script'lerini oyun olmadan, gerçek Lua koduyla ve script öncesi kayıt üzerinde çalıştırır.

Oyuna ve C:/FCExport/m0 durum dosyalarına dokunmaz; LE'nin tablo API'si bellekte taklit edilir. Sonucu JSON olarak yazar.
Geliştirme aracıdır, `pip install lupa` gerekir (uygulama paketine girmez).

    python tools/sim_star_scripts.py --out sim.json [--snapshot <id>] [--repair]
"""
import argparse
import json
import os
import shutil
import sqlite3
import tempfile
import time
from pathlib import Path

import lupa

ROOT = Path(__file__).resolve().parents[1]
MODS = ROOT / "exporter/lua/mods"
M0 = Path("C:/FCExport/m0")
LE_LIBS = "C:/FC 27 LE v27.1.6/lua/libs/v2/?.lua"
DEFAULT_SNAPSHOT = "save_2826f0ff59ba4800b5a6cb5dcff8122_ba1b81b3851b7e9cc2ad7bff_20260701"
GAME_DATE = (2026, 7, 23)
USER_TEAM = 1924
PLAYER_EXTRA = ["playerid", "overallrating", "potential", "modifier", "birthdate", "preferredposition1", "preferredposition2", "gender",
                "trait1", "trait2", "icontrait1", "icontrait2", "height", "weight"]
TABLES = {"leagues": ["leagueid", "isinternationalleague", "iswomencompetition", "leaguename"],
          "leagueteamlinks": ["leagueid", "teamid"], "teamplayerlinks": ["playerid", "teamid"]}

MOCK = r"""
SIM = { tables = {}, reads = 0, writes = 0 }
local TABLE = {}
TABLE.__index = TABLE
function TABLE:GetFirstRecord() self.i = 1 return self.rows[1] and 1 or 0 end
function TABLE:GetNextValidRecord() self.i = self.i + 1 return self.rows[self.i] and self.i or 0 end
function TABLE:GetRecordFieldValue(rec, field) SIM.reads = SIM.reads + 1 return self.rows[rec][field] end
function TABLE:SetRecordFieldValue(rec, field, value) SIM.writes = SIM.writes + 1 self.rows[rec][field] = value end
function SIM.add(name, rows, fields)
    local set = {}
    for _, f in ipairs(fields) do set[f] = true end
    SIM.tables[name] = setmetatable({ rows = rows, fields = set, i = 0 }, TABLE)
end
LE = { db = {} }
function LE.db:GetTable(name) return SIM.tables[name] end
function GetCurrentDate() return SIM.date end
function GetUserTeamID() return SIM.user_team end
function GetTeamName(id) return SIM.team_names[id] or ("#" .. tostring(id)) end
function GetPlayerName(id) return SIM.player_names[id] or ("#" .. tostring(id)) end
print = function() end
function dofile(path)
    local file = assert(io.open(path, "r"))
    local text = file:read("a")
    file:close()
    text = text:gsub('FCM_DIR = "[^"]*"', 'FCM_DIR = "' .. SIM.mods .. '"')
    local value = assert(load(text, "@" .. path))()
    if type(value) == "table" and value.read_rows then
        value.OUT_DIR = SIM.out_dir
        value.loaned_out_set = function() return {} end
        value.date_str = function() return string.format("%04d-%02d-%02d", SIM.date.year, SIM.date.month, SIM.date.day) end
        value.user_team_id = function() return SIM.user_team end
    end
    return value
end
"""


def literal(value):
    if value is None:
        return "nil"
    if isinstance(value, str):
        return json.dumps(value, ensure_ascii=False)
    return str(int(value)) if float(value) == int(value) else str(value)


def lua_rows(rows, fields):
    parts = []
    for row in rows:
        items = [f"{f}={literal(row[f])}" for f in fields if row[f] is not None]
        parts.append("{" + ",".join(items) + "}")
    return "return {" + ",\n".join(parts) + "}"


def load_weights_attributes(lua):
    return list(lua.eval(f'dofile("{(MODS / "fcm_weights.lua").as_posix()}")').attributes.values())


def configured(path, replacements):
    text = path.read_text(encoding="utf-8").replace('FCM_DIR = "C:/FC 27 LE v27.1.6/lua/scripts/"', f'FCM_DIR = "{MODS.as_posix()}/"')
    for old, new in replacements.items():
        assert old in text, old
        text = text.replace(old, new)
    return text


def run(snapshot, out, repair=False):
    con = sqlite3.connect("file:C:/FCExport/fc_career.db?mode=ro", uri=True, timeout=60)
    con.row_factory = sqlite3.Row
    lua = lupa.LuaRuntime(unpack_returned_tuples=True)
    lua.execute(f'package.path = "{LE_LIBS};" .. package.path')
    lua.execute(MOCK)
    work = tempfile.mkdtemp().replace(os.sep, "/")
    sim = lua.globals().SIM
    sim.out_dir = work
    sim.mods = MODS.as_posix() + "/"
    sim.user_team = USER_TEAM
    sim.date = lua.table_from({"year": GAME_DATE[0], "month": GAME_DATE[1], "day": GAME_DATE[2]})
    attributes = load_weights_attributes(lua)
    fields = list(dict.fromkeys(PLAYER_EXTRA + attributes))
    rows = con.execute(f"SELECT {','.join(fields)} FROM raw_players WHERE snapshot_id=?", (snapshot,)).fetchall()
    lua.globals().__rows = lua.execute(lua_rows(rows, fields))
    sim.add("players", lua.globals().__rows, lua.table_from(fields))
    for name, table_fields in TABLES.items():
        present = {r[1] for r in con.execute(f"PRAGMA table_info(raw_{name})")}
        use = [f for f in table_fields if f in present]
        sim.add(name, lua.execute(lua_rows(con.execute(f"SELECT {','.join(use)} FROM raw_{name} WHERE snapshot_id=?", (snapshot,)).fetchall(), use)), lua.table_from(use))
    teams = dict(con.execute("SELECT teamid,teamname FROM raw_teams WHERE snapshot_id=?", (snapshot,)).fetchall())
    names = dict(con.execute("SELECT playerid,MAX(name) FROM raw_player_names WHERE name IS NOT NULL GROUP BY playerid").fetchall())
    sim.team_names = lua.table_from(teams)
    sim.player_names = lua.table_from(names)

    if repair:
        shutil.copy(M0 / "star_prospects_state.json", work)
        styles_file = M0 / "star_playstyles_state.json"
        shutil.copy(styles_file, work)
        applied = {p["playerid"]: p["after"] for p in json.loads(styles_file.read_text(encoding="utf-8"))["players"]}
        table = lua.globals().__rows
        for i in range(1, len(rows) + 1):
            for field, value in applied.get(table[i]["playerid"], {}).items():
                table[i][field] = value
        before = {table[i]["playerid"]: {f: table[i][f] for f in fields} for i in range(1, len(rows) + 1)}
        script = configured(MODS / "fcm_star_duzelt.lua", {"local DRY_RUN = true": "local DRY_RUN = false"})
        started = time.perf_counter()
        lua.execute(script)
        Path(out).write_text(json.dumps({"snapshot": snapshot, "seconds": time.perf_counter() - started, "reads": sim.reads, "writes": sim.writes, "before": before,
                                         "after": {table[i]["playerid"]: {f: table[i][f] for f in fields} for i in range(1, len(rows) + 1)},
                                         "state": json.loads(Path(work, "star_prospects_state.json").read_text(encoding="utf-8")),
                                         "styles": json.loads(Path(work, "star_playstyles_state.json").read_text(encoding="utf-8")),
                                         "attributes": attributes}, ensure_ascii=False), encoding="utf-8")
        shutil.copy(Path(work, "star_prospects.txt"), Path(out).with_suffix(".prospects.txt"))
        shutil.copy(Path(work, "star_playstyles.txt"), Path(out).with_suffix(".playstyles.txt"))
        first = sim.writes
        lua.execute(script)
        print("ilk çalıştırma yazımı", first, "ikinci çalıştırmayla toplam", sim.writes)
        return

    times = {}
    for label, path, replacements in (
        ("prospects", MODS / "fcm_star_prospects.lua", {"local DRY_RUN = true": "local DRY_RUN = false", "local TEAM_IDS = { 1924 }": "local TEAM_IDS = {}", "local ALL_TEAMS = false": "local ALL_TEAMS = true"}),
        ("playstyles", MODS / "fcm_star_playstyles.lua", {"local DRY_RUN = true": "local DRY_RUN = false"}),
    ):
        sim.reads, sim.writes = 0, 0
        started = time.perf_counter()
        lua.execute(configured(path, replacements))
        times[label] = {"reads": sim.reads, "writes": sim.writes, "seconds": round(time.perf_counter() - started, 2)}

    state = json.loads(Path(work, "star_prospects_state.json").read_text(encoding="utf-8"))
    styles_path = Path(work, "star_playstyles_state.json")
    styles = json.loads(styles_path.read_text(encoding="utf-8")) if styles_path.exists() else {"players": []}
    final = {}
    ids = {p["playerid"] for p in state["players"]} | {p["playerid"] for p in styles["players"]}
    table = lua.globals().__rows
    for i in range(1, len(rows) + 1):
        row = table[i]
        if row["playerid"] in ids:
            final[row["playerid"]] = {f: row[f] for f in fields}
    Path(out).write_text(json.dumps({"snapshot": snapshot, "times": times, "state": state, "styles": styles, "final": final,
                                     "attributes": attributes, "fields": fields}, ensure_ascii=False), encoding="utf-8")
    shutil.copy(Path(work, "star_prospects.txt"), Path(out).with_suffix(".prospects.txt"))
    shutil.copy(Path(work, "star_playstyles.txt"), Path(out).with_suffix(".playstyles.txt"))
    print(times, len(state["players"]), len(styles["players"]))


if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("--out", required=True)
    parser.add_argument("--snapshot", default=DEFAULT_SNAPSHOT)
    parser.add_argument("--repair", action="store_true", help="güncel kariyeri fcm_star_duzelt.lua ile düzelt (durum dosyalarının kopyası kullanılır)")
    args = parser.parse_args()
    run(args.snapshot, args.out, args.repair)
