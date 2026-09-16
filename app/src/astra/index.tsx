import { WorldScene } from './pages/world/components/scene';
import { SceneErrorBoundary } from './pages/world/components/error-boundary';
import type { SessionInfo } from '../api';
import './workspace.css';

const AstraWorkspace = ({ active, sessions, onOpenSession }: {
  active: boolean; sessions: SessionInfo[]; onOpenSession?: (session: SessionInfo) => void;
}) => <div className="orbit-astra" aria-label="Cenário dos agentes">
  <SceneErrorBoundary>
    <WorldScene active={active} sessions={sessions} onOpenSession={onOpenSession} />
  </SceneErrorBoundary>
</div>;

export default AstraWorkspace;
