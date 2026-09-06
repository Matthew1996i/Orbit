import { useEffect, useMemo, useRef, useState } from 'react';
import { ConfigProvider, Button, Typography, message } from 'antd';
import { ArrowLeft, Sparkles, Trash2 } from 'lucide-react';
import { marked } from 'marked';
import { AgentFileKind, AiProvider, fetchAgentFile, saveAgentFile, deleteAgentFile, fetchAiProviders } from '../api';
import { useLlmScreenTheme } from '../utils/llmScreenTheme';
import AgentGenerateDrawer from './AgentGenerateDrawer';
import ConfirmDialog from './ConfirmDialog';
import './LlmScreens.css';
import './AgentEditScreen.css';

const { Title, Text } = Typography;

const AGENT_NAME_RE = /^[a-zA-Z0-9_-]+$/;
const COMMAND_NAME_RE = /^[a-zA-Z0-9_-]+(?::[a-zA-Z0-9_-]+)*$/;

// migalha de pao acima do titulo — sem isso, entrando direto num agente
// (ex: pela sidebar) o usuario nao tinha nenhuma pista visual de que esta
// dentro da secao "Agentes", so o nome especifico do arquivo.
const SECTION_LABEL: Record<AgentFileKind, string> = {
  agent: 'Agentes',
  skill: 'Skills',
  command: 'Comandos',
};
const SECTION_SUBTITLE: Record<AgentFileKind, string> = {
  agent: 'Subagentes configurados neste projeto.',
  skill: 'Skills configuradas neste projeto.',
  command: 'Comandos configurados neste projeto.',
};

// nome do arquivo vem do campo `name:` que o usuario escreve no frontmatter
// do proprio markdown (agent/skill/command) — sem pedir de novo num campo
// separado no cabecalho da tela. (Mesmo padrao que o antigo AgentEditModal
// usava — essa tela substitui o modal, mesma logica, agora em pagina cheia,
// no mesmo padrao visual das telas de LLM.)
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

