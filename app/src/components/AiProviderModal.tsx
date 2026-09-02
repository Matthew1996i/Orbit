import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { X } from 'lucide-react';
import { AiProvider, AiProviderKind, SecretGroup, deleteAiProvider, fetchSecretGroups, saveAiProvider } from '../api';
import { isSecretRef, validateSecretRef } from '../utils/secretRefs';
import SecretRefInput from './SecretRefInput';
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

  // URL/modelo tambem aceitam {{CHAVE}} (ex: um endpoint por-conta ou um
  // nome de modelo guardados como segredo) — so a chave de API bloqueia o
  // Salvar se a referencia nao existir, os outros dois sao so cosmeticos.
  const apiKeyValidation = isSecretRef(apiKey) ? validateSecretRef(apiKey, secretGroups) : null;

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
        <SecretRefInput
          value={baseUrl}
          onChange={setBaseUrl}
          placeholder="opcional — usa a URL padrão do formato se vazio"
          secretGroups={secretGroups}
        />

        <label className="new-agent-label">Chave de API</label>
        <SecretRefInput
          value={apiKey}
          onChange={setApiKey}
          placeholder="cole sua chave, ou use {{identificador.chave}} pra referenciar uma já cadastrada"
          secretGroups={secretGroups}
          password
        />
        <span className="ai-provider-hint">
          use {'{{identificador.chave}}'} pra referenciar uma chave de "Chaves e tokens" sem colar o valor aqui — o
          identificador é o que aparece ao lado do título do grupo
        </span>

        <label className="new-agent-label">Modelo (opcional)</label>
        <SecretRefInput
          value={model}
          onChange={setModel}
          placeholder="opcional — usa o modelo padrão do formato se vazio"
          secretGroups={secretGroups}
        />

        {error && <p className="confirm-message secrets-error">{error}</p>}

        <div className="confirm-actions">
          {provider && (
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
