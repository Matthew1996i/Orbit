import { useEffect, useState } from 'react';
import { Plus, RefreshCw, LayoutGrid } from 'lucide-react';
import { fetchCatalog, fetchSecretGroups, fetchAiProviders, CatalogResponse, LlmCli, AgentFileKind, SecretGroup, AiProvider, McpDef } from '../api';
import { CLAUDE_LLM_OPTION, llmLogoFor } from '../utils/llmLogos';
import { fetchAllLlms } from '../utils/llmCatalog';
import { SectionKey, SECTION_ICONS, SECTION_LABELS } from '../utils/sidebarSections';
import './Sidebar.css';

interface Props {
  onClose: () => void;
  // secao escolhida na Activity Bar — a sidebar mostra SO o conteudo dessa
  // secao (como uma view do VS Code), nao um acordeao com todas juntas.
  activeSection?: SectionKey | null;
  // LLMs sao o primeiro caso do padrao "tela cheia" (ver LlmCatalogScreen /
  // LlmDetailScreen) — o "+" e o clique num item ja instalado nao abrem mais
  // modal, pedem pro AppShell trocar o conteudo principal.
  onOpenLlmCatalog?: () => void;
  onOpenLlmDetail?: (id: string) => void;
  // segundo caso do padrao "tela cheia" — Agentes, Skills e Commands. O "+"/grade abre
  // o CATALOGO (lista tudo, com o botao de criar LA DENTRO) em vez de pular
  // direto pro formulario de criacao — mesmo padrao do "+" de LLMs
  // (onOpenLlmCatalog).
  onOpenAgentCatalog?: () => void;
  onOpenAgentEdit?: (name: string, kind: AgentFileKind, subtitle?: string, isNew?: boolean) => void;
  onOpenSkillCatalog?: () => void;
  onOpenSkillEdit?: (name: string, subtitle?: string, isNew?: boolean) => void;
  onOpenCommandCatalog?: () => void;
  onOpenCommandEdit?: (name: string, subtitle?: string, isNew?: boolean) => void;
  onOpenMcpCatalog?: () => void;
  onOpenMcpEdit?: (mcp: McpDef) => void;
  onOpenSecretsCatalog?: () => void;
  onOpenSecretEdit?: (group: SecretGroup) => void;
  onOpenAiProvidersCatalog?: () => void;
  onOpenAiProviderEdit?: (provider: AiProvider) => void;
}

