import type { House, Village } from './village.types';
import { addBlock } from './village.types';
import { createRandom } from '../../shared/random';

export const buildHouse = (village: Village, house: House, seed: number) => {
  const batches = [village.masonry, village.timber, village.tiles, village.lights];
  const starts = batches.map((batch) => batch.length);
  const random = createRandom(seed);
  const { width, depth, height, roof, position: [x, base, z], color } = house;
  const wall = village.masonry, beams = village.timber;
  addBlock(wall, [x, base + height / 2, z], [width, height, depth], color);
  addBlock(wall, [x, base + 0.4, z], [width + 0.2, 0.8, depth + 0.2], '#626c91');
  for (const level of [0.9, height * 0.53, height - 0.12]) {
    addBlock(beams, [x, base + level, z], [width + 0.22, 0.16, depth + 0.2], '#282c49');
  }
  for (const side of [-1, 1]) {
    const faceZ = z + side * (depth / 2 + 0.06);
    for (let column = 0; column <= 4; column++) {
      const columnX = x - width / 2 + column * width / 4;
      addBlock(beams, [columnX, base + height / 2, faceZ], [0.12, height, 0.15], '#272b49');
    }
    for (let floor = 0; floor < 2; floor++) for (let column = 0; column < 3; column++) {
      const windowX = x + (column - 1) * width * 0.29;
      const windowY = base + 1.8 + floor * height * 0.43;
      addBlock(beams, [windowX, windowY, faceZ + side * 0.02], [0.94, 1.5, 0.19], '#242940');
      addBlock(village.lights, [windowX, windowY, faceZ + side * 0.13], [0.66, 1.2, 0.045], random() > 0.23 ? '#ffcf82' : '#747caa');
      for (const offset of [-0.2, 0, 0.2]) addBlock(beams, [windowX + offset, windowY, faceZ + side * 0.17], [0.035, 1.2, 0.025], '#6e533f');
      for (const offset of [-0.3, 0.2]) addBlock(beams, [windowX, windowY + offset, faceZ + side * 0.17], [0.68, 0.035, 0.025], '#6e533f');
      addBlock(wall, [windowX, windowY - 0.78, faceZ], [1.12, 0.14, 0.36], '#7c81a1');
    }
    for (const offset of [-width * 0.37, width * 0.37]) {
      addBlock(beams, [x + offset, base + height * 0.76, faceZ], [0.1, height * 0.42, 0.13], '#34344e', [0, 0, offset < 0 ? -0.38 : 0.38]);
    }
    addBlock(beams, [x, base + 1.25, faceZ + side * 0.12], [1.13, 2.5, 0.22], '#292e4b');
    addBlock(wall, [x, base + 0.1, faceZ + side * 0.7], [1.8, 0.2, 1.3], '#68749b');
    village.lanterns.push([x + 0.85, base + 2.4, faceZ + side * 0.35]);
  }
  for (const side of [-1, 1]) {
    const faceX = x + side * (width / 2 + 0.08);
    for (const offset of [-depth * 0.32, 0, depth * 0.32]) {
      addBlock(beams, [faceX, base + height / 2, z + offset], [0.14, height, 0.12], '#30334e');
      for (const level of [1.8, 1.8 + height * 0.43]) {
        addBlock(beams, [faceX, base + level, z + offset], [0.16, 1.5, 0.9], '#30334e');
        addBlock(village.lights, [faceX + side * 0.09, base + level, z + offset], [0.035, 1.2, 0.62], '#edc88f');
        addBlock(beams, [faceX + side * 0.12, base + level, z + offset], [0.04, 1.2, 0.055], '#60536b');
        addBlock(beams, [faceX + side * 0.12, base + level, z + offset], [0.04, 0.045, 0.65], '#60536b');
      }
    }
    const faceZ = z + side * (depth / 2 + 0.05);
    addBlock(beams, [x, base + height + roof * 0.45, faceZ], [0.13, roof * 0.9, 0.13], '#34344e');
    for (const offset of [-1, 1]) addBlock(beams,
      [x + offset * width * 0.24, base + height + roof * 0.46, faceZ], [0.14, Math.hypot(width / 2, roof) * 0.9, 0.14],
      '#34344e', [0, 0, offset * Math.atan2(width / 2, roof)]);
  }
  // Both slopes are tiled in staggered rows; one instanced draw for every roof in town.
  const half = width / 2 + 0.35, slope = Math.hypot(half, roof), angle = Math.atan2(roof, half);
  const rows = Math.ceil(slope / 0.34), columns = Math.ceil((depth + 0.7) / 0.43);
  const palette = ['#56638a', '#59678e', '#626c94', '#525f87', '#657099'];
  for (const side of [-1, 1]) for (let row = 0; row < rows; row++) for (let column = 0; column < columns; column++) {
    const progress = (row + 0.5) / rows;
    addBlock(village.tiles, [x + side * half * progress, base + height + roof * (1 - progress) + 0.03,
      z - (depth + 0.7) / 2 + (column + 0.5 + (row % 2) * 0.12) * (depth + 0.7) / columns],
    [slope / rows + 0.06, 0.075, (depth + 0.7) / columns - 0.025], palette[Math.floor(random() * palette.length)], [0, 0, -side * angle]);
  }
  addBlock(beams, [x, base + height + roof + 0.06, z], [0.2, 0.18, depth + 0.85], '#9296b1');
  addBlock(wall, [x + width * 0.27, base + height + roof * 0.74, z - depth * 0.2], [0.7, 2.4, 0.8], '#767697');
  addBlock(wall, [x + width * 0.27, base + height + roof * 0.74 + 1.24, z - depth * 0.2], [0.95, 0.16, 1.05], '#a6a0af');
  const obstacle = { position: house.position, radius: Math.hypot(width, depth) / 2, height: height + roof + 2 };
  batches.forEach((batch, index) => {
    for (let blockIndex = starts[index]; blockIndex < batch.length; blockIndex++) batch[blockIndex].obstacle = obstacle;
  });
};
