import { Plug, Bot, Sparkles, SquareSlash, Wrench, Server, KeyRound, Cpu, LucideIcon } from 'lucide-react';

// uma entrada aqui = um icone na Activity Bar E uma secao colapsavel dentro
// da Sidebar — mesma chave usada nos dois lados (ver ActivityBar.tsx e
// Sidebar.tsx) pra abrir o painel ja aberto na secao certa.
export type SectionKey =
  | 'llms'
  | 'agents'
  | 'skills'
  | 'commands'
  | 'tools'
  | 'mcps'
  | 'secrets'
  | 'aiProviders';

export const SECTION_ICONS: { key: SectionKey; Icon: LucideIcon; label: string }[] = [
  { key: 'llms', Icon: Plug, label: 'LLMs instaladas' },
  { key: 'agents', Icon: Bot, label: 'Agentes' },
  { key: 'skills', Icon: Sparkles, label: 'Skills' },
  { key: 'commands', Icon: SquareSlash, label: 'Commands' },
  { key: 'tools', Icon: Wrench, label: 'Tools' },
  { key: 'mcps', Icon: Server, label: 'MCPs conectados' },
  { key: 'secrets', Icon: KeyRound, label: 'Chaves e tokens' },
  { key: 'aiProviders', Icon: Cpu, label: 'Provedores de IA' },
];

export const SECTION_LABELS: Record<SectionKey, string> = SECTION_ICONS.reduce(
  (acc, { key, label }) => ({ ...acc, [key]: label }),
  {} as Record<SectionKey, string>,
);
