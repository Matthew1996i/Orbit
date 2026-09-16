import { useMemo, useRef, type ReactNode } from 'react';
import { useFrame } from '@react-three/fiber';
import { Group, Vector3 } from 'three';
import { obstructsView, type Obstacle } from '../../../core/world/occlusion';

export const SceneObstacle = ({ obstacle, children }: { obstacle: Obstacle; children: ReactNode }) => {
  const group = useRef<Group>(null), fallbackTarget = useMemo(() => new Vector3(), []);
  useFrame(({ camera, controls }) => {
    const target = controls && 'target' in controls && controls.target instanceof Vector3 ? controls.target : fallbackTarget;
    if (group.current) group.current.visible = !obstructsView(camera.position, target, obstacle);
  });
  return <group ref={group}>{children}</group>;
};
