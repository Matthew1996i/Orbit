import { memo, Suspense } from 'react';
import { VillageTrees } from './village-trees';
import { Vegetation } from './vegetation';
import type { Village } from '../../../core/world/village.types';

// Arvores (vila + floresta) vem do `village`, entao os mesmos envelopes valem
// pra colocacao, navegacao e render. A vegetacao rasteira e so decorativa e
// pode ser atravessada; arbustos e troncos secos ficam na zona da floresta.
export const Forest = memo(({ village }: { village: Village }) => <>
  <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, -0.015, 0]} receiveShadow>
    <planeGeometry args={[2000, 2000]} /><meshStandardMaterial color="#8d9868" roughness={1} />
  </mesh>
  <Suspense fallback={null}><Vegetation village={village} /><VillageTrees trees={village.trees} /></Suspense>
</>);
