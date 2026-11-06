import argparse
import json
from pathlib import Path
from .reader import ROOT, read_save
from .compare import compare
from tools.runlog import run_log


def main():
    ap = argparse.ArgumentParser(description="Read FC career saves through immutable local copies")
    ap.add_argument("command", choices=["inspect", "compare", "import", "watch", "research"])
    ap.add_argument("save", type=Path, nargs="*", help="kayıt klasörü ya da dosyası (import/watch sıfır ya da daha çok kabul eder)")
    ap.add_argument("--backups", type=Path, default=ROOT / "scratch/saveimport/backups")
    ap.add_argument("--export-dir", type=Path)
    ap.add_argument("--snapshot")
    ap.add_argument("--report", type=Path)
    ap.add_argument("--db", type=Path, default=ROOT / "fc_career.db")
    ap.add_argument("--interval", type=float, default=10)
    ap.add_argument("--keep-backups", type=int, default=10, help="tutulacak en yeni kayıt yedeği sayısı (her biri ~16 MB)")
    args = ap.parse_args()
    if not args.save and args.command not in ("import", "watch"):
        ap.error(f"{args.command} için kayıt dosyası gerekir")
    with run_log("saveimport", args.export_dir or args.db.parent) as log:
        result = execute(args)
        log.exit_code = result
        return result


def execute(args):
    if args.command == "research":
        from .research import research
        result = research(args.save, args.backups)
        output = json.dumps(result, ensure_ascii=False, indent=2)
        if args.report:
            args.report.parent.mkdir(parents=True, exist_ok=True)
            args.report.write_text(output + "\n", encoding="utf-8")
            print(json.dumps({"report": str(args.report), "saves": len(result["saves"]), "status": result["status"]}, ensure_ascii=False))
        else:
            print(output)
        return 0
    if args.command in ("import", "watch"):
        from .runner import run_once, watch
        if args.command == "watch":
            watch(args.save, args.db, args.backups, args.export_dir, args.interval, args.keep_backups)
            return 0
        result = run_once(args.save, args.db, args.backups, args.export_dir, args.keep_backups)
        print(json.dumps(result, ensure_ascii=False, indent=2))
        return 1 if result["errors"] else 0
    if len(args.save) > 1:
        ap.error(f"{args.command} tek kayıt alır")
    save, copy = read_save(args.save[0], args.backups)
    if args.command == "compare":
        if not args.export_dir or not args.snapshot:
            ap.error("compare requires --export-dir and --snapshot")
        result = compare(save, args.export_dir, args.snapshot, json.loads((ROOT / "config/save-map.json").read_text(encoding="utf-8")))
    else:
        result = {"copy": str(copy), "databaseOffsets": save.database_offsets,
                  "tables": {n: {"rows": len(t.rows), "fields": len(t.fields), "cancelled": t.cancelled}
                             for n, t in save.tables.items()}}
    output = json.dumps(result, ensure_ascii=False, indent=2)
    if args.report:
        args.report.write_text(output + "\n", encoding="utf-8")
    print(output)
    return 0 if result.get("passed", True) else 1


if __name__ == "__main__":
    raise SystemExit(main())
