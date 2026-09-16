import io
import json
import tempfile
import unittest
from pathlib import Path
from unittest.mock import Mock, patch

import server


class HistoryPerformanceTests(unittest.TestCase):
    def test_popout_stream_reads_only_its_session(self):
        handler = object.__new__(server.Handler)
        handler.path = '/api/stream?sessionId=wanted'
        handler.send_response = Mock()
        handler.send_header = Mock()
        handler.end_headers = Mock()
        events = []
        def send(event):
            if event.get('kind') == 'ping':
                raise BrokenPipeError()
            events.append(event)
        handler._sse_send = send
        sessions = [{'sessionId': name, 'pid': index, 'alive': True} for index, name in enumerate(['wanted', 'other'])]
        with tempfile.TemporaryDirectory() as directory:
            path = Path(directory) / 'history.jsonl'
            path.write_text('{"type":"user","message":{"content":"hello"}}\n')
            with patch.object(server, 'read_sessions', return_value=sessions), \
                 patch.object(server, 'find_subagent_transcripts', return_value=[]), \
                 patch.object(server, 'read_codex_sessions', return_value=[]), \
                 patch.object(server, 'resolve_transcript', return_value=path) as resolve:
                handler._stream_steps()
                self.assertTrue(events)
                self.assertEqual({event['sessionId'] for event in events}, {'wanted'})
                self.assertTrue(all(call.args[0]['sessionId'] == 'wanted' for call in resolve.call_args_list))

    def test_transcript_cache_evicts_old_entries_and_retains_refreshed_entries(self):
        cache = {}
        for number in range(server.TRANSCRIPT_CACHE_LIMIT):
            server._store_transcript_cache(cache, number, number)
        server._store_transcript_cache(cache, 0, 'refreshed')
        server._store_transcript_cache(cache, 'new', 'new')
        self.assertEqual(len(cache), server.TRANSCRIPT_CACHE_LIMIT)
        self.assertEqual(cache[0], 'refreshed')
        self.assertNotIn(1, cache)

    def test_reverse_lines_preserves_utf8_and_long_lines_across_blocks(self):
        raw = ('ação\n' + '漢' * 100 + '\nlast').encode()
        lines = list(server._reverse_file_lines(io.BytesIO(raw), len(raw), block_size=7))
        self.assertEqual(lines, list(reversed(raw.split(b'\n'))))

    def test_backlog_only_parses_recent_events_in_chronological_order(self):
        with tempfile.TemporaryDirectory() as directory:
            path = Path(directory) / 'history.jsonl'
            path.write_text(''.join(json.dumps({'number': number}) + '\n' for number in range(20000)))
            parser = Mock(side_effect=lambda line: [json.loads(line)])
            steps, offset = server._read_step_backlog(path, parser)
            self.assertEqual(steps, [{'number': number} for number in range(19600, 20000)])
            self.assertEqual(parser.call_count, 400)
            self.assertEqual(offset, path.stat().st_size)

    def test_partial_tail_is_left_for_next_incremental_read(self):
        with tempfile.TemporaryDirectory() as directory:
            path = Path(directory) / 'history.jsonl'
            complete = b'{"number": 1}\n'
            path.write_bytes(complete + b'{"number":')
            steps, offset = server._read_step_backlog(path, lambda line: [json.loads(line)])
            self.assertEqual(steps, [{'number': 1}])
            self.assertEqual(offset, len(complete))

    def test_multiple_events_per_line_and_noise_keep_last_events(self):
        with tempfile.TemporaryDirectory() as directory:
            path = Path(directory) / 'history.jsonl'
            path.write_text('events\nnoise\nevents\n')
            def parser(line):
                return list(range(300)) if line == 'events' else []
            steps, _ = server._read_step_backlog(path, parser)
            self.assertEqual(steps, list(range(200, 300)) + list(range(300)))

    def test_empty_history(self):
        with tempfile.TemporaryDirectory() as directory:
            path = Path(directory) / 'history.jsonl'
            path.touch()
            self.assertEqual(server._read_step_backlog(path, server.parse_step), ([], 0))


if __name__ == '__main__':
    unittest.main()
