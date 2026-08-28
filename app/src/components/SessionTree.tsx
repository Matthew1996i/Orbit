import { useEffect, useMemo, useRef, useState } from 'react';
import { IonBadge } from '@ionic/react';
import {
  Puzzle,
  Plus,
  Minus,
  LocateFixed,
  Plug,
  Sparkles,
  Ticket,
  GitBranch,
  Mail,
  HardDrive,
  MessageSquare,
  LayoutGrid,
  Database,
  Globe,
  Calendar,
  Search,
} from 'lucide-react';
import { SessionInfo, CostSummary, SessionCostUsage, fetchCostSummary } from '../api';
import { shortCwd, formatModelEffort } from '../utils/format';
import { llmLogoFor, llmLogoColorFor } from '../utils/llmLogos';
import LlmUsageWidget from './LlmUsageWidget';
import CostUsageFooter, { formatTokens, formatBrl } from './CostUsageFooter';
import { defaultPanelTop } from './TerminalPanel';
import './SessionTree.css';

// topo do titlebar do app, fora do viewport do canvas da arvore (usado pra
// converter a posicao ABSOLUTA em que o painel nasce, calculada em
// defaultPanelTop(), pra coordenada RELATIVA ao viewport do canvas).
const TOPBAR_H = 38;

// relatorio de custo muda bem mais devagar que status de sessao (que ja
// atualiza a cada 2s) — um numero que so cresce aos poucos nao precisa do
// mesmo ritmo, e um poll mais espacado evita trafego extra so pra reler
// transcripts inteiros no backend. Um unico poll aqui alimenta o rodape geral
// E o custo por card, em vez de cada um buscar por conta propria.
const COST_REFRESH_MS = 8000;

function useCostSummary(): { summary: CostSummary | null; connectionError: boolean } {
  const [summary, setSummary] = useState<CostSummary | null>(null);
  // true quando o ciclo de poll MAIS RECENTE falhou — o rodape usa isso pra
  // mostrar um icone de "sem conexao" em vez de continuar exibindo o ultimo
  // numero conhecido como se nada tivesse acontecido (um numero desatualizado
  // exibido com confianca e pior que nenhum numero).
  const [connectionError, setConnectionError] = useState(false);

  useEffect(() => {
    let cancelled = false;
    const load = () => {
      fetchCostSummary()
        .then((response) => {
          if (cancelled) return;
          setSummary(response);
          setConnectionError(false);
        })
        .catch(() => {
          if (!cancelled) setConnectionError(true);
        });
    };
    load();
    const id = setInterval(load, COST_REFRESH_MS);
    return () => {
      cancelled = true;
      clearInterval(id);
    };
  }, []);

  return { summary, connectionError };
}

// mapeia o nome do servidor MCP (ex: "redmine", "google-drive") pra um icone
// generico que representa o TIPO de servico — nao ha como buscar o logo real
// de cada MCP de terceiros, mas um icone semantico ja da o "onde esta
// conectando" de relance sem precisar ler o nome.
const MCP_ICON_RULES: [RegExp, typeof Ticket][] = [
  [/^web search$/i, Search],
  [/redmine|jira|ticket|issue/i, Ticket],
  [/git(hub|lab)?/i, GitBranch],
  [/mail|gmail|outlook/i, Mail],
  [/drive|storage|s3|dropbox/i, HardDrive],
  [/slack|discord|teams|chat/i, MessageSquare],
  [/miro|board|canvas|figma/i, LayoutGrid],
  [/sql|database|postgres|mysql|mongo/i, Database],
  [/chrome|browser|web/i, Globe],
  [/calendar|schedule/i, Calendar],
];

function mcpIconFor(server: string) {
  const match = MCP_ICON_RULES.find(([re]) => re.test(server));
  return match ? match[1] : Plug;
}

const SLOT_WIDTH = 240;
const CARD_WIDTH = 200;
const CARD_HEIGHT = 82;
const LEVEL_HEIGHT = 170;

interface TreeNode {
  session: SessionInfo;
  children: TreeNode[];
  depth: number;
  x: number;
  y: number;
  group: 'app' | 'external';
}

