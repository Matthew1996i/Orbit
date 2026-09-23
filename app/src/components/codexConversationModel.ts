import type { ConversationEntry, ConversationModel } from './agentConversation.types';
export type CodexEntry = ConversationEntry;

export type CodexEvent = {
  type: string;
  seq?: number;
  id?: string;
  status?: string;
  text?: string;
  message?: string;
  model?: string | null;
  effort?: string | null;
  models?: ConversationModel[];
  error?: { message?: string };
  item?: {
    id: string;
    type: string;
    text?: string;
    command?: string;
    aggregated_output?: string;
    status?: string;
    exit_code?: number;
    changes?: Array<{ path: string; kind: string }>;
    items?: Array<{ text: string; completed: boolean }>;
    server?: string;
    tool?: string;
    query?: string;
    message?: string;
    error?: { message?: string };
  };
};

const asRecord = (value: unknown): Record<string, unknown> | null =>
  value !== null && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, unknown> : null;

export const parseCodexEvent = (raw: string): CodexEvent | null => {
  let value: unknown;
  try { value = JSON.parse(raw); } catch { return null; }
  const source = asRecord(value);
  if (!source || typeof source.type !== 'string') return null;
  const itemSource = asRecord(source.item);
  const itemError = asRecord(itemSource?.error);
  const eventError = asRecord(source.error);
  const changes = Array.isArray(itemSource?.changes) ? itemSource.changes.flatMap((value: unknown) => {
    const change = asRecord(value);
    return change && typeof change.path === 'string' && typeof change.kind === 'string'
      ? [{ path: change.path, kind: change.kind }] : [];
  }) : undefined;
  const items = Array.isArray(itemSource?.items) ? itemSource.items.flatMap((value: unknown) => {
    const todo = asRecord(value);
    return todo && typeof todo.text === 'string' && typeof todo.completed === 'boolean'
      ? [{ text: todo.text, completed: todo.completed }] : [];
  }) : undefined;
  const models = Array.isArray(source.models) ? source.models.flatMap((value: unknown) => {
    const model = asRecord(value);
    if (!model || typeof model.id !== 'string' || typeof model.label !== 'string' || !Array.isArray(model.efforts)) return [];
    return [{ id: model.id, label: model.label, efforts: model.efforts.filter((effort): effort is string => typeof effort === 'string') }];
  }) : undefined;
  return {
    type: source.type,
    seq: typeof source.seq === 'number' ? source.seq : undefined,
    id: typeof source.id === 'string' ? source.id : undefined,
    status: typeof source.status === 'string' ? source.status : undefined,
    text: typeof source.text === 'string' ? source.text : undefined,
    message: typeof source.message === 'string' ? source.message : undefined,
    model: typeof source.model === 'string' ? source.model : source.model === null ? null : undefined,
    effort: typeof source.effort === 'string' ? source.effort : source.effort === null ? null : undefined,
    models,
    error: eventError && typeof eventError.message === 'string' ? { message: eventError.message } : undefined,
    item: itemSource && typeof itemSource.id === 'string' && typeof itemSource.type === 'string' ? {
      id: itemSource.id, type: itemSource.type,
      text: typeof itemSource.text === 'string' ? itemSource.text : undefined,
      command: typeof itemSource.command === 'string' ? itemSource.command : undefined,
      aggregated_output: typeof itemSource.aggregated_output === 'string' ? itemSource.aggregated_output : undefined,
      status: typeof itemSource.status === 'string' ? itemSource.status : undefined,
      exit_code: typeof itemSource.exit_code === 'number' ? itemSource.exit_code : undefined,
      changes, items,
      server: typeof itemSource.server === 'string' ? itemSource.server : undefined,
      tool: typeof itemSource.tool === 'string' ? itemSource.tool : undefined,
      query: typeof itemSource.query === 'string' ? itemSource.query : undefined,
      message: typeof itemSource.message === 'string' ? itemSource.message : undefined,
      error: itemError && typeof itemError.message === 'string' ? { message: itemError.message } : undefined,
    } : undefined,
  };
};

export const entryFromEvent = (event: CodexEvent): CodexEntry | null => {
  const item = event.item;
  if (event.type === 'user.message' && event.text) {
    return { id: event.id || `event-${event.seq}`, kind: 'user', text: event.text };
  }
  if (event.type === 'turn.interrupted') {
    return { id: `event-${event.seq}`, kind: 'activity', title: 'Resposta interrompida', text: '' };
  }
  if (event.type === 'error' || event.type === 'turn.failed') {
    return { id: `event-${event.seq}`, kind: 'error', text: event.error?.message || event.message || 'Falha no Codex SDK' };
  }
  if (!event.type.startsWith('item.') || !item) return null;
  if (item.type === 'agent_message') return { id: item.id, kind: 'assistant', text: item.text || '' };
  if (item.type === 'error') return { id: item.id, kind: 'error', text: item.message || 'Erro no Codex' };
  if (item.type === 'reasoning') return { id: item.id, kind: 'activity', title: 'Raciocínio', text: item.text || '' };
  if (item.type === 'command_execution') return {
    id: item.id, kind: 'activity', title: item.command || 'Comando',
    text: item.aggregated_output || '', status: item.status === 'failed' || item.exit_code ? 'failed' : item.status,
  };
  if (item.type === 'file_change') return {
    id: item.id, kind: 'activity', title: 'Arquivos alterados',
    text: (item.changes || []).map((change) => `${change.kind}: ${change.path}`).join('\n'), status: item.status,
  };
  if (item.type === 'mcp_tool_call') return {
    id: item.id, kind: 'activity', title: `${item.server || 'MCP'} · ${item.tool || 'ferramenta'}`,
    text: item.error?.message || '', status: item.status,
  };
  if (item.type === 'web_search') return { id: item.id, kind: 'activity', title: 'Busca na web', text: item.query || '' };
  if (item.type === 'todo_list') return {
    id: item.id, kind: 'activity', title: 'Plano de trabalho',
    text: (item.items || []).map((todo) => `${todo.completed ? '✓' : '○'} ${todo.text}`).join('\n'),
  };
  return null;
};

export const upsertEntry = (entries: CodexEntry[], entry: CodexEntry): CodexEntry[] => {
  const position = entries.findIndex((current) => current.id === entry.id);
  if (position < 0) return [...entries, entry];
  if (entries[position].text === entry.text && entries[position].status === entry.status) return entries;
  const next = [...entries];
  next[position] = entry;
  return next;
};
