import { useEffect, useState } from 'react';
import { ConfigProvider, Button } from 'antd';
import { ExternalLink, LogIn, LogOut, Copy, Check } from 'lucide-react';
import { LlmCli, startInstall } from '../api';
import { llmLogoFor, llmLogoColorFor } from '../utils/llmLogos';
import { llmGuideFor, llmManualAuthHint } from '../utils/llmGuide';
import { useLlmScreenTheme } from '../utils/llmScreenTheme';
import AppDrawer from './AppDrawer';
import InstallLogView from './InstallLogView';
import { llmNeedsAutopilot } from '../utils/llmAutopilot';
import './LlmScreens.css';
import './LlmDrawer.css';

interface Props {
  llm: LlmCli | null;
  onClose: () => void;
  // devolve a lista fresca (nao void) — usado pra saber se o login/logout
  // deu certo de verdade (ver onRunDone) antes de decidir fechar sozinho.
  onChanged: () => Promise<LlmCli[]>;
}

// alguns passos do guia (ver utils/llmGuide.ts) trazem um comando de terminal
// embutido no texto, sempre atras de um destes rotulos fixos — aqui so
// separamos o comando pra exibir num bloco monoespacado com botao de copiar;
// NAO alteramos o texto gerado, so como ele e apresentado. (Mesma logica do
// LlmDetailScreen — duplicada de proposito: os dois arquivos sao
// autocontidos e nao ha camada compartilhada nesse escopo.)
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

