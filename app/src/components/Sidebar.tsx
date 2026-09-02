import { useEffect, useState } from 'react';
import { Plus, X, RefreshCw } from 'lucide-react';
import { fetchCatalog, fetchLlms, fetchUsage, fetchSecretGroups, fetchAiProviders, CatalogResponse, LlmCli, AgentFileKind, SecretGroup, AiProvider } from '../api';
import { CLAUDE_LLM_OPTION, llmLogoFor } from '../utils/llmLogos';
import { SectionKey, SECTION_ICONS, SECTION_LABELS } from '../utils/sidebarSections';
import ConnectLlmModal from './ConnectLlmModal';
import AgentEditModal from './AgentEditModal';
import SecretsModal from './SecretsModal';
import AiProviderModal from './AiProviderModal';
import './Sidebar.css';

interface Props {
  onClose: () => void;
  // secao escolhida na Activity Bar — a sidebar mostra SO o conteudo dessa
  // secao (como uma view do VS Code), nao um acordeao com todas juntas.
  activeSection?: SectionKey | null;
}

// sync automatico do status dos agentes/LLMs instalados na maquina — mesmo
// ritmo do LlmUsageWidget (unico lugar que ja fazia polling de verdade antes
// dessa correcao), pra nao ficar defasado em relacao ao resto da tela.
const AGENT_SYNC_MS = 4000;

