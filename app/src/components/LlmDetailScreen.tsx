import { useEffect, useState } from 'react';
import { ConfigProvider, Typography, Button } from 'antd';
import { ArrowLeft, ExternalLink, LogOut, LogIn, Copy, Check } from 'lucide-react';
import { LlmCli, startInstall } from '../api';
import { llmLogoFor, llmLogoColorFor } from '../utils/llmLogos';
import { llmGuideFor, llmManualAuthHint } from '../utils/llmGuide';
import { fetchAllLlms } from '../utils/llmCatalog';
import { useLlmScreenTheme } from '../utils/llmScreenTheme';
import InstallLogView from './InstallLogView';
import { llmNeedsAutopilot } from '../utils/llmAutopilot';
import './LlmScreens.css';
import './LlmDetailScreen.css';

const { Title, Text } = Typography;

interface Props {
  id: string;
  onBack: () => void;
}

// alguns passos do guia (ver utils/llmGuide.ts) trazem um comando de terminal
// embutido no texto, sempre atras de um destes rotulos fixos — aqui so
// separamos o comando pra exibir num bloco monoespacado com botao de copiar;
// NAO alteramos o texto gerado, so como ele e apresentado.
const STEP_COMMAND_PREFIXES: { label: string; prefix: string }[] = [
  { label: 'Comando', prefix: 'Rode no terminal: ' },
  { label: 'Verificação', prefix: 'Confirme que instalou certo: ' },
  { label: 'Verificação', prefix: 'Confirme que sumiu: ' },
];

interface ParsedStep {
  label: string | null;
  text: string;
  command: string | null;
  note: string | null;
}

function parseGuideStep(step: string): ParsedStep {
  for (const { label, prefix } of STEP_COMMAND_PREFIXES) {
    if (step.startsWith(prefix)) {
      const rest = step.slice(prefix.length);
      const noteStart = rest.indexOf(' (');
      if (noteStart > -1 && rest.endsWith(')')) {
        return { label, text: label, command: rest.slice(0, noteStart), note: rest.slice(noteStart + 2, -1) };
      }
      return { label, text: label, command: rest, note: null };
    }
  }
  return { label: null, text: step, command: null, note: null };
}

function CommandChip({ command, note }: { command: string; note?: string | null }) {
  const [copied, setCopied] = useState(false);

  const copyCommand = () => {
    navigator.clipboard?.writeText(command).then(() => {
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1400);
    });
  };

  return (
    <div className="cmd-chip-wrap">
      <div className="cmd-chip">
        <code className="cmd-chip-text">{command}</code>
        <button type="button" className="cmd-chip-copy" onClick={copyCommand} aria-label="Copiar comando">
          {copied ? <Check size={12} /> : <Copy size={12} />}
        </button>
      </div>
      {note && <p className="cmd-chip-note">{note}</p>}
    </div>
  );
}

function GuideSteps({ steps }: { steps: string[] }) {
  return (
    <ol className="guide-steps">
      {steps.map((step, index) => {
        const parsed = parseGuideStep(step);
        return (
          <li key={index} className="guide-step">
            <span className="guide-step-index">{index + 1}</span>
            <div className="guide-step-body">
              {parsed.command ? (
                <>
                  <p className="guide-step-label">{parsed.label}</p>
                  <CommandChip command={parsed.command} note={parsed.note} />
                </>
              ) : (
                <p className="guide-step-text">{parsed.text}</p>
              )}
            </div>
          </li>
        );
      })}
    </ol>
  );
}

