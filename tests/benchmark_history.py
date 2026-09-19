"""Synthetic, local benchmark: python3 tests/benchmark_history.py.

Compares the previous full-file read with the bounded backlog reader.
Uses no real session data. Peak values are Python allocations, not total RSS.
"""
import gc
import json
import sys
import tempfile
import time
import tracemalloc
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
import server


def run():
    with tempfile.TemporaryDirectory() as directory:
        path = Path(directory) / 'history.jsonl'
        with path.open('w') as stream:
            for number in range(20000):
                stream.write(json.dumps({'type': 'assistant', 'message': {
                    'content': [{'type': 'text', 'text': str(number) + ' ' + 'x' * 600}]
                }}) + '\n')

        def before():
            with path.open('r', errors='ignore') as stream:
                chunk = stream.read()
            collected = []
            for line in chunk.split('\n'):
                if line.strip():
                    collected.extend(server.parse_step(line))
            return collected[-server.HISTORY_BACKLOG_STEPS:]

        outputs = []
        for label, task in [('before', before), ('after', lambda: server._read_step_backlog(path, server.parse_step)[0])]:
            gc.collect()
            tracemalloc.start()
            started = time.perf_counter()
            result = task()
            elapsed = time.perf_counter() - started
            _, peak = tracemalloc.get_traced_memory()
            tracemalloc.stop()
            outputs.append(result)
            print(json.dumps({'variant': label, 'events': len(result), 'seconds': round(elapsed, 4),
                              'peakMiB': round(peak / 1048576, 3), 'fileMiB': round(path.stat().st_size / 1048576, 3)}))
        assert outputs[0] == outputs[1], 'Backlog contents changed'


if __name__ == '__main__':
    run()
