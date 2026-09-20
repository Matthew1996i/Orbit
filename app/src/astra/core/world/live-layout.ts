import type { SessionInfo } from '../../../api';
import { activityPresentation, isActivity } from './activity';
import { ACTOR_RADIUS, CELL_SIZE, STATION_RADIUS, atGround, distance, type LiveWorld, type Circle } from './live-world.types';
import { segmentClear } from './live-navigation';
import type { Position } from './types';

export const stationObstacles = (world: LiveWorld): Circle[] => [...world.obstacles, ...[...world.nodes.values()]
  .filter((node) => node.model).map((node) => ({ x: node.position[0], z: node.position[2], radius: STATION_RADIUS }))];
export const actorObstacles = (world: LiveWorld, except?: string): Circle[] => [...world.actors.values()]
  .filter((actor) => actor.id !== except).map((actor) => ({ x: actor.position[0], z: actor.position[2], radius: ACTOR_RADIUS }));

const allocatePosition = (world: LiveWorld, origin: Position): Position => {
  // Allocated cells never move when nodes are inserted, reordered or updated.
  for (let ring = 0; ; ring++) {
    for (let x = -ring; x <= ring; x++) for (let z = -ring; z <= ring; z++) {
      if (Math.max(Math.abs(x), Math.abs(z)) !== ring) continue;
      const point = atGround(origin[0] + x * CELL_SIZE, origin[2] + z * CELL_SIZE);
      if ([...world.nodes.values()].some((node) => distance(node.position, point) < CELL_SIZE - 0.01)) continue;
      if (!segmentClear(point, point, world.obstacles, STATION_RADIUS + 0.2)) continue;
      if (!segmentClear(point, point, actorObstacles(world), STATION_RADIUS + 0.3)) continue;
      // Reserve both the model and the working area in front of it.
      const dock = atGround(point[0], point[2] + 4);
      if (!segmentClear(dock, dock, [...stationObstacles(world), ...actorObstacles(world)])) continue;
      return point;
    }
  }
};

const spawnPosition = (world: LiveWorld, home: Position): Position => {
  const obstacles = [...stationObstacles(world), ...actorObstacles(world)];
  for (let ring = 1; ; ring++) for (let index = 0; index < 8 * ring; index++) {
    const angle = index / (8 * ring) * Math.PI * 2;
    const point = atGround(home[0] + Math.cos(angle) * ring * 4, home[2] + Math.sin(angle) * ring * 4);
    if (segmentClear(point, point, obstacles) && [...world.nodes.values()].every((node) => distance(point, node.position) > 3.5)) return point;
  }
};

export const syncLiveWorld = (world: LiveWorld, sessions: SessionInfo[]) => {
  const byId = new Map(sessions.map((session) => [session.sessionId, session]));
  for (const node of world.nodes.values()) node.present = byId.has(node.id);
  // Parents are laid out before their subagents and tools (whatever the IDs),
  // so children are allocated around them and inherit their provider/model.
  const depth = (session: SessionInfo) => {
    const seen = new Set<string>();
    let parent = session.parentSessionId;
    while (parent && byId.has(parent) && !seen.has(parent)) { seen.add(parent); parent = byId.get(parent)!.parentSessionId; }
    return seen.size;
  };
  const ordered = [...sessions].sort((first, second) => depth(first) - depth(second)
    || Number(isActivity(first)) - Number(isActivity(second)) || first.sessionId.localeCompare(second.sessionId));
  for (const session of ordered) {
    const existing = world.nodes.get(session.sessionId);
    const parent = world.nodes.get(session.parentSessionId || '')?.session || byId.get(session.parentSessionId || '');
    const inherited = { ...session, llm: session.llm || parent?.llm, model: session.model || parent?.model };
    if (existing) { existing.session = inherited; continue; }
    const origin = world.nodes.get(session.parentSessionId || '')?.position || atGround(0, 0);
    const position = allocatePosition(world, origin);
    const model = isActivity(session) ? activityPresentation(session).model : null;
    world.nodes.set(session.sessionId, { id: session.sessionId, session: inherited, position, model, present: true, opacity: 0 });
    if (!model) {
      const entrance = spawnPosition(world, position);
      world.actors.set(session.sessionId, { id: session.sessionId, position: [...entrance], entrance, destination: position,
        route: [], heading: 0, walking: false, working: false, opacity: 0, activityId: null, visited: new Map(), retry: 0 });
    }
  }
  // New stations may interrupt a route, but never spawn on a character.
  for (const actor of world.actors.values()) actor.retry = 0;
  world.revision++;
};
