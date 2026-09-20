import { useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import { Group } from 'three';
import type { WorldActor } from '../../../core/world/live-world.types';
import { useKitStation, useStationMaterial } from './station-models';

// Chave do Cube World Kit girando acima do agente que espera aprovacao ou
// esta bloqueado: da pra ver de longe quem precisa de atencao.
export const WaitingKey = ({ actor, height, visible }: { actor: WorldActor; height: number; visible: boolean }) => {
  const model = useKitStation('Key'), material = useStationMaterial(model);
  const group = useRef<Group>(null);
  useFrame(({ clock }) => {
    if (!group.current) return;
    material.opacity = visible ? actor.opacity : 0;
    group.current.visible = visible && actor.opacity > 0.05;
    group.current.position.y = height + 0.35 + Math.sin(clock.elapsedTime * 3) * 0.12;
    group.current.rotation.y = clock.elapsedTime * 2;
  });
  return <group ref={group} scale={0.9 / Math.max(model.height, 0.001)}>{model.render(material)}</group>;
};