export default function Sidebar({
  onClose,
  activeSection,
  onOpenLlmCatalog,
  onOpenLlmDetail,
  onOpenAgentCatalog,
  onOpenAgentEdit,
  onOpenSkillCatalog,
  onOpenSkillEdit,
  onOpenCommandCatalog,
  onOpenCommandEdit,
  onOpenMcpCatalog,
  onOpenMcpEdit,
  onOpenSecretsCatalog,
  onOpenSecretEdit,
  onOpenAiProvidersCatalog,
  onOpenAiProviderEdit,
}: Props) {
  const [catalog, setCatalog] = useState<CatalogResponse | null>(null);
  const [llms, setLlms] = useState<LlmCli[]>([CLAUDE_LLM_OPTION]);
  const [syncing, setSyncing] = useState(false);
  const [secretGroups, setSecretGroups] = useState<SecretGroup[]>([]);
  const [aiProviders, setAiProviders] = useState<AiProvider[]>([]);

  const reloadSecrets = () => fetchSecretGroups().then(setSecretGroups).catch(() => setSecretGroups([]));
  const reloadAiProviders = () => fetchAiProviders().then(setAiProviders).catch(() => setAiProviders([]));

  const reloadLlms = () => fetchAllLlms().then(setLlms);

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

  // botao do cabecalho e especifico de cada secao (algumas nem tem, ex:
  // Tools/MCPs sao so leitura) — undefined esconde o botao. Icone varia por
  // INTENCAO: "+" so pras acoes que criam algo na hora (skill/comando/grupo/
  // provedor); LLMs e Agentes na verdade abrem uma tela de catalogo pra
  // navegar/escolher, entao usam o mesmo icone de grade da lista — um "+"
  // ali sugeria "criar" e confundia quem esperava um item novo aparecer.
  const onAdd: Partial<Record<SectionKey, { label: string; icon: typeof Plus; onClick: () => void }>> = {
    llms: { label: 'Ver catálogo de LLMs', icon: LayoutGrid, onClick: () => onOpenLlmCatalog?.() },
    agents: { label: 'Ver catálogo de agentes', icon: LayoutGrid, onClick: () => onOpenAgentCatalog?.() },
    skills: { label: 'Ver catálogo de skills', icon: LayoutGrid, onClick: () => onOpenSkillCatalog?.() },
    commands: { label: 'Ver catálogo de commands', icon: LayoutGrid, onClick: () => onOpenCommandCatalog?.() },
    mcps: { label: 'Gerenciar MCPs', icon: LayoutGrid, onClick: () => onOpenMcpCatalog?.() },
    secrets: { label: 'Gerenciar chaves e tokens', icon: LayoutGrid, onClick: () => onOpenSecretsCatalog?.() },
    aiProviders: { label: 'Gerenciar provedores de IA', icon: LayoutGrid, onClick: () => onOpenAiProvidersCatalog?.() },
  };
  const addAction = onAdd[section];

  const renderBody = () => {
    switch (section) {
      case 'llms':
        return (
          <>
            {installedLlms.length === 0 ? (
              <div className="sidebar-empty">Nenhuma LLM instalada</div>
            ) : (
              installedLlms.map((llm) => {
                const Logo = llmLogoFor(llm.id);
                return (
                  <button
                    key={llm.id}
                    className="sidebar-item sidebar-item-clickable"
                    onClick={() => onOpenLlmDetail?.(llm.id)}
                    type="button"
                  >
                    <span className="sidebar-item-logo">
                      <Logo size={15} />
                    </span>
                    <div className="sidebar-item-body">
                      <div className="sidebar-item-name">{llm.name}</div>
                      <div className="sidebar-item-sub">{llm.vendor}</div>
                    </div>
                    <span className={`sidebar-dot ${llm.status === 'connected' ? 'on' : 'warn'}`} />
                  </button>
                );
              })
            )}
          </>
        );

      case 'agents':
        return (catalog?.agents || []).map((agent) => (
          <button
            key={agent.name}
            className="sidebar-item sidebar-item-stack sidebar-item-clickable"
            onClick={() =>
              onOpenAgentEdit?.(
                agent.name,
                'agent',
                [agent.model && `modelo: ${agent.model}`, agent.tools && `tools: ${agent.tools}`]
                  .filter(Boolean)
                  .join(' · '),
              )
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
        return (catalog?.skills || []).length === 0 ? (
          <div className="sidebar-empty">Nenhuma skill configurada</div>
        ) : (
          (catalog?.skills || []).map((skill) => (
            <button
              key={skill.name}
              className="sidebar-item sidebar-item-stack sidebar-item-clickable"
              onClick={() =>
                onOpenSkillEdit?.(skill.name, skill.version ? `versão: ${skill.version}` : undefined)
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
          ))
        );

      case 'commands':
        return (catalog?.commands || []).length === 0 ? (
          <div className="sidebar-empty">Nenhum comando configurado</div>
        ) : (
          (catalog?.commands || []).map((command) => (
            <button
              key={command.name}
              className="sidebar-item sidebar-item-stack sidebar-item-clickable"
              onClick={() => onOpenCommandEdit?.(command.name, command.description || undefined)}
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
            <button key={mcp.name} className="sidebar-item sidebar-item-clickable" onClick={() => onOpenMcpEdit?.(mcp)} type="button">
              <span className={`sidebar-dot ${mcp.enabled ? 'on' : 'off'}`} />
              <div className="sidebar-item-body">
                <div className="sidebar-item-name">{mcp.name}</div>
                <div className="sidebar-item-sub">
                  {mcp.enabled ? 'Disponível para agentes novos' : 'Desabilitado'}
                </div>
              </div>
            </button>
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
              onClick={() => onOpenSecretEdit?.(group)}
              type="button"
            >
              <div className="sidebar-item-name">
                {group.title}
                <span className="sidebar-item-badge">{group.identifier}</span>
              </div>
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
              onClick={() => onOpenAiProviderEdit?.(p)}
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
                <addAction.icon size={14} />
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
          </span>
        </div>

        <div className="sidebar-content">{renderBody()}</div>
      </div>

    </>
  );
}
