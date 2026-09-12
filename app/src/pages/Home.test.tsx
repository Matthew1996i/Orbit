import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import Home from './Home';
vi.mock('../utils/llmLogos', () => ({ llmLogoFor: () => () => null }));
vi.mock('@ionic/react', () => ({ IonPage: ({ children }: { children: React.ReactNode }) => <div>{children}</div>, IonContent: ({ children }: { children: React.ReactNode }) => <div>{children}</div> }));
vi.mock('../components/AppShell', () => ({ default: ({ children }: { children: React.ReactNode }) => <div>{children}</div> }));
vi.mock('../components/SessionTree', () => ({ default: () => null }));
vi.mock('../components/LlmUsageWidget', () => ({ default: () => null }));
vi.mock('../components/NewAgentDialog', () => ({ default: () => null }));
vi.mock('../components/ConfirmDialog', () => ({ default: () => null }));
vi.mock('../components/ContextMenu', () => ({ default: () => null }));
vi.mock('../components/TerminalPanel', () => ({ default: (props: { session: { sessionId: string }; docked: boolean; minimized: boolean }) =>
  <div data-testid={props.session.sessionId} data-docked={props.docked} data-minimized={props.minimized} />,
}));
vi.mock('../api', () => ({
  fetchState: async () => ({ sessions: [
    { sessionId: 'one', name: 'Terminal um', appManaged: true, alive: true, startedAt: 1 },
    { sessionId: 'two', name: 'Terminal dois', appManaged: true, alive: true, startedAt: 2 },
  ] }),
  connectStepStream: () => () => {},
}));

beforeEach(() => {
  localStorage.clear();
  localStorage.setItem('dashboard.dockedPanelIds', JSON.stringify(['one', 'two']));
  window.PointerEvent = MouseEvent as typeof PointerEvent;
  HTMLElement.prototype.setPointerCapture = () => {};
  HTMLElement.prototype.scrollIntoView = () => {};
});
afterEach(cleanup);

function drag(button: HTMLElement, x: number, y: number) {
  fireEvent.pointerDown(button, { button: 0, clientX: 950, clientY: 60 });
  fireEvent.pointerMove(window, { clientX: x, clientY: y });
  fireEvent.pointerUp(window, { clientX: x, clientY: y });
}

it('move apenas a aba arrastada entre fixado, minimizado e flutuante', async () => {
  render(<Home />);
  await act(async () => {});
  drag(screen.getByRole('tab', { name: /Terminal um/ }), 400, 400);
  expect(screen.getByTestId('one')).toHaveAttribute('data-docked', 'false');
  expect(screen.getByTestId('two')).toHaveAttribute('data-docked', 'true');
  drag(screen.getByRole('tab', { name: /Terminal dois/ }), 400, 60);
  expect(screen.getByTestId('two')).toHaveAttribute('data-minimized', 'true');
  drag(screen.getByRole('button', { name: 'Terminal dois' }), 1000, 400);
  expect(screen.getByTestId('two')).toHaveAttribute('data-docked', 'true');
  expect(screen.getByTestId('two')).toHaveAttribute('data-minimized', 'false');
  expect(screen.getByTestId('one')).toHaveAttribute('data-docked', 'false');
});

it('cancela arraste sem mudar o modo do terminal', async () => {
  render(<Home />);
  await act(async () => {});
  const tab = screen.getByRole('tab', { name: /Terminal um/ });
  fireEvent.pointerDown(tab, { button: 0, clientX: 950, clientY: 60 });
  fireEvent.pointerMove(window, { clientX: 400, clientY: 400 });
  fireEvent.pointerCancel(window);
  expect(screen.getByTestId('one')).toHaveAttribute('data-docked', 'true');
});

it('reordena abas fixadas sem abrir zonas de troca de modo', async () => {
  render(<Home />);
  await act(async () => {});
  const tabs = screen.getAllByRole('tab');
  const strip = tabs[0].closest('.term-pinned-tabs-scroll') as HTMLElement;
  vi.spyOn(strip, 'getBoundingClientRect').mockReturnValue({
    left: 0, right: 500, top: 38, bottom: 100, width: 500, height: 62,
    x: 0, y: 38, toJSON: () => ({}),
  });
  vi.spyOn(tabs[0], 'getBoundingClientRect').mockReturnValue({
    left: 0, right: 150, top: 38, bottom: 100, width: 150, height: 62,
    x: 0, y: 38, toJSON: () => ({}),
  });
  vi.spyOn(tabs[1], 'getBoundingClientRect').mockReturnValue({
    left: 150, right: 300, top: 38, bottom: 100, width: 150, height: 62,
    x: 150, y: 38, toJSON: () => ({}),
  });

  fireEvent.pointerDown(tabs[1], { button: 0, clientX: 220, clientY: 60 });
  fireEvent.pointerMove(window, { clientX: 20, clientY: 60 });
  expect(screen.queryByText(/Solte para/)).toBeNull();
  expect(document.querySelector('.terminal-drag-preview')).toHaveTextContent('Terminal dois');
  expect(document.querySelector('.terminal-tab-insertion')).not.toBeNull();
  fireEvent.pointerUp(window, { clientX: 20, clientY: 60 });
  expect(document.querySelector('.terminal-tab-insertion')).toBeNull();

  expect(screen.getAllByRole('tab').map((tab) => tab.getAttribute('data-session-id')))
    .toEqual(['two', 'one']);
});
