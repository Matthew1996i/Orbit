import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';
import CodexConversation from './CodexConversation';

class MockSocket {
  static OPEN = 1;
  static instances: MockSocket[] = [];
  readyState = 0;
  onopen: (() => void) | null = null;
  onclose: (() => void) | null = null;
  onmessage: ((event: { data: string }) => void) | null = null;
  onerror: (() => void) | null = null;
  sent: string[] = [];
  constructor() { MockSocket.instances.push(this); }
  open() { this.readyState = 1; this.onopen?.(); }
  emit(value: unknown) { this.onmessage?.({ data: JSON.stringify(value) }); }
  send(value: string) { this.sent.push(value); }
  close() { this.readyState = 3; this.onclose?.(); }
}

class MockResizeObserver {
  observe() {}
  disconnect() {}
}

afterEach(() => { cleanup(); vi.unstubAllGlobals(); MockSocket.instances = []; });

it('keeps a prompt once, streams the reply and can interrupt a turn', () => {
  vi.stubGlobal('WebSocket', MockSocket);
  vi.stubGlobal('ResizeObserver', MockResizeObserver);
  vi.stubGlobal('crypto', { randomUUID: () => 'prompt-1' });
  render(<CodexConversation agentId="agent-1" />);
  const socket = MockSocket.instances[0];
  act(() => socket.open());
  act(() => socket.emit({ type: 'ready', seq: 1, models: [
    { id: 'model-a', label: 'Modelo A', efforts: ['low', 'medium'] },
    { id: 'model-b', label: 'Modelo B', efforts: ['medium', 'high'] },
  ], model: null, effort: null }));
  expect(screen.queryByText(/Codex SDK/)).toBeNull();
  fireEvent.change(screen.getByRole('combobox', { name: 'Modelo da conversa' }), { target: { value: 'model-a' } });
  fireEvent.change(screen.getByRole('combobox', { name: 'Esforço de raciocínio' }), { target: { value: 'low' } });
  fireEvent.change(screen.getByRole('textbox', { name: 'Mensagem para o assistente' }), { target: { value: 'Corrija o bug' } });
  fireEvent.click(screen.getByRole('button', { name: 'Enviar mensagem' }));
  expect(JSON.parse(socket.sent[0])).toEqual({ type: 'prompt', id: 'prompt-1', text: 'Corrija o bug', model: 'model-a', effort: 'low' });
  act(() => {
    socket.emit({ type: 'user.message', seq: 1, id: 'prompt-1', text: 'Corrija o bug' });
    socket.emit({ type: 'item.started', seq: 2, item: { id: 'reply-1', type: 'agent_message', text: 'Vou ' } });
    socket.emit({ type: 'item.updated', seq: 3, item: { id: 'reply-1', type: 'agent_message', text: 'Vou corrigir.' } });
  });
  expect(screen.getAllByText('Corrija o bug')).toHaveLength(1);
  expect(screen.getByText('Vou corrigir.')).toBeVisible();
  fireEvent.click(screen.getByRole('button', { name: 'Interromper resposta' }));
  expect(JSON.parse(socket.sent[1])).toEqual({ type: 'interrupt' });
  act(() => socket.emit({ type: 'turn.interrupted', seq: 4 }));
  expect(screen.getByRole('button', { name: 'Enviar mensagem' })).toBeVisible();
});

it('clears effort when changing to a model that does not support it', () => {
  vi.stubGlobal('WebSocket', MockSocket);
  vi.stubGlobal('ResizeObserver', MockResizeObserver);
  render(<CodexConversation agentId="agent-2" />);
  const socket = MockSocket.instances[0];
  act(() => {
    socket.open();
    socket.emit({ type: 'ready', seq: 1, models: [
      { id: 'model-a', label: 'Modelo A', efforts: ['low'] },
      { id: 'model-b', label: 'Modelo B', efforts: ['high'] },
    ], model: null, effort: null });
  });
  const model = screen.getByRole('combobox', { name: 'Modelo da conversa' });
  const effort = screen.getByRole('combobox', { name: 'Esforço de raciocínio' });
  fireEvent.change(model, { target: { value: 'model-a' } });
  fireEvent.change(effort, { target: { value: 'low' } });
  fireEvent.change(model, { target: { value: 'model-b' } });
  expect(effort).toHaveValue('');
  expect(screen.queryByRole('option', { name: 'Baixo' })).toBeNull();
});
