import type { Placement, Tree, Village } from './village.types';
import type { Position } from './types';
import { createRandom } from '../../shared/random';
import { MODEL_SIZE, VILLAGE_SCALE, modelFootprint } from './village-models';
import { createPaving, nearestStreet, STREET_LINES } from './streets';

export const VILLAGE_RADIUS = 54;
export const createVillage = (): Village => {
  const random = createRandom(742);
  const village: Village = { plazaRadius: 7, buildings: [], props: [], paths: [], trees: [], lanterns: [], footprints: [] };
  const occupied = (x: number, z: number, radius: number, gap = 0.6) => village.footprints.some((other) => Math.hypot(x - other.x, z - other.z) < radius + other.radius + gap);
  const place = (list: Placement[], model: string, x: number, z: number, rotation: number, scale = VILLAGE_SCALE) => {
    const footprint = modelFootprint(model, scale);
    list.push({ model, position: [x, 0, z], rotation, scale, footprint, height: MODEL_SIZE[model][1] * scale });
    village.footprints.push({ x, z, radius: footprint });
  };
  const doorways: Position[] = [];
  const models = ['Inn', 'House_1', 'Blacksmith', 'House_2', 'Mill', 'House_3', 'Sawmill', 'House_1', 'Stable', 'House_2', 'Bell_Tower'];
  // Houses grow along three branching streets with different setbacks, rather
  // than sharing an angle/radius around a central ring.
  for (const [index, model] of models.entries()) {
    const scale = VILLAGE_SCALE * (0.85 + random() * 0.2), radius = modelFootprint(model, scale);
    for (let attempt = 0; attempt < 160; attempt++) {
      const line = STREET_LINES[(index + Math.floor(attempt / 15)) % STREET_LINES.length];
      const segment = Math.floor(random() * (line.length - 1));
      const start = line[segment], end = line[segment + 1], ratio = 0.15 + random() * 0.7;
      const roadX = start[0] + (end[0] - start[0]) * ratio, roadZ = start[2] + (end[2] - start[2]) * ratio;
      const angle = Math.atan2(end[2] - start[2], end[0] - start[0]) + (index % 2 ? 1 : -1) * Math.PI / 2;
      const setback = radius + 3 + random() * 2.5;
      const x = roadX + Math.cos(angle) * setback, z = roadZ + Math.sin(angle) * setback;
      const street = nearestStreet(x, z);
      if (Math.hypot(x, z) < village.plazaRadius + radius + 1 || occupied(x, z, radius, 1.4)) continue;
      if (Math.hypot(street[0] - x, street[2] - z) < radius + 2.4) continue;
      const rotation = Math.atan2(roadX - x, roadZ - z);
      place(village.buildings, model, x, z, rotation, scale);
      const doorOffset = MODEL_SIZE[model][2] * scale / 2;
      doorways.push([x + Math.sin(rotation) * doorOffset, 0, z + Math.cos(rotation) * doorOffset]);
      break;
    }
  }
  village.paths = createPaving(doorways);
  // Small, asymmetric groups of props beside the homes; each full model gets
  // its own reserved footprint (including roofs and tree canopies).
  for (const [index, building] of village.buildings.entries()) {
    for (let attempt = 0, placed = 0; attempt < 30 && placed < 2; attempt++) {
      const model = ['Bench_1', 'Barrel', 'Crate', 'Cart'][index % 4];
      const radius = modelFootprint(model), angle = random() * Math.PI * 2;
      const x = building.position[0] + Math.cos(angle) * (building.footprint + radius + 1.2);
      const z = building.position[2] + Math.sin(angle) * (building.footprint + radius + 1.2);
      if (isOccupied(village, x, z, radius) || occupied(x, z, radius)) continue;
      place(village.props, model, x, z, random() * Math.PI * 2); placed++;
    }
  }
  for (const line of STREET_LINES) for (let index = 1; index < line.length; index++) {
    const point = line[index], x = point[0] + 3.4, z = point[2] - 2;
    if (occupied(x, z, 0.4) || Math.hypot(x, z) < 8) continue;
    village.lanterns.push([x, 2.1, z]); village.footprints.push({ x, z, radius: 0.4 });
  }
  for (let attempt = 0; attempt < 200 && village.trees.length < 18; attempt++) {
    const x = (random() - 0.5) * 105, z = (random() - 0.5) * 95;
    const height = 5 + random() * 4, radius = height * 0.55;
    if (isOccupied(village, x, z, radius) || occupied(x, z, radius, 1)) continue;
    const tree: Tree = { position: [x, 0, z], height, radius };
    village.trees.push(tree); village.footprints.push({ x, z, radius });
  }
  // Floresta fechada ao redor da vila, ate a neblina. Entra em `footprints`,
  // entao vegetacao, estacoes e rotas dos agentes respeitam cada copa.
  for (let index = 0; index < 260; index++) {
    const angle = index * 2.39996, ring = VILLAGE_RADIUS + 4 + Math.sqrt(random()) * 56;
    const height = 6 + random() * 7, radius = height * 0.5;
    const x = Math.cos(angle) * ring + (random() - 0.5) * 4, z = Math.sin(angle) * ring + (random() - 0.5) * 4;
    if (occupied(x, z, radius, 0.4)) continue;
    village.trees.push({ position: [x, 0, z], height, radius }); village.footprints.push({ x, z, radius });
  }
  return village;
};

export const isOccupied = (village: Village, x: number, z: number, radius: number): boolean => {
  if (Math.hypot(x, z) < village.plazaRadius + 1.2 + radius) return true;
  if (village.footprints.some((other) => Math.hypot(x - other.x, z - other.z) < radius + other.radius)) return true;
  return village.paths.some((tile) => Math.hypot(x - tile.position[0], z - tile.position[2]) < 1.1 + radius);
};
