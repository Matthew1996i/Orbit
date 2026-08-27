import { Wand2, Bot, Flame } from 'lucide-react';
import { OpenAI, Gemini, Cursor, Amp, OpenCode, Copilot, Claude, Ollama } from '@lobehub/icons';
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
// colorido de verdade) quando a marca tem uma — OpenAI/Cursor/OpenCode nao
// tem variante colorida na lib (a marca deles E monocromatica por design),
// entao caem no "Mono" (default export) mesmo. "aider" nao tem icone
// nenhum la, cai no generico do lucide.
export const LLM_LOGO_BY_ID: Record<string, typeof Bot> = {
  claude: Claude.Color,
  codex: OpenAI,
  gemini: Gemini.Color,
  'cursor-agent': Cursor,
  aider: Wand2,
  opencode: OpenCode,
  amp: Amp.Color,
  copilot: Copilot.Color,
  ollama: Ollama,
  llamafile: Flame,
};

export function llmLogoFor(id: string): typeof Bot {
  return LLM_LOGO_BY_ID[id] || Bot;
}
