import { ACTOR_RADIUS, atGround, type Circle } from './live-world.types';
import type { Position } from './types';

// Test the whole segment, including its endpoints: no corner cutting or tunnelling.
export const segmentClear = (from: Position, to: Position, obstacles: Circle[], radius = ACTOR_RADIUS): boolean => {
  const deltaX = to[0] - from[0], deltaZ = to[2] - from[2];
  const lengthSquared = deltaX * deltaX + deltaZ * deltaZ;
  return obstacles.every((obstacle) => {
    const ratio = lengthSquared ? Math.max(0, Math.min(1, ((obstacle.x - from[0]) * deltaX + (obstacle.z - from[2]) * deltaZ) / lengthSquared)) : 0;
    return Math.hypot(from[0] + ratio * deltaX - obstacle.x, from[2] + ratio * deltaZ - obstacle.z) >= radius + obstacle.radius + 0.08;
  });
};

// Visibility graph around conservative square envelopes. Destinations and the
// current (possibly fractional) position are used directly, never snapped.
export const findRoute = (from: Position, to: Position, obstacles: Circle[]): Position[] => {
  if (!segmentClear(from, from, obstacles) || !segmentClear(to, to, obstacles)) return [];
  if (segmentClear(from, to, obstacles)) return [to];
  const points: Position[] = [from, to];
  for (const obstacle of obstacles) {
    const margin = obstacle.radius + ACTOR_RADIUS + 0.2;
    for (const [offsetX, offsetZ] of [[-1, -1], [-1, 1], [1, -1], [1, 1]]) {
      const point = atGround(obstacle.x + offsetX * margin, obstacle.z + offsetZ * margin);
      if (segmentClear(point, point, obstacles)) points.push(point);
    }
  }
  const scores = new Map<number, number>([[0, 0]]), parents = new Map<number, number>();
  const pending = new Set([0]), closed = new Set<number>();
  const length = (first: number, second: number) => Math.hypot(points[first][0] - points[second][0], points[first][2] - points[second][2]);
  while (pending.size) {
    let current = -1, best = Infinity;
    for (const candidate of pending) {
      const score = scores.get(candidate)! + length(candidate, 1);
      if (score < best) { best = score; current = candidate; }
    }
    if (current === 1) {
      const route: Position[] = [];
      while (current !== 0) { route.push(points[current]); current = parents.get(current)!; }
      return route.reverse();
    }
    pending.delete(current); closed.add(current);
    for (let next = 1; next < points.length; next++) {
      if (closed.has(next)) continue;
      const score = scores.get(current)! + length(current, next);
      if (score >= (scores.get(next) ?? Infinity) || !segmentClear(points[current], points[next], obstacles)) continue;
      scores.set(next, score); parents.set(next, current); pending.add(next);
    }
  }
  return [];
};
