import { useEffect, useState } from 'react';
import './UpdateControl.css';

export default function UpdateControl({ compact = false }: { compact?: boolean }) {
  const [state, setState] = useState<OrbitUpdateState | null>(null);
  useEffect(() => {
    const api = window.dashboardAPI;
    if (!api?.getUpdateState || !api.onUpdateState) return;
    let active = true;
    const unsubscribe = api.onUpdateState((next) => { if (active) setState(next); });
    api.getUpdateState().then((next) => { if (active) setState(next); }).catch(() => {});
    return () => { active = false; unsubscribe(); };
  }, []);
  if (!state) return null;
  if (compact && ['idle', 'checking', 'current'].includes(state.phase)) return null;
  const busy = ['checking', 'downloading', 'installing'].includes(state.phase);
  const label = state.phase === 'available' ? `Baixar atualização ${state.version}`
    : state.phase === 'downloading' ? `Baixando… ${state.progress ?? 0}%`
    : state.phase === 'ready' ? (state.installMode === 'restart' ? 'Reiniciar e instalar' : state.installMode === 'file' ? 'Mostrar arquivo baixado' : 'Abrir instalador')
    : state.phase === 'installing' ? 'Preparando instalação…'
    : state.phase === 'checking' ? 'Verificando…'
    : state.phase === 'error' ? 'Tentar atualização novamente' : 'Verificar atualizações';
  const run = async () => {
    const api = window.dashboardAPI;
    if (!api) return;
    try {
      const next = state.phase === 'available' ? await api.downloadUpdate()
        : state.phase === 'ready' ? await api.installUpdate() : await api.checkForUpdates();
      setState(next);
    } catch {
      setState({ ...state, phase: 'error', message: 'Não foi possível verificar a atualização. Tente novamente.' });
    }
  };
  return <div className={`orbit-update${compact ? ' orbit-update-compact' : ''}`}>
    <button type="button" disabled={busy} onClick={run} title={state.message}>{label}</button>
    {!compact && <span role="status">{state.message || (state.phase === 'current' ? 'Você está na versão mais recente.' : '')}</span>}
  </div>;
}
