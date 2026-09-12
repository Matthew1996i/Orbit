import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';
import UpdateControl from './UpdateControl';
afterEach(() => { cleanup(); delete window.dashboardAPI; });
it('oferece download, mostra progresso e só instala após o clique explícito', async () => {
  let notify: (state: OrbitUpdateState) => void = () => {};
  const available: OrbitUpdateState = { phase: 'available', currentVersion: '1.0.25', version: '1.0.26', installMode: 'restart' };
  const download = vi.fn().mockResolvedValue({ ...available, phase: 'downloading', progress: 10 });
  const install = vi.fn().mockResolvedValue({ ...available, phase: 'installing' });
  const unsubscribe = vi.fn();
  window.dashboardAPI = {
    getUpdateState: async () => available,
    onUpdateState: (cb: typeof notify) => { notify = cb; return unsubscribe; },
    downloadUpdate: download, installUpdate: install,
  } as unknown as NonNullable<Window['dashboardAPI']>;
  const view = render(<UpdateControl />);
  await act(async () => {});
  await act(async () => { fireEvent.click(screen.getByRole('button', { name: 'Baixar atualização 1.0.26' })); });
  expect(download).toHaveBeenCalledOnce();
  expect(screen.getByRole('button', { name: 'Baixando… 10%' })).toBeDisabled();
  act(() => notify({ ...available, phase: 'ready' }));
  expect(install).not.toHaveBeenCalled();
  await act(async () => { fireEvent.click(screen.getByRole('button', { name: 'Reiniciar e instalar' })); });
  expect(install).toHaveBeenCalledOnce();
  view.unmount(); expect(unsubscribe).toHaveBeenCalledOnce();
});
