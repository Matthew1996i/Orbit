import { useEffect, useState } from 'react';
import type { SessionInfo } from '../../../../api';
import { agentIdentity } from '../../../core/world/agent-identity';
import { activityPresentation, sessionState } from '../../../core/world/activity';
import { ownedActivities } from '../../../core/world/live-activity';
import { actorStatus } from '../../../core/world/live-status';
import type { LiveWorld } from '../../../core/world/live-world.types';

// Painel fixo no canto da cena: mostra o agente sob o mouse ou o selecionado
// sem sair do lugar enquanto o personagem anda. Le o mundo vivo direto e se
// atualiza num ritmo legivel, sem re-render por frame.
export const AgentPanel = ({ world, id, pinned, onClose, onOverview, onOpenSession }: {
  world: LiveWorld; id: string | null; pinned: boolean; onClose: () => void; onOverview: () => void;
  onOpenSession?: (session: SessionInfo) => void;
}) => {
  const [, setTick] = useState(0);
  useEffect(() => {
    if (!id) return;
    const timer = setInterval(() => setTick((tick) => tick + 1), 400);
    return () => clearInterval(timer);
  }, [id]);
  const node = id ? world.nodes.get(id) : undefined, actor = id ? world.actors.get(id) : undefined;
  if (!node || !actor) return <div className="astra-panel astra-panel-hint" role="note">
    Passe o mouse num agente para ver o que ele faz. Clique para acompanhar com a câmera.
  </div>;
  const session = node.session, identity = agentIdentity(session);
  const name = session.name || session.role || session.sessionId.slice(0, 8);
  const status = actorStatus(node, actor, world);
  const activities = ownedActivities(world, node.id);
  const parent = session.parentSessionId ? world.nodes.get(session.parentSessionId) : undefined;
  return <div className="astra-panel" role="region" aria-label={`Agente ${name}`} data-pinned={pinned}>
    <header>
      <span className="astra-panel-dot" data-status={!session.alive ? 'dead' : session.status === 'busy' ? 'busy' : 'idle'} aria-hidden="true" />
      <div><strong>{name}</strong><small>{identity.provider}{identity.model ? ` · ${identity.model}` : ''}</small></div>
      {pinned && <button type="button" className="astra-panel-close" onClick={onClose} aria-label="Fechar painel">×</button>}
    </header>
    <p className="astra-panel-now"><span>Agora</span>{status.summary}{status.detail ? <em>{status.detail}</em> : null}</p>
    <p className="astra-panel-state"><span>Estado</span>{sessionState(session)}{parent ? <> · ligado a <b>{parent.session.name || parent.id.slice(0, 8)}</b></> : null}</p>
    {activities.length ? <ul className="astra-panel-activities">{activities.map((item) => {
      const presentation = activityPresentation(item.session);
      return <li key={item.id} data-current={item.id === actor.activityId}><b>{presentation.icon} {presentation.label}</b><span>{presentation.detail}</span></li>;
    })}</ul> : <p className="astra-panel-empty">Nenhuma ferramenta ou recurso em uso no momento.</p>}
    <footer>
      {pinned ? <button type="button" onClick={onOverview}>Visão geral</button>
        : <small>Clique no agente para acompanhar com a câmera</small>}
      {onOpenSession && <button type="button" className="astra-panel-primary" onClick={() => onOpenSession(session)}>Abrir sessão</button>}
    </footer>
  </div>;
};
