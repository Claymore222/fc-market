"""
importer.py dal (branch) testleri. Yalnızca standart kütüphane:

    python -m unittest exporter/tools/test_importer.py
"""
from __future__ import annotations

import json
import sqlite3
import sys
import tempfile
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
import importer  # noqa: E402

SAVE = "84af764ba0d247f880ccc658a7e0c7a"


class BranchTests(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.dir = Path(self.tmp.name) / "export"
        self.dir.mkdir()
        self.db = Path(self.tmp.name) / "career.db"
        self.n = 0
        self.cons: list[sqlite3.Connection] = []

    def tearDown(self):
        for con in self.cons:
            con.close()
        self.tmp.cleanup()

    def export(self, date: str, ovr: dict[int, int], save: str = SAVE) -> str:
        """Bir snapshot yaz (players: playerid -> OVR, POT = OVR + 10) ve manifest'e ekle."""
        self.n += 1
        snap = f"{save[:8]}_{date.replace('-', '')}_{self.n:06d}"
        rows = "\n".join(f"{pid},{v},{v + 10}" for pid, v in ovr.items())
        (self.dir / f"{snap}__players.csv").write_text(f"playerid,overallrating,potential\n{rows}\n", encoding="utf-8")
        names = "\n".join(f"{pid},Oyuncu {pid},1" for pid in ovr)
        (self.dir / f"{snap}__player_names.csv").write_text(f"playerid,name,club_teamid\n{names}\n", encoding="utf-8")
        (self.dir / f"{snap}__teams.csv").write_text("teamid,teamname\n1,Test FC\n", encoding="utf-8")
        entry = {"snapshot_id": snap, "save_uid": save, "game_date": date, "files": ["players", "player_names", "teams"],
                 "exported_at": f"2026-10-28T10:{self.n:02d}:00Z", "reason": "manual"}
        with (self.dir / "manifest.jsonl").open("a", encoding="utf-8") as fh:
            fh.write(json.dumps(entry) + "\n")
        return snap

    def run_importer(self) -> sqlite3.Connection:
        self.assertEqual(importer.main([str(self.dir), "--db", str(self.db)]), 0)
        con = sqlite3.connect(self.db)
        self.cons.append(con)
        return con

    def branch_of(self, con, snap):
        return con.execute("SELECT branch, branch_reason FROM snapshots WHERE snapshot_id = ?", (snap,)).fetchone()

    def test_linear_career_stays_on_one_branch(self):
        a = self.export("2029-10-01", {1: 70, 2: 60})
        b = self.export("2029-11-01", {1: 71, 2: 60})
        c = self.export("2029-11-01", {1: 71, 2: 61})  # aynı gün ikinci export
        con = self.run_importer()
        self.assertEqual([self.branch_of(con, s)[0] for s in (a, b, c)], [1, 1, 1])

    def test_earlier_date_opens_new_branch(self):
        self.export("2029-10-01", {1: 70})
        self.export("2029-11-01", {1: 72})
        back = self.export("2029-10-15", {1: 70})
        con = self.run_importer()
        branch, reason = self.branch_of(con, back)
        self.assertEqual(branch, 2)
        self.assertIn("yeni dal", reason)
        self.assertEqual(con.execute(
            "SELECT parent_branch, fork_date, first_snapshot FROM branches WHERE save_uid = ? AND branch = 2",
            (SAVE,)).fetchone(), (1, "2029-10-15", back))

    def test_continuation_goes_to_most_similar_branch(self):
        self.export("2029-10-01", {1: 70, 2: 60, 3: 50})
        self.export("2029-11-01", {1: 75, 2: 65, 3: 55})          # dal 1
        self.export("2029-10-15", {1: 70, 2: 61, 3: 50})          # dal 2 (geri dönüş)
        b2 = self.export("2029-11-20", {1: 70, 2: 61, 3: 51})     # dal 2'ye benziyor
        b1 = self.export("2029-11-25", {1: 75, 2: 65, 3: 56})     # dal 1'e benziyor
        con = self.run_importer()
        self.assertEqual(self.branch_of(con, b2)[0], 2)
        self.assertEqual(self.branch_of(con, b1)[0], 1)
        self.assertIn("aday dal", self.branch_of(con, b1)[1])

    def test_saves_are_independent(self):
        a = self.export("2029-11-01", {1: 70})
        b = self.export("2029-10-01", {1: 70}, save="ffffffff00000000")
        con = self.run_importer()
        self.assertEqual((self.branch_of(con, a)[0], self.branch_of(con, b)[0]), (1, 1))

    def test_latest_snapshot_view_has_one_row_per_branch(self):
        self.export("2029-10-01", {1: 70})
        tip1 = self.export("2029-11-01", {1: 72})
        tip2 = self.export("2029-10-15", {1: 70})
        con = self.run_importer()
        rows = con.execute("SELECT branch, snapshot_id FROM v_latest_snapshot ORDER BY branch").fetchall()
        self.assertEqual(rows, [(1, tip1), (2, tip2)])
        self.assertEqual(con.execute("SELECT COUNT(*) FROM player_current").fetchone()[0], 2)

    def test_old_database_is_backfilled(self):
        self.export("2029-10-01", {1: 70})
        self.export("2029-11-01", {1: 72})
        back = self.export("2029-10-15", {1: 70})
        # Dal desteğinden önceki importer'ın bıraktığı veritabanını taklit et.
        con = self.run_importer()
        con.execute("DROP TABLE branches")
        con.execute("DROP VIEW v_player_latest")
        con.execute("DROP VIEW v_player_history")
        con.execute("DROP VIEW v_latest_snapshot")
        con.execute("CREATE TABLE s2 AS SELECT snapshot_id, save_uid, game_date, exported_at, reason, user_teamid, "
                    "user_team_name, transfer_budget, wage_budget, exporter_version, files, imported_at FROM snapshots")
        con.execute("DROP TABLE snapshots")
        con.execute("ALTER TABLE s2 RENAME TO snapshots")
        con.execute("CREATE VIEW v_latest_snapshot AS SELECT s.* FROM snapshots s WHERE s.snapshot_id = ("
                    "SELECT s2.snapshot_id FROM snapshots s2 WHERE s2.save_uid = s.save_uid "
                    "ORDER BY s2.game_date DESC, s2.exported_at DESC LIMIT 1)")
        con.commit()
        con.close()
        con = self.run_importer()
        self.assertEqual(self.branch_of(con, back)[0], 2)
        self.assertEqual(con.execute("SELECT COUNT(*) FROM v_latest_snapshot").fetchone()[0], 2)


if __name__ == "__main__":
    unittest.main()
