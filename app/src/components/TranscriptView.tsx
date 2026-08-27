import { Fragment, ReactNode, useEffect, useMemo, useRef, useState } from 'react';
import { SessionInfo, StepEvent } from '../api';
import DiffBlock from './DiffBlock';
import './TranscriptView.css';

/** Um turno pronto para renderizar: ou uma fala (assistente/usuário), um
 * grupo de chamadas de ferramenta consecutivas do mesmo tipo, ou um diff de
 * Edit/Write (nunca agrupado — cada edição aparece expandida, igual o CLI real). */
type TranscriptEntry =
  | { kind: 'text'; text: string; key: string }
  | { kind: 'prompt'; text: string; key: string }
  | { kind: 'tool-group'; toolName: string; count: number; lastDetail: string; key: string }
  | { kind: 'diff'; file: string; oldText: string; newText: string; key: string };

const groupSteps = (steps: StepEvent[]): TranscriptEntry[] => {
  const entries: TranscriptEntry[] = [];

  for (let index = 0; index < steps.length; index++) {
    const step = steps[index];
    if (!step.text && step.kind !== 'tool') continue;

    if (step.kind === 'tool' && step.diff) {
      entries.push({
        kind: 'diff',
        file: step.diff.file,
        oldText: step.diff.oldText,
        newText: step.diff.newText,
        key: `diff-${index}`,
      });
      continue;
    }

    if (step.kind === 'tool') {
      const toolName = step.name || 'tool';
      const previousEntry = entries[entries.length - 1];
      if (previousEntry && previousEntry.kind === 'tool-group' && previousEntry.toolName === toolName) {
        previousEntry.count += 1;
        previousEntry.lastDetail = step.text || previousEntry.lastDetail;
        continue;
      }
      entries.push({
        kind: 'tool-group',
        toolName,
        count: 1,
        lastDetail: step.text || '',
        key: `tool-${index}`,
      });
      continue;
    }

    if (step.kind === 'text' || step.kind === 'prompt') {
      entries.push({ kind: step.kind, text: step.text || '', key: `${step.kind}-${index}` });
    }
  }

  return entries;
};

/** Nomes amigáveis para agrupamentos "Ran N X" — cai no nome cru da ferramenta
 * quando não há um rótulo específico mapeado. */
const TOOL_GROUP_LABELS: Record<string, string> = {
  Bash: 'shell command',
  Read: 'file read',
  Edit: 'file edit',
  Write: 'file write',
  Grep: 'search',
  Glob: 'file search',
  WebFetch: 'web fetch',
  WebSearch: 'web search',
};

const toolGroupSummary = (toolName: string, count: number): string => {
  const label = TOOL_GROUP_LABELS[toolName] || toolName;
  const pluralLabel = count === 1 ? label : `${label}s`;
  return `Ran ${count} ${pluralLabel}`;
};

/** Parser simples de **negrito** markdown: sem suporte a itálico/links, só o
 * essencial para o visual do CLI real do Claude Code. */
const renderBoldText = (text: string): ReactNode[] => {
  const parts = text.split(/(\*\*[^*]+\*\*)/g);
  return parts.map((part, partIndex) => {
    if (part.startsWith('**') && part.endsWith('**') && part.length > 4) {
      return (
        <strong key={partIndex} className="transcript-bold">
          {part.slice(2, -2)}
        </strong>
      );
    }
    return <Fragment key={partIndex}>{part}</Fragment>;
  });
};

/** Verbos whimsicais no gerúndio, no estilo do spinner "pensando" do CLI real do
 * Claude Code — trocam periodicamente enquanto a sessão está ocupada, só pra
 * dar vida ao indicador (sem nenhum significado funcional). */
const THINKING_VERBS = [
  'Percolating',
  'Pondering',
  'Ruminating',
  'Noodling',
  'Marinating',
  'Simmering',
  'Cogitating',
  'Deliberating',
  'Waddling',
  'Undulating',
  'Crunching',
  'Wrangling',
  'Tinkering',
  'Puttering',
  'Musing',
];
const VERB_INTERVAL_MS = 2500;
const NEAR_BOTTOM_THRESHOLD_PX = 60;

const formatTokens = (tokenCount: number): string =>
  tokenCount >= 1000 ? `${(tokenCount / 1000).toFixed(1)}k` : String(tokenCount);

const formatElapsed = (elapsedMs: number): string => {
  const totalSeconds = Math.max(0, Math.floor(elapsedMs / 1000));
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return minutes > 0 ? `${minutes}m ${seconds}s` : `${seconds}s`;
};

interface Props {
  session: SessionInfo;
  allSessions: SessionInfo[];
  steps: StepEvent[];
}

