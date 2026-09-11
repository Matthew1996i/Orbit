import { Cpu, Robot, Stack, Terminal, Toolbox, Plugs, Key, Cloud, type Icon } from '@phosphor-icons/react';

// icones da Activity Bar/Sidebar: Phosphor, peso `fill` (solido) via IconContext em main.tsx.
export type SectionIcon = Icon;

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

export const SECTION_ICONS: { key: SectionKey; Icon: SectionIcon; label: string }[] = [
  { key: 'llms', Icon: Cpu, label: 'LLMs instaladas' },
  { key: 'agents', Icon: Robot, label: 'Agentes' },
  { key: 'skills', Icon: Stack, label: 'Skills' },
  { key: 'commands', Icon: Terminal, label: 'Commands' },
  { key: 'tools', Icon: Toolbox, label: 'Tools' },
  { key: 'mcps', Icon: Plugs, label: 'MCPs conectados' },
  { key: 'secrets', Icon: Key, label: 'Chaves e tokens' },
  { key: 'aiProviders', Icon: Cloud, label: 'Provedores de IA' },
];

export const SECTION_LABELS: Record<SectionKey, string> = SECTION_ICONS.reduce(
  (acc, { key, label }) => ({ ...acc, [key]: label }),
  {} as Record<SectionKey, string>,
);
