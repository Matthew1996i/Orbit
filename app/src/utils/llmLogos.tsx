import { Wand2, Bot, Flame } from 'lucide-react';
import {
  Codex,
  Cursor,
  Amp,
  OpenCode,
  Copilot,
  ClaudeCode,
  GeminiCLI,
  Ollama,
  Antigravity,
  Qwen,
  Goose,
  OpenHands,
} from '@lobehub/icons';
import { LlmCli } from '../api';

// Claude Code e o LLM nativo do app (nao vem de /api/llms, que so lista as
// OUTRAS CLIs conhecidas) — todo lugar que mostra a lista de LLMs precisa
// prepender essa entrada sintetica, sempre "instalada".
export const CLAUDE_LLM_OPTION: LlmCli = {
  id: 'claude',
  name: 'Claude Code',
  bin: 'claude',
  vendor: 'Anthropic',
  install: '',
  // `claude auth login`/`claude auth logout` sao comandos reais da propria
  // CLI (confirmado via `claude auth --help`) — com isso o Claude entra no
  // mesmo fluxo de conectar/desconectar das outras LLMs, em vez de ficar de
  // fora so por ser a LLM nativa do app.
  login: 'claude auth login',
  logout: 'claude auth logout',
  connected: true,
  status: 'connected',
  path: 'claude',
};

// logos reais das marcas (via @lobehub/icons) — usados em todo lugar que
// mostra uma LLM (sidebar, modal de conexao, widget de uso, card na arvore)
// pra ficar facil de reconhecer de relance. Prefere a variante ".Color" (logo
// colorido de verdade) quando a marca tem uma — Codex/Cursor/OpenCode nao
// tem variante colorida na lib (a marca deles E monocromatica por design),
// entao caem no "Mono" (default export) mesmo. "aider" nao tem icone
// nenhum la, cai no generico do lucide.
export const LLM_LOGO_BY_ID: Record<string, typeof Bot> = {
  // ClaudeCode/GeminiCLI em vez dos logos genericos da marca (Claude/Gemini)
  // — icones dedicados a CLI de verdade, que e o que essas entradas
  // representam aqui (nao o produto/app como um todo).
  claude: ClaudeCode.Color,
  codex: Codex,
  gemini: GeminiCLI.Color,
  'cursor-agent': Cursor,
  aider: Wand2,
  opencode: OpenCode,
  amp: Amp.Color,
  copilot: Copilot.Color,
  ollama: Ollama,
  llamafile: Flame,
  antigravity: Antigravity.Color,
  'qwen-code': Qwen.Color,
  goose: Goose,
  openhands: OpenHands.Color,
  // o campo `llm` de uma sessao guarda o NOME DO BINARIO (ver sessionLlmBin
  // em LlmUsageWidget.tsx, e o `llm` gravado pelo backend ao iniciar um
  // agente pelo app) — pra toda outra CLI, id e bin sao iguais (ex:
  // "codex"/"codex"), mas o Antigravity e a UNICA excecao: id="antigravity",
  // bin="agy" (ver KNOWN_LLM_CLIS em server.py). Sem esse alias, uma sessao
  // com llm:"agy" caia no icone generico do lucide (Bot) em vez do logo real.
  agy: Antigravity.Color,
};

export function llmLogoFor(id: string): typeof Bot {
  return LLM_LOGO_BY_ID[id] || Bot;
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
