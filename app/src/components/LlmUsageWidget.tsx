import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { RefreshCw, Clock } from 'lucide-react';
import { fetchLlms, fetchUsage, ClaudeUsage, CodexUsage, UsageWindow, LlmCli, SessionInfo } from '../api';
import { CLAUDE_LLM_OPTION, llmLogoFor } from '../utils/llmLogos';
import './LlmUsageWidget.css';

// mesmo intervalo do polling de sessoes (Home.tsx) — senao a caixinha de
// contagem de sessao (busy/total) fica visivelmente atrasada em relacao ao
// resto da tela, que ja atualiza a cada 2s.
const LLM_REFRESH_MS = 2000;

// uso real (%) vem do endpoint OAuth da Anthropic via backend local. Mantem a
// cadencia de 60s para nao bater na API a cada poll visual de sessoes.
const USAGE_REFRESH_MS = 60_000;

const SHOW_REAL_USAGE = true;

// sessao real de agente (nao node sintetico de MCP/skill, nao subagente) e o
// que conta como "uso" de uma LLM aqui — subagentes e nodes de atividade nao
// tem CLI/processo proprio, sempre herdam do agente raiz que ja e contado.
function isCountableSession(session: SessionInfo): boolean {
  return session.alive && !session.isMcp && !session.isSkill && !session.isSubagent && !session.isResource;
}

// sessoes fora do app (lidas de ~/.claude/sessions) nunca tem `llm` — so o
// CLI do claude escreve esse arquivo, entao ausencia do campo sempre
// significa claude.
function sessionLlmBin(session: SessionInfo): string {
  return session.llm || 'claude';
}

function formatResetsAt(iso: string | null): string {
  if (!iso) return '';
  const diffMs = new Date(iso).getTime() - Date.now();
  if (diffMs <= 0) return 'resetando agora';
  const hours = diffMs / 3_600_000;
  if (hours < 1) return `reseta em ${Math.round(diffMs / 60_000)}min`;
  if (hours < 48) return `reseta em ${Math.round(hours)}h`;
  return `reseta em ${Math.round(hours / 24)}d`;
}

// versao curta (sem "reseta em"), pro grid de resets do popover novo — "21m",
// "2d 11h", igual a referencia.
function formatResetShort(iso: string | null): string {
  if (!iso) return '—';
  const diffMs = new Date(iso).getTime() - Date.now();
  if (diffMs <= 0) return 'agora';
  const totalMin = Math.round(diffMs / 60_000);
  if (totalMin < 60) return `${totalMin}m`;
  const totalHours = Math.floor(totalMin / 60);
  if (totalHours < 24) return `${totalHours}h`;
  const days = Math.floor(totalHours / 24);
  const remHours = totalHours % 24;
  return remHours > 0 ? `${days}d ${remHours}h` : `${days}d`;
}

// mesma logica de formatResetShort, so que a partir de epoch ms (o Codex
// devolve resetsAt em segundos desde a epoch via app-server, ja convertido
// pra ms no backend — ver _parse_codex_usage_window em server.py) em vez de
// ISO string (formato do Claude).
function formatResetShortMs(ms: number): string {
  if (!ms) return '—';
  const diffMs = ms - Date.now();
  if (diffMs <= 0) return 'agora';
  const totalMin = Math.round(diffMs / 60_000);
  if (totalMin < 60) return `${totalMin}m`;
  const totalHours = Math.floor(totalMin / 60);
  if (totalHours < 24) return `${totalHours}h`;
  const days = Math.floor(totalHours / 24);
  const remHours = totalHours % 24;
  return remHours > 0 ? `${days}d ${remHours}h` : `${days}d`;
}

interface UsageBar {
  key: string;
  label: string;
  window: UsageWindow | null;
}

function UsageBarRow({ bar }: { bar: UsageBar }) {
  const pct = bar.window?.utilization ?? null;
  const pctLabel = pct == null ? '—' : Math.round(pct);
  return (
    <div className="llm-usage-bar-row">
      <div className="llm-usage-bar-row-top">
        <span className="llm-usage-bar-label">{bar.label}</span>
        <span className="llm-usage-bar-pct">{pctLabel}%</span>
      </div>
      <div className="llm-usage-bar-track">
        <div
          className={`llm-usage-bar-fill${pct == null ? ' empty' : ''}`}
          style={{ width: `${Math.max(0, Math.min(100, pct ?? 0))}%` }}
        />
      </div>
    </div>
  );
}

interface Props {
  sessions: SessionInfo[];
}

