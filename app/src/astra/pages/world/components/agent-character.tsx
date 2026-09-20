import { useEffect, useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import { Group } from 'three';
import { createRandom } from '../../../shared/random';
import type { LiveWorld, WorldActor, WorldNode } from '../../../core/world/live-world.types';
import { KitCharacter, type CharacterAction } from './kit-character';
import { CHARACTERS, characterHeight } from './kit-characters';
import { AgentIndicator } from './agent-indicator';
import { WaitingKey } from './waiting-key';
import { isWaiting } from '../../../core/world/activity';
import type { FocusHandlers } from './focus';

export const AgentCharacter = ({ world, node, actor, focus }: { world: LiveWorld; node: WorldNode; actor: WorldActor; focus: FocusHandlers }) => {
  const group = useRef<Group>(null), facing = useRef<Group>(null), action = useRef<CharacterAction>('Idle'), opacity = useRef(0);
  const character = useMemo(() => {
    const random = createRandom(Array.from(node.id).reduce((seed, char) => (seed * 31 + char.charCodeAt(0)) >>> 0, 7));
    return CHARACTERS[Math.floor(random() * CHARACTERS.length)];
  }, [node.id]);
  useEffect(() => { actor.opacity = 0; }, [actor]);
  useFrame(() => {
    if (!group.current || !facing.current) return;
    group.current.position.set(...actor.position);
    facing.current.rotation.y = actor.heading;
    action.current = actor.walking ? 'Walk' : actor.working ? 'Attack' : 'Idle';
    opacity.current = actor.opacity;
  }, -1);
  return <group ref={group}
    onPointerOver={(event) => { event.stopPropagation(); focus.inspect(node.id); }}
    onPointerOut={() => focus.inspect(null)}
    onClick={(event) => { if (event.delta > 5) return; event.stopPropagation(); focus.select(node.id); }}>
    <group ref={facing}><KitCharacter name={character} action={action} opacity={opacity} /></group>
    <WaitingKey actor={actor} height={characterHeight(character)} visible={node.present && isWaiting(node.session)} />
    <AgentIndicator world={world} node={node} actor={actor} height={characterHeight(character)} focus={focus} />
  </group>;
};
