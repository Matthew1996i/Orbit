import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { Terminal } from '@xterm/xterm';
import { FitAddon } from '@xterm/addon-fit';
import { Unicode11Addon } from '@xterm/addon-unicode11';
import '@xterm/xterm/css/xterm.css';
import { X, Minus, ExternalLink } from 'lucide-react';
import { BACKEND_WS, SessionInfo, StepEvent } from '../api';
import TranscriptView from './TranscriptView';
import './TerminalPanel.css';

// tamanho/posicao default de um painel recem-aberto — exportado pra o
// SessionTree saber, ao focar o card clicado, em que altura o painel vai
// nascer (sem isso o card ficava alinhado no meio da tela, mas o painel abre
// mais pro alto quando a janela e maior que 619px de altura).
export function defaultPanelTop(): number {
  const h = Math.max(220, Math.min(619, window.innerHeight - 38 - 16));
  return Math.max(38, (window.innerHeight - h) / 2);
}

interface Props {
  session: SessionInfo;
  allSessions: SessionInfo[];
  replaySteps: StepEvent[];
  minimized: boolean;
  zIndex: number;
  onClose: () => void;
  onMinimize: () => void;
  onFocus: () => void;
  // "destacar pra fora do app" — abre esse mesmo terminal numa janela OS
  // separada (ver SessionWindow.tsx) e fecha o painel aqui. Omitido quando o
  // painel JA e o conteudo de uma janela destacada (nao faz sentido destacar
  // de novo, e o botao nem aparece nesse caso — ver `popout` abaixo).
  onPopout?: () => void;
  // true quando esse TerminalPanel e o conteudo de uma janela OS dedicada
  // (SessionWindow.tsx) em vez de um painel flutuante dentro do dashboard —
  // preenche a janela inteira, sem posicionamento/arraste, e sem os
  // "semaforos" de fechar/minimizar (o SO ja da esses controles na propria
  // janela).
  popout?: boolean;
  // dispara toda vez que o terminal PASSA A MOSTRAR (ou deixa de mostrar) um
  // prompt interativo esperando o usuario (permissao, escolha de modelo,
  // qualquer menu tipo "❯ 1. ..."). So o Home.tsx usa isso, pra acender o
  // indicador no chip da dock quando o painel esta minimizado.
  onNeedsAction?: (needsAction: boolean) => void;
}

