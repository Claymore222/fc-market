"""Field-complete comparison. Missing rows/columns count as failures."""
import csv
from collections import Counter
from pathlib import Path


def equivalent(a, b):
    if a == b:
        return True
    try:
        return float(a) == float(b)
    except (ValueError, TypeError):
        return False


def compare(save, export_dir: Path, snapshot: str, mapping: dict) -> dict:
    results = {}
    for name, keys in mapping["comparison"].items():
        with (export_dir / f"{snapshot}__{name}.csv").open(encoding="utf-8-sig", newline="") as f:
            reader = csv.DictReader(f)
            columns = reader.fieldnames
            expected = list(reader)
        table = save.tables.get(name)
        actual = table.rows if table else []
        key = lambda row: tuple(str(row[k]) for k in keys)
        indexed = {key(r): r for r in actual}
        expected_keys = {key(r) for r in expected}
        if len(indexed) != len(actual) or len(expected_keys) != len(expected):
            raise ValueError(f"Duplicate comparison keys: {name}")
        extra = set(indexed) - expected_keys
        total = (len(expected) + len(extra)) * len(columns)
        bad = Counter()
        examples = []
        for row in expected:
            found = indexed.get(key(row), {})
            for field in columns:
                if field not in found or not equivalent(row[field], found[field]):
                    bad[field] += 1
                    if len(examples) < 12:
                        examples.append({"key": key(row), "field": field, "export": row[field], "save": found.get(field)})
        mismatches = sum(bad.values()) + len(extra) * len(columns)
        ratio = (total - mismatches) / total if total else 1.0
        results[name] = {"exportRows": len(expected), "saveRows": len(actual), "comparedFields": total,
                         "mismatches": mismatches, "matchRatio": ratio, "passed": ratio >= .999,
                         "differentFields": dict(bad), "examples": examples}
    return {"snapshot": snapshot, "passed": all(r["passed"] for r in results.values()), "tables": results}
