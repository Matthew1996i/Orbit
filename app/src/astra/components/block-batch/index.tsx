import { useLayoutEffect, useRef } from 'react';
import { Color, InstancedMesh, Object3D } from 'three';
import type { Block } from '../../core/world/types';
import { useBatchOcclusion } from './use-occlusion';
export const BlockBatch = ({ blocks, roughness = 0.9, glow = false, castShadow = true }: { blocks: Block[]; roughness?: number; glow?: boolean; castShadow?: boolean }) => {
  const mesh = useRef<InstancedMesh>(null);
  useBatchOcclusion(mesh, blocks);
  useLayoutEffect(() => {
    if (!mesh.current) return;
    const transform = new Object3D();
    blocks.forEach((block, index) => {
      transform.position.set(...block.position); transform.scale.set(...block.scale);
      transform.rotation.set(...(block.rotation ?? [0, 0, 0])); transform.updateMatrix();
      mesh.current!.setMatrixAt(index, transform.matrix); mesh.current!.setColorAt(index, new Color(block.color));
    });
    mesh.current.instanceMatrix.needsUpdate = true;
    if (mesh.current.instanceColor) mesh.current.instanceColor.needsUpdate = true;
    mesh.current.computeBoundingSphere();
  }, [blocks]);
  return <instancedMesh ref={mesh} args={[undefined, undefined, blocks.length]} castShadow={!glow && castShadow} receiveShadow={!glow}>
    <boxGeometry />{glow ? <meshBasicMaterial toneMapped={false} /> : <meshStandardMaterial roughness={roughness} metalness={roughness < 0.5 ? 0.25 : 0} />}
  </instancedMesh>;
};
