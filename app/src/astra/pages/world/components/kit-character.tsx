import { useEffect, useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import { useAnimations, useGLTF } from '@react-three/drei';
import { Box3, Group, LoopRepeat, Material, Mesh, Vector3 } from 'three';
import { ACTOR_RADIUS } from '../../../core/world/live-world.types';
import { clone as cloneSkeleton } from 'three/examples/jsm/utils/SkeletonUtils.js';
import { kitUrl } from './kit-models';

import { CHARACTERS, characterHeight, type Character } from './kit-characters';

// Cada agente recebe um personagem estavel (sorteado a partir do sessionId),
// com Idle parado e Walk andando.
CHARACTERS.forEach((name) => useGLTF.preload(kitUrl(name)));

export type CharacterAction = 'Idle' | 'Walk' | 'Attack';
export const KitCharacter = ({ name, action, opacity }: { name: Character; action: React.RefObject<CharacterAction>; opacity: React.RefObject<number> }) => {
  const { scene, animations } = useGLTF(kitUrl(name));
  const group = useRef<Group>(null);
  const { model, scale, materials, offset } = useMemo(() => {
    const model = cloneSkeleton(scene);
    const materials: Material[] = [];
    model.traverse((object) => {
      if ((object as Mesh).isMesh) {
        const mesh = object as Mesh;
        const copies = (Array.isArray(mesh.material) ? mesh.material : [mesh.material]).map((material) => {
          const copy = material.clone(); copy.transparent = true; copy.opacity = 0; materials.push(copy); return copy;
        });
        mesh.material = Array.isArray(mesh.material) ? copies : copies[0];
        object.receiveShadow = true; object.frustumCulled = false;
      }
    });
    const bounds = new Box3().setFromObject(model), size = bounds.getSize(new Vector3());
    const center = bounds.getCenter(new Vector3());
    const scale = Math.min(characterHeight(name) / size.y, ACTOR_RADIUS * 1.4 / Math.hypot(size.x, size.z));
    return { model, scale, materials, offset: new Vector3(-center.x, -bounds.min.y, -center.z) };
  }, [scene, name]);
  useEffect(() => () => materials.forEach((material) => material.dispose()), [materials]);
  const { actions } = useAnimations(animations, group);
  const current = useRef<CharacterAction>('Idle');
  useEffect(() => {
    const idle = actions.Idle;
    if (!idle) return;
    idle.reset().setLoop(LoopRepeat, Infinity).play();
    return () => { idle.stop(); actions.Walk?.stop(); actions.Attack?.stop(); };
  }, [actions]);
  useFrame(() => {
    materials.forEach((material) => { material.opacity = opacity.current; });
    const next = action.current;
    if (next === current.current) return;
    const from = actions[current.current], to = actions[next];
    if (!to) return;
    to.reset().setLoop(LoopRepeat, Infinity).play();
    if (from) to.crossFadeFrom(from, 0.25, false);
    current.current = next;
  });
  return <group ref={group} scale={scale}><group position={offset}><primitive object={model} /></group></group>;
};
