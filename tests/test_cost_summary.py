import json
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch

import server


class CostSummaryTests(unittest.TestCase):
    def test_claude_keeps_all_turns_when_idle(self):
        with tempfile.TemporaryDirectory() as directory:
            transcript = Path(directory) / 'claude.jsonl'
            rows = []
            for index, count in enumerate((10, 20), 1):
                rows.extend([
                    {'type': 'user', 'timestamp': f'2026-09-19T12:0{index}:00Z', 'message': {'content': 'hello'}},
                    {'type': 'assistant', 'message': {'id': f'm{index}', 'model': 'test-model', 'usage': {'input_tokens': count, 'output_tokens': 2}}},
                    {'type': 'assistant', 'message': {'id': f'm{index}', 'model': 'test-model', 'usage': {'input_tokens': count, 'output_tokens': 2}}},
                    {'type': 'system', 'subtype': 'turn_duration', 'timestamp': f'2026-09-19T12:0{index}:05Z', 'durationMs': 5000},
                ])
            transcript.write_text('\n'.join(json.dumps(row) for row in rows))
            with patch.object(server, '_has_specific_price', return_value=True), patch.object(server, '_price_for_model', return_value={'input': 1, 'output': 1}):
                usage = server._scan_claude_usage(transcript)
            self.assertEqual(usage['inputTokens'], 30)
            self.assertEqual(usage['outputTokens'], 4)
            self.assertFalse(usage['requestInProgress'])
            self.assertEqual(usage['requestDurationMs'], 5000)

    def test_codex_keeps_thread_total_when_idle(self):
        with tempfile.TemporaryDirectory() as directory:
            transcript = Path(directory) / 'codex.jsonl'
            rows = []
            for index, total in enumerate((100, 250), 1):
                rows.extend([
                    {'type': 'event_msg', 'timestamp': f'2026-09-19T12:0{index}:00Z', 'payload': {'type': 'task_started'}},
                    {'type': 'turn_context', 'payload': {'model': 'test-model'}},
                    {'type': 'token_usage_record', 'payload': {'turn_token_usage': {'input_tokens': 100, 'cached_input_tokens': 20, 'output_tokens': 5}, 'thread_token_usage': {'input_tokens': total, 'cached_input_tokens': 20, 'output_tokens': 5 * index}}},
                    {'type': 'event_msg', 'timestamp': f'2026-09-19T12:0{index}:05Z', 'payload': {'type': 'task_complete', 'duration_ms': 5000}},
                ])
            transcript.write_text('\n'.join(json.dumps(row) for row in rows))
            with patch.object(server, '_has_specific_price', return_value=True), patch.object(server, '_price_for_model', return_value={'input': 1, 'output': 1, 'cache_read': 1}):
                usage = server._scan_codex_usage(transcript)
            self.assertEqual(usage['inputTokens'], 230)
            self.assertEqual(usage['cacheReadTokens'], 20)
            self.assertEqual(usage['outputTokens'], 10)
            self.assertFalse(usage['requestInProgress'])

    def test_finished_subagent_stays_in_summary_and_parent_rollup(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            project = root / 'project' / 'parent'
            child = project / 'subagents' / 'agent-child.jsonl'
            child.parent.mkdir(parents=True)
            child.write_text(json.dumps({'type': 'assistant', 'message': {'id': 'c', 'model': 'test-model', 'usage': {'input_tokens': 7}}}))
            (project / 'parent.jsonl').write_text(json.dumps({'type': 'assistant', 'message': {'id': 'p', 'model': 'test-model', 'usage': {'input_tokens': 3}}}))
            def resolve(session):
                return child if session['sessionId'] == 'child' else project / 'parent.jsonl'
            with patch.object(server, 'PROJECTS_DIR', root), patch.object(server, 'SUBAGENT_ALIVE_WINDOW_SECS', 0), patch.object(server, '_scan_agent_roles', return_value={}), patch.object(server, '_read_subagent_cwd', return_value='project'), patch.object(server, '_read_latest_effort_model', return_value={}), patch.object(server, 'read_sessions', return_value=[{'sessionId': 'parent', 'cwd': 'project'}]), patch.object(server, 'read_codex_sessions', return_value=[]), patch.object(server, 'read_copilot_sessions', return_value=[]), patch.object(server, 'read_app_agent_sessions', return_value=[]), patch.object(server, '_has_specific_price', return_value=True), patch.object(server, '_price_for_model', return_value={'input': 1}), patch.object(server, 'resolve_transcript', side_effect=resolve):
                summary = server.read_cost_summary()
            self.assertEqual(summary['tokensTotal'], 10)
            self.assertEqual(summary['perSession']['child']['parentSessionId'], 'parent')


if __name__ == '__main__':
    unittest.main()
