import { useEffect, useRef } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import { Vector3 } from 'three';
import type { LiveWorld } from '../../../core/world/live-world.types';

const FOLLOW_DISTANCE = 18;
// Aproximacao por cima (~55 graus) pra camera nao entrar em telhados e copas
// quando o agente esta encostado numa bancada ao lado de um predio.
const FOLLOW_DIRECTION = new Vector3(0.5, 0.82, 0.55).normalize();
const HOME_TARGET = new Vector3(0, 1, 0), HOME_OFFSET = new Vector3(26, 24, 34);

// Mantem o agente selecionado no centro da tela: o alvo dos OrbitControls
// acompanha o personagem e a camera se desloca junto, preservando o angulo
// escolhido pelo usuario. Sem selecao, volta suavemente pra visao geral.
export const CameraFollow = ({ world, selected, reset }: { world: LiveWorld; selected: string | null; reset: number }) => {
  const { camera, controls, invalidate } = useThree();
  const approach = useRef(0), returning = useRef(false), goal = useRef(new Vector3()), offset = useRef(new Vector3());
  useEffect(() => { if (selected) approach.current = 1; }, [selected]);
  useEffect(() => { if (reset) { returning.current = true; invalidate(); } }, [reset, invalidate]);
  useFrame((_, frameDelta) => {
    const orbit = controls as unknown as { target: Vector3; update: () => void } | null;
    if (!orbit) return;
    const delta = Math.min(frameDelta, 0.05);
    const actor = selected ? world.actors.get(selected) : undefined;
    if (actor) {
      returning.current = false;
      goal.current.set(actor.position[0], actor.position[1] + 1, actor.position[2]);
      offset.current.copy(camera.position).sub(orbit.target);
      // Approach once per selection, then keep whatever angle/distance the user sets.
      if (approach.current > 0) {
        const wanted = FOLLOW_DIRECTION.clone().multiplyScalar(FOLLOW_DISTANCE);
        offset.current.lerp(wanted, Math.min(delta * 3, 1));
        approach.current = offset.current.distanceTo(wanted) < 0.2 ? 0 : 1;
      }
      orbit.target.lerp(goal.current, Math.min(delta * 6, 1));
      camera.position.copy(orbit.target).add(offset.current);
      orbit.update(); invalidate();
    } else if (returning.current) {
      orbit.target.lerp(HOME_TARGET, Math.min(delta * 3, 1));
      goal.current.copy(HOME_TARGET).add(HOME_OFFSET);
      camera.position.lerp(goal.current, Math.min(delta * 3, 1));
      if (camera.position.distanceTo(goal.current) < 0.05) returning.current = false;
      orbit.update(); invalidate();
    }
  });
  return null;
};
