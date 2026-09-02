import { useState } from 'react';
import { createPortal } from 'react-dom';
import { Plus, X } from 'lucide-react';
import { SecretEntry, SecretGroup, deleteSecretGroup, saveSecretGroup } from '../api';
import './ConfirmDialog.css';
import './SecretsModal.css';

interface Props {
  group?: SecretGroup;
  existingGroups: SecretGroup[];
  onClose: () => void;
  onSaved: () => void;
}

// mesma normalizacao usada pro nome de arquivo de agent/skill/command (ver
// AgentEditModal) — identificador tem que ser um slug valido pra funcionar
// dentro de {{identificador.chave}}.
function slugify(text: string): string {
  return text
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .trim()
    .replace(/[^a-zA-Z0-9_-]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

export default function SecretsModal({ group, existingGroups, onClose, onSaved }: Props) {
  const [title, setTitle] = useState(group?.title ?? '');
  // identificador comeca igual ao slug do titulo, mas e' editavel — uma vez
  // que o usuario mexe nele, para de seguir o titulo automaticamente.
  const [identifier, setIdentifier] = useState(group?.identifier ?? '');
  const [identifierTouched, setIdentifierTouched] = useState(!!group?.identifier);
  const [entries, setEntries] = useState<SecretEntry[]>(
    group?.entries && group.entries.length > 0 ? group.entries : [{ key: '', value: '' }],
  );
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const effectiveIdentifier = identifierTouched ? identifier : slugify(title);
  const identifierTaken = existingGroups.some(
    (g) => g.id !== group?.id && g.identifier === effectiveIdentifier.trim(),
  );
  const identifierValid = /^[a-zA-Z0-9_-]+$/.test(effectiveIdentifier.trim()) && !identifierTaken;

  const setEntry = (i: number, field: 'key' | 'value', v: string) => {
    setEntries((cur) => cur.map((e, idx) => (idx === i ? { ...e, [field]: v } : e)));
  };

  const addRow = () => setEntries((cur) => [...cur, { key: '', value: '' }]);
  const removeRow = (i: number) => setEntries((cur) => cur.filter((_, idx) => idx !== i));

  const valid = title.trim().length > 0 && identifierValid && entries.some((e) => e.key.trim().length > 0);

  const save = async () => {
    if (!valid) return;
    setSaving(true);
    setError('');
    const res = await saveSecretGroup({
      id: group?.id,
      title: title.trim(),
      identifier: effectiveIdentifier.trim(),
      entries,
    });
    setSaving(false);
    if ('error' in res) {
      setError(res.error);
      return;
    }
    onSaved();
    onClose();
  };

  const remove = async () => {
    if (!group) return;
    setSaving(true);
    await deleteSecretGroup(group.id);
    setSaving(false);
    onSaved();
    onClose();
  };

  return createPortal(
    <div className="confirm-overlay" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className="confirm-dialog secrets-dialog">
        <div className="confirm-header">
          <h2>{group ? 'Editar grupo de chaves' : 'Novo grupo de chaves'}</h2>
          <button className="secrets-close-btn" onClick={onClose} aria-label="Fechar">
            <X size={16} />
          </button>
        </div>

        <label className="new-agent-label">Título (identificação)</label>
        <input
          className="new-agent-input"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder="ex: Anthropic, OpenAI, minha conta pessoal…"
          autoFocus
          spellCheck={false}
        />

        <label className="new-agent-label">Identificador (usado em {'{{identificador.chave}}'})</label>
        <input
          className={`new-agent-input${identifier || title ? (identifierValid ? '' : ' secret-ref-invalid-input') : ''}`}
          value={effectiveIdentifier}
          onChange={(e) => {
            setIdentifierTouched(true);
            setIdentifier(e.target.value);
          }}
          placeholder="ex: openrouter, minha-conta"
          spellCheck={false}
        />
        <span className="ai-provider-hint">
          {identifierTaken
            ? `já existe um grupo com o identificador "${effectiveIdentifier.trim()}"`
            : 'único entre os grupos — grupos diferentes podem ter uma chave com o mesmo nome, o identificador é o que evita colisão'}
        </span>

        <label className="new-agent-label">Chaves</label>
        <div className="secrets-rows">
          {entries.map((entry, i) => (
            <div className="secrets-row" key={i}>
              <input
                className="new-agent-input secrets-row-key"
                value={entry.key}
                onChange={(e) => setEntry(i, 'key', e.target.value)}
                placeholder="CHAVE (ex: ANTHROPIC_API_KEY)"
                spellCheck={false}
              />
              <input
                className="new-agent-input secrets-row-value"
                value={entry.value}
                onChange={(e) => setEntry(i, 'value', e.target.value)}
                placeholder="valor"
                type="password"
                spellCheck={false}
              />
              <button
                className="secrets-row-remove"
                onClick={() => removeRow(i)}
                aria-label="Remover linha"
                title="Remover linha"
                type="button"
              >
                <X size={14} />
              </button>
            </div>
          ))}
        </div>
        <button className="secrets-add-row-btn" onClick={addRow} type="button">
          <Plus size={13} /> Adicionar linha
        </button>

        {error && <p className="confirm-message secrets-error">{error}</p>}

        <div className="confirm-actions">
          {group && (
            <button className="confirm-btn-danger secrets-delete-btn" onClick={remove} disabled={saving} type="button">
              Excluir
            </button>
          )}
          <button className="confirm-btn-submit" onClick={save} disabled={saving || !valid} type="button">
            {saving ? 'Salvando…' : 'Salvar'}
          </button>
        </div>
      </div>
    </div>,
    document.body,
  );
}
