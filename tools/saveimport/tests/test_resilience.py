import contextlib
import csv
import hashlib
import json
from pathlib import Path
import sqlite3
import subprocess
import sys
import tempfile
from types import SimpleNamespace
import unittest
from unittest.mock import patch

from tools.saveimport import store
from tools.saveimport.runner import run_once


class CheckpointTests(unittest.TestCase):
    def setUp(self):
        self.con = sqlite3.connect(':memory:')
        store.initialize(self.con)
        self.mapping, self.fields = store.load_config()
        p, link = self.fields['player'], self.fields['squadLink']
        self.tables = {p['table']: [{p['id']: 1, p['overall']: 70, p['potential']: 90}],
                       link['table']: [{link['playerId']: 1, link['teamId']: 5}]}
        self.cols = {n: list(rows[0]) for n, rows in self.tables.items()}
        self.info = {'save_uid': 'testcareer', 'game_date': '2030-07-17', 'slot': 'disk-a', 'slot_title': 'A',
                     'source_path': '/game/A', 'user_teamid': 5, 'user_team_name': 'Test FC', 'exported_at': '2026-10-29T10:00:00Z'}

    def tearDown(self):
        self.con.close()

    def ingest(self, source, key, **changes):
        digest = changes.pop('digest', None)
        with self.con:
            return store.import_data(self.con, self.tables, self.cols, self.info | changes, source, key,
                                     self.mapping, self.fields, digest=digest)

    def head(self):
        return self.con.execute('SELECT snapshot_id FROM save_heads WHERE slot=?', ('disk-a',)).fetchone()[0]

    def test_unsaved_future_and_identical_historical_export_preserve_disk_checkpoint(self):
        saved = self.ingest('save', 'save17')
        future = self.ingest('export', 'exp20', snapshot_id='exp20', game_date='2030-07-20', exported_at='2026-10-29T11:00:00Z')
        rollback = self.ingest('export', 'exp17b', snapshot_id='exp17b', exported_at='2026-10-29T12:00:00Z')
        self.assertEqual(saved, self.head())
        self.assertNotEqual(saved, rollback)
        branches = dict(self.con.execute('SELECT snapshot_id,branch FROM snapshots'))
        self.assertNotEqual(branches[future], branches[rollback])
        self.assertEqual(3, len(branches))

    def test_same_day_unconfirmed_export_is_not_overwritten_by_different_save(self):
        draft = self.ingest('export', 'draft', snapshot_id='draft')
        p = self.fields['player']
        self.tables[p['table']][0][p['overall']] = 71
        saved = self.ingest('save', 'save17', digest='bytes-71')
        self.assertNotEqual(draft, saved)
        self.assertEqual(70, store.read_rows(self.con, p['table'], draft)[0][p['overall']])
        self.assertEqual(saved, self.head())

    def test_same_day_distinct_save_hashes_preserve_each_disk_revision(self):
        first = self.ingest('save', 'save-first', digest='bytes-one')
        p = self.fields['player']
        self.tables[p['table']][0][p['overall']] = 71
        second = self.ingest('save', 'save-second', digest='bytes-two')
        self.assertNotEqual(first, second)
        self.assertEqual(70, store.read_rows(self.con, p['table'], first)[0][p['overall']])
        self.assertEqual(second, self.head())

    def test_replayed_save_does_not_join_the_future_of_an_unsaved_session(self):
        self.ingest('save', 'save17', digest='bytes-17')
        self.ingest('export', 'exp20', snapshot_id='exp20', game_date='2030-07-20')
        replayed = self.ingest('save', 'save18', digest='bytes-18', game_date='2030-07-18')
        branches = dict(self.con.execute('SELECT snapshot_id,branch FROM snapshots'))
        self.assertNotEqual(branches['exp20'], branches[replayed])
        self.assertEqual(replayed, self.head())

    def test_known_bytes_restore_disk_head_without_reimport_or_history_loss(self):
        def fake_save(content):
            tables = {n: SimpleNamespace(rows=rows, fields=[SimpleNamespace(name=c) for c in self.cols[n]])
                      for n, rows in self.tables.items()}
            return SimpleNamespace(container=content, tables=tables, payload=b'')
        with patch.object(store, 'identity', return_value=self.info), patch.object(store.career, 'read_career', return_value={}):
            with self.con:
                old = store.import_save(self.con, fake_save(b'old17'), Path('/game/A'), Path('/backup/old'), self.mapping, self.fields)
            self.ingest('export', 'exp20', snapshot_id='exp20', game_date='2030-07-20')
            self.ingest('save', 'other-source', game_date='2030-07-18')
            with self.con:
                self.assertIsNone(store.import_save(self.con, fake_save(b'old17'), Path('/game/A'), Path('/backup/old'), self.mapping, self.fields))
            self.assertEqual(old, self.head())
            self.assertIsNotNone(self.con.execute("SELECT 1 FROM snapshots WHERE snapshot_id='exp20'").fetchone())

    def test_legacy_same_day_overwrite_is_reconstructed_from_current_disk_bytes(self):
        save = SimpleNamespace(container=b'old17', payload=b'', tables={
            n: SimpleNamespace(rows=rows, fields=[SimpleNamespace(name=c) for c in self.cols[n]])
            for n, rows in self.tables.items()})
        with patch.object(store, 'identity', return_value=self.info), patch.object(store.career, 'read_career', return_value={}):
            with self.con:
                old = store.import_save(self.con, save, Path('/game/A'), Path('/backup/old'), self.mapping, self.fields)
                p = self.fields['player']
                self.con.execute(f"UPDATE raw_{p['table']} SET {p['overall']}=99 WHERE snapshot_id=?", (old,))
                self.con.execute('INSERT INTO snapshot_sources VALUES (?,?,?,?,?,?)',
                                 ('later-bytes', old, 'save', 'other-hash', '/backup/later', '2999-01-01'))
                recovered = store.import_save(self.con, save, Path('/game/A'), Path('/backup/old'), self.mapping, self.fields)
            self.assertNotEqual(old, recovered)
            self.assertEqual(70, store.read_rows(self.con, p['table'], recovered)[0][p['overall']])
            self.assertEqual(recovered, self.head())


class IsolationTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.root = Path(self.temp.name)
        self.export = self.root / 'exports'; self.export.mkdir()
        self.db = self.root / 'db.sqlite'
        self.backups = self.root / 'backups'
        _, fields = store.load_config()
        self.player = fields['player']
        self.entries = []

    def tearDown(self):
        self.temp.cleanup()

    def entry(self, snap, day='2030-07-17'):
        meta = {'snapshot_id': snap, 'save_uid': 'testcareer', 'game_date': day,
                'exported_at': '2026-10-29T10:00:00Z', 'files': [self.player['table']]}
        (self.export / f'{snap}__meta.json').write_text(json.dumps(meta), encoding='utf-8')
        self.csv(snap)
        self.entries.append(meta)
        self.manifest()
        return meta

    def csv(self, snap):
        p = self.player
        with (self.export / f"{snap}__{p['table']}.csv").open('w', encoding='utf-8', newline='') as f:
            w = csv.DictWriter(f, fieldnames=[p['id'], p['overall'], p['potential']])
            w.writeheader(); w.writerow({p['id']: 1, p['overall']: 70, p['potential']: 90})

    def manifest(self):
        (self.export / 'manifest.jsonl').write_text('\n'.join(json.dumps(m) for m in self.entries) + '\n', encoding='utf-8')

    def read(self, sql):
        with contextlib.closing(sqlite3.connect(self.db)) as con:
            return con.execute(sql).fetchall()

    def run_import(self, sources=None, seen=None):
        return run_once(sources or [], self.db, self.backups, self.export, seen=seen)

    def test_missing_csv_does_not_block_good_exports_and_repairs_automatically(self):
        self.entry('good17')
        self.entry('broken18', '2030-07-18')
        missing = self.export / f"broken18__{self.player['table']}.csv"
        missing.unlink()
        self.entry('good19', '2030-07-19')
        result = self.run_import()
        self.assertEqual(2, result['exports'])
        self.assertEqual(1, len(result['errors']))
        self.assertEqual([('good17',), ('good19',)], self.read('SELECT snapshot_id FROM snapshots ORDER BY snapshot_id'))
        self.assertEqual([('ok',)], self.read('PRAGMA integrity_check'))
        self.assertEqual([(1,)], self.read('SELECT COUNT(*) FROM import_issues'))
        self.csv('broken18')
        self.assertEqual(1, self.run_import()['exports'])
        self.assertEqual([], self.read('SELECT * FROM import_issues'))
        self.assertEqual(0, self.run_import()['exports'])

    def test_malformed_manifest_metadata_and_csv_are_isolated(self):
        self.entry('badcsv')
        (self.export / f"badcsv__{self.player['table']}.csv").write_text('bad;column\n1\n', encoding='utf-8')
        self.entry('badmeta')
        (self.export / 'badmeta__meta.json').write_text('{', encoding='utf-8')
        self.entries += [[], {'snapshot_id': '../escape'}, {'snapshot_id': 7}]
        self.entry('good')
        result = self.run_import()
        self.assertEqual(1, result['exports'])
        self.assertEqual(5, len(result['errors']))
        self.assertEqual([('good',)], self.read('SELECT snapshot_id FROM snapshots'))

    def test_bad_save_and_partial_manifest_do_not_prevent_valid_export(self):
        game = self.root / 'game'; game.mkdir()
        invalid = game / 'CmMgrCtest'; invalid.write_bytes(b'not-a-save')
        before = hashlib.sha256(invalid.read_bytes()).hexdigest()
        self.entry('good')
        with (self.export / 'manifest.jsonl').open('a', encoding='utf-8') as f:
            f.write('{"snapshot_id":')
        result = self.run_import([game])
        self.assertEqual(1, result['exports'])
        self.assertEqual(2, len(result['errors']))
        self.assertEqual(before, hashlib.sha256(invalid.read_bytes()).hexdigest())

    def test_overflow_and_conflicting_metadata_do_not_poison_the_watcher(self):
        self.entry('overflow')
        p = self.player
        (self.export / f"overflow__{p['table']}.csv").write_text(
            f"{p['id']},{p['overall']},{p['potential']}\n1,999999999999999999999999999,90\n", encoding='utf-8')
        self.entry('mismatch')
        self.entries[-1]['save_uid'] = 'othercareer'
        self.entry('good')
        result = self.run_import()
        self.assertEqual(1, result['exports'])
        self.assertEqual(2, len(result['errors']))
        self.assertEqual([('good',)], self.read('SELECT snapshot_id FROM snapshots'))
        self.assertEqual([('ok',)], self.read('PRAGMA integrity_check'))

    def test_watcher_does_not_mark_a_second_game_write_as_already_seen(self):
        game = self.root / 'game'; game.mkdir()
        source = game / 'CmMgrCtest'; source.write_bytes(b'old')
        before = source.stat()
        def read_copy(path, backups):
            source.write_bytes(b'new-and-different-size')
            return object(), Path('/copy')
        seen = {}
        with patch('tools.saveimport.runner.read_save', side_effect=read_copy), patch('tools.saveimport.runner.import_save', return_value=None):
            self.run_import([game], seen)
        self.assertEqual((before.st_size, before.st_mtime_ns), seen[str(source)])
        self.assertNotEqual((source.stat().st_size, source.stat().st_mtime_ns), seen[str(source)])

    def test_unchanged_save_is_not_reread_on_next_launch(self):
        game = self.root / 'game'; game.mkdir()
        source = game / 'CmMgrCtest'; source.write_bytes(b'old')
        reads = []
        def read_copy(path, backups):
            reads.append(path.name)
            return object(), Path('/copy')
        with patch('tools.saveimport.runner.read_save', side_effect=read_copy), patch('tools.saveimport.runner.import_save', return_value='snap'):
            self.run_import([game])
            self.run_import([game])                 # yeni açılış: değişmemiş kayıt atlanır
            seen = {}
            self.run_import([game], seen)           # izleyicinin ilk turu da atlar
            self.assertIn(str(source), seen)
            source.write_bytes(b'new-and-different-size')
            self.run_import([game])                 # değişen kayıt yeniden okunur
            with patch('tools.saveimport.runner.BLOCK_VERSION', 999):
                self.run_import([game])             # okuyucu sürümü artınca da
        self.assertEqual(['CmMgrCtest'] * 3, reads)

    def test_failed_save_is_retried_on_next_launch(self):
        game = self.root / 'game'; game.mkdir()
        (game / 'CmMgrCtest').write_bytes(b'not-a-save')
        self.assertEqual(1, len(self.run_import([game])['errors']))
        self.assertEqual(1, len(self.run_import([game])['errors']))

    def test_export_only_cli_uses_the_same_isolation_without_any_game_save(self):
        self.entry('good')
        self.entry('broken')
        (self.export / 'broken__meta.json').unlink()
        result = subprocess.run([sys.executable, '-m', 'tools.saveimport', 'import', '--export-dir', str(self.export),
                                 '--db', str(self.db), '--backups', str(self.backups)], capture_output=True, text=True)
        self.assertEqual(1, result.returncode)  # partial success is reported to the native host
        self.assertEqual([('good',)], self.read('SELECT snapshot_id FROM snapshots'))
        self.assertEqual([(1,)], self.read('SELECT COUNT(*) FROM import_issues'))

    def add_names(self, entry, raw):
        _, fields = store.load_config()
        names = fields['names']
        entry['files'].append(names['table'])
        (self.export / f"{entry['snapshot_id']}__meta.json").write_text(json.dumps(entry), encoding='utf-8')
        (self.export / f"{entry['snapshot_id']}__{names['table']}.csv").write_bytes(
            (names['playerId'] + ',' + names['name'] + '\n').encode() + raw)
        self.manifest()
        return names

    def test_truncated_utf8_name_loses_the_partial_letter_without_a_warning(self):
        entry = self.entry('truncated')
        p = self.player
        with (self.export / f"truncated__{p['table']}.csv").open('a', encoding='utf-8', newline='') as f:
            csv.writer(f).writerow([2, 75, 85])
        names = self.add_names(entry, '1,Tiberiu Căpuș'.encode() + b'\xc4\n' + '2,İsmail Öztürk\n'.encode())
        path = self.export / f"truncated__{names['table']}.csv"
        original = path.read_bytes()
        result = self.run_import()
        self.assertEqual(1, result['exports']); self.assertEqual([], result['errors'])
        self.assertEqual([(1, 'Tiberiu Căpuș'), (2, 'İsmail Öztürk')], self.read(
            f"SELECT {names['playerId']},{names['name']} FROM raw_{names['table']} ORDER BY {names['playerId']}"))
        self.assertEqual(original, path.read_bytes())
        self.assertEqual([(0,)], self.read('SELECT count(*) FROM import_issues'))
        self.assertEqual([(0,)], self.read('SELECT count(*) FROM import_warnings'))
        self.assertEqual(0, self.run_import()['exports'])

    def test_old_truncated_name_warning_and_marker_are_cleared_once(self):
        names = self.add_names(self.entry('truncated'), '1,Tiberiu Căpuș'.encode() + b'\xc4\n')
        self.run_import()
        with contextlib.closing(sqlite3.connect(self.db)) as con, con:
            con.execute(f"UPDATE raw_{names['table']} SET {names['name']}='Tiberiu Căpuș\ufffd'")
            con.execute("INSERT INTO import_warnings VALUES ('export:x','x','isim sonundaki eksik UTF-8 karakteri','a','a')")
        self.assertEqual(1, self.run_import()['exports'])
        self.assertEqual([('Tiberiu Căpuș',)], self.read(f"SELECT {names['name']} FROM raw_{names['table']}"))
        self.assertEqual([(0,)], self.read('SELECT count(*) FROM import_warnings'))
        self.assertEqual(0, self.run_import()['exports'])

    def test_invalid_utf8_in_numeric_column_still_fails_and_good_export_continues(self):
        entry = self.entry('numericbad')
        p = self.player
        (self.export / f"numericbad__{p['table']}.csv").write_bytes(
            f"{p['id']},{p['overall']}\n1,80".encode() + b'\xc4\n')
        self.entry('good')
        result = self.run_import()
        self.assertEqual(1, result['exports']); self.assertEqual(1, len(result['errors']))
        self.assertIn('numericbad__', result['errors'][0])
        self.assertEqual([(0,)], self.read('SELECT count(*) FROM import_warnings'))

    def test_invalid_utf8_inside_name_is_not_misclassified_as_fixed_length_truncation(self):
        self.add_names(self.entry('badname'), b'1,Tiberiu \xc4X\n')
        result = self.run_import()
        self.assertEqual(0, result['exports']); self.assertEqual(1, len(result['errors']))
        self.assertEqual([(0,)], self.read('SELECT count(*) FROM import_warnings'))

    def test_invalid_utf8_header_remains_a_safe_isolated_error(self):
        self.entry('badheader')
        (self.export / f"badheader__{self.player['table']}.csv").write_bytes(b'player\xc4\n1\n')
        self.entry('good')
        result = self.run_import()
        self.assertEqual(1, result['exports']); self.assertEqual(1, len(result['errors']))
        self.assertIn('Invalid UTF-8 CSV header', result['errors'][0])


if __name__ == '__main__':
    unittest.main()
