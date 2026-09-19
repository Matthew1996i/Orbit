import unittest
from unittest.mock import patch

import server


class LlmDiscoveryTests(unittest.TestCase):
    def test_codex_only_does_not_invent_claude(self):
        with patch.object(server, '_resolve_bin', side_effect=lambda name: '/bin/codex' if name == 'codex' else None), \
             patch.object(server, '_codex_authenticated', return_value=True), \
             patch.dict(server.AUTH_CHECKS, {'codex': lambda: True}):
            llms = {item['id']: item for item in server.read_llm_clis()}
        self.assertEqual(llms['codex']['status'], 'connected')
        self.assertEqual(llms['claude']['status'], 'none')
        self.assertIsNone(llms['claude']['path'])

    def test_missing_llm_cannot_start_as_claude(self):
        with patch.object(server, '_resolve_bin', return_value=None):
            with self.assertRaisesRegex(ValueError, 'selecione uma LLM'):
                server.spawn_agent('~', 'example', llm_bin=None)


if __name__ == '__main__':
    unittest.main()
