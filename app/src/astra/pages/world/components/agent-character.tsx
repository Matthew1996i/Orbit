import { useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import { Html } from '@react-three/drei';
import { Group } from 'three';
import type { SessionInfo } from '../../../../api';
import type { Position } from '../../../core/world/types';
import { groundHeight, randomWalkPath } from '../../../core/world/navigation';
import { createRandom } from '../../../shared/random';
import { Robot } from './robot';
import { agentIdentity } from '../../../core/world/agent-identity';

export const AgentCharacter = ({ session, position, onOpenSession }: {
  session: SessionInfo; position: Position; onOpenSession?: (session: SessionInfo) => void;
}) => {
  const actor = useRef<Group>(null), facing = useRef<Group>(null), walking = useRef(false);
  const route = useRef<Position[]>([]), waypoint = useRef(0), wait = useRef(0);
  const random = useMemo(() => createRandom(Array.from(session.sessionId).reduce((seed, char) => (seed * 31 + char.charCodeAt(0)) >>> 0, 7)), [session.sessionId]);
  const idle = session.alive && session.status !== 'busy';
  const name = session.name || session.role || session.sessionId.slice(0, 8);
  const identity = agentIdentity(session);
  useFrame((_, frameDelta) => {
    if (!actor.current || !facing.current) return;
    walking.current = false;
    if (!idle) return;
    const delta = Math.min(frameDelta, 0.05), current = actor.current.position;
    wait.current -= delta;
    if (waypoint.current >= route.current.length) {
      if (wait.current > 0) return;
      route.current = randomWalkPath(current.x, current.z, random); waypoint.current = 0;
      if (!route.current.length) { wait.current = 2; return; }
    }
    const target = route.current[waypoint.current];
    const differenceX = target[0] - current.x, differenceZ = target[2] - current.z;
    const distance = Math.hypot(differenceX, differenceZ), step = Math.min(delta * 1.1, distance);
    if (distance > 0.005) {
      current.x += differenceX / distance * step; current.z += differenceZ / distance * step;
      current.y = groundHeight(current.x, current.z);
      const angle = Math.atan2(differenceX, differenceZ);
      const difference = Math.atan2(Math.sin(angle - facing.current.rotation.y), Math.cos(angle - facing.current.rotation.y));
      facing.current.rotation.y += difference * Math.min(delta * 9, 1);
      walking.current = true;
    }
    if (distance <= step + 0.005) {
      waypoint.current++;
      if (waypoint.current >= route.current.length) wait.current = 1.5 + random() * 4;
    }
  });
  return <group ref={actor} position={position} onClick={(event) => {
    if (event.delta > 5) return;
    event.stopPropagation(); onOpenSession?.(session);
  }}>
    <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.01, 0]}>
      <circleGeometry args={[0.55, 20]} /><meshBasicMaterial color="#111a30" transparent opacity={0.25} depthWrite={false} />
    </mesh>
    <group ref={facing}><Robot walking={walking} variant={identity.variant} /></group>
    <Html position={[0, 2.8, 0]} center distanceFactor={28} zIndexRange={[30, 0]}>
      <button className="astra-agent-name" data-status={!session.alive ? 'dead' : idle ? 'idle' : 'busy'}
        title={`${name} · ${!session.alive ? 'Encerrado' : idle ? 'Ocioso' : 'Em execução'}`}
        onPointerDown={(event) => event.stopPropagation()}
        onClick={(event) => { event.stopPropagation(); onOpenSession?.(session); }}>
        <span aria-hidden="true" /><div><strong>{name}</strong><small>{identity.provider}{identity.model ? ` · ${identity.model}` : ''}</small></div>
      </button>
    </Html>
  </group>;
};
