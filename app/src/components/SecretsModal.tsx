import { useState } from 'react';
import { Button, ConfigProvider, Typography } from 'antd';
import { ArrowLeft, Plus, Trash2 } from 'lucide-react';
import { SecretEntry, SecretGroup, deleteSecretGroup, saveSecretGroup } from '../api';
import { useLlmScreenTheme } from '../utils/llmScreenTheme';
import './AgentEditScreen.css';
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
    .toLowerCase()
    .trim()
    .replace(/[^a-zA-Z0-9_-]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

export default function SecretsModal({ group, existingGroups, onClose, onSaved }: Props) {
  const theme = useLlmScreenTheme();
  const [title, setTitle] = useState(group?.title ?? '');
  // O identificador acompanha o título e é sempre normalizado para a sintaxe
  // usada em {{identificador.chave}}.
  const [identifier, setIdentifier] = useState(() => slugify(group?.identifier ?? ''));
  const [entries, setEntries] = useState<SecretEntry[]>(
    group?.entries && group.entries.length > 0 ? group.entries : [{ key: '', value: '' }],
  );
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const effectiveIdentifier = identifier;
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

  return (
    <ConfigProvider theme={theme}>
      <div className="agent-screen"><div className="agent-screen-inner"><div className="agent-screen-header"><div className="llm-screen-header agent-screen-header-section"><button className="llm-screen-back" onClick={onClose} aria-label="Voltar"><ArrowLeft size={16} /></button><div><Typography.Title level={3} className="llm-screen-title">Chaves e tokens</Typography.Title><Typography.Text className="llm-screen-subtitle">Valores criptografados e gerenciados pelo Orbit.</Typography.Text></div></div><div className="agent-screen-title-row"><div className="agent-screen-title-block"><Typography.Title level={3} className="llm-screen-title">{group ? group.title : 'Novo grupo de chaves'}</Typography.Title></div><div className="agent-screen-header-actions">{group && <Button className="llm-btn llm-btn-danger" icon={<Trash2 size={13} />} onClick={remove} disabled={saving}>Excluir</Button>}<Button className="llm-btn llm-btn-primary" onClick={save} loading={saving} disabled={!valid}>{saving ? 'Salvando…' : 'Salvar'}</Button></div></div></div>
        <div className="secrets-edit-form">

        <label className="new-agent-label">Título (identificação)</label>
        <input
          className="new-agent-input"
          value={title}
          onChange={(e) => {
            const nextTitle = e.target.value;
            setTitle(nextTitle);
            setIdentifier(slugify(nextTitle));
          }}
          placeholder="ex: Anthropic, OpenAI, minha conta pessoal…"
          autoFocus
          spellCheck={false}
        />

        <label className="new-agent-label">Identificador (usado em {'{{identificador.chave}}'})</label>
        <input
          className={`new-agent-input${identifier || title ? (identifierValid ? '' : ' secret-ref-invalid-input') : ''}`}
          value={effectiveIdentifier}
          onChange={(e) => setIdentifier(slugify(e.target.value))}
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
                disabled={entries.length === 1}
              >
                <Trash2 size={14} />
              </button>
            </div>
          ))}
        </div>
        <Button className="llm-btn llm-btn-secondary secrets-add-row-btn" icon={<Plus size={13} />} onClick={addRow}>Adicionar chave</Button>

        {error && <p className="confirm-message secrets-error">{error}</p>}

        </div></div></div>
    </ConfigProvider>
  );
}
