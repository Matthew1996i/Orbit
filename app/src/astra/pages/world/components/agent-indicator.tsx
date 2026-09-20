import { useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import { Html } from '@react-three/drei';
import { agentIdentity } from '../../../core/world/agent-identity';
import { actorStatus } from '../../../core/world/live-status';
import type { LiveWorld, WorldActor, WorldNode } from '../../../core/world/live-world.types';
import type { FocusHandlers } from './focus';

// Etiqueta curta acima do personagem. O detalhe completo (atividades, vinculo,
// acoes) fica no painel fixo da tela, que nao acompanha o personagem andando.
export const AgentIndicator = ({ world, node, actor, height, focus }: { world: LiveWorld; node: WorldNode; actor: WorldActor; height: number; focus: FocusHandlers }) => {
  const label = useRef<HTMLDivElement>(null), status = useRef<HTMLElement>(null);
  const session = node.session, identity = agentIdentity(session);
  const name = session.name || session.role || session.sessionId.slice(0, 8);
  useFrame(() => {
    if (label.current) { label.current.style.opacity = String(actor.opacity); label.current.style.pointerEvents = actor.opacity < 0.1 ? 'none' : 'auto'; }
    if (status.current) status.current.textContent = actorStatus(node, actor, world).summary;
  });
  return <Html position={[0, height + 0.8, 0]} center distanceFactor={22} zIndexRange={[30, 0]}>
    <div ref={label} className="astra-agent-indicator" onMouseEnter={() => focus.inspect(node.id)} onMouseLeave={() => focus.inspect(null)}>
      <button className="astra-agent-name" data-status={!session.alive ? 'dead' : session.status === 'busy' ? 'busy' : 'idle'}
        onFocus={() => focus.inspect(node.id)} onBlur={() => focus.inspect(null)}
        onPointerDown={(event) => event.stopPropagation()}
        onClick={(event) => { event.stopPropagation(); focus.select(node.id); }}>
        <span aria-hidden="true" /><div><strong>{name}</strong>
          <small>{identity.provider}{identity.model ? ` · ${identity.model}` : ''}</small>
          <small ref={status} />
        </div>
      </button>
    </div>
  </Html>;
};
