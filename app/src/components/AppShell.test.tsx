import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import AppShell from './AppShell';
import ConfirmDialog from './ConfirmDialog';

// Isola dados e telas; os eventos usam a ActivityBar real e o layout do shell.
vi.mock('./Sidebar', () => ({ default: ({ activeSection }: { activeSection: string }) =>
  <div data-testid="sidebar-content">{activeSection}</div>,
}));
vi.mock('./TitleBar', () => ({ default: () => null }));
vi.mock('./LlmCatalogScreen', () => ({ default: () => null }));
vi.mock('./LlmDetailScreen', () => ({ default: () => null }));
vi.mock('./AgentEditScreen', () => ({ default: () => null }));
vi.mock('./AgentCatalogScreen', () => ({ default: () => null }));
vi.mock('./SkillCatalogScreen', () => ({ default: () => null }));
vi.mock('./CommandCatalogScreen', () => ({ default: () => null }));
vi.mock('./McpCatalogScreen', () => ({ default: () => null }));
vi.mock('./McpEditScreen', () => ({ default: () => null }));
vi.mock('./McpPresetCatalogScreen', () => ({ default: () => null }));
vi.mock('./SecretsCatalogScreen', () => ({ default: () => null }));
vi.mock('./AiProvidersCatalogScreen', () => ({ default: () => null }));
vi.mock('./SecretsModal', () => ({ default: () => null }));
vi.mock('./AiProviderModal', () => ({ default: () => null }));
vi.mock('./ToolsCatalogScreen', () => ({ default: () => null }));
vi.mock('./ToolsEditScreen', () => ({ default: () => null }));

const mount = () => render(<AppShell sessions={[]} onOpenSession={() => {}}>Home</AppShell>);
const hover = (label: string) => {
  fireEvent.mouseOver(screen.getByRole('button', { name: label }));
  act(() => { vi.advanceTimersByTime(120); });
};
const reserve = () => document.querySelector<HTMLElement>('.orbit-shell')!.style.getPropertyValue('--orbit-sidebar-reserve');

describe('painéis laterais', () => {
  beforeEach(() => { localStorage.clear(); vi.useFakeTimers(); });
  afterEach(() => { cleanup(); vi.useRealTimers(); });

  it('abre por hover sobre um catálogo restaurado e fecha ao sair', () => {
    localStorage.setItem('dashboard.fullScreen', JSON.stringify({ kind: 'agentCatalog' }));
    mount();
    hover('Skills');
    expect(screen.getByTestId('sidebar-content').textContent).toBe('skills');
    expect(reserve()).toBe('0px');
    fireEvent.mouseLeave(document.querySelector('.orbit-activitybar')!);
    act(() => { vi.advanceTimersByTime(200); });
    expect(screen.queryByTestId('sidebar-content')).toBeNull();
  });

  it('restaura as duas barras fixadas após remontar e mantém conteúdo durante hover', () => {
    const first = mount();
    hover('Skills');
    fireEvent.click(screen.getByRole('button', { name: 'Fixar painéis laterais' }));
    first.unmount();
    mount();
    expect(screen.getByRole('button', { name: 'Recolher painéis laterais' })).toBeDefined();
    expect(document.querySelector('.orbit-activitybar.expanded')).not.toBeNull();
    expect(screen.getByTestId('sidebar-content').textContent).toBe('skills');
    expect(reserve()).toBe('306px');
    hover('Agentes');
    expect(screen.getAllByTestId('sidebar-content')).toHaveLength(1);
    expect(screen.getByTestId('sidebar-content').textContent).toBe('agents');
    fireEvent.mouseLeave(document.querySelector('.orbit-activitybar')!);
    act(() => { vi.advanceTimersByTime(200); });
    expect(screen.getByTestId('sidebar-content').textContent).toBe('skills');
  });

  it('migra o estado antigo e mantém o painel fixado ao navegar para catálogo', () => {
    localStorage.setItem('dashboard.sidebarOpen', '1');
    localStorage.setItem('dashboard.sidebarActiveSection', 'skills');
    mount();
    fireEvent.click(screen.getByRole('button', { name: 'Agentes' }));
    expect(screen.getByTestId('sidebar-content').textContent).toBe('agents');
    expect(reserve()).toBe('306px');
    expect(document.documentElement.style.getPropertyValue('--orbit-content-left')).toBe('482px');
  });

  it('não deixa reserva vazia após desfixar e recarregar', () => {
    localStorage.setItem('dashboard.sidebarOpen', '1');
    const first = mount();
    fireEvent.click(screen.getByRole('button', { name: 'Recolher painéis laterais' }));
    first.unmount();
    mount();
    expect(reserve()).toBe('0px');
    expect(screen.queryByTestId('sidebar-content')).toBeNull();
    hover('Skills');
    expect(screen.getByTestId('sidebar-content').textContent).toBe('skills');
  });

  it('mantém o preview ao atravessar a ponte e voltar a um vão da barra', () => {
    mount();
    hover('Skills');
    fireEvent.mouseLeave(document.querySelector('.orbit-activitybar')!);
    fireEvent.mouseEnter(document.querySelector('.orbit-hover-bridge')!);
    act(() => { vi.advanceTimersByTime(250); });
    expect(screen.getByTestId('sidebar-content').textContent).toBe('skills');
    fireEvent.mouseLeave(document.querySelector('.orbit-hover-bridge')!);
    fireEvent.mouseOver(document.querySelector('.orbit-activitybar')!);
    act(() => { vi.advanceTimersByTime(250); });
    expect(screen.getByTestId('sidebar-content').textContent).toBe('skills');
  });
});

