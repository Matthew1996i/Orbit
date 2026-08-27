import { useEffect, useMemo, useRef, useState, type PointerEvent as ReactPointerEvent } from 'react';
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
import { llmLogoFor } from '../utils/llmLogos';
import LlmUsageWidget from './LlmUsageWidget';
import CostUsageFooter, { formatTokens, formatBrl } from './CostUsageFooter';
import './SessionTree.css';

// relatorio de custo muda bem mais devagar que status de sessao (que ja
// atualiza a cada 2s) — um numero que so cresce aos poucos nao precisa do
// mesmo ritmo, e um poll mais espacado evita trafego extra so pra reler
// transcripts inteiros no backend. Um unico poll aqui alimenta o rodape geral
// E o custo por card, em vez de cada um buscar por conta propria.
const COST_REFRESH_MS = 8000;

function useCostSummary(): CostSummary | null {
  const [summary, setSummary] = useState<CostSummary | null>(null);

  useEffect(() => {
    let cancelled = false;
    const load = () => {
      fetchCostSummary()
        .then((response) => {
          if (!cancelled) setSummary(response);
        })
        .catch(() => {
          /* backend indisponivel nesse ciclo — mantem o ultimo valor conhecido */
        });
    };
    load();
    const id = setInterval(load, COST_REFRESH_MS);
    return () => {
      cancelled = true;
      clearInterval(id);
    };
  }, []);

  return summary;
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
  rootId: string;
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
  // rootId identifica o grupo pra arrastar — todo card (raiz ou descendente)
  // guarda o id da sessao raiz, assim arrastar QUALQUER card do grupo move a
  // arvore inteira junto (o offset e sempre aplicado por rootId, nao por card).
  const toNode = (session: SessionInfo, group: 'app' | 'external', rootId: string): TreeNode => ({
    session,
    children: childrenOf(session.sessionId).map((child) => toNode(child, group, rootId)),
    depth: 0,
    x: 0,
    y: 0,
    group,
    rootId,
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
  return roots.map((root) => toNode(root, groupOf(root), root.sessionId));
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

interface CardProps {
  node: TreeNode;
  x: number;
  y: number;
  isRootLevel: boolean;
  onOpen: (session: SessionInfo) => void;
  onContextMenu: (session: SessionInfo, x: number, y: number) => void;
  onDragBy: (rootId: string, dx: number, dy: number) => void;
  getScale: () => number;
  costUsage?: SessionCostUsage;
}

// limiar (em px de tela) pra distinguir "clicou" de "arrastou" — abaixo disso
// ainda conta como clique (abre o painel), acima vira arraste do grupo.
const DRAG_THRESHOLD = 4;

function TreeCard({ node, x, y, isRootLevel, onOpen, onContextMenu, onDragBy, getScale, costUsage }: CardProps) {
  const { session } = node;
  const status = statusOf(session);
  const name = session.name || session.sessionId.slice(0, 8);
  // nós de MCP/skill são sintéticos (não têm PTY/transcript próprio pra
  // abrir) — só mostram atividade recente, não são clicáveis (mas ainda
  // podem ser arrastadas — arrastar QUALQUER card do grupo move o grupo
  // inteiro, seja raiz, subagente ou nó de atividade).
  const isActivityNode = !!session.isMcp || !!session.isSkill;
  const canOpen = status !== 'dead' && !isActivityNode;

  const McpIcon = session.isMcp ? mcpIconFor(session.mcpServer || '') : null;
  const LlmLogo = isRootLevel ? llmLogoFor(session.llm || 'claude') : null;
  const badge = LlmLogo ? (
    <LlmLogo size={14} strokeWidth={2.25} />
  ) : McpIcon ? (
    <McpIcon size={13} strokeWidth={2.25} />
  ) : session.isSkill ? (
    <Sparkles size={13} strokeWidth={2.25} />
  ) : (
    <Puzzle size={13} strokeWidth={2.25} />
  );

  // arraste do card: pointerdown captura o ponteiro no proprio card (nao
  // conflita com o pan do canvas, que ja ignora pointerdown dentro de
  // .tree-card). Um clique de verdade (sem mover alem do limiar) ainda abre
  // o painel no pointerup — assim nao precisa de onClick separado.
  const dragRef = useRef<{ initX: number; initY: number; lastX: number; lastY: number; moved: boolean } | null>(
    null,
  );

  const onPointerDown = (e: ReactPointerEvent<HTMLDivElement>) => {
    if (e.button !== 0) return;
    // sem isso o navegador inicia selecao de texto da pagina inteira ao
    // arrastar (comportamento nativo de mousedown+move) — o card nao tem
    // nada selecionavel, entao previne sempre.
    e.preventDefault();
    dragRef.current = { initX: e.clientX, initY: e.clientY, lastX: e.clientX, lastY: e.clientY, moved: false };
    e.currentTarget.setPointerCapture(e.pointerId);
  };

  const onPointerMove = (e: ReactPointerEvent<HTMLDivElement>) => {
    const drag = dragRef.current;
    if (!drag) return;
    if (
      !drag.moved &&
      Math.abs(e.clientX - drag.initX) < DRAG_THRESHOLD &&
      Math.abs(e.clientY - drag.initY) < DRAG_THRESHOLD
    ) {
      return;
    }
    drag.moved = true;
    const scale = getScale();
    const dx = (e.clientX - drag.lastX) / scale;
    const dy = (e.clientY - drag.lastY) / scale;
    drag.lastX = e.clientX;
    drag.lastY = e.clientY;
    onDragBy(node.rootId, dx, dy);
  };

  const onPointerUp = (e: ReactPointerEvent<HTMLDivElement>) => {
    const drag = dragRef.current;
    dragRef.current = null;
    e.currentTarget.releasePointerCapture(e.pointerId);
    // "drag" so existe se o pointerdown foi botao esquerdo (onPointerDown
    // ignora outros botoes) — sem essa checagem, um right-click (que nunca
    // populou dragRef) caia no mesmo "!drag?.moved" de um clique de verdade
    // (undefined tambem passa em "nao moveu"), abrindo o painel junto do
    // menu de contexto.
    if (drag && !drag.moved && canOpen) onOpen(session);
  };

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
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onContextMenu={(e) => {
        if (isActivityNode) return;
        e.preventDefault();
        onContextMenu(session, e.clientX, e.clientY);
      }}
      role="button"
    >
      <div className="tree-card-badge" aria-hidden="true">
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

// recebe as posicoes JA deslocadas pelo offset de arraste do grupo — a linha
// sempre acompanha os cards, nunca fica "presa" na posicao original.
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
const MAX_SCALE = 1.6;
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
    };
  }, []);

  return {
    viewportRef,
    panRef,
    isPanning,
    visibleRect,
    centerView,
    zoomIn: () => zoomBy(1.25),
    zoomOut: () => zoomBy(0.8),
    getScale: () => transform.current.scale,
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
  const costSummary = useCostSummary();

  const { roots, width, height } = useMemo(() => {
    const forest = buildForest(sessions);
    const { width: layoutWidth, height: layoutHeight } = layout(forest);
    return { roots: forest, width: layoutWidth, height: layoutHeight };
  }, [sessions]);

  const allNodes = roots.flatMap(flattenNodes);
  const allEdges = roots.flatMap(flattenEdges);

  // offset de arraste por GRUPO (chave = id da sessao raiz) — nunca mexe no
  // x/y base do layout, so desloca visualmente; assim arrastar qualquer card
  // do grupo (raiz, subagente ou no de atividade) move a arvore inteira
  // junto, e as linhas (edgePath) sempre acompanham porque usam essa mesma
  // posicao deslocada.
  const [groupOffsets, setGroupOffsets] = useState<Record<string, { dx: number; dy: number }>>({});
  const posOf = (node: TreeNode) => {
    const offset = groupOffsets[node.rootId];
    return offset ? { x: node.x + offset.dx, y: node.y + offset.dy } : { x: node.x, y: node.y };
  };
  const handleDragBy = (rootId: string, dx: number, dy: number) => {
    setGroupOffsets((cur) => {
      const prev = cur[rootId] || { dx: 0, dy: 0 };
      return { ...cur, [rootId]: { dx: prev.dx + dx, dy: prev.dy + dy } };
    });
  };

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

  const { viewportRef, panRef, isPanning, visibleRect, centerView, zoomIn, zoomOut, getScale } =
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
              const flowing = child.session.alive && child.session.status === 'busy';
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
                onOpen={onOpen}
                onContextMenu={onContextMenu}
                onDragBy={handleDragBy}
                getScale={getScale}
                costUsage={costUsage}
              />
            );
          })}
        </div>
      </div>

      <CostUsageFooter summary={costSummary} />
    </div>
  );
}
