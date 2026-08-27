import { useCallback, useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { IonContent, IonFab, IonFabButton, IonPage } from '@ionic/react';
import { Plus, Skull, ExternalLink } from 'lucide-react';
import SessionTree from '../components/SessionTree';
import { llmLogoFor } from '../utils/llmLogos';
import TerminalPanel from '../components/TerminalPanel';
import NewAgentDialog from '../components/NewAgentDialog';
import ConfirmDialog from '../components/ConfirmDialog';
import ContextMenu, { ContextMenuItem } from '../components/ContextMenu';
import TitleBar from '../components/TitleBar';
import { SessionInfo, StepEvent, connectStepStream, fetchState, startAgent, stopAgent, killSession } from '../api';
import './Home.css';

const MAX_BUFFER_STEPS = 300;
const BASE_Z = 1000;
const OPEN_IDS_STORAGE_KEY = 'dashboard.openPanelIds';

export default function Home() {
  const [sessions, setSessions] = useState<SessionInfo[]>([]);
  const [openIds, setOpenIds] = useState<string[]>([]);
  const [minimizedIds, setMinimizedIds] = useState<Set<string>>(new Set());
  const [zIndexById, setZIndexById] = useState<Record<string, number>>({});
  const [replayVersion, setReplayVersion] = useState(0);
  const [showNewAgent, setShowNewAgent] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [contextMenu, setContextMenu] = useState<{ session: SessionInfo; x: number; y: number } | null>(null);
  const [confirmKill, setConfirmKill] = useState<SessionInfo | null>(null);

  const buffersRef = useRef<Map<string, StepEvent[]>>(new Map());
  const sessionCacheRef = useRef<Map<string, SessionInfo>>(new Map());
  const pendingOpenAgentId = useRef<string | null>(null);
  // agentes que o usuario ja fechou explicitamente (nao reabre sozinho de
  // novo so por estarem vivos) — em memoria mesmo, nao precisa sobreviver a
  // um crash: o pior caso e reabrir um painel fechado, nao perder um aberto.
  const dismissedAppAgentIdsRef = useRef<Set<string>>(new Set());
  const openIdsRef = useRef<string[]>([]);
  const topZRef = useRef(BASE_Z);
  const restoredRef = useRef(false);

  useEffect(() => {
    openIdsRef.current = openIds;
    try {
      localStorage.setItem(OPEN_IDS_STORAGE_KEY, JSON.stringify(openIds));
    } catch {
      /* localStorage indisponível (privado/bloqueado) — sem persistência, sem problema */
    }
  }, [openIds]);

  const refresh = useCallback(async () => {
    try {
      const data = await fetchState();
      setSessions(data.sessions);
      data.sessions.forEach((s) => sessionCacheRef.current.set(s.sessionId, s));

      // reabre os paineis que estavam abertos antes de um reload da pagina
      if (!restoredRef.current) {
        restoredRef.current = true;
        try {
          const savedIds: string[] = JSON.parse(localStorage.getItem(OPEN_IDS_STORAGE_KEY) || '[]');
          savedIds.forEach((id) => {
            const s = data.sessions.find((x) => x.sessionId === id);
            if (s && s.alive) openPanel(s);
          });
        } catch {
          /* nada salvo ou dado invalido — segue sem restaurar */
        }
      }

      if (pendingOpenAgentId.current) {
        const s = data.sessions.find((x) => x.appAgentId === pendingOpenAgentId.current);
        if (s) {
          pendingOpenAgentId.current = null;
          openPanel(s);
        }
      }

      // agente do proprio app (iniciado por aqui) SEMPRE aparece com painel
      // aberto enquanto estiver vivo — nao depende do localStorage ter sido
      // gravado a tempo (ex: um crash logo depois de iniciar o agente nao
      // pode fazer ele "sumir" da tela, mesmo que o processo real continue
      // rodando no backend).
      data.sessions.forEach((s) => {
        if (
          s.appManaged &&
          s.alive &&
          !openIdsRef.current.includes(s.sessionId) &&
          !dismissedAppAgentIdsRef.current.has(s.sessionId)
        ) {
          openPanel(s);
        }
      });

      // fecha sozinho paineis cuja sessao morreu/sumiu
      setOpenIds((cur) => cur.filter((id) => {
        const fresh = data.sessions.find((s) => s.sessionId === id);
        return fresh && fresh.alive;
      }));
      // eslint-disable-next-line react-hooks/exhaustive-deps
    } catch {
      setSessions([]);
    }
  }, []);

  useEffect(() => {
    refresh();
    const id = setInterval(refresh, 2000);
    return () => clearInterval(id);
  }, [refresh]);

  useEffect(() => {
    const disconnect = connectStepStream((step) => {
      if (!step.sessionId) return;
      let buf = buffersRef.current.get(step.sessionId);
      if (!buf) {
        buf = [];
        buffersRef.current.set(step.sessionId, buf);
      }
      buf.push(step);
      if (buf.length > MAX_BUFFER_STEPS) buf.splice(0, buf.length - MAX_BUFFER_STEPS);

      if (!step.backlog && openIdsRef.current.includes(step.sessionId)) {
        setReplayVersion((v) => v + 1);
      }
    });
    return disconnect;
  }, []);

  const busy = sessions.filter((s) => s.alive && s.status === 'busy').length;
  const idle = sessions.filter((s) => s.alive && s.status !== 'busy').length;
  const dead = sessions.filter((s) => !s.alive).length;

  const bringToFront = (id: string) => {
    topZRef.current += 1;
    setZIndexById((cur) => ({ ...cur, [id]: topZRef.current }));
  };

  const openPanel = (s: SessionInfo) => {
    sessionCacheRef.current.set(s.sessionId, s);
    setOpenIds((cur) => (cur.includes(s.sessionId) ? cur : [...cur, s.sessionId]));
    setMinimizedIds((cur) => {
      if (!cur.has(s.sessionId)) return cur;
      const next = new Set(cur);
      next.delete(s.sessionId);
      return next;
    });
    bringToFront(s.sessionId);
  };

  const closePanel = (id: string) => {
    setOpenIds((cur) => cur.filter((x) => x !== id));
    setMinimizedIds((cur) => {
      if (!cur.has(id)) return cur;
      const next = new Set(cur);
      next.delete(id);
      return next;
    });
  };

  const minimizePanel = (id: string) => {
    setMinimizedIds((cur) => new Set(cur).add(id));
  };

  const restorePanel = (id: string) => {
    setMinimizedIds((cur) => {
      const next = new Set(cur);
      next.delete(id);
      return next;
    });
    bringToFront(id);
  };

  // estimativa grosseira de rows/cols do painel padrão (ainda nao montado nesse
  // momento) pra o PTY ja nascer com o tamanho certo — evita que o `claude
  // --resume` despeje o historico assumindo um terminal pequeno demais antes do
  // primeiro resize via WS chegar.
  const estimatePtySize = () => {
    const w = Math.min(920, window.innerWidth * 0.92) - 16;
    const h = Math.min(619, window.innerHeight * 0.78) - 38 - 16;
    return {
      cols: Math.max(80, Math.floor(w / 7.8)),
      rows: Math.max(24, Math.floor(h / 16.3)),
    };
  };

  const handleNewAgent = async (cwd: string, name: string, llm: string) => {
    const res = await startAgent(cwd || '~', name || undefined, { ...estimatePtySize(), llm });
    if ('error' in res) {
      setErrorMsg(res.error);
      return;
    }
    pendingOpenAgentId.current = res.id;
    await refresh();
  };

  const handleCardContextMenu = (session: SessionInfo, x: number, y: number) => {
    setContextMenu({ session, x, y });
  };

  const buildContextMenuItems = (session: SessionInfo): ContextMenuItem[] => {
    const items: ContextMenuItem[] = [];
    // matar processo é sempre a PRIMEIRA opção, quando disponível — subagentes
    // (isSubagent) não têm processo próprio pra matar (rodam dentro da sessão
    // orquestradora), então não oferece essa opção pra eles.
    if (!session.isSubagent && session.alive) {
      items.push({
        label: 'Encerrar agente e processo',
        icon: <Skull size={14} />,
        danger: true,
        onClick: () => setConfirmKill(session),
      });
    }
    items.push({
      label: 'Abrir',
      icon: <ExternalLink size={14} />,
      onClick: () => openPanel(session),
    });
    return items;
  };

  const doKillSession = async (session: SessionInfo) => {
    setConfirmKill(null);
    if (session.appManaged && session.appAgentId) {
      await stopAgent(session.appAgentId);
    } else {
      await killSession(session.pid);
    }
    closePanel(session.sessionId);
    await refresh();
  };

  const minimizedPanels = [...openIds]
    .filter((id) => minimizedIds.has(id))
    .map((id) => sessionCacheRef.current.get(id))
    .filter((s): s is SessionInfo => !!s);

  return (
    <IonPage>
      <TitleBar
        stats={
          <div className="stats-bar">
            <span className="stat"><span className="dot busy" />{busy} busy</span>
            <span className="stat"><span className="dot idle" />{idle} idle</span>
            <span className="stat"><span className="dot dead" />{dead} dead</span>
            <span className="stats-title">sessões do Claude Code nesta máquina</span>
          </div>
        }
      />

      <IonContent className="home-content">
        {sessions.length === 0 ? (
          <div className="empty-state">
            Nenhuma sessão encontrada.
            <br />
            Toque em + para iniciar um agente.
          </div>
        ) : (
          <SessionTree
            sessions={[...sessions].sort((a, b) => a.startedAt - b.startedAt)}
            onOpen={openPanel}
            onContextMenu={handleCardContextMenu}
          />
        )}

        <IonFab vertical="bottom" horizontal="end" slot="fixed">
          <IonFabButton onClick={() => setShowNewAgent(true)}>
            <Plus size={22} />
          </IonFabButton>
        </IonFab>
      </IonContent>

      {createPortal(
        <>
          {/* diálogos precisam estar aqui fora do IonContent — IonContent cria seu
              próprio contexto de empilhamento (shadow DOM/transform do Ionic), então
              nenhum z-index dentro dele consegue ficar acima de algo fora dele, tipo
              os painéis de terminal (que já usam esse mesmo portal) */}
          <NewAgentDialog
            open={showNewAgent}
            onClose={() => setShowNewAgent(false)}
            onSubmit={(cwd, name, llm) => {
              setShowNewAgent(false);
              handleNewAgent(cwd, name, llm);
            }}
          />

          <ConfirmDialog
            open={!!errorMsg}
            title="Não foi possível iniciar o agente"
            message={errorMsg || ''}
            singleButton
            confirmText="OK"
            onConfirm={() => setErrorMsg(null)}
            onCancel={() => setErrorMsg(null)}
          />

          {contextMenu && (
            <ContextMenu
              x={contextMenu.x}
              y={contextMenu.y}
              items={buildContextMenuItems(contextMenu.session)}
              onClose={() => setContextMenu(null)}
            />
          )}

          <ConfirmDialog
            open={!!confirmKill}
            title="Encerrar agente e processo"
            message={`Isso mata de verdade o processo de "${confirmKill?.name || confirmKill?.sessionId.slice(0, 8)}" (pid ${confirmKill?.pid}). Se for um terminal real que você tem aberto em outro lugar, ele vai fechar. Essa ação não pode ser desfeita.`}
            danger
            confirmText="Encerrar"
            onConfirm={() => confirmKill && doKillSession(confirmKill)}
            onCancel={() => setConfirmKill(null)}
          />

          {openIds.map((id) => {
            const session = sessionCacheRef.current.get(id);
            if (!session) return null;
            const isMinimized = minimizedIds.has(id);
            // copia nova a cada render: o buffer e mutado no lugar (push), entao
            // passar a MESMA referencia faria o useMemo do TranscriptView nunca
            // perceber que chegou conteudo novo (dependencia [steps] olha so a
            // referencia do array, nao o conteudo)
            const steps = session.appManaged ? [] : [...(buffersRef.current.get(id) || [])];
            return (
              <TerminalPanel
                key={id}
                session={session}
                allSessions={sessions}
                replaySteps={steps}
                minimized={isMinimized}
                zIndex={zIndexById[id] ?? BASE_Z}
                onClose={() => {
                  dismissedAppAgentIdsRef.current.add(id);
                  closePanel(id);
                }}
                onMinimize={() => minimizePanel(id)}
                onFocus={() => bringToFront(id)}
              />
            );
          })}

          {minimizedPanels.length > 0 && (
            <div className="term-dock">
              {minimizedPanels.map((s) => {
                const Logo = llmLogoFor(s.llm || 'claude');
                return (
                  <button key={s.sessionId} className="term-dock-chip" onClick={() => restorePanel(s.sessionId)}>
                    <Logo size={13} />
                    <span>{s.name || s.sessionId.slice(0, 8)}</span>
                  </button>
                );
              })}
            </div>
          )}
        </>,
        document.body
      )}
    </IonPage>
  );
}
