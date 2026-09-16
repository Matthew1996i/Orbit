import { createVillage } from './village';
import type { Position } from './types';

const village = createVillage();
const STEP = 0.5;
export const isAgentWalkable = (x: number, z: number): boolean => {
  const central = Math.abs(x) < 8.3 && Math.abs(z) < 7.3;
  const north = Math.abs(x) < 20.3 && z > -24.3 && z < -13.7;
  const wings = Math.abs(x) > 14.7 && Math.abs(x) < 25.3 && Math.abs(z) < 7.3;
  const northBridge = Math.abs(x) < 0.9 && z >= -14 && z <= -7;
  const sideBridge = Math.abs(z) < 0.9 && Math.abs(x) >= 8 && Math.abs(x) <= 15;
  if (!(central || north || wings || northBridge || sideBridge)) return false;
  if (village.houses.some((house) => Math.abs(x - house.position[0]) < house.width / 2 + 0.65
    && Math.abs(z - house.position[2]) < house.depth / 2 + 0.65)) return false;
  if (village.trees.some((tree) => Math.hypot(x - tree.position[0], z - tree.position[2]) < 1.6)) return false;
  if (Math.abs(z - 6) < 0.9 && Math.abs(Math.abs(x) - 4.5) < 1.9) return false;
  return true;
};

export const groundHeight = (x: number, z: number): number => {
  const along = Math.abs(x) < 1.5 && z < -7.7 && z > -13.3 ? z + 10.5
    : Math.abs(z) < 1.5 && Math.abs(x) > 8.7 && Math.abs(x) < 14.3 ? Math.abs(x) - 11.5 : null;
  return along === null ? 0.15 : 0.06 + Math.sin((along + 2.8) / 5.6 * Math.PI) * 0.62;
};

// The graph is shared; only destination selection allocates a short path, never frame updates.
const cells = new Map<string, Position>();
for (let x = -25; x <= 25; x += STEP) for (let z = -24; z <= 7; z += STEP) {
  if (isAgentWalkable(x, z)) cells.set(`${x},${z}`, [x, groundHeight(x, z), z]);
}
const neighbors = new Map<string, string[]>();
for (const [key, [x, , z]] of cells) neighbors.set(key,
  [[x + STEP, z], [x - STEP, z], [x, z + STEP], [x, z - STEP]].map(([nextX, nextZ]) => `${nextX},${nextZ}`).filter((candidate) => cells.has(candidate)));

export const randomWalkPath = (x: number, z: number, random: () => number): Position[] => {
  const start = `${Math.round(x / STEP) * STEP},${Math.round(z / STEP) * STEP}`;
  if (!cells.has(start)) return [];
  const queue = [start], previous = new Map<string, string | null>([[start, null]]);
  for (let index = 0; index < queue.length; index++) {
    for (const neighbor of neighbors.get(queue[index]) ?? []) {
      if (previous.has(neighbor)) continue;
      previous.set(neighbor, queue[index]); queue.push(neighbor);
    }
  }
  const candidates = queue.filter((key) => {
    const point = cells.get(key)!;
    const distance = Math.hypot(point[0] - x, point[2] - z);
    return distance > 2 && distance < 16;
  });
  let cursor: string | null = candidates[Math.floor(random() * candidates.length)] ?? null;
  const path: Position[] = [];
  while (cursor && cursor !== start) { path.push(cells.get(cursor)!); cursor = previous.get(cursor) ?? null; }
  return path.reverse();
};
