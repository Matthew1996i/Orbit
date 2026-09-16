import { useEffect, useMemo } from 'react';
import { useThree } from '@react-three/fiber';
import { useGLTF } from '@react-three/drei';
import type { Tree } from '../../../core/world/village.types';
import { createRandom } from '../../../shared/random';
import { kitUrl, useKitMeshes } from './kit-models';

const TREE_MODELS = ['Tree_1', 'Tree_2', 'Tree_3'];
TREE_MODELS.forEach((name) => useGLTF.preload(kitUrl(name)));

// Variante e rotacao derivam da posicao, entao cada arvore fica estavel entre
// renders mesmo quando o Forest renderiza uma <VillageTrees> por arvore.
const seedFor = (tree: Tree) => Math.floor(Math.abs(tree.position[0] * 7919 + tree.position[2] * 104729 + tree.height * 31)) >>> 0;

export const VillageTrees = ({ trees }: { trees: Tree[] }) => {
  const { meshes, material } = useKitMeshes(TREE_MODELS);
  const { gl, invalidate } = useThree();
  const placements = useMemo(() => trees.map((tree) => {
    const random = createRandom(seedFor(tree));
    const variant = meshes[Math.floor(random() * meshes.length)];
    return { tree, variant, scale: tree.height / variant.height, rotation: random() * Math.PI * 2 };
  }), [trees, meshes]);
  // O shadow map e estatico (autoUpdate=false); as arvores chegam depois do
  // primeiro frame, entao pedimos um novo mapa de sombras quando montam.
  useEffect(() => { gl.shadowMap.needsUpdate = true; invalidate(); }, [gl, invalidate, placements]);
  return <>{placements.map(({ tree, variant, scale, rotation }, index) => <mesh key={index}
    geometry={variant.geometry} material={material} position={tree.position}
    rotation={[0, rotation, 0]} scale={scale} castShadow receiveShadow />)}</>;
};
