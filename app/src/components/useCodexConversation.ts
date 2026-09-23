import { useEffect, useRef, useState } from 'react';
import { BACKEND_WS } from '../api';
import { CodexEntry, entryFromEvent, parseCodexEvent, upsertEntry } from './codexConversationModel';
import type { ConnectionStatus, ConversationModel } from './agentConversation.types';

export const useCodexConversation = (agentId: string) => {
  const socketRef = useRef<WebSocket | null>(null);
  const reconnectRef = useRef<() => void>(() => {});
  const [entries, setEntries] = useState<CodexEntry[]>([]);
  const [connection, setConnection] = useState<ConnectionStatus>('connecting');
  const [busy, setBusy] = useState(false);
  const [stopping, setStopping] = useState(false);
  const [models, setModels] = useState<ConversationModel[]>([]);
  const [model, setModel] = useState('');
  const [effort, setEffort] = useState('');

  useEffect(() => {
    let disposed = false;
    let attempts = 0;
    let retryTimer: ReturnType<typeof setTimeout> | undefined;
    let lastSequence = 0;
    setEntries([]);
    setBusy(false);
    setStopping(false);
    setConnection('connecting');
    setModels([]);
    setModel('');
    setEffort('');

    const connect = () => {
      if (disposed) return;
      const socket = new WebSocket(`${BACKEND_WS}/ws/agent/${agentId}`);
      socketRef.current = socket;
      socket.onopen = () => {
        if (disposed) return;
        attempts = 0;
        setConnection('connected');
      };
      socket.onmessage = (message) => {
        if (disposed || typeof message.data !== 'string') return;
        const event = parseCodexEvent(message.data);
        if (!event) return;
        if (event.seq !== undefined) {
          if (event.seq <= lastSequence) return;
          lastSequence = event.seq;
        }
        if (event.type === 'ready' || event.type === 'conversation.settings') {
          if (event.models) setModels(event.models);
          if (event.model !== undefined) setModel(event.model || '');
          if (event.effort !== undefined) setEffort(event.effort || '');
        }
        if (event.type === 'state') setBusy(event.status === 'busy');
        if (event.type === 'turn.started') setBusy(true);
        if (['turn.completed', 'turn.failed', 'turn.interrupted'].includes(event.type)) {
          setBusy(false);
          setStopping(false);
        }
        const entry = entryFromEvent(event);
        if (entry) setEntries((current) => upsertEntry(current, entry));
      };
      socket.onclose = () => {
        if (disposed || socketRef.current !== socket) return;
        socketRef.current = null;
        setStopping(false);
        if (attempts >= 5) {
          setConnection('closed');
          return;
        }
        setConnection('reconnecting');
        retryTimer = setTimeout(connect, Math.min(1000 * 2 ** attempts++, 8000));
      };
      socket.onerror = () => socket.close();
    };

    reconnectRef.current = () => {
      if (socketRef.current || disposed) return;
      clearTimeout(retryTimer);
      attempts = 0;
      setConnection('connecting');
      connect();
    };
    connect();
    return () => {
      disposed = true;
      clearTimeout(retryTimer);
      reconnectRef.current = () => {};
      socketRef.current?.close();
      socketRef.current = null;
    };
  }, [agentId]);

  const sendPrompt = (text: string): boolean => {
    const prompt = text.trim();
    const socket = socketRef.current;
    if (!prompt || connection !== 'connected' || busy || socket?.readyState !== WebSocket.OPEN) return false;
    const id = crypto.randomUUID();
    try { socket.send(JSON.stringify({ type: 'prompt', id, text: prompt, model, effort })); }
    catch { return false; }
    setEntries((current) => upsertEntry(current, { id, kind: 'user', text: prompt }));
    setBusy(true);
    return true;
  };

  const interrupt = () => {
    const socket = socketRef.current;
    if (!busy || stopping || socket?.readyState !== WebSocket.OPEN) return;
    socket.send(JSON.stringify({ type: 'interrupt' }));
    setStopping(true);
  };

  const selectModel = (nextModel: string) => {
    setModel(nextModel);
    const supported = models.find((option) => option.id === nextModel)?.efforts;
    if (effort && supported && !supported.includes(effort)) setEffort('');
  };

  return {
    entries, connection, busy, stopping, sendPrompt, interrupt, reconnect: () => reconnectRef.current(),
    settings: { models, model, effort, setModel: selectModel, setEffort },
  };
};
