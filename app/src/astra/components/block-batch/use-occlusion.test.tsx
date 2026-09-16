import { renderHook, cleanup } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';
import { BoxGeometry, InstancedMesh, Matrix4, MeshBasicMaterial, Vector3 } from 'three';
import type { Block } from '../../core/world/types';
import { useBatchOcclusion } from './use-occlusion';

const frame = vi.hoisted(() => ({ callback: null as null | ((state: unknown) => void) }));
vi.mock('@react-three/fiber', () => ({ useFrame: (callback: (state: unknown) => void) => { frame.callback = callback; } }));
afterEach(() => { cleanup(); vi.restoreAllMocks(); });

it('stores only affected instance matrices and restores them exactly', () => {
  const obstacle = { position: [0, 0, 5] as [number, number, number], radius: 1, height: 10 };
  const blocks: Block[] = Array.from({ length: 1000 }, (_, index) => ({
    position: [index, 0, 0], scale: [1, 1, 1], color: '#ffffff',
    obstacle: index === 10 || index === 500 ? obstacle : undefined,
  }));
  const mesh = new InstancedMesh(new BoxGeometry(), new MeshBasicMaterial(), blocks.length);
  mesh.setMatrixAt(10, new Matrix4().makeTranslation(10, 2, 3));
  mesh.setMatrixAt(500, new Matrix4().makeTranslation(500, 4, 5));
  const original = mesh.instanceMatrix.array.slice();
  renderHook(() => useBatchOcclusion({ current: mesh }, blocks));
  const allocate = vi.spyOn(globalThis, 'Float32Array');
  frame.callback!({ camera: { position: new Vector3(0, 2, 10) }, controls: { target: new Vector3() } });
  expect(allocate).toHaveBeenCalledWith(2 * 16);
  expect(allocate).not.toHaveBeenCalledWith(original);
  expect(mesh.instanceMatrix.array[10 * 16]).toBe(0);
  frame.callback!({ camera: { position: new Vector3(50, 2, 0) }, controls: { target: new Vector3() } });
  expect(mesh.instanceMatrix.array).toEqual(original);
  mesh.dispose();
  mesh.geometry.dispose();
  (mesh.material as MeshBasicMaterial).dispose();
});
