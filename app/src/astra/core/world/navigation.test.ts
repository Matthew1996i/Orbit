import { expect, it } from 'vitest';
import { groundHeight, isAgentWalkable, randomWalkPath } from './navigation';
import { createRandom } from '../../shared/random';
import { createVillage } from './village';
import { agentIdentity } from './agent-identity';
import type { SessionInfo } from '../../../api';
import { obstructsView } from './occlusion';

it('routes idle agents through connected ground without crossing houses, trees or gaps', () => {
  const random = createRandom(35);
  let x = 0, z = 1;
  for (let route = 0; route < 20; route++) {
    const path = randomWalkPath(x, z, random);
    expect(path.length).toBeGreaterThan(0);
    for (const point of path) {
      expect(isAgentWalkable(point[0], point[2])).toBe(true);
      expect(Math.hypot(point[0] - x, point[2] - z)).toBeLessThanOrEqual(0.501);
      expect(point[1]).toBe(groundHeight(point[0], point[2]));
      [x, , z] = point;
    }
  }
  expect(isAgentWalkable(0, 1)).toBe(true);
  expect(isAgentWalkable(60, 0)).toBe(false);
  const village = createVillage();
  for (const building of village.buildings) expect(isAgentWalkable(building.position[0], building.position[2])).toBe(false);
});

it('identifies Claude and Codex without labelling another provider as Claude', () => {
  const session: SessionInfo = { sessionId: 'test', pid: 0, cwd: '.', startedAt: 0, alive: true };
  expect(agentIdentity({ ...session, llm: 'claude', model: 'claude-opus-4-6' }).variant).toBe('claude');
  expect(agentIdentity({ ...session, llm: 'codex', model: 'gpt-5.4' }).variant).toBe('codex');
  expect(agentIdentity({ ...session, llm: 'gemini' }).variant).toBe('neutral');
  expect(agentIdentity({ ...session, model: 'gpt-5.4' }).provider).toBe('Codex');
});

it('hides obstacles between the camera and lobby, preserving the background and overhead view', () => {
  const target = { x: 0, y: 1, z: 0 };
  const camera = { x: 0, y: 5, z: 30 };
  expect(obstructsView(camera, target, { position: [0, 0, 15], radius: 4, height: 10 })).toBe(true);
  expect(obstructsView(camera, target, { position: [0, 0, -15], radius: 4, height: 10 })).toBe(false);
  expect(obstructsView({ x: 0, y: 40, z: 0 }, target, { position: [0, 0, 15], radius: 4, height: 10 })).toBe(false);
});
