import os
import tempfile
import unittest
from pathlib import Path

from PIL import Image

from tools.assets.convert import convert


class ConvertTests(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.src, self.dest = Path(self.tmp.name, "assets"), Path(self.tmp.name, "repo")
        for folder in ("heads", "crests", "flags"):
            (self.src / folder).mkdir(parents=True)
        Image.new("RGBA", (16, 16), (200, 30, 30, 255)).save(self.src / "heads" / "p258923.dds")
        Image.new("RGBA", (8, 8), (0, 0, 255, 128)).save(self.src / "crests" / "l326.dds")
        Image.new("RGB", (12, 8), (255, 255, 255)).save(self.src / "flags" / "f_48.dds")
        (self.src / "flags" / "f_99.dds").write_bytes(b"bozuk")

    def tearDown(self):
        self.tmp.cleanup()

    def test_converts_by_id_and_reports_broken(self):
        report = convert(self.src, self.dest)
        self.assertEqual(3, report["converted"])
        self.assertEqual(1, len(report["failed"]))
        with Image.open(self.dest / "faces" / "258923.png") as face:
            self.assertEqual(((16, 16), "RGBA"), (face.size, face.mode))
        self.assertTrue((self.dest / "crests" / "326.png").exists())
        self.assertTrue((self.dest / "flags" / "48.png").exists())
        self.assertFalse((self.dest / "flags" / "99.png").exists())

    def test_trophies_and_league_logos_from_fc_trophies(self):
        for folder in ("trophies", "leagues"):
            (self.src / folder).mkdir()
        Image.new("RGBA", (32, 32), (255, 210, 0, 255)).save(self.src / "trophies" / "t268.dds")
        Image.new("RGBA", (16, 16), (0, 0, 0, 255)).save(self.src / "leagues" / "l68.dds")
        convert(self.src, self.dest)
        self.assertTrue((self.dest / "trophies" / "268.png").exists())
        self.assertTrue((self.dest / "league-logos" / "68.png").exists())

    def test_second_run_skips_unchanged(self):
        convert(self.src, self.dest)
        report = convert(self.src, self.dest)
        self.assertEqual((0, 3), (report["converted"], report["unchanged"]))
        newer = self.src / "heads" / "p258923.dds"
        later = (self.dest / "faces" / "258923.png").stat().st_mtime + 5
        os.utime(newer, (later, later))
        self.assertEqual(1, convert(self.src, self.dest)["converted"])


if __name__ == "__main__":
    unittest.main()
