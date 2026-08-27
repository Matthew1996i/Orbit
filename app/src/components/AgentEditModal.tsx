import { useEffect, useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import { X, Save, Eye, Pencil } from 'lucide-react';
import { marked } from 'marked';
import { AgentFileKind, fetchAgentFile, saveAgentFile } from '../api';
import './ConfirmDialog.css';
import './Sidebar.css';
import './AgentEditModal.css';

interface Props {
  name: string;
  subtitle?: string;
  kind: AgentFileKind;
  onClose: () => void;
}

export default function AgentEditModal({ name, subtitle, kind, onClose }: Props) {
  const [content, setContent] = useState('');
  const [loading, setLoading] = useState(true);
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
    fetchAgentFile(name, kind).then((res) => {
      setLoading(false);
      if ('error' in res) {
        setError(res.error);
        return;
      }
      setContent(res.content);
    });
  }, [name, kind]);

  const save = async () => {
    setSaving(true);
    setSaved(false);
    const res = await saveAgentFile(name, content, kind);
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
            <h2>{name}</h2>
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
          <button className="confirm-btn-submit" onClick={save} disabled={saving || loading} type="button">
            <Save size={13} /> {saving ? 'Salvando…' : 'Salvar'}
          </button>
        </div>
      </div>
    </div>,
    document.body,
  );
}