export default function LlmUsageWidget({ sessions }: Props) {
  const [llms, setLlms] = useState<LlmCli[]>([CLAUDE_LLM_OPTION]);
  const [usage, setUsage] = useState<ClaudeUsage | null>(null);
  const [codexUsage, setCodexUsage] = useState<CodexUsage | null>(null);
  const [openId, setOpenId] = useState<string | null>(null);
  const [popoverPos, setPopoverPos] = useState<{ top: number; right: number } | null>(null);
  const [usageLoading, setUsageLoading] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);

  // a lista so tem scroll HORIZONTAL (overflow-x: auto), mas o mouse comum so
  // manda deltaY — sem isso o usuario nao consegue rolar pra ver as caixas
  // que passam da largura visivel, so quem tem trackpad/scroll horizontal
  // conseguiria. Traduz a rolagem vertical do mouse em scrollLeft.
  useEffect(() => {
    const el = rootRef.current;
    if (!el) return;
    const onWheel = (e: WheelEvent) => {
      if (el.scrollWidth <= el.clientWidth) return;
      const delta = Math.abs(e.deltaY) > Math.abs(e.deltaX) ? e.deltaY : e.deltaX;
      if (delta === 0) return;
      e.preventDefault();
      el.scrollLeft += delta;
    };
    el.addEventListener('wheel', onWheel, { passive: false });
    return () => el.removeEventListener('wheel', onWheel);
  }, [llms.length]);

  useEffect(() => {
    if (!openId) return;
    const onOutside = (e: MouseEvent) => {
      const target = e.target as Node;
      const insideRoot = rootRef.current && rootRef.current.contains(target);
      const insidePopover = (target as HTMLElement).closest?.('.llm-usage-popover');
      if (!insideRoot && !insidePopover) setOpenId(null);
    };
    document.addEventListener('mousedown', onOutside);
    return () => document.removeEventListener('mousedown', onOutside);
  }, [openId]);

  useEffect(() => {
    let cancelled = false;
    const load = () => {
      fetchLlms()
        .then((response) => {
          if (!cancelled) setLlms([CLAUDE_LLM_OPTION, ...response.llms]);
        })
        .catch(() => {
          /* backend indisponivel nesse ciclo — mantem a ultima lista conhecida */
        });
    };
    load();
    const id = setInterval(load, LLM_REFRESH_MS);
    return () => {
      cancelled = true;
      clearInterval(id);
    };
  }, []);

  const loadUsage = (silent = false, force = false) => {
    if (!silent) setUsageLoading(true);
    fetchUsage(force)
      .then((response) => {
        setUsage(response.claude);
        setCodexUsage(response.codex);
        // status do Claude nao vem do /api/llms (essa CLI e o proprio app);
        // sobrescreve o placeholder hardcoded com o status real de
        // autenticacao ja obtido nesta mesma chamada.
        setLlms((cur) =>
          cur.map((cli) =>
            cli.id === 'claude'
              ? {
                  ...cli,
                  connected: response.claudeAuthenticated,
                  status: response.claudeAuthenticated ? 'connected' : 'installed',
                }
              : cli,
          ),
        );
      })
      .catch(() => {
        /* mantem o ultimo valor conhecido */
      })
      .finally(() => setUsageLoading(false));
  };

  useEffect(() => {
    if (!SHOW_REAL_USAGE) return;
    loadUsage(true);
    const id = setInterval(() => loadUsage(true), USAGE_REFRESH_MS);
    return () => clearInterval(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // O Claude e a base do app e deve continuar visivel mesmo enquanto o backend
  // reinicia, a consulta de quota falha ou o token ainda nao foi encontrado.
  // As demais LLMs continuam aparecendo so quando conectadas.
  const connected = llms.filter((cli) => cli.id === 'claude' || cli.connected);

  return (
    <div className="llm-usage-widget" ref={rootRef}>
      {connected.map((cli) => {
        const Logo = llmLogoFor(cli.id);
        const countable = sessions.filter(isCountableSession);
        const forThisLlm = countable.filter((s) => sessionLlmBin(s) === cli.bin);
        const busy = forThisLlm.filter((s) => s.status === 'busy').length;
        const total = forThisLlm.length;

        const stateClass = busy > 0 ? 'busy' : total > 0 ? 'idle' : 'none';

        const isOpen = openId === cli.id;

        return (
          <button
            key={cli.id}
            type="button"
            className={`llm-usage-box ${stateClass}`}
            onClick={(e) => {
              if (isOpen) {
                setOpenId(null);
                setPopoverPos(null);
                return;
              }
              const rect = e.currentTarget.getBoundingClientRect();
              setPopoverPos({ top: rect.bottom + 8, right: window.innerWidth - rect.right });
              setOpenId(cli.id);
              // reforca um refresh na hora de abrir os detalhes, pra nao
              // depender so do polling de fundo (ate 60s desatualizado).
              if (SHOW_REAL_USAGE && (cli.id === 'claude' || cli.id === 'codex')) loadUsage(false, true);
            }}
          >
            <span className="llm-usage-box-logo">
              <Logo size={14} />
            </span>
            <span className="llm-usage-box-name">{cli.name}</span>
            {SHOW_REAL_USAGE && cli.id === 'claude' ? (
              <span className="llm-usage-box-pct">
                {usage?.fiveHour.utilization != null ? `${Math.round(usage.fiveHour.utilization)}%` : '—'}
              </span>
            ) : SHOW_REAL_USAGE && cli.id === 'codex' ? (
              <span className="llm-usage-box-pct">
                {codexUsage ? `${Math.round(codexUsage.primary.usedPercent)}%` : '—'}
              </span>
            ) : (
              total > 0 && <span className="llm-usage-box-pct">{total}</span>
            )}

            {/* popover estilizado (nao o title nativo do navegador) — abre so
                ao CLICAR nessa caixa especifica, nao no hover. Portal pro
                body: a caixinha fica dentro de um container com overflow
                (scroll horizontal da lista), entao um popover filho normal
                seria cortado no eixo vertical por esse overflow. */}
            {isOpen && popoverPos && createPortal(
              <div
                className="llm-usage-popover"
                style={{ position: 'fixed', top: popoverPos.top, right: popoverPos.right }}
                onMouseDown={(e) => e.stopPropagation()}
              >
                <div className="llm-usage-popover-header">
                  <span className="llm-usage-popover-name">{cli.name}</span>
                  {(busy > 0 ||
                    (cli.id === 'claude' && usage?.source === 'anthropic') ||
                    (cli.id === 'codex' && !!codexUsage)) && (
                    <span className="llm-usage-popover-live">
                      <span className="llm-usage-live-dot" /> ao vivo
                    </span>
                  )}
                  {SHOW_REAL_USAGE && (
                    <button
                      type="button"
                      className="llm-usage-refresh-btn"
                      title="atualizar agora"
                      onMouseDown={(e) => e.stopPropagation()}
                      onClick={(e) => {
                        // React propaga o clique de um portal pela arvore VIRTUAL,
                        // nao a posicao real no DOM — sem isso, o clique borbulhava
                        // ate o onClick do botao pai (llm-usage-box), que fecha o
                        // popover por achar que era um clique "fora" pra alternar.
                        e.stopPropagation();
                        if (cli.id === 'claude' || cli.id === 'codex') loadUsage(false, true);
                      }}
                    >
                      <RefreshCw size={11} className={usageLoading ? 'spinning' : ''} />
                    </button>
                  )}
                </div>

                {SHOW_REAL_USAGE && cli.id === 'claude' && usageLoading && !usage && (
                  <div className="llm-usage-popover-dim">buscando uso…</div>
                )}

                {SHOW_REAL_USAGE && cli.id === 'claude' && usage ? (() => {
                  const bars: UsageBar[] = [
                    { key: 'fiveHour', label: '5h', window: usage.fiveHour },
                    { key: 'sevenDay', label: 'semana', window: usage.sevenDay },
                    { key: 'opus', label: 'opus', window: usage.opus },
                  ];
                  const values = bars.map((b) => b.window?.utilization).filter((v): v is number => v != null);
                  const pico = values.length ? Math.max(...values) : null;
                  const bigPct = Math.round(usage.fiveHour.utilization ?? 0);
                  const weekPct = usage.sevenDay.utilization != null ? Math.round(usage.sevenDay.utilization) : null;
                  const picoPct = pico != null ? Math.round(pico) : null;
                  return (
                    <>
                      <div className="llm-usage-hero">
                        <span className="llm-usage-hero-pct">{bigPct}%</span>
                        <span className="llm-usage-hero-clock">
                          <Clock size={11} /> {formatResetShort(usage.fiveHour.resetsAt)}
                        </span>
                      </div>
                      <div className="llm-usage-hero-sub">
                        uso 5h · semana {weekPct ?? '—'}%
                      </div>

                      <div className="llm-usage-bars">
                        {bars.map((bar) => (
                          <UsageBarRow key={bar.key} bar={bar} />
                        ))}
                      </div>

                      <div className="llm-usage-reset-grid">
                        <div>
                          <span className="llm-usage-reset-label">reset 5h</span>
                          <span className="llm-usage-reset-value">{formatResetShort(usage.fiveHour.resetsAt)}</span>
                        </div>
                        <div>
                          <span className="llm-usage-reset-label">reset semana</span>
                          <span className="llm-usage-reset-value">{formatResetShort(usage.sevenDay.resetsAt)}</span>
                        </div>
                        <div>
                          <span className="llm-usage-reset-label">reset opus</span>
                          <span className="llm-usage-reset-value">{formatResetShort(usage.opus?.resetsAt ?? null)}</span>
                        </div>
                        <div>
                          <span className="llm-usage-reset-label">pico</span>
                          <span className="llm-usage-reset-value">{picoPct ?? '—'}%</span>
                        </div>
                      </div>

                      <div className="llm-usage-popover-footer">
                        <span><span className="llm-usage-live-dot muted" /> 5h · semana · opus</span>
                        <span>{usage.source === 'claude-cache' ? 'cache local' : `pico ${picoPct ?? '—'}%`}</span>
                      </div>
                    </>
                  );
                })() : null}

                {SHOW_REAL_USAGE && cli.id === 'claude' && !usage && !usageLoading && (
                  <div className="llm-usage-popover-dim">uso indisponivel ou backend antigo</div>
                )}

                {SHOW_REAL_USAGE && cli.id === 'codex' && usageLoading && !codexUsage && (
                  <div className="llm-usage-popover-dim">buscando uso…</div>
                )}

                {SHOW_REAL_USAGE && cli.id === 'codex' && codexUsage ? (() => {
                  const primaryPct = Math.round(codexUsage.primary.usedPercent);
                  const hasSecondary = codexUsage.secondary.windowMinutes > 0;
                  const secondaryPct = hasSecondary ? Math.round(codexUsage.secondary.usedPercent) : null;
                  const windowLabel = (minutes: number) =>
                    minutes >= 1440 ? `${Math.round(minutes / 1440)}d` : `${Math.round(minutes / 60)}h`;
                  const primaryLabel = windowLabel(codexUsage.primary.windowMinutes);
                  const secondaryLabel = hasSecondary ? windowLabel(codexUsage.secondary.windowMinutes) : '';
                  return (
                    <>
                      <div className="llm-usage-hero">
                        <span className="llm-usage-hero-pct">{primaryPct}%</span>
                        <span className="llm-usage-hero-clock">
                          <Clock size={11} /> {formatResetShortMs(codexUsage.primary.resetsAtMs)}
                        </span>
                      </div>
                      <div className="llm-usage-hero-sub">
                        plano {codexUsage.plan || '—'}
                        {codexUsage.rateLimited ? ' · limite atingido' : ''}
                      </div>

                      <div className="llm-usage-bars">
                        <UsageBarRow
                          bar={{ key: 'primary', label: primaryLabel, window: { utilization: primaryPct, resetsAt: null } }}
                        />
                        {hasSecondary && (
                          <UsageBarRow
                            bar={{
                              key: 'secondary',
                              label: secondaryLabel,
                              window: { utilization: secondaryPct, resetsAt: null },
                            }}
                          />
                        )}
                      </div>

                      <div className="llm-usage-reset-grid">
                        <div>
                          <span className="llm-usage-reset-label">reset {primaryLabel}</span>
                          <span className="llm-usage-reset-value">{formatResetShortMs(codexUsage.primary.resetsAtMs)}</span>
                        </div>
                        {hasSecondary && (
                          <div>
                            <span className="llm-usage-reset-label">reset {secondaryLabel}</span>
                            <span className="llm-usage-reset-value">
                              {formatResetShortMs(codexUsage.secondary.resetsAtMs)}
                            </span>
                          </div>
                        )}
                        <div>
                          <span className="llm-usage-reset-label">plano</span>
                          <span className="llm-usage-reset-value">{codexUsage.plan || '—'}</span>
                        </div>
                        <div>
                          <span className="llm-usage-reset-label">créditos</span>
                          <span className="llm-usage-reset-value">{codexUsage.resetCredits}</span>
                        </div>
                      </div>

                      <div className="llm-usage-popover-footer">
                        <span>
                          <span className="llm-usage-live-dot muted" /> {primaryLabel}
                          {hasSecondary ? ` · ${secondaryLabel}` : ''} · créditos
                        </span>
                        <span>{codexUsage.rateLimited ? 'limite atingido' : `${codexUsage.resetCredits} créditos`}</span>
                      </div>
                    </>
                  );
                })() : null}

                {SHOW_REAL_USAGE && cli.id === 'codex' && !codexUsage && !usageLoading && (
                  <div className="llm-usage-popover-dim">uso indisponível (codex não encontrado ou não autenticado)</div>
                )}

                <div className="llm-usage-popover-sessions">
                  {total > 0 ? `${busy} em execução de ${total} ${total !== 1 ? 'sessões' : 'sessão'}` : 'nenhuma sessão em uso'}
                </div>
              </div>,
              document.body,
            )}
          </button>
        );
      })}
    </div>
  );
}
