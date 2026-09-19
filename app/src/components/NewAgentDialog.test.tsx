import { cleanup, render, screen, waitFor } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';
import NewAgentDialog from './NewAgentDialog';

vi.mock('../utils/llmCatalog', () => ({
  fetchAllLlms: async () => [{
    id: 'codex', name: 'Codex CLI', bin: 'codex', vendor: 'OpenAI',
    connected: true, status: 'connected', path: 'codex.cmd', install: '', login: '', logout: '',
  }],
}));

afterEach(cleanup);

it('selects the installed Codex without inventing Claude', async () => {
  render(<NewAgentDialog open onClose={() => {}} onSubmit={() => {}} />);
  await waitFor(() => expect(screen.getByText('Codex CLI')).toBeVisible());
  expect(screen.queryByText('Claude Code')).toBeNull();
  expect(screen.getByRole('button', { name: 'Iniciar' })).toBeEnabled();
});
