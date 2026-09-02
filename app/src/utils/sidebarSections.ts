import { Plug, Bot, Puzzle, Command, Wrench, Server, KeyRound, Brain, LucideIcon } from 'lucide-react';

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
  // Puzzle (peca de quebra-cabeca) em vez de Sparkles — esse ja e o icone do
  // botao "Gerar com IA" em outro lugar da UI, reusar aqui confundia os dois
  // significados. Puzzle passa melhor a ideia de capacidade modular/plugavel.
  { key: 'skills', Icon: Puzzle, label: 'Skills' },
  // Command (simbolo ⌘) em vez de SquareSlash — lia mais como um icone de
  // "proibido" do que como comando de barra.
  { key: 'commands', Icon: Command, label: 'Commands' },
  { key: 'tools', Icon: Wrench, label: 'Tools' },
  { key: 'mcps', Icon: Server, label: 'MCPs conectados' },
  { key: 'secrets', Icon: KeyRound, label: 'Chaves e tokens' },
  // Brain em vez de Cpu — sinaliza "IA" de forma mais direta que um chip
  // generico de hardware.
  { key: 'aiProviders', Icon: Brain, label: 'Provedores de IA' },
];

export const SECTION_LABELS: Record<SectionKey, string> = SECTION_ICONS.reduce(
  (acc, { key, label }) => ({ ...acc, [key]: label }),
  {} as Record<SectionKey, string>,
);
