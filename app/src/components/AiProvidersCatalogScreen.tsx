import { useCallback, useEffect, useMemo, useState } from 'react';
import { Brain } from '@phosphor-icons/react';
import { AiProvider, fetchAiProviders } from '../api';
import CatalogScreen, { CatalogGroup } from './CatalogScreen';

interface Props { onBack: () => void; onOpenProvider: (provider?: AiProvider) => void; }

export default function AiProvidersCatalogScreen({ onBack, onOpenProvider }: Props) {
  const [providers, setProviders] = useState<AiProvider[]>([]);
  const [query, setQuery] = useState('');
  const reload = useCallback(() => fetchAiProviders().then(setProviders).catch(() => setProviders([])), []);
  useEffect(() => { reload(); }, [reload]);
  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return q ? providers.filter((provider) => `${provider.title} ${provider.model} ${provider.baseUrl}`.toLowerCase().includes(q)) : providers;
  }, [providers, query]);
  const groups: CatalogGroup<AiProvider>[] = [
    { key: 'anthropic', title: 'Formato Anthropic', items: filtered.filter((provider) => provider.provider === 'anthropic') },
    { key: 'openai', title: 'Formato OpenAI', items: filtered.filter((provider) => provider.provider === 'openai') },
  ].filter((group) => group.items.length);
  return <>
    <CatalogScreen title="Provedores de IA" subtitle="Conexões usadas para gerar e refinar agentes, skills e commands." groups={groups} query={query} onQueryChange={setQuery} createLabel="Novo provedor" onCreate={() => onOpenProvider()} onBack={onBack} itemKey={(provider) => provider.id} onOpenItem={onOpenProvider} totalCount={providers.length} emptyIcon={<Brain size={20} />} emptyTitle="Nenhum provedor cadastrado" emptyText="Cadastre um provedor para usar a geração com IA." noResultText="Nenhum provedor encontrado" renderCard={(provider) => <><div className="catalog-card-name-row"><span className="catalog-card-name">{provider.title}</span><span className="catalog-card-badge">{provider.provider}</span></div><div className="catalog-card-desc" title={provider.model || undefined}>{provider.model || 'Modelo padrão'}</div><div className="catalog-card-meta">{provider.baseUrl || 'Endpoint padrão do provedor'}</div></>} />
  </>;
}
