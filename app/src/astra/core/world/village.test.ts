import { expect, it } from 'vitest';
import { createVillage, isOccupied } from './village';

it('generates a deterministic village with finite geometry', () => {
  const village = createVillage();
  expect(createVillage()).toEqual(village);
  expect(village.buildings.length).toBeGreaterThan(5);
  for (const placement of [...village.buildings, ...village.props, ...village.paths]) {
    expect(placement.position.every(Number.isFinite)).toBe(true);
    expect(placement.scale).toBeGreaterThan(0);
    expect(placement.footprint).toBeGreaterThan(0);
  }
});

it('keeps buildings, props and trees outside the central plaza where agents gather', () => {
  const village = createVillage();
  for (const placement of [...village.buildings, ...village.props.filter((prop) => !/Bench|Bonfire/.test(prop.model))]) {
    expect(Math.hypot(placement.position[0], placement.position[2])).toBeGreaterThan(village.plazaRadius);
  }
  for (const tree of village.trees) expect(Math.hypot(tree.position[0], tree.position[2])).toBeGreaterThan(village.plazaRadius + 2);
});

it('never places one model inside another', () => {
  const village = createVillage();
  const solids = [...village.buildings, ...village.props];
  for (let first = 0; first < solids.length; first++) for (let second = first + 1; second < solids.length; second++) {
    const a = solids[first], b = solids[second];
    const distance = Math.hypot(a.position[0] - b.position[0], a.position[2] - b.position[2]);
    // Props ficam encostados nas construcoes, mas nunca dentro do nucleo delas.
    expect(distance).toBeGreaterThan(Math.min(a.footprint, b.footprint) * 0.5);
  }
  for (const tree of village.trees) for (const building of village.buildings) {
    expect(Math.hypot(tree.position[0] - building.position[0], tree.position[2] - building.position[2])).toBeGreaterThan(building.footprint * 0.8);
  }
  for (const building of village.buildings) expect(isOccupied(village, building.position[0], building.position[2], 0.1)).toBe(true);
});
