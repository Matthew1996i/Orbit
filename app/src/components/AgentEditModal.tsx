import { useEffect, useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import { X, Save, Eye, Pencil, Sparkles } from 'lucide-react';
import { marked } from 'marked';
import { AgentFileKind, AiProvider, fetchAgentFile, saveAgentFile, generateMarkdown } from '../api';
import './ConfirmDialog.css';
import './Sidebar.css';
import './AgentEditModal.css';

const AGENT_NAME_RE = /^[a-zA-Z0-9_-]+$/;

// nome do arquivo vem do campo `name:` que o usuario escreve no frontmatter
// do proprio markdown (agent/skill/command) — sem pedir de novo num campo
// separado no cabecalho do modal.
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
name: nome-do-comando
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
  aiProviders?: AiProvider[];
}

export default function AgentEditModal({
  name,
  subtitle,
  kind,
  onClose,
  isNew = false,
  aiProviders = [],
}: Props) {
  const [content, setContent] = useState(isNew ? NEW_TEMPLATES[kind] : '');
  const [loading, setLoading] = useState(!isNew);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState('');
  const [mode, setMode] = useState<'edit' | 'preview'>('edit');
  const [showGenerate, setShowGenerate] = useState(false);
  const [genProviderId, setGenProviderId] = useState(aiProviders[0]?.id ?? '');
  const [genDescription, setGenDescription] = useState('');
  const [generating, setGenerating] = useState(false);
  const [genError, setGenError] = useState('');

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

  // aiProviders chega via prop e pode ainda estar vazio no primeiro render
  // (a sidebar busca de forma assincrona) — assim que a lista chega, usa o
  // primeiro provedor como padrao do seletor.
  useEffect(() => {
    if (!genProviderId && aiProviders.length > 0) setGenProviderId(aiProviders[0].id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [aiProviders]);

  const effectiveName = !isNew ? name : parseFrontmatterName(content);
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

  const generate = async () => {
    if (!genProviderId || !genDescription.trim()) return;
    setGenerating(true);
    setGenError('');
    const res = await generateMarkdown(genProviderId, kind, genDescription.trim());
    setGenerating(false);
    if ('error' in res) {
      setGenError(res.error);
      return;
    }
    setContent(res.content);
    setShowGenerate(false);
    setGenDescription('');
  };

  return createPortal(
    <div className="agent-edit-overlay" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className="agent-edit-dialog">
        <div className="agent-edit-header">
          <div>
            <h2>{isNew ? effectiveName || 'Novo item' : name}</h2>
            {isNew && !nameValid && (
              <span className="agent-edit-sub">defina um `name:` válido no frontmatter (letras/números/-/_)</span>
            )}
            {subtitle && <span className="agent-edit-sub">{subtitle}</span>}
          </div>
          <div className="agent-edit-header-actions">
            <button
              className="agent-edit-generate-btn"
              onClick={() => setShowGenerate((v) => !v)}
              disabled={aiProviders.length === 0}
              title={aiProviders.length === 0 ? 'Cadastre um provedor de IA na sidebar primeiro' : 'Gerar com IA'}
              type="button"
            >
              <Sparkles size={13} /> Gerar com IA
            </button>
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

        {showGenerate && (
          <div className="agent-edit-generate-panel">
            <select
              className="new-agent-input agent-edit-generate-select"
              value={genProviderId}
              onChange={(e) => setGenProviderId(e.target.value)}
            >
              {aiProviders.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.title}
                </option>
              ))}
            </select>
            <textarea
              className="agent-edit-generate-textarea"
              value={genDescription}
              onChange={(e) => setGenDescription(e.target.value)}
              placeholder="Descreva o que esse arquivo deve conter — a IA só gera o texto markdown, não executa nada."
              spellCheck={false}
            />
            {genError && <div className="agent-edit-error agent-edit-generate-error">{genError}</div>}
            <div className="agent-edit-generate-actions">
              <button className="confirm-btn-cancel" onClick={() => setShowGenerate(false)} type="button">
                Cancelar
              </button>
              <button
                className="confirm-btn-submit"
                onClick={generate}
                disabled={generating || !genDescription.trim()}
                type="button"
              >
                <Sparkles size={13} /> {generating ? 'Gerando…' : 'Gerar'}
              </button>
            </div>
          </div>
        )}

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