// painel lateral (nao mais tela cheia nem expand inline dentro do card) —
// aberto ao clicar em QUALQUER card do catalogo, de qualquer status. Em cima
// do AppDrawer (padrao portado do backoffice, ver AppDrawer.tsx) — mostra
// como instalar E como desinstalar (sempre os dois, informativo) e no rodape
// so tem Cancelar + Login/Logout de acordo com o status atual — login/logout
// continuam automatizados, instalar/desinstalar so orientam (ver
// utils/llmGuide.ts). O AppDrawer ja fecha sozinho no X e nunca deixa o
// usuario preso, mesmo com o terminal rodando (o botao Cancelar continua
// visivel, so o botao de acao some).
export default function LlmDrawer({ llm, onClose, onChanged }: Props) {
  const theme = useLlmScreenTheme();
  const [running, setRunning] = useState<{ action: 'login' | 'logout'; agentId: string } | null>(null);

  // troca de LLM (ou fechou) com um comando ainda "rodando" na tela anterior
  // nunca deveria acontecer (o usuario precisa fechar/cancelar antes), mas
  // por seguranca zera o estado de qualquer jeito ao trocar de alvo.
  useEffect(() => {
    setRunning(null);
  }, [llm?.id]);

  const run = async (action: 'login' | 'logout') => {
    if (!llm) return;
    const res = await startInstall(llm.id, action);
    if ('error' in res) return;
    setRunning({ action, agentId: res.id });
  };

  // so fecha o drawer sozinho quando o estado REALMENTE mudou pro esperado
  // (conectou de verdade, ou desconectou de verdade) — se o usuario cancelou
  // o fluxo no navegador, ou o login falhou, o drawer continua aberto
  // mostrando o "Como instalar/desinstalar" de novo, sem fingir que deu
  // certo. Sempre atualiza a lista do catalogo (onChanged), fechando ou nao.
  const onRunDone = async () => {
    const action = running?.action;
    const targetId = llm?.id;
    setRunning(null);
    const fresh = await onChanged();
    const updated = targetId ? fresh.find((l) => l.id === targetId) : undefined;
    const succeeded = updated
      ? action === 'login'
        ? updated.status === 'connected'
        : updated.status !== 'connected'
      : false;
    if (succeeded) onClose();
  };

  if (!llm) {
    // mantem o Drawer montado fechado (open=false) em vez de desmontar na
    // hora — evita o "pisca" do conteudo sumindo antes da animacao de saida
    // do AntD terminar.
    return (
      <ConfigProvider theme={theme}>
        <AppDrawer open={false} onClose={onClose}>
          <div />
        </AppDrawer>
      </ConfigProvider>
    );
  }

  const Logo = llmLogoFor(llm.id);
  const logoColor = llmLogoColorFor(llm.id) ?? '#111114';
  const guide = llmGuideFor(llm);
  const isNative = llm.id === 'claude';

  const titleNode = (
    <div className="llm-drawer-title-row">
      <span className="llm-logo llm-drawer-logo" style={{ color: logoColor }}>
        <Logo size={22} strokeWidth={1.75} />
      </span>
      <div className="llm-drawer-title-text">
        <div className="llm-drawer-name">{llm.name}</div>
        <div className="llm-drawer-vendor">{llm.vendor}</div>
      </div>
      {llm.status === 'connected' && (
        <span className="status-pill status-pill-connected">
          <span className="status-pill-dot" />
          Conectado
        </span>
      )}
      {llm.status === 'installed' && (
        <span className="status-pill status-pill-installed">
          <span className="status-pill-dot" />
          Instalado
        </span>
      )}
    </div>
  );

  return (
    <ConfigProvider theme={theme}>
      <AppDrawer
        open
        onClose={onClose}
        width={440}
        title={titleNode}
        footer={
          <div className="llm-drawer-footer">
            {/* Cancelar SEMPRE visivel, mesmo rodando — o usuario nunca fica
                sem uma saida da tela. O botao de acao nao some enquanto roda,
                so vira loading (funciona igual pra qualquer LLM, generico). */}
            <Button className="llm-btn llm-btn-secondary" onClick={onClose}>
              Cancelar
            </Button>
            {llm.status === 'connected' && llm.logout && (
              <Button
                className="llm-btn llm-btn-danger"
                icon={running ? undefined : <LogOut size={13} />}
                loading={running?.action === 'logout'}
                disabled={!!running}
                onClick={() => run('logout')}
              >
                {running?.action === 'logout' ? 'Desconectando…' : 'Desconectar'}
              </Button>
            )}
            {llm.status === 'installed' && llm.login && (
              <Button
                className="llm-btn llm-btn-primary"
                icon={running ? undefined : <LogIn size={13} />}
                loading={running?.action === 'login'}
                disabled={!!running}
                onClick={() => run('login')}
              >
                {running?.action === 'login' ? 'Conectando…' : 'Conectar'}
              </Button>
            )}
          </div>
        }
      >
        {/* conteudo do drawer NUNCA troca ao clicar Conectar/Desconectar —
            so o botao do rodape vira loading. O comando de verdade (quem
            abre o navegador e salva o token) continua rodando por baixo, num
            InstallLogView montado mas com zero espaco visual — sem log, sem
            terminal, sem trocar de tela; simples igual qualquer fluxo de
            "conectar uma conta". */}
        <div className="llm-drawer-body">
          {((llm.status === 'connected' && !llm.logout) || (llm.status === 'installed' && !llm.login)) && (
            <section className="llm-drawer-section">
              <div className="llm-drawer-section-title">Conta</div>
              <p className="llm-drawer-section-hint">
                {llmManualAuthHint(llm.id, llm.status === 'connected' ? 'logout' : 'login') ??
                  'Essa CLI não tem um comando de login/logout conhecido pelo Orbit — gerencie direto no terminal.'}
              </p>
            </section>
          )}

          <section className="llm-drawer-section">
            <div className="llm-drawer-section-title">Como instalar</div>
            <p className="llm-drawer-section-hint">
              Esses passos você roda no seu terminal — o Orbit não instala nada por você.
            </p>
            <GuideSteps steps={guide.installSteps} />
          </section>

          {!isNative && (
            <section className="llm-drawer-section">
              <div className="llm-drawer-section-title llm-drawer-section-title-danger">Como desinstalar</div>
              <GuideSteps steps={guide.uninstallSteps} />
            </section>
          )}

          {guide.docsUrl && (
            <Button
              type="link"
              size="small"
              className="llm-drawer-docs-link"
              icon={<ExternalLink size={12} />}
              onClick={() => window.dashboardAPI?.openExternal(guide.docsUrl)}
            >
              {guide.docsLabel}
            </Button>
          )}
        </div>

        {running && (
          <div className="llm-drawer-hidden-log">
            <InstallLogView agentId={running.agentId} onDone={onRunDone} autopilot={llmNeedsAutopilot(llm.id)} />
          </div>
        )}
      </AppDrawer>
    </ConfigProvider>
  );
}
