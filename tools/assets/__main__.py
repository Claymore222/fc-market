import argparse
import json
import os
from pathlib import Path

from .convert import convert
from tools.runlog import run_log

ROOT = Path(__file__).resolve().parents[2]
# Repo içinde (geliştirme) görseller repo köküne; paketten çalışınca kullanıcı veri klasörüne (masaüstü uygulamasının okuduğu yer).
DEFAULT_DEST = ROOT if (ROOT / ".git").exists() else Path(os.environ.get("LOCALAPPDATA", ROOT)) / "FcMarket" / "images"

parser = argparse.ArgumentParser(prog="python -m tools.assets", description="Oyundan çıkarılan görselleri (DDS) PNG'ye çevir")
sub = parser.add_subparsers(dest="command", required=True)
c = sub.add_parser("convert", help="fc_assets.lua çıktısını faces/, crests/, flags/ klasörlerine çevir")
c.add_argument("source", type=Path, help="fc_assets.lua OUT_DIR (ör. C:\\FCExport\\assets)")
c.add_argument("--dest", type=Path, default=DEFAULT_DEST, help="hedef kök (repo: repo kökü; paket: %%LOCALAPPDATA%%/FcMarket/images)")
args = parser.parse_args()

if args.command == "convert":
    with run_log("assets", args.source.parent) as log:
        report = convert(args.source, args.dest)
        log.exit_code = 1 if report['failed'] else 0
        print(json.dumps({**report, "failed": report["failed"][:20], "failedCount": len(report["failed"])}, ensure_ascii=False, indent=2))
