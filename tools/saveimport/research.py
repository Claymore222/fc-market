"""Read-only, reproducible probes for unsolved career blocks. Never promotes a guess into imported data."""
from __future__ import annotations

import hashlib
import json
from pathlib import Path
import re
import struct

from .career import club_budget, club_transactions, finance_categories, season_history
from .reader import ROOT, read_save
from .store import identity, load_config


def probe(payload: bytes, settings: dict) -> dict:
    start = payload.find(b"BNRY")
    if start < 0:
        return {"bnryOffset": None, "status": "BNRY bulunamadı", "candidates": []}
    tail = payload[start:]
    expected = settings["reference"]["managerCounters"]
    candidates, nearby = [], []
    for fmt in ("<H", ">H", "<I", ">I"):
        hits = {key: [m.start() + start for m in re.finditer(re.escape(struct.pack(fmt, value)), tail)]
                for key, value in expected.items()}
        for key, offsets in hits.items():
            candidates.append({"field": key, "referenceValue": expected[key], "encoding": fmt,
                               "count": len(offsets), "offsets": offsets[:20]})
        for anchor in hits.get("goalsFor", []):
            nearest = {key: min(offsets, key=lambda o: abs(o - anchor)) for key, offsets in hits.items() if offsets}
            if len(nearest) == len(expected) and max(nearest.values()) - min(nearest.values()) <= settings["candidateWindowBytes"]:
                nearby.append({"encoding": fmt, "offsets": nearest})
    return {"bnryOffset": start, "payloadBytes": len(payload), "status": "DOĞRULANACAK",
            "sectionNames": {name: [m.start() + start for m in re.finditer(re.escape(name.encode()), tail)][:20]
                             for name in settings["sectionNames"]},
            "candidates": candidates, "nearbyCounterCandidates": nearby,
            "knownFinance": club_budget(payload), "knownTransactions": club_transactions(payload), "financeCategories": finance_categories(payload)}


def positional_diff(before: bytes, after: bytes) -> dict:
    """Offset comparison is only meaningful before inserted/deleted structures; never a field mapping."""
    a, b = before.find(b"BNRY"), after.find(b"BNRY")
    if a < 0 or b < 0:
        return {"comparable": False}
    if a != b or len(before) != len(after):
        return {"comparable": False, "reason": "Payload boyu veya BNRY başlangıcı değişti; konumsal fark yanıltıcı olabilir."}
    changed, windows, first = 0, [], None
    for offset in range(a, len(before), 256):
        size = sum(x != y for x, y in zip(before[offset:offset + 256], after[offset:offset + 256]))
        if size:
            changed += size
            if first is None: first = offset
            if len(windows) < 40: windows.append({"offset": offset, "changedBytes": size})
    return {"comparable": True, "changedBytes": changed, "firstChangedWindow": first,
            "sampleWindows": windows, "note": "Sabit ofsetli bayt farkı; alan anlamı çıkarımı değildir."}


def research(sources: list[Path], backups: Path) -> dict:
    settings = json.loads((ROOT / "config/save-research.json").read_text(encoding="utf-8"))
    mapping, fields = load_config()
    reports, comparisons, previous = [], [], {}
    for source in sources:
        save, copy = read_save(source, backups)  # Always copy first, even for a user-selected file.
        info = identity(save, source, mapping, fields)
        teams = {r[fields["team"]["id"]] for r in save.tables[fields["team"]["table"]].rows}
        report = {"sourceName": source.name, "copy": str(copy), "copySha256": hashlib.sha256(copy.read_bytes()).hexdigest(),
                  "gameDate": info["game_date"], "teamId": info["user_teamid"], "saveUid": info["save_uid"], "slotTitle": info["slot_title"],
                  "referenceDateAndTeamMatch": info["game_date"] == settings["reference"]["gameDate"] and info["user_teamid"] == settings["reference"]["teamId"],
                  **probe(save.payload, settings), "seasonHistory": season_history(save.payload, teams.__contains__)}
        reports.append(report)
        key = (info["save_uid"], info["slot_title"])
        if key in previous:
            before, payload = previous[key]
            comparisons.append({"before": before["sourceName"], "after": source.name,
                                **positional_diff(payload, save.payload)})
        previous[key] = (report, save.payload)
    return {"status": "Tek sayı eşleşmeleri yalnız adaydır; doğrulanan sezon/finans düzenleri ayrı alanlardadır.", "reference": settings["reference"],
            "saves": reports, "comparisons": comparisons}
