import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { fetchLlms, fetchUsage, ClaudeUsage, LlmCli, SessionInfo } from '../api';
import { CLAUDE_LLM_OPTION, llmLogoFor } from '../utils/llmLogos';
import './LlmUsageWidget.css';

// mesmo intervalo do polling de sessoes (Home.tsx) — senao a caixinha de
// contagem de sessao (busy/total) fica visivelmente atrasada em relacao ao
// resto da tela, que ja atualiza a cada 2s.
const LLM_REFRESH_MS = 2000;

// sessao real de agente (nao node sintetico de MCP/skill, nao subagente) e o
// que conta como "uso" de uma LLM aqui — subagentes e nodes de atividade nao
// tem CLI/processo proprio, sempre herdam do agente raiz que ja e contado.
function isCountableSession(session: SessionInfo): boolean {
  return session.alive && !session.isMcp && !session.isSkill && !session.isSubagent;
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

interface Props {
  sessions: SessionInfo[];
}

export default function LlmUsageWidget({ sessions }: Props) {
  const [llms, setLlms] = useState<LlmCli[]>([CLAUDE_LLM_OPTION]);
  const [usage, setUsage] = useState<ClaudeUsage | null>(null);
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

  // uso real (%) so e buscado SOB DEMANDA, ao abrir o popover de detalhes —
  // o numero em si so muda quando a propria CLI decide atualizar o cache
  // (ex: rodando /usage), entao ficar consultando de 2 em 2s so gera trafego
  // sem nenhum dado novo. Clicar pra ver detalhes e o gatilho natural.
  const loadUsage = () => {
    setUsageLoading(true);
    fetchUsage()
      .then((response) => {
        setUsage(response.claude);
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

  // só mostra LLM conectada (o Claude sempre conta como conectado — é a base
  // do app) — as demais só aparecem aqui depois que o usuário instala/conecta
  // pelo modal, senão a caixinha não diz nada útil.
  const connected = llms.filter((cli) => cli.connected);

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
              // busca o uso so agora, ao abrir os detalhes — nao fica
              // pré-carregado nem exibido na caixinha.
              if (cli.id === 'claude') loadUsage();
            }}
          >
            <span className="llm-usage-box-logo">
              <Logo size={14} />
            </span>
            <span className="llm-usage-box-name">{cli.name}</span>
            {total > 0 && <span className="llm-usage-box-pct">{total}</span>}

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
                <div className="llm-usage-popover-name">{cli.name}</div>
                {cli.id === 'claude' && usageLoading && (
                  <div className="llm-usage-popover-dim">buscando uso…</div>
                )}
                {cli.id === 'claude' && !usageLoading && usage ? (
                  <>
                    <div className="llm-usage-popover-row">
                      <span>sessão atual (5h)</span>
                      <b>{usage.fiveHour.utilization ?? '—'}%</b>
                    </div>
                    <div className="llm-usage-popover-dim">{formatResetsAt(usage.fiveHour.resetsAt)}</div>
                    <div className="llm-usage-popover-row">
                      <span>semana (7d)</span>
                      <b>{usage.sevenDay.utilization ?? '—'}%</b>
                    </div>
                    <div className="llm-usage-popover-dim">{formatResetsAt(usage.sevenDay.resetsAt)}</div>
                  </>
                ) : null}
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
