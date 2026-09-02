import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { Save, Trash2, X } from 'lucide-react';
import { AiProvider, AiProviderKind, SecretGroup, deleteAiProvider, fetchSecretGroups, saveAiProvider } from '../api';
import { isSecretRef, validateSecretRef } from '../utils/secretRefs';
import './AiProviderModal.css';
import './ConfirmDialog.css';
import './SecretsModal.css';

interface Props {
  provider?: AiProvider;
  onClose: () => void;
  onSaved: () => void;
}

// o "formato" (shape do request/response) nao aparece mais como escolha na
// UI — na pratica so mudava o campo por baixo e confundia sem servir pra
// nada visivel. Em vez de pedir isso, deriva sozinho a partir da URL: se
// apontar pro endpoint de mensagens (.../v1/messages), usa esse formato;
// qualquer outra coisa (o caso mais comum — a maioria dos servicos
// compativeis fala o formato de lista de mensagens) usa o outro.
function inferKind(baseUrl: string, fallback: AiProviderKind): AiProviderKind {
  if (!baseUrl.trim()) return fallback;
  return /\/v1\/messages\b/.test(baseUrl) ? 'anthropic' : 'openai';
}

export default function AiProviderModal({ provider, onClose, onSaved }: Props) {
  const [title, setTitle] = useState(provider?.title ?? '');
  const [baseUrl, setBaseUrl] = useState(provider?.baseUrl ?? '');
  const [apiKey, setApiKey] = useState(provider?.apiKey ?? '');
  const [model, setModel] = useState(provider?.model ?? '');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [secretGroups, setSecretGroups] = useState<SecretGroup[]>([]);

  useEffect(() => {
    fetchSecretGroups().then(setSecretGroups).catch(() => setSecretGroups([]));
  }, []);

  // se a chave de API for um `{{CHAVE}}`/`{{CHAVE.campo}}`, valida contra as
  // chaves cadastradas em Chaves e tokens pra dar feedback visual na hora —
  // a resolucao de verdade acontece no backend, isso e so o highlight.
  const apiKeyIsRef = isSecretRef(apiKey);
  const apiKeyValidation = apiKeyIsRef ? validateSecretRef(apiKey, secretGroups) : null;

  const valid = title.trim().length > 0 && apiKey.trim().length > 0 && (!apiKeyValidation || apiKeyValidation.ok);

  const save = async () => {
    if (!valid) return;
    setSaving(true);
    setError('');
    const res = await saveAiProvider({
      id: provider?.id,
      title: title.trim(),
      provider: inferKind(baseUrl, provider?.provider ?? 'openai'),
      baseUrl: baseUrl.trim(),
      apiKey: apiKey.trim(),
      model: model.trim(),
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
    if (!provider) return;
    setSaving(true);
    await deleteAiProvider(provider.id);
    setSaving(false);
    onSaved();
    onClose();
  };

  return createPortal(
    <div className="confirm-overlay" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className="confirm-dialog secrets-dialog">
        <div className="confirm-header">
          <h2>{provider ? 'Editar provedor de IA' : 'Novo provedor de IA'}</h2>
          <button className="secrets-close-btn" onClick={onClose} aria-label="Fechar">
            <X size={16} />
          </button>
        </div>

        <label className="new-agent-label">Título (identificação)</label>
        <input
          className="new-agent-input"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder="ex: minha conta pessoal, projeto X…"
          autoFocus
          spellCheck={false}
        />

        <label className="new-agent-label">URL da API</label>
        <input
          className="new-agent-input"
          value={baseUrl}
          onChange={(e) => setBaseUrl(e.target.value)}
          placeholder="opcional — usa a URL padrão do formato se vazio"
          spellCheck={false}
        />

        <label className="new-agent-label">Chave de API</label>
        <input
          className={`new-agent-input${apiKeyValidation ? (apiKeyValidation.ok ? ' secret-ref-valid' : ' secret-ref-invalid') : ''}`}
          value={apiKey}
          onChange={(e) => setApiKey(e.target.value)}
          placeholder="cole sua chave, ou use {{CHAVE}} pra referenciar uma já cadastrada"
          type="text"
          spellCheck={false}
        />
        <span className={`ai-provider-hint${apiKeyValidation && !apiKeyValidation.ok ? ' ai-provider-hint-error' : ''}`}>
          {apiKeyValidation && !apiKeyValidation.ok
            ? apiKeyValidation.message
            : 'use {{CHAVE}} ou {{CHAVE.campo}} pra referenciar uma chave de "Chaves e tokens" sem colar o valor aqui'}
        </span>

        <label className="new-agent-label">Modelo (opcional)</label>
        <input
          className="new-agent-input"
          value={model}
          onChange={(e) => setModel(e.target.value)}
          placeholder="opcional — usa o modelo padrão do formato se vazio"
          spellCheck={false}
        />

        {error && <p className="confirm-message secrets-error">{error}</p>}

        <div className="confirm-actions">
          {provider && (
            <button className="confirm-btn-danger secrets-delete-btn" onClick={remove} disabled={saving} type="button">
              <Trash2 size={13} /> Excluir
            </button>
          )}
          <button className="confirm-btn-cancel" onClick={onClose} type="button">
            Cancelar
          </button>
          <button className="confirm-btn-submit" onClick={save} disabled={saving || !valid} type="button">
            <Save size={13} /> {saving ? 'Salvando…' : 'Salvar'}
          </button>
        </div>
      </div>
    </div>,
    document.body,
  );
}
