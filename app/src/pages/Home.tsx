import { terminalDropPlacement, type TerminalPlacement } from '../utils/terminalPlacement';
import { useCallback, useEffect, useRef, useState } from 'react';
import { IonContent, IonPage } from '@ionic/react';
import { Plus, Skull, ArrowSquareOut, ArrowCounterClockwise, X, PushPinSlash } from '@phosphor-icons/react';
import SessionTree from '../components/SessionTree';
import LlmUsageWidget from '../components/LlmUsageWidget';
import { llmLogoFor } from '../utils/llmLogos';
import TerminalPanel from '../components/TerminalPanel';
import NewAgentDialog from '../components/NewAgentDialog';
import ConfirmDialog from '../components/ConfirmDialog';
import ContextMenu, { ContextMenuItem } from '../components/ContextMenu';
import AppShell from '../components/AppShell';
import {
  SessionInfo,
  StepEvent,
  connectStepStream,
  fetchState,
  startAgent,
  stopAgent,
  killSession,
  stopResource,
  stopDockerResource,
} from '../api';
import './Home.css';

const MAX_BUFFER_STEPS = 300;
// O rail fixado usa z-index 1200; janelas flutuantes começam acima dele e
// continuam subindo quando recebem foco.
const BASE_Z = 2000;
const OPEN_IDS_STORAGE_KEY = 'dashboard.openPanelIds';
const TERMINAL_DOCKED_STORAGE_KEY = 'dashboard.terminalDocked';
const TERMINAL_DOCKED_WIDTH_STORAGE_KEY = 'dashboard.terminalDockedWidth';
const DOCKED_IDS_STORAGE_KEY = 'dashboard.dockedPanelIds';

function revealDockedTab(tab: HTMLButtonElement | null) {
  tab?.scrollIntoView({
    block: 'nearest',
    inline: 'nearest',
    behavior: window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth',
  });
}

