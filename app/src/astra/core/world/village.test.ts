import { expect, it } from 'vitest';
import { createVillage } from './village';

it('generates a deterministic village with finite, positive geometry', () => {
  const village = createVillage();
  expect(createVillage()).toEqual(village);
  expect(village.houses.length).toBeGreaterThan(0);
  for (const blocks of [village.masonry, village.timber, village.tiles, village.lights]) {
    for (const block of blocks) {
      expect(block.position.every(Number.isFinite)).toBe(true);
      expect(block.scale.every((value) => Number.isFinite(value) && value > 0)).toBe(true);
    }
  }
});

it('keeps buildings and trees outside the central agent gathering area', () => {
  const village = createVillage();
  for (const house of village.houses) {
    const overlapsLobby = Math.abs(house.position[0]) - house.width / 2 < 7
      && Math.abs(house.position[2]) - house.depth / 2 < 7;
    expect(overlapsLobby).toBe(false);
  }
  for (const tree of village.trees) expect(Math.abs(tree.position[0])).toBeGreaterThan(7);
});
