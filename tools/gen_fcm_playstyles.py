"""exporter/lua/mods/fcm_playstyles.lua üretir.

Kaynak: fc_playstyle_probe.lua'nın yazdığı ps_playstyle_attribute_requirement.csv (hangi PlayStyle hangi özelliğe bağlı) ve
son export'taki OVR 75+ oyuncular (mevki grubuna göre PlayStyle sıklığı). Eşik değerleri kullanılmaz: gerçek sahiplerin
yalnız %13'ü onları sağlıyor, oyunun kariyer verisi bu eşiklerle dağıtılmıyor.

    python tools/gen_fcm_playstyles.py [--export-dir C:/FCExport]
"""
import argparse
import csv
import json
import sqlite3
from collections import Counter, defaultdict
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / "exporter/lua/mods/fcm_playstyles.lua"
# EA'nın özellik kimlikleri: fc_playstyle_probe çıktısı ve attributecategorymap ağırlıklarıyla doğrulandı.
ATTRIBUTES = ["acceleration", "sprintspeed", "agility", "balance", "jumping", "stamina", "strength", "reactions", "aggression",
              "composure", "interceptions", "positioning", "vision", "ballcontrol", "crossing", "dribbling", "finishing",
              "freekickaccuracy", "headingaccuracy", "longpassing", "shortpassing", "defensiveawareness", "shotpower", "longshots",
              "standingtackle", "slidingtackle", "volleys", "curve", "penalties", "gkdiving", "gkhandling", "gkkicking",
              "gkreflexes", "gkpositioning"]
GROUPS = {"RW": "WING", "LW": "WING", "RM": "WING", "LM": "WING", "ST": "FWD", "CAM": "MID", "CM": "MID", "CDM": "DM",
          "CB": "CB", "RB": "FB", "LB": "FB", "GK": "GK"}
MIN_OVERALL, MIN_SHARE = 75, 0.03


def bit_set(row, bit, fields):
    plain, plus = fields[0 if bit < 32 else 1], fields[2 if bit < 32 else 3]
    return ((int(row[plain] or 0) | int(row[plus] or 0)) >> (bit % 32)) & 1


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--export-dir", default="C:/FCExport")
    export = Path(parser.parse_args().export_dir)
    field_map = json.loads((ROOT / "config/field-map.json").read_text(encoding="utf-8"))
    player = field_map["player"]
    names, positions = field_map["playStyles"], field_map["positions"]
    categories = {bit: cat for cat, bits in field_map["playStyleCategories"].items() for bit in bits}
    needs = defaultdict(list)
    with (export / "ps_playstyle_attribute_requirement.csv").open(encoding="utf-8") as f:
        for row in csv.DictReader(f):
            needs[int(row["playstyleid"])].append(ATTRIBUTES[int(row["attributeid"])])
    bits = [b for b in sorted(needs) if str(b) in names]

    con = sqlite3.connect(f"file:{export / 'fc_career.db'}?mode=ro", uri=True, timeout=60)
    con.row_factory = sqlite3.Row
    snap = con.execute("SELECT snapshot_id FROM snapshots WHERE reason='export' ORDER BY exported_at DESC LIMIT 1").fetchone()[0]
    table = "raw_" + player["table"]
    rows = con.execute(f'SELECT * FROM "{table}" WHERE snapshot_id=? AND "{player["overall"]}">=?', (snap, MIN_OVERALL)).fetchall()
    fields = (player["playStyles1"], player["playStyles2"], player["playStylesPlus1"], player["playStylesPlus2"])
    totals, counts = Counter(), defaultdict(Counter)
    for row in rows:
        group = GROUPS.get(positions.get(str(row[player["position1"]])))
        if not group:
            continue
        totals[group] += 1
        for bit in bits:
            counts[group][bit] += bit_set(row, bit, fields)

    lines = ["-- ÜRETİLDİ: tools/gen_fcm_playstyles.py. Elle düzenleme.", "return {", "    needs = {"]
    for bit in bits:
        lines.append(f"        [{bit}] = {{ {', '.join(json.dumps(a) for a in needs[bit])} }},")
    lines += ["    },", "    names = {"]
    lines += [f"        [{bit}] = {json.dumps(names[str(bit)], ensure_ascii=False)}," for bit in bits]
    lines += ["    },", "    categories = {"]
    lines += [f"        [{bit}] = {json.dumps(categories.get(bit, 'other'))}," for bit in bits]
    lines += ["    },", "    shares = {"]
    for group in sorted(totals):
        items = [(b, counts[group][b] / totals[group]) for b in bits]
        keep = ", ".join(f"[{b}] = {share:.3f}" for b, share in items if share >= MIN_SHARE)
        lines.append(f"        {group} = {{ {keep} }},")
    lines += ["    },", "}", ""]
    OUT.write_text("\n".join(lines), encoding="utf-8", newline="\n")
    print(f"{OUT}: {len(rows)} oyuncu, {snap}, {dict(totals)}")


if __name__ == "__main__":
    main()
