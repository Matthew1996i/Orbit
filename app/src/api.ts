export const BACKEND_HTTP = 'http://localhost:8765';
export const BACKEND_WS = 'ws://localhost:8765';

export interface SessionInfo {
  pid: number;
  sessionId: string;
  cwd: string;
  startedAt: number;
  updatedAt?: number;
  name?: string;
  status?: string;
  alive: boolean;
  appManaged?: boolean;
  appAgentId?: string | null;
  isSubagent?: boolean;
  parentSessionId?: string;
  role?: string;
  roleDescription?: string;
  remoteControl?: boolean;
  effort?: string | null;
  model?: string | null;
  isMcp?: boolean;
  mcpServer?: string;
  mcpTool?: string;
  mcpMethod?: string;
  isSkill?: boolean;
  skillName?: string;
  llm?: string;
  isResource?: boolean;
  isResourceGroup?: boolean;
  resourceKind?: string;
  resourceControl?: 'process' | 'docker' | 'docker-group';
  resourcePid?: number | null;
  resourceContainerId?: string | null;
  resourcePorts?: number[];
  resourceCommand?: string;
  resourceCwd?: string;
  resourceFingerprint?: string | null;
}

export interface StateResponse {
  now: number;
  sessions: SessionInfo[];
  teams: unknown[];
}

export async function fetchState(): Promise<StateResponse> {
  const res = await fetch(`${BACKEND_HTTP}/api/state`, { cache: 'no-store' });
  if (!res.ok) throw new Error(`state ${res.status}`);
  return res.json();
}

export interface AgentDef {
  name: string;
  description: string;
  model: string;
  tools: string;
}

export interface SkillDef {
  name: string;
  description: string;
  version: string;
}

export interface CommandDef {
  name: string;
  description: string;
}

export interface McpDef {
  name: string;
  type: string;
  projects: string[];
  enabled: boolean;
}

export interface CatalogResponse {
  agents: AgentDef[];
  skills: SkillDef[];
  commands: CommandDef[];
  tools: string[];
  mcps: McpDef[];
}

export async function fetchCatalog(): Promise<CatalogResponse> {
  const res = await fetch(`${BACKEND_HTTP}/api/catalog`, { cache: 'no-store' });
  if (!res.ok) throw new Error(`catalog ${res.status}`);
  return res.json();
}

export interface LlmCli {
  id: string;
  name: string;
  bin: string;
  vendor: string;
  install: string;
  login?: string;
  logout?: string;
  connected: boolean;
  status: 'none' | 'installed' | 'connected';
  path: string | null;
}

export async function fetchLlms(): Promise<{ llms: LlmCli[] }> {
  const res = await fetch(`${BACKEND_HTTP}/api/llms`, { cache: 'no-store' });
  if (!res.ok) throw new Error(`llms ${res.status}`);
  return res.json();
}

export interface UsageWindow {
  utilization: number | null;
  resetsAt: string | null;
}

export interface ClaudeUsage {
  fiveHour: UsageWindow;
  sevenDay: UsageWindow;
  opus: UsageWindow | null;
  fetchedAtMs?: number | null;
  source?: 'anthropic' | 'claude-cache';
}

export interface CodexUsageWindow {
  usedPercent: number;
  windowMinutes: number;
  resetsAtMs: number;
}

export interface CodexUsage {
  primary: CodexUsageWindow;
  secondary: CodexUsageWindow;
  plan: string;
  rateLimited: boolean;
  resetCredits: number;
  fetchedAtMs: number;
  source: 'codex-app-server';
}

export async function fetchUsage(
  force = false,
): Promise<{ claude: ClaudeUsage | null; claudeAuthenticated: boolean; codex: CodexUsage | null }> {
  const suffix = force ? '?force=1' : '';
  const res = await fetch(`${BACKEND_HTTP}/api/usage${suffix}`, { cache: 'no-store' });
  if (!res.ok) throw new Error(`usage ${res.status}`);
  return res.json();
}

export interface SessionCostUsage {
  tokensTotal: number;
  costUsd: number;
  costBrl: number;
}

export interface CostSummary {
  inputTokens: number;
  outputTokens: number;
  cacheReadTokens: number;
  cacheWriteTokens: number;
  tokensTotal: number;
  costUsd: number;
  costBrl: number;
  perSession: Record<string, SessionCostUsage>;
}

