"""exporter/lua/mods/fcm_profiles.lua üretir: mevki ve OVR bandına göre gerçek oyuncuların özellik aralığı.

Kaynak script'lerin dokunmadığı kariyer başı kaydı. Yıldız aday script'i özellikleri bu aralığın içinde tutar: stoperin gücü
aynı OVR'daki gerçek stoperlerin altına düşmez, başka bir özelliği de onları aşmaz.

    python tools/gen_fcm_profiles.py [--snapshot <id>]
"""
import argparse
import json
import sqlite3
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / "exporter/lua/mods/fcm_profiles.lua"
SNAPSHOT = "save_2826f0ff59ba4800b5a6cb5dcff8122_ba1b81b3851b7e9cc2ad7bff_20260701"
BANDS = range(52, 88, 4)
NEAR, WIDE, MIN_PEERS = 2, 4, 12
LOW, HIGH = 0.15, 0.90


def quantile(values, q):
    values = sorted(values)
    return values[min(len(values) - 1, int(q * len(values)))]


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--snapshot", default=SNAPSHOT)
    snapshot = parser.parse_args().snapshot
    field_map = json.loads((ROOT / "config/field-map.json").read_text(encoding="utf-8"))
    player = field_map["player"]
    attributes = list(field_map["analysisAttributes"].values())
    con = sqlite3.connect("file:C:/FCExport/fc_career.db?mode=ro", uri=True, timeout=60)
    con.row_factory = sqlite3.Row
    rows = con.execute(f'SELECT * FROM "raw_{player["table"]}" WHERE snapshot_id=? AND "{player["gender"]}"=0', (snapshot,)).fetchall()
    positions = sorted(field_map["positions"].items(), key=lambda kv: kv[1])
    lines = ["-- ÜRETİLDİ: tools/gen_fcm_profiles.py. Elle düzenleme.", "return {",
             "    attributes = { " + ", ".join(json.dumps(a) for a in attributes) + " },",
             f"    bands = {{ {', '.join(str(b) for b in BANDS)} }},", "    -- mevki -> band -> özellik sırasıyla alt, üst, alt, üst...", "    ranges = {"]
    for code, label in positions:
        peers = [r for r in rows if str(r[player["position1"]]) == code]
        lines.append(f"        {label} = {{")
        for band in BANDS:
            near = [r for r in peers if abs(r[player["overall"]] - band) <= NEAR]
            near = near if len(near) >= MIN_PEERS else [r for r in peers if abs(r[player["overall"]] - band) <= WIDE]
            if len(near) < MIN_PEERS:
                continue
            values = []
            for attribute in attributes:
                column = [r[attribute] or 0 for r in near]
                values += [quantile(column, LOW), quantile(column, HIGH)]
            lines.append(f"            [{band}] = {{ {', '.join(map(str, values))} }},")
        lines.append("        },")
    lines += ["    },", "}", ""]
    OUT.write_text("\n".join(lines), encoding="utf-8", newline="\n")
    print(OUT, OUT.stat().st_size, len(rows))


if __name__ == "__main__":
    main()