// sessao "fora do app" (nao criada pelo botao "+ novo agente") entra num grupo
// visual separado, com titulo discreto — sao so leitura, nunca controladas por
// aqui, entao ficam claramente distintas das que o proprio app gerencia.
function groupOf(session: SessionInfo): 'app' | 'external' {
  return session.appManaged ? 'app' : 'external';
}

function buildForest(sessions: SessionInfo[]): TreeNode[] {
  const byId = new Map(sessions.map((session) => [session.sessionId, session]));
  const childrenOf = (parentId: string) =>
    sessions.filter((session) => session.parentSessionId === parentId);

  // subagentes herdam o grupo da RAIZ (eles proprios sempre tem appManaged
  // false, mas se o pai foi criado pelo app, visualmente devem contar como
  // "do app" tambem — senao ficariam sozinhos, sem nenhum agrupamento).
  const toNode = (session: SessionInfo, group: 'app' | 'external'): TreeNode => ({
    session,
    children: childrenOf(session.sessionId).map((child) => toNode(child, group)),
    depth: 0,
    x: 0,
    y: 0,
    group,
  });

  const isRoot = (session: SessionInfo) =>
    !session.parentSessionId || !byId.has(session.parentSessionId);

  // um subagente cujo pai ja nao esta mais na lista (terminou, ou era de outra
  // sessao que nao aparece aqui) nao vira card solto no topo — sem o pai pra
  // dar contexto ele so polui a tela; some sozinho quando a heuristica de
  // "vivo" do backend expirar.
  const roots = sessions.filter(
    (session) => isRoot(session) && !session.isSubagent && !session.isMcp && !session.isSkill,
  );
  // sessoes externas (so leitura) sempre a esquerda, agentes do app depois
  // (sort estavel — mantem a ordem por horario dentro de cada grupo)
  roots.sort((a, b) => {
    const ga = groupOf(a);
    const gb = groupOf(b);
    if (ga === gb) return 0;
    return ga === 'external' ? -1 : 1;
  });
  return roots.map((root) => toNode(root, groupOf(root)));
}

/** Layout recursivo: folhas ocupam 1 slot cada, nós internos centralizam sobre os
 * filhos. leafIndex é compartilhado entre todas as raízes para que fiquem lado a
 * lado numa única fileira horizontal. */
function layout(roots: TreeNode[]): { width: number; height: number; maxDepth: number } {
  let leafIndex = 0;
  let maxDepth = 0;

  const place = (node: TreeNode, depth: number) => {
    maxDepth = Math.max(maxDepth, depth);
    node.depth = depth;
    node.y = depth * LEVEL_HEIGHT + CARD_HEIGHT / 2;

    if (node.children.length === 0) {
      node.x = leafIndex * SLOT_WIDTH + SLOT_WIDTH / 2;
      leafIndex += 1;
      return;
    }

    node.children.forEach((child) => place(child, depth + 1));
    const xs = node.children.map((child) => child.x);
    node.x = (Math.min(...xs) + Math.max(...xs)) / 2;
  };

  let prevGroup: 'app' | 'external' | null = null;
  roots.forEach((root) => {
    if (prevGroup !== null && prevGroup !== root.group) {
      // abre um espaco extra entre os dois grupos, pra caber a caixa dashed
      leafIndex += 1;
    }
    prevGroup = root.group;
    place(root, 0);
  });

  return {
    width: Math.max(leafIndex * SLOT_WIDTH, SLOT_WIDTH),
    height: (maxDepth + 1) * LEVEL_HEIGHT,
    maxDepth,
  };
}

function flattenEdges(node: TreeNode): { parent: TreeNode; child: TreeNode }[] {
  return node.children.flatMap((child) => [{ parent: node, child }, ...flattenEdges(child)]);
}

function flattenNodes(node: TreeNode): TreeNode[] {
  return [node, ...node.children.flatMap(flattenNodes)];
}

