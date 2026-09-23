import { createInterface } from 'node:readline';
import { readFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { Codex } from '@openai/codex-sdk';

const send = (message) => process.stdout.write(`${JSON.stringify(message)}\n`);
const workingDirectory = process.env.ORBIT_CODEX_CWD;
const resumeId = process.env.ORBIT_CODEX_RESUME_ID;
const validEfforts = new Set(['minimal', 'low', 'medium', 'high', 'xhigh', 'max', 'ultra', 'persistent']);

const availableModels = (() => {
  try {
    const path = join(process.env.CODEX_HOME || join(homedir(), '.codex'), 'models_cache.json');
    const cache = JSON.parse(readFileSync(path, 'utf8'));
    if (!Array.isArray(cache.models)) return [];
    return cache.models.flatMap((item) => {
      if (item.visibility !== 'list' || typeof item.slug !== 'string') return [];
      return [{
        id: item.slug,
        label: typeof item.display_name === 'string' ? item.display_name : item.slug,
        efforts: Array.isArray(item.supported_reasoning_levels)
          ? item.supported_reasoning_levels.map((level) => level?.effort).filter((effort) => validEfforts.has(effort))
          : [],
      }];
    });
  } catch { return []; }
})();

if (!workingDirectory) {
  send({ type: 'error', message: 'Diretório de trabalho do Codex não informado.' });
  process.exit(1);
}

let mcpServers = {};
try {
  const configured = JSON.parse(process.env.ORBIT_MCP_CONFIG || '{}').mcpServers;
  if (configured && typeof configured === 'object' && !Array.isArray(configured)) {
    mcpServers = Object.fromEntries(Object.entries(configured).flatMap(([name, config]) => {
      if (!/^[A-Za-z0-9_-]+$/.test(name) || !config || typeof config !== 'object') return [];
      if (typeof config.url === 'string') return [[name, { url: config.url }]];
      if (typeof config.command !== 'string') return [];
      const server = { command: config.command };
      if (Array.isArray(config.args)) server.args = config.args.map(String);
      if (config.env && typeof config.env === 'object' && !Array.isArray(config.env)) {
        server.env = Object.fromEntries(Object.entries(config.env).map(([key, value]) => [key, String(value)]));
      }
      return [[name, server]];
    }));
  }
} catch {
  send({ type: 'error', message: 'Configuração MCP do Orbit inválida.' });
  process.exit(1);
}

const codex = new Codex(Object.keys(mcpServers).length ? { config: { mcp_servers: mcpServers } } : {});
const threadOptions = {
  workingDirectory,
  skipGitRepoCheck: true,
  sandboxMode: 'workspace-write',
  approvalPolicy: 'never',
};
let thread = resumeId
  ? codex.resumeThread(resumeId, threadOptions)
  : codex.startThread(threadOptions);
let selectedModel = null;
let selectedEffort = null;

let running = false;
let activeTurn = null;
const input = createInterface({ input: process.stdin, crlfDelay: Infinity });
send({ type: 'ready', threadId: thread.id, models: availableModels, model: selectedModel, effort: selectedEffort });

input.on('line', async (line) => {
  let message;
  try {
    message = JSON.parse(line);
  } catch {
    send({ type: 'error', message: 'Mensagem inválida para o Codex SDK.' });
    return;
  }
  if (message.type === 'interrupt') {
    activeTurn?.abort();
    return;
  }
  if (message.type !== 'prompt' || typeof message.text !== 'string' || !message.text.trim()) return;
  if (running) {
    send({ type: 'error', message: 'Aguarde o turno atual terminar.' });
    return;
  }
  const model = typeof message.model === 'string' ? message.model.trim() : '';
  const effort = typeof message.effort === 'string' ? message.effort.trim() : '';
  const selected = availableModels.find((option) => option.id === model);
  if (model && !selected) {
    send({ type: 'turn.failed', error: { message: 'Modelo indisponível. Atualize a lista de modelos e tente novamente.' } });
    return;
  }
  if (effort && (!validEfforts.has(effort) || (selected && !selected.efforts.includes(effort)))) {
    send({ type: 'turn.failed', error: { message: 'Esforço indisponível para o modelo selecionado.' } });
    return;
  }
  if (model !== (selectedModel || '') || effort !== (selectedEffort || '')) {
    selectedModel = model || null;
    selectedEffort = effort || null;
    const options = { ...threadOptions };
    if (selectedModel) options.model = selectedModel;
    if (selectedEffort) options.modelReasoningEffort = selectedEffort;
    thread = thread.id ? codex.resumeThread(thread.id, options) : codex.startThread(options);
  }
  running = true;
  activeTurn = new AbortController();
  send({ type: 'conversation.settings', model: selectedModel, effort: selectedEffort });
  send({ type: 'user.message', id: message.id, text: message.text });
  try {
    const { events } = await thread.runStreamed(message.text, { signal: activeTurn.signal });
    for await (const event of events) send(event);
  } catch (error) {
    if (activeTurn.signal.aborted) send({ type: 'turn.interrupted' });
    else send({ type: 'turn.failed', error: { message: error instanceof Error ? error.message : String(error) } });
  } finally {
    running = false;
    activeTurn = null;
  }
});
