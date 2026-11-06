"""fc_assets.lua çıktısını (DDS) uygulamanın PNG klasörlerine çevirir.

  heads/p<playerid>.dds  -> faces/<playerid>.png
  crests/l<teamid>.dds   -> crests/<teamid>.png
  flags/f_<nationid>.dds -> flags/<nationid>.png
  playstyles/<ad>.dds    -> playstyle-icons/<ad>.png
  trophies/t<id>.dds     -> trophies/<id>.png      (fc_trophies.lua; id = lig ya da yarışma kodu)
  leagues/l<leagueid>.dds -> league-logos/<id>.png (fc_trophies.lua)

Kaynak değişmediyse (hedef daha yeni) yeniden yazılmaz. Okunamayan dosya atlanır ve raporlanır.
"""
from __future__ import annotations

import re
from pathlib import Path

from PIL import Image

RULES = [
    ("heads", re.compile(r"^p(\d+)\.dds$", re.I), "faces"),
    ("crests", re.compile(r"^l(\d+)\.dds$", re.I), "crests"),
    ("flags", re.compile(r"^f_(\d+)\.dds$", re.I), "flags"),
    ("playstyles", re.compile(r"^([\w-]+)\.(?:dds|png)$", re.I), "playstyle-icons"),
    ("trophies", re.compile(r"^t(\d+)\.dds$", re.I), "trophies"),
    ("leagues", re.compile(r"^l(\d+)\.dds$", re.I), "league-logos"),
]


def convert(source: Path, dest_root: Path) -> dict:
    """source = OUT_DIR (C:\\FCExport\\assets); dest_root = repo kökü (faces/, crests/, flags/ burada)."""
    report = {"converted": 0, "unchanged": 0, "failed": []}
    for folder, pattern, target_folder in RULES:
        src_dir = source / folder
        if not src_dir.is_dir():
            continue
        out_dir = dest_root / target_folder
        out_dir.mkdir(parents=True, exist_ok=True)
        for src in sorted(src_dir.iterdir()):
            m = pattern.match(src.name)
            if not m or not src.is_file():
                continue
            target = out_dir / f"{m.group(1)}.png"
            if target.exists() and target.stat().st_mtime >= src.stat().st_mtime:
                report["unchanged"] += 1
                continue
            try:
                with Image.open(src) as image:
                    image.load()
                    rgba = image.convert("RGBA")
                temporary = target.with_suffix(".tmp")
                rgba.save(temporary, "PNG", optimize=True)
                temporary.replace(target)
                report["converted"] += 1
            except Exception as ex:  # bozuk ya da desteklenmeyen DDS: atla, raporla
                report["failed"].append(f"{folder}/{src.name}: {ex}")
    return report
