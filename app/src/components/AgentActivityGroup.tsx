import { CaretDown, CircleNotch, TerminalWindow } from '@phosphor-icons/react';
import type { ConversationEntry } from './agentConversation.types';

export const AgentActivityGroup = ({ entries, running }: { entries: ConversationEntry[]; running: boolean }) => {
  const latest = entries[entries.length - 1];
  return <details className="agent-conversation-activity">
    <summary>
      {running ? <CircleNotch className="agent-conversation-spin" size={14} /> : <TerminalWindow size={14} />}
      <span>{running ? latest.title || 'Trabalhando' : `${entries.length} ${entries.length === 1 ? 'atividade' : 'atividades'}`}</span>
      <CaretDown size={12} className="agent-conversation-caret" />
    </summary>
    <div className="agent-conversation-activity-list">{entries.map((entry) => <div key={entry.id}>
      <span>{entry.title || 'Atividade'}{entry.status === 'failed' ? ' · falhou' : ''}</span>
      {entry.text && <pre>{entry.text}</pre>}
    </div>)}</div>
  </details>;
};
