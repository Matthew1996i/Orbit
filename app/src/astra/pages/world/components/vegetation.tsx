import { useEffect, useLayoutEffect, useRef } from 'react';
import { useThree } from '@react-three/fiber';
import { useGLTF } from '@react-three/drei';
import { InstancedMesh, Object3D } from 'three';
import { createRandom } from '../../../shared/random';
import { kitUrl, useKitMeshes, type KitMesh } from './kit-models';
import { isOccupied, VILLAGE_RADIUS } from '../../../core/world/village';
import type { Village } from '../../../core/world/village.types';

// Vegetacao rasteira do Cube World Kit espalhada ao redor da vila, uma
// InstancedMesh por modelo (um draw call cada, independente da quantidade).
type Layer = { name: string; count: number; height: [number, number]; shadow: boolean; margin: number; minRadius?: number };
const LAYERS: Layer[] = [
  { name: 'Grass_Small', count: 2600, height: [0.45, 0.85], shadow: false, margin: 0.3 },
  { name: 'Grass_Big', count: 1100, height: [0.8, 1.4], shadow: false, margin: 0.4 },
  { name: 'Flowers_1', count: 420, height: [0.7, 1.1], shadow: false, margin: 0.6 },
  { name: 'Flowers_2', count: 380, height: [0.7, 1.1], shadow: false, margin: 0.6 },
  { name: 'Bush', count: 220, height: [1.0, 1.9], shadow: true, margin: 1.4, minRadius: VILLAGE_RADIUS + 2 },
  { name: 'DeadTree_1', count: 12, height: [4, 6.5], shadow: true, margin: 2, minRadius: VILLAGE_RADIUS + 6 },
  { name: 'DeadTree_2', count: 12, height: [4.5, 7], shadow: true, margin: 2, minRadius: VILLAGE_RADIUS + 6 },
  { name: 'DeadTree_3', count: 10, height: [4.5, 7.5], shadow: true, margin: 2, minRadius: VILLAGE_RADIUS + 6 },
];
const SPREAD = (VILLAGE_RADIUS + 60) * 2;
const NAMES = LAYERS.map((layer) => layer.name);
NAMES.forEach((name) => useGLTF.preload(kitUrl(name)));

export const GROUND_Y = 0;

const InstancedLayer = ({ layer, mesh, material, seed, village }: { layer: Layer; mesh: KitMesh; material: InstancedMesh['material']; seed: number; village: Village }) => {
  const ref = useRef<InstancedMesh>(null);
  useLayoutEffect(() => {
    if (!ref.current) return;
    const random = createRandom(seed), transform = new Object3D();
    let placed = 0, attempts = 0;
    while (placed < layer.count && attempts < layer.count * 20) {
      attempts++;
      const x = (random() - 0.5) * SPREAD, z = (random() - 0.5) * SPREAD;
      // Nada de vegetacao em cima da praca, dos caminhos, das construcoes ou dos props.
      if ((layer.minRadius && Math.hypot(x, z) < layer.minRadius) || isOccupied(village, x, z, layer.margin)) continue;
      const height = layer.height[0] + random() * (layer.height[1] - layer.height[0]), scale = height / mesh.height;
      transform.position.set(x, GROUND_Y, z);
      transform.scale.setScalar(scale);
      transform.rotation.set(0, random() * Math.PI * 2, 0);
      transform.updateMatrix();
      ref.current.setMatrixAt(placed++, transform.matrix);
    }
    ref.current.count = placed;
    ref.current.instanceMatrix.needsUpdate = true;
    ref.current.computeBoundingSphere();
  }, [layer, mesh, seed, village]);
  return <instancedMesh ref={ref} args={[mesh.geometry, material, layer.count]} castShadow={layer.shadow} receiveShadow />;
};

export const Vegetation = ({ village }: { village: Village }) => {
  const { meshes, material } = useKitMeshes(NAMES);
  const { gl, invalidate } = useThree();
  useEffect(() => { gl.shadowMap.needsUpdate = true; invalidate(); }, [gl, invalidate, meshes]);
  return <>{LAYERS.map((layer, index) => <InstancedLayer key={layer.name} layer={layer} mesh={meshes[index]} material={material} seed={1000 + index * 97} village={village} />)}</>;
};
