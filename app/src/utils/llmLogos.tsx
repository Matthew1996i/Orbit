import { Wand2, Bot, Flame } from 'lucide-react';
import { Codex, Gemini, Cursor, Amp, OpenCode, Copilot, Claude, Ollama, Antigravity } from '@lobehub/icons';
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
  claude: Claude.Color,
  codex: Codex,
  gemini: Gemini.Color,
  'cursor-agent': Cursor,
  aider: Wand2,
  opencode: OpenCode,
  amp: Amp.Color,
  copilot: Copilot.Color,
  ollama: Ollama,
  llamafile: Flame,
  antigravity: Antigravity.Color,
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

// Codex/Cursor/OpenCode/Ollama sao SVGs monocromaticos que desenham com
// `fill: "currentColor"` (confirmado lendo o SVG de cada um em
// node_modules/@lobehub/icons) — sem cor propria, eles herdam qualquer
// `color` do container, o que os deixava saindo LARANJA (a cor de destaque
// do app) em vez da marca real. As demais (Claude #D97757, Gemini, Amp,
// Antigravity, Copilot) tem fill FIXO no proprio SVG (variante ".Color") e
// ignoram isso — nao precisam de entrada aqui. Branco e a cor real que essas
// marcas usam pra si mesmas em fundo escuro (o proprio lobehub confirma isso
// no COLOR_PRIMARY de fundo de avatar de cada uma).
export const LLM_LOGO_COLOR_BY_ID: Record<string, string> = {
  codex: '#f2f2f2',
  'cursor-agent': '#f2f2f2',
  opencode: '#f2f2f2',
  ollama: '#f2f2f2',
};

export function llmLogoColorFor(id: string): string | undefined {
  return LLM_LOGO_COLOR_BY_ID[id];
}
