import { useEffect, useMemo, useRef, useState } from 'react';
import { ArrowDown, ArrowClockwise, Check, Copy, PaperPlaneRight, Stop } from '@phosphor-icons/react';
import { AgentActivityGroup } from './AgentActivityGroup';
import { AgentMarkdown } from './AgentMarkdown';
import type { ConversationController, ConversationEntry } from './agentConversation.types';
import './AgentConversation.css';

type Row = { kind: 'activity'; entries: ConversationEntry[] } | { kind: 'message'; entry: ConversationEntry };
type Props = { conversationKey: string; controller: ConversationController };

const groupEntries = (entries: ConversationEntry[]): Row[] => {
  const rows: Row[] = [];
  for (const entry of entries) {
    const previous = rows[rows.length - 1];
    if (entry.kind === 'activity' && previous?.kind === 'activity') previous.entries.push(entry);
    else if (entry.kind === 'activity') rows.push({ kind: 'activity', entries: [entry] });
    else rows.push({ kind: 'message', entry });
  }
  return rows;
};

export const AgentConversation = ({ conversationKey, controller }: Props) => {
  const { entries, connection, busy, stopping, sendPrompt, interrupt, reconnect, settings } = controller;
  const [draft, setDraft] = useState('');
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [showJump, setShowJump] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);
  const contentRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const followRef = useRef(true);
  const rows = useMemo(() => groupEntries(entries), [entries]);
  const connected = connection === 'connected';
  const selectedModel = settings?.models.find((option) => option.id === settings.model);
  const efforts = selectedModel?.efforts || (settings?.models.length
    ? settings.models[0].efforts.filter((effort) => settings.models.every((option) => option.efforts.includes(effort)))
    : []);

  useEffect(() => { setDraft(''); followRef.current = true; }, [conversationKey]);
  useEffect(() => {
    const input = inputRef.current;
    if (!input) return;
    input.style.height = 'auto';
    input.style.height = `${Math.min(input.scrollHeight, 160)}px`;
  }, [draft]);
  useEffect(() => {
    const viewport = scrollRef.current;
    const content = contentRef.current;
    if (!viewport || !content) return;
    const observer = new ResizeObserver(() => {
      if (followRef.current) viewport.scrollTop = viewport.scrollHeight;
      else setShowJump(true);
    });
    observer.observe(content);
    viewport.scrollTop = viewport.scrollHeight;
    return () => observer.disconnect();
  }, []);

  const jumpToBottom = () => {
    followRef.current = true;
    const viewport = scrollRef.current;
    if (viewport?.scrollTo) viewport.scrollTo({ top: viewport.scrollHeight, behavior: 'smooth' });
    else if (viewport) viewport.scrollTop = viewport.scrollHeight;
    setShowJump(false);
  };
  const submit = () => {
    if (!sendPrompt(draft)) return;
    setDraft('');
    jumpToBottom();
    inputRef.current?.focus();
  };
  const copyMessage = async (entry: ConversationEntry) => {
    try {
      await navigator.clipboard.writeText(entry.text);
      setCopiedId(entry.id);
      setTimeout(() => setCopiedId(null), 2000);
    } catch { setCopiedId(null); }
  };

  return <div className="agent-conversation">
    <div className="agent-conversation-scroll-wrap">
      <div className="agent-conversation-scroll" ref={scrollRef} onScroll={() => {
        const viewport = scrollRef.current;
        if (!viewport) return;
        const nearBottom = viewport.scrollHeight - viewport.scrollTop - viewport.clientHeight < 90;
        followRef.current = nearBottom;
        if (nearBottom) setShowJump(false);
      }} role="log" aria-label="Conversa com o assistente" aria-live="polite">
        <div className="agent-conversation-content" ref={contentRef}>
          {entries.length === 0 && <div className="agent-conversation-empty">Escreva uma mensagem para iniciar a conversa.</div>}
          {rows.map((row, index) => row.kind === 'activity'
            ? <AgentActivityGroup key={row.entries[0].id} entries={row.entries} running={busy && index === rows.length - 1} />
            : <div key={row.entry.id} className={`agent-conversation-message agent-conversation-${row.entry.kind}`}>
              {row.entry.kind === 'assistant' && <button className="agent-conversation-copy" type="button" onClick={() => copyMessage(row.entry)} aria-label="Copiar resposta">
                {copiedId === row.entry.id ? <Check size={14} /> : <Copy size={14} />}
              </button>}
              {row.entry.kind === 'assistant' ? <AgentMarkdown text={row.entry.text} /> : <p>{row.entry.text}</p>}
            </div>)}
          {busy && <div className="agent-conversation-thinking" role="status"><span aria-hidden="true"><i /><i /><i /></span>{stopping ? 'Interrompendo…' : 'Respondendo…'}</div>}
        </div>
      </div>
      {showJump && <button className="agent-conversation-jump" type="button" onClick={jumpToBottom} aria-label="Ir para o fim da conversa"><ArrowDown size={16} /></button>}
    </div>
    {connection !== 'connected' && <div className="agent-conversation-connection" role="status">
      {connection === 'closed' ? 'Conexão encerrada.' : 'Reconectando…'}
      {connection === 'closed' && <button type="button" onClick={reconnect}><ArrowClockwise size={14} /> Tentar novamente</button>}
    </div>}
    <div className="agent-conversation-composer-row"><div className="agent-conversation-composer">
      <textarea ref={inputRef} value={draft} onChange={(event) => setDraft(event.target.value)}
        onKeyDown={(event) => {
          if (event.key === 'Enter' && !event.shiftKey && !event.nativeEvent.isComposing && connected && !busy) {
            event.preventDefault(); submit();
          }
        }} placeholder="Envie uma mensagem…" aria-label="Mensagem para o assistente" rows={1} maxLength={100000} />
      {busy ? <button className="agent-conversation-stop" type="button" onClick={interrupt} disabled={!connected || stopping} aria-label="Interromper resposta"><Stop size={16} weight="fill" /></button>
        : <button className="agent-conversation-send" type="button" onClick={submit} disabled={!connected || !draft.trim()} aria-label="Enviar mensagem"><PaperPlaneRight size={16} weight="fill" /></button>}
    </div>
    {settings && <div className="agent-conversation-settings" aria-label="Configuração da conversa">
      <label>Modelo
        <select value={settings.model} onChange={(event) => settings.setModel(event.target.value)} disabled={!connected || busy || !settings.models.length} aria-label="Modelo da conversa">
          <option value="">Padrão</option>
          {settings.models.map((option) => <option key={option.id} value={option.id}>{option.label}</option>)}
        </select>
      </label>
      <label>Esforço
        <select value={efforts.includes(settings.effort) ? settings.effort : ''} onChange={(event) => settings.setEffort(event.target.value)} disabled={!connected || busy || !efforts.length} aria-label="Esforço de raciocínio">
          <option value="">Padrão</option>
          {efforts.map((value) => <option key={value} value={value}>{({ low: 'Baixo', medium: 'Médio', high: 'Alto', xhigh: 'Muito alto', max: 'Máximo', ultra: 'Ultra', minimal: 'Mínimo', persistent: 'Persistente' } as Record<string, string>)[value] || value}</option>)}
        </select>
      </label>
      <span>Aplica-se à próxima mensagem</span>
    </div>}
    </div>
  </div>;
};
