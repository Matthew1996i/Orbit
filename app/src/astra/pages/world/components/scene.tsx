import { memo, Suspense, useEffect } from 'react';
import { Canvas, useThree } from '@react-three/fiber';
import { OrbitControls } from '@react-three/drei';
import { MOUSE } from 'three';
import type { SessionInfo } from '../../../../api';
import type { Village } from '../../../core/world/village.types';
import type { LiveWorld } from '../../../core/world/live-world.types';
import { AgentCharacters } from './agent-characters';
import { VillageBuildings } from './village-buildings';
import { VillageLanterns } from './village-lanterns';
import { Forest } from './forest';
import { CameraFollow } from './camera-follow';
import type { FocusHandlers } from './focus';
import { startVisiblePolling } from '../../../../utils/visiblePolling';

type Props = {
  active: boolean; sessions: SessionInfo[]; village: Village; world: LiveWorld;
  focus: FocusHandlers; selected: string | null; reset: number;
};

const SceneContent = ({ active, sessions, village, world, focus, selected, reset }: Props) => {
  const { gl, invalidate } = useThree();
  useEffect(() => {
    if (!active) return;
    return startVisiblePolling(invalidate, 1000 / 30);
  }, [active, invalidate]);
  useEffect(() => { gl.shadowMap.needsUpdate = true; invalidate(); }, [gl, invalidate, sessions]);
  return <>
    <color attach="background" args={['#c8d9d5']} />
    <fog attach="fog" args={['#c8d9d5', 90, 220]} />
    <hemisphereLight args={['#e0edff', '#85956a', 1.6]} />
    <directionalLight position={[-18, 32, 12]} color="#fff0cc" intensity={2.5} castShadow
      shadow-mapSize={[2048, 2048]} shadow-camera-left={-70} shadow-camera-right={70}
      shadow-camera-top={70} shadow-camera-bottom={-70} shadow-camera-far={140}
      shadow-bias={-0.0002} shadow-normalBias={0.06} />
    <directionalLight position={[18, 12, -20]} color="#d0e0ff" intensity={0.5} />
    <Suspense fallback={null}><VillageBuildings village={village} /></Suspense>
    <Forest village={village} />
    <VillageLanterns positions={village.lanterns} />
    <AgentCharacters active={active} sessions={sessions} world={world} focus={focus} />
    <CameraFollow world={world} selected={selected} reset={reset} />
    <OrbitControls makeDefault enableDamping dampingFactor={0.08} minDistance={5} maxDistance={160}
      minPolarAngle={0.05} maxPolarAngle={Math.PI / 2 - 0.08} target={[0, 1, 0]}
      mouseButtons={{ LEFT: MOUSE.ROTATE, MIDDLE: MOUSE.DOLLY, RIGHT: MOUSE.PAN }} />
  </>;
};

export const WorldScene = memo((props: Props) => <Canvas frameloop={props.active ? 'demand' : 'never'}
  shadows dpr={1} camera={{ position: [26, 25, 35], fov: 42, near: 0.5, far: 400 }}
  onCreated={({ gl }) => { gl.shadowMap.autoUpdate = false; gl.shadowMap.needsUpdate = true; }}
  gl={{ antialias: false, alpha: false, powerPreference: 'low-power' }}>
  <SceneContent {...props} />
</Canvas>);
