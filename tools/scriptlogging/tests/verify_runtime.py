"""Isolated Lua 5.4 integration check. Requires optional lupa; no game process or real export writes."""
import argparse
import json
import os
from pathlib import Path
import re
import subprocess
import sys
import tempfile

ROOT = Path(__file__).resolve().parents[3]
parser = argparse.ArgumentParser()
parser.add_argument('--runtime-dir', type=Path)
args = parser.parse_args()
if args.runtime_dir:
    sys.path.insert(0, str(args.runtime_dir.resolve()))
from lupa.lua54 import LuaRuntime, LuaError
sys.stdout.reconfigure(encoding='utf-8')

with tempfile.TemporaryDirectory(prefix='fcm-log-runtime-') as directory:
    directory = Path(directory)
    le = directory / 'LE'; scripts = le / 'lua/scripts'; scripts.mkdir(parents=True)
    exports = directory / 'exports'
    fixtures = {
        'fc_success': "print('Türkçe: çğıöşü'); return 7, nil, 'ok'",
        'fc_failure': "print('before failure'); error('expected-failure')",
        'fcm_common': "return { hello = function() print('helper-owned-message') end }",
        'fc_parent': "local h = dofile(FC_TEST_ROOT .. '/LE/lua/scripts/fcm_common.lua'); h.hello(); return true",
        'fc_callback': "AddEventHandler('test', function() print('callback message'); error('expected-callback-error') end)",
    }
    manual = (ROOT / 'exporter/lua/fc_export.lua').read_text(encoding='utf-8-sig')
    for flag in ('ENABLE_EVENT_LOG', 'AUTO_SNAPSHOT_ON_MONTH', 'AUTO_DAILY', 'AUTO_SESSION_SNAPSHOT'):
        manual, count = re.subn(r'(?m)^(\s*' + flag + r'\s*=\s*)true(\s*,)', r'\g<1>false\2', manual)
        assert count == 1
    fixtures['fc_export_manual'] = manual
    for name, body in fixtures.items():
        (scripts / (name + '.lua')).write_text(body, encoding='utf-8')
    env = os.environ | {'FC_SCRIPT_BACKUPS': str(directory / 'backups')}
    command = ['dotnet', 'run', '--project', str(ROOT / 'tools/scriptlogging'), '--', str(ROOT), str(exports), str(le)]
    first = subprocess.run(command, env=env, capture_output=True, text=True)
    assert first.returncode == 0, first.stdout + first.stderr
    second = subprocess.run(command, env=env, capture_output=True, text=True)
    assert second.returncode == 0 and 'Updated=0;' in second.stdout, second.stdout + second.stderr
    lua = LuaRuntime(unpack_returned_tuples=True)
    lua.globals().FC_TEST_ROOT = directory.as_posix()
    lua.globals().print = lambda *args: None
    lua.execute("handlers = {}; AddEventHandler = function(name, fn) handlers[#handlers+1] = fn end")
    def run(name):
        return lua.execute((scripts / (name + '.lua')).read_text(encoding='utf-8'))
    def log(name):
        return '\n'.join(p.read_text(encoding='utf-8') for p in (exports / 'logs/lua' / name).glob('*.log'))
    assert run('fc_success') == (7, None, 'ok')
    assert 'Türkçe: çğıöşü' in log('fc_success') and '[END]' in log('fc_success')
    try:
        run('fc_failure')
        raise AssertionError('Script error was hidden')
    except LuaError:
        assert 'expected-failure' in log('fc_failure') and '[FAILED]' in log('fc_failure') and 'stack traceback' in log('fc_failure')
    assert run('fc_parent') is True
    assert 'helper-owned-message' in log('fc_parent') and 'helper-owned-message' not in log('fcm_common')
    run('fc_callback')
    try:
        lua.globals().handlers[1]()
        raise AssertionError('Callback error was hidden')
    except LuaError:
        assert 'expected-callback-error' in log('fc_callback') and '[CALLBACK_ERROR]' in log('fc_callback')
    lua.execute('''
        memory_output = {}; local disk_open = io.open
        io.open = function(path, mode)
            if path:sub(1, 12) ~= 'C:/FCExport/' then return disk_open(path, mode) end
            if mode == 'w' then memory_output[path] = '' end
            return { write = function(self, ...) for i=1,select('#', ...) do memory_output[path] = (memory_output[path] or '') .. tostring(select(i, ...)) end end, close = function() end }
        end
        IsInCM = function() return true end
        GetCurrentDate = function() return {year=2026, month=10, day=30} end
        GetSaveUID = function() return 'test-career' end
        ENUM_FCEGameModesCM_EVENT_MSG_DAY_PASSED = 1
        ENUM_FCEGameModesCM_EVENT_MSG_MONTH_PASSED = 2
    ''')
    before_handlers = len(lua.globals().handlers)
    run('fc_export_manual')
    assert len(lua.globals().handlers) == before_handlers
    manifest = lua.globals().memory_output['C:/FCExport/manifest.jsonl']
    assert json.loads(manifest)['reason'] == 'manual'
    for event in (1, 2, 1):
        lua.globals().FCExport__OnCareerEvent(None, event, None)
    assert lua.globals().memory_output['C:/FCExport/manifest.jsonl'] == manifest
    assert '[END]' in log('fc_export_manual') and lua.globals().__FCMARKET_ACTIVE_LOG is None
    print('PASS: success/returns, UTF-8, stack traces, callback errors, helper ownership, idempotent setup, manual export stays manual; real files only under the temporary test folder.')
