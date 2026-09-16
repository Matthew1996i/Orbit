import { expect, it } from 'vitest';
import type { SessionInfo } from '../../../api';
import { layoutAgents } from './agents';

const session = (sessionId: string, extra: Partial<SessionInfo> = {}): SessionInfo => ({
  sessionId, pid: 1, cwd: '/project', startedAt: 0, alive: true, ...extra,
});

it('represents sessions and subagents but excludes tools and resources', () => {
  const agents = layoutAgents([
    session('agent'), session('child', { isSubagent: true }), session('mcp', { isMcp: true }),
    session('skill', { isSkill: true }), session('resource', { isResource: true }),
    session('group', { isResourceGroup: true }),
  ]);
  expect(agents.map(({ session: agent }) => agent.sessionId)).toEqual(['agent', 'child']);
  expect(layoutAgents([])).toEqual([]);
});

it('keeps positions deterministic on polling reorder and inside the courtyard', () => {
  const sessions = Array.from({ length: 30 }, (_, index) => session(`agent-${index}`));
  const original = [...sessions];
  const agents = layoutAgents(sessions);
  expect(layoutAgents([...sessions].reverse())).toEqual(agents);
  expect(sessions).toEqual(original);
  expect(new Set(agents.map(({ position }) => position.join(','))).size).toBe(30);
  for (const { position } of agents) {
    expect(Math.abs(position[0])).toBeLessThan(7);
    expect(Math.abs(position[2])).toBeLessThan(7);
  }
});
