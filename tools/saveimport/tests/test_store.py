import sqlite3
import unittest
from tools.saveimport.store import archive_transfers, initialize, import_data, load_config, read_rows, save_budget, season_label, slot_uid, upgrade_blocks


class StoreTests(unittest.TestCase):
    def setUp(self):
        self.con = sqlite3.connect(":memory:")
        initialize(self.con)
        self.mapping, self.fields = load_config()
        p, link = self.fields["player"], self.fields["squadLink"]
        self.tables = {p["table"]: [{p["id"]: 1, p["overall"]: 70, p["potential"]: 90}],
                       link["table"]: [{link["playerId"]: 1, link["teamId"]: 5}]}
        self.cols = {n: list(r[0]) for n, r in self.tables.items()}
        self.info = {"save_uid": "testcareer", "game_date": "2030-07-17", "slot": "slot-a", "slot_title": "First",
                     "source_path": "/game/slot-a", "user_teamid": 5, "user_team_name": "Test FC", "snapshot_id": "export-one"}

    def tearDown(self):
        self.con.close()

    def ingest(self, source, key, info=None):
        with self.con:
            return import_data(self.con, self.tables, self.cols, info or self.info, source, key, self.mapping, self.fields)

    def test_save_then_export_is_one_snapshot_and_keeps_budget(self):
        snap = self.ingest("save", "save-1")
        export_info = self.info | {"transfer_budget": 123456}
        self.assertEqual(snap, self.ingest("export", "export-1", export_info))
        self.assertEqual((1,), self.con.execute("SELECT COUNT(*) FROM snapshots").fetchone())
        self.assertEqual(("save", 123456, 2), self.con.execute("SELECT source,transfer_budget,revision FROM snapshots").fetchone())
        self.assertEqual(snap, self.ingest("save", "save-2"))
        self.assertEqual((123456,), self.con.execute("SELECT transfer_budget FROM snapshots").fetchone())

    def test_save_budget_fills_the_header_but_never_replaces_an_export_value(self):
        self.con.execute("INSERT INTO snapshots(snapshot_id,save_uid,game_date,exported_at,reason,source,files) VALUES('A','u','2026-07-22','x','save','save','[]')")
        save_budget(self.con, 'A', {"career_finance": []})
        self.assertIsNone(self.con.execute("SELECT transfer_budget FROM snapshots WHERE snapshot_id='A'").fetchone()[0])
        save_budget(self.con, 'A', {"career_finance": [{"transferbudget": 249500}]})
        save_budget(self.con, 'A', {"career_finance": [{"transferbudget": 1}]})
        self.assertEqual(249500, self.con.execute("SELECT transfer_budget FROM snapshots WHERE snapshot_id='A'").fetchone()[0])

    def test_career_without_le_uid_keeps_one_identity_across_saves(self):
        self.assertEqual(slot_uid("Main kariyer", 1924), slot_uid("Main kariyer", 1924))
        self.assertNotEqual(slot_uid("Main kariyer", 1924), slot_uid("Main kariyer", 326))

    def test_save_snapshot_uses_file_write_time(self):
        written = "2026-10-15T18:07:02+00:00"
        self.ingest("save", "save-1", self.info | {"snapshot_id": None, "exported_at": written})
        self.assertEqual((written,), self.con.execute("SELECT exported_at FROM snapshots").fetchone())

    def test_decoder_upgrade_preserves_identity_branch_dates_and_is_idempotent(self):
        snap = self.ingest('save', 'save-old')
        before = self.con.execute('SELECT branch,game_date,exported_at,revision FROM snapshots').fetchone()
        blocks = {'career_financecategories': [{'kind': 13, 'income': 100, 'expense': 0}]}
        with self.con:
            self.assertEqual(snap, upgrade_blocks(self.con, 'save-old', snap, blocks))
        after = self.con.execute('SELECT branch,game_date,exported_at,revision FROM snapshots').fetchone()
        self.assertEqual(before[:3], after[:3])
        self.assertEqual(before[3] + 1, after[3])
        self.assertEqual(blocks['career_financecategories'], read_rows(self.con, 'career_financecategories', snap))
        self.assertIsNone(upgrade_blocks(self.con, 'save-old', snap, blocks))
        self.assertEqual((1,), self.con.execute('SELECT COUNT(*) FROM snapshots').fetchone())

    def test_decoder_upgrade_does_not_replace_a_newer_same_day_source(self):
        snap = self.ingest('save', 'save-old')
        self.assertEqual(snap, self.ingest('save', 'save-new'))
        self.assertIsNone(upgrade_blocks(self.con, 'save-old', snap, {'career_financecategories': [{'kind': 13, 'income': 999}]}))

    def test_daily_partial_overlays_latest_full_and_rolls(self):
        from tools.saveimport.store import import_partial
        p, link = self.fields["player"], self.fields["squadLink"]
        tables = {p["table"]: [{p["id"]: 1, p["overall"]: 70, p["potential"]: 90}, {p["id"]: 2, p["overall"]: 60, p["potential"]: 80}],
                  link["table"]: [{link["playerId"]: 1, link["teamId"]: 5}, {link["playerId"]: 2, link["teamId"]: 6}]}
        cols = {n: list(r[0]) for n, r in tables.items()}
        with self.con:
            base = import_data(self.con, tables, cols, self.info, "export", "export-full", self.mapping, self.fields)
        daily = {p["table"]: [{p["id"]: 1, p["overall"]: 72, p["potential"]: 90}], link["table"]: [{link["playerId"]: 1, link["teamId"]: 5}]}
        info = self.info | {"snapshot_id": "d1", "game_date": "2030-07-18", "partial": True, "transfer_budget": 5}
        with self.con:
            self.assertEqual("d1", import_partial(self.con, daily, {n: list(r[0]) for n, r in daily.items()}, info, "export:d1", self.fields))
        overall = lambda snap: dict(self.con.execute(f"SELECT {p['id']}, {p['overall']} FROM raw_{p['table']} WHERE snapshot_id=?", (snap,)).fetchall())
        self.assertEqual({1: 72, 2: 60}, overall("d1"))   # 1 güncellendi, 2 tabandan
        self.assertEqual({1: 70, 2: 60}, overall(base))   # taban değişmedi
        self.assertEqual(("daily", 5), self.con.execute("SELECT source, transfer_budget FROM snapshots WHERE snapshot_id='d1'").fetchone())
        info2 = info | {"snapshot_id": "d2", "game_date": "2030-07-19"}
        daily[p["table"]][0][p["overall"]] = 73
        with self.con:
            import_partial(self.con, daily, {n: list(r[0]) for n, r in daily.items()}, info2, "export:d2", self.fields)
        self.assertEqual([("d2",)], self.con.execute("SELECT snapshot_id FROM snapshots WHERE source='daily'").fetchall())
        self.assertEqual([("2030-07-18", 72), ("2030-07-19", 73)],
                         self.con.execute("SELECT game_date, overall FROM player_daily WHERE playerid=1 ORDER BY game_date").fetchall())
        # Aynı gün tam veri varsa günlük atlanır
        with self.con:
            self.assertIsNone(import_partial(self.con, daily, {n: list(r[0]) for n, r in daily.items()},
                                             info | {"snapshot_id": "d0", "game_date": "2030-07-17"}, "export:d0", self.fields))

    def test_manifest_partial_export_is_overlaid(self):
        import csv, json, tempfile
        from pathlib import Path
        from tools.saveimport.store import import_exports
        p, link = self.fields["player"], self.fields["squadLink"]
        with tempfile.TemporaryDirectory() as d:
            d = Path(d)
            def write(snap, day, players, partial):
                for table, rows in ((p["table"], players), (link["table"], [{link["playerId"]: r[p["id"]], link["teamId"]: 5} for r in players])):
                    with (d / f"{snap}__{table}.csv").open("w", encoding="utf-8", newline="") as f:
                        w = csv.DictWriter(f, fieldnames=list(rows[0])); w.writeheader(); w.writerows(rows)
                meta = {"snapshot_id": snap, "save_uid": "testcareer", "game_date": day, "exported_at": day + "T10:00:00Z",
                        "user_teamid": 5, "files": [p["table"], link["table"]]}
                (d / f"{snap}__meta.json").write_text(json.dumps(meta), encoding="utf-8")
                with (d / "manifest.jsonl").open("a", encoding="utf-8") as f:
                    f.write(json.dumps(meta | {"reason": "auto_day" if partial else "auto_month", "partial": partial}) + chr(10))
            write("full1", "2030-07-01", [{p["id"]: 1, p["overall"]: 70, p["potential"]: 90}, {p["id"]: 2, p["overall"]: 60, p["potential"]: 80}], False)
            write("day1", "2030-07-02", [{p["id"]: 1, p["overall"]: 71, p["potential"]: 90}], True)
            with self.con:
                self.assertEqual(2, import_exports(self.con, d, self.mapping, self.fields))
                self.assertEqual(0, import_exports(self.con, d, self.mapping, self.fields))  # tekrar: yeni yok
        rows = dict(self.con.execute(f"SELECT {p['id']}, {p['overall']} FROM raw_{p['table']} WHERE snapshot_id='day1'").fetchall())
        self.assertEqual({1: 71, 2: 60}, rows)

    def test_export_then_save_is_one_snapshot_with_two_sources(self):
        snap = self.ingest("export", "export-1")
        self.assertEqual(snap, self.ingest("save", "save-1"))
        self.assertEqual((2,), self.con.execute("SELECT COUNT(*) FROM snapshot_sources").fetchone())
        self.assertIsNone(self.ingest("save", "save-1"))
        self.assertEqual((2,), self.con.execute("SELECT revision FROM snapshots").fetchone())

    def test_two_slots_with_same_uid_are_separate_branches(self):
        self.ingest("save", "one")
        self.ingest("save", "two", self.info | {"slot": "slot-b", "slot_title": "Second"})
        self.assertEqual(2, self.con.execute("SELECT COUNT(DISTINCT branch) FROM snapshots").fetchone()[0])
        self.assertEqual(2, self.con.execute("SELECT COUNT(*) FROM save_slots").fetchone()[0])

    def test_new_slot_of_a_career_keeps_earlier_history_as_parent(self):
        self.ingest("save", "one", self.info | {"game_date": "2030-07-10", "snapshot_id": None})
        self.ingest("save", "two", self.info | {"game_date": "2030-07-20", "snapshot_id": None, "slot": "slot-b", "slot_title": "Second"})
        self.assertEqual((1, "2030-07-20"), self.con.execute("SELECT parent_branch,fork_date FROM branches WHERE branch=2").fetchone())
        self.assertEqual((None, None), self.con.execute("SELECT parent_branch,fork_date FROM branches WHERE branch=1").fetchone())

    def test_daily_stays_on_the_played_branch_not_on_a_newer_day_of_another(self):
        from tools.saveimport.store import import_partial
        self.ingest("save", "a", self.info | {"game_date": "2030-07-15", "snapshot_id": None, "exported_at": "2026-10-28T21:00:00Z"})
        self.ingest("save", "b", self.info | {"game_date": "2030-07-12", "snapshot_id": None, "slot": "slot-b", "slot_title": "Second", "exported_at": "2026-10-29T21:00:00Z"})
        p, link = self.fields["player"], self.fields["squadLink"]
        daily = {p["table"]: [{p["id"]: 1, p["overall"]: 72, p["potential"]: 90}], link["table"]: [{link["playerId"]: 1, link["teamId"]: 5}]}
        info = self.info | {"snapshot_id": "d1", "game_date": "2030-07-16", "partial": True}
        with self.con:
            import_partial(self.con, daily, {n: list(r[0]) for n, r in daily.items()}, info, "export:d1", self.fields)
        self.assertEqual((2,), self.con.execute("SELECT branch FROM snapshots WHERE snapshot_id='d1'").fetchone())

    def test_two_different_uids_do_not_merge(self):
        self.ingest("save", "one")
        self.ingest("save", "two", self.info | {"save_uid": "othercareer", "slot": "slot-b"})
        self.assertEqual(2, self.con.execute("SELECT COUNT(DISTINCT save_uid) FROM snapshots").fetchone()[0])

    def test_save_after_unsaved_session_joins_the_current_branch(self):
        # Kayıt 17'de; kaydedilmeyen bir oturum 18 ve 20'yi export etti; oyun 17'ye dönüp 18'i yeniden export etti (yeni dal)
        self.ingest("save", "save-17", self.info | {"game_date": "2030-07-17", "snapshot_id": None, "exported_at": "2026-10-28T21:00:00Z"})
        self.ingest("export", "exp-18a", self.info | {"game_date": "2030-07-18", "snapshot_id": "e18a", "exported_at": "2026-10-28T23:03:00Z"})
        self.ingest("export", "exp-20a", self.info | {"game_date": "2030-07-20", "snapshot_id": "e20a", "exported_at": "2026-10-28T23:04:00Z"})
        # Yeniden oynanan gün aynı değil (maç sonucu, form): veri farklı
        p = self.fields["player"]
        self.tables = self.tables | {p["table"]: [{p["id"]: 1, p["overall"]: 71, p["potential"]: 90}]}
        self.ingest("export", "exp-18b", self.info | {"game_date": "2030-07-18", "snapshot_id": "e18b", "exported_at": "2026-10-29T10:14:00Z"})
        branch = lambda s: self.con.execute("SELECT branch FROM snapshots WHERE snapshot_id=?", (s,)).fetchone()[0]
        self.assertNotEqual(branch("e18a"), branch("e18b"))
        snap = self.ingest("save", "save-18", self.info | {"game_date": "2030-07-18", "snapshot_id": None, "exported_at": "2026-10-29T10:14:30Z"})
        self.assertEqual("e18b", snap)
        self.assertEqual(("save",), self.con.execute("SELECT source FROM snapshots WHERE snapshot_id='e18b'").fetchone())
        self.assertEqual(branch("e18b"), self.con.execute("SELECT branch FROM save_slots WHERE slot='slot-a'").fetchone()[0])

    def test_career_without_export_borrows_names_of_the_same_player(self):
        p, n = self.fields["player"], self.fields["names"]
        self.tables = {p["table"]: [{p["id"]: 1, p["birthdate"]: 150000}, {p["id"]: 2, p["birthdate"]: 152000}],
                       n["table"]: [{n["playerId"]: 1, n["name"]: "Ali Kaya", n["clubTeamId"]: 5},
                                    {n["playerId"]: 2, n["name"]: "Regen Veli", n["clubTeamId"]: 5}]}
        self.cols = {k: list(r[0]) for k, r in self.tables.items()}
        self.ingest("export", "export-a")
        # Diğer kariyer: 1 aynı oyuncu; 2 aynı id'li başka bir regen (doğum tarihi farklı), 3 hiçbir export'ta yok
        self.tables = {p["table"]: [{p["id"]: 1, p["birthdate"]: 150000}, {p["id"]: 2, p["birthdate"]: 160000}, {p["id"]: 3, p["birthdate"]: 1}]}
        self.cols = {k: list(r[0]) for k, r in self.tables.items()}
        snap = self.ingest("save", "save-b", self.info | {"save_uid": "othercareer", "snapshot_id": None})
        names = {r[n["playerId"]]: r[n["name"]] for r in read_rows(self.con, n["table"], snap)}
        self.assertEqual({1: "Ali Kaya", 2: None, 3: None}, names)

    def test_rollback_has_no_half_snapshot(self):
        self.cols = self.cols | {next(iter(self.cols)): ["unsafe;column"]}
        with self.assertRaises(ValueError):
            self.ingest("save", "bad")
        self.assertEqual((0,), self.con.execute("SELECT COUNT(*) FROM snapshots").fetchone())
        self.assertEqual((0,), self.con.execute("SELECT COUNT(*) FROM save_slots").fetchone())

    def test_new_day_does_not_reuse_live_budget(self):
        self.ingest("export", "one", self.info | {"transfer_budget": 999})
        self.ingest("save", "two", self.info | {"game_date": "2030-07-18"})
        self.assertEqual((None,), self.con.execute("SELECT transfer_budget FROM snapshots WHERE game_date='2030-07-18'").fetchone())

    def test_date_rollback_forks_the_slot(self):
        self.ingest("save", "one")
        self.ingest("save", "two", self.info | {"game_date": "2030-07-16"})
        self.assertEqual((2,), self.con.execute("SELECT COUNT(DISTINCT branch) FROM snapshots").fetchone())

    def test_archive_transfers_accumulates_seasons_and_deduplicates(self):
        self.assertEqual("2026/27", season_label("2026-07-02"))
        self.assertEqual("2029/30", season_label("2030-01-31"))
        self.assertEqual("2030/31", season_label("2030-07-25"))
        snap1 = self.ingest("save", "save-29", self.info | {"game_date": "2029-10-17", "snapshot_id": None})
        with self.con:
            archive_transfers(self.con, snap1, {"career_transfers": [
                {"transferkey": 1, "playerid": 277909, "fromteamid": 73, "toteamid": 326, "fee": 90_000_000, "wage": 60_000, "clause": None, "date": 20290831, "source": "club"},
                {"transferkey": 2, "playerid": 999999, "fromteamid": 10, "toteamid": 20, "fee": 1_000_000, "wage": 5_000, "clause": None, "date": 20310101, "source": "world"},  # gelecek tarih elenir
            ]})
        snap2 = self.ingest("save", "save-30", self.info | {"game_date": "2030-07-28", "snapshot_id": None})
        with self.con:
            upgrade_blocks(self.con, "save-30", snap2, {"career_transfers": [
                {"transferkey": 1, "playerid": 277909, "fromteamid": 73, "toteamid": 326, "fee": 90_000_000, "wage": 60_000, "clause": None, "date": 20290831, "source": "club"},
                {"transferkey": 2, "playerid": 235152, "fromteamid": 11, "toteamid": 326, "fee": 9_000_000, "wage": 50_000, "clause": None, "date": 20300131, "source": "club"},
                {"transferkey": 3, "playerid": 258485, "fromteamid": 326, "toteamid": 2, "fee": 32_000_000, "wage": None, "clause": None, "date": 20300709, "source": "club"},
            ]})
        rows = self.con.execute("SELECT season, transfer_date, playerid, fee FROM career_transfer_archive ORDER BY transfer_date").fetchall()
        self.assertEqual([
            ("2029/30", "2029-08-31", 277909, 90_000_000),
            ("2029/30", "2030-01-31", 235152, 9_000_000),
            ("2030/31", "2030-07-09", 258485, 32_000_000),
        ], rows)


if __name__ == "__main__":
    unittest.main()
