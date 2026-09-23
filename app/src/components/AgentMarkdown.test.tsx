import { render, screen } from '@testing-library/react';
import { expect, it } from 'vitest';
import { AgentMarkdown } from './AgentMarkdown';

it('renders useful Markdown without executing model-provided HTML or unsafe links', () => {
  const { container } = render(<AgentMarkdown text={'**Resposta**\n\n```ts\nconst ok = true\n```\n\n[seguro](https://example.com) [perigoso](javascript:alert(1))\n\n<img src=x onerror=alert(1)>'} />);
  expect(screen.getByText('Resposta').closest('strong')).not.toBeNull();
  expect(screen.getByText('const ok = true')).toBeVisible();
  expect(screen.getByRole('link', { name: 'seguro' })).toHaveAttribute('href', 'https://example.com');
  expect(screen.queryByRole('link', { name: 'perigoso' })).toBeNull();
  expect(container.querySelector('img')).toBeNull();
  expect(container.querySelector('[onerror]')).toBeNull();
});