// custo/consumo TOTAL da execucao de um agente pai — soma a sessao raiz +
// TODOS os descendentes (subagentes), nao so o proprio transcript da raiz.
// Ignora culling de proposito: o total da execucao nao depende do que esta
// visivel na tela no momento.
function rollupCostUsage(
  node: TreeNode,
  perSession: Record<string, SessionCostUsage>,
): SessionCostUsage | undefined {
  let tokensTotal = 0;
  let costUsd = 0;
  let costBrl = 0;
  let any = false;
  flattenNodes(node).forEach((n) => {
    const own = perSession[n.session.sessionId];
    if (!own) return;
    any = true;
    tokensTotal += own.tokensTotal;
    costUsd += own.costUsd;
    costBrl += own.costBrl;
  });
  return any ? { tokensTotal, costUsd, costBrl } : undefined;
}

function statusOf(session: SessionInfo): 'busy' | 'idle' | 'dead' {
  if (!session.alive) return 'dead';
  return session.status === 'busy' ? 'busy' : 'idle';
}

// "1h23m45s" so cresce ate o minuto quando passa de 1h (nao mostra segundo
// junto de hora — perde precisao que ninguem le num relance) e "12m34s"/"45s"
// nos demais casos, sempre com segundos pra ficar visivelmente "vivo" tique a
// tique.
function formatElapsed(ms: number): string {
  const totalSeconds = Math.max(0, Math.floor(ms / 1000));
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;
  if (hours > 0) return `${hours}h${String(minutes).padStart(2, '0')}m`;
  if (minutes > 0) return `${minutes}m${String(seconds).padStart(2, '0')}s`;
  return `${seconds}s`;
}

interface CardProps {
  node: TreeNode;
  x: number;
  y: number;
  isRootLevel: boolean;
  onOpen: (session: SessionInfo) => void;
  onContextMenu: (session: SessionInfo, x: number, y: number) => void;
  costUsage?: SessionCostUsage;
  now: number;
}

