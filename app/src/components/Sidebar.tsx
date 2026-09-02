import { useEffect, useState } from 'react';
import { ChevronDown, ChevronRight, Plug, Bot, Sparkles, SquareSlash, Wrench, Server, Plus, X, PanelLeft, RefreshCw } from 'lucide-react';
import { fetchCatalog, fetchLlms, fetchUsage, CatalogResponse, LlmCli, AgentFileKind } from '../api';
import { CLAUDE_LLM_OPTION, llmLogoFor } from '../utils/llmLogos';
import ConnectLlmModal from './ConnectLlmModal';
import AgentEditModal from './AgentEditModal';
import './Sidebar.css';

interface Props {
  onClose: () => void;
}

type SectionKey = 'llms' | 'agents' | 'skills' | 'commands' | 'tools' | 'mcps';

// sync automatico do status dos agentes/LLMs instalados na maquina — mesmo
// ritmo do LlmUsageWidget (unico lugar que ja fazia polling de verdade antes
// dessa correcao), pra nao ficar defasado em relacao ao resto da tela.
const AGENT_SYNC_MS = 4000;

const SECTION_LABELS: Record<SectionKey, string> = {
  llms: 'LLMs instaladas',
  agents: 'Agentes',
  skills: 'Skills',
  commands: 'Commands',
  tools: 'Tools',
  mcps: 'MCPs conectados',
};

