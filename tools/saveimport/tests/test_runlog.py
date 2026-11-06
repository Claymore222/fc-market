import contextlib
import io
import os
from pathlib import Path
import tempfile
import unittest
from unittest.mock import patch

from tools.runlog import run_log


class RunLogTests(unittest.TestCase):
    def test_stdout_stays_machine_readable_and_utf8_is_logged(self):
        with tempfile.TemporaryDirectory() as d, contextlib.redirect_stdout(io.StringIO()) as console:
            with run_log('saveimport', d) as log:
                print('{"name":"Çağrı"}')
            self.assertEqual('{"name":"Çağrı"}\n', console.getvalue())
            content = log.path.read_text(encoding='utf-8')
            self.assertIn('[START]', content)
            self.assertIn('Çağrı', content)
            self.assertIn('[END]', content)

    def test_failure_has_traceback_and_does_not_hide_the_original_error(self):
        with tempfile.TemporaryDirectory() as d:
            with self.assertRaisesRegex(RuntimeError, 'test failure'):
                with run_log('assets', d) as log:
                    raise RuntimeError('test failure')
            content = log.path.read_text(encoding='utf-8')
            self.assertIn('Traceback', content)
            self.assertIn('test failure', content)
            self.assertIn('[FAILED]', content)

    def test_host_capture_avoids_duplicate_logs_and_partial_success_is_marked(self):
        with tempfile.TemporaryDirectory() as d:
            with patch.dict(os.environ, {'FC_LOG_CAPTURED': '1'}):
                with run_log('saveimport', d) as log:
                    self.assertIsNone(log.path)
            self.assertFalse((Path(d) / 'logs').exists())
            with run_log('saveimport', d) as log:
                log.exit_code = 1
            self.assertIn('[FAILED]', log.path.read_text(encoding='utf-8'))