// tela cheia de gerenciamento de UMA LLM ja instalada (aberta ao clicar num
// item da secao LLMs na Sidebar) — login/logout continuam automatizados
// (mesmo endpoint de sempre); desinstalar NAO roda comando nenhum, so mostra
// passo a passo + link da documentacao oficial (ver utils/llmGuide.ts).
// Autocontida como LlmCatalogScreen — busca os proprios dados.
export default function LlmDetailScreen({ id, onBack }: Props) {
  const theme = useLlmScreenTheme();
  const [llms, setLlms] = useState<LlmCli[]>([]);
  // login/logout NAO troca o conteudo da tela nem mostra log/terminal
  // nenhum (decisao explicita, generica pra qualquer LLM) — so o botao de
  // Conectar/Desconectar vira loading. O comando de verdade continua
  // rodando por baixo (o processo so COMECA quando o WS conecta, ver
  // InstallLogView), so que montado sem nenhum espaco visual.
  const [running, setRunning] = useState<{ action: 'login' | 'logout'; agentId: string } | null>(null);

  const reload = () => fetchAllLlms().then(setLlms);
  useEffect(() => {
    reload();
  }, []);

  const llm = llms.find((l) => l.id === id);

  const run = async (action: 'login' | 'logout') => {
    const res = await startInstall(id, action);
    if ('error' in res) return;
    setRunning({ action, agentId: res.id });
  };

  const onRunDone = () => {
    setRunning(null);
    reload();
  };

  if (!llm) {
    return (
      <div className="llm-detail-screen">
        <div className="llm-detail-inner">
          <div className="llm-screen-header">
            <button className="llm-screen-back" onClick={onBack} aria-label="Voltar">
              <ArrowLeft size={16} />
            </button>
            <h1>LLM</h1>
          </div>
          <div className="llm-detail-empty">Carregando…</div>
        </div>
      </div>
    );
  }

  const Logo = llmLogoFor(llm.id);
  const logoColor = llmLogoColorFor(llm.id) ?? '#111114';
  const guide = llmGuideFor(llm);
  const isNative = llm.id === 'claude';

  return (
    <ConfigProvider theme={theme}>
      <div className="llm-detail-screen">
        <div className="llm-detail-inner">
          <div className="llm-screen-header">
            <button className="llm-screen-back" onClick={onBack} aria-label="Voltar">
              <ArrowLeft size={16} />
            </button>
            <Title level={3} className="llm-screen-title">{llm.name}</Title>
          </div>

          <div className="llm-detail-identity">
            <span className="llm-logo llm-detail-logo" style={{ color: logoColor }}>
              <Logo size={30} strokeWidth={1.5} />
            </span>
            <div className="llm-detail-heading">
              <div className="llm-detail-name">{llm.name}</div>
              <div className="llm-detail-vendor">{llm.vendor}</div>
            </div>
            {llm.status === 'connected' ? (
              <span className="status-pill status-pill-connected">
                <span className="status-pill-dot" />
                Conectado
              </span>
            ) : (
              <span className="status-pill status-pill-installed">
                <span className="status-pill-dot" />
                Instalado, sem login
              </span>
            )}
          </div>

          <div className="llm-detail-section">
            <Text className="llm-detail-section-title">Conta</Text>
            <div className="llm-detail-account-actions">
              {llm.status === 'connected' && llm.logout ? (
                <Button
                  className="llm-btn llm-btn-danger"
                  icon={running ? undefined : <LogOut size={13} />}
                  loading={running?.action === 'logout'}
                  disabled={!!running}
                  onClick={() => run('logout')}
                >
                  {running?.action === 'logout' ? 'Desconectando…' : 'Desconectar'}
                </Button>
              ) : llm.status !== 'connected' && llm.login ? (
                <Button
                  className="llm-btn llm-btn-primary"
                  icon={running ? undefined : <LogIn size={13} />}
                  loading={running?.action === 'login'}
                  disabled={!!running}
                  onClick={() => run('login')}
                >
                  {running?.action === 'login' ? 'Conectando…' : 'Conectar'}
                </Button>
              ) : (
                <p className="llm-detail-no-login-hint">
                  {llmManualAuthHint(llm.id, llm.status === 'connected' ? 'logout' : 'login') ??
                    'Essa CLI não tem um comando de login/logout conhecido pelo Orbit — gerencie direto no terminal.'}
                </p>
              )}
            </div>
          </div>

          <div className="llm-detail-section">
            <Text className="llm-detail-section-title">Configurações</Text>
            <div className="llm-detail-config-list">
              <div className="llm-detail-config-row">
                <span className="llm-detail-config-label">Binário</span>
                <code className="llm-detail-config-value">{llm.bin}</code>
              </div>
              <div className="llm-detail-config-row">
                <span className="llm-detail-config-label">Caminho</span>
                <code className="llm-detail-config-value">{llm.path || '—'}</code>
              </div>
              <div className="llm-detail-config-row">
                <span className="llm-detail-config-label">Fornecedor</span>
                <span className="llm-detail-config-value llm-detail-config-value-plain">{llm.vendor}</span>
              </div>
            </div>
          </div>

          {!isNative && (
            <div className="llm-detail-section">
              <Text className="llm-detail-section-title llm-detail-section-title-danger">Desinstalar</Text>
              <p className="llm-detail-uninstall-text">
                Remover {llm.name} do sistema é feito fora do Orbit — siga os passos abaixo no seu terminal.
              </p>
              <GuideSteps steps={guide.uninstallSteps} />
              {guide.docsUrl && (
                <Button
                  type="link"
                  size="small"
                  className="llm-detail-docs-link"
                  icon={<ExternalLink size={12} />}
                  onClick={() => window.dashboardAPI?.openExternal(guide.docsUrl)}
                >
                  {guide.docsLabel}
                </Button>
              )}
            </div>
          )}
        </div>

        {running && (
          <div className="llm-drawer-hidden-log">
            <InstallLogView agentId={running.agentId} onDone={onRunDone} autopilot={llmNeedsAutopilot(id)} />
          </div>
        )}
      </div>
    </ConfigProvider>
  );
}