function parseFrontmatterName(text: string): string {
  const match = text.match(/^---\n([\s\S]*?)\n---/);
  if (!match) return '';
  const line = match[1].split('\n').find((l) => /^name:/.test(l));
  if (!line) return '';
  return line.slice(line.indexOf(':') + 1).trim().replace(/^['"]|['"]$/g, '');
}

function slugify(text: string): string {
  return text
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .trim()
    .replace(/[^a-zA-Z0-9_-]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

function isValidName(name: string, kind: AgentFileKind): boolean {
  return (kind === 'command' ? COMMAND_NAME_RE : AGENT_NAME_RE).test(name.trim());
}

interface Props {
  name: string;
  subtitle?: string;
  kind: AgentFileKind;
  onBack: () => void;
  isNew?: boolean;
  // chamado APOS excluir com sucesso — quem monta a tela (AppShell) decide
  // pra qual catalogo voltar (o da secao correspondente ao `kind`), ja que
  // essa tela e generica e nao conhece rotas.
  onDeleted?: () => void;
}

export default function AgentEditScreen({ name, subtitle, kind, onBack, isNew = false, onDeleted }: Props) {
  const theme = useLlmScreenTheme();
  // A API hook (em vez de message.success estatico) recebe o ConfigProvider
  // desta tela, inclusive a cor de destaque do tema Orbit atualmente ativo.
  // A janela tem title bar própria fixa; sem este offset o toast nasce atrás
  // dela e parece que a confirmação foi cortada.
  const [messageApi, messageContext] = message.useMessage({ top: 56 });
  const [content, setContent] = useState(isNew ? NEW_TEMPLATES[kind] : '');
  const [loading, setLoading] = useState(!isNew);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [confirmingDelete, setConfirmingDelete] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [aiProviders, setAiProviders] = useState<AiProvider[]>([]);
  const [showGenerate, setShowGenerate] = useState(false);

  // editar/preview lado a lado (nao mais abas alternando) — preview sempre
  // calculado, atualiza ao vivo enquanto digita.
  const bodyContent = useMemo(() => content.replace(/^---\n[\s\S]*?\n---\n?/, ''), [content]);
  const previewHtml = useMemo(() => marked.parse(bodyContent) as string, [bodyContent]);

  // rolagem sincronizada entre os dois paineis (por proporcao, nao por
  // pixel — o markdown renderizado tem uma altura diferente do texto cru) —
  // `syncingRef` evita loop infinito: o scroll disparado programaticamente
  // no painel de destino tambem dispara o proprio onScroll dele.
  const editorRef = useRef<HTMLTextAreaElement>(null);
  const previewPaneRef = useRef<HTMLDivElement>(null);
  const syncingRef = useRef<'editor' | 'preview' | null>(null);

  const syncScroll = (from: 'editor' | 'preview') => {
    if (syncingRef.current && syncingRef.current !== from) return;
    const source = from === 'editor' ? editorRef.current : previewPaneRef.current;
    const target = from === 'editor' ? previewPaneRef.current : editorRef.current;
    if (!source || !target) return;
    const sourceRange = source.scrollHeight - source.clientHeight;
    const ratio = sourceRange > 0 ? source.scrollTop / sourceRange : 0;
    const targetRange = target.scrollHeight - target.clientHeight;
    syncingRef.current = from;
    target.scrollTop = ratio * targetRange;
    requestAnimationFrame(() => {
      syncingRef.current = null;
    });
  };

  useEffect(() => {
    fetchAiProviders().then(setAiProviders).catch(() => {});
  }, []);

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

  const rawName = !isNew ? name : parseFrontmatterName(content);
  const effectiveName = !isNew || isValidName(rawName, kind) ? rawName : slugify(rawName);
  const nameValid = isValidName(effectiveName, kind);

  const save = async () => {
    if (isNew && !nameValid) return;
    setSaving(true);
    setError('');
    const finalContent =
      isNew && rawName.trim() !== effectiveName
        ? content.replace(/^(---\n[\s\S]*?\nname:)([^\n]*)/, `$1 ${effectiveName}`)
        : content;
    const res = await saveAgentFile(effectiveName.trim(), finalContent, kind);
    setSaving(false);
    if ('error' in res) {
      setError(res.error);
      messageApi.error(`Não foi possível salvar: ${res.error}`);
      return;
    }
    if (finalContent !== content) setContent(finalContent);
    messageApi.success(`${SECTION_LABEL[kind].slice(0, -1)} salvo com sucesso.`);
  };

  const confirmDelete = async () => {
    setDeleting(true);
    const res = await deleteAgentFile(name, kind);
    setDeleting(false);
    if ('error' in res) {
      setConfirmingDelete(false);
      setError(res.error);
      return;
    }
    setConfirmingDelete(false);
    onDeleted?.();
  };

  return (
    <ConfigProvider theme={theme}>
      {messageContext}
      <div className="agent-screen">
        <div className="agent-screen-inner">
          <div className="agent-screen-header">
            {/* nivel 1: secao (mesmo cabecalho/tamanho da tela de catalogo,
                com o botao de voltar do lado — nao no titulo especifico do
                agente abaixo). */}
            <div className="llm-screen-header agent-screen-header-section">
              <button className="llm-screen-back" onClick={onBack} aria-label="Voltar">
                <ArrowLeft size={16} />
              </button>
              <div>
                <Title level={3} className="llm-screen-title">{SECTION_LABEL[kind]}</Title>
                <Text className="llm-screen-subtitle">{SECTION_SUBTITLE[kind]}</Text>
              </div>
            </div>

            {/* nivel 2: o agente especifico — sem botao de voltar proprio,
                ja coberto pelo nivel 1 acima. Titulo e as acoes (Gerar com
                IA/Salvar) no mesmo nivel/linha, lado a lado. */}
            <div className="agent-screen-title-row">
              <div className="agent-screen-title-block">
                <Title level={3} className="llm-screen-title">
                  {isNew ? effectiveName || 'Novo item' : name}
                </Title>
                {isNew && !nameValid && (
                  <Text className="llm-screen-subtitle">
                    Defina um `name:` válido no frontmatter (letras/números/-/_ {kind === 'command' ? ' e namespaces separados por :' : ''})
                  </Text>
                )}
                {subtitle && <Text className="llm-screen-subtitle">{subtitle}</Text>}
              </div>

              <div className="agent-screen-header-actions">
                {/* oculto em criacao (isNew) — nao ha nada no disco ainda
                    pra excluir. */}
                {!isNew && (
                  <Button
                    className="llm-btn llm-btn-secondary llm-btn-danger"
                    icon={<Trash2 size={13} />}
                    onClick={() => setConfirmingDelete(true)}
                  >
                    Excluir
                  </Button>
                )}
                <Button
                  className="llm-btn llm-btn-secondary"
                  icon={<Sparkles size={13} />}
                  onClick={() => setShowGenerate(true)}
                  disabled={aiProviders.length === 0}
                  title={aiProviders.length === 0 ? 'Cadastre um provedor de IA na sidebar primeiro' : 'Gerar com IA'}
                >
                  Gerar com IA
                </Button>
                <Button
                  className="llm-btn llm-btn-primary"
                  onClick={save}
                  disabled={saving || loading || (isNew && !nameValid)}
                >
                  {saving ? 'Salvando…' : 'Salvar'}
                </Button>
              </div>
            </div>
          </div>

          <AgentGenerateDrawer
            open={showGenerate}
            onClose={() => setShowGenerate(false)}
            kind={kind}
            content={content}
            aiProviders={aiProviders}
            onApply={setContent}
          />

          {loading ? (
            <div className="agent-screen-loading">Carregando…</div>
          ) : error ? (
            <div className="agent-screen-error">{error}</div>
          ) : (
            <div className="agent-screen-split">
              <div className="agent-screen-pane">
                <div className="agent-screen-pane-label">Editar</div>
                <textarea
                  ref={editorRef}
                  className="agent-screen-textarea"
                  value={content}
                  onChange={(e) => setContent(e.target.value)}
                  onScroll={() => syncScroll('editor')}
                  spellCheck={false}
                />
              </div>
              <div className="agent-screen-pane">
                <div className="agent-screen-pane-label">Preview</div>
                <div
                  ref={previewPaneRef}
                  className="agent-screen-preview"
                  onScroll={() => syncScroll('preview')}
                  dangerouslySetInnerHTML={{ __html: previewHtml }}
                />
              </div>
            </div>
          )}
        </div>
      </div>

      <ConfirmDialog
        open={confirmingDelete}
        title={`Excluir ${name}?`}
        message={
          kind === 'skill'
            ? 'A pasta inteira da skill é removida do disco (SKILL.md e quaisquer outros arquivos dentro dela). Essa ação não pode ser desfeita.'
            : 'O arquivo é removido do disco. Essa ação não pode ser desfeita.'
        }
        confirmText={deleting ? 'Excluindo…' : 'Excluir'}
        danger
        onConfirm={confirmDelete}
        onCancel={() => setConfirmingDelete(false)}
      />
    </ConfigProvider>
  );
}
