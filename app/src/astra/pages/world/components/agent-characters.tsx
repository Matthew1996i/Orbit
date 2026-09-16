import { useMemo } from 'react';
import type { SessionInfo } from '../../../../api';
import { AgentCharacter } from './agent-character';
import { layoutAgents } from '../../../core/world/agents';

export const AgentCharacters = ({ sessions, onOpenSession }: {
  sessions: SessionInfo[]; onOpenSession?: (session: SessionInfo) => void;
}) => {
  const agents = useMemo(() => layoutAgents(sessions), [sessions]);
  return <>{agents.map(({ session, position }) => <AgentCharacter key={session.sessionId}
    session={session} position={position} onOpenSession={onOpenSession} />)}</>;
};
