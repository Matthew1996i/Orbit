import type { Footprint, Placement, Tree, Village } from './village.types';
import { createRandom } from '../../shared/random';
import { MODEL_SIZE, VILLAGE_SCALE, modelFootprint } from './village-models';

// Vila organica: uma praca circular de pedra no centro (onde os agentes se
// reunem), construcoes do Medieval Village num anel irregular viradas pro
// centro, caminhos curvos ate cada porta e props tematicos por construcao.
// Tudo que ocupa chao entra em `footprints`, e nada e colocado em cima de
// outra coisa — inclusive a vegetacao gerada depois consulta isso.
const PLAZA_RADIUS = 9.5;
export const VILLAGE_RADIUS = 30;
const PATH_STEP = MODEL_SIZE.Path_Straight[2] * VILLAGE_SCALE;
// Direcao que o lado da frente dos modelos aponta no arquivo (+z).
const FRONT = 0;

const collides = (footprints: Footprint[], x: number, z: number, radius: number, gap: number) =>
  footprints.some((other) => Math.hypot(x - other.x, z - other.z) < radius + other.radius + gap);

export const createVillage = (): Village => {
  const random = createRandom(742);
  const village: Village = { plazaRadius: PLAZA_RADIUS, buildings: [], props: [], paths: [], trees: [], lanterns: [], footprints: [] };
  const occupy = (x: number, z: number, radius: number) => village.footprints.push({ x, z, radius });
  const place = (list: Placement[], model: string, x: number, z: number, rotation: number, scale = VILLAGE_SCALE, y = 0): Placement => {
    const placement: Placement = { model, position: [x, y, z], rotation, scale, footprint: modelFootprint(model, scale), height: MODEL_SIZE[model][1] * scale };
    list.push(placement);
    return placement;
  };

  // Praca: ladrilhos numa grade com a borda irregular.
  for (let x = -PLAZA_RADIUS - 1; x <= PLAZA_RADIUS + 1; x += 1.47) for (let z = -PLAZA_RADIUS - 1; z <= PLAZA_RADIUS + 1; z += 1.47) {
    const wobble = Math.sin(Math.atan2(z, x) * 5) * 0.7 + Math.sin(Math.atan2(z, x) * 3 + 1.3) * 0.5;
    if (Math.hypot(x, z) > PLAZA_RADIUS + wobble) continue;
    place(village.paths, 'Path_Square', x + (random() - 0.5) * 0.08, z + (random() - 0.5) * 0.08, Math.floor(random() * 4) * Math.PI / 2, VILLAGE_SCALE, -0.03);
  }

  // Construcoes em anel: a abertura pro sul-leste (lado da camera) fica livre,
  // como a entrada da vila.
  const ring = ['Inn', 'House_1', 'Bell_Tower', 'House_2', 'Blacksmith', 'House_3', 'Mill', 'House_1', 'Stable', 'House_2', 'Sawmill'];
  const entrance = Math.atan2(35, 43); // angulo da camera inicial
  const arc = Math.PI * 2 - 0.75;
  let angle = entrance + 0.375 + 0.2;
  const perimeterWeights = ring.map((model) => modelFootprint(model) + 2.2);
  const totalWeight = perimeterWeights.reduce((sum, weight) => sum + weight, 0);
  ring.forEach((model, index) => {
    const share = arc * perimeterWeights[index] / totalWeight;
    angle += share / 2;
    const scale = VILLAGE_SCALE * (model === 'Bell_Tower' ? 1 : 0.92 + random() * 0.16);
    const footprint = modelFootprint(model, scale);
    const distance = PLAZA_RADIUS + footprint + 2.5 + random() * 3.5;
    const x = Math.cos(angle) * distance, z = Math.sin(angle) * distance;
    const facing = Math.atan2(-x, -z) + FRONT + (random() - 0.5) * 0.3; // vira a frente (+z) pro centro
    place(village.buildings, model, x, z, facing, scale);
    occupy(x, z, footprint * 0.82);
    angle += share / 2;

    // Caminho curvo da borda da praca ate a frente da construcao.
    const doorDistance = distance - footprint * 0.8;
    const end: [number, number] = [Math.cos(angle - share / 2) * doorDistance, Math.sin(angle - share / 2) * doorDistance];
    const start: [number, number] = [Math.cos(angle - share / 2) * (PLAZA_RADIUS - 0.4), Math.sin(angle - share / 2) * (PLAZA_RADIUS - 0.4)];
    const bend = (random() - 0.5) * 5;
    const control: [number, number] = [(start[0] + end[0]) / 2 + Math.cos(angle + Math.PI / 2) * bend, (start[1] + end[1]) / 2 + Math.sin(angle + Math.PI / 2) * bend];
    const length = Math.hypot(end[0] - start[0], end[1] - start[1]);
    const steps = Math.max(1, Math.round(length / PATH_STEP));
    for (let step = 0; step < steps; step++) {
      const t = (step + 0.5) / steps, u = 1 - t;
      const px = u * u * start[0] + 2 * u * t * control[0] + t * t * end[0];
      const pz = u * u * start[1] + 2 * u * t * control[1] + t * t * end[1];
      const tx = 2 * u * (control[0] - start[0]) + 2 * t * (end[0] - control[0]);
      const tz = 2 * u * (control[1] - start[1]) + 2 * t * (end[1] - control[1]);
      place(village.paths, 'Path_Straight', px, pz, Math.atan2(tx, tz), VILLAGE_SCALE, -0.03);
    }
  });

  // Props tematicos ao redor de cada construcao, em coordenadas locais
  // (x pra direita, z pra frente) e validados contra o que ja existe.
  const THEMES: Record<string, [string, number, number][]> = {
    Inn: [['MarketStand_1', 3.2, 2.6], ['MarketStand_2', -3.4, 2.4], ['Barrel', 2.2, -0.6], ['Barrel', 2.7, -0.2], ['Bench_1', -2.2, 1.9]],
    Blacksmith: [['Cauldron', 2.6, 1.4], ['Barrel', -2.8, 0.6], ['Crate', -2.9, 1.3], ['Crate', -2.4, 1.1]],
    Stable: [['Cart', 4.2, 1.6], ['Hay', -3.6, 1.2], ['Hay', -3.1, 1.6], ['Hay', -3.4, 0.6], ['Fence', 3.9, -1.2], ['Fence', 3.9, 0.1]],
    Sawmill: [['Package_1', 3.4, 1.8], ['Package_2', 3.8, 1.2], ['Crate', -3.6, 1.4]],
    Mill: [['Bags', 2.6, 1.6], ['Bag', 3.1, 1.2], ['Bag_Open', 2.4, 0.9]],
    House_1: [['Barrel', 1.9, 1.6], ['Crate', -2.0, 1.4]],
    House_2: [['Bench_2', 2.2, 1.9], ['Bag', -1.9, 1.6]],
    House_3: [['Barrel', 1.7, 1.2]],
    Bell_Tower: [['Bench_1', 2.4, 1.6], ['Bench_1', -2.4, 1.6]],
  };
  for (const building of village.buildings) {
    const [bx, , bz] = building.position, sin = Math.sin(building.rotation), cos = Math.cos(building.rotation);
    const half = modelFootprint(building.model) * 0.62;
    for (const [model, localX, localZ] of THEMES[building.model] ?? []) {
      const footprint = modelFootprint(model);
      for (let attempt = 0; attempt < 8; attempt++) {
        const jitterX = localX + (attempt ? (random() - 0.5) * 2 : 0), jitterZ = localZ + half + (attempt ? (random() - 0.5) * 2 : 0);
        const x = bx + jitterX * cos + jitterZ * sin, z = bz - jitterX * sin + jitterZ * cos;
        if (Math.hypot(x, z) < PLAZA_RADIUS + 0.8 || collides(village.footprints, x, z, footprint, 0.25)) continue;
        place(village.props, model, x, z, building.rotation + (random() - 0.5) * 0.6);
        occupy(x, z, footprint);
        break;
      }
    }
  }

  // Praca: bancos virados pro centro, fogueira e um coreto logo na borda.
  for (let index = 0; index < 5; index++) {
    const theta = entrance + Math.PI + (index - 2) * 0.55 + (random() - 0.5) * 0.2, distance = PLAZA_RADIUS - 1.3;
    const x = Math.cos(theta) * distance, z = Math.sin(theta) * distance;
    place(village.props, index % 2 ? 'Bench_2' : 'Bench_1', x, z, Math.atan2(-x, -z) + Math.PI);
    occupy(x, z, modelFootprint('Bench_1'));
  }
  {
    const theta = entrance + Math.PI / 2 + 0.3, distance = PLAZA_RADIUS - 2.6;
    const x = Math.cos(theta) * distance, z = Math.sin(theta) * distance;
    place(village.props, 'Bonfire_Lit', x, z, random() * Math.PI * 2);
    occupy(x, z, modelFootprint('Bonfire_Lit') + 0.3);
  }
  {
    const theta = entrance - Math.PI / 2 - 0.35, distance = PLAZA_RADIUS + 3.6;
    const x = Math.cos(theta) * distance, z = Math.sin(theta) * distance;
    place(village.props, 'Gazebo', x, z, Math.atan2(-x, -z));
    occupy(x, z, modelFootprint('Gazebo') * 0.9);
  }

  // Lampioes na borda da praca (pulando a abertura da entrada).
  for (let index = 0; index < 9; index++) {
    const theta = entrance + 0.55 + (index + 0.5) * (Math.PI * 2 - 1.1) / 9;
    const x = Math.cos(theta) * (PLAZA_RADIUS + 0.9), z = Math.sin(theta) * (PLAZA_RADIUS + 0.9);
    if (collides(village.footprints, x, z, 0.3, 0.2)) continue;
    village.lanterns.push([x, 2.1, z]);
    occupy(x, z, 0.35);
  }

  // Pedras e arvores no gramado entre as construcoes.
  for (let index = 0; index < 14; index++) {
    const theta = random() * Math.PI * 2, distance = PLAZA_RADIUS + 1.5 + random() * (VILLAGE_RADIUS - PLAZA_RADIUS - 3);
    const x = Math.cos(theta) * distance, z = Math.sin(theta) * distance, model = index % 2 ? 'Rock_1' : 'Rock_2';
    if (isOccupied(village, x, z, modelFootprint(model) + 0.3)) continue;
    place(village.props, model, x, z, random() * Math.PI * 2, VILLAGE_SCALE * (0.8 + random() * 0.8));
    occupy(x, z, modelFootprint(model));
  }
  for (let attempt = 0; attempt < 90 && village.trees.length < 16; attempt++) {
    const theta = random() * Math.PI * 2, distance = PLAZA_RADIUS + 4 + random() * (VILLAGE_RADIUS - PLAZA_RADIUS - 4);
    const x = Math.cos(theta) * distance, z = Math.sin(theta) * distance;
    const tree: Tree = { position: [x, 0, z], height: 5 + random() * 4, radius: 2 + random() * 1.2 };
    if (isOccupied(village, x, z, tree.radius + 0.6)) continue;
    village.trees.push(tree);
    occupy(x, z, tree.radius * 0.7);
  }
  return village;
};

// Diz se um circulo de raio `radius` em (x, z) encosta em algo da vila:
// construcoes, props, arvores, lampioes, a praca ou os caminhos.
export const isOccupied = (village: Village, x: number, z: number, radius: number): boolean => {
  if (Math.hypot(x, z) < village.plazaRadius + 1.2 + radius) return true;
  if (collides(village.footprints, x, z, radius, 0)) return true;
  return village.paths.some((tile) => tile.model === 'Path_Straight' && Math.hypot(x - tile.position[0], z - tile.position[2]) < 1.3 + radius);
};
