import { useEffect, useMemo, useState } from 'react';
import { Bot } from 'lucide-react';
import { AgentDef, fetchCatalog } from '../api';
import CatalogScreen, { CatalogGroup } from './CatalogScreen';

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
// em modo edicao; autocontida, busca os proprios dados. O visual/grid/busca/
// estado vazio vem do CatalogScreen generico (ver comentario la); aqui so
// fica o que e especifico de agente: tiers por modelo e o corpo do card.
export default function AgentCatalogScreen({ onBack, onOpenAgent, onCreateAgent }: Props) {
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

  const groups: CatalogGroup<AgentDef>[] = useMemo(
    () =>
      MODEL_TIERS.map((tier) => ({
        key: tier.key,
        title: tier.title,
        items: filtered.filter((agent) => modelTierOf(agent.model) === tier.key),
      })).filter((tier) => tier.items.length),
    [filtered],
  );

  return (
    <CatalogScreen
      title="Agentes"
      subtitle="Subagentes configurados neste projeto."
      groups={groups}
      query={query}
      onQueryChange={setQuery}
      createLabel="Criar agente"
      onCreate={onCreateAgent}
      onBack={onBack}
      itemKey={(agent) => agent.name}
      onOpenItem={(agent) => onOpenAgent(agent.name, agentSubtitle(agent))}
      totalCount={agents.length}
      emptyIcon={<Bot size={20} strokeWidth={1.75} />}
      emptyTitle="Nenhum agente cadastrado"
      emptyText="Crie o primeiro agente com o botão acima."
      noResultText="Nenhum agente encontrado"
      renderCard={(agent) => {
        const toolCount = toolCountOf(agent.tools);
        return (
          <>
            <div className="catalog-card-name-row">
              <span className="catalog-card-name">{agent.name}</span>
              {agent.model && <span className="catalog-card-badge">{agent.model}</span>}
            </div>
            <div
              className={`catalog-card-desc${agent.description ? '' : ' catalog-card-desc-empty'}`}
              title={agent.description || undefined}
            >
              {agent.description || 'Sem instruções'}
            </div>
            <div className="catalog-card-meta">
              {toolCount} {toolCount === 1 ? 'ferramenta' : 'ferramentas'}
            </div>
          </>
        );
      }}
    />
  );
}
