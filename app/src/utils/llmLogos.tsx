import type { ComponentType } from 'react';
import { MagicWand, Robot, Flame } from '@phosphor-icons/react';

// logos (lobehub) e icones (phosphor) compartilham so `size`/`className` —
// tipo comum minimo pra ambos caberem no mesmo mapa.
export type LlmLogo = ComponentType<{ size?: number | string; className?: string }>;
// Import only the SVG variants used here; the package barrel also pulls in avatars and the UI toolkit.
import Codex from '@lobehub/icons/es/Codex/components/Mono';
import Cursor from '@lobehub/icons/es/Cursor/components/Mono';
import Amp from '@lobehub/icons/es/Amp/components/Color';
import OpenCode from '@lobehub/icons/es/OpenCode/components/Mono';
import Copilot from '@lobehub/icons/es/Copilot/components/Color';
import ClaudeCode from '@lobehub/icons/es/ClaudeCode/components/Color';
import GeminiCLI from '@lobehub/icons/es/GeminiCLI/components/Color';
import Ollama from '@lobehub/icons/es/Ollama/components/Mono';
import Antigravity from '@lobehub/icons/es/Antigravity/components/Color';
import Qwen from '@lobehub/icons/es/Qwen/components/Color';
import Goose from '@lobehub/icons/es/Goose/components/Mono';
import OpenHands from '@lobehub/icons/es/OpenHands/components/Color';
// logos reais das marcas (via @lobehub/icons) — usados em todo lugar que
// mostra uma LLM (sidebar, modal de conexao, widget de uso, card na arvore)
// pra ficar facil de reconhecer de relance. Prefere a variante ".Color" (logo
// colorido de verdade) quando a marca tem uma — Codex/Cursor/OpenCode nao
// tem variante colorida na lib (a marca deles E monocromatica por design),
// entao caem no "Mono" (default export) mesmo. "aider" nao tem icone
// nenhum la, cai no generico do lucide.
export const LLM_LOGO_BY_ID: Record<string, LlmLogo> = {
  // ClaudeCode/GeminiCLI em vez dos logos genericos da marca (Claude/Gemini)
  // — icones dedicados a CLI de verdade, que e o que essas entradas
  // representam aqui (nao o produto/app como um todo).
  claude: ClaudeCode,
  codex: Codex,
  gemini: GeminiCLI,
  'cursor-agent': Cursor,
  aider: MagicWand,
  opencode: OpenCode,
  amp: Amp,
  copilot: Copilot,
  ollama: Ollama,
  llamafile: Flame,
  antigravity: Antigravity,
  'qwen-code': Qwen,
  goose: Goose,
  openhands: OpenHands,
  // o campo `llm` de uma sessao guarda o NOME DO BINARIO (ver sessionLlmBin
  // em LlmUsageWidget.tsx, e o `llm` gravado pelo backend ao iniciar um
  // agente pelo app) — pra toda outra CLI, id e bin sao iguais (ex:
  // "codex"/"codex"), mas o Antigravity e a UNICA excecao: id="antigravity",
  // bin="agy" (ver KNOWN_LLM_CLIS em server.py). Sem esse alias, uma sessao
  // com llm:"agy" caia no icone generico do lucide (Robot) em vez do logo real.
  agy: Antigravity,
};

export function llmLogoFor(id: string): LlmLogo {
  return LLM_LOGO_BY_ID[id] || Robot;
}

// Codex/Cursor/OpenCode/Ollama/Goose sao SVGs monocromaticos que desenham
// com `fill: "currentColor"` (confirmado lendo o SVG de cada um em
// node_modules/@lobehub/icons) — sem cor propria, eles herdam qualquer
// `color` do container. As telas de LLM mostram o logo puro (sem chip de
// fundo, ver LlmCatalogScreen/LlmDetailScreen) direto sobre fundo BRANCO,
// entao essas precisam de uma cor escura fixa pra nao sumir — as demais
// (Claude, Gemini, Amp, Antigravity, Copilot, Qwen, OpenHands) tem fill
// FIXO no proprio SVG (variante ".Color") e ja funcionam em qualquer fundo,
// nao precisam de entrada aqui.
// #3f3f46 (cinza-neutro escuro) em vez de preto puro — preto puro sobre
// branco fica com MAIS contraste que qualquer logo colorida do conjunto, e
// essas marcas monocromaticas acabavam "gritando" mais alto que as coloridas
// em vez de conviver com elas.
export const LLM_LOGO_COLOR_BY_ID: Record<string, string> = {
  codex: '#3f3f46',
  'cursor-agent': '#3f3f46',
  opencode: '#3f3f46',
  ollama: '#3f3f46',
  goose: '#3f3f46',
};

export function llmLogoColorFor(id: string): string | undefined {
  return LLM_LOGO_COLOR_BY_ID[id];
}
