import type { SessionInfo } from '../../../api';
import type { Position } from './types';

export const layoutAgents = (sessions: SessionInfo[]): { session: SessionInfo; position: Position }[] => {
  const agents = sessions.filter((session) => !session.isMcp && !session.isSkill && !session.isResource && !session.isResourceGroup)
    .sort((first, second) => first.sessionId.localeCompare(second.sessionId));
  const columns = Math.max(1, Math.ceil(Math.sqrt(agents.length)));
  const rows = Math.ceil(agents.length / columns);
  const spacing = Math.min(2.5, 12 / Math.max(columns, rows));
  const byId = new Map(sessions.map((session) => [session.sessionId, session]));
  return agents.map((session, index) => ({ session: {
    ...session,
    llm: session.llm || byId.get(session.parentSessionId || '')?.llm,
    model: session.model || byId.get(session.parentSessionId || '')?.model,
  }, position: [
    ((index % columns) - (columns - 1) / 2) * spacing,
    0.15,
    (Math.floor(index / columns) - (rows - 1) / 2) * spacing + 1,
  ] }));
};
