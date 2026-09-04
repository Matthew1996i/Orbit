import { useEffect, useMemo, useState } from 'react';
import { ConfigProvider, Input, Typography, Button } from 'antd';
import { ArrowLeft, Search, SearchX, Plus, ChevronRight, Bot } from 'lucide-react';
import { AgentDef, fetchCatalog } from '../api';
import { useLlmScreenTheme } from '../utils/llmScreenTheme';
import './LlmScreens.css';
import './AgentCatalogScreen.css';

const { Title, Text } = Typography;

interface Props {
  onBack: () => void;
  onOpenAgent: (name: string, subtitle?: string) => void;
  onCreateAgent: () => void;
}

function agentSubtitle(agent: AgentDef): string | undefined {
  return [agent.model && `modelo: ${agent.model}`, agent.tools && `tools: ${agent.tools}`]
    .filter(Boolean)
    .join(' · ') || undefined;
}

// tiers conhecidos primeiro (ordem editorial, do maior pro menor modelo),
// "outro" por ultimo pra cobrir modelo vazio/custom sem quebrar o agrupamento
// — mesma ideia do GROUPS do LlmCatalogScreen, so que aqui deriva do valor
// livre `agent.model` em vez de um enum fixo do backend.
type ModelTier = 'opus' | 'sonnet' | 'haiku' | 'other';

const MODEL_TIERS: { key: ModelTier; title: string }[] = [
  { key: 'opus', title: 'Opus' },
  { key: 'sonnet', title: 'Sonnet' },
  { key: 'haiku', title: 'Haiku' },
  { key: 'other', title: 'Outros' },
];

function modelTierOf(model: string | undefined): ModelTier {
  const normalized = (model || '').toLowerCase();
  if (normalized.includes('opus')) return 'opus';
  if (normalized.includes('sonnet')) return 'sonnet';
  if (normalized.includes('haiku')) return 'haiku';
  return 'other';
}

function toolCountOf(tools: string | undefined): number {
  if (!tools) return 0;
  return tools.split(',').map((tool) => tool.trim()).filter(Boolean).length;
}

// tela cheia (mesmo padrao do catalogo de LLMs, ver LlmCatalogScreen) aberta
// pelo "+" da secao Agentes — lista TODOS os agentes cadastrados, com busca
// e o botao de criar um novo aqui dentro (em vez do "+" ja pular direto pro
// formulario de criacao). Clicar num agente existente abre o AgentEditScreen
// em modo edicao; autocontida, busca os proprios dados.
export default function AgentCatalogScreen({ onBack, onOpenAgent, onCreateAgent }: Props) {
  const theme = useLlmScreenTheme();
  const [agents, setAgents] = useState<AgentDef[]>([]);
  const [query, setQuery] = useState('');

  useEffect(() => {
    fetchCatalog()
      .then((c) => setAgents(c.agents))
      .catch(() => setAgents([]));
  }, []);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return agents;
    return agents.filter(
      (a) => a.name.toLowerCase().includes(q) || a.description.toLowerCase().includes(q),
    );
  }, [agents, query]);

  const grouped = useMemo(
    () =>
      MODEL_TIERS.map((tier) => ({ ...tier, items: filtered.filter((agent) => modelTierOf(agent.model) === tier.key) })).filter(
        (tier) => tier.items.length,
      ),
    [filtered],
  );

  return (
    <ConfigProvider theme={theme}>
      <div className="agent-catalog-screen">
        <div className="agent-catalog-toolbar">
          <div className="llm-screen-header">
            <button className="llm-screen-back" onClick={onBack} aria-label="Voltar">
              <ArrowLeft size={16} />
            </button>
            <div>
              <Title level={3} className="llm-screen-title">Agentes</Title>
              <Text className="llm-screen-subtitle">Subagentes configurados neste projeto.</Text>
            </div>
          </div>
        </div>

        {/* busca+acao fora da div do titulo — pertencem ao conteudo da
            tela, nao ao cabecalho (que so tem titulo/voltar). */}
        <div className="agent-catalog-toolbar-actions">
          <Input
            size="large"
            className="llm-catalog-search"
            prefix={<Search size={14} color="#a3a3ab" />}
            placeholder="Buscar por nome ou descrição…"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            allowClear
            autoFocus
            spellCheck={false}
          />
          <Button className="llm-btn llm-btn-primary" icon={<Plus size={13} />} onClick={onCreateAgent}>
            Criar agente
          </Button>
        </div>

        {filtered.length === 0 && (
          <div className="llm-catalog-empty">
            <span className="llm-catalog-empty-icon">
              {agents.length === 0 ? <Bot size={20} strokeWidth={1.75} /> : <SearchX size={20} strokeWidth={1.75} />}
            </span>
            <div className="llm-catalog-empty-title">
              {agents.length === 0 ? 'Nenhum agente cadastrado' : 'Nenhum agente encontrado'}
            </div>
            <div className="llm-catalog-empty-text">
              {agents.length === 0
                ? 'Crie o primeiro agente com o botão acima.'
                : `Não encontramos resultados para "${query}". Tente outro nome ou descrição.`}
            </div>
          </div>
        )}

        {grouped.map((tier) => (
          <section key={tier.key} className="llm-group">
            <div className="llm-group-header">
              <span className="llm-group-title">{tier.title}</span>
              <span className="llm-group-count">{tier.items.length}</span>
            </div>

            <div className="agent-catalog-grid">
              {tier.items.map((agent) => {
                const toolCount = toolCountOf(agent.tools);
                return (
                  <button
                    key={agent.name}
                    className="agent-catalog-card"
                    onClick={() => onOpenAgent(agent.name, agentSubtitle(agent))}
                  >
                    <div className="agent-catalog-card-body">
                      <div className="agent-catalog-card-name-row">
                        <span className="agent-catalog-card-name">{agent.name}</span>
                        {agent.model && <span className="agent-catalog-card-badge">{agent.model}</span>}
                      </div>
                      <div
                        className={`agent-catalog-card-desc${agent.description ? '' : ' agent-catalog-card-desc-empty'}`}
                        title={agent.description || undefined}
                      >
                        {agent.description || 'Sem instruções'}
                      </div>
                      <div className="agent-catalog-card-meta">
                        {toolCount} {toolCount === 1 ? 'ferramenta' : 'ferramentas'}
                      </div>
                    </div>
                    <ChevronRight size={16} className="llm-card-chevron" />
                  </button>
                );
              })}
            </div>
          </section>
        ))}
      </div>
    </ConfigProvider>
  );
}
