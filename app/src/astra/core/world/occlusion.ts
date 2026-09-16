import type { Position } from './types';

export type Obstacle = { position: Position; radius: number; height: number };
type Point = { x: number; y: number; z: number };

export const obstructsView = (camera: Point, target: Point, obstacle: Obstacle): boolean => {
  const deltaX = camera.x - target.x, deltaZ = camera.z - target.z;
  const lengthSquared = deltaX * deltaX + deltaZ * deltaZ;
  if (lengthSquared < 1) return false;
  const [x, base, z] = obstacle.position;
  const along = ((x - target.x) * deltaX + (z - target.z) * deltaZ) / lengthSquared;
  if (along < 0.03 || along > 1.12) return false;
  const side = Math.hypot(x - target.x - along * deltaX, z - target.z - along * deltaZ);
  const sightHeight = target.y + along * (camera.y - target.y);
  return side < obstacle.radius + 3 && sightHeight < base + obstacle.height + 2;
};
