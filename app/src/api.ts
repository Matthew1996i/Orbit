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

export interface McpDef {
  name: string;
  type: string;
  projects: string[];
  enabled: boolean;
}

export interface CatalogResponse {
  agents: AgentDef[];
  skills: SkillDef[];
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
}

export async function fetchUsage(): Promise<{ claude: ClaudeUsage | null; claudeAuthenticated: boolean }> {
  const res = await fetch(`${BACKEND_HTTP}/api/usage`, { cache: 'no-store' });
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

export type AgentFileKind = 'agent' | 'skill';

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
