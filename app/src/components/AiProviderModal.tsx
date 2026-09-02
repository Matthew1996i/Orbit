import { useState } from 'react';
import { createPortal } from 'react-dom';
import { Save, Trash2, X } from 'lucide-react';
import { AiProvider, AiProviderKind, deleteAiProvider, saveAiProvider } from '../api';
import './ConfirmDialog.css';
import './SecretsModal.css';

interface Props {
  provider?: AiProvider;
  onClose: () => void;
  onSaved: () => void;
}

// "formato" aqui e so o shape do request/response da API — nao amarra a
// nenhuma marca/provedor especifico de proposito (funciona com qualquer
// servico que fale esse mesmo protocolo). O label e o texto exibido nunca
// citam um nome de LLM/provedor; defaultUrl fica interno so como fallback
// tecnico quando o usuario deixa a URL em branco.
const PROVIDER_OPTIONS: { id: AiProviderKind; label: string; defaultUrl: string }[] = [
  {
    id: 'anthropic',
    label: 'Formato 1 (mensagem + instrução do sistema separada)',
    defaultUrl: 'https://api.anthropic.com/v1/messages',
  },
  {
    id: 'openai',
    label: 'Formato 2 (lista de mensagens com papéis)',
    defaultUrl: 'https://api.openai.com/v1/chat/completions',
  },
];

export default function AiProviderModal({ provider, onClose, onSaved }: Props) {
  const [title, setTitle] = useState(provider?.title ?? '');
  const [kind, setKind] = useState<AiProviderKind>(provider?.provider ?? 'anthropic');
  const [baseUrl, setBaseUrl] = useState(provider?.baseUrl ?? '');
  const [apiKey, setApiKey] = useState(provider?.apiKey ?? '');
  const [model, setModel] = useState(provider?.model ?? '');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const valid = title.trim().length > 0 && apiKey.trim().length > 0;

  const save = async () => {
    if (!valid) return;
    setSaving(true);
    setError('');
    const res = await saveAiProvider({
      id: provider?.id,
      title: title.trim(),
      provider: kind,
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

        <label className="new-agent-label">Formato da API</label>
        <div className="ai-provider-kind-row">
          {PROVIDER_OPTIONS.map((opt) => (
            <button
              key={opt.id}
              type="button"
              className={`ai-provider-kind-btn${kind === opt.id ? ' selected' : ''}`}
              onClick={() => setKind(opt.id)}
            >
              {opt.label}
            </button>
          ))}
        </div>
        <span className="ai-provider-hint">
          escolha o formato que o serviço da sua chave usa — qualquer serviço compatível com esse
          formato funciona, mesmo que não seja quem o criou
        </span>

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
          className="new-agent-input"
          value={apiKey}
          onChange={(e) => setApiKey(e.target.value)}
          placeholder="cole sua chave aqui"
          type="password"
          spellCheck={false}
        />

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