const TranscriptView = ({ session, allSessions, steps }: Props) => {
  const entries = useMemo(() => groupSteps(steps), [steps]);
  const isBusy = !!session.alive && session.status === 'busy';

  const scrollRef = useRef<HTMLDivElement>(null);
  const contentRef = useRef<HTMLDivElement>(null);
  const stickToBottomRef = useRef(true);
  const [showJumpToBottom, setShowJumpToBottom] = useState(false);

  // grudar no fim tipo chat: ao montar e sempre que o conteúdo cresce, se o
  // usuário estava perto do fim (não rolou pra cima pra ler o histórico) o
  // scroll acompanha; senão fica parado e mostra um aviso. Usa ResizeObserver
  // na altura real do conteúdo (não só `entries.length`) porque várias
  // chamadas de ferramenta seguidas se agrupam numa ÚNICA entrada (só o
  // contador/detalhe muda, o array de entries não cresce) — só observar o
  // length perdia essas atualizações e a tela "travava" sem descer.
  useEffect(() => {
    const el = scrollRef.current;
    const content = contentRef.current;
    if (!el || !content) return;
    const applyStick = () => {
      if (stickToBottomRef.current) {
        el.scrollTop = el.scrollHeight;
        setShowJumpToBottom(false);
      } else {
        setShowJumpToBottom(true);
      }
    };
    applyStick();
    const ro = new ResizeObserver(applyStick);
    ro.observe(content);
    return () => ro.disconnect();
  }, [entries]);

  const handleScroll = () => {
    const el = scrollRef.current;
    if (!el) return;
    const distanceFromBottom = el.scrollHeight - el.scrollTop - el.clientHeight;
    const nearBottom = distanceFromBottom < NEAR_BOTTOM_THRESHOLD_PX;
    stickToBottomRef.current = nearBottom;
    if (nearBottom) setShowJumpToBottom(false);
  };

  const jumpToBottom = () => {
    const el = scrollRef.current;
    if (!el) return;
    stickToBottomRef.current = true;
    el.scrollTop = el.scrollHeight;
    setShowJumpToBottom(false);
  };

  // verbo "pensando" cíclico enquanto a sessão está ocupada
  const [verbIndex, setVerbIndex] = useState(0);
  useEffect(() => {
    if (!isBusy) return;
    const id = setInterval(() => setVerbIndex((current) => (current + 1) % THINKING_VERBS.length), VERB_INTERVAL_MS);
    return () => clearInterval(id);
  }, [isBusy]);

  // início do período "busy" (referência para o tempo decorrido) + tick de 1s para exibi-lo
  const busyStartRef = useRef<number | null>(null);
  const [, forceTick] = useState(0);
  useEffect(() => {
    if (!isBusy) {
      busyStartRef.current = null;
      return;
    }
    if (busyStartRef.current === null) busyStartRef.current = Date.now();
    const id = setInterval(() => forceTick((current) => current + 1), 1000);
    return () => clearInterval(id);
  }, [isBusy]);

  const elapsedMs = isBusy && busyStartRef.current !== null ? Date.now() - busyStartRef.current : 0;

  const latestTokens = useMemo(() => {
    for (let index = steps.length - 1; index >= 0; index--) {
      const tokens = steps[index].tokens;
      if (typeof tokens === 'number' && tokens > 0) return tokens;
    }
    return 0;
  }, [steps]);

  const childAgentCount = useMemo(
    () => allSessions.filter((candidate) => candidate.parentSessionId === session.sessionId).length,
    [allSessions, session.sessionId],
  );

  return (
    <div className="transcript-view-wrap">
      <div className="transcript-view" ref={scrollRef} onScroll={handleScroll}>
        <div ref={contentRef}>
        {entries.length === 0 ? (
          <div className="transcript-empty">Aguardando atividade desta sessão…</div>
        ) : (
          entries.map((entry) => {
            if (entry.kind === 'prompt') {
              return (
                <div key={entry.key} className="transcript-turn transcript-prompt">
                  <span className="transcript-marker transcript-marker-prompt">❯</span>
                  <span className="transcript-body">{entry.text}</span>
                </div>
              );
            }
            if (entry.kind === 'diff') {
              return (
                <DiffBlock key={entry.key} file={entry.file} oldText={entry.oldText} newText={entry.newText} />
              );
            }
            if (entry.kind === 'tool-group') {
              return (
                <div key={entry.key} className="transcript-turn transcript-tool-group">
                  <span className="transcript-marker transcript-marker-tool">●</span>
                  <div className="transcript-body">
                    <span className="transcript-tool-summary">
                      {toolGroupSummary(entry.toolName, entry.count)}
                    </span>
                    {entry.lastDetail && (
                      <div className="transcript-subitem">
                        <span className="transcript-subitem-branch">└</span>
                        <span className="transcript-subitem-text">{entry.lastDetail}</span>
                      </div>
                    )}
                  </div>
                </div>
              );
            }
            return (
              <div key={entry.key} className="transcript-turn transcript-text">
                <span className="transcript-marker">●</span>
                <span className="transcript-body">{renderBoldText(entry.text)}</span>
              </div>
            );
          })
        )}
        </div>
      </div>

      {showJumpToBottom && (
        <button type="button" className="transcript-jump-bottom" onClick={jumpToBottom}>
          ↓ novas mensagens
        </button>
      )}

      {isBusy && (
        <div className="transcript-thinking">
          <span className="transcript-thinking-spinner" aria-hidden="true">✳</span>
          <span className="transcript-thinking-text">
            {THINKING_VERBS[verbIndex]}… ({formatElapsed(elapsedMs)}
            {latestTokens > 0 ? ` · ↓ ${formatTokens(latestTokens)} tokens` : ''})
          </span>
          <div className="transcript-thinking-tip">
            <span className="transcript-thinking-tip-branch">└</span>
            <span>Sessão espelhada em tempo real, somente leitura</span>
          </div>
        </div>
      )}

      <div className="transcript-footer">
        <div className="transcript-status-line">
          <span className="transcript-status-icon" aria-hidden="true">▸▸</span>
          <span className={`transcript-status-highlight ${isBusy ? 'busy' : 'idle'}`}>
            {isBusy ? 'sessão ocupada' : 'sessão ociosa'}
          </span>
          <span className="transcript-status-dim"> · somente leitura</span>
          {childAgentCount > 0 && (
            <span className="transcript-status-dim">
              {' '}
              · ← {childAgentCount} {childAgentCount === 1 ? 'agente' : 'agentes'}
            </span>
          )}
        </div>
      </div>
    </div>
  );
};

export default TranscriptView;
