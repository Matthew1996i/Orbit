import { actorObstacles, stationObstacles } from './live-layout';
import { findRoute, segmentClear } from './live-navigation';
import { updateDestination } from './live-activity';
import { atGround, distance, type LiveWorld, type WorldActor } from './live-world.types';
import type { Position } from './types';

const turnToward = (actor: WorldActor, target: Position, delta: number) => {
  const angle = Math.atan2(target[0] - actor.position[0], target[2] - actor.position[2]);
  const turn = Math.atan2(Math.sin(angle - actor.heading), Math.cos(angle - actor.heading));
  actor.heading += turn * Math.min(delta * 9, 1);
};

export const advanceWorld = (world: LiveWorld, frameDelta: number): boolean => {
  // A background tab or delayed frame cannot make an actor jump across the map.
  const delta = Math.min(Math.max(frameDelta, 0), 0.05);
  let changed = false;
  const stations = stationObstacles(world);
  for (const actor of world.actors.values()) {
    const node = world.nodes.get(actor.id)!;
    updateDestination(world, actor);
    actor.walking = false;
    const retiring = !node.present && distance(actor.position, actor.entrance) < 0.1;
    actor.opacity = Math.max(0, Math.min(1, actor.opacity + delta * (retiring ? -2 : 2)));
    if (retiring && actor.opacity === 0) {
      world.actors.delete(actor.id); world.nodes.delete(actor.id); changed = true; continue;
    }
    actor.retry -= delta;
    // At a station the character turns to it and performs the work animation
    // instead of signalling activity through a connection line.
    const station = actor.activityId ? world.nodes.get(actor.activityId) : undefined;
    const atBench = () => !!station && node.present && node.session.alive && distance(actor.position, actor.destination) < 0.1;
    actor.working = atBench();
    if (actor.working && station) turnToward(actor, station.position, delta);
    if (distance(actor.position, actor.destination) < 0.02) continue;
    const obstacles = [...stations, ...actorObstacles(world, actor.id)];
    if (actor.route.length && !segmentClear(actor.position, actor.route[0], obstacles)) actor.route = [];
    if (!actor.route.length && actor.retry <= 0) {
      actor.route = findRoute(actor.position, actor.destination, obstacles);
      actor.retry = 0.8;
    }
    const target = actor.route[0];
    if (!target) continue;
    const remaining = distance(actor.position, target);
    if (remaining < 0.001) { actor.route.shift(); continue; }
    const step = Math.min(delta * 2.6, remaining);
    const next = atGround(actor.position[0] + (target[0] - actor.position[0]) / remaining * step,
      actor.position[2] + (target[2] - actor.position[2]) / remaining * step);
    // Earlier actors have already moved this frame: check their updated positions.
    if (!segmentClear(actor.position, next, obstacles)) { actor.route = []; continue; }
    turnToward(actor, next, delta);
    actor.position = next; actor.walking = true;
    if (remaining <= step + 0.001) actor.route.shift();
    // Arriving this frame counts as working right away: no idle frame at the bench.
    actor.working = atBench();
    if (actor.working) actor.walking = false;
  }
  for (const node of world.nodes.values()) {
    if (!node.model) continue;
    node.opacity = Math.max(0, Math.min(1, node.opacity + delta * (node.present ? 2 : -1)));
    if (!node.present && node.opacity === 0) { world.nodes.delete(node.id); changed = true; }
  }
  if (changed) world.revision++;
  return changed;
};
