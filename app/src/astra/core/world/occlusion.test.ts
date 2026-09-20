import { expect, it } from 'vitest';
import { obstructsView } from './occlusion';

it('hides obstacles between the camera and lobby, preserving the background and overhead view', () => {
  const target = { x: 0, y: 1, z: 0 };
  const camera = { x: 0, y: 5, z: 30 };
  expect(obstructsView(camera, target, { position: [0, 0, 15], radius: 4, height: 10 })).toBe(true);
  expect(obstructsView(camera, target, { position: [0, 0, -15], radius: 4, height: 10 })).toBe(false);
  expect(obstructsView({ x: 0, y: 40, z: 0 }, target, { position: [0, 0, 15], radius: 4, height: 10 })).toBe(false);
});