export default function TerminalPanel({
  session,
  allSessions,
  replaySteps,
  minimized,
  zIndex,
  onClose,
  onMinimize,
  onFocus,
  onPopout,
  popout,
  onNeedsAction,
}: Props) {
  const panelRef = useRef<HTMLDivElement>(null);
  const headerRef = useRef<HTMLDivElement>(null);
  const bodyRef = useRef<HTMLDivElement>(null);
  const termRef = useRef<Terminal | null>(null);
  const fitRef = useRef<FitAddon | null>(null);

  const onFocusRef = useRef(onFocus);
  onFocusRef.current = onFocus;
  const onNeedsActionRef = useRef(onNeedsAction);
  onNeedsActionRef.current = onNeedsAction;
  // o painel sempre acompanha o tamanho da JANELA do app (não só o próprio
  // conteúdo) — sem isso, redimensionar a janela do app deixa os painéis
  // "pequenos" plantados num canto, porque eles têm posição/tamanho fixos em
  // pixel (diferente de uma janela de terminal nativa, que É a própria janela
  // do SO).

  const isApp = !!session.appManaged && !!session.appAgentId;

  // efeito "genie" (igual ao Dock do macOS) ao minimizar/restaurar: o painel
  // continua MONTADO (so troca de classe) e a curva de "sugado pro canto" e
  // uma animacao @keyframes de verdade (nao da pra fazer a curva ir-e-voltar
  // com um simples `transition`, que so interpola LINEARMENTE entre dois
  // estados). Como @keyframes so dispara quando a classe e ADICIONADA (nao
  // quando e removida), precisamos de uma classe temporaria pra cada
  // DIRECAO (out ao minimizar, in ao restaurar) — useLayoutEffect (nao
  // useEffect) pra decidir isso ANTES do browser pintar o frame, senao o
  // painel "some" um frame antes da animacao de saida comecar a tocar.
  const GENIE_MS = 320; // precisa bater com a duration do @keyframes em TerminalPanel.css
  const [geniePhase, setGeniePhase] = useState<'' | 'out' | 'in'>('');
  const prevMinimizedRef = useRef(minimized);
  useLayoutEffect(() => {
    if (prevMinimizedRef.current === minimized) return;
    prevMinimizedRef.current = minimized;
    setGeniePhase(minimized ? 'out' : 'in');
    const t = setTimeout(() => setGeniePhase(''), GENIE_MS);
    return () => clearTimeout(t);
  }, [minimized]);
  // so aplica visibility:hidden/pointer-events:none DEPOIS que a animacao de
  // saida terminou de tocar — enquanto ela esta tocando (geniePhase==='out')
  // o painel continua totalmente visivel, so encolhendo.
  const settledHidden = minimized && geniePhase === '';

  // --- inicializa o terminal xterm.js, só para o modo interativo (PTY real) ---
  useEffect(() => {
    if (!isApp) return;
    if (!bodyRef.current) return;
    const term = new Terminal({
      // convertEol:false (nao true) — um PTY de verdade ja manda \r\n certinho;
      // forcar a conversao pode duplicar quebras de linha em alguns casos. E o
      // que o Alethe (referencia madura pra terminal real em Electron/Tauri) usa.
      convertEol: false,
      allowProposedApi: true,
      fontSize: 13,
      lineHeight: 1.25,
      disableStdin: !isApp,
      cursorBlink: isApp,
      cursorStyle: 'block',
      scrollback: 5000,
      rightClickSelectsWord: true,
      fontFamily:
        '"SF Mono", Menlo, Monaco, "Cascadia Code", "Fira Code", ui-monospace, Consolas, monospace',
      theme: {
        background: '#000000',
        foreground: '#d4d4d4',
        cursor: '#d4d4d4',
        cursorAccent: '#000000',
        selectionBackground: 'rgba(255,255,255,0.25)',
        black: '#000000',
        red: '#ff5c57',
        green: '#5af78e',
        yellow: '#f3f99d',
        blue: '#57c7ff',
        magenta: '#ff6ac1',
        cyan: '#9aedfe',
        white: '#f1f1f0',
        brightBlack: '#686868',
        brightRed: '#ff5c57',
        brightGreen: '#5af78e',
        brightYellow: '#f3f99d',
        brightBlue: '#57c7ff',
        brightMagenta: '#ff6ac1',
        brightCyan: '#9aedfe',
        brightWhite: '#f1f1f0',
      },
    });
    const fit = new FitAddon();
    term.loadAddon(fit);
    // largura correta de caracteres largos/box-drawing (a CLI usa bastante:
    // ❯ ✳ ─ ▸▸ etc) — sem isso o xterm pode medir a largura errada de alguns
    // glifos e desalinhar onde a linha realmente quebra.
    term.loadAddon(new Unicode11Addon());
    term.unicode.activeVersion = '11';
    term.open(bodyRef.current);
    fit.fit();
    term.focus();
    termRef.current = term;
    fitRef.current = fit;

    // paridade com terminal nativo: selecionar texto copia pro clipboard
    term.onSelectionChange(() => {
      const sel = term.getSelection();
      if (sel) navigator.clipboard?.writeText(sel).catch(() => {});
    });

    // detecta um prompt interativo esperando o usuario (permissao, escolha
    // de modelo, qualquer menu tipo "❯ 1. Yes") — duas pistas, OU basta uma:
    // o glifo "❯" (cursor padrao dos menus tipo Ink que Claude Code/Codex/
    // Gemini CLI usam pra opcao selecionada, raramente aparece em saida de
    // texto/codigo normal) OU uma das frases fixas que a propria CLI usa
    // pra gate de aprovacao ("Do you want to proceed?", "requires
    // approval") — usadas junto porque um prompt de aprovacao pode nao
    // ficar com o "❯" bem na hora do scan (ex: cursor ainda na 1a opcao
    // antes do usuario mexer) e essas frases sao um sinal tao forte quanto.
    // So escaneia a tela VISIVEL (term.rows a partir de buf.baseY), nao o
    // scrollback inteiro — um prompt antigo que ja rolou pra fora da tela
    // nao conta mais como "precisa de acao" agora.
    const NEEDS_ACTION_PHRASES = ['do you want to proceed', 'requires approval', 'requer aprovação'];
    let needsAction = false;
    const checkNeedsAction = () => {
      const buf = term.buffer.active;
      let found = false;
      for (let y = 0; y < term.rows; y++) {
        const line = buf.getLine(buf.baseY + y);
        if (!line) continue;
        const text = line.translateToString(true);
        if (text.includes('❯') || NEEDS_ACTION_PHRASES.some((p) => text.toLowerCase().includes(p))) {
          found = true;
          break;
        }
      }
      if (found !== needsAction) {
        needsAction = found;
        onNeedsActionRef.current?.(found);
      }
    };

    const ws = new WebSocket(`${BACKEND_WS}/ws/agent/${session.appAgentId}`);
    ws.binaryType = 'arraybuffer';
    ws.onmessage = (ev) => term.write(new Uint8Array(ev.data as ArrayBuffer), checkNeedsAction);
    ws.onclose = () => term.writeln('\r\n\x1b[31m[desconectado]\x1b[0m');
    let lastCols = -1;
    let lastRows = -1;
    // reflow visual local: recalcula a grade e redesenha, sem falar com o
    // PTY. Chamada a cada frame pintado enquanto o tamanho muda (via rAF
    // abaixo) — e o que faz o texto acompanhar a borda ao vivo, igual a um
    // terminal nativo, em vez de ficar "parado" no tamanho anterior ate o
    // arrasto terminar.
    const applyFit = () => {
      fit.fit();
      // forca o xterm a re-renderizar todas as linhas com a nova grade —
      // sem isso, glifos medidos/posicionados pra um cols antigo podem ficar
      // levemente fora do lugar (linha quebrando 1-2 colunas antes/depois do
      // que realmente cabe na tela).
      try {
        term.refresh(0, Math.max(0, term.rows - 1));
      } catch {
        /* nada a fazer se o buffer ainda nao tem linhas pra redesenhar */
      }
    };
    // force=true sempre manda pro PTY mesmo se cols/rows nao mudaram (usado
    // nos reenvios de seguranca do 1o boot, onde o objetivo e garantir que a
    // CLI redesenha, nao so avisar de uma mudanca de tamanho de verdade).
    const sendResize = (force = false) => {
      applyFit();
      const changed = term.cols !== lastCols || term.rows !== lastRows;
      lastCols = term.cols;
      lastRows = term.rows;
      // so re-envia pro PTY se a grade (cols/rows) realmente mudou — evita
      // SIGWINCH redundante (e o redesenho que ele dispara na CLI) quando so
      // o tamanho em pixels mudou mas a grade de caracteres ficou igual.
      if (!force && !changed) return;
      if (ws.readyState === WebSocket.OPEN) {
        ws.send(JSON.stringify({ type: 'resize', rows: term.rows, cols: term.cols }));
      }
    };
    // dois ritmos diferentes, de proposito: o reflow VISUAL (applyFit, via
    // rAF) roda a cada frame pintado no maximo (nunca mais de uma vez por
    // ~16ms, mesmo que o ResizeObserver dispare varias vezes no mesmo
    // frame) — rapido o bastante pra parecer ao vivo, devagar o bastante pra
    // nao encadear reflows de sobra e perder linhas do scrollback (era isso
    // que acontecia antes, chamando fit.fit() sem nenhum throttle). Ja o
    // aviso pro PTY real (SIGWINCH, via sendResize) continua so quando o
    // tamanho PARA de mudar por ~100ms — mandar isso a cada frame inundaria
    // a TUI remota (feita em Ink) com redesenhos que ela nao acompanha.
    let rafId: number | null = null;
    let settleTimeout: ReturnType<typeof setTimeout> | null = null;
    const onResize = () => {
      if (rafId === null) {
        rafId = requestAnimationFrame(() => {
          rafId = null;
          applyFit();
        });
      }
      if (settleTimeout) clearTimeout(settleTimeout);
      settleTimeout = setTimeout(() => sendResize(), 100);
    };
    ws.onopen = () => {
      sendResize(true);
      // reajuste de seguranca: a 1a medicao pode ocorrer antes do layout do
      // painel assentar de vez (fontes/CSS/handles de resize), deixando o
      // rodape do CLI real cortado fora da area visivel. Reenvia o tamanho
      // várias vezes nos primeiros segundos (o `claude` real ainda está
      // inicializando nesse período, então não custa nada garantir) — um
      // agente novo (processo começa do zero) é mais sensível a essa corrida
      // do que uma sessão retomada/já em execução há mais tempo. `force` aqui
      // pra sempre reenviar e forcar a CLI a redesenhar, mesmo se cols/rows
      // ja bateram com a ultima medicao.
      [200, 500, 1000, 2000].forEach((delay) => setTimeout(() => sendResize(true), delay));
    };
    term.onData((data) => {
      if (ws.readyState === WebSocket.OPEN) ws.send(new TextEncoder().encode(data));
    });

    const ro = new ResizeObserver(() => {
      onResize();
    });
    if (panelRef.current) ro.observe(panelRef.current);

    return () => {
      if (rafId !== null) cancelAnimationFrame(rafId);
      if (settleTimeout) clearTimeout(settleTimeout);
      ro.disconnect();
      ws.close();
      term.dispose();
      termRef.current = null;
      if (needsAction) onNeedsActionRef.current?.(false);
    };
    // session.sessionId de PROPOSITO fora do array de deps: um agente do
    // app nasce com um sessionId SINTETICO (Home.tsx/read_app_agent_sessions
    // no backend) ate a sessao REAL do `claude` se registrar em disco
    // (~/.claude/sessions/*.json), o que troca o sessionId visivel por um
    // completamente diferente uns segundos depois, SEM o agente/processo
    // real ter mudado nada — o appAgentId (usado na URL do WS abaixo) e
    // quem continua igual o tempo todo. Reagir a sessionId aqui derrubava e
    // reabria a conexao (e reiniciava o xterm do zero) nessa troca, dando a
    // impressao de "abriu, fechou, abriu de novo" pro usuario.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isApp, session.appAgentId]);

  // --- arrastar pelo cabecalho ---
  useEffect(() => {
    const header = headerRef.current;
    const panel = panelRef.current;
    if (!header || !panel) return;

    let dragging = false;
    let startX = 0;
    let startY = 0;
    let startLeft = 0;
    let startTop = 0;

    const onPointerDown = (e: PointerEvent) => {
      // o botao de destacar (.term-popout-btn) mora dentro do header
      // arrastavel, igual aos semaforos (.term-dot) — sem excluir os dois, o
      // preventDefault() do drag abaixo engolia o click antes dele chegar no
      // botao, e "abrir em janela separada" nunca disparava.
      if ((e.target as HTMLElement).closest('.term-dot, .term-popout-btn')) return;
      // sem isso o Chromium inicia selecao de texto/drag nativo (o "fantasma"
      // de captura da tela acompanhando o cursor) ao arrastar pelo cabecalho —
      // mesmo motivo do onPointerDown do TreeCard em SessionTree.tsx.
      e.preventDefault();
      onFocusRef.current();
      dragging = true;
      startX = e.clientX;
      startY = e.clientY;
      const rect = panel.getBoundingClientRect();
      startLeft = rect.left;
      startTop = rect.top;
      header.setPointerCapture(e.pointerId);
    };
    const onPointerMove = (e: PointerEvent) => {
      if (!dragging) return;
      const dx = e.clientX - startX;
      const dy = e.clientY - startY;
      panel.style.left = `${Math.max(0, startLeft + dx)}px`;
      panel.style.top = `${Math.max(0, startTop + dy)}px`;
    };
    const onPointerUp = () => {
      dragging = false;
    };

    header.addEventListener('pointerdown', onPointerDown);
    header.addEventListener('pointermove', onPointerMove);
    header.addEventListener('pointerup', onPointerUp);
    return () => {
      header.removeEventListener('pointerdown', onPointerDown);
      header.removeEventListener('pointermove', onPointerMove);
      header.removeEventListener('pointerup', onPointerUp);
    };
  }, []);

  // tamanho fixo = 920x619 (o tamanho validado como correto) — sem resize
  // manual por borda: o usuário só arrasta pra ORGANIZAR onde cada painel
  // fica, o tamanho de cada um é sempre esse (encolhe só se a janela do app
  // for menor que isso, pra nunca estourar pra fora da tela).
  const computeQuarterSize = () => ({
    w: Math.max(360, Math.min(920, window.innerWidth - 16)),
    h: Math.max(220, Math.min(619, window.innerHeight - 38 - 16)),
  });

  // aplica o tamanho fixo assim que o painel nasce, encostado na DIREITA da
  // tela (so depois disso o usuario pode arrastar pra organizar) — assim o
  // card do agente que o usuario acabou de clicar (na arvore, sempre mais pra
  // esquerda) continua visivel ao lado do painel, em vez de ficar coberto por
  // um painel centralizado.
  useLayoutEffect(() => {
    // janela destacada: o CSS (.term-panel-popout) ja preenche a janela
    // inteira sozinho — nao precisa (e nao deve) forcar um tamanho/posicao
    // fixo em pixel por cima disso.
    if (popout) return;
    const panel = panelRef.current;
    if (!panel) return;
    const { w, h } = computeQuarterSize();
    panel.style.width = `${w}px`;
    panel.style.height = `${h}px`;
    // margem maior que os 16px "padrao" do resto do app (ver Home.css) —
    // colado bem na borda direita ficava dificil de perceber que ainda havia
    // espaco de sobra na tela, tipo uma janela "cortada".
    panel.style.left = `${Math.max(0, window.innerWidth - w - 56)}px`;
    panel.style.top = `${Math.max(38, (window.innerHeight - h) / 2)}px`;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // --- acompanha o tamanho da JANELA: o painel sempre fica no tamanho fixo
  // (920x619, ou menor se a janela do app for pequena), recalculado a cada
  // resize da janela do app — só a POSIÇÃO fica a cargo do usuário (arrastar
  // o cabeçalho), o tamanho nunca é escolha manual. ---
  useEffect(() => {
    if (popout) return;
    const panel = panelRef.current;
    if (!panel) return;
    const onWindowResize = () => {
      const { w, h } = computeQuarterSize();
      panel.style.width = `${w}px`;
      panel.style.height = `${h}px`;
    };
    window.addEventListener('resize', onWindowResize);
    return () => window.removeEventListener('resize', onWindowResize);
  }, []);

  const title = useMemo(() => session.name || session.sessionId.slice(0, 8), [session]);

  const focusTerminal = () => termRef.current?.focus();

  return (
    <div
      className={`term-panel${popout ? ' term-panel-popout' : ''}${settledHidden ? ' term-panel-minimized-hidden' : ''}${geniePhase ? ` term-panel-genie-${geniePhase}` : ''}${session.remoteControl ? ' term-panel-remote' : ''}`}
      style={{ zIndex }}
      ref={panelRef}
      data-session-id={session.sessionId}
      onMouseDownCapture={onFocus}
    >
      <div className="term-header" ref={headerRef}>
        {popout ? (
          // janela destacada: o proprio SO ja da fechar/minimizar/maximizar
          // (frame nativo, ver openSessionWindow no processo principal) —
          // repetir os semaforos aqui so duplicaria os controles.
          <div className="term-header-spacer" />
        ) : (
          <div className="term-traffic-lights">
            <button className="term-dot term-dot-close" onClick={onClose} aria-label="Fechar">
              <X size={9} strokeWidth={2.5} />
            </button>
            <button className="term-dot term-dot-min" onClick={onMinimize} aria-label="Minimizar">
              <Minus size={9} strokeWidth={2.5} />
            </button>
          </div>
        )}
        <strong className="term-title">
          {title}
          {session.remoteControl && (
            <span className="term-title-remote-tag" title="Remote Control ativo nesta sessão">remoto</span>
          )}
        </strong>
        {popout ? (
          <div className="term-header-spacer" />
        ) : (
          <div className="term-header-spacer">
            {onPopout && (
              <button
                className="term-popout-btn"
                onClick={onPopout}
                aria-label="Abrir em janela separada"
                title="Abrir em janela separada"
              >
                <ExternalLink size={12} strokeWidth={2.25} />
              </button>
            )}
          </div>
        )}
      </div>
      {isApp ? (
        <div className="term-body" ref={bodyRef} onMouseDown={focusTerminal} />
      ) : (
        <div className="term-body term-body-transcript">
          <TranscriptView session={session} allSessions={allSessions} steps={replaySteps} />
        </div>
      )}
    </div>
  );
}
