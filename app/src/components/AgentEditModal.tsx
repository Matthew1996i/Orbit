import { useEffect, useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import { X, Save, Eye, Pencil } from 'lucide-react';
import { marked } from 'marked';
import { AgentFileKind, fetchAgentFile, saveAgentFile } from '../api';
import './ConfirmDialog.css';
import './Sidebar.css';
import './AgentEditModal.css';

const AGENT_NAME_RE = /^[a-zA-Z0-9_-]+$/;

// agente/skill tem `name:` no frontmatter (o proprio Claude Code le dali) —
// entao o nome do arquivo vem do que o usuario escreve no markdown, sem
// pedir de novo num campo separado. Comando NAO tem essa convencao (o nome
// do comando E o nome do arquivo, o frontmatter so tem `description`), por
// isso comando continua com campo de nome editavel no cabecalho.
const NEW_TEMPLATES: Record<AgentFileKind, string> = {
  agent: `---
name: nome-do-agente
description:
model: sonnet
tools:
---

`,
  skill: `---
name: nome-da-skill
description:
version: 1.0.0
---

`,
  command: `---
description:
---

`,
};

// le so o campo `name:` do frontmatter (--- ... ---) no topo do arquivo.
function parseFrontmatterName(text: string): string {
  const match = text.match(/^---\n([\s\S]*?)\n---/);
  if (!match) return '';
  const line = match[1].split('\n').find((l) => /^name:/.test(l));
  if (!line) return '';
  return line.slice(line.indexOf(':') + 1).trim().replace(/^['"]|['"]$/g, '');
}

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
  const [content, setContent] = useState(isNew ? NEW_TEMPLATES[kind] : '');
  const [commandName, setCommandName] = useState('');
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

  const usesFrontmatterName = kind === 'agent' || kind === 'skill';
  const effectiveName = !isNew ? name : usesFrontmatterName ? parseFrontmatterName(content) : commandName;
  const nameValid = AGENT_NAME_RE.test(effectiveName.trim());

  const save = async () => {
    if (isNew && !nameValid) return;
    setSaving(true);
    setSaved(false);
    const res = await saveAgentFile(effectiveName.trim(), content, kind);
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
            {isNew && !usesFrontmatterName ? (
              <input
                className="agent-edit-name-input"
                value={commandName}
                onChange={(e) => setCommandName(e.target.value)}
                placeholder="nome-do-comando"
                autoFocus
                spellCheck={false}
              />
            ) : (
              <h2>{isNew ? effectiveName || 'Novo item' : name}</h2>
            )}
            {isNew && !nameValid && usesFrontmatterName && (
              <span className="agent-edit-sub">defina um `name:` válido no frontmatter (letras/números/-/_)</span>
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
