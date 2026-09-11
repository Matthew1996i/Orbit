import { useCallback, useEffect, useMemo, useState } from 'react';
import { Key } from '@phosphor-icons/react';
import { fetchSecretGroups, SecretGroup } from '../api';
import CatalogScreen, { CatalogGroup } from './CatalogScreen';

interface Props {
  onBack: () => void;
  onOpenGroup: (group?: SecretGroup) => void;
}

export default function SecretsCatalogScreen({ onBack, onOpenGroup }: Props) {
  const [groups, setGroups] = useState<SecretGroup[]>([]);
  const [query, setQuery] = useState('');
  const reload = useCallback(() => fetchSecretGroups().then(setGroups).catch(() => setGroups([])), []);
  useEffect(() => { reload(); }, [reload]);
  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return q ? groups.filter((group) => `${group.title} ${group.identifier}`.toLowerCase().includes(q)) : groups;
  }, [groups, query]);
  const groupsByStatus: CatalogGroup<SecretGroup>[] = filtered.length
    ? [{ key: 'groups', title: 'Grupos de chaves', items: filtered }]
    : [];
  return <>
    <CatalogScreen title="Chaves e tokens" subtitle="Credenciais locais reutilizáveis pelos seus provedores e fluxos." groups={groupsByStatus} query={query} onQueryChange={setQuery} createLabel="Novo grupo" onCreate={() => onOpenGroup()} onBack={onBack} itemKey={(group) => group.id} onOpenItem={onOpenGroup} totalCount={groups.length} emptyIcon={<Key size={20} />} emptyTitle="Nenhuma chave cadastrada" emptyText="Crie um grupo para organizar tokens e referências seguras." noResultText="Nenhuma chave encontrada" renderCard={(group) => <><div className="catalog-card-name-row"><span className="catalog-card-name">{group.title}</span><span className="catalog-card-badge">{group.identifier}</span></div><div className="catalog-card-desc">{group.entries.length} {group.entries.length === 1 ? 'chave' : 'chaves'}</div><div className="catalog-card-meta">Use como {'{{'}{group.identifier}.CHAVE{'}}'}</div></>} />
  </>;
}