export default function Sidebar({ onClose }: Props) {
  const [catalog, setCatalog] = useState<CatalogResponse | null>(null);
  const [llms, setLlms] = useState<LlmCli[]>([CLAUDE_LLM_OPTION]);
  // todas as secoes comecam fechadas — o usuario abre so o que interessa.
  const [expanded, setExpanded] = useState<Record<SectionKey, boolean>>({
    llms: false,
    agents: false,
    skills: false,
    commands: false,
    tools: false,
    mcps: false,
  });
  const [showConnect, setShowConnect] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [editTarget, setEditTarget] = useState<
    { name: string; subtitle?: string; kind: AgentFileKind; isNew?: boolean } | null
  >(null);

  const reloadLlms = () =>
    fetchLlms()
      .then((r) => {
        setLlms([CLAUDE_LLM_OPTION, ...r.llms]);
        // status do Claude nao vem do /api/llms (essa CLI e o proprio app),
        // entao busca o status real de autenticacao a parte e sobrescreve
        // o placeholder hardcoded assim que resolver.
        return fetchUsage()
          .then(({ claudeAuthenticated }) => {
            setLlms((cur) =>
              cur.map((llm) =>
                llm.id === 'claude'
                  ? { ...llm, connected: claudeAuthenticated, status: claudeAuthenticated ? 'connected' : 'installed' }
                  : llm,
              ),
            );
          })
          .catch(() => {});
      })
      .catch(() => setLlms([CLAUDE_LLM_OPTION]));

  // sync manual (botao) e automatico (polling) fazem a MESMA coisa: releem
  // tanto o catalogo (agentes/skills/tools/mcps) quanto o status das LLMs
  // (instalado/logado) — sem isso um agente instalado ou logado depois que a
  // sidebar ja estava aberta so aparecia ao reabrir o painel.
  const syncAll = () => {
    setSyncing(true);
    return Promise.all([
      fetchCatalog().then(setCatalog).catch(() => setCatalog(null)),
      reloadLlms(),
    ]).finally(() => setSyncing(false));
  };

  useEffect(() => {
    syncAll();
    const id = setInterval(syncAll, AGENT_SYNC_MS);
    return () => clearInterval(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const toggle = (key: SectionKey) => setExpanded((cur) => ({ ...cur, [key]: !cur[key] }));

  // so mostra LLM que esta de fato instalada na maquina — sem botao de
  // conectar/desconectar aqui, essa lista e so informativa (o "+ Conectar
  // LLM" no titulo continua sendo o unico fluxo de instalar/logar).
  const installedLlms = llms.filter((l) => l.status !== 'none');

  return (
    <>
    <div className="sidebar-panel">
      <div className="sidebar-header">
          <span className="sidebar-header-title">
            <PanelLeft size={14} color="#ffffff" />
            Recursos disponíveis
          </span>
          <span className="sidebar-header-actions">
            <button
              className="sidebar-close-btn"
              onClick={() => syncAll()}
              aria-label="Sincronizar"
              title="Sincronizar agentes/LLMs instalados"
              disabled={syncing}
            >
              <RefreshCw size={14} className={syncing ? 'spinning' : ''} />
            </button>
            <button className="sidebar-close-btn" onClick={onClose} aria-label="Fechar">
              <X size={15} />
            </button>
          </span>
        </div>

        <div className="sidebar-content">
          <section className="sidebar-section">
            <div className="sidebar-section-row">
              <button className="sidebar-section-head" onClick={() => toggle('llms')}>
                {expanded.llms ? <ChevronDown size={13} /> : <ChevronRight size={13} />}
                <Plug size={13} />
                <span>{SECTION_LABELS.llms}</span>
                <span className="sidebar-section-count">
                  {llms.filter((l) => l.status === 'connected').length}/{installedLlms.length}
                </span>
              </button>
              <button
                className="sidebar-section-add-btn"
                onClick={() => setShowConnect(true)}
                aria-label="Conectar LLM"
                title="Conectar LLM"
              >
                <Plus size={13} />
              </button>
            </div>
            {expanded.llms && (
              <div className="sidebar-section-body">
                {installedLlms.length === 0 && <div className="sidebar-empty">Nenhuma LLM instalada</div>}
                {installedLlms.map((llm) => {
                  const Logo = llmLogoFor(llm.id);
                  return (
                    <div key={llm.id} className="sidebar-item">
                      <span className="sidebar-item-logo">
                        <Logo size={15} />
                      </span>
                      <div className="sidebar-item-body">
                        <div className="sidebar-item-name">{llm.name}</div>
                        <div className="sidebar-item-sub">{llm.vendor}</div>
                      </div>
                      <span className={`sidebar-dot ${llm.status === 'connected' ? 'on' : 'warn'}`} />
                    </div>
                  );
                })}
              </div>
            )}
          </section>

          <section className="sidebar-section">
            <div className="sidebar-section-row">
              <button className="sidebar-section-head" onClick={() => toggle('agents')}>
                {expanded.agents ? <ChevronDown size={13} /> : <ChevronRight size={13} />}
                <Bot size={13} />
                <span>{SECTION_LABELS.agents}</span>
                <span className="sidebar-section-count">{catalog?.agents.length ?? '…'}</span>
              </button>
              <button
                className="sidebar-section-add-btn"
                onClick={() => setEditTarget({ name: '', kind: 'agent', isNew: true })}
                aria-label="Criar agente"
                title="Criar agente"
              >
                <Plus size={13} />
              </button>
            </div>
            {expanded.agents && (
              <div className="sidebar-section-body">
                {(catalog?.agents || []).map((agent) => (
                  <button
                    key={agent.name}
                    className="sidebar-item sidebar-item-stack sidebar-item-clickable"
                    onClick={() =>
                      setEditTarget({
                        name: agent.name,
                        kind: 'agent',
                        subtitle: [agent.model && `modelo: ${agent.model}`, agent.tools && `tools: ${agent.tools}`]
                          .filter(Boolean)
                          .join(' · '),
                      })
                    }
                    type="button"
                  >
                    <div className="sidebar-item-name">
                      {agent.name}
                      {agent.model && <span className="sidebar-item-badge">{agent.model}</span>}
                    </div>
                    <div className="sidebar-item-desc" title={agent.description}>
                      {agent.description}
                    </div>
                  </button>
                ))}
              </div>
            )}
          </section>

          <section className="sidebar-section">
            <div className="sidebar-section-row">
              <button className="sidebar-section-head" onClick={() => toggle('skills')}>
                {expanded.skills ? <ChevronDown size={13} /> : <ChevronRight size={13} />}
                <Sparkles size={13} />
                <span>{SECTION_LABELS.skills}</span>
                <span className="sidebar-section-count">{catalog?.skills.length ?? '…'}</span>
              </button>
              <button
                className="sidebar-section-add-btn"
                onClick={() => setEditTarget({ name: '', kind: 'skill', isNew: true })}
                aria-label="Criar skill"
                title="Criar skill"
              >
                <Plus size={13} />
              </button>
            </div>
            {expanded.skills && (
              <div className="sidebar-section-body">
                {(catalog?.skills || []).map((skill) => (
                  <button
                    key={skill.name}
                    className="sidebar-item sidebar-item-stack sidebar-item-clickable"
                    onClick={() =>
                      setEditTarget({
                        name: skill.name,
                        kind: 'skill',
                        subtitle: skill.version ? `versão: ${skill.version}` : undefined,
                      })
                    }
                    type="button"
                  >
                    <div className="sidebar-item-name">
                      {skill.name}
                      {skill.version && <span className="sidebar-item-badge">v{skill.version}</span>}
                    </div>
                    <div className="sidebar-item-desc" title={skill.description}>
                      {skill.description}
                    </div>
                  </button>
                ))}
              </div>
            )}
          </section>

          <section className="sidebar-section">
            <div className="sidebar-section-row">
              <button className="sidebar-section-head" onClick={() => toggle('commands')}>
                {expanded.commands ? <ChevronDown size={13} /> : <ChevronRight size={13} />}
                <SquareSlash size={13} />
                <span>{SECTION_LABELS.commands}</span>
                <span className="sidebar-section-count">{catalog?.commands.length ?? '…'}</span>
              </button>
              <button
                className="sidebar-section-add-btn"
                onClick={() => setEditTarget({ name: '', kind: 'command', isNew: true })}
                aria-label="Criar comando"
                title="Criar comando"
              >
                <Plus size={13} />
              </button>
            </div>
            {expanded.commands && (
              <div className="sidebar-section-body">
                {(catalog?.commands || []).length === 0 && (
                  <div className="sidebar-empty">Nenhum comando configurado</div>
                )}
                {(catalog?.commands || []).map((command) => (
                  <button
                    key={command.name}
                    className="sidebar-item sidebar-item-stack sidebar-item-clickable"
                    onClick={() => setEditTarget({ name: command.name, kind: 'command' })}
                    type="button"
                  >
                    <div className="sidebar-item-name">/{command.name}</div>
                    {command.description && (
                      <div className="sidebar-item-desc" title={command.description}>
                        {command.description}
                      </div>
                    )}
                  </button>
                ))}
              </div>
            )}
          </section>

          <section className="sidebar-section">
            <div className="sidebar-section-row">
              <button className="sidebar-section-head" onClick={() => toggle('tools')}>
                {expanded.tools ? <ChevronDown size={13} /> : <ChevronRight size={13} />}
                <Wrench size={13} />
                <span>{SECTION_LABELS.tools}</span>
                <span className="sidebar-section-count">{catalog?.tools.length ?? '…'}</span>
              </button>
            </div>
            {expanded.tools && (
              <div className="sidebar-section-body sidebar-tools-grid">
                {(catalog?.tools || []).map((tool) => (
                  <span key={tool} className="sidebar-tool-pill">{tool}</span>
                ))}
              </div>
            )}
          </section>

          <section className="sidebar-section">
            <div className="sidebar-section-row">
              <button className="sidebar-section-head" onClick={() => toggle('mcps')}>
                {expanded.mcps ? <ChevronDown size={13} /> : <ChevronRight size={13} />}
                <Server size={13} />
                <span>{SECTION_LABELS.mcps}</span>
                <span className="sidebar-section-count">{catalog?.mcps.length ?? '…'}</span>
              </button>
            </div>
            {expanded.mcps && (
              <div className="sidebar-section-body">
                {(catalog?.mcps || []).length === 0 && (
                  <div className="sidebar-empty">Nenhum MCP configurado</div>
                )}
                {(catalog?.mcps || []).map((mcp) => (
                  <div key={mcp.name} className="sidebar-item">
                    <span className={`sidebar-dot ${mcp.enabled ? 'on' : 'off'}`} />
                    <div className="sidebar-item-body">
                      <div className="sidebar-item-name">{mcp.name}</div>
                      <div className="sidebar-item-sub">
                        {mcp.projects.length} {mcp.projects.length === 1 ? 'projeto' : 'projetos'}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </section>
        </div>
      </div>

      {showConnect && (
        <ConnectLlmModal
          llms={llms}
          onClose={() => setShowConnect(false)}
          onInstalled={reloadLlms}
        />
      )}

      {editTarget && (
        <AgentEditModal
          name={editTarget.name}
          subtitle={editTarget.subtitle}
          kind={editTarget.kind}
          isNew={editTarget.isNew}
          onClose={() => {
            setEditTarget(null);
            syncAll();
          }}
        />
      )}

    </>
  );
}
