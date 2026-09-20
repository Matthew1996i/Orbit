import type { Position } from './types';
import type { Placement } from './village.types';
import { modelFootprint } from './village-models';

export const STREET_LINES: Position[][] = [
  [[-38, 0, 23], [-23, 0, 15], [-9, 0, 5], [3, 0, 1], [17, 0, -8], [30, 0, -15], [43, 0, -18]],
  [[-9, 0, 5], [-12, 0, -10], [-22, 0, -23], [-26, 0, -38]],
  [[17, 0, -8], [24, 0, 5], [36, 0, 15], [42, 0, 30]],
];
export const PAVING_STEP = 1.4;
export const nearestStreet = (x: number, z: number): Position => {
  let result: Position = [0, 0, 0], best = Infinity;
  for (const line of STREET_LINES) for (let index = 1; index < line.length; index++) {
    const start = line[index - 1], end = line[index];
    const deltaX = end[0] - start[0], deltaZ = end[2] - start[2];
    const ratio = Math.max(0, Math.min(1, ((x - start[0]) * deltaX + (z - start[2]) * deltaZ) / (deltaX * deltaX + deltaZ * deltaZ)));
    const point: Position = [start[0] + deltaX * ratio, 0, start[2] + deltaZ * ratio];
    const distance = Math.hypot(point[0] - x, point[2] - z);
    if (distance < best) { best = distance; result = point; }
  }
  return result;
};

export const createPaving = (doorways: Position[]): Placement[] => {
  const cells = new Set<string>();
  const stamp = (x: number, z: number, radius: number) => {
    for (let column = Math.floor((x - radius) / PAVING_STEP); column <= Math.ceil((x + radius) / PAVING_STEP); column++) {
      for (let row = Math.floor((z - radius) / PAVING_STEP); row <= Math.ceil((z + radius) / PAVING_STEP); row++) {
        if (Math.hypot(column * PAVING_STEP - x, row * PAVING_STEP - z) <= radius) cells.add(`${column},${row}`);
      }
    }
  };
  const connect = (start: Position, end: Position, width: number) => {
    const steps = Math.ceil(Math.hypot(end[0] - start[0], end[2] - start[2]) / 0.5);
    for (let index = 0; index <= steps; index++) {
      const ratio = steps ? index / steps : 0;
      stamp(start[0] + (end[0] - start[0]) * ratio, start[2] + (end[2] - start[2]) * ratio, width);
    }
  };
  // An irregular square merges into the streets; no detached stepping stones.
  for (let column = -6; column <= 6; column++) for (let row = -5; row <= 5; row++) {
    const x = column * PAVING_STEP, z = row * PAVING_STEP;
    if ((x / 8) ** 2 + (z / 6) ** 2 < 1 + Math.sin(column * 0.8 + row) * 0.12) cells.add(`${column},${row}`);
  }
  for (const line of STREET_LINES) for (let index = 1; index < line.length; index++) connect(line[index - 1], line[index], 2.1);
  for (const doorway of doorways) connect(nearestStreet(doorway[0], doorway[2]), doorway, 1.2);
  return [...cells].map((key) => {
    const [column, row] = key.split(',').map(Number);
    return { model: 'Path_Square', position: [column * PAVING_STEP, -0.12, row * PAVING_STEP], rotation: 0,
      scale: 3.1, footprint: modelFootprint('Path_Square', 3.1), height: 0.15 };
  });
};
