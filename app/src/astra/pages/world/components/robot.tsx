import type { RobotVariant } from '../../../core/world/agent-identity';
import { RobotIdentity } from './robot-identity';
import { forwardRef, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import { Group, MathUtils } from 'three';
import { RobotArm, RobotEyes, RobotHead, RobotLeg, RobotTorso } from './robot-parts';
export const Robot = forwardRef<Group, { walking: React.RefObject<boolean>; variant: RobotVariant }>(({ walking, variant }, ref) => {
  const leftLeg = useRef<Group>(null), rightLeg = useRef<Group>(null), body = useRef<Group>(null);
  const leftArm = useRef<Group>(null), rightArm = useRef<Group>(null), head = useRef<Group>(null), eyes = useRef<Group>(null);
  const pace = useRef(0);
  useFrame(({ clock }, frameDelta) => {
    const delta = Math.min(frameDelta, 0.05), time = clock.elapsedTime;
    pace.current = MathUtils.damp(pace.current, walking.current ? 1 : 0, 10, delta);
    const stride = Math.sin(time * 13) * 0.48 * pace.current;
    if (leftLeg.current && rightLeg.current) { leftLeg.current.rotation.x = stride; rightLeg.current.rotation.x = -stride; }
    if (leftArm.current && rightArm.current) { leftArm.current.rotation.x = -stride * 0.7; rightArm.current.rotation.x = stride * 0.7; }
    if (body.current) { body.current.position.y = Math.abs(stride) * 0.06 + Math.sin(time * 2) * 0.008; body.current.rotation.z = stride * 0.025; }
    if (head.current) head.current.rotation.y = Math.sin(time * 0.8) * 0.09 * (1 - pace.current);
    if (eyes.current) eyes.current.scale.y = time % 5.7 > 5.55 ? 0.15 : 1;
  });
  return <group ref={ref} scale={variant === 'claude' ? [1.2, 1.02, 1.12] : variant === 'codex' ? [1, 1.15, 1] : 1.08}>
    <group ref={body}>
      <RobotIdentity variant={variant} />
      <RobotTorso variant={variant} />
      <group ref={head} position={[0, 1.54, 0.03]}><RobotHead variant={variant} /><group ref={eyes} position={[0, 0.07, 0.37]}><RobotEyes variant={variant} /></group></group>
      <group ref={leftArm} position={[-0.49, 1.1, 0]} rotation={[0, 0, -0.08]}><RobotArm variant={variant} /></group>
      <group ref={rightArm} position={[0.49, 1.1, 0]} rotation={[0, 0, 0.08]}><RobotArm variant={variant} /></group>
    </group>
    <group ref={leftLeg} position={[-0.21, 0.53, 0]}><RobotLeg variant={variant} /></group>
    <group ref={rightLeg} position={[0.21, 0.53, 0]}><RobotLeg variant={variant} /></group>
  </group>;
});
Robot.displayName = 'Robot';
