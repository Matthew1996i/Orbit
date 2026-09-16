import { useEffect, useState } from 'react';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';
import ContentWorkspace from './ContentWorkspace';

afterEach(cleanup);

vi.mock('../astra', () => ({ default: ({ active }: { active: boolean }) => <div>Astra {active ? 'ativo' : 'pausado'}</div> }));
vi.mock('./LlmUsageWidget', () => ({ default: () => <div>Indicadores de uso</div> }));

it('loads Astra in the second tab and keeps the external panels visible', async () => {
  render(<><aside>Terminal externo</aside><ContentWorkspace><p>Agentes atuais</p></ContentWorkspace></>);
  expect(screen.getByRole('tab', { name: 'Folha de agentes' })).toHaveAttribute('aria-selected', 'true');
  expect(screen.getByRole('tabpanel')).toHaveTextContent('Agentes atuais');
  expect(screen.queryByText('Astra ativo')).not.toBeInTheDocument();
  fireEvent.click(screen.getByRole('tab', { name: 'Astra' }));
  expect(await screen.findByText('Astra ativo')).toBeVisible();
  expect(screen.getByText('Terminal externo')).toBeVisible();
  expect(screen.getByText('Agentes atuais')).not.toBeVisible();
  expect(screen.getByText('Indicadores de uso')).toBeVisible();
  expect(screen.getAllByText('Indicadores de uso')).toHaveLength(1);
});

it('preserves agent state and pauses Astra on returning to agents', async () => {
  const mounted = vi.fn(), unmounted = vi.fn();
  const Agents = () => {
    const [zoom, setZoom] = useState(100);
    useEffect(() => { mounted(); return unmounted; }, []);
    return <button onClick={() => setZoom(125)}>Zoom {zoom}</button>;
  };
  render(<ContentWorkspace><Agents /></ContentWorkspace>);
  fireEvent.click(screen.getByRole('button', { name: 'Zoom 100' }));
  fireEvent.click(screen.getByRole('tab', { name: 'Astra' }));
  await screen.findByText('Astra ativo');
  fireEvent.click(screen.getByRole('tab', { name: 'Folha de agentes' }));
  expect(screen.getByRole('button', { name: 'Zoom 125' })).toBeVisible();
  expect(mounted).toHaveBeenCalledTimes(1);
  expect(unmounted).not.toHaveBeenCalled();
  expect(screen.getByText('Astra pausado')).not.toBeVisible();
});

it('supports keyboard selection and moves focus to the selected tab', () => {
  render(<ContentWorkspace>Agentes</ContentWorkspace>);
  const agents = screen.getByRole('tab', { name: 'Folha de agentes' });
  const empty = screen.getByRole('tab', { name: 'Astra' });
  fireEvent.keyDown(agents, { key: 'ArrowRight' });
  expect(empty).toHaveFocus();
  expect(empty).toHaveAttribute('aria-selected', 'true');
  fireEvent.keyDown(empty, { key: 'Home' });
  expect(agents).toHaveFocus();
  expect(agents).toHaveAttribute('aria-selected', 'true');
});
