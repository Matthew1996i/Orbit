import threading
import unittest
from pathlib import Path
from unittest.mock import patch

import server


class CodexSdkTests(unittest.TestCase):
    def test_codex_agent_uses_sdk_without_global_cli(self):
        with patch.object(server, "_resolve_bin", return_value=None), patch.object(
            server, "_spawn_codex_sdk_agent", return_value="sdk-agent"
        ) as start_sdk:
            agent_id = server.spawn_agent(str(Path.cwd()), "Codex", llm_bin="codex")
        self.assertEqual(agent_id, "sdk-agent")
        self.assertEqual(start_sdk.call_args.args[0], Path.cwd())

    def test_sdk_events_update_session_status_and_replay(self):
        received = []
        info = {
            "status": "idle",
            "buffer": [],
            "buf_lock": threading.Lock(),
            "writers": [lambda event, closed=False: received.append(event)],
            "writers_lock": threading.Lock(),
        }
        server._publish_codex_event(info, {"type": "thread.started", "thread_id": "thread-1"})
        server._publish_codex_event(info, {"type": "turn.started"})
        self.assertEqual(info["codexThreadId"], "thread-1")
        self.assertEqual(info["status"], "busy")
        server._publish_codex_event(info, {"type": "turn.completed", "usage": {}})
        self.assertEqual(info["status"], "idle")
        self.assertEqual(info["buffer"], received)
        self.assertEqual([event["seq"] for event in received], [1, 2, 3])
        server._publish_codex_event(info, {"type": "turn.interrupted"})
        self.assertEqual(info["status"], "idle")

    def test_new_thread_does_not_claim_another_codex_rollout(self):
        agent_id = "sdk-test-agent"
        server.AGENTS[agent_id] = {"codexThreadId": None, "cwd": str(Path.cwd()), "transcriptPath": None}
        try:
            with patch.object(server, "_recent_codex_rollout_files") as scan:
                transcript = server.resolve_transcript({
                    "appManaged": True, "appAgentId": agent_id,
                    "llm": "codex", "sessionId": agent_id, "cwd": str(Path.cwd()),
                })
            self.assertIsNone(transcript)
            scan.assert_not_called()
        finally:
            server.AGENTS.pop(agent_id, None)


if __name__ == "__main__":
    unittest.main()
