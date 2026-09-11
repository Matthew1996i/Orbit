import { useState } from 'react';
import { Button, ConfigProvider, Switch, Typography, message } from 'antd';
import { ArrowLeft, Trash } from '@phosphor-icons/react';
import { McpDef, deleteMcp, saveMcp } from '../api';
import { useLlmScreenTheme } from '../utils/llmScreenTheme';
import ConfirmDialog from './ConfirmDialog';
import './AgentEditScreen.css';
import './McpEditScreen.css';

const { Title, Text } = Typography;
const MCP_NAME_RE = /^[A-Za-z0-9_.-]+$/;
const NEW_CONFIG = '{\n  "type": "stdio",\n  "command": "",\n  "args": [],\n  "env": {}\n}';

interface Props {
  mcp?: McpDef;
  draft?: { name: string; config: Record<string, unknown> };
  onBack: () => void;
  onDeleted: () => void;
}

export default function McpEditScreen({ mcp, draft, onBack, onDeleted }: Props) {
  const theme = useLlmScreenTheme();
  const [messageApi, messageContext] = message.useMessage({ top: 56 });
  const [name, setName] = useState(mcp?.name || draft?.name || '');
  const [enabled, setEnabled] = useState(mcp?.enabled ?? true);
  const [configText, setConfigText] = useState(() => JSON.stringify(mcp?.config || draft?.config || JSON.parse(NEW_CONFIG), null, 2));
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [confirmingDelete, setConfirmingDelete] = useState(false);

  const validName = MCP_NAME_RE.test(name.trim());
  const save = async () => {
    let config: Record<string, unknown>;
    try {
      const parsed: unknown = JSON.parse(configText);
      if (!parsed || Array.isArray(parsed) || typeof parsed !== 'object') throw new Error();
      config = parsed as Record<string, unknown>;
    } catch {
      setError('A configuração precisa ser um objeto JSON válido.');
      return;
    }
    if (!validName) return;
    setSaving(true);
    setError('');
    const res = await saveMcp(name.trim(), config, enabled);
    setSaving(false);
    if ('error' in res) {
      setError(res.error);
      messageApi.error(`Não foi possível salvar: ${res.error}`);
      return;
    }
    messageApi.success('MCP salvo com sucesso.');
  };

  const remove = async () => {
    if (!mcp) return;
    setSaving(true);
    const res = await deleteMcp(mcp.name);
    setSaving(false);
    if ('error' in res) {
      setError(res.error);
      messageApi.error(`Não foi possível excluir: ${res.error}`);
      return;
    }
    onDeleted();
  };

  return (
    <ConfigProvider theme={theme}>
      {messageContext}
      <div className="agent-screen mcp-edit-screen">
        <div className="agent-screen-inner">
          <div className="agent-screen-header">
            <div className="llm-screen-header agent-screen-header-section">
              <button className="llm-screen-back" onClick={onBack} aria-label="Voltar"><ArrowLeft size={16} /></button>
              <div>
                <Title level={3} className="llm-screen-title">MCPs</Title>
                <Text className="llm-screen-subtitle">Conexões gerenciadas pelo Orbit e entregues aos agentes novos.</Text>
              </div>
            </div>
            <div className="agent-screen-title-row">
              <div className="agent-screen-title-block">
                <Title level={3} className="llm-screen-title">{mcp ? mcp.name : 'Novo MCP'}</Title>
              </div>
              <div className="agent-screen-header-actions">
                {mcp && (
                  <Button className="llm-btn llm-btn-secondary llm-btn-danger" icon={<Trash size={13} />} onClick={() => setConfirmingDelete(true)}>
                    Excluir MCP
                  </Button>
                )}
                <Button className="llm-btn llm-btn-primary" onClick={save} disabled={saving || !validName}>
                  {saving ? 'Salvando…' : 'Salvar'}
                </Button>
              </div>
            </div>
          </div>

          <div className="mcp-edit-form">
            <label className="mcp-edit-label">Nome do servidor</label>
            <input className="mcp-edit-input" value={name} disabled={!!mcp} onChange={(event) => setName(event.target.value)} placeholder="ex: filesystem" spellCheck={false} />
            {!validName && name && <span className="mcp-edit-hint">Use letras, números, ponto, hífen ou underscore.</span>}
            <div className="mcp-edit-switch-row">
              <div><div className="mcp-edit-label">Habilitado</div><span className="mcp-edit-hint">Os agentes novos terão acesso a este MCP pela conexão do Orbit.</span></div>
              <Switch checked={enabled} onChange={setEnabled} />
            </div>
            <label className="mcp-edit-label">Configuração JSON</label>
            <textarea className="mcp-edit-json" value={configText} onChange={(event) => setConfigText(event.target.value)} spellCheck={false} />
            {error && <div className="agent-screen-error">{error}</div>}
          </div>
        </div>
      </div>
      <ConfirmDialog open={confirmingDelete} title={`Excluir ${mcp?.name}?`} message="A conexão será removida do Orbit e não será entregue a novos agentes." confirmText="Excluir" danger onConfirm={remove} onCancel={() => setConfirmingDelete(false)} />
    </ConfigProvider>
  );
}
