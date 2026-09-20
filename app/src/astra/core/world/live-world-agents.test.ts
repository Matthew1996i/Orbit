import { expect, it } from 'vitest';
import type { SessionInfo } from '../../../api';
import { syncLiveWorld, stationObstacles, actorObstacles } from './live-layout';
import { advanceWorld } from './live-motion';
import { segmentClear } from './live-navigation';
import { CELL_SIZE, createLiveWorld, distance } from './live-world.types';
import { ownedActivities } from './live-activity';
import { actorStatus } from './live-status';

// Cenarios com varios agentes ao mesmo tempo, cada um com seus subagentes e
// ferramentas: cada personagem so cuida do que e dele, ninguem se sobrepoe e
// todos chegam a bancada certa sem piscar ou atravessar nada.
const session = (sessionId: string, extra: Partial<SessionInfo> = {}): SessionInfo =>
  ({ sessionId, pid: 1, cwd: '.', startedAt: 0, alive: true, status: 'busy', ...extra });
const agent = (id: string, extra: Partial<SessionInfo> = {}) => session(id, { llm: 'claude', model: 'claude-opus-4-6', ...extra });
const subagent = (id: string, parentSessionId: string) => session(id, { parentSessionId, isSubagent: true });
const tool = (id: string, parentSessionId: string, mcpTool = 'web_search') => session(id, { parentSessionId, isMcp: true, mcpServer: 'search', mcpTool });
const skill = (id: string, parentSessionId: string) => session(id, { parentSessionId, isSkill: true, skillName: 'browse' });

const settle = (world: ReturnType<typeof createLiveWorld>, frames = 2000) => {
  for (let frame = 0; frame < frames; frame++) {
    advanceWorld(world, 0.05);
    for (const actor of world.actors.values()) {
      expect(segmentClear(actor.position, actor.position, [...stationObstacles(world), ...actorObstacles(world, actor.id)])).toBe(true);
    }
    if ([...world.actors.values()].every((actor) => distance(actor.position, actor.destination) < 0.1)) return frame;
  }
  return frames;
};

it('gives every agent and subagent its own character and keeps their tools separate', () => {
  const world = createLiveWorld();
  syncLiveWorld(world, [
    agent('claude'), subagent('claude-child', 'claude'), tool('claude-search', 'claude'), tool('child-read', 'claude-child', 'read_file'),
    agent('codex', { llm: 'codex', model: 'gpt-5.4' }), subagent('codex-child', 'codex'), skill('codex-browse', 'codex-child'),
  ]);
  expect([...world.actors.keys()].sort()).toEqual(['claude', 'claude-child', 'codex', 'codex-child']);
  expect(ownedActivities(world, 'claude').map((node) => node.id)).toEqual(['claude-search']);
  expect(ownedActivities(world, 'claude-child').map((node) => node.id)).toEqual(['child-read']);
  expect(ownedActivities(world, 'codex')).toEqual([]);
  expect(ownedActivities(world, 'codex-child').map((node) => node.id)).toEqual(['codex-browse']);
});

it('subagents inherit the parent provider and model when they do not report one', () => {
  const world = createLiveWorld();
  syncLiveWorld(world, [agent('codex', { llm: 'codex', model: 'gpt-5.4' }), subagent('worker', 'codex'), tool('worker-tool', 'worker')]);
  expect(world.nodes.get('worker')?.session.llm).toBe('codex');
  expect(world.nodes.get('worker')?.session.model).toBe('gpt-5.4');
  expect(world.nodes.get('worker-tool')?.session.model).toBe('gpt-5.4');
});

it('places subagents and their benches without overlapping any other node', () => {
  const world = createLiveWorld();
  const sessions: SessionInfo[] = [];
  for (let index = 0; index < 6; index++) {
    sessions.push(agent(`agent-${index}`), subagent(`sub-${index}`, `agent-${index}`), subagent(`sub-${index}-b`, `agent-${index}`),
      tool(`tool-${index}`, `agent-${index}`), tool(`subtool-${index}`, `sub-${index}`, 'apply_patch'));
  }
  syncLiveWorld(world, sessions);
  const nodes = [...world.nodes.values()];
  expect(nodes.length).toBe(30);
  for (let first = 0; first < nodes.length; first++) for (let second = first + 1; second < nodes.length; second++) {
    expect(distance(nodes[first].position, nodes[second].position)).toBeGreaterThanOrEqual(CELL_SIZE - 0.01);
  }
  // Subagents are allocated around their parent, not around the world origin.
  for (let index = 0; index < 6; index++) {
    const parent = world.nodes.get(`agent-${index}`)!, child = world.nodes.get(`sub-${index}`)!;
    expect(distance(parent.position, child.position)).toBeLessThan(CELL_SIZE * 3);
  }
});

it('lets several agents and subagents work at their own benches at the same time', () => {
  const world = createLiveWorld();
  syncLiveWorld(world, [
    agent('a'), tool('a-search', 'a'), subagent('a-sub', 'a'), tool('a-sub-edit', 'a-sub', 'apply_patch'),
    agent('b'), skill('b-skill', 'b'), subagent('b-sub', 'b'), tool('b-sub-read', 'b-sub', 'read_file'),
  ]);
  settle(world);
  // A few more frames: turning to face the bench is smoothed, never instant.
  for (let frame = 0; frame < 40; frame++) advanceWorld(world, 0.05);
  const expected: Record<string, string> = { a: 'a-search', 'a-sub': 'a-sub-edit', b: 'b-skill', 'b-sub': 'b-sub-read' };
  for (const [id, bench] of Object.entries(expected)) {
    const actor = world.actors.get(id)!;
    expect(actor.activityId).toBe(bench);
    expect(actor.working).toBe(true); expect(actor.walking).toBe(false);
    expect(actorStatus(world.nodes.get(id)!, actor, world).summary).toMatch(/Trabalhando/);
    // The character stands at the working area in front of its bench, facing it.
    const station = world.nodes.get(bench)!;
    expect(distance(actor.position, station.position)).toBeLessThan(6);
    const facing = Math.atan2(station.position[0] - actor.position[0], station.position[2] - actor.position[2]);
    expect(Math.abs(Math.atan2(Math.sin(facing - actor.heading), Math.cos(facing - actor.heading)))).toBeLessThan(0.05);
  }
});

