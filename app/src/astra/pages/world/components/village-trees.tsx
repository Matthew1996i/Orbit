import { useLayoutEffect, useMemo, useRef } from 'react';
import { Color, InstancedMesh, Object3D } from 'three';
import type { Tree } from '../../../core/world/village.types';
import { createRandom } from '../../../shared/random';
import { BlockBatch } from '../../../components/block-batch';
import type { Block } from '../../../core/world/types';

export const VillageTrees = ({ trees, clusters = 240 }: { trees: Tree[]; clusters?: number }) => {
  const canopy = useRef<InstancedMesh>(null);
  const trunks = useMemo(() => trees.flatMap((tree): Block[] => [
    { position: [tree.position[0], tree.position[1] + tree.height / 2, tree.position[2]], scale: [0.35, tree.height, 0.35], color: '#756451' },
    ...[-1, 1].map((side): Block => ({ position: [tree.position[0] + side * 0.4, tree.height * 0.7, tree.position[2]],
      scale: [0.19, tree.height * 0.5, 0.19], color: '#83725c', rotation: [0, 0, side * -0.6] })),
  ]), [trees]);
  useLayoutEffect(() => {
    if (!canopy.current) return;
    const random = createRandom(31), transform = new Object3D();
    const colors = ['#6f8d59', '#8aa569', '#a5b97a', '#78965f', '#688054'];
    trees.forEach((tree, treeIndex) => {
      for (let cluster = 0; cluster < clusters; cluster++) {
        const angle = random() * Math.PI * 2, spread = Math.sqrt(random()) * tree.radius;
        transform.position.set(tree.position[0] + Math.cos(angle) * spread, tree.position[1] + tree.height + (random() - 0.3) * tree.radius * 1.4, tree.position[2] + Math.sin(angle) * spread);
        const size = clusters < 100 ? 0.6 + random() * 0.65 : 0.19 + random() * 0.34;
        transform.scale.set(size, size * 0.85, size); transform.rotation.set(random(), random(), random()); transform.updateMatrix();
        canopy.current!.setMatrixAt(treeIndex * clusters + cluster, transform.matrix);
        canopy.current!.setColorAt(treeIndex * clusters + cluster, new Color(colors[Math.floor(random() * colors.length)]));
      }
    });
    canopy.current.instanceMatrix.needsUpdate = true;
    if (canopy.current.instanceColor) canopy.current.instanceColor.needsUpdate = true;
    canopy.current.computeBoundingSphere();
  }, [trees, clusters]);
  return <><BlockBatch blocks={trunks} /><instancedMesh ref={canopy} args={[undefined, undefined, trees.length * clusters]} castShadow={clusters >= 100} receiveShadow>
    <icosahedronGeometry args={[1, 1]} /><meshStandardMaterial roughness={0.95} />
  </instancedMesh></>;
};
