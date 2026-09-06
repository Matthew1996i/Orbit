import { useEffect, useState } from 'react';
import { Button, ConfigProvider, Typography } from 'antd';
import { ArrowLeft, Trash2 } from 'lucide-react';
import { AiProvider, AiProviderKind, SecretGroup, deleteAiProvider, fetchSecretGroups, saveAiProvider } from '../api';
import { isSecretRef, validateSecretRef } from '../utils/secretRefs';
import SecretRefInput from './SecretRefInput';
import { useLlmScreenTheme } from '../utils/llmScreenTheme';
import './AgentEditScreen.css';
import './AiProviderModal.css';
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
  const theme = useLlmScreenTheme();
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

  return (
    <ConfigProvider theme={theme}>
      <div className="agent-screen"><div className="agent-screen-inner"><div className="agent-screen-header"><div className="llm-screen-header agent-screen-header-section"><button className="llm-screen-back" onClick={onClose} aria-label="Voltar"><ArrowLeft size={16} /></button><div><Typography.Title level={3} className="llm-screen-title">Provedores de IA</Typography.Title><Typography.Text className="llm-screen-subtitle">Conexões usadas pela geração assistida.</Typography.Text></div></div><div className="agent-screen-title-row"><div className="agent-screen-title-block"><Typography.Title level={3} className="llm-screen-title">{provider ? provider.title : 'Novo provedor de IA'}</Typography.Title></div><div className="agent-screen-header-actions">{provider && <Button className="llm-btn llm-btn-danger" icon={<Trash2 size={13} />} onClick={remove} disabled={saving}>Excluir</Button>}<Button className="llm-btn llm-btn-primary" onClick={save} loading={saving} disabled={!valid}>{saving ? 'Salvando…' : 'Salvar'}</Button></div></div></div>
        <div className="secrets-edit-form">

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

        </div></div></div>
    </ConfigProvider>
  );
}