function TreeCard({ node, x, y, isRootLevel, onOpen, onContextMenu, costUsage, now }: CardProps) {
  const { session } = node;
  const status = statusOf(session);
  const name = session.name || session.sessionId.slice(0, 8);
  // nós de MCP/skill são sintéticos (não têm PTY/transcript próprio pra
  // abrir) — só mostram atividade recente, não são clicáveis.
  const isActivityNode = !!session.isMcp || !!session.isSkill;
  const canOpen = status !== 'dead' && !isActivityNode;

  const McpIcon = session.isMcp ? mcpIconFor(session.mcpServer || '') : null;
  const LlmLogo = isRootLevel ? llmLogoFor(session.llm || 'claude') : null;
  const llmLogoColor = isRootLevel ? llmLogoColorFor(session.llm || 'claude') : undefined;
  const badge = LlmLogo ? (
    <LlmLogo size={14} strokeWidth={2.25} />
  ) : McpIcon ? (
    <McpIcon size={13} strokeWidth={2.25} />
  ) : session.isSkill ? (
    <Sparkles size={13} strokeWidth={2.25} />
  ) : (
    <Puzzle size={13} strokeWidth={2.25} />
  );

  return (
    <>
    <div
      className={`tree-card ${isRootLevel ? 'tree-card-root' : 'tree-card-child'} ${status}${session.remoteControl ? ' tree-card-remote' : ''}${isActivityNode ? ' tree-card-activity' : ''}`}
      style={{
        left: x - CARD_WIDTH / 2,
        top: y - CARD_HEIGHT / 2,
        width: CARD_WIDTH,
        height: CARD_HEIGHT,
      }}
      onClick={() => {
        if (canOpen) onOpen(session);
      }}
      onContextMenu={(e) => {
        if (isActivityNode) return;
        e.preventDefault();
        onContextMenu(session, e.clientX, e.clientY);
      }}
      role="button"
    >
      <div
        className="tree-card-badge"
        aria-hidden="true"
        style={llmLogoColor ? { color: llmLogoColor } : undefined}
      >
        {badge}
      </div>

      {isRootLevel ? (
        <span className={`tree-card-status-dot ${status}`} aria-hidden="true" />
      ) : session.isMcp ? (
        <IonBadge className={`tree-card-pill mcp-${(session.mcpMethod || '').toLowerCase()}`}>
          {session.mcpMethod}
        </IonBadge>
      ) : session.isSkill ? (
        <IonBadge className="tree-card-pill skill">skill</IonBadge>
      ) : (
        <IonBadge className={`tree-card-pill ${status}`}>{status === 'dead' ? 'done' : 'run'}</IonBadge>
      )}

      <div className="tree-card-body">
        <div className="tree-card-name" title={name}>
          {name}
          {session.remoteControl && (
            <span className="tree-card-remote-tag" title="Remote Control ativo nesta sessão">remoto</span>
          )}
        </div>
        {session.isMcp ? (
          <div className="tree-card-cwd" title={session.mcpTool}>{session.mcpTool}</div>
        ) : session.isSkill ? (
          <div className="tree-card-cwd">skill ativada</div>
        ) : session.roleDescription ? (
          <div className="tree-card-cwd" title={session.roleDescription}>{session.roleDescription}</div>
        ) : (
          <div className="tree-card-cwd" title={session.cwd}>{shortCwd(session.cwd || '')}</div>
        )}
        {(session.model || session.effort) && (
          <div className="tree-card-effort">{formatModelEffort(session.model, session.effort)}</div>
        )}
      </div>
      {/* tempo de execucao ao vivo, canto inferior direito do proprio card —
          so faz sentido pra sessao com processo de verdade rodando (nao pra
          no de atividade sintetico de MCP/skill, que nao tem "execucao"
          propria) e so enquanto ela estiver viva (uma sessao morta ja mostra
          "done" na pill, o tempo final nao muda mais e so poluiria). */}
      {!isActivityNode && session.alive && (
        <div className="tree-card-elapsed" title="tempo de execução">
          {formatElapsed(now - session.startedAt)}
        </div>
      )}
    </div>
    {/* fora do card (que tem overflow:hidden) — nao clicavel, so informativo,
        por isso pointer-events:none via CSS em vez de outro <button>. No card
        RAIZ (agente pai) fica em cima-a-direita, pra frente do card, ja que
        ali o valor e o TOTAL da execucao (ele + subagentes) — nos demais
        continua embaixo, mostrando so o proprio custo daquele no. */}
    {costUsage && costUsage.tokensTotal > 0 && (
      <div
        className={`tree-card-cost${isRootLevel ? ' tree-card-cost-top' : ''}`}
        style={
          isRootLevel
            ? { left: x, top: y - CARD_HEIGHT / 2 - 30, width: CARD_WIDTH / 2 }
            : { left: x - CARD_WIDTH / 2, top: y + CARD_HEIGHT / 2 + 4, width: CARD_WIDTH }
        }
        title={isRootLevel ? 'custo total desta execução (agente + subagentes)' : 'custo estimado desta sessão'}
      >
        <div>{formatTokens(costUsage.tokensTotal)} tokens</div>
        <div>~{formatBrl(costUsage.costBrl)}</div>
      </div>
    )}
    </>
  );
}

function edgePath(parentPos: { x: number; y: number }, childPos: { x: number; y: number }): string {
  const startX = parentPos.x;
  const startY = parentPos.y + CARD_HEIGHT / 2;
  const endX = childPos.x;
  const endY = childPos.y - CARD_HEIGHT / 2;
  const midY = (startY + endY) / 2;
  return `M ${startX} ${startY} Q ${startX} ${midY} ${(startX + endX) / 2} ${midY} T ${endX} ${endY}`;
}

interface TreeProps {
  sessions: SessionInfo[];
  onOpen: (session: SessionInfo) => void;
  onContextMenu: (session: SessionInfo, x: number, y: number) => void;
}

const MIN_SCALE = 0.4;
const MAX_SCALE = 4;
const ZOOM_SPEED = 0.0012;
// colchao (em coordenadas de conteudo) alem da borda visivel do viewport —
// mantem cards logo fora da tela ja montados, pra nao "piscar" (montar/
// desmontar) durante um pan pequeno; e o mesmo tipo de folga que o n8n/React
// Flow usa no culling do proprio canvas.
const CULL_MARGIN = 400;

interface Rect {
  left: number;
  top: number;
  right: number;
  bottom: number;
}

/** Pan (e zoom opcional via scroll) do canvas da árvore: arrastar no fundo vazio
 * move a visão (translate), clicar num card continua abrindo o painel — igual ao
 * padrão de drag usado em TerminalPanel.tsx (pointerdown/move/up + setPointerCapture). */
