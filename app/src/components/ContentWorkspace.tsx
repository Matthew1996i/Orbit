import { lazy, Suspense, useId, useRef, useState, type KeyboardEvent, type ReactNode } from 'react';
import { SquaresFour, TreeStructure } from '@phosphor-icons/react';
import './ContentWorkspace.css';
import type { SessionInfo } from '../api';
import LlmUsageWidget from './LlmUsageWidget';
const NO_SESSIONS: SessionInfo[] = [];

const AstraWorkspace = lazy(() => import('../astra')); 
const MODES = [
  { label: 'Folha de agentes', Icon: TreeStructure },
  { label: 'Astra', Icon: SquaresFour },
] as const;

const ContentWorkspace = ({ children, actions, sessions = NO_SESSIONS, onOpenSession }: { children: ReactNode; actions?: ReactNode; sessions?: SessionInfo[]; onOpenSession?: (session: SessionInfo) => void }) => {
  const [selected, setSelected] = useState(0);
  const select = (index: number) => {
    setSelected(index);
  };
  const id = useId();
  const buttons = useRef<(HTMLButtonElement | null)[]>([]);
  const navigate = (event: KeyboardEvent<HTMLButtonElement>) => {
    let next: number;
    if (event.key === 'ArrowRight' || event.key === 'ArrowLeft') next = 1 - selected;
    else if (event.key === 'Home') next = 0;
    else if (event.key === 'End') next = 1;
    else return;
    event.preventDefault();
    select(next);
    buttons.current[next]?.focus();
  };

  return (
    <div className="orbit-workspace">
      <div className="orbit-workspace-usage"><LlmUsageWidget sessions={sessions} /></div>
      {/* Preserve the existing tree, pan and zoom without cloning sessions. */}
      <div className="orbit-workspace-panel" role="tabpanel" id={`${id}-panel-0`}
        aria-labelledby={`${id}-tab-0`} hidden={selected !== 0}>
        {children}
      </div>
      <div className="orbit-workspace-panel" role="tabpanel" id={`${id}-panel-1`}
        aria-labelledby={`${id}-tab-1`} hidden={selected !== 1} tabIndex={0}>
        {selected === 1 && <Suspense fallback={<div role="status">Carregando Astra…</div>}>
          <AstraWorkspace active={selected === 1} sessions={sessions} onOpenSession={onOpenSession} />
        </Suspense>}
      </div>
      {actions}
      <div className="orbit-content-switch" role="tablist" aria-label="Visualização do conteúdo">
        <span className="orbit-content-switch-indicator" data-selected={selected} aria-hidden="true" />
        {MODES.map(({ label, Icon }, index) => (
          <button key={label} ref={(element) => { buttons.current[index] = element; }}
            type="button" role="tab" id={`${id}-tab-${index}`}
            aria-controls={`${id}-panel-${index}`} aria-selected={selected === index}
            aria-label={label} title={label} tabIndex={selected === index ? 0 : -1}
            onClick={() => select(index)} onKeyDown={navigate}>
            <Icon size={19} weight={selected === index ? 'fill' : 'regular'} aria-hidden="true" />
          </button>
        ))}
      </div>
    </div>
  );
};

export default ContentWorkspace;
