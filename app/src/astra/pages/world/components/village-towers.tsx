import type { Position } from '../../../core/world/types';
import { SceneObstacle } from './scene-obstacle';

const Tower = ({ position, height }: { position: Position; height: number }) => <SceneObstacle obstacle={{ position, radius: 2, height: height + 6 }}><group position={position}>
  <mesh position={[0, height / 2, 0]} castShadow receiveShadow>
    <cylinderGeometry args={[1.3, 1.65, height, 12]} /><meshStandardMaterial color="#8990b4" roughness={0.85} />
  </mesh>
  {[0.3, height * 0.55, height - 0.25].map((level) => <mesh key={level} position={[0, level, 0]} castShadow>
    <cylinderGeometry args={[1.5, 1.55, 0.2, 12]} /><meshStandardMaterial color="#a4aac5" roughness={0.8} />
  </mesh>)}
  <mesh position={[0, height + 2.6, 0]} castShadow>
    <coneGeometry args={[1.9, 5.8, 12]} /><meshStandardMaterial color="#4d5d92" roughness={0.65} />
  </mesh>
  {Array.from({ length: 9 }, (_, index) => <mesh key={index} position={[0, height + index * 0.54, 0]}>
    <cylinderGeometry args={[1.8 - index * 0.17, 1.83 - index * 0.17, 0.06, 12]} />
    <meshStandardMaterial color="#7581ac" roughness={0.7} />
  </mesh>)}
  {[0, Math.PI / 2, Math.PI, -Math.PI / 2].map((angle) => <group key={angle} rotation={[0, angle, 0]}>
    <mesh position={[0, height - 1.6, 1.32]}><boxGeometry args={[0.42, 1.1, 0.03]} /><meshBasicMaterial color="#ffd795" /></mesh>
    <mesh position={[0, height - 1, 1.32]}><circleGeometry args={[0.21, 12, 0, Math.PI]} /><meshBasicMaterial color="#ffd795" /></mesh>
  </group>)}
</group></SceneObstacle>;

export const VillageTowers = () => <>
  <Tower position={[-10, 0, -17]} height={12} />
  <Tower position={[11, 0, -17]} height={10} />
  <Tower position={[-23, 0, -6]} height={10} />
  <Tower position={[23, 0, -6]} height={12} />
</>;
