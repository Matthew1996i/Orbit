import type { Village, House } from './village.types';
import { addBlock } from './village.types';
import { buildHouse } from './village-houses';
import { createRandom } from '../../shared/random';

export const createVillage = (): Village => {
  const village: Village = { masonry: [], timber: [], tiles: [], lights: [], houses: [], trees: [], lanterns: [] };
  const random = createRandom(742);
  const stone = ['#727d9e', '#7985a5', '#7c85a7', '#6e7a9c', '#808bab'];
  const platform = (x: number, z: number, width: number, depth: number) => {
    addBlock(village.masonry, [x, -1, z], [width, 2, depth], '#384666');
    for (let column = 0; column < width; column++) for (let row = 0; row < depth; row++) {
      addBlock(village.masonry, [x - width / 2 + column + 0.5, 0.04, z - depth / 2 + row + 0.5],
        [0.96, 0.12 + random() * 0.025, 0.96], stone[Math.floor(random() * stone.length)]);
    }
    for (const side of [-1, 1]) for (let column = 0; column < width; column++) {
      addBlock(village.masonry, [x - width / 2 + column + 0.5, 0.18, z + side * (depth / 2 - 0.15)], [0.97, 0.25, 0.48], '#9da3ba');
      for (let course = 0; course < 3; course++) addBlock(village.masonry,
        [x - width / 2 + column + 0.5, -0.25 - course * 0.53, z + side * depth / 2], [0.94, 0.47, 0.12], '#5c678a');
    }
  };
  platform(0, 0, 18, 16); // The agents gather on the central lobby terrace.
  platform(0, -19, 42, 12);
  platform(-20, 0, 12, 16);
  platform(20, 0, 12, 16);
  const house = (x: number, z: number, width: number, depth: number, height: number, roof: number, color: string) => {
    const building: House = { position: [x, 0.12, z], width, depth, height, roof, color };
    village.houses.push(building); buildHouse(village, building, village.houses.length * 91);
  };
  house(-13, -19, 5, 6, 7.8, 4.2, '#8c7f93');
  house(-6.5, -20, 5.5, 6, 6.5, 3.8, '#9e8697');
  house(0.8, -19, 6, 7, 8, 4.5, '#8582a0');
  house(8, -20, 5.5, 6, 7, 3.6, '#a08b9b');
  house(15, -19, 5, 6, 9, 4.1, '#7d839f');
  house(-20, -3.7, 6, 6, 7.6, 4.3, '#938499');
  house(-20, 3.8, 5.5, 5.5, 6, 3.8, '#858baa');
  house(20, -3.7, 6, 6, 8.4, 4.5, '#8e839d');
  house(20, 4, 5.5, 5.5, 6.8, 4, '#a48d98');
  const bridge = (x: number, z: number, length: number, rotate: boolean) => {
    const point = (along: number, height: number, across: number): [number, number, number] =>
      rotate ? [x + along, height, z + across] : [x + across, height, z + along];
    const scale = (along: number, height: number, across: number): [number, number, number] => rotate ? [along, height, across] : [across, height, along];
    for (let index = 0; index < length * 3; index++) {
      const along = (index + 0.5) / 3 - length / 2;
      const rise = Math.sin((index + 0.5) / (length * 3) * Math.PI) * 0.62;
      addBlock(village.masonry, point(along, rise - 0.15, 0), scale(0.34, 0.36, 3), '#9196b2');
      for (const side of [-1, 1]) {
        addBlock(village.timber, point(along, rise + 0.9, side * 1.44), scale(0.36, 0.16, 0.18), '#48516f');
        if (index % 2 === 0) addBlock(village.masonry, point(along, rise + 0.42, side * 1.44), scale(0.13, 0.95, 0.18), '#8a91b0');
      }
    }
  };
  bridge(0, -10.5, 5.6, false); bridge(-11.5, 0, 5.6, true); bridge(11.5, 0, 5.6, true);
  for (const x of [-7.4, 7.4]) for (const z of [-6, 5.7]) {
    village.trees.push({ position: [x, 0.15, z], height: 4.4, radius: 2 });
    addBlock(village.masonry, [x, 0.24, z], [2.5, 0.36, 2.5], '#8a8ea6');
  }
  for (const x of [-25, -16, 17, 25]) village.trees.push({ position: [x, 0, -19], height: 7, radius: 2.6 });
  for (const x of [-8, 8]) for (const z of [-4, 1, 7]) village.lanterns.push([x, 2.1, z]);
  for (const x of [-4.5, 4.5]) {
    addBlock(village.timber, [x, 0.65, 6], [2.7, 0.18, 0.65], '#50445a');
    for (const offset of [-1, 1]) addBlock(village.timber, [x + offset, 0.3, 6], [0.15, 0.6, 0.5], '#2f364f');
  }
  return village;
};
