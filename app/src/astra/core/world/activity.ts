import type { SessionInfo } from '../../../api';

export const isActivity = (session: SessionInfo) => !!(session.isMcp || session.isSkill || session.isResource || session.isResourceGroup);

// Cada tipo de atividade vira uma bancada no mundo: um modelo base (Medieval
// Village ou Cube World Kit), um adereco opcional que ganha vida enquanto o
// agente trabalha ali, e um icone usado nas etiquetas e no painel.
export type ActivityKind = 'skill' | 'web' | 'edit' | 'read' | 'shell' | 'group' | 'resource' | 'tool';
export type StationEffect = 'crystal' | 'bubble' | 'chest' | 'lever' | 'none';
export type Presentation = {
  kind: ActivityKind; model: string; workingModel?: string; prop?: string; effect: StationEffect;
  icon: string; label: string; detail: string;
};
// Modelos que vem do Cube World Kit em vez do Medieval Village.
export const KIT_STATION_MODELS = ['Chest_Closed', 'Chest_Open', 'Crystal_Big', 'Crystal_Small', 'Key', 'Lever_Left', 'Button'];

const KINDS: Record<ActivityKind, Omit<Presentation, 'kind' | 'detail'>> = {
  skill: { model: 'Rock_1', prop: 'Crystal_Big', effect: 'crystal', icon: '✨', label: 'Habilidade' },
  web: { model: 'MarketStand_1', prop: 'Crystal_Small', effect: 'crystal', icon: '🌐', label: 'Pesquisa / internet' },
  edit: { model: 'Cauldron', effect: 'bubble', icon: '✏️', label: 'Edição' },
  read: { model: 'Chest_Closed', workingModel: 'Chest_Open', effect: 'chest', icon: '📄', label: 'Arquivos' },
  shell: { model: 'Lever_Left', prop: 'Button', effect: 'lever', icon: '⚙️', label: 'Comando / terminal' },
  group: { model: 'Sawmill', effect: 'none', icon: '🏗️', label: 'Grupo de recursos' },
  resource: { model: 'Mill', effect: 'none', icon: '🖧', label: 'Recurso' },
  tool: { model: 'Cart', effect: 'none', icon: '🧰', label: 'Ferramenta / integração' },
};

export const activityKind = (session: SessionInfo): ActivityKind => {
  const source = `${session.mcpServer || ''} ${session.mcpTool || ''} ${session.resourceKind || ''}`;
  if (session.isSkill) return 'skill';
  if (session.isResourceGroup) return 'group';
  if (session.isResource) return 'resource';
  if (/search|web|browser|fetch|https?|navigate|url/i.test(source)) return 'web';
  if (/write|edit|patch|create|save/i.test(source)) return 'edit';
  if (/read|file|directory|glob|grep|list|cat\b/i.test(source)) return 'read';
  if (/bash|shell|terminal|command|exec|run|script/i.test(source)) return 'shell';
  return 'tool';
};

export const activityPresentation = (session: SessionInfo): Presentation => {
  const kind = activityKind(session);
  const detail = session.skillName || session.mcpTool || session.resourceCommand || session.name || session.sessionId;
  const base = { ...KINDS[kind], kind, detail };
  if (kind === 'resource' && /port|:\d+/i.test(`${session.resourceKind || ''} ${session.name || ''}`)) return { ...base, label: 'Servidor / porta' };
  return base;
};

export const sessionState = (session: SessionInfo) => {
  if (/error|failed|failure/i.test(session.status || '')) return 'Falha';
  if (!session.alive) return 'Encerrado';
  if (/wait|blocked|approval/i.test(session.status || '')) return 'Aguardando';
  return session.status === 'busy' ? 'Em execução' : 'Ocioso';
};
export const isWaiting = (session: SessionInfo) => sessionState(session) === 'Aguardando';
