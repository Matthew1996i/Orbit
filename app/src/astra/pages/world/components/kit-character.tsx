import { useEffect, useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import { useAnimations, useGLTF } from '@react-three/drei';
import { Box3, Group, LoopRepeat, Mesh, Vector3 } from 'three';
import { clone as cloneSkeleton } from 'three/examples/jsm/utils/SkeletonUtils.js';
import { kitUrl } from './kit-models';

import { CHARACTERS, characterHeight, type Character } from './kit-characters';

// Cada agente recebe um personagem estavel (sorteado a partir do sessionId),
// com Idle parado e Walk andando.
CHARACTERS.forEach((name) => useGLTF.preload(kitUrl(name)));

export const KitCharacter = ({ name, walking }: { name: Character; walking: React.RefObject<boolean> }) => {
  const { scene, animations } = useGLTF(kitUrl(name));
  const group = useRef<Group>(null);
  const { model, scale } = useMemo(() => {
    const model = cloneSkeleton(scene);
    model.traverse((object) => {
      if ((object as Mesh).isMesh) { object.castShadow = true; object.receiveShadow = true; object.frustumCulled = false; }
    });
    const size = new Box3().setFromObject(model).getSize(new Vector3());
    return { model, scale: characterHeight(name) / size.y };
  }, [scene, name]);
  const { actions } = useAnimations(animations, group);
  const current = useRef<'Idle' | 'Walk'>('Idle');
  useEffect(() => {
    const idle = actions.Idle;
    if (!idle) return;
    idle.reset().setLoop(LoopRepeat, Infinity).play();
    return () => { idle.stop(); actions.Walk?.stop(); };
  }, [actions]);
  useFrame(() => {
    const next = walking.current ? 'Walk' : 'Idle';
    if (next === current.current) return;
    const from = actions[current.current], to = actions[next];
    if (!to) return;
    to.reset().setLoop(LoopRepeat, Infinity).play();
    if (from) to.crossFadeFrom(from, 0.25, false);
    current.current = next;
  });
  return <group ref={group} scale={scale}><primitive object={model} /></group>;
};
