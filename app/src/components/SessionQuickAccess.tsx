import { useState } from 'react';
import { CaretRight, Terminal, TreeStructure } from '@phosphor-icons/react';
import { llmLogoFor } from '../utils/llmLogos';
import type { SessionInfo } from '../api';
import './SessionQuickAccess.css';

interface Props {
  sessions: SessionInfo[];
  onOpen?: (session: SessionInfo) => void;
}

function kindOf(session: SessionInfo) {
  if (session.isResourceGroup) return 'Grupo de processos';
  if (session.isResource) return 'Subprocesso';
  if (session.isSubagent) return 'Subagente';
  if (session.isMcp) return 'MCP';
  if (session.isSkill) return 'Skill';
  return 'Agente';
}

export default function SessionQuickAccess({ sessions, onOpen }: Props) {
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set());
  const [selected, setSelected] = useState<string | null>(null);
  const byId = new Map(sessions.map((session) => [session.sessionId, session]));
  const children = new Map<string, SessionInfo[]>();
  for (const session of byId.values()) {
    if (session.parentSessionId) {
      const siblings = children.get(session.parentSessionId) ?? [];
      siblings.push(session);
      children.set(session.parentSessionId, siblings);
    }
  }
  const roots = [...byId.values()].filter((session) =>
    (!session.parentSessionId || !byId.has(session.parentSessionId)) &&
    !session.isSubagent && !session.isResource && !session.isResourceGroup && !session.isMcp && !session.isSkill
  ).sort((a, b) => a.startedAt - b.startedAt);

  const renderNode = (session: SessionInfo, ancestors: Set<string>): React.ReactNode => {
    if (ancestors.has(session.sessionId)) return null;
    const path = new Set(ancestors).add(session.sessionId);
    const descendants = (children.get(session.sessionId) ?? []).filter((child) => !path.has(child.sessionId));
    const name = session.name || session.role || session.resourceCommand || session.skillName || session.mcpServer || session.sessionId.slice(0, 8);
    const state = !session.alive ? 'Encerrado' : session.status === 'busy' ? 'Em execução' : 'Disponível';
    const label = `${kindOf(session)} · ${state}${session.pid > 0 ? ` · PID ${session.pid}` : ''}`;
    const root = ancestors.size === 0;
    const Logo = root || session.isSubagent ? llmLogoFor(session.llm || 'claude') : Terminal;
    const folder = session.cwd?.replace(/\\/g, '/').replace(/\/$/, '').split('/').pop();
    const expanded = !collapsed.has(session.sessionId);
    return (
      <li key={session.sessionId} className={root ? 'session-quick-root' : ''}>
        <div className={`session-quick-row${selected === session.sessionId ? ' selected' : ''}`}>
        {descendants.length > 0 ? <button className="session-quick-toggle" type="button" aria-label={`${expanded ? 'Recolher' : 'Expandir'} subprocessos de ${name}`} aria-expanded={expanded} onClick={() => setCollapsed((current) => {
          const next = new Set(current);
          if (next.has(session.sessionId)) next.delete(session.sessionId);
          else next.add(session.sessionId);
          return next;
        })}><CaretRight size={11} style={{ transform: expanded ? 'rotate(90deg)' : undefined }} /></button> : <span className="session-quick-toggle-spacer" />}
        <button className="session-quick-item" type="button" onClick={() => { setSelected(session.sessionId); onOpen?.(session); }} title={`${name}\n${label}\n${session.cwd || ''}`}>
          <span className={`session-quick-logo${root ? ' agent' : ''}`}><Logo size={root ? 17 : 13} /></span>
          <span className="session-quick-text">
            <span className="session-quick-name">{name}</span>
            {root && <span className="session-quick-detail">{folder || session.llm || 'Sessão'}</span>}
          </span>
          <span className={`session-quick-status${session.alive ? ' alive' : ''}${session.status === 'busy' ? ' busy' : ''}`} role="img" aria-label={state} />
        </button>
        </div>
        {descendants.length > 0 && expanded && <ul>{descendants.map((child) => renderNode(child, path))}</ul>}
      </li>
    );
  };

  return (
    <div className="sidebar-panel">
      <div className="sidebar-header">
        <span className="sidebar-header-title"><TreeStructure size={16} /> Sessões <span className="sidebar-header-count">{roots.length}</span></span>
      </div>
      <div className="session-quick-body">
        {[{ name: 'Internos', internal: true }, { name: 'Externos', internal: false }].map((group) => {
          const entries = roots.filter((session) => !!session.appManaged === group.internal);
          return (
            <details className="session-quick-group" key={group.name} open>
              <summary>{group.name} <span className="sidebar-header-count">{entries.length}</span></summary>
              {entries.length > 0
                ? <ul aria-label={`Agentes ${group.name.toLowerCase()}`}>{entries.map((entry) => renderNode(entry, new Set()))}</ul>
                : <div className="sidebar-empty">Nenhum agente {group.internal ? 'interno' : 'externo'}</div>}
            </details>
          );
        })}
      </div>
    </div>
  );
}
