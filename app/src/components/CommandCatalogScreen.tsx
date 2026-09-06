import { useCallback, useEffect, useMemo, useState } from 'react';
import { Command, Trash2 } from 'lucide-react';
import { CommandDef, deleteAgentFile, fetchCatalog } from '../api';
import CatalogScreen, { CatalogGroup } from './CatalogScreen';
import ConfirmDialog from './ConfirmDialog';

interface Props {
  onBack: () => void;
  onOpenCommand: (name: string, subtitle?: string) => void;
  onCreateCommand: () => void;
}

// Catalogo em tela cheia, no mesmo padrao de Skills. Comandos em subpastas
// aparecem com namespace (ex.: deploy:rollback), como o Claude Code os le.
export default function CommandCatalogScreen({ onBack, onOpenCommand, onCreateCommand }: Props) {
  const [commands, setCommands] = useState<CommandDef[]>([]);
  const [query, setQuery] = useState('');
  const [pendingDelete, setPendingDelete] = useState<CommandDef | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState('');

  const reload = useCallback(() => {
    fetchCatalog().then((catalog) => setCommands(catalog.commands)).catch(() => setCommands([]));
  }, []);

  useEffect(() => { reload(); }, [reload]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return commands;
    return commands.filter((command) =>
      command.name.toLowerCase().includes(q) || command.description.toLowerCase().includes(q),
    );
  }, [commands, query]);

  const groups: CatalogGroup<CommandDef>[] = useMemo(() => {
    const topLevel = filtered.filter((command) => !command.name.includes(':'));
    const namespaced = filtered.filter((command) => command.name.includes(':'));
    return [
      { key: 'top-level', title: 'Comandos', items: topLevel },
      { key: 'namespaced', title: 'Comandos com namespace', items: namespaced },
    ].filter((group) => group.items.length);
  }, [filtered]);

  const confirmDelete = async () => {
    if (!pendingDelete) return;
    setDeleting(true);
    setDeleteError('');
    const res = await deleteAgentFile(pendingDelete.name, 'command');
    setDeleting(false);
    if ('error' in res) {
      setDeleteError(res.error);
      return;
    }
    setPendingDelete(null);
    reload();
  };

  return (
    <>
      <CatalogScreen
        title="Commands"
        subtitle="Comandos slash configurados em ~/.claude/commands."
        groups={groups}
        query={query}
        onQueryChange={setQuery}
        createLabel="Criar comando"
        onCreate={onCreateCommand}
        onBack={onBack}
        itemKey={(command) => command.name}
        onOpenItem={(command) => onOpenCommand(command.name, command.description || undefined)}
        totalCount={commands.length}
        emptyIcon={<Command size={20} strokeWidth={1.75} />}
        emptyTitle="Nenhum comando cadastrado"
        emptyText="Crie o primeiro comando com o botão acima."
        noResultText="Nenhum comando encontrado"
        renderCard={(command) => (
          <>
            <div className="catalog-card-name-row">
              <span className="catalog-card-name">/{command.name}</span>
            </div>
            <div
              className={`catalog-card-desc${command.description ? '' : ' catalog-card-desc-empty'}`}
              title={command.description || undefined}
            >
              {command.description || 'Sem descrição'}
            </div>
            <div className="catalog-card-meta">commands/{command.name.replace(/:/g, '/')}.md</div>
          </>
        )}
        cardActions={(command) => (
          <span
            role="button"
            tabIndex={0}
            className="catalog-card-action"
            aria-label={`Excluir ${command.name}`}
            title="Excluir comando"
            onClick={(event) => {
              event.stopPropagation();
              setPendingDelete(command);
            }}
            onKeyDown={(event) => {
              if (event.key === 'Enter' || event.key === ' ') {
                event.preventDefault();
                event.stopPropagation();
                setPendingDelete(command);
              }
            }}
          >
            <Trash2 size={14} />
          </span>
        )}
      />

      <ConfirmDialog
        open={!!pendingDelete}
        title={`Excluir ${pendingDelete?.name}?`}
        message={deleteError || 'O arquivo do comando será removido do disco. Essa ação não pode ser desfeita.'}
        confirmText={deleting ? 'Excluindo…' : 'Excluir'}
        danger
        onConfirm={confirmDelete}
        onCancel={() => {
          setPendingDelete(null);
          setDeleteError('');
        }}
      />
    </>
  );
}
