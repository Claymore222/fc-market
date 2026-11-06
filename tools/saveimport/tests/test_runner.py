import os
import tempfile
import time
import unittest
from pathlib import Path

from tools.saveimport.runner import prune_backups, run_once


class PruneTests(unittest.TestCase):
    def test_keeps_newest_and_removes_stale_partials(self):
        with tempfile.TemporaryDirectory() as d:
            d = Path(d)
            now = time.time()
            for i in range(5):
                f = d / f"CmMgrC{i}.abc{i}.save"
                f.write_bytes(b"x")
                os.utime(f, (now - 100 + i, now - 100 + i))
            old_partial = d / "tmp1.partial"; old_partial.write_bytes(b"x"); os.utime(old_partial, (now - 7200, now - 7200))
            fresh_partial = d / "tmp2.partial"; fresh_partial.write_bytes(b"x")
            self.assertEqual(4, prune_backups(d, 2))
            self.assertEqual(["CmMgrC3.abc3.save", "CmMgrC4.abc4.save", "tmp2.partial"], sorted(p.name for p in d.iterdir()))
            self.assertEqual(0, prune_backups(d, 0))  # 0 = temizleme kapalı


class SourceTests(unittest.TestCase):
    def test_folder_and_added_files_are_read_once_each(self):
        with tempfile.TemporaryDirectory() as d:
            d = Path(d)
            game, other, out = d / "settings", d / "downloads", d / "out"
            for folder in (game, other, out):
                folder.mkdir()
            (game / "CmMgrC20261029").write_bytes(b"not a save")
            (game / "Settings").write_bytes(b"x")  # kariyer kaydı değil, klasörde atlanır
            added = other / "arkadas_kariyeri"
            added.write_bytes(b"not a save either")
            result = run_once([game, added, game / "CmMgrC20261029"], out / "db.sqlite", out / "backups")
            self.assertEqual(0, result["saves"])
            self.assertEqual(["CmMgrC20261029", "arkadas_kariyeri"], sorted(e.split(":")[0] for e in result["errors"]))


if __name__ == "__main__":
    unittest.main()
