import unittest

from tools.saveimport.research import positional_diff, probe


class ResearchTests(unittest.TestCase):
    def test_missing_bnry_does_not_scan_database_bytes(self):
        self.assertIsNone(probe(b"database-only", {})["bnryOffset"])

    def test_candidate_is_labelled_and_not_a_decoded_field(self):
        settings = {"reference": {"managerCounters": {"won": 148, "goalsFor": 469}},
                    "candidateWindowBytes": 256, "sectionNames": ["objctvs"]}
        result = probe(b"headerBNRY\x94\x00\xd5\x01objctvs", settings)
        self.assertEqual("DOĞRULANACAK", result["status"])
        self.assertTrue(result["nearbyCounterCandidates"])
        self.assertNotIn("managerRecord", result)

    def test_diff_rejects_moved_or_resized_payload_and_counts_exact_changes(self):
        self.assertFalse(positional_diff(b"BNRY01", b"xBNRY01")["comparable"])
        diff = positional_diff(b"xxBNRY0000", b"xxBNRY0012")
        self.assertTrue(diff["comparable"])
        self.assertEqual(2, diff["changedBytes"])
        self.assertFalse(positional_diff(b"none", b"none")["comparable"])
