#!/usr/bin/env python3
"""
Lua mod'ları için pozisyon ağırlıkları: config/position-ratings.json + config/field-map.json
→ exporter/lua/mods/fcm_weights.lua. Config değişince yeniden çalıştır:

    python tools/gen_fcm_weights.py
"""
from __future__ import annotations

import json
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent


def lua_str(s: str) -> str:
    return '"' + s.replace("\\", "\\\\").replace('"', '\\"') + '"'


def main() -> int:
    ratings = json.loads((ROOT / "config" / "position-ratings.json").read_text(encoding="utf-8"))
    fmap = json.loads((ROOT / "config" / "field-map.json").read_text(encoding="utf-8"))
    gk_group = fmap.get("goalkeeperGroup")

    lines = [
        "-- ÜRETİLDİ: tools/gen_fcm_weights.py <- config/position-ratings.json, config/field-map.json. Elle düzenleme.",
        "return {",
        "    -- preferredposition1 kodu -> etiket",
        "    positions = {",
    ]
    for code, label in sorted(fmap["positions"].items(), key=lambda kv: int(kv[0])):
        lines.append(f"        [{int(code)}] = {lua_str(label)},")
    lines += ["    },", "    -- pozisyon etiketi -> { özellik = ağırlık } (normalize edilmemiş)", "    weights = {"]
    for pos, weights in ratings["positions"].items():
        body = ", ".join(f"{k} = {v}" for k, v in weights.items())
        lines.append(f"        {pos} = {{ {body} }},")
    lines += ["    },", "    -- tüm özellikler ve kaleci özellikleri (saha oyuncusunda yükseltilmez)", "    attributes = {"]
    attrs = []
    for group in fmap["attributeGroups"].values():
        for a in group:
            if a not in attrs:
                attrs.append(a)
    lines.append("        " + ", ".join(lua_str(a) for a in attrs))
    lines += ["    },", "    -- özellik grupları (field-map attributeGroups): grup adı -> özellikler", "    groups = {"]
    for name, group in fmap["attributeGroups"].items():
        lines.append(f"        [{lua_str(name)}] = {{ " + ", ".join(lua_str(a) for a in group) + " },")
    lines += ["    },", "    goalkeeper = {"]
    lines.append("        " + ", ".join(lua_str(a) for a in fmap["attributeGroups"].get(gk_group, [])))
    lines += ["    },", "}", ""]

    out = ROOT / "exporter" / "lua" / "mods" / "fcm_weights.lua"
    out.parent.mkdir(parents=True, exist_ok=True)
    out.write_text("\n".join(lines), encoding="utf-8")
    print(f"yazıldı: {out}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
