import { memo, useMemo } from 'react';
import { VillageTrees } from './village-trees';
import { SceneObstacle } from './scene-obstacle';
import { BlockBatch } from '../../../components/block-batch';
import { createRandom } from '../../../shared/random';
import type { Tree } from '../../../core/world/village.types';
import type { Block } from '../../../core/world/types';

export const Forest = memo(({ gardenTrees }: { gardenTrees: Tree[] }) => {
  const forest = useMemo(() => {
    const random = createRandom(72), trees: Tree[] = [];
    for (let index = 0; index < 52; index++) {
      const angle = index * 2.39996, radius = 36 + random() * 26;
      trees.push({ position: [Math.cos(angle) * radius, -1.8, Math.sin(angle) * radius - 6], height: 8 + random() * 7, radius: 2.8 + random() * 1.7 });
    }
    const flowers: Block[] = [];
    for (let index = 0; index < 750; index++) {
      const x = (random() - 0.5) * 95, z = (random() - 0.5) * 95;
      if (Math.abs(x) < 27 && z > -27 && z < 10) continue;
      flowers.push({ position: [x, -1.67, z], scale: [0.09, 0.16 + random() * 0.25, 0.09], color: ['#a6b16b', '#e8d5a3', '#bfc48b', '#a899b8'][index % 4] });
    }
    return { trees, flowers };
  }, []);
  return <>
    <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, -1.85, 0]} receiveShadow>
      <planeGeometry args={[600, 600]} /><meshStandardMaterial color="#829267" roughness={1} />
    </mesh>
    <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, -1.82, -6]} receiveShadow>
      <circleGeometry args={[33, 80]} /><meshStandardMaterial color="#a6a284" roughness={1} />
    </mesh>
    <BlockBatch blocks={forest.flowers} castShadow={false} />
    {[...gardenTrees, ...forest.trees].map((tree, index) => <SceneObstacle key={index}
      obstacle={{ position: tree.position, radius: tree.radius, height: tree.height + tree.radius }}>
      <VillageTrees trees={[tree]} clusters={index < gardenTrees.length ? 240 : 65} />
    </SceneObstacle>)}
  </>;
});
