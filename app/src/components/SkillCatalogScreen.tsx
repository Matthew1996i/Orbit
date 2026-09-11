import { useCallback, useEffect, useMemo, useState } from 'react';
import { PuzzlePiece, Trash } from '@phosphor-icons/react';
import { SkillDef, deleteAgentFile, fetchCatalog } from '../api';
import CatalogScreen, { CatalogGroup } from './CatalogScreen';
import ConfirmDialog from './ConfirmDialog';

interface Props {
  onBack: () => void;
  onOpenSkill: (name: string, subtitle?: string) => void;
  onCreateSkill: () => void;
  onDeleteSkill?: (name: string) => void;
}

function skillSubtitle(skill: SkillDef): string | undefined {
  return skill.version ? `versão: ${skill.version}` : undefined;
}

// tela cheia de Skills, paridade com AgentCatalogScreen — mesmo padrao
// generico (ver CatalogScreen), so muda dados/agrupamento/card/exclusao.
export default function SkillCatalogScreen({ onBack, onOpenSkill, onCreateSkill, onDeleteSkill }: Props) {
  const [skills, setSkills] = useState<SkillDef[]>([]);
  const [query, setQuery] = useState('');
  const [pendingDelete, setPendingDelete] = useState<SkillDef | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState('');

  const reload = useCallback(() => {
    fetchCatalog()
      .then((catalog) => setSkills(catalog.skills))
      .catch(() => setSkills([]));
  }, []);

  useEffect(() => {
    reload();
  }, [reload]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return skills;
    return skills.filter(
      (skill) => skill.name.toLowerCase().includes(q) || skill.description.toLowerCase().includes(q),
    );
  }, [skills, query]);

  // agrupamento honesto pro dominio de skill (sem tier de "qualidade" como
  // em agente/modelo) — so separa quem tem `version` preenchida no
  // frontmatter de quem nao tem, ordenado por nome dentro de cada grupo.
  const groups: CatalogGroup<SkillDef>[] = useMemo(() => {
    const versioned = filtered.filter((skill) => skill.version.trim()).sort((a, b) => a.name.localeCompare(b.name));
    const unversioned = filtered.filter((skill) => !skill.version.trim()).sort((a, b) => a.name.localeCompare(b.name));
    return [
      { key: 'versioned', title: 'Versionadas', items: versioned },
      { key: 'unversioned', title: 'Sem versão', items: unversioned },
    ].filter((group) => group.items.length);
  }, [filtered]);

  const confirmDelete = async () => {
    if (!pendingDelete) return;
    setDeleting(true);
    setDeleteError('');
    const res = await deleteAgentFile(pendingDelete.name, 'skill');
    setDeleting(false);
    if ('error' in res) {
      setDeleteError(res.error);
      return;
    }
    setPendingDelete(null);
    onDeleteSkill?.(pendingDelete.name);
    reload();
  };

  return (
    <>
      <CatalogScreen
        title="Skills"
        subtitle="Skills configuradas neste projeto."
        groups={groups}
        query={query}
        onQueryChange={setQuery}
        createLabel="Criar skill"
        onCreate={onCreateSkill}
        onBack={onBack}
        itemKey={(skill) => skill.name}
        onOpenItem={(skill) => onOpenSkill(skill.name, skillSubtitle(skill))}
        totalCount={skills.length}
        emptyIcon={<PuzzlePiece size={20} />}
        emptyTitle="Nenhuma skill cadastrada"
        emptyText="Crie a primeira skill com o botão acima."
        noResultText="Nenhuma skill encontrada"
        renderCard={(skill) => (
          <>
            <div className="catalog-card-name-row">
              <span className="catalog-card-name">{skill.name}</span>
              {skill.version && <span className="catalog-card-badge">v{skill.version}</span>}
            </div>
            <div
              className={`catalog-card-desc${skill.description ? '' : ' catalog-card-desc-empty'}`}
              title={skill.description || undefined}
            >
              {skill.description || 'Sem descrição'}
            </div>
            <div className="catalog-card-meta">skills/{skill.name}/SKILL.md</div>
          </>
        )}
        cardActions={(skill) => (
          // span com role="button", IRMAO do <button> do card (nao filho) —
          // um <button> dentro de outro <button> e HTML invalido; o
          // stopPropagation impede que o clique aqui tambem dispare o
          // onOpenItem do card por baixo.
          <span
            role="button"
            tabIndex={0}
            className="catalog-card-action"
            aria-label={`Excluir ${skill.name}`}
            title="Excluir skill"
            onClick={(event) => {
              event.stopPropagation();
              setPendingDelete(skill);
            }}
            onKeyDown={(event) => {
              if (event.key === 'Enter' || event.key === ' ') {
                event.preventDefault();
                event.stopPropagation();
                setPendingDelete(skill);
              }
            }}
          >
            <Trash size={14} />
          </span>
        )}
      />

      <ConfirmDialog
        open={!!pendingDelete}
        title={`Excluir ${pendingDelete?.name}?`}
        message={
          deleteError ||
          'A pasta inteira da skill é removida do disco (SKILL.md e quaisquer outros arquivos dentro dela). Essa ação não pode ser desfeita.'
        }
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
