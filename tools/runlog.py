"""Per-tool UTF-8 run logs. Console output (including JSON) is preserved verbatim."""
from contextlib import contextmanager
from datetime import datetime, timezone
import os
from pathlib import Path
import re
import sys
import time
import traceback
from types import SimpleNamespace


class Tee:
    def __init__(self, console, log):
        self.console, self.log = console, log

    def write(self, text):
        result = self.console.write(text)
        try:
            self.log.write(text)
            self.log.flush()
        except OSError:
            pass  # Logging must not terminate an otherwise valid import.
        return result

    def flush(self):
        self.console.flush()
        try:
            self.log.flush()
        except OSError:
            pass

    def __getattr__(self, name):
        return getattr(self.console, name)


@contextmanager
def run_log(name, export_root):
    if not re.fullmatch(r'[A-Za-z0-9_-]+', name):
        raise ValueError('Invalid log component')
    state = SimpleNamespace(exit_code=0, path=None)
    if os.environ.get('FC_LOG_CAPTURED') == '1':
        yield state  # Native host already captures this process into its own component folder.
        return
    stamp = datetime.now(timezone.utc)
    out, err = sys.stdout, sys.stderr
    directory = Path(export_root) / 'logs' / 'app' / name
    file = None
    try:
        directory.mkdir(parents=True, exist_ok=True)
        state.path = directory / (stamp.strftime('%Y%m%d_%H%M%S_%f') + f'_{os.getpid()}.log')
        file = state.path.open('x', encoding='utf-8')
        file.write(f'{stamp.isoformat()} [START] component={name} pid={os.getpid()} timestamps=UTC\n')
        file.flush()
    except OSError as exc:
        if file is not None:
            try:
                file.close()
            except OSError:
                pass
        print(f'[FC-LOG] Log dosyası açılamadı: {exc}', file=err)
        yield state
        return
    started = time.monotonic()
    try:
        sys.stdout, sys.stderr = Tee(out, file), Tee(err, file)
        try:
            yield state
        except BaseException:
            state.exit_code = 1
            try:
                traceback.print_exc(file=file)
            except OSError:
                pass
            raise
    finally:
        sys.stdout, sys.stderr = out, err
        try:
            file.write(f'\n{datetime.now(timezone.utc).isoformat()} [{"END" if state.exit_code == 0 else "FAILED"}] '
                       f'exit_code={state.exit_code} elapsed_seconds={time.monotonic() - started:.3f}\n')
        except OSError:
            pass
        try:
            file.close()
        except OSError:
            pass