function ModalFixture({ open }: { open: boolean }) {
  return <AppShell sessions={[]} onOpenSession={() => {}}>
    <ConfirmDialog open={open} title="Confirmar ação" message="Continuar?" onConfirm={() => {}} onCancel={() => {}} />
  </AppShell>;
}

describe('abertura de modal com navegação por hover', () => {
  beforeEach(() => { localStorage.clear(); vi.useFakeTimers(); });
  afterEach(() => { cleanup(); vi.useRealTimers(); });

  it('recolhe barra e preview sem exigir movimento do mouse', () => {
    const view = render(<ModalFixture open={false} />);
    hover('Skills');
    view.rerender(<ModalFixture open />);
    expect(screen.queryByTestId('sidebar-content')).toBeNull();
    expect(document.querySelector('.orbit-activitybar.expanded')).toBeNull();
    view.rerender(<ModalFixture open={false} />);
    act(() => { vi.advanceTimersByTime(500); });
    expect(screen.queryByTestId('sidebar-content')).toBeNull();
  });

  it('cancela abertura pendente quando o modal aparece', () => {
    const view = render(<ModalFixture open={false} />);
    fireEvent.mouseOver(screen.getByRole('button', { name: 'Skills' }));
    view.rerender(<ModalFixture open />);
    act(() => { vi.advanceTimersByTime(500); });
    expect(screen.queryByTestId('sidebar-content')).toBeNull();
    expect(document.querySelector('.orbit-activitybar.expanded')).toBeNull();
  });

  it('encerra o preview temporário e preserva a seção fixada', () => {
    localStorage.setItem('dashboard.sidebarOpen', '1');
    localStorage.setItem('dashboard.sidebarActiveSection', 'skills');
    const view = render(<ModalFixture open={false} />);
    hover('Agentes');
    view.rerender(<ModalFixture open />);
    expect(document.querySelector('.orbit-sidebar-preview')).toBeNull();
    expect(screen.getByTestId('sidebar-content').textContent).toBe('skills');
    expect(reserve()).toBe('306px');
  });
});

describe('modal Sobre real, aberto pela engrenagem', () => {
  beforeEach(() => { localStorage.clear(); vi.useFakeTimers(); });
  afterEach(() => { cleanup(); vi.useRealTimers(); });

  it('não reabre a barra quando o mouse entra no portal do modal', async () => {
    mount();
    hover('Skills');
    fireEvent.click(screen.getByRole('button', { name: 'Configurações' }));
    await act(async () => { fireEvent.click(screen.getByText('Sobre')); });
    const dialog = screen.getByRole('dialog', { name: 'Orbit' });
    fireEvent.mouseOver(dialog);
    act(() => { vi.advanceTimersByTime(500); });
    expect(document.querySelector('.orbit-activitybar.expanded')).toBeNull();
    expect(screen.queryByTestId('sidebar-content')).toBeNull();
    fireEvent.mouseOver(screen.getByRole('button', { name: 'OK' }));
    expect(document.querySelector('.orbit-activitybar.expanded')).toBeNull();
  });
});

describe('navegação para catálogos', () => {
  beforeEach(() => { localStorage.clear(); vi.useFakeTimers(); });
  afterEach(() => { cleanup(); vi.useRealTimers(); });

  it.each([
    ['Chaves e tokens', 'secrets'], ['Agentes', 'agents'], ['Skills', 'skills'],
    ['LLMs instaladas', 'llms'], ['Commands', 'commands'], ['Tools', 'tools'],
    ['MCPs conectados', 'mcps'], ['Provedores de IA', 'aiProviders'],
  ])('mantém o hover aberto ao clicar em %s', (label, section) => {
    mount();
    hover(label);
    fireEvent.click(screen.getByRole('button', { name: label }));
    expect(screen.getByTestId('sidebar-content').textContent).toBe(section);
    expect(document.querySelector('.orbit-activitybar.expanded')).not.toBeNull();
    expect(reserve()).toBe('0px');
  });
});
