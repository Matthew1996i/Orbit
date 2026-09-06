import { useState } from 'react';
import { Button, ConfigProvider, Switch, Typography, message } from 'antd';
import { ArrowLeft, Save } from 'lucide-react';
import { ToolDef, saveTools } from '../api';
import { useLlmScreenTheme } from '../utils/llmScreenTheme';
import './AgentEditScreen.css';
import './SecretsModal.css';

interface Props { tool: ToolDef; allTools: ToolDef[]; onBack: () => void; }

export default function ToolsEditScreen({ tool, allTools, onBack }: Props) {
  const theme = useLlmScreenTheme();
  const [draft, setDraft] = useState(tool);
  const [saving, setSaving] = useState(false);
  const [messageApi, contextHolder] = message.useMessage({ top: 56 });
  const save = async () => {
    if (!draft.name.trim()) return;
    setSaving(true);
    const result = await saveTools(allTools.map((item) => item.name === tool.name ? { ...draft, name: draft.name.trim() } : item));
    setSaving(false);
    if ('error' in result) { messageApi.error(result.error); return; }
    messageApi.success('Tool salva');
  };
  return <ConfigProvider theme={theme}>{contextHolder}<div className="agent-screen"><div className="agent-screen-inner"><div className="agent-screen-header"><div className="llm-screen-header agent-screen-header-section"><button className="llm-screen-back" onClick={onBack} aria-label="Voltar"><ArrowLeft size={16} /></button><div><Typography.Title level={3} className="llm-screen-title">Tools</Typography.Title><Typography.Text className="llm-screen-subtitle">Configuração da ferramenta para os agentes do Orbit.</Typography.Text></div></div><div className="agent-screen-title-row"><div className="agent-screen-title-block"><Typography.Title level={3} className="llm-screen-title">{draft.name}</Typography.Title></div><div className="agent-screen-header-actions"><Button className="llm-btn llm-btn-primary" icon={<Save size={13} />} loading={saving} onClick={save}>Salvar</Button></div></div></div><div className="secrets-edit-form"><label className="new-agent-label">Nome</label><input className="new-agent-input" value={draft.name} onChange={(e) => setDraft({ ...draft, name: e.target.value })} spellCheck={false} /><label className="new-agent-label">Descrição</label><textarea className="new-agent-input tools-description-input" value={draft.description} onChange={(e) => setDraft({ ...draft, description: e.target.value })} rows={4} /><label className="tools-enabled-row"><Switch checked={draft.enabled} onChange={(enabled) => setDraft({ ...draft, enabled })} /> Disponível para novos agentes</label></div></div></div></ConfigProvider>;
}
