import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { WorldScene } from './pages/world/components/scene';
import { SceneErrorBoundary } from './pages/world/components/error-boundary';
import { AgentPanel } from './pages/world/components/agent-panel';
import type { Focus, FocusHandlers } from './pages/world/components/focus';
import { createVillage } from './core/world/village';
import { createLiveWorld } from './core/world/live-world.types';
import { sceneryObstacles } from './core/world/scenery';
import type { SessionInfo } from '../api';
import './workspace.css';

const AstraWorkspace = ({ active, sessions, onOpenSession }: {
  active: boolean; sessions: SessionInfo[]; onOpenSession?: (session: SessionInfo) => void;
}) => {
  const village = useMemo(createVillage, []);
  const [world] = useState(() => createLiveWorld(sceneryObstacles(village)));
  const [focus, setFocus] = useState<Focus>({ inspected: null, selected: null });
  const [reset, setReset] = useState(0);
  // O personagem pode sair de baixo do cursor enquanto anda: o painel segura o
  // ultimo agente inspecionado por um instante em vez de sumir na hora.
  const linger = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const handlers = useMemo<FocusHandlers>(() => ({
    inspect: (id) => {
      clearTimeout(linger.current);
      if (id) setFocus((current) => current.inspected === id ? current : { ...current, inspected: id });
      else linger.current = setTimeout(() => setFocus((current) => ({ ...current, inspected: null })), 2500);
    },
    select: (id) => { clearTimeout(linger.current); setFocus((current) => ({ inspected: id ? null : current.inspected, selected: id })); },
  }), []);
  useEffect(() => () => clearTimeout(linger.current), []);
  const overview = useCallback(() => { setFocus((current) => ({ ...current, selected: null })); setReset((count) => count + 1); }, []);
  useEffect(() => {
    if (!focus.selected) return;
    const onKey = (event: KeyboardEvent) => { if (event.key === 'Escape') overview(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [focus.selected, overview]);
  // Um agente que saiu da cena nao pode continuar selecionado.
  useEffect(() => {
    if (focus.selected && !sessions.some((session) => session.sessionId === focus.selected)) overview();
  }, [sessions, focus.selected, overview]);
  const shown = focus.inspected ?? focus.selected;
  return <div className="orbit-astra" aria-label="Cenário dos agentes">
    <SceneErrorBoundary>
      <WorldScene active={active} sessions={sessions} village={village} world={world}
        focus={handlers} selected={focus.selected} reset={reset} />
    </SceneErrorBoundary>
    <AgentPanel world={world} id={shown} pinned={!!focus.selected && shown === focus.selected}
      onClose={overview} onOverview={overview} onOpenSession={onOpenSession} />
  </div>;
};

export default AstraWorkspace;
