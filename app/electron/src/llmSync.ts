import { chmodSync, existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from 'fs';
import { homedir } from 'os';
import { dirname, join } from 'path';
import { discoverLlms } from './cliDiscovery';

const START = '<!-- Orbit sync: start -->';
const END = '<!-- Orbit sync: end -->';
const SECRET_FIELD = /token|secret|password|credential|auth|api.?key|\benv\b|mcp/i;
const INSTRUCTIONS: Record<string, string> = {
  claude: '.claude/CLAUDE.md',
  codex: '.codex/AGENTS.md',
  gemini: '.gemini/GEMINI.md',
  opencode: '.config/opencode/AGENTS.md',
};
const CONFIGS: Record<string, string> = {
  claude: '.claude/settings.json',
  codex: '.codex/config.toml',
  gemini: '.gemini/settings.json',
  opencode: '.config/opencode/opencode.json',
};

const readJson = (path: string): unknown => {
  try { return JSON.parse(readFileSync(path, 'utf8')); } catch { return null; }
};

const namesIn = (path: string, suffix?: string): string[] => {
  try {
    return readdirSync(path, { withFileTypes: true })
      .filter((entry) => suffix ? entry.isFile() && entry.name.endsWith(suffix) : entry.isDirectory())
      .map((entry) => suffix ? entry.name.slice(0, -suffix.length) : entry.name);
  } catch { return []; }
};

const sanitize = (value: unknown): unknown => {
  if (Array.isArray(value)) return value.map(sanitize);
  if (value && typeof value === 'object') {
    return Object.fromEntries(Object.entries(value).filter(([key]) => !SECRET_FIELD.test(key))
      .map(([key, entry]) => [key, sanitize(entry)]));
  }
  if (typeof value === 'string' && /(?:sk-|ghp_|AIza|Bearer\s+|:\/\/[^\s/]+:[^\s/]+@)/i.test(value)) return '[redigido]';
  return value;
};

const snapshotConfig = (source: string, destination: string): boolean => {
  if (!existsSync(source)) return false;
  let content = '';
  try {
    if (source.endsWith('.json')) {
      const parsed = readJson(source);
      if (parsed === null) return false;
      content = JSON.stringify(sanitize(parsed), null, 2) + '\n';
    } else {
      let sensitiveSection = false;
      content = readFileSync(source, 'utf8').split('\n').filter((line) => {
        const section = line.match(/^\s*\[+([^\]]+)/);
        if (section) sensitiveSection = SECRET_FIELD.test(section[1]);
        return !sensitiveSection && !SECRET_FIELD.test(line.split('=')[0])
          && !/(?:sk-|ghp_|AIza|Bearer\s+|:\/\/[^\s/]+:[^\s/]+@)/i.test(line);
      }).join('\n');
    }
    writeFileSync(destination, content, { mode: 0o600 });
    chmodSync(destination, 0o600);
    return true;
  } catch { return false; }
};

export const syncLlm = (id: string, home = homedir()) => {
  const instructionRelative = INSTRUCTIONS[id];
  if (!instructionRelative) return { error: 'Essa LLM ainda não tem um formato de instruções compatível com o Orbit.' };
  if (!discoverLlms(process.platform, process.env, home).some((cli) => cli.id === id && cli.path)) {
    return { error: 'A CLI não está instalada nesta máquina.' };
  }

  const orbit = join(home, '.orbit');
  const output = join(orbit, 'llm-sync', id);
  const instruction = join(home, instructionRelative);
  const configSource = join(home, CONFIGS[id]);
  const configSnapshot = join(output, CONFIGS[id].endsWith('.toml') ? 'config.toml' : 'config.json');
  try {
    mkdirSync(output, { recursive: true, mode: 0o700 });
    chmodSync(output, 0o700);
    const importedConfig = snapshotConfig(configSource, configSnapshot);
    const mcpData = readJson(join(orbit, 'mcps.json')) as { mcps?: Record<string, unknown> } | null;
    const secretData = readJson(join(orbit, 'secrets.json'));
    const providerData = readJson(join(orbit, 'ai-providers.json'));
    const groups = Array.isArray(secretData) ? secretData : [];
    const providers = Array.isArray(providerData) ? providerData : [];
    const manifest = {
      agents: namesIn(join(home, '.claude', 'agents'), '.md'),
      skills: [...new Set([...namesIn(join(home, '.claude', 'skills')), ...namesIn(join(home, '.agents', 'skills'))])],
      commands: namesIn(join(home, '.claude', 'commands'), '.md'),
      mcps: Object.keys(mcpData?.mcps || {}),
      secretKeys: groups.flatMap((group) => group?.entries?.map((entry: { key?: string }) => entry.key).filter(Boolean) || []),
      aiProviders: providers.map((provider) => provider?.title).filter(Boolean),
      paths: {
        orbit,
        agents: join(home, '.claude', 'agents'),
        skills: join(home, '.claude', 'skills'),
        sharedSkills: join(home, '.agents', 'skills'),
        encryptedMcps: existsSync(join(orbit, 'mcps.json')) ? join(orbit, 'mcps.json') : null,
        importedConfig: importedConfig ? configSnapshot : null,
      },
    };
    const manifestPath = join(output, 'manifest.json');
    writeFileSync(manifestPath, JSON.stringify(manifest, null, 2) + '\n', { mode: 0o600 });
    chmodSync(manifestPath, 0o600);
    const block = `${START}\n# Orbit\nLeia ${manifestPath} para localizar agentes, skills, comandos, MCPs e configurações sincronizados.\nEm sessões iniciadas pelo Orbit, consulte ORBIT_RESOURCE_CATALOG, ORBIT_TOOLS_CATALOG e ORBIT_MCP_CONFIG para os recursos ativos.\nAs chaves de segredo constam apenas pelo nome; os valores ficam nas variáveis de ambiente dessas sessões. Não imprima valores secretos.\n${END}`;
    mkdirSync(dirname(instruction), { recursive: true, mode: 0o700 });
    const existing = existsSync(instruction) ? readFileSync(instruction, 'utf8') : '';
    const start = existing.indexOf(START);
    const end = existing.indexOf(END, start + START.length);
    const updated = start >= 0 && end >= 0
      ? existing.slice(0, start) + block + existing.slice(end + END.length)
      : `${existing.trimEnd()}${existing.trim() ? '\n\n' : ''}${block}\n`;
    writeFileSync(instruction, updated, { mode: 0o600 });
    return { ok: true, manifestPath, instructionPath: instruction, importedConfig };
  } catch (error) {
    return { error: error instanceof Error ? error.message : 'Falha ao sincronizar.' };
  }
};