export async function fetchCostSummary(): Promise<CostSummary> {
  const res = await fetch(`${BACKEND_HTTP}/api/cost-summary`, { cache: 'no-store' });
  if (!res.ok) throw new Error(`cost-summary ${res.status}`);
  return res.json();
}

export async function startInstall(
  cli: string,
  action: 'install' | 'login' | 'logout' = 'install',
): Promise<{ id: string } | { error: string }> {
  const res = await fetch(`${BACKEND_HTTP}/api/install/start`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ cli, action }),
  });
  return res.json();
}

export type AgentFileKind = 'agent' | 'skill' | 'command';

export async function fetchAgentFile(
  name: string,
  kind: AgentFileKind = 'agent',
): Promise<{ name: string; content: string } | { error: string }> {
  const res = await fetch(
    `${BACKEND_HTTP}/api/agent-file?name=${encodeURIComponent(name)}&kind=${kind}`,
    { cache: 'no-store' },
  );
  return res.json();
}

export async function saveAgentFile(
  name: string,
  content: string,
  kind: AgentFileKind = 'agent',
): Promise<{ ok: true } | { error: string }> {
  const res = await fetch(`${BACKEND_HTTP}/api/agent-file`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name, content, kind }),
  });
  return res.json();
}

// grupos de tokens/chaves secretas — ver server.py secrets_as_env(): toda
// chave cadastrada aqui e injetada como env var em todo agente novo, pra
// nao precisar colar de novo em cada sessao.
export interface SecretEntry {
  key: string;
  value: string;
}

export interface SecretGroup {
  id: string;
  title: string;
  // slug unico usado em {{identificador.chave}} — permite que grupos
  // diferentes tenham uma chave com o MESMO nome sem colidir.
  identifier: string;
  entries: SecretEntry[];
}

export async function fetchSecretGroups(): Promise<SecretGroup[]> {
  const res = await fetch(`${BACKEND_HTTP}/api/secrets`, { cache: 'no-store' });
  if (!res.ok) throw new Error(`secrets ${res.status}`);
  const data = await res.json();
  return data.groups as SecretGroup[];
}

export async function saveSecretGroup(
  group: Partial<Pick<SecretGroup, 'id'>> & Omit<SecretGroup, 'id'>,
): Promise<{ ok: true; id: string } | { error: string }> {
  const res = await fetch(`${BACKEND_HTTP}/api/secrets`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(group),
  });
  return res.json();
}

export async function deleteSecretGroup(id: string): Promise<{ ok: true } | { error: string }> {
  const res = await fetch(`${BACKEND_HTTP}/api/secrets/${encodeURIComponent(id)}/delete`, {
    method: 'POST',
  });
  return res.json();
}

// provedores de IA cadastrados pelo usuario — usados so pelo "Gerar com IA"
// dos modais de markdown (agent/skill/command), nao pra iniciar agentes.
export type AiProviderKind = 'anthropic' | 'openai';

export interface AiProvider {
  id: string;
  title: string;
  // formato da API (shape do request/response) — nao trava no vendor "dono"
  // do formato: baseUrl aponta pra qualquer servico compativel.
  provider: AiProviderKind;
  baseUrl: string;
  apiKey: string;
  model: string;
}

export async function fetchAiProviders(): Promise<AiProvider[]> {
  const res = await fetch(`${BACKEND_HTTP}/api/ai-providers`, { cache: 'no-store' });
  if (!res.ok) throw new Error(`ai-providers ${res.status}`);
  const data = await res.json();
  return data.providers as AiProvider[];
}

export async function saveAiProvider(
  provider: Partial<Pick<AiProvider, 'id'>> & Omit<AiProvider, 'id'>,
): Promise<{ ok: true; id: string } | { error: string }> {
  const res = await fetch(`${BACKEND_HTTP}/api/ai-providers`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(provider),
  });
  return res.json();
}

export async function deleteAiProvider(id: string): Promise<{ ok: true } | { error: string }> {
  const res = await fetch(`${BACKEND_HTTP}/api/ai-providers/${encodeURIComponent(id)}/delete`, {
    method: 'POST',
  });
  return res.json();
}

