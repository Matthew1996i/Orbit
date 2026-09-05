import { useEffect, useRef, useState } from 'react';
import { Button, Select } from 'antd';
import { Sparkles, Check, Send } from 'lucide-react';
import { AgentFileKind, AiChatMessage, AiProvider, generateMarkdownChat } from '../api';
import AppDrawer from './AppDrawer';

interface Props {
  open: boolean;
  onClose: () => void;
  kind: AgentFileKind;
  // conteudo ATUAL do editor no momento em que o drawer abre — base da
  // primeira rodada de geracao (a IA recebe o arquivo inteiro, nao um diff).
  content: string;
  aiProviders: AiProvider[];
  onApply: (content: string) => void;
}

// bloco "Gerar com IA" (drawer + chat) extraido do AgentEditScreen — so pra
// respeitar o limite de 150 linhas por arquivo do padrao de arquitetura de
// forma incremental, sem reescrever a tela inteira; conversa e enviar/
// aplicar sao autocontidos aqui, o pai so recebe o resultado final via
// onApply quando o usuario confirma.
export default function AgentGenerateDrawer({ open, onClose, kind, content, aiProviders, onApply }: Props) {
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

  useEffect(() => {
    setGenProviderId((cur) => cur || aiProviders[0]?.id || '');
  }, [aiProviders]);

  const reset = () => {
    setChatMessages([]);
    setChatInput('');
    setDraftContent(null);
    setGenError('');
  };

  const close = () => {
    reset();
    onClose();
  };

  // manda a mensagem, recebe o markdown COMPLETO ja ajustado de volta — nao
  // mexe no conteudo de verdade do editor ainda, so no rascunho
  // (draftContent). So aplica quando o usuario clica "Aplicar" no rodape.
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
    onApply(draftContent);
    close();
  };

  return (
    <AppDrawer
      open={open}
      onClose={close}
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
            <Button className="llm-btn llm-btn-secondary" onClick={close}>
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
            chatMessages.map((message, index) =>
              message.role === 'user' ? (
                <div key={index} className="agent-chat-bubble agent-chat-bubble-user">
                  {message.content}
                </div>
              ) : (
                // resposta da IA = o arquivo COMPLETO gerado nessa rodada — nunca
                // cortado/limitado em altura aqui (isso "perderia" informacao que
                // deveria estar visivel), so a lista inteira de mensagens rola.
                <div key={index} className="agent-chat-file-card">
                  <div className="agent-chat-file-card-head">
                    <Sparkles size={12} /> Arquivo atualizado
                  </div>
                  <pre className="agent-chat-file-card-code">{message.content}</pre>
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
            onChange={(event) => setChatInput(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === 'Enter' && !event.shiftKey) {
                event.preventDefault();
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
  );
}
