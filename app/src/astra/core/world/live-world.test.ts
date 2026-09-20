import { expect, it } from 'vitest';
import type { SessionInfo } from '../../../api';
import { activityPresentation } from './activity';
import { syncLiveWorld, stationObstacles, actorObstacles } from './live-layout';
import { advanceWorld } from './live-motion';
import { findRoute, segmentClear } from './live-navigation';
import { atGround, createLiveWorld, distance } from './live-world.types';
import { ownedActivities } from './live-activity';

const session = (sessionId: string, extra: Partial<SessionInfo> = {}): SessionInfo => ({ sessionId, pid: 1, cwd: '.', startedAt: 0, alive: true, status: 'busy', ...extra });
const tool = (sessionId: string, parentSessionId = 'agent') => session(sessionId, { isMcp: true, mcpServer: 'web search', mcpTool: sessionId, parentSessionId });

it('mirrors all node kinds and relationships using persistent IDs', () => {
  const world = createLiveWorld();
  const sessions = [session('agent'), session('child', { parentSessionId: 'agent', isSubagent: true }), tool('search'),
    session('skill', { parentSessionId: 'child', isSkill: true, skillName: 'browse' }),
    session('group', { parentSessionId: 'agent', isResourceGroup: true }), session('resource', { parentSessionId: 'group', isResource: true })];
  syncLiveWorld(world, sessions);
  expect(world.nodes.size).toBe(6); expect(world.actors.size).toBe(2);
  expect(ownedActivities(world, 'agent').map((node) => node.id).sort()).toEqual(['group', 'resource', 'search']);
  expect(ownedActivities(world, 'child').map((node) => node.id)).toEqual(['skill']);
  const positions = new Map([...world.nodes].map(([id, node]) => [id, [...node.position]]));
  const actorPositions = new Map([...world.actors].map(([id, actor]) => [id, [...actor.position]]));
  syncLiveWorld(world, [...sessions].reverse().concat(tool('new-tool')));
  for (const [id, position] of positions) expect(world.nodes.get(id)?.position).toEqual(position);
  for (const [id, position] of actorPositions) expect(world.actors.get(id)?.position).toEqual(position);
});

it('routes around models and checks swept segments rather than just endpoints', () => {
  const obstacles = [{ x: 0, z: 0, radius: 2 }];
  const start = atGround(-8, 0), end = atGround(8, 0);
  expect(segmentClear(start, end, obstacles)).toBe(false);
  const route = findRoute(start, end, obstacles);
  expect(route.length).toBeGreaterThan(1);
  let previous = start;
  for (const point of route) { expect(segmentClear(previous, point, obstacles)).toBe(true); previous = point; }
  expect(previous).toEqual(end);
  expect(findRoute(atGround(0, 0), end, obstacles)).toEqual([]);
});

it('busy agents walk to activities continuously and visit simultaneous tools', () => {
  const world = createLiveWorld();
  syncLiveWorld(world, [session('agent'), tool('search'), tool('read')]);
  const actor = world.actors.get('agent')!;
  for (let frame = 0; frame < 1800; frame++) {
    const before = [...actor.position] as typeof actor.position;
    advanceWorld(world, frame % 100 === 0 ? 10 : 0.05);
    expect(distance(before, actor.position)).toBeLessThanOrEqual(0.131);
    expect(segmentClear(actor.position, actor.position, stationObstacles(world))).toBe(true);
    if (actor.visited.size === 2) break;
  }
  expect(actor.visited.size).toBe(2);
  expect(distance(actor.position, actor.destination)).toBeLessThan(0.11);
});

