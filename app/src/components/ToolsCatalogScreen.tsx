import { useCallback, useEffect, useMemo, useState } from 'react';
import { Wrench, PencilSimpleLine } from '@phosphor-icons/react';
import { ToolDef, fetchTools } from '../api';
import CatalogScreen, { CatalogGroup } from './CatalogScreen';

interface Props { onBack: () => void; onOpenTool: (tool: ToolDef, allTools: ToolDef[]) => void; }

export default function ToolsCatalogScreen({ onBack, onOpenTool }: Props) {
  const [tools, setTools] = useState<ToolDef[]>([]);
  const [query, setQuery] = useState('');
  const reload = useCallback(() => { fetchTools().then((data) => setTools(data.tools)).catch(() => setTools([])); }, []);
  useEffect(() => { reload(); }, [reload]);
  const filtered = useMemo(() => { const q = query.trim().toLowerCase(); return q ? tools.filter((tool) => `${tool.name} ${tool.description}`.toLowerCase().includes(q)) : tools; }, [tools, query]);
  const groups: CatalogGroup<ToolDef>[] = filtered.length ? [{ key: 'tools', title: 'Tools registradas', items: filtered }] : [];
  return <CatalogScreen
    title="Tools"
    subtitle="Ferramentas disponíveis para os agentes do Orbit."
    groups={groups}
    query={query}
    onQueryChange={setQuery}
    onBack={onBack}
    itemKey={(tool) => tool.name}
    onOpenItem={(tool) => onOpenTool(tool, tools)}
    totalCount={tools.length}
    emptyIcon={<Wrench size={20} />}
    emptyTitle="Nenhuma tool encontrada"
    emptyText="As ferramentas detectadas no ambiente aparecerão aqui."
    noResultText="Nenhuma tool corresponde à busca"
    renderCard={(tool) => <><div className="catalog-card-name-row"><span className="catalog-card-name">{tool.name}</span><span className="catalog-card-badge">{tool.enabled ? 'Ativa' : 'Desativada'}</span></div><div className={`catalog-card-desc${tool.description ? '' : ' catalog-card-desc-empty'}`}>{tool.description || 'Sem descrição'}</div><div className="catalog-card-meta">Tool gerenciada pelo Orbit</div></>}
    cardActions={(tool) => <span role="button" tabIndex={0} className="catalog-card-action" aria-label={`Editar ${tool.name}`} title={`Editar ${tool.name}`} onClick={(event) => { event.stopPropagation(); onOpenTool(tool, tools); }} onKeyDown={(event) => { if (event.key === 'Enter') onOpenTool(tool, tools); }}><PencilSimpleLine size={14} /></span>}
  />;
}
