import { useEffect, useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import { X, Save, Eye, Pencil } from 'lucide-react';
import { marked } from 'marked';
import { AgentFileKind, fetchAgentFile, saveAgentFile } from '../api';
import './ConfirmDialog.css';
import './Sidebar.css';
import './AgentEditModal.css';

const AGENT_NAME_RE = /^[a-zA-Z0-9_-]+$/;
const NEW_AGENT_TEMPLATE = `---
name:
description:
model: sonnet
tools:
---

`;

interface Props {
  name: string;
  subtitle?: string;
  kind: AgentFileKind;
  onClose: () => void;
  // true = ainda nao existe arquivo nenhum — o nome vira um campo editavel no
  // cabecalho (em vez do titulo fixo) e o Salvar CRIA o arquivo em vez de
  // atualizar um existente.
  isNew?: boolean;
}

export default function AgentEditModal({ name, subtitle, kind, onClose, isNew = false }: Props) {
  const [agentName, setAgentName] = useState(name);
  const [content, setContent] = useState(isNew ? NEW_AGENT_TEMPLATE : '');
  const [loading, setLoading] = useState(!isNew);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState('');
  const [mode, setMode] = useState<'edit' | 'preview'>('edit');

  // o `marked` nao entende frontmatter YAML (---...---) — sem isso ele
  // renderiza tudo junto num paragrafo so, porque markdown junta linhas
  // sem linha em branco entre elas. O frontmatter ja aparece formatado no
  // cabecalho do modal (nome/modelo/tools), entao no preview mostra so o
  // corpo (o texto de verdade do agente) sem repetir isso quebrado.
  const bodyContent = useMemo(() => content.replace(/^---\n[\s\S]*?\n---\n?/, ''), [content]);
  const previewHtml = useMemo(
    () => (mode === 'preview' ? (marked.parse(bodyContent) as string) : ''),
    [mode, bodyContent],
  );

  useEffect(() => {
    if (isNew) return;
    fetchAgentFile(name, kind).then((res) => {
      setLoading(false);
      if ('error' in res) {
        setError(res.error);
        return;
      }
      setContent(res.content);
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [name, kind]);

  const nameValid = AGENT_NAME_RE.test(agentName.trim());

  const save = async () => {
    if (isNew && !nameValid) return;
    setSaving(true);
    setSaved(false);
    const res = await saveAgentFile(agentName.trim(), content, kind);
    setSaving(false);
    if ('error' in res) {
      setError(res.error);
      return;
    }
    setSaved(true);
    setTimeout(() => setSaved(false), 1800);
  };

  return createPortal(
    <div className="agent-edit-overlay" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className="agent-edit-dialog">
        <div className="agent-edit-header">
          <div>
            {isNew ? (
              <input
                className="agent-edit-name-input"
                value={agentName}
                onChange={(e) => setAgentName(e.target.value)}
                placeholder="nome-do-agente"
                autoFocus
                spellCheck={false}
              />
            ) : (
              <h2>{name}</h2>
            )}
            {subtitle && <span className="agent-edit-sub">{subtitle}</span>}
          </div>
          <div className="agent-edit-header-actions">
            <div className="agent-edit-tabs">
              <button
                className={`agent-edit-tab ${mode === 'edit' ? 'active' : ''}`}
                onClick={() => setMode('edit')}
                type="button"
              >
                <Pencil size={12} /> Editar
              </button>
              <button
                className={`agent-edit-tab ${mode === 'preview' ? 'active' : ''}`}
                onClick={() => setMode('preview')}
                type="button"
              >
                <Eye size={12} /> Preview
              </button>
            </div>
            <button className="sidebar-close-btn" onClick={onClose} aria-label="Fechar">
              <X size={16} />
            </button>
          </div>
        </div>

        {loading ? (
          <div className="agent-edit-loading">Carregando…</div>
        ) : error ? (
          <div className="agent-edit-error">{error}</div>
        ) : mode === 'edit' ? (
          <textarea
            className="agent-edit-textarea"
            value={content}
            onChange={(e) => setContent(e.target.value)}
            spellCheck={false}
          />
        ) : (
          <div className="agent-edit-preview" dangerouslySetInnerHTML={{ __html: previewHtml }} />
        )}

        <div className="agent-edit-footer">
          {saved && <span className="agent-edit-saved">Salvo</span>}
          <button className="confirm-btn-cancel" onClick={onClose} type="button">
            Fechar
          </button>
          <button
            className="confirm-btn-submit"
            onClick={save}
            disabled={saving || loading || (isNew && !nameValid)}
            type="button"
          >
            <Save size={13} /> {saving ? 'Salvando…' : isNew ? 'Criar' : 'Salvar'}
          </button>
        </div>
      </div>
    </div>,
    document.body,
  );
}