export default function Sidebar({ onClose, activeSection }: Props) {
  const [catalog, setCatalog] = useState<CatalogResponse | null>(null);
  const [llms, setLlms] = useState<LlmCli[]>([CLAUDE_LLM_OPTION]);
  const [showConnect, setShowConnect] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [editTarget, setEditTarget] = useState<
    { name: string; subtitle?: string; kind: AgentFileKind; isNew?: boolean } | null
  >(null);
  const [secretGroups, setSecretGroups] = useState<SecretGroup[]>([]);
  const [secretsTarget, setSecretsTarget] = useState<{ group?: SecretGroup } | null>(null);
  const [aiProviders, setAiProviders] = useState<AiProvider[]>([]);
  const [aiProviderTarget, setAiProviderTarget] = useState<{ provider?: AiProvider } | null>(null);

  const reloadSecrets = () => fetchSecretGroups().then(setSecretGroups).catch(() => setSecretGroups([]));
  const reloadAiProviders = () => fetchAiProviders().then(setAiProviders).catch(() => setAiProviders([]));

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
      reloadSecrets(),
      reloadAiProviders(),
    ]).finally(() => setSyncing(false));
  };

  useEffect(() => {
    syncAll();
    const id = setInterval(syncAll, AGENT_SYNC_MS);
    return () => clearInterval(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // so mostra LLM que esta de fato instalada na maquina — sem botao de
  // conectar/desconectar aqui, essa lista e so informativa (o "+ Conectar
  // LLM" no titulo continua sendo o unico fluxo de instalar/logar).
  const installedLlms = llms.filter((l) => l.status !== 'none');

  const section = activeSection ?? 'llms';
  const sectionMeta = SECTION_ICONS.find((s) => s.key === section) ?? SECTION_ICONS[0];

  const sectionCount: Partial<Record<SectionKey, number>> = {
    llms: installedLlms.length,
    agents: catalog?.agents.length,
    skills: catalog?.skills.length,
    commands: catalog?.commands.length,
    tools: catalog?.tools.length,
    mcps: catalog?.mcps.length,
    secrets: secretGroups.length,
    aiProviders: aiProviders.length,
  };

  // botao "+" do cabecalho e especifico de cada secao (algumas nem tem, ex:
  // Tools/MCPs sao so leitura) — undefined esconde o botao.
  const onAdd: Partial<Record<SectionKey, { label: string; onClick: () => void }>> = {
    llms: { label: 'Conectar LLM', onClick: () => setShowConnect(true) },
    agents: { label: 'Criar agente', onClick: () => setEditTarget({ name: '', kind: 'agent', isNew: true }) },
    skills: { label: 'Criar skill', onClick: () => setEditTarget({ name: '', kind: 'skill', isNew: true }) },
    commands: { label: 'Criar comando', onClick: () => setEditTarget({ name: '', kind: 'command', isNew: true }) },
    secrets: { label: 'Novo grupo de chaves', onClick: () => setSecretsTarget({}) },
    aiProviders: { label: 'Novo provedor de IA', onClick: () => setAiProviderTarget({}) },
  };
  const addAction = onAdd[section];

  const renderBody = () => {
    switch (section) {
      case 'llms':
        return installedLlms.length === 0 ? (
          <div className="sidebar-empty">Nenhuma LLM instalada</div>
        ) : (
          installedLlms.map((llm) => {
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
          })
        );

      case 'agents':
        return (catalog?.agents || []).map((agent) => (
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
        ));

      case 'skills':
        return (catalog?.skills || []).map((skill) => (
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
        ));

      case 'commands':
        return (catalog?.commands || []).length === 0 ? (
          <div className="sidebar-empty">Nenhum comando configurado</div>
        ) : (
          (catalog?.commands || []).map((command) => (
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
          ))
        );

      case 'tools':
        return (
          <div className="sidebar-tools-grid">
            {(catalog?.tools || []).map((tool) => (
              <span key={tool} className="sidebar-tool-pill">{tool}</span>
            ))}
          </div>
        );

      case 'mcps':
        return (catalog?.mcps || []).length === 0 ? (
          <div className="sidebar-empty">Nenhum MCP configurado</div>
        ) : (
          (catalog?.mcps || []).map((mcp) => (
            <div key={mcp.name} className="sidebar-item">
              <span className={`sidebar-dot ${mcp.enabled ? 'on' : 'off'}`} />
              <div className="sidebar-item-body">
                <div className="sidebar-item-name">{mcp.name}</div>
                <div className="sidebar-item-sub">
                  {mcp.projects.length} {mcp.projects.length === 1 ? 'projeto' : 'projetos'}
                </div>
              </div>
            </div>
          ))
        );

      case 'secrets':
        return secretGroups.length === 0 ? (
          <div className="sidebar-empty">Nenhuma chave cadastrada</div>
        ) : (
          secretGroups.map((group) => (
            <button
              key={group.id}
              className="sidebar-item sidebar-item-stack sidebar-item-clickable"
              onClick={() => setSecretsTarget({ group })}
              type="button"
            >
              <div className="sidebar-item-name">{group.title}</div>
              <div className="sidebar-item-desc">
                {group.entries.length} {group.entries.length === 1 ? 'chave' : 'chaves'}
              </div>
            </button>
          ))
        );

      case 'aiProviders':
        return aiProviders.length === 0 ? (
          <div className="sidebar-empty">Nenhum provedor cadastrado</div>
        ) : (
          aiProviders.map((p) => (
            <button
              key={p.id}
              className="sidebar-item sidebar-item-stack sidebar-item-clickable"
              onClick={() => setAiProviderTarget({ provider: p })}
              type="button"
            >
              <div className="sidebar-item-name">{p.title}</div>
            </button>
          ))
        );

      default:
        return null;
    }
  };

  return (
    <>
      <div className="sidebar-panel">
        <div className="sidebar-header">
          <span className="sidebar-header-title">
            <sectionMeta.Icon size={14} />
            {SECTION_LABELS[section]}
            <span className="sidebar-header-count">{sectionCount[section] ?? ''}</span>
          </span>
          <span className="sidebar-header-actions">
            {addAction && (
              <button
                className="sidebar-close-btn"
                onClick={addAction.onClick}
                aria-label={addAction.label}
                title={addAction.label}
              >
                <Plus size={14} />
              </button>
            )}
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

        <div className="sidebar-content">{renderBody()}</div>
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
          aiProviders={aiProviders}
          onClose={() => {
            setEditTarget(null);
            syncAll();
          }}
        />
      )}

      {aiProviderTarget && (
        <AiProviderModal
          provider={aiProviderTarget.provider}
          onClose={() => setAiProviderTarget(null)}
          onSaved={reloadAiProviders}
        />
      )}

      {secretsTarget && (
        <SecretsModal
          group={secretsTarget.group}
          onClose={() => setSecretsTarget(null)}
          onSaved={reloadSecrets}
        />
      )}
    </>
  );
}