it('does not blink or teleport on polling, removal, or reappearance during departure', () => {
  const world = createLiveWorld();
  const sessions = [session('agent'), tool('search')];
  syncLiveWorld(world, sessions);
  for (let frame = 0; frame < 30; frame++) advanceWorld(world, 0.05);
  const actor = world.actors.get('agent')!, position = [...actor.position];
  syncLiveWorld(world, []);
  expect(world.actors.get('agent')).toBe(actor); expect(actor.position).toEqual(position);
  advanceWorld(world, 0.05);
  const departing = [...actor.position];
  syncLiveWorld(world, sessions);
  expect(world.actors.get('agent')).toBe(actor); expect(actor.position).toEqual(departing);
  expect(actor.opacity).toBe(1);
  syncLiveWorld(world, []);
  for (let frame = 0; frame < 1000 && world.nodes.size; frame++) advanceWorld(world, 0.05);
  expect(world.nodes.size).toBe(0); expect(world.actors.size).toBe(0);
});

it('separates actors during crossings and newly arriving activity nodes', () => {
  const world = createLiveWorld();
  const sessions = Array.from({ length: 6 }, (_, index) => session(`agent-${index}`));
  syncLiveWorld(world, sessions);
  for (let frame = 0; frame < 1000; frame++) {
    if (frame === 60) syncLiveWorld(world, sessions.concat(sessions.map((agent) => tool(`tool-${agent.sessionId}`, agent.sessionId))));
    advanceWorld(world, 0.05);
    for (const actor of world.actors.values()) {
      expect(segmentClear(actor.position, actor.position, [...stationObstacles(world), ...actorObstacles(world, actor.id)])).toBe(true);
    }
  }
  for (const actor of world.actors.values()) expect(distance(actor.position, actor.destination)).toBeLessThan(0.15);
});

it('maps tool, skill, file, editing and resource nodes', () => {
  expect(activityPresentation(tool('search')).model).toBe('MarketStand_1');
  expect(activityPresentation(session('skill', { isSkill: true })).model).toBe('Rock_1');
  expect(activityPresentation(session('skill', { isSkill: true })).prop).toBe('Crystal_Big');
  expect(activityPresentation(session('file', { isMcp: true, mcpTool: 'read_file' })).model).toBe('Chest_Closed');
  expect(activityPresentation(session('file', { isMcp: true, mcpTool: 'read_file' })).workingModel).toBe('Chest_Open');
  expect(activityPresentation(session('edit', { isMcp: true, mcpTool: 'apply_patch' })).model).toBe('Cauldron');
  expect(activityPresentation(session('shell', { isMcp: true, mcpServer: 'localhost', mcpTool: 'bash' })).model).toBe('Lever_Left');
  expect(activityPresentation(session('resource', { isResource: true })).model).toBe('Mill');
  expect(activityPresentation(session('port', { isResource: true, resourceKind: 'port', name: 'Dev server :5173' })).label).toBe('Servidor / porta');
  expect(activityPresentation(session('other', { isMcp: true, mcpTool: 'mystery' })).model).toBe('Cart');
});

it('stays working at the bench of the current tool and ignores long-lived resources', () => {
  const world = createLiveWorld();
  syncLiveWorld(world, [session('agent'), session('server', { parentSessionId: 'agent', isResource: true })]);
  const actor = world.actors.get('agent')!;
  for (let frame = 0; frame < 600; frame++) advanceWorld(world, 0.05);
  expect(actor.activityId).toBeNull();
  expect(distance(actor.position, world.nodes.get('agent')!.position)).toBeLessThan(0.11);
  syncLiveWorld(world, [session('agent'), session('server', { parentSessionId: 'agent', isResource: true }), tool('search')]);
  for (let frame = 0; frame < 600; frame++) { advanceWorld(world, 0.05); if (frame && distance(actor.position, actor.destination) < 0.02) break; }
  expect(actor.activityId).toBe('search');
  expect(actor.working).toBe(true);
  const bench = [...actor.position];
  for (let frame = 0; frame < 200; frame++) advanceWorld(world, 0.05);
  expect(actor.position).toEqual(bench); expect(actor.walking).toBe(false); expect(actor.working).toBe(true);
});