export default function Home() {
  const [sessions, setSessions] = useState<SessionInfo[]>([]);
  const [openIds, setOpenIds] = useState<string[]>([]);
  const [minimizedIds, setMinimizedIds] = useState<Set<string>>(new Set());
  // sessoes cujo terminal esta mostrando AGORA um prompt interativo esperando
  // o usuario (permissao, escolha de modelo, etc — ver onNeedsAction em
  // TerminalPanel.tsx) — usado so pra acender o indicador no chip da dock
  // quando o painel correspondente esta minimizado.
  const [needsActionIds, setNeedsActionIds] = useState<Set<string>>(new Set());
  const [zIndexById, setZIndexById] = useState<Record<string, number>>({});
  const [dockedIds, setDockedIds] = useState<Set<string>>(() => {
    try {
      const saved = localStorage.getItem(DOCKED_IDS_STORAGE_KEY);
      return new Set(JSON.parse(saved ?? (localStorage.getItem(TERMINAL_DOCKED_STORAGE_KEY) === 'true'
        ? localStorage.getItem(OPEN_IDS_STORAGE_KEY) || '[]' : '[]')));
    } catch { return new Set(); }
  });
  const dockedIdsRef = useRef(dockedIds);
  dockedIdsRef.current = dockedIds;
  const terminalDocked = dockedIds.size > 0;
  const [dropPlacement, setDropPlacement] = useState<TerminalPlacement>('floating');
  const [tabInsertion, setTabInsertion] = useState<{ x: number; y: number; height: number } | null>(null);
  const [dragPreview, setDragPreview] = useState<{ id: string; x: number; y: number } | null>(null);
  useEffect(() => {
    document.body.classList.toggle('orbit-terminal-dragging', dragPreview !== null);
    return () => document.body.classList.remove('orbit-terminal-dragging');
  }, [dragPreview]);
  const [floatingPositions, setFloatingPositions] = useState<Record<string, { x: number; y: number }>>({});
  const suppressTerminalClickRef = useRef(false);
  const tabDragCleanupRef = useRef<(() => void) | null>(null);
  useEffect(() => () => tabDragCleanupRef.current?.(), []);
  useEffect(() => {
    localStorage.setItem(DOCKED_IDS_STORAGE_KEY, JSON.stringify([...dockedIds]));
  }, [dockedIds]);
  const [terminalDropTargetId, setTerminalDropTargetId] = useState<string | null>(null);
  const [activeDockedId, setActiveDockedId] = useState<string | null>(null);
  const [terminalDockedWidth, setTerminalDockedWidth] = useState(() => {
    const saved = Number(localStorage.getItem(TERMINAL_DOCKED_WIDTH_STORAGE_KEY));
    return Number.isFinite(saved) && saved >= 360 ? saved : Math.round(window.innerWidth * 0.42);
  });
  const [replayVersion, setReplayVersion] = useState(0);
  const [showNewAgent, setShowNewAgent] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [contextMenu, setContextMenu] = useState<{ session: SessionInfo; x: number; y: number } | null>(null);
  const [confirmKill, setConfirmKill] = useState<SessionInfo | null>(null);
  const [confirmKillResource, setConfirmKillResource] = useState<SessionInfo | null>(null);

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
  const activeDockedTabRef = useRef<HTMLButtonElement | null>(null);

  useEffect(() => {
    if (!terminalDocked) return;
    const frame = requestAnimationFrame(() => revealDockedTab(activeDockedTabRef.current));
    return () => cancelAnimationFrame(frame);
  }, [activeDockedId, terminalDocked, terminalDockedWidth, openIds, minimizedIds]);

  useEffect(() => {
    openIdsRef.current = openIds;
    try {
      localStorage.setItem(OPEN_IDS_STORAGE_KEY, JSON.stringify(openIds));
    } catch {
      /* localStorage indisponível (privado/bloqueado) — sem persistência, sem problema */
    }
  }, [openIds]);

  useEffect(() => {
    localStorage.setItem(TERMINAL_DOCKED_STORAGE_KEY, String(terminalDocked));
    const hasVisibleTerminal = openIds.some((id) => dockedIds.has(id) && !minimizedIds.has(id));
    const maxWidth = Math.max(360, Math.min(720, window.innerWidth - 320));
    const effectiveWidth = Math.max(360, Math.min(maxWidth, terminalDockedWidth));
    const previewingDock = dragPreview !== null && dropPlacement === 'docked';
    document.documentElement.style.setProperty(
      '--orbit-terminal-rail-w', terminalDocked && hasVisibleTerminal || previewingDock ? `${effectiveWidth}px` : '0px'
    );
    return () => document.documentElement.style.setProperty('--orbit-terminal-rail-w', '0px');
  }, [terminalDocked, terminalDockedWidth, openIds, minimizedIds, dockedIds, dragPreview, dropPlacement]);

  useEffect(() => {
    localStorage.setItem(TERMINAL_DOCKED_WIDTH_STORAGE_KEY, String(terminalDockedWidth));
  }, [terminalDockedWidth]);

  const beginDockedResize = (event: React.PointerEvent<HTMLDivElement>) => {
    event.preventDefault();
    const startX = event.clientX;
    const startWidth = terminalDockedWidth;
    document.body.classList.add('orbit-terminal-resizing');
    const onMove = (moveEvent: PointerEvent) => {
      const maxWidth = Math.max(360, Math.min(720, window.innerWidth - 320));
      setTerminalDockedWidth(Math.max(360, Math.min(maxWidth, startWidth + startX - moveEvent.clientX)));
    };
    const onUp = () => {
      document.body.classList.remove('orbit-terminal-resizing');
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp);
    };
    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp);
  };

  const reorderTabAtPoint = (id: string, placement: TerminalPlacement, clientX: number) => {
    const selector = placement === 'minimized' ? '[data-terminal-tab="minimized"]' : '[data-terminal-tab="docked"]';
    const tabs = [...document.querySelectorAll<HTMLElement>(selector)].filter((tab) => tab.dataset.sessionId !== id);
    if (tabs.length === 0) return;
    const target = tabs.find((tab) => clientX < tab.getBoundingClientRect().left + tab.getBoundingClientRect().width / 2);
    const targetId = target?.dataset.sessionId;
    setOpenIds((current) => {
      const without = current.filter((entry) => entry !== id);
      const groupIds = current.filter((entry) => tabs.some((tab) => tab.dataset.sessionId === entry && entry !== id));
      const orderedGroup = targetId ? (() => {
        const index = groupIds.indexOf(targetId);
        const next = [...groupIds];
        next.splice(index < 0 ? next.length : index, 0, id);
        return next;
      })() : [...groupIds, id];
      const groupSet = new Set([...groupIds, id]);
      const next: string[] = [];
      let inserted = false;
      without.forEach((entry) => {
        if (groupSet.has(entry)) {
          if (!inserted) { next.push(...orderedGroup); inserted = true; }
        } else next.push(entry);
      });
      if (!inserted) next.push(...orderedGroup);
      return next;
    });
  };

  const handleTerminalDrag = (id: string, dragging: boolean, clientX: number, clientY: number) => {
    const titlebarHeight = Number.parseFloat(
      getComputedStyle(document.documentElement).getPropertyValue('--orbit-titlebar-h')
    ) || 38;
    const effectiveDockedWidth = Math.max(360, Math.min(720, terminalDockedWidth, window.innerWidth - 320));
    const placement = terminalDropPlacement(
      clientX,
      clientY,
      window.innerWidth,
      titlebarHeight,
      effectiveDockedWidth,
    );
    const sourceWasFloating = !dockedIds.has(id) && !minimizedIds.has(id);
    setTerminalDropTargetId(dragging ? id : null);
    setDropPlacement(placement);
    if (dragging) {
      // O painel continua "na mão" seguindo o cursor. A zona de destino e o
      // dropzone mostram a transformação prevista sem mover o terminal antes
      // do soltamento.
      setDragPreview({ id, x: clientX, y: clientY });
      return;
    }
    setDragPreview(null);
    if (clientX < 0) return;
    if (placement === 'docked' || placement === 'minimized') reorderTabAtPoint(id, placement, clientX);
    setDockedIds((current) => {
      const next = new Set(current);
      if (placement === 'docked') next.add(id);
      else next.delete(id);
      return next;
    });
    setMinimizedIds((current) => {
      const next = new Set(current);
      if (placement === 'minimized') next.add(id);
      else next.delete(id);
      return next;
    });
    if (placement === 'docked') setActiveDockedId(id);
    if (placement === 'floating') {
      bringToFront(id);
      if (!sourceWasFloating) setFloatingPositions((current) => ({ ...current, [id]: {
        x: Math.max(0, Math.min(window.innerWidth - 320, clientX - 150)),
        y: Math.max(titlebarHeight + 48, Math.min(window.innerHeight - 80, clientY - 16)),
      } }));
    }
  };

  const beginTabDrag = (event: React.PointerEvent<HTMLButtonElement>, id: string) => {
    if (event.button !== 0 || (event.target as HTMLElement).closest('.term-pinned-tab-close')) return;
    tabDragCleanupRef.current?.();
    suppressTerminalClickRef.current = false;
    const startX = event.clientX;
    const startY = event.clientY;
    const button = event.currentTarget;
    const sourcePlacement = button.dataset.terminalTab as 'minimized' | 'docked';
    const sourceStrip = sourcePlacement === 'minimized'
      ? button.closest<HTMLElement>('.term-dock')
      : button.closest<HTMLElement>('.term-pinned-tabs-scroll');
    button.setPointerCapture(event.pointerId);
    let moved = false;
    let globalDragActive = false;
    const isInsideSourceStrip = (x: number, y: number) => {
      if (!sourceStrip) return false;
      const rect = sourceStrip.getBoundingClientRect();
      return x >= rect.left && x <= rect.right && y >= rect.top && y <= rect.bottom;
    };
    const move = (e: PointerEvent) => {
      if (Math.hypot(e.clientX - startX, e.clientY - startY) < 6 && !moved) return;
      moved = true;
      if (isInsideSourceStrip(e.clientX, e.clientY)) {
        if (globalDragActive) {
          handleTerminalDrag(id, false, -1, -1);
          globalDragActive = false;
        }
        setDropPlacement(sourcePlacement);
        setDragPreview({ id, x: e.clientX, y: e.clientY });
        const tabs = [...sourceStrip!.querySelectorAll<HTMLElement>('[data-terminal-tab]')]
          .filter((tab) => tab.dataset.sessionId !== id);
        const target = tabs.find((tab) => {
          const rect = tab.getBoundingClientRect();
          return e.clientX < rect.left + rect.width / 2;
        });
        const rect = (target || tabs.at(-1) || button).getBoundingClientRect();
        setTabInsertion({ x: target ? rect.left : rect.right, y: rect.top, height: rect.height });
        return;
      }
      setTabInsertion(null);
      globalDragActive = true;
      handleTerminalDrag(id, true, e.clientX, e.clientY);
    };
    const cleanup = () => {
      setTabInsertion(null);
      setDragPreview(null);
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', up);
      window.removeEventListener('pointercancel', cancel);
    };
    const up = (e: PointerEvent) => {
      suppressTerminalClickRef.current = moved;
      if (moved && isInsideSourceStrip(e.clientX, e.clientY)) {
        if (globalDragActive) handleTerminalDrag(id, false, -1, -1);
        reorderTabAtPoint(id, sourcePlacement, e.clientX);
      } else if (moved && globalDragActive) {
        handleTerminalDrag(id, false, e.clientX, e.clientY);
      }
      cleanup();
    };
    const cancel = () => { handleTerminalDrag(id, false, -1, -1); cleanup(); };
    tabDragCleanupRef.current = cleanup;
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up);
    window.addEventListener('pointercancel', cancel);
  };

  useEffect(() => {
    if (!terminalDocked) return;
    const visible = openIds.filter((id) => dockedIds.has(id) && !minimizedIds.has(id));
    if (!activeDockedId || !visible.includes(activeDockedId)) {
      setActiveDockedId(visible.at(-1) || null);
    }
  }, [terminalDocked, openIds, minimizedIds, activeDockedId, dockedIds]);

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
    if (dockedIdsRef.current.has(s.sessionId)) setActiveDockedId(s.sessionId);
  };

  const closePanel = (id: string) => {
    setDockedIds((cur) => { const next = new Set(cur); next.delete(id); return next; });
    setOpenIds((cur) => cur.filter((x) => x !== id));
    setMinimizedIds((cur) => {
      if (!cur.has(id)) return cur;
      const next = new Set(cur);
      next.delete(id);
      return next;
    });
    setNeedsActionIds((cur) => {
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
    if (dockedIdsRef.current.has(id)) setActiveDockedId(id);
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

  const handleResumeSession = async (session: SessionInfo) => {
    // O Orbit abre um novo PTY para a conversa encerrada. O terminal original
    // nao existe mais, mas a CLI recebe o mesmo ID e diretorio para retomar o
    // historico onde ele parou.
    const llm = session.llm === 'codex' ? 'codex' : 'claude';
    const res = await startAgent(session.cwd || '~', session.name || undefined, {
      ...estimatePtySize(),
      llm,
      resumeSessionId: session.sessionId,
    });
    if ('error' in res) {
      setErrorMsg(res.error);
      return;
    }
    dismissedAppAgentIdsRef.current.delete(session.sessionId);
    pendingOpenAgentId.current = res.id;
    await refresh();
  };

  const handleCardContextMenu = (session: SessionInfo, x: number, y: number) => {
    setContextMenu({ session, x, y });
  };

  const buildContextMenuItems = (session: SessionInfo): ContextMenuItem[] => {
    const items: ContextMenuItem[] = [];
    // grupo Docker (um projeto compose) é só organização visual — não é um
    // processo de verdade, não tem o que "parar" nele (o usuário para
    // container por container, nunca o stack inteiro por aqui).
    if (session.isResourceGroup) {
      return items;
    }
    // recurso listado é sempre vivo e nunca tem painel proprio pra abrir —
    // so oferece "parar", nada de "Abrir".
    if (session.isResource) {
      items.push({
        label: 'Parar este processo',
        icon: <Skull size={14} />,
        danger: true,
        onClick: () => setConfirmKillResource(session),
      });
      return items;
    }
    // matar processo é sempre a PRIMEIRA opção, quando disponível — subagentes
    // (isSubagent) não têm processo próprio pra matar (rodam dentro da sessão
    // orquestradora), então não oferece essa opção pra eles.
    // So Claude e Codex possuem um comando de retomada com ID de sessao que
    // o backend conhece. Sessoes externas encerradas continuam legiveis, e
    // este comando devolve a conversa a um terminal interativo do Orbit.
    if (!session.alive && !session.appManaged && (session.llm === 'codex' || !session.llm || session.llm === 'claude')) {
      items.push({
        label: 'Retomar sessão',
        icon: <ArrowCounterClockwise size={14} />,
        onClick: () => handleResumeSession(session),
      });
    }
    items.push({
      label: 'Abrir',
      icon: <ArrowSquareOut size={14} />,
      onClick: () => openPanel(session),
    });
    // destrutiva por ultimo, separada das demais (convencao de menus)
    if (!session.isSubagent && session.alive) {
      items.push({
        label: 'Encerrar agente e processo',
        icon: <Skull size={14} />,
        danger: true,
        separator: true,
        onClick: () => setConfirmKill(session),
      });
    }
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

  const doKillResource = async (session: SessionInfo) => {
    setConfirmKillResource(null);
    if (session.resourceControl === 'docker' && session.resourceContainerId) {
      await stopDockerResource(session.resourceContainerId, session.parentSessionId || '');
    } else {
      await stopResource(session.resourcePid || 0, session.resourceFingerprint || '', session.parentSessionId || '');
    }
    await refresh();
  };

  // a faixa dos minimizados so existe (e so reserva altura no layout — ver
  // --orbit-term-dock-h em AppShell.css/.orbit-content) quando ha algum
  // agente minimizado; sem nenhum, o conteudo sobe e ocupa o espaco.
  const hasMinimized = [...openIds].some((id) => minimizedIds.has(id));
  const previewingMinimized = dragPreview !== null && dropPlacement === 'minimized';
  useEffect(() => {
    document.documentElement.style.setProperty('--orbit-term-dock-h', hasMinimized || previewingMinimized ? '40px' : '0px');
    return () => {
      document.documentElement.style.removeProperty('--orbit-term-dock-h');
    };
  }, [hasMinimized, previewingMinimized]);

  const minimizedPanels = [...openIds]
    .filter((id) => minimizedIds.has(id))
    .map((id) => sessionCacheRef.current.get(id))
    .filter((s): s is SessionInfo => !!s);
  const dockedPanels = openIds
    .filter((id) => dockedIds.has(id) && !minimizedIds.has(id))
    .map((id) => sessionCacheRef.current.get(id))
    .filter((s): s is SessionInfo => !!s);

  return (
    <IonPage className="home-page">
      <AppShell sessions={sessions} onOpenSession={openPanel}>
        <IonContent className="home-content">
          <div className="home-usage-header">
            <LlmUsageWidget sessions={sessions} />
          </div>
          <SessionTree
            sessions={[...sessions].sort((a, b) => a.startedAt - b.startedAt)}
            onOpen={openPanel}
            onContextMenu={handleCardContextMenu}
          />

          {/* slot="fixed" do IonContent: fica ancorado no canto sem rolar
              junto com o canvas. Botao proprio (nao IonFab): pilula com
              label, cor de destaque do tema e mesmo vidro/raio do resto. */}
          <button
            className="home-new-agent-btn"
            slot="fixed"
            type="button"
            onClick={() => setShowNewAgent(true)}
            aria-label="Novo agente"
          >
            <span className="home-new-agent-icon">
              <Plus size={18} weight="bold" />
            </span>
            <span className="home-new-agent-label">Novo agente</span>
          </button>
        </IonContent>
      </AppShell>

      {/* Mantido dentro do IonPage para compartilhar a mesma ordem de
          camadas da sidebar, dos terminais e do restante do AppShell. */}
      <div className={`term-dock${minimizedPanels.length > 0 ? ' is-open' : ''}`}>
        {(
          minimizedPanels.map((s) => {
            const Logo = llmLogoFor(s.llm || 'claude');
            const needsAction = needsActionIds.has(s.sessionId);
            const busy = !needsAction && s.alive && s.status === 'busy';
            return (
              <button
                key={s.sessionId}
                className={`term-dock-chip${needsAction ? ' needs-action' : ''}`}
                data-terminal-tab="minimized"
                data-session-id={s.sessionId}
                onPointerDown={(event) => beginTabDrag(event, s.sessionId)}
                onClick={() => { if (!suppressTerminalClickRef.current) restorePanel(s.sessionId); }}
                title={needsAction ? 'Esperando uma resposta sua' : undefined}
              >
                <Logo size={13} />
                <span>{s.name || s.sessionId.slice(0, 8)}</span>
                <span
                  className={`term-dock-status-dot${busy ? ' busy' : ''}${needsAction ? ' needs-action' : ''}`}
                  aria-hidden="true"
                />
              </button>
            );
          })
        )}
      </div>

      <>
          {/* Diálogos ficam fora do IonContent para não herdarem o contexto de
              empilhamento criado pelo shadow DOM/transform do Ionic. */}
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

          <ConfirmDialog
            open={!!confirmKillResource}
            title={confirmKillResource?.resourceControl === 'docker' ? 'Parar container' : 'Parar processo'}
            message={`Isso ${confirmKillResource?.resourceControl === 'docker' ? 'para de verdade o container' : 'mata de verdade o processo'} "${confirmKillResource?.name || confirmKillResource?.sessionId.slice(0, 8)}" (${confirmKillResource?.resourceControl === 'docker' ? `container ${confirmKillResource?.resourceContainerId?.slice(0, 12)}` : `pid ${confirmKillResource?.resourcePid}`}${confirmKillResource?.resourcePorts && confirmKillResource.resourcePorts.length > 0 ? `, porta ${confirmKillResource.resourcePorts[0]}` : ''}) iniciado por esta sessão. Serviços dependentes vão cair. Essa ação não pode ser desfeita.`}
            danger
            confirmText="Parar"
            onConfirm={() => confirmKillResource && doKillResource(confirmKillResource)}
            onCancel={() => setConfirmKillResource(null)}
          />

          {terminalDocked && dockedPanels.length > 0 && (
            <>
              <div className="term-pinned-backdrop" aria-hidden="true" />
              <div className="term-pinned-resize-handle" onPointerDown={beginDockedResize} aria-label="Redimensionar painel de terminais" />
            </>
          )}

          {terminalDocked && dockedPanels.length > 0 && (
            <div className="term-pinned-tabs" role="tablist" aria-label="Terminais fixados">
              <div className="term-pinned-tabs-scroll">
              {dockedPanels.map((s) => {
                const Logo = llmLogoFor(s.llm || 'claude');
                const active = s.sessionId === activeDockedId;
                const needsAction = needsActionIds.has(s.sessionId);
                return (
                  <button
                    key={s.appAgentId || s.sessionId}
                    ref={active ? activeDockedTabRef : undefined}
                    className={`term-pinned-tab${active ? ' active' : ''}${needsAction ? ' needs-action' : ''}`}
                    data-terminal-tab="docked"
                    data-session-id={s.sessionId}
                    role="tab"
                    aria-selected={active}
                    onPointerDown={(event) => beginTabDrag(event, s.sessionId)}
                    onClick={(event) => {
                      if (suppressTerminalClickRef.current) return;
                      setActiveDockedId(s.sessionId);
                      revealDockedTab(event.currentTarget);
                    }}
                    title={s.name || s.sessionId}
                  >
                    <Logo size={13} />
                    <span>{s.name || s.sessionId.slice(0, 8)}</span>
                    <span className={`term-pinned-tab-dot${needsAction ? ' needs-action' : s.status === 'busy' ? ' busy' : ''}`} />
                    <span
                      className="term-pinned-tab-close"
                      role="button"
                      aria-label={`Fechar ${s.name || s.sessionId.slice(0, 8)}`}
                      onClick={(event) => {
                        event.stopPropagation();
                        dismissedAppAgentIdsRef.current.add(s.sessionId);
                        closePanel(s.sessionId);
                      }}
                    >
                      <X size={11} weight="bold" />
                    </span>
                  </button>
                );
              })}
              </div>
              <button
                className="term-pinned-undock"
                onClick={() => setDockedIds(new Set())}
                aria-label="Desafixar terminais"
                title="Desafixar terminais"
              >
                <PushPinSlash size={13} />
              </button>
            </div>
          )}

          {terminalDropTargetId && !(dropPlacement === 'floating' && dragPreview && !dockedIds.has(dragPreview.id) && !minimizedIds.has(dragPreview.id)) && (
            <div
                className={`terminal-dropzone terminal-dropzone-${dropPlacement}`}
              style={dropPlacement === 'docked'
                ? { '--orbit-drop-width': `${Math.max(360, Math.min(720, terminalDockedWidth, window.innerWidth - 320))}px` } as React.CSSProperties
                : dropPlacement === 'minimized'
                  ? { '--orbit-drop-tab-left': `${14 + Math.min(minimizedPanels.length, 5) * 150}px` } as React.CSSProperties
                : dropPlacement === 'floating' && dragPreview
                  ? (() => {
                    const width = Math.max(360, Math.min(920, window.innerWidth - 16));
                    const height = Math.max(220, Math.min(619, window.innerHeight - 54));
                    return {
                      width,
                      height,
                      left: Math.max(8, Math.min(window.innerWidth - width - 8, dragPreview.x - 150)),
                      top: Math.max(38, Math.min(window.innerHeight - height - 8, dragPreview.y - 16)),
                      right: 'auto',
                      bottom: 'auto',
                    };
                  })()
                  : undefined}
              aria-hidden="true"
            >
              <span>{dropPlacement === 'docked'
                ? 'Solte para encaixar à direita'
                : dropPlacement === 'minimized'
                  ? (minimizedPanels.length > 0 ? 'Solte ao lado das abas minimizadas' : 'Solte para minimizar em uma aba')
                  : (() => {
                    const width = Math.max(360, Math.min(920, window.innerWidth - 16));
                    const height = Math.max(220, Math.min(619, window.innerHeight - 54));
                    return `Janela flutuante · ${width} × ${height}px`;
                  })()}</span>
            </div>
          )}

          {tabInsertion && <div className="terminal-tab-insertion" style={{ left: tabInsertion.x, top: tabInsertion.y, height: tabInsertion.height }} aria-hidden="true" />}
          {dragPreview && sessionCacheRef.current.get(dragPreview.id) && (() => {
            const session = sessionCacheRef.current.get(dragPreview.id)!;
            const Logo = llmLogoFor(session.llm || 'claude');
            return (
              <div
                className={`terminal-drag-preview terminal-drag-preview-${dropPlacement}`}
                style={{ left: dragPreview.x + 14, top: dragPreview.y + 14 }}
                aria-hidden="true"
              >
                <Logo size={13} />
                <span>{session.name || session.sessionId.slice(0, 8)}</span>
              </div>
            );
          })()}

          {openIds.map((id) => {
            const session = sessionCacheRef.current.get(id);
            if (!session) return null;
            const isMinimized = minimizedIds.has(id);
            const isDocked = dockedIds.has(id) && !isMinimized;
            // copia nova a cada render: o buffer e mutado no lugar (push), entao
            // passar a MESMA referencia faria o useMemo do TranscriptView nunca
            // perceber que chegou conteudo novo (dependencia [steps] olha so a
            // referencia do array, nao o conteudo)
            const steps = session.appManaged ? [] : [...(buffersRef.current.get(id) || [])];
            return (
              <TerminalPanel
                // um agente do app troca de sessionId (sintetico -> real) uns
                // segundos depois de nascer, sem o agente/processo real ter
                // mudado nada — se a key seguisse o sessionId, o React via
                // isso como um componente NOVO nesse instante (desmontava o
                // painel antigo e montava outro do zero, reconectando o
                // terminal e tocando a animacao de entrada de novo).
                // appAgentId fica igual a vida toda do agente, entao mantem a
                // MESMA instancia do componente durante essa troca.
                key={session.appAgentId || id}
                session={session}
                allSessions={sessions}
                replaySteps={steps}
                minimized={isMinimized}
                zIndex={zIndexById[id] ?? BASE_Z}
                docked={isDocked}
                floatingPosition={floatingPositions[id]}
                dockedActive={id === activeDockedId}
                onDragStateChange={(dragging, clientX, clientY) => handleTerminalDrag(id, dragging, clientX, clientY)}
                onClose={() => {
                  dismissedAppAgentIdsRef.current.add(id);
                  closePanel(id);
                }}
                onMinimize={() => minimizePanel(id)}
                onFocus={() => bringToFront(id)}
                onPopout={() => {
                  window.dashboardAPI?.openSessionWindow?.(session.sessionId);
                  // mesma logica do onClose: sem isso, um agente do PROPRIO
                  // app (appManaged) vivo reabriria sozinho aqui de volta no
                  // proximo refresh() (2s), porque o efeito que reabre
                  // paineis "orfaos" nao sabe que essa sessao passou a viver
                  // numa janela separada.
                  dismissedAppAgentIdsRef.current.add(id);
                  closePanel(id);
                }}
                onNeedsAction={(needs) =>
                  setNeedsActionIds((cur) => {
                    if (needs === cur.has(id)) return cur;
                    const next = new Set(cur);
                    if (needs) next.add(id);
                    else next.delete(id);
                    return next;
                  })
                }
              />
            );
          })}
      </>
    </IonPage>
  );
}
