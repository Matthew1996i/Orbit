import { memo, useEffect, useMemo } from 'react';
import { Canvas, useThree } from '@react-three/fiber';
import { OrbitControls } from '@react-three/drei';
import { MOUSE } from 'three';
import type { SessionInfo } from '../../../../api';
import { createVillage } from '../../../core/world/village';
import { AgentCharacters } from './agent-characters';
import { VillageBuildings } from './village-buildings';
import { VillageLanterns } from './village-lanterns';
import { Forest } from './forest';
import { VillageTowers } from './village-towers';

type Props = { active: boolean; sessions: SessionInfo[]; onOpenSession?: (session: SessionInfo) => void };

const SceneContent = ({ sessions, onOpenSession }: Props) => {
  const village = useMemo(createVillage, []);
  const { gl, invalidate } = useThree();
  useEffect(() => { gl.shadowMap.needsUpdate = true; invalidate(); }, [gl, invalidate, sessions]);
  return <>
    <color attach="background" args={['#c8d9d5']} />
    <fog attach="fog" args={['#c8d9d5', 65, 150]} />
    <hemisphereLight args={['#e0edff', '#85956a', 1.6]} />
    <directionalLight position={[-18, 32, 12]} color="#fff0cc" intensity={2.5} castShadow
      shadow-mapSize={[2048, 2048]} shadow-camera-left={-38} shadow-camera-right={38}
      shadow-camera-top={35} shadow-camera-bottom={-35} shadow-camera-far={100}
      shadow-bias={-0.0002} shadow-normalBias={0.06} />
    <directionalLight position={[18, 12, -20]} color="#d0e0ff" intensity={0.5} />
    <VillageBuildings village={village} />
    <Forest gardenTrees={village.trees} />
    <VillageLanterns positions={village.lanterns} />
    <VillageTowers />
    <AgentCharacters sessions={sessions} onOpenSession={onOpenSession} />
    <OrbitControls makeDefault enableDamping dampingFactor={0.08} minDistance={6} maxDistance={90}
      minPolarAngle={0.05} maxPolarAngle={Math.PI / 2 - 0.08} target={[0, 1, 0]}
      mouseButtons={{ LEFT: MOUSE.ROTATE, MIDDLE: MOUSE.DOLLY, RIGHT: MOUSE.PAN }} />
  </>;
};

export const WorldScene = memo((props: Props) => <Canvas frameloop={!props.active ? 'never' : props.sessions.some((session) => session.alive && session.status !== 'busy' && !session.isMcp && !session.isSkill && !session.isResource && !session.isResourceGroup) ? 'always' : 'demand'}
  shadows dpr={[1, 1.5]} camera={{ position: [35, 31, 43], fov: 42, near: 0.5, far: 180 }}
  onCreated={({ gl }) => { gl.shadowMap.autoUpdate = false; gl.shadowMap.needsUpdate = true; }}
  gl={{ antialias: true, alpha: true, powerPreference: 'default' }}>
  <SceneContent {...props} />
</Canvas>);
