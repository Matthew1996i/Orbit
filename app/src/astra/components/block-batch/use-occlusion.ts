import { useMemo, type RefObject } from 'react';
import { useFrame } from '@react-three/fiber';
import { InstancedMesh, Matrix4, Vector3 } from 'three';
import type { Block } from '../../core/world/types';
import { obstructsView, type Obstacle } from '../../core/world/occlusion';

export const useBatchOcclusion = (mesh: RefObject<InstancedMesh | null>, blocks: Block[]) => {
  const groups = useMemo(() => {
    const indexed = new Map<Obstacle, { indices: number[]; hidden: boolean; original: Float32Array | null }>();
    blocks.forEach((block, index) => {
      if (!block.obstacle) return;
      if (!indexed.has(block.obstacle)) indexed.set(block.obstacle, { indices: [], hidden: false, original: null });
      indexed.get(block.obstacle)!.indices.push(index);
    });
    return indexed;
  }, [blocks]);
  const scratch = useMemo(() => ({ matrix: new Matrix4(), hidden: new Matrix4().makeScale(0, 0, 0), target: new Vector3() }), []);
  useFrame(({ camera, controls }) => {
    if (!mesh.current || !groups.size) return;
    const target = controls && 'target' in controls && controls.target instanceof Vector3 ? controls.target : scratch.target;
    for (const [obstacle, group] of groups) {
      const hidden = obstructsView(camera.position, target, obstacle);
      if (hidden === group.hidden) continue;
      if (!group.original) group.original = new Float32Array(mesh.current.instanceMatrix.array);
      group.hidden = hidden;
      for (const index of group.indices) mesh.current.setMatrixAt(index, hidden ? scratch.hidden : scratch.matrix.fromArray(group.original, index * 16));
      mesh.current.instanceMatrix.needsUpdate = true;
    }
  });
};
