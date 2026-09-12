import json
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch, Mock
import server


class ExternalSessionsTests(unittest.TestCase):
    def test_macos_uses_executable_name_instead_of_truncated_path(self):
        result = Mock(returncode=0, stdout='22162 22161 codex /Users/example/long/path/bin/codex\n')
        with patch.object(server.sys, 'platform', 'darwin'), patch.object(server.subprocess, 'run', return_value=result) as run:
            self.assertEqual(server._running_pids_by_comm('codex'), [22162])
            self.assertIn('pid=,ppid=,ucomm=,args=', run.call_args.args[0])

    def test_rollout_uses_full_id_and_excludes_process_without_terminal(self):
        with tempfile.TemporaryDirectory() as directory:
            rollout = Path(directory) / 'rollout-2026-09-12T00-00-00-full-session-id.jsonl'
            rollout.write_text(json.dumps({'payload': {'id': 'full-session-id', 'cwd': directory}}) + '\n')
            with patch.object(server, '_running_pids_by_comm', return_value=[10, 11]), \
                 patch.object(server, '_proc_cmdline', return_value='codex'), \
                 patch.object(server, '_proc_has_live_tty', side_effect=lambda pid: pid == 10), \
                 patch.object(server, '_proc_cwd', return_value=directory), \
                 patch.object(server, '_recent_codex_rollout_files', return_value=[rollout]), \
                 patch.object(server, 'CODEX_DIR', Path(directory)):
                sessions = server.read_codex_sessions()
                self.assertEqual([(s['pid'], s['sessionId']) for s in sessions], [(10, 'full-session-id')])
                self.assertFalse(sessions[0]['appManaged'])


if __name__ == '__main__':
    unittest.main()
