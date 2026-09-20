import { expect, it } from 'vitest';
import type { SessionInfo } from '../../../api';
import { agentIdentity } from './agent-identity';

it('identifies Claude and Codex without labelling another provider as Claude', () => {
  const session: SessionInfo = { sessionId: 'test', pid: 0, cwd: '.', startedAt: 0, alive: true };
  expect(agentIdentity({ ...session, llm: 'claude', model: 'claude-opus-4-6' }).variant).toBe('claude');
  expect(agentIdentity({ ...session, llm: 'codex', model: 'gpt-5.4' }).variant).toBe('codex');
  expect(agentIdentity({ ...session, llm: 'gemini' }).variant).toBe('neutral');
  expect(agentIdentity({ ...session, model: 'gpt-5.4' }).provider).toBe('Codex');
});