it('a subagent that finishes walks away and disappears without disturbing its parent', () => {
  const world = createLiveWorld();
  const parentSessions = [agent('parent'), tool('parent-tool', 'parent')];
  syncLiveWorld(world, [...parentSessions, subagent('child', 'parent'), tool('child-tool', 'child')]);
  settle(world);
  const parent = world.actors.get('parent')!, bench = [...parent.position];
  syncLiveWorld(world, parentSessions);
  const child = world.actors.get('child')!;
  expect(child.opacity).toBe(1);
  let previous = [...child.position] as typeof child.position, faded = false;
  for (let frame = 0; frame < 1500 && world.actors.has('child'); frame++) {
    advanceWorld(world, 0.05);
    if (world.actors.has('child')) {
      expect(distance(previous, child.position)).toBeLessThanOrEqual(0.131);
      previous = [...child.position] as typeof child.position;
      faded = faded || child.opacity < 1;
    }
  }
  expect(faded).toBe(true);
  expect(world.actors.has('child')).toBe(false); expect(world.nodes.has('child-tool')).toBe(false);
  expect(parent.position).toEqual(bench); expect(parent.working).toBe(true);
});

it('a subagent spawned mid-run walks in from outside instead of appearing on the spot', () => {
  const world = createLiveWorld();
  const sessions = [agent('parent'), tool('parent-tool', 'parent')];
  syncLiveWorld(world, sessions);
  settle(world);
  syncLiveWorld(world, [...sessions, subagent('late', 'parent'), tool('late-tool', 'late')]);
  const late = world.actors.get('late')!;
  expect(late.opacity).toBe(0);
  const spawn = [...late.position];
  expect(distance(late.position, world.nodes.get('late')!.position)).toBeGreaterThan(3);
  settle(world);
  expect(late.opacity).toBe(1);
  expect(distance(late.position, spawn as typeof late.position)).toBeGreaterThan(1);
  expect(late.activityId).toBe('late-tool'); expect(late.working).toBe(true);
});

it('a tool handed from the parent to a subagent moves the right character', () => {
  const world = createLiveWorld();
  syncLiveWorld(world, [agent('parent'), subagent('child', 'parent'), tool('shared', 'parent')]);
  settle(world);
  expect(world.actors.get('parent')!.activityId).toBe('shared');
  expect(world.actors.get('child')!.activityId).toBeNull();
  syncLiveWorld(world, [agent('parent'), subagent('child', 'parent'), tool('shared', 'child')]);
  settle(world);
  expect(world.actors.get('parent')!.activityId).toBeNull();
  expect(world.actors.get('child')!.activityId).toBe('shared');
  expect(world.actors.get('child')!.working).toBe(true);
});

it('keeps every port an agent opens as its own station beside it, without dragging the agent around', () => {
  const world = createLiveWorld();
  const ports = [5173, 8765, 9222, 27056].map((port) => session(`port-${port}`, {
    parentSessionId: 'dev', isResource: true, resourceKind: 'port', resourceCommand: `node server --port ${port}`, name: `Dev server :${port}`,
  }));
  syncLiveWorld(world, [agent('dev'), ...ports, tool('dev-bash', 'dev', 'bash')]);
  const home = world.nodes.get('dev')!.position;
  const stations = ports.map((port) => world.nodes.get(port.sessionId)!);
  expect(stations.map((station) => station.model)).toEqual(['Mill', 'Mill', 'Mill', 'Mill']);
  for (const station of stations) expect(distance(station.position, home)).toBeLessThan(CELL_SIZE * 2.5);
  for (let first = 0; first < stations.length; first++) for (let second = first + 1; second < stations.length; second++) {
    expect(distance(stations[first].position, stations[second].position)).toBeGreaterThanOrEqual(CELL_SIZE - 0.01);
  }
  settle(world);
  const actor = world.actors.get('dev')!;
  expect(actor.activityId).toBe('dev-bash'); expect(actor.working).toBe(true);
  expect(ownedActivities(world, 'dev').map((node) => node.id).sort()).toEqual([...ports.map((port) => port.sessionId), 'dev-bash'].sort());
  // Closing two ports removes only their stations; the agent keeps working at its bench.
  const bench = [...actor.position];
  syncLiveWorld(world, [agent('dev'), ports[0], ports[1], tool('dev-bash', 'dev', 'bash')]);
  for (let frame = 0; frame < 200; frame++) advanceWorld(world, 0.05);
  expect(world.nodes.has('port-9222')).toBe(false); expect(world.nodes.has('port-27056')).toBe(false);
  expect(world.nodes.has('port-5173')).toBe(true); expect(world.nodes.has('port-8765')).toBe(true);
  expect(actor.position).toEqual(bench); expect(actor.working).toBe(true);
  // Only ports and no tool: the agent stays home instead of touring its servers.
  syncLiveWorld(world, [agent('dev'), ports[0], ports[1]]);
  settle(world);
  expect(actor.activityId).toBeNull();
  expect(distance(actor.position, home)).toBeLessThan(0.11);
});
