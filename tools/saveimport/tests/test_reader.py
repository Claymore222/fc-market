import json
from pathlib import Path
import struct
import tempfile
import unittest
from unittest.mock import patch

from tools.saveimport.reader import FormatError, backup_save, decompress_frame, read_database, parse_bytes
from tools.saveimport.compare import compare


def database():
    """Invented table fragment, no EA record data distributed."""
    header = bytearray(36)
    struct.pack_into("<IIIHHH", header, 4, 4, 31, 0, 3, 3, 1)
    header[24] = 2
    fields = struct.pack("<II4sI", 3, 3, b"ValX", 9) + struct.pack("<II4sI", 0, 16, b"TxtX", 8)
    rows = struct.pack("<I", (300 << 3) | (65 << 16)) + struct.pack("<I", 0x80000000) + struct.pack("<I", (1 << 3) | (66 << 16))
    table = bytes(header) + fields + rows + bytes(4)
    return b"DB\0\x08\0\0\0\0" + struct.pack("<IIII4sII", 36 + len(table), 0, 1, 0, b"Test", 0, 0) + table


META = {"Test": ("test", {"ValX": {"name": "value", "rangelow": -1}, "TxtX": {"name": "text"}})}


class ReaderTests(unittest.TestCase):
    def test_bit_ranges_strings_and_cancelled_records(self):
        table = read_database(database(), 0, META)[0]
        self.assertEqual(table.rows, [{"value": 299, "text": "A"}, {"value": 0, "text": "B"}])

    def test_truncated_and_invalid_headers_fail(self):
        for b in (database()[:-1], database()[:20]):
            with self.assertRaises(FormatError):
                read_database(b, 0, META)
        b = bytearray(database())
        struct.pack_into("<H", b, 36 + 18, 4)
        with self.assertRaises(FormatError):
            read_database(b, 0, META)

    def test_unknown_fields_fail_instead_of_silent_raw_values(self):
        with self.assertRaises(FormatError):
            read_database(database(), 0, {"Test": ("test", {})})

    def test_two_databases_in_compressed_container(self):
        from compression.zstd import compress
        content = b"prefix" + database() + b"gap" + database()
        # Duplicate tables must not be silently overwritten.
        with patch("tools.saveimport.reader.metadata", return_value=META):
            with self.assertRaisesRegex(FormatError, "Duplicate"):
                parse_bytes(b"FBCHUNKS\x01\0" + compress(content))
        packed = compress(content)
        self.assertEqual(decompress_frame(packed + b"tail", 0), (content, len(packed)))
        with self.assertRaises(FormatError):
            decompress_frame(packed[:-2], 0)

    def test_copy_is_immutable_and_never_overwrites_source(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            (root / "game").mkdir()
            source = root / "game/CmMgrCtest"
            source.write_bytes(b"test save")
            before = source.stat().st_mtime_ns
            copy = backup_save(source, root / "copies")
            self.assertEqual(copy.read_bytes(), b"test save")
            self.assertEqual(source.stat().st_mtime_ns, before)
            self.assertEqual(copy, backup_save(source, root / "copies"))
            with self.assertRaises(ValueError):
                backup_save(source, source.parent)

    def test_missing_rows_are_comparison_failures(self):
        from types import SimpleNamespace
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            (root / "snap__test.csv").write_text("id,value\n1,2\n2,3\n")
            result = compare(SimpleNamespace(tables={}), root, "snap", {"comparison": {"test": ["id"]}})
            self.assertFalse(result["passed"])
            self.assertEqual(result["tables"]["test"]["mismatches"], 4)


if __name__ == "__main__":
    unittest.main()