function usePanAndZoom(contentWidth: number, contentHeight: number) {
  const viewportRef = useRef<HTMLDivElement>(null);
  const panRef = useRef<HTMLDivElement>(null);
  const transform = useRef({ x: 0, y: 0, scale: 1 });
  const hasPannedRef = useRef(false);
  const [isPanning, setIsPanning] = useState(false);
  // true durante um gesto de zoom (scroll) e por um curto periodo depois —
  // usado so pra PAUSAR a animacao de dash da aresta "flowing" durante o
  // zoom. Chromium tem um bug conhecido de repaint com stroke-dasharray
  // animado dentro de um ancestral em transform:scale() ativo (o traco pode
  // sumir ou ficar borrado ate o scale parar) — pausar a animacao durante o
  // gesto evita cair nesse caso.
  const [isZooming, setIsZooming] = useState(false);
  const zoomTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  // retangulo visivel (em coordenadas de conteudo, ja com a folga do
  // CULL_MARGIN) — e o unico estado React que reflete o transform (que em si
  // e mutado direto no DOM via ref, sem re-render, por performance). So isso
  // e o suficiente pra decidir quais cards/arestas valem a pena montar.
  const [visibleRect, setVisibleRect] = useState<Rect | null>(null);
  const rafRef = useRef<number | null>(null);

  const computeVisibleRect = (): Rect | null => {
    const viewport = viewportRef.current;
    if (!viewport) return null;
    const { x, y, scale } = transform.current;
    return {
      left: (0 - x) / scale - CULL_MARGIN,
      top: (0 - y) / scale - CULL_MARGIN,
      right: (viewport.clientWidth - x) / scale + CULL_MARGIN,
      bottom: (viewport.clientHeight - y) / scale + CULL_MARGIN,
    };
  };

  // throttlado via rAF: durante um arraste continuo (pointermove dispara aos
  // montes), so recalcula o retangulo uma vez por frame em vez de a cada
  // evento — o transform em si (translate/scale) continua atualizando a cada
  // evento, so o CULLING (que dispara re-render) e que fica no ritmo do frame.
  const scheduleVisibleRectUpdate = () => {
    if (rafRef.current != null) return;
    rafRef.current = requestAnimationFrame(() => {
      rafRef.current = null;
      setVisibleRect(computeVisibleRect());
    });
  };

  const applyTransform = () => {
    const pan = panRef.current;
    if (!pan) return;
    const { x, y, scale } = transform.current;
    pan.style.transform = `translate(${x}px, ${y}px) scale(${scale})`;
    scheduleVisibleRectUpdate();
  };

  // liga will-change SO durante o gesto (pan ou zoom) — no repouso, o
  // Chromium re-rasteriza o conteudo nitido quase na hora em vez de esperar
  // o idle longo (~10s) que acontece quando will-change fica sempre ligado.
  const setGpuLayerActive = (active: boolean) => {
    const pan = panRef.current;
    if (pan) pan.style.willChange = active ? 'transform' : 'auto';
  };

  // viewport pode mudar de tamanho (resize da janela) sem nenhum pan/zoom
  // acontecer — sem isso o retangulo de culling ficaria desatualizado e
  // cards nas bordas sumiriam/apareceriam so no proximo pan.
  useEffect(() => {
    const viewport = viewportRef.current;
    if (!viewport) return;
    const observer = new ResizeObserver(() => scheduleVisibleRectUpdate());
    observer.observe(viewport);
    return () => observer.disconnect();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // centraliza a árvore no viewport, horizontal E vertical (enquanto o
  // usuário não arrastou manualmente) — sem isso a árvore sempre nasce
  // grudada no canto superior esquerdo em vez de ficar no meio da tela.
  useEffect(() => {
    const viewport = viewportRef.current;
    if (!viewport || hasPannedRef.current) return;
    transform.current.x = Math.max(24, (viewport.clientWidth - contentWidth) / 2);
    transform.current.y = Math.max(24, (viewport.clientHeight - contentHeight) / 2);
    applyTransform();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [contentWidth, contentHeight]);

  const centerView = () => {
    const viewport = viewportRef.current;
    if (!viewport) return;
    transform.current = {
      x: Math.max(24, (viewport.clientWidth - contentWidth) / 2),
      y: Math.max(24, (viewport.clientHeight - contentHeight) / 2),
      scale: 1,
    };
    applyTransform();
  };

  // desloca o canvas pra deixar um ponto de CONTEUDO (o centro do card que
  // acabou de ser aberto) perto da borda esquerda da tela E com o TOPO do
  // card alinhado ao TOPO do painel de terminal que vai nascer (mesma altura
  // do cabecalho "Codex CLI"/etc, nao o meio da tela) — usado ao clicar num
  // agente, pra ele nao ficar escondido atras do painel que abre encostado
  // na direita, alinhado com ele.
  const focusContent = (contentX: number, contentY: number, targetXFrac = 0.2) => {
    const viewport = viewportRef.current;
    const pan = panRef.current;
    if (!viewport || !pan) return;
    const { scale } = transform.current;
    const targetScreenX = viewport.clientWidth * targetXFrac;
    const targetScreenY = defaultPanelTop() - TOPBAR_H + CARD_HEIGHT / 2;
    transform.current = { scale, x: targetScreenX - contentX * scale, y: targetScreenY - contentY * scale };
    hasPannedRef.current = true;
    // anima só esse pulo especifico (o pan por arraste continua instantaneo,
    // sem essa transicao, que se ficasse sempre ligada deixaria o drag "com
    // atraso" atras do cursor).
    pan.style.transition = 'transform 0.3s cubic-bezier(0.16, 1, 0.3, 1)';
    applyTransform();
    window.setTimeout(() => {
      if (pan) pan.style.transition = '';
    }, 320);
  };

  // zoom mantendo o ponto do meio do viewport fixo (senao cada clique em +/-
  // "empurra" o conteudo pro canto, o que fica estranho num botao dedicado)
  const zoomBy = (factor: number) => {
    const viewport = viewportRef.current;
    if (!viewport) return;
    const cx = viewport.clientWidth / 2;
    const cy = viewport.clientHeight / 2;
    const { x, y, scale } = transform.current;
    const nextScale = Math.min(MAX_SCALE, Math.max(MIN_SCALE, scale * factor));
    const wx = (cx - x) / scale;
    const wy = (cy - y) / scale;
    transform.current = { scale: nextScale, x: cx - wx * nextScale, y: cy - wy * nextScale };
    applyTransform();
  };

  useEffect(() => {
    const viewport = viewportRef.current;
    if (!viewport) return;

    let dragging = false;
    let startClientX = 0;
    let startClientY = 0;
    let startX = 0;
    let startY = 0;

    const onPointerDown = (event: PointerEvent) => {
      if ((event.target as HTMLElement).closest('.tree-card, .session-tree-topbar')) return;
      dragging = true;
      hasPannedRef.current = true;
      setIsPanning(true);
      startClientX = event.clientX;
      startClientY = event.clientY;
      startX = transform.current.x;
      startY = transform.current.y;
      viewport.setPointerCapture(event.pointerId);
    };
    const onPointerMove = (event: PointerEvent) => {
      if (!dragging) return;
      transform.current.x = startX + (event.clientX - startClientX);
      transform.current.y = startY + (event.clientY - startClientY);
      applyTransform();
    };
    const onPointerUp = () => {
      dragging = false;
      setIsPanning(false);
    };
    // scroll do mouse sempre zoom (nao ha lista pra rolar aqui, so o canvas da
    // arvore) — mantem o ponto sob o cursor fixo, senao cada scroll "empurra"
    // o conteudo pro canto em vez de aproximar/afastar de onde o mouse esta.
    const onWheel = (event: WheelEvent) => {
      event.preventDefault();
      const rect = viewport.getBoundingClientRect();
      const cx = event.clientX - rect.left;
      const cy = event.clientY - rect.top;
      const { x, y, scale } = transform.current;
      const nextScale = Math.min(MAX_SCALE, Math.max(MIN_SCALE, scale - event.deltaY * ZOOM_SPEED));
      const wx = (cx - x) / scale;
      const wy = (cy - y) / scale;
      transform.current = { scale: nextScale, x: cx - wx * nextScale, y: cy - wy * nextScale };
      applyTransform();

      setIsZooming(true);
      if (zoomTimeoutRef.current) clearTimeout(zoomTimeoutRef.current);
      zoomTimeoutRef.current = setTimeout(() => setIsZooming(false), 250);
    };

    viewport.addEventListener('pointerdown', onPointerDown);
    viewport.addEventListener('pointermove', onPointerMove);
    viewport.addEventListener('pointerup', onPointerUp);
    viewport.addEventListener('pointercancel', onPointerUp);
    viewport.addEventListener('wheel', onWheel, { passive: false });
    return () => {
      viewport.removeEventListener('pointerdown', onPointerDown);
      viewport.removeEventListener('pointermove', onPointerMove);
      viewport.removeEventListener('pointerup', onPointerUp);
      viewport.removeEventListener('pointercancel', onPointerUp);
      viewport.removeEventListener('wheel', onWheel);
      if (zoomTimeoutRef.current) clearTimeout(zoomTimeoutRef.current);
    };
  }, []);

  return {
    viewportRef,
    panRef,
    isPanning,
    isZooming,
    visibleRect,
    centerView,
    zoomIn: () => zoomBy(1.25),
    zoomOut: () => zoomBy(0.8),
    focusContent,
  };
}

function intersects(rect: Rect, x: number, y: number, w: number, h: number): boolean {
  return x + w / 2 >= rect.left && x - w / 2 <= rect.right && y + h / 2 >= rect.top && y - h / 2 <= rect.bottom;
}

const GROUP_BOX_PAD = 22;
const GROUP_BOX_LABEL_H = 26;
// reserva de espaco embaixo do card pro rotulo de custo/token (2 linhas) —
// sem isso a caixa tracejada "fora do app" terminava na borda do CARD, e o
// rotulo (que fica fora do card, embaixo dele) vazava pra fora da caixa.
const COST_LABEL_H = 26;

export default function SessionTree({ sessions, onOpen, onContextMenu }: TreeProps) {
  const { summary: costSummary, connectionError: costConnectionError } = useCostSummary();

  // relogio compartilhado por TODOS os cards — um unico setInterval aqui em
  // vez de um por card evita N timers redundantes; o tique de 1s e o
  // suficiente pra segundo "ao vivo" sem gerar trabalho extra perceptivel.
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, []);

  const { roots, width, height } = useMemo(() => {
    const forest = buildForest(sessions);
    const { width: layoutWidth, height: layoutHeight } = layout(forest);
    return { roots: forest, width: layoutWidth, height: layoutHeight };
  }, [sessions]);

  const allNodes = roots.flatMap(flattenNodes);
  const allEdges = roots.flatMap(flattenEdges);

  const posOf = (node: TreeNode) => ({ x: node.x, y: node.y });

  // a caixa "fora do app" aparece sempre que existe sessao externa, mesmo sem
  // nenhum agente do app na tela — o rotulo "somente leitura" e informação
  // relevante por si só, não é so uma separação entre os dois grupos.
  const externalNodes = allNodes.filter((n) => n.group === 'external');
  const externalPositioned = externalNodes.map(posOf);
  const externalBox = externalNodes.length
    ? {
        left: Math.min(...externalPositioned.map((p) => p.x - CARD_WIDTH / 2)) - GROUP_BOX_PAD,
        right: Math.max(...externalPositioned.map((p) => p.x + CARD_WIDTH / 2)) + GROUP_BOX_PAD,
        top: Math.min(...externalPositioned.map((p) => p.y - CARD_HEIGHT / 2)) - GROUP_BOX_PAD - GROUP_BOX_LABEL_H,
        bottom: Math.max(...externalPositioned.map((p) => p.y + CARD_HEIGHT / 2)) + GROUP_BOX_PAD + COST_LABEL_H,
      }
    : null;

  const { viewportRef, panRef, isPanning, isZooming, visibleRect, centerView, zoomIn, zoomOut, focusContent } =
    usePanAndZoom(width, height);

  // culling: so monta no DOM os cards/arestas que caem dentro do retangulo
  // visivel (+ folga) — antes disso TUDO era montado de uma vez, mesmo fora
  // de tela, o que com muitos nos (subagentes, MCPs, skills) gerava excesso
  // de nos DOM e os bugs de renderizacao (itens sumindo/piscando) que motivaram
  // essa mudanca. Sem retangulo ainda calculado (primeiro frame), renderiza
  // tudo mesmo — e so um frame a mais, nao vale a pena esconder conteudo por
  // falta de dado.
  const visibleNodes = visibleRect
    ? allNodes.filter((n) => {
        const p = posOf(n);
        return intersects(visibleRect, p.x, p.y, CARD_WIDTH, CARD_HEIGHT);
      })
    : allNodes;
  const visibleEdges = visibleRect
    ? allEdges.filter(({ parent, child }) => {
        const pp = posOf(parent);
        const cp = posOf(child);
        // mantem a aresta se QUALQUER uma das pontas estiver visivel — assim
        // uma linha que atravessa a tela nao desaparece so porque os dois
        // cards nas pontas estao fora do retangulo.
        return (
          intersects(visibleRect, pp.x, pp.y, CARD_WIDTH, CARD_HEIGHT) ||
          intersects(visibleRect, cp.x, cp.y, CARD_WIDTH, CARD_HEIGHT)
        );
      })
    : allEdges;

  return (
    <div className={`session-tree-scroll${isPanning ? ' panning' : ''}`} ref={viewportRef}>
      <div className="session-tree-topbar">
        <LlmUsageWidget sessions={sessions} />
        <div className="session-tree-controls">
          <button className="session-tree-control-btn" onClick={zoomOut} aria-label="Reduzir zoom">
            <Minus size={14} />
          </button>
          <button className="session-tree-control-btn" onClick={centerView} aria-label="Centralizar">
            <LocateFixed size={14} />
          </button>
          <button className="session-tree-control-btn" onClick={zoomIn} aria-label="Aumentar zoom">
            <Plus size={14} />
          </button>
        </div>
      </div>

      <div className="session-tree-pan" ref={panRef}>
        <div className="session-tree" style={{ width, height }}>
          <svg className="session-tree-svg" width={width} height={height}>
            {visibleEdges.map(({ parent, child }) => {
              const flowing = child.session.alive && child.session.status === 'busy' && !isZooming;
              return (
                <path
                  key={child.session.sessionId}
                  d={edgePath(posOf(parent), posOf(child))}
                  className={`tree-edge ${flowing ? 'flowing' : ''}`}
                />
              );
            })}
          </svg>

          {externalBox && (
            <div
              className="session-tree-group-box"
              style={{
                left: externalBox.left,
                top: externalBox.top,
                width: externalBox.right - externalBox.left,
                height: externalBox.bottom - externalBox.top,
              }}
            >
              <span className="session-tree-group-box-label">fora do app · somente leitura</span>
            </div>
          )}

          {visibleNodes.map((node) => {
            const pos = posOf(node);
            const isRootLevel = node.depth === 0;
            // no card do agente PAI mostra o custo TOTAL da execucao (ele +
            // todos os subagentes) — nao so o proprio transcript da raiz,
            // que sozinho subestimaria o custo real de rodar a arvore
            // inteira. Cards filhos continuam mostrando so o proprio custo.
            const costUsage = costSummary
              ? isRootLevel
                ? rollupCostUsage(node, costSummary.perSession)
                : costSummary.perSession[node.session.sessionId]
              : undefined;
            return (
              <TreeCard
                key={node.session.sessionId}
                node={node}
                x={pos.x}
                y={pos.y}
                isRootLevel={isRootLevel}
                onOpen={(s) => {
                  // desloca o card clicado pra perto da borda esquerda ANTES
                  // de abrir o painel — o painel nasce encostado na direita
                  // (TerminalPanel.tsx), entao sem isso um card que esteja
                  // mais pro meio/direita da arvore ficaria escondido atras
                  // dele assim que o painel abrisse.
                  focusContent(node.x, node.y);
                  onOpen(s);
                }}
                onContextMenu={onContextMenu}
                costUsage={costUsage}
                now={now}
              />
            );
          })}
        </div>
      </div>

      <CostUsageFooter summary={costSummary} connectionError={costConnectionError} />
    </div>
  );
}
