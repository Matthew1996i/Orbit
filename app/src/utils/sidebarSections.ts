import { Cpu, Bot, Layers, Terminal, SlidersHorizontal, Network, KeyRound, Boxes, LucideIcon } from 'lucide-react';

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
  { key: 'llms', Icon: Cpu, label: 'LLMs instaladas' },
  { key: 'agents', Icon: Bot, label: 'Agentes' },
  { key: 'skills', Icon: Layers, label: 'Skills' },
  { key: 'commands', Icon: Terminal, label: 'Commands' },
  { key: 'tools', Icon: SlidersHorizontal, label: 'Tools' },
  { key: 'mcps', Icon: Network, label: 'MCPs conectados' },
  { key: 'secrets', Icon: KeyRound, label: 'Chaves e tokens' },
  { key: 'aiProviders', Icon: Boxes, label: 'Provedores de IA' },
];

export const SECTION_LABELS: Record<SectionKey, string> = SECTION_ICONS.reduce(
  (acc, { key, label }) => ({ ...acc, [key]: label }),
  {} as Record<SectionKey, string>,
);
