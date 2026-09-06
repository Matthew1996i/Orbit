import { useCallback, useEffect, useMemo, useState } from 'react';
import { Server } from 'lucide-react';
import { McpDef, fetchMcps } from '../api';
import CatalogScreen, { CatalogGroup } from './CatalogScreen';

interface Props {
  onBack: () => void;
  onOpenMcp: (mcp: McpDef) => void;
  onCreateMcp: () => void;
}

export default function McpCatalogScreen({ onBack, onOpenMcp, onCreateMcp }: Props) {
  const [mcps, setMcps] = useState<McpDef[]>([]);
  const [query, setQuery] = useState('');
  const [loadError, setLoadError] = useState('');

  const reload = useCallback(() => {
    fetchMcps()
      .then((data) => {
        setMcps(data.mcps);
        setLoadError(data.error || '');
      })
      .catch(() => {
        setMcps([]);
        setLoadError('Não foi possível ler as conexões MCP do Orbit.');
      });
  }, []);

  useEffect(() => { reload(); }, [reload]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return mcps;
    return mcps.filter((mcp) =>
      mcp.name.toLowerCase().includes(q) || mcp.type.toLowerCase().includes(q) ||
      JSON.stringify(mcp.config).toLowerCase().includes(q),
    );
  }, [mcps, query]);

  const groups: CatalogGroup<McpDef>[] = useMemo(() => [
    { key: 'enabled', title: 'Habilitados', items: filtered.filter((mcp) => mcp.enabled) },
    { key: 'disabled', title: 'Desabilitados', items: filtered.filter((mcp) => !mcp.enabled) },
  ].filter((group) => group.items.length), [filtered]);

  return (
    <>
      {loadError && <div className="mcp-catalog-error">{loadError}</div>}
      <CatalogScreen
        title="MCPs"
        subtitle="Conexões centrais do Orbit, compartilhadas com os agentes novos."
        groups={groups}
        query={query}
        onQueryChange={setQuery}
        createLabel="Adicionar MCP"
        onCreate={onCreateMcp}
        onBack={onBack}
        itemKey={(mcp) => mcp.name}
        onOpenItem={onOpenMcp}
        totalCount={mcps.length}
        emptyIcon={<Server size={20} strokeWidth={1.75} />}
        emptyTitle="Nenhum MCP configurado"
        emptyText="Adicione o primeiro servidor que os agentes poderão usar." 
        noResultText="Nenhum MCP encontrado"
        renderCard={(mcp) => (
          <>
            <div className="catalog-card-name-row">
              <span className="catalog-card-name">{mcp.name}</span>
              <span className="catalog-card-badge">{mcp.type}</span>
            </div>
            <div className="catalog-card-desc">{mcp.type === 'stdio' ? 'Servidor local' : 'Servidor remoto'}</div>
            <div className="catalog-card-meta">{mcp.enabled ? 'Disponível para agentes novos' : 'Desabilitado'}</div>
          </>
        )}
      />
    </>
  );
}
