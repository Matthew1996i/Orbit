import { useEffect, useMemo, useRef, useState } from 'react';
import { ConfigProvider, Button, Select, Typography } from 'antd';
import { ArrowLeft, Sparkles, Check, Send } from 'lucide-react';
import { marked } from 'marked';
import {
  AgentFileKind,
  AiChatMessage,
  AiProvider,
  fetchAgentFile,
  saveAgentFile,
  generateMarkdownChat,
  fetchAiProviders,
} from '../api';
import { useLlmScreenTheme } from '../utils/llmScreenTheme';
import AppDrawer from './AppDrawer';
import './LlmScreens.css';
import './AgentEditScreen.css';

const { Title, Text } = Typography;

const AGENT_NAME_RE = /^[a-zA-Z0-9_-]+$/;

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

interface Props {
  name: string;
  subtitle?: string;
  kind: AgentFileKind;
  onBack: () => void;
  isNew?: boolean;
}

export default function AgentEditScreen({ name, subtitle, kind, onBack, isNew = false }: Props) {
  const theme = useLlmScreenTheme();
  const [content, setContent] = useState(isNew ? NEW_TEMPLATES[kind] : '');
  const [loading, setLoading] = useState(!isNew);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState('');
  const [aiProviders, setAiProviders] = useState<AiProvider[]>([]);
  const [showGenerate, setShowGenerate] = useState(false);
  const [genProviderId, setGenProviderId] = useState('');
  // conversa: cada rodada e um pedido do usuario + o markdown COMPLETO que a
  // IA devolveu ja incorporando o pedido (nunca um diff) — mandado de volta
  // como historico a cada nova mensagem, pra IA saber o que ja foi pedido
  // antes (o backend nao guarda estado nenhum entre chamadas).
  const [chatMessages, setChatMessages] = useState<AiChatMessage[]>([]);
  const [chatInput, setChatInput] = useState('');
  const [sending, setSending] = useState(false);
  const [genError, setGenError] = useState('');
  // rascunho = ultima resposta da IA, ainda NAO aplicado ao editor — so
  // sobrescreve o conteudo de verdade quando o usuario clica "Aplicar" no
  // rodape (null = nenhuma rodada ainda, ninguem gerou nada nessa conversa).
  const [draftContent, setDraftContent] = useState<string | null>(null);
  // sempre rola pra ultima mensagem (enviada ou recebida) — sem isso, numa
  // conversa longa, cada resposta nova da IA (que pode ser um arquivo grande)
  // ficava fora da vista, exigindo rolar manualmente toda vez.
  const chatMessagesEndRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    chatMessagesEndRef.current?.scrollIntoView({ block: 'end' });
  }, [chatMessages, sending]);
  // devolve o foco pro campo de mensagem depois de mandar (o clique no botao
  // de enviar tira o foco do textarea) — pronto pra digitar a proxima sem
  // precisar clicar de novo.
  const chatInputRef = useRef<HTMLTextAreaElement>(null);

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
    fetchAiProviders()
      .then((providers) => {
        setAiProviders(providers);
        setGenProviderId((cur) => cur || providers[0]?.id || '');
      })
      .catch(() => {});
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
  const effectiveName = !isNew || AGENT_NAME_RE.test(rawName.trim()) ? rawName : slugify(rawName);
  const nameValid = AGENT_NAME_RE.test(effectiveName.trim());

  const save = async () => {
    if (isNew && !nameValid) return;
    setSaving(true);
    setSaved(false);
    const finalContent =
      isNew && rawName.trim() !== effectiveName
        ? content.replace(/^(---\n[\s\S]*?\nname:)([^\n]*)/, `$1 ${effectiveName}`)
        : content;
    const res = await saveAgentFile(effectiveName.trim(), finalContent, kind);
    setSaving(false);
    if ('error' in res) {
      setError(res.error);
      return;
    }
    if (finalContent !== content) setContent(finalContent);
    setSaved(true);
    setTimeout(() => setSaved(false), 1800);
  };

  // manda a mensagem, recebe o markdown COMPLETO ja ajustado de volta — nao
  // mexe no `content` do editor ainda, so no rascunho (draftContent). So
  // aplica (sobrescreve o editor de verdade) quando o usuario clica
  // "Aplicar" no rodape, ver applyGenerated abaixo.
  const sendChatMessage = async () => {
    const text = chatInput.trim();
    if (!text || !genProviderId || sending) return;
    const nextMessages: AiChatMessage[] = [...chatMessages, { role: 'user', content: text }];
    setChatMessages(nextMessages);
    setChatInput('');
    setSending(true);
    setGenError('');
    const res = await generateMarkdownChat(genProviderId, kind, draftContent ?? content, nextMessages);
    setSending(false);
    if ('error' in res) {
      setGenError(res.error);
      return;
    }
    setDraftContent(res.content);
    setChatMessages([...nextMessages, { role: 'assistant', content: res.content }]);
    chatInputRef.current?.focus();
  };

  const applyGenerated = () => {
    if (draftContent === null) return;
    setContent(draftContent);
    closeGenerateDrawer();
  };

  const closeGenerateDrawer = () => {
    setShowGenerate(false);
    setChatMessages([]);
    setChatInput('');
    setDraftContent(null);
    setGenError('');
  };

  return (
    <ConfigProvider theme={theme}>
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
                    Defina um `name:` válido no frontmatter (letras/números/-/_)
                  </Text>
                )}
                {subtitle && <Text className="llm-screen-subtitle">{subtitle}</Text>}
              </div>

              <div className="agent-screen-header-actions">
                <Button
                  className="llm-btn llm-btn-secondary"
                  icon={<Sparkles size={13} />}
                  onClick={() => setShowGenerate(true)}
                  disabled={aiProviders.length === 0}
                  title={aiProviders.length === 0 ? 'Cadastre um provedor de IA na sidebar primeiro' : 'Gerar com IA'}
                >
                  Gerar com IA
                </Button>
                {saved && <span className="agent-screen-saved">Salvo</span>}
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

          <AppDrawer
            open={showGenerate}
            onClose={closeGenerateDrawer}
            width={720}
            title="Gerar com IA"
            subtitle="Converse com o provedor cadastrado para ir ajustando o arquivo"
            icon={<Sparkles size={16} />}
            footer={
              <div className="agent-screen-generate-footer">
                <Select
                  className="agent-screen-generate-select"
                  value={genProviderId || undefined}
                  onChange={(value) => setGenProviderId(value)}
                  placeholder="Provedor de IA"
                  options={aiProviders.map((p) => ({ value: p.id, label: p.title }))}
                />
                <div className="agent-screen-generate-footer-actions">
                  <Button className="llm-btn llm-btn-secondary" onClick={closeGenerateDrawer}>
                    Cancelar
                  </Button>
                  <Button
                    className="llm-btn llm-btn-primary"
                    icon={<Check size={13} />}
                    onClick={applyGenerated}
                    disabled={draftContent === null}
                  >
                    Aplicar
                  </Button>
                </div>
              </div>
            }
          >
            <div className="agent-chat">
              <div className="agent-chat-messages">
                {chatMessages.length === 0 ? (
                  <div className="agent-chat-empty">
                    Descreva o que esse arquivo deve conter, ou peça um ajuste em cima do
                    conteúdo atual — a IA responde só com o arquivo, nunca executa nada.
                  </div>
                ) : (
                  chatMessages.map((m, i) =>
                    m.role === 'user' ? (
                      <div key={i} className="agent-chat-bubble agent-chat-bubble-user">
                        {m.content}
                      </div>
                    ) : (
                      // resposta da IA = o arquivo COMPLETO gerado nessa rodada — nunca
                      // cortado/limitado em altura aqui (isso "perderia" informacao que
                      // deveria estar visivel), so a lista inteira de mensagens rola.
                      <div key={i} className="agent-chat-file-card">
                        <div className="agent-chat-file-card-head">
                          <Sparkles size={12} /> Arquivo atualizado
                        </div>
                        <pre className="agent-chat-file-card-code">{m.content}</pre>
                      </div>
                    ),
                  )
                )}
                {sending && (
                  <div className="agent-chat-typing">
                    <span />
                    <span />
                    <span />
                  </div>
                )}
                {genError && <div className="agent-screen-error">{genError}</div>}
                <div ref={chatMessagesEndRef} />
              </div>

              <div className="agent-chat-input-row">
                <textarea
                  ref={chatInputRef}
                  className="agent-chat-input"
                  value={chatInput}
                  onChange={(e) => setChatInput(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' && !e.shiftKey) {
                      e.preventDefault();
                      sendChatMessage();
                    }
                  }}
                  placeholder={
                    draftContent === null
                      ? 'Descreva o que esse arquivo deve conter…'
                      : 'Peça um ajuste no rascunho…'
                  }
                  spellCheck={false}
                  autoFocus
                />
                <button
                  type="button"
                  className="agent-chat-send"
                  onClick={sendChatMessage}
                  disabled={sending || !chatInput.trim() || !genProviderId}
                  aria-label="Enviar"
                  title={!genProviderId ? 'Escolha um provedor de IA primeiro' : 'Enviar'}
                >
                  <Send size={15} />
                </button>
              </div>
            </div>
          </AppDrawer>

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
    </ConfigProvider>
  );
}
