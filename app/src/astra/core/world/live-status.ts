import { activityPresentation, isWaiting, sessionState } from './activity';
import { distance, type WorldActor, type WorldNode, type LiveWorld } from './live-world.types';

// Texto (e icone) do que o agente esta fazendo agora, derivado so do mundo.
export const actorStatus = (node: WorldNode, actor: WorldActor, world?: LiveWorld) => {
  const station = world && actor.activityId ? world.nodes.get(actor.activityId) : undefined;
  const moving = distance(actor.position, actor.destination) > 0.1;
  const state = !node.present ? 'Saindo' : moving ? actor.walking ? 'Caminhando' : 'Aguardando passagem' : sessionState(node.session);
  const waiting = node.present && isWaiting(node.session);
  if (!station) return { state, summary: waiting ? '⏳ Aguardando aprovação' : moving ? 'Caminhando' : state, detail: '', icon: waiting ? '🔑' : '' };
  const presentation = activityPresentation(station.session);
  const summary = moving ? `${presentation.icon} Indo para ${presentation.label.toLowerCase()}`
    : waiting ? `⏳ Aguardando em ${presentation.label.toLowerCase()}`
      : actor.working ? `${presentation.icon} Trabalhando: ${presentation.label.toLowerCase()}` : state;
  return { state, summary, detail: presentation.detail, label: presentation.label, icon: presentation.icon };
};
