import type { Village } from './village.types';
import type { Circle } from './live-world.types';

// Use the full visual envelope, not the reduced trunk/building footprints used
// by the old random walk. Roads and ground are intentionally traversable.
export const sceneryObstacles = (village: Village): Circle[] => [
  ...[...village.buildings, ...village.props].map((placement) => ({
    x: placement.position[0], z: placement.position[2], radius: placement.footprint,
  })),
  ...village.trees.map((tree) => ({ x: tree.position[0], z: tree.position[2], radius: tree.radius })),
  ...village.lanterns.map((position) => ({ x: position[0], z: position[2], radius: 0.4 })),
];
