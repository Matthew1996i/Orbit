import { describe, it, expect } from 'vitest';
import { terminalDropPlacement } from './terminalPlacement';
describe('destinos do arraste de terminal', () => {
  it('distingue abas minimizadas, painel direito e janela flutuante', () => {
    expect(terminalDropPlacement(400, 60, 1200, 38)).toBe('minimized');
    expect(terminalDropPlacement(400, 90, 1200, 38)).toBe('minimized');
    expect(terminalDropPlacement(1100, 60, 1200, 38)).toBe('docked');
    expect(terminalDropPlacement(1100, 500, 1200, 38)).toBe('docked');
    expect(terminalDropPlacement(400, 500, 1200, 38)).toBe('floating');
  });

  it('usa a largura real do painel direito em toda a zona visível', () => {
    expect(terminalDropPlacement(730, 300, 1200, 38, 480)).toBe('docked');
    expect(terminalDropPlacement(719, 300, 1200, 38, 480)).toBe('floating');
  });
});
