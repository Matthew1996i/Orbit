import { LlmCli } from '../api';

// instalar/desinstalar NAO roda comando nenhum (so login/logout continuam
// automatizados, via startInstall) — aqui so derivamos um passo a passo e um
// link de documentacao a partir do comando de instalacao que o backend ja
// devolve em LlmCli.install, sem inventar URL nenhuma: pacote npm vira link
// pro npmjs, pacote pipx vira link pro PyPI, instalador via curl vira link
// pro dominio oficial que o proprio comando já revela. Os passos incluem
// pre-requisito (runtime necessario) e verificacao (--version) — nao so o
// comando cru — pra realmente orientar quem nunca instalou nada disso.
export interface LlmGuide {
  docsUrl: string;
  docsLabel: string;
  installSteps: string[];
  uninstallSteps: string[];
}

function npmPackage(cmd: string): string | null {
  return cmd.match(/npm install -g (\S+)/)?.[1] ?? null;
}

function pipxPackage(cmd: string): string | null {
  return cmd.match(/pipx install (\S+)/)?.[1] ?? null;
}

function curlOrigin(cmd: string): string | null {
  const url = cmd.match(/https?:\/\/[^\s'"]+/)?.[0];
  if (!url) return null;
  try {
    return new URL(url).origin;
  } catch {
    return null;
  }
}

// instaladores via curl|bash nao tem um "uninstall" padrao pra derivar
// (diferente de npm/pipx) — pra quem ja foi verificado na documentacao
// oficial, um passo a passo especifico aqui vale muito mais que o fallback
// generico "consulte a documentação". So adiciona aqui o que foi de fato
// checado, um por um — nao adivinhado.
const VERIFIED_UNINSTALL_STEPS: Record<string, string[]> = {
  ollama: [
    'Pare e desative o serviço: sudo systemctl stop ollama && sudo systemctl disable ollama',
    'Remova o serviço: sudo rm /etc/systemd/system/ollama.service && sudo systemctl daemon-reload',
    'Remova o binário: sudo rm $(which ollama)',
    'Apague os modelos baixados (opcional, libera espaço em disco): sudo rm -rf /usr/share/ollama ~/.ollama',
  ],
};

// pra CLIs sem comando de instalacao derivavel (sem "install" no
// KNOWN_LLM_CLIS — ex: Claude Code, que e o proprio app, ou CLIs sem
// instalador de 1 linha verificado), mas que TEM documentacao oficial de
// verdade — verificado um por um, nao adivinhado.
const KNOWN_DOCS: Record<string, { url: string; label: string }> = {
  claude: { url: 'https://docs.claude.com/en/docs/claude-code/overview', label: 'docs.claude.com/claude-code' },
  antigravity: { url: 'https://antigravity.google/docs/cli/install', label: 'antigravity.google/docs/cli' },
  copilot: {
    url: 'https://docs.github.com/en/copilot/how-tos/copilot-cli/cli-getting-started',
    label: 'docs.github.com/copilot-cli',
  },
};

export function llmGuideFor(llm: LlmCli): LlmGuide {
  const install = llm.install || '';
  const bin = llm.bin;
  const npmPkg = npmPackage(install);
  const pipxPkg = pipxPackage(install);
  const origin = curlOrigin(install);
  const loginHint = llm.login
    ? `Depois de instalado, autentique com "Fazer login" nesta tela (ou rode: ${llm.login}).`
    : 'Depois de instalado, siga as instruções de autenticação do próprio CLI (não tem login automatizado aqui).';

  if (npmPkg) {
    return {
      docsUrl: `https://www.npmjs.com/package/${npmPkg}`,
      docsLabel: `npmjs.com/package/${npmPkg}`,
      installSteps: [
        'Precisa do Node.js 18 ou mais recente instalado (nodejs.org) — o comando abaixo usa o npm que vem junto.',
        `Rode no terminal: npm install -g ${npmPkg}`,
        `Confirme que instalou certo: ${bin} --version`,
        loginHint,
      ],
      uninstallSteps: [
        `Rode no terminal: npm uninstall -g ${npmPkg}`,
        `Confirme que sumiu: which ${bin} (não deve retornar nada)`,
        'Isso remove só o binário — se também quiser apagar credenciais salvas, use "Sair" nesta tela antes de desinstalar.',
      ],
    };
  }

  if (pipxPkg) {
    return {
      docsUrl: `https://pypi.org/project/${pipxPkg}/`,
      docsLabel: `pypi.org/project/${pipxPkg}`,
      installSteps: [
        'Precisa do Python 3.9+ e do pipx instalados (pipx.pypa.io/stable/installation) — o pip sozinho não isola o pacote do resto do sistema.',
        `Rode no terminal: pipx install ${pipxPkg}`,
        `Confirme que instalou certo: ${bin} --version`,
        loginHint,
      ],
      uninstallSteps: [
        `Rode no terminal: pipx uninstall ${pipxPkg}`,
        `Confirme que sumiu: which ${bin} (não deve retornar nada)`,
      ],
    };
  }

  if (origin) {
    const host = origin.replace(/^https?:\/\//, '');
    return {
      docsUrl: origin,
      docsLabel: host,
      installSteps: [
        `Rode no terminal: ${install}`,
        'Siga as instruções exibidas pelo instalador (pode pedir confirmação ou escolher um diretório).',
        `Confirme que instalou certo: ${bin} --version`,
        loginHint,
      ],
      uninstallSteps: VERIFIED_UNINSTALL_STEPS[llm.id] ?? [
        `Consulte a documentação oficial em ${host} para os passos exatos de remoção — instaladores via script não deixam um "uninstall" padrão.`,
        `Geralmente envolve apagar o binário (rode "which ${bin}" pra achar o caminho) e a pasta de configuração (costuma ficar em ~/.${bin} ou ~/.config/${bin}).`,
      ],
    };
  }

  const knownDocs = KNOWN_DOCS[llm.id];
  return {
    docsUrl: knownDocs?.url ?? '',
    docsLabel: knownDocs?.label ?? '',
    installSteps: install
      ? [`Rode no terminal: ${install}`, `Confirme que instalou certo: ${bin} --version`, loginHint]
      : knownDocs
        ? [`Consulte a documentação oficial: ${knownDocs.label} — não há um comando de instalação de 1 linha pra essa CLI.`]
        : ['Consulte a documentação oficial do fornecedor para instalar — não há um comando de instalação conhecido pra essa CLI.'],
    uninstallSteps: [
      `Geralmente envolve apagar o binário (rode "which ${bin}" pra achar o caminho) e qualquer pasta de configuração associada.`,
      knownDocs
        ? `Consulte a documentação oficial (${knownDocs.label}) pra confirmar os passos exatos.`
        : 'Consulte a documentação oficial do fornecedor pra confirmar os passos exatos.',
    ],
  };
}

export function llmKnownDocsFor(id: string): { url: string; label: string } | undefined {
  return KNOWN_DOCS[id];
}

// pra CLIs onde login/logout NAO tem comando de shell que roda e sai
// sozinho (fica em branco em KNOWN_LLM_CLIS de proposito) porque a
// autenticacao de verdade e um comando de barra DENTRO do REPL interativo
// da propria CLI (ex: Copilot e Antigravity — confirmado na documentacao
// oficial de cada uma) — sem isso o botao simplesmente some sem explicar
// como fazer manualmente.
const MANUAL_AUTH_HINT: Record<string, { login?: string; logout?: string }> = {
  copilot: {
    login: 'Rode "copilot" no terminal e digite /login dentro da CLI.',
    logout: 'Rode "copilot" no terminal e digite /logout dentro da CLI.',
  },
  antigravity: {
    logout: 'Rode "agy" no terminal e digite /logout dentro da CLI (o login em si já é automatizado nesta tela).',
  },
};

export function llmManualAuthHint(id: string, action: 'login' | 'logout'): string | undefined {
  return MANUAL_AUTH_HINT[id]?.[action];
}
