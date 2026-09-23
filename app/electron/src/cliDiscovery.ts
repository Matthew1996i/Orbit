import { accessSync, constants, existsSync, readdirSync, readFileSync, statSync } from 'fs';
import { homedir } from 'os';
import { dirname, join } from 'path';

type CliDefinition = {
  id: string;
  name: string;
  bin: string;
  vendor: string;
  install: string;
  login: string;
  logout: string;
};

const CLIS: CliDefinition[] = [
  { id: 'claude', name: 'Claude Code', bin: 'claude', vendor: 'Anthropic', install: '', login: 'claude auth login', logout: 'claude auth logout' },
  { id: 'codex', name: 'Codex SDK', bin: 'codex', vendor: 'OpenAI', install: '', login: 'codex login', logout: 'codex logout' },
  { id: 'gemini', name: 'Gemini CLI', bin: 'gemini', vendor: 'Google', install: 'npm install -g @google/gemini-cli', login: 'gemini', logout: '' },
  { id: 'cursor-agent', name: 'Cursor Agent', bin: 'cursor-agent', vendor: 'Cursor', install: '', login: 'cursor-agent login', logout: 'cursor-agent logout' },
  { id: 'aider', name: 'Aider', bin: 'aider', vendor: 'Aider', install: 'pipx install aider-chat', login: '', logout: '' },
  { id: 'opencode', name: 'OpenCode', bin: 'opencode', vendor: 'OpenCode', install: 'npm install -g opencode-ai', login: 'opencode auth login', logout: 'opencode auth logout' },
  { id: 'amp', name: 'Amp', bin: 'amp', vendor: 'Sourcegraph', install: 'npm install -g @sourcegraph/amp', login: 'amp login', logout: 'amp logout' },
  { id: 'copilot', name: 'GitHub Copilot CLI', bin: 'copilot', vendor: 'GitHub', install: 'npm install -g @github/copilot', login: '', logout: '' },
  { id: 'antigravity', name: 'Antigravity', bin: 'agy', vendor: 'Google', install: '', login: 'agy', logout: '' },
  { id: 'ollama', name: 'Ollama', bin: 'ollama', vendor: 'Ollama', install: '', login: '', logout: '' },
  { id: 'llamafile', name: 'Llamafile', bin: 'llamafile', vendor: 'Mozilla', install: '', login: '', logout: '' },
  { id: 'qwen-code', name: 'Qwen Code', bin: 'qwen', vendor: 'Alibaba', install: 'npm install -g @qwen-code/qwen-code', login: 'qwen', logout: '' },
  { id: 'goose', name: 'Goose', bin: 'goose', vendor: 'Block', install: '', login: '', logout: '' },
  { id: 'openhands', name: 'OpenHands', bin: 'openhands', vendor: 'All Hands AI', install: 'pipx install openhands', login: '', logout: '' },
  { id: 'continue-cli', name: 'Continue CLI', bin: 'cn', vendor: 'Continue', install: 'npm install -g @continuedev/cli', login: '', logout: '' },
];

const isExecutable = (path: string, platform: string): boolean => {
  try {
    if (!statSync(path).isFile()) return false;
    if (platform !== 'win32') accessSync(path, constants.X_OK);
    return true;
  } catch { return false; }
};

const codexSdkBridge = (): string | null => {
  const resourcesPath = (process as NodeJS.Process & { resourcesPath?: string }).resourcesPath;
  const candidates = [
    join(__dirname, '..', '..', 'codex-bridge.mjs'),
    ...(resourcesPath ? [join(resourcesPath, 'codex-runtime', 'bridge.mjs')] : []),
  ];
  return candidates.find((bridge) => existsSync(bridge) && existsSync(
    join(dirname(bridge), 'node_modules', '@openai', 'codex-sdk', 'package.json'),
  )) ?? null;
};

export const discoverLlms = (
  platform = process.platform,
  environment: NodeJS.ProcessEnv = process.env,
  home = homedir(),
  sdkBridge = codexSdkBridge(),
) => {
  const pathValue = Object.entries(environment).find(([key]) => key.toLowerCase() === 'path')?.[1] || '';
  const pathDirs = pathValue.split(platform === 'win32' ? ';' : ':')
    .map((directory) => directory.trim().replace(/^"|"$/g, ''))
    .filter(Boolean);
  const fallbackDirs = platform === 'win32'
    ? [
        environment.APPDATA && join(environment.APPDATA, 'npm'),
        environment.LOCALAPPDATA && join(environment.LOCALAPPDATA, 'Programs', 'nodejs'),
        environment.ProgramFiles && join(environment.ProgramFiles, 'nodejs'),
        join(home, 'AppData', 'Roaming', 'npm'),
        join(home, '.local', 'bin'),
      ]
    : [join(home, '.local', 'bin'), join(home, 'bin'), join(home, '.npm-global', 'bin'),
        join(home, '.bun', 'bin'), join(home, '.volta', 'bin'), '/usr/local/bin', '/opt/homebrew/bin'];
  if (platform !== 'win32') {
    const nodeVersions = join(home, '.nvm', 'versions', 'node');
    if (existsSync(nodeVersions)) {
      for (const version of readdirSync(nodeVersions)) fallbackDirs.push(join(nodeVersions, version, 'bin'));
    }
  }
  const directories = [...new Set([...pathDirs, ...fallbackDirs.filter((dir): dir is string => Boolean(dir))])];
  const extensions = platform === 'win32' ? ['', '.exe', '.cmd', '.bat', '.com'] : [''];
  const findBinary = (name: string): string | null => {
    for (const directory of directories) {
      for (const extension of extensions) {
        const candidate = join(directory, name + extension);
        if (isExecutable(candidate, platform)) return candidate;
      }
    }
    return null;
  };
  const claudeAuthenticated = () => {
    try { return Boolean(JSON.parse(readFileSync(join(home, '.claude.json'), 'utf8')).oauthAccount); }
    catch { return false; }
  };
  return CLIS.map((cli) => {
    const path = cli.id === 'codex' ? sdkBridge : findBinary(cli.bin);
    const authenticated = cli.id === 'claude' ? claudeAuthenticated()
      : cli.id === 'codex' ? existsSync(join(home, '.codex', 'auth.json')) || Boolean(environment.CODEX_API_KEY) : true;
    return {
      ...cli,
      path,
      connected: Boolean(path && authenticated),
      status: path ? (authenticated ? 'connected' : 'installed') : 'none',
    };
  });
};
