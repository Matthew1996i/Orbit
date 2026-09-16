import { createVillage, VILLAGE_RADIUS } from './village';
import type { Position } from './types';

const village = createVillage();
const STEP = 0.5;
export const GROUND = 0.15;
// Os agentes circulam por toda a vila (praca, caminhos e gramado), desviando
// do que ocupa chao: construcoes, props, arvores e lampioes.
export const isAgentWalkable = (x: number, z: number): boolean => {
  if (Math.hypot(x, z) > VILLAGE_RADIUS - 3) return false;
  return !village.footprints.some((footprint) => Math.hypot(x - footprint.x, z - footprint.z) < footprint.radius + 0.7);
};

// A vila e plana; a assinatura fica pra quando houver relevo.
// eslint-disable-next-line @typescript-eslint/no-unused-vars
export const groundHeight = (x: number, z: number): number => GROUND;

// The graph is shared; only destination selection allocates a short path, never frame updates.
const cells = new Map<string, Position>();
for (let x = -VILLAGE_RADIUS; x <= VILLAGE_RADIUS; x += STEP) for (let z = -VILLAGE_RADIUS; z <= VILLAGE_RADIUS; z += STEP) {
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
