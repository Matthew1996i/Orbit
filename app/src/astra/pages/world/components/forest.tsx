import { memo, Suspense, useMemo } from 'react';
import { VillageTrees } from './village-trees';
import { SceneObstacle } from './scene-obstacle';
import { GROUND_Y, Vegetation } from './vegetation';
import { createRandom } from '../../../shared/random';
import { isOccupied, VILLAGE_RADIUS } from '../../../core/world/village';
import type { Tree, Village } from '../../../core/world/village.types';

export const Forest = memo(({ village }: { village: Village }) => {
  const trees = useMemo(() => {
    const random = createRandom(72), trees: Tree[] = [];
    // Floresta fechada logo depois da vila, abrindo ate a borda da neblina.
    for (let index = 0; index < 150; index++) {
      const angle = index * 2.39996, radius = VILLAGE_RADIUS - 1 + Math.sqrt(random()) * 38;
      const tree: Tree = { position: [Math.cos(angle) * radius, GROUND_Y, Math.sin(angle) * radius], height: 6.5 + random() * 8, radius: 2.6 + random() * 1.9 };
      if (isOccupied(village, tree.position[0], tree.position[2], tree.radius)) continue;
      trees.push(tree);
    }
    return trees;
  }, [village]);
  return <>
    <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, GROUND_Y - 0.02, 0]} receiveShadow>
      <planeGeometry args={[600, 600]} /><meshStandardMaterial color="#829267" roughness={1} />
    </mesh>
    <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, GROUND_Y - 0.01, 0]} receiveShadow>
      <circleGeometry args={[VILLAGE_RADIUS - 2, 80]} /><meshStandardMaterial color="#8d9868" roughness={1} />
    </mesh>
    <Suspense fallback={null}>
      <Vegetation village={village} />
      {[...village.trees, ...trees].map((tree, index) => <SceneObstacle key={index}
        obstacle={{ position: tree.position, radius: tree.radius, height: tree.height + tree.radius }}>
        <VillageTrees trees={[tree]} />
      </SceneObstacle>)}
    </Suspense>
  </>;
});