export async function generateMarkdown(
  providerId: string,
  kind: AgentFileKind,
  description: string,
): Promise<{ content: string } | { error: string }> {
  const res = await fetch(`${BACKEND_HTTP}/api/ai-providers/${encodeURIComponent(providerId)}/generate`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ kind, description }),
  });
  return res.json();
}

export interface StartAgentOptions {
  resumeSessionId?: string;
  rows?: number;
  cols?: number;
  parentSessionId?: string;
  llm?: string;
}

export async function startAgent(
  cwd: string,
  name?: string,
  opts: StartAgentOptions = {}
): Promise<{ id: string } | { error: string }> {
  const res = await fetch(`${BACKEND_HTTP}/api/agents/start`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ cwd, name, ...opts }),
  });
  return res.json();
}

export async function stopAgent(agentId: string): Promise<{ ok: boolean }> {
  const res = await fetch(`${BACKEND_HTTP}/api/agents/${agentId}/stop`, { method: 'POST' });
  return res.json();
}

export async function killSession(pid: number): Promise<{ ok: boolean }> {
  const res = await fetch(`${BACKEND_HTTP}/api/sessions/${pid}/kill`, { method: 'POST' });
  return res.json();
}

export interface ResourceStopResult {
  ok: boolean;
  signal?: string;
  error?: string;
  message?: string;
}

export async function stopResource(
  resourcePid: number,
  fingerprint: string,
  ownerSessionId: string,
): Promise<ResourceStopResult> {
  try {
    const res = await fetch(`${BACKEND_HTTP}/api/resources/${resourcePid}/stop`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ fingerprint, ownerSessionId }),
    });
    const body = await res.json();
    if (!res.ok) return { ok: false, error: body?.error, message: body?.message };
    return body;
  } catch {
    return { ok: false, error: 'network' };
  }
}

export async function stopDockerResource(
  containerId: string,
  ownerSessionId: string,
): Promise<ResourceStopResult> {
  try {
    const res = await fetch(`${BACKEND_HTTP}/api/resources/docker/${containerId}/stop`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ownerSessionId }),
    });
    const body = await res.json();
    if (!res.ok) return { ok: false, error: body?.error, message: body?.message };
    return body;
  } catch {
    return { ok: false, error: 'network' };
  }
}

export interface StepEvent {
  kind: 'tool' | 'text' | 'prompt' | 'ping';
  text?: string;
  name?: string;
  sessionId?: string;
  sessionName?: string;
  pid?: number;
  ts?: string;
  backlog?: boolean;
  tokens?: number;
  diff?: { file: string; oldText: string; newText: string };
}

const STREAM_STALE_MS = 6000; // backend manda um ping a cada 1s; sem nada nesse tempo, a conexao esta morta de verdade

export function connectStepStream(onStep: (step: StepEvent) => void): () => void {
  let es: EventSource | null = null;
  let stopped = false;
  let retryTimer: ReturnType<typeof setTimeout> | null = null;
  let watchdogTimer: ReturnType<typeof setInterval> | null = null;
  let lastMessageAt = Date.now();

  const reconnect = () => {
    es?.close();
    es = null;
    if (!stopped) retryTimer = setTimeout(connect, 1500);
  };

  const connect = () => {
    if (stopped) return;
    lastMessageAt = Date.now();
    es = new EventSource(`${BACKEND_HTTP}/api/stream`);
    es.onmessage = (ev) => {
      lastMessageAt = Date.now();
      try {
        const step = JSON.parse(ev.data);
        if (step.kind !== 'ping') onStep(step);
      } catch {
        /* ignore malformed event */
      }
    };
    es.onerror = reconnect;
  };
  connect();

  // rede de seguranca: mesmo que o EventSource "pareça" aberto mas fique
  // silencioso (sem nem o ping de 1s chegar), forca reconexao — cobre casos
  // onde a conexao morre sem disparar onerror (ex: backend reiniciado de
  // forma abrupta, thread do servidor caindo sem fechar o socket direito).
  watchdogTimer = setInterval(() => {
    if (!stopped && Date.now() - lastMessageAt > STREAM_STALE_MS) {
      reconnect();
    }
  }, 2000);

  return () => {
    stopped = true;
    if (retryTimer) clearTimeout(retryTimer);
    if (watchdogTimer) clearInterval(watchdogTimer);
    es?.close();
  };
}
