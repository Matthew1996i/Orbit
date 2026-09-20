import { Suspense, useLayoutEffect, useState } from 'react';
import { useFrame } from '@react-three/fiber';
import type { SessionInfo } from '../../../../api';
import type { LiveWorld } from '../../../core/world/live-world.types';
import { syncLiveWorld } from '../../../core/world/live-layout';
import { advanceWorld } from '../../../core/world/live-motion';
import { AgentCharacter } from './agent-character';
import { ActivityStation } from './activity-station';
import type { FocusHandlers } from './focus';

export const AgentCharacters = ({ active, sessions, world, focus }: {
  active: boolean; sessions: SessionInfo[]; world: LiveWorld; focus: FocusHandlers;
}) => {
  const [, setRevision] = useState(0);
  useLayoutEffect(() => {
    syncLiveWorld(world, sessions); setRevision(world.revision);
  }, [world, sessions]);
  useFrame((_, delta) => {
    if (active && advanceWorld(world, delta)) setRevision(world.revision);
  }, -2);
  return <>
    {[...world.nodes.values()].map((node) => <Suspense key={node.id} fallback={null}>
      {node.model ? <ActivityStation world={world} node={node} /> : <AgentCharacter world={world} node={node}
        actor={world.actors.get(node.id)!} focus={focus} />}
    </Suspense>)}
  </>;
};
