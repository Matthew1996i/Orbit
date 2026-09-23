import { describe, expect, it } from 'vitest';
import { entryFromEvent, parseCodexEvent, upsertEntry } from './codexConversationModel';

describe('Codex conversation events', () => {
  it('rejects malformed events and converts streamed messages safely', () => {
    expect(parseCodexEvent('{')).toBeNull();
    expect(parseCodexEvent('{"type":4}')).toBeNull();
    const event = parseCodexEvent(JSON.stringify({
      type: 'item.updated', seq: 4,
      item: { id: 'message-1', type: 'agent_message', text: 'Olá **mundo**' },
    }));
    expect(event && entryFromEvent(event)).toEqual({ id: 'message-1', kind: 'assistant', text: 'Olá **mundo**' });
  });

  it('updates a streaming item without duplicating it', () => {
    const first = { id: 'item-1', kind: 'assistant' as const, text: 'O' };
    const updated = { ...first, text: 'Olá' };
    expect(upsertEntry(upsertEntry([], first), updated)).toEqual([updated]);
  });

  it('shows command failure, file changes and interrupted turns', () => {
    const command = parseCodexEvent(JSON.stringify({ type: 'item.completed', item: {
      id: 'cmd-1', type: 'command_execution', command: 'npm test', aggregated_output: 'failed', exit_code: 1,
    } }));
    expect(command && entryFromEvent(command)).toMatchObject({ kind: 'activity', status: 'failed', title: 'npm test' });
    const files = parseCodexEvent(JSON.stringify({ type: 'item.completed', item: {
      id: 'change-1', type: 'file_change', changes: [{ path: 'src/App.tsx', kind: 'update' }],
    } }));
    expect(files && entryFromEvent(files)?.text).toContain('src/App.tsx');
    expect(entryFromEvent({ type: 'turn.interrupted', seq: 7 })?.title).toBe('Resposta interrompida');
  });

  it('parses only valid model choices and selected settings', () => {
    const event = parseCodexEvent(JSON.stringify({
      type: 'ready', model: 'model-a', effort: 'high', models: [
        { id: 'model-a', label: 'Modelo A', efforts: ['low', 'high', 4] },
        { id: 7, label: 'Inválido', efforts: [] },
      ],
    }));
    expect(event).toMatchObject({
      model: 'model-a', effort: 'high',
      models: [{ id: 'model-a', label: 'Modelo A', efforts: ['low', 'high'] }],
    });
  });
});
