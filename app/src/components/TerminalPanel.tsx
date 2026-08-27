import { useEffect, useLayoutEffect, useMemo, useRef } from 'react';
import { Terminal } from '@xterm/xterm';
import { FitAddon } from '@xterm/addon-fit';
import { Unicode11Addon } from '@xterm/addon-unicode11';
import '@xterm/xterm/css/xterm.css';
import { X, Minus } from 'lucide-react';
import { BACKEND_WS, SessionInfo, StepEvent } from '../api';
import TranscriptView from './TranscriptView';
import './TerminalPanel.css';

interface Props {
  session: SessionInfo;
  allSessions: SessionInfo[];
  replaySteps: StepEvent[];
  minimized: boolean;
  zIndex: number;
  onClose: () => void;
  onMinimize: () => void;
  onFocus: () => void;
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
}: Props) {
  const panelRef = useRef<HTMLDivElement>(null);
  const headerRef = useRef<HTMLDivElement>(null);
  const bodyRef = useRef<HTMLDivElement>(null);
  const termRef = useRef<Terminal | null>(null);
  const fitRef = useRef<FitAddon | null>(null);

  const onFocusRef = useRef(onFocus);
  onFocusRef.current = onFocus;
  // o painel sempre acompanha o tamanho da JANELA do app (não só o próprio
  // conteúdo) — sem isso, redimensionar a janela do app deixa os painéis
  // "pequenos" plantados num canto, porque eles têm posição/tamanho fixos em
  // pixel (diferente de uma janela de terminal nativa, que É a própria janela
  // do SO).

  const isApp = !!session.appManaged && !!session.appAgentId;

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

    const ws = new WebSocket(`${BACKEND_WS}/ws/agent/${session.appAgentId}`);
    ws.binaryType = 'arraybuffer';
    ws.onmessage = (ev) => term.write(new Uint8Array(ev.data as ArrayBuffer));
    ws.onclose = () => term.writeln('\r\n\x1b[31m[desconectado]\x1b[0m');
    let lastCols = -1;
    let lastRows = -1;
    // force=true sempre manda pro PTY mesmo se cols/rows nao mudaram (usado
    // nos reenvios de seguranca do 1o boot, onde o objetivo e garantir que a
    // CLI redesenha, nao so avisar de uma mudanca de tamanho de verdade).
    const sendResize = (force = false) => {
      fit.fit();
      // fit.fit() acabou de gravar o tamanho real (em px, via style inline)
      // no `.xterm-screen` — limpa o esticamento visual temporario, o
      // conteudo real ja bate com o container.
      const screenEl = bodyRef.current?.querySelector<HTMLElement>('.xterm-screen');
      if (screenEl) screenEl.style.transform = '';
      // forca o xterm a re-renderizar todas as linhas com a nova grade —
      // sem isso, glifos medidos/posicionados pra um cols antigo podem ficar
      // levemente fora do lugar (linha quebrando 1-2 colunas antes/depois do
      // que realmente cabe na tela).
      try {
        term.refresh(0, Math.max(0, term.rows - 1));
      } catch {
        /* nada a fazer se o buffer ainda nao tem linhas pra redesenhar */
      }
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
    // manda o resize de verdade (PTY + SIGWINCH pro `claude` real) so quando o
    // tamanho PARA de mudar por ~120ms — mandar um por mousemove durante um
    // arrasto de borda dispara redraws em sequencia rapida demais pra TUI (ela
    // e feita em Ink) acompanhar, e ela apaga a tela achando que vai redesenhar
    // e nunca termina.
    // fit.fit() tambem precisa esperar esse mesmo debounce, e nao so o envio
    // pro WS: fit.fit() chama term.resize(), que faz reflow do scrollback
    // sempre que `cols` muda. Chamar fit.fit() a cada tick do ResizeObserver
    // (sem debounce) faz o xterm.js rodar uma sequencia de reflows (encolhe,
    // encolhe, cresce, cresce...) rapido demais — e esse reflow encadeado
    // acaba perdendo/apagando linhas do scrollback (o conteudo "some" da
    // tela). Por isso o reflow REAL so roda quando o tamanho PARA de mudar —
    // mas so isso deixava uma "janela" () presa no tamanho antigo, sobrando
    // area vazia dentro do painel enquanto o usuario ainda esta arrastando.
    // Enquanto o reflow real espera, o `.xterm-screen` (elemento que o
    // xterm.js dimensiona com width/height fixos em px a cada fit) e
    // esticado via `transform: scale()` pra acompanhar o container ao vivo —
    // e so CSS/composicao, nao mexe no reflow nem no conteudo, so estica a
    // pintura (pode distorcer a fonte levemente por poucos frames), e some
    // assim que o fit.fit() de verdade roda e recalcula o tamanho real.
    let resizeDebounce: ReturnType<typeof setTimeout> | null = null;
    const debouncedSendResize = () => {
      const container = bodyRef.current;
      const screenEl = container?.querySelector<HTMLElement>('.xterm-screen');
      if (container && screenEl) {
        screenEl.style.transformOrigin = 'top left';
        const screenW = screenEl.offsetWidth;
        const screenH = screenEl.offsetHeight;
        if (screenW > 0 && screenH > 0) {
          const sx = container.clientWidth / screenW;
          const sy = container.clientHeight / screenH;
          screenEl.style.transform = `scale(${sx}, ${sy})`;
        }
      }
      if (resizeDebounce) clearTimeout(resizeDebounce);
      resizeDebounce = setTimeout(sendResize, 120);
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
      debouncedSendResize();
    });
    if (panelRef.current) ro.observe(panelRef.current);

    return () => {
      if (resizeDebounce) clearTimeout(resizeDebounce);
      ro.disconnect();
      ws.close();
      term.dispose();
      termRef.current = null;
    };
  }, [isApp, session.sessionId, session.appAgentId]);

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
      if ((e.target as HTMLElement).closest('.term-dot')) return;
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

  // aplica o tamanho fixo assim que o painel nasce, e centraliza na tela (a
  // posicao inicial e sempre no meio — so depois disso o usuario pode
  // arrastar pra organizar). O CSS tinha um `left: calc(50vw - 460px)`
  // fixo que so centralizava de verdade pra uma largura de 920px e nunca
  // considerava a altura, entao em janelas menores/maiores o painel nascia
  // fora do centro; calcular em JS com o tamanho real resolve pros dois eixos.
  useLayoutEffect(() => {
    const panel = panelRef.current;
    if (!panel) return;
    const { w, h } = computeQuarterSize();
    panel.style.width = `${w}px`;
    panel.style.height = `${h}px`;
    panel.style.left = `${Math.max(0, (window.innerWidth - w) / 2)}px`;
    panel.style.top = `${Math.max(38, (window.innerHeight - h) / 2)}px`;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // --- acompanha o tamanho da JANELA: o painel sempre fica no tamanho fixo
  // (920x619, ou menor se a janela do app for pequena), recalculado a cada
  // resize da janela do app — só a POSIÇÃO fica a cargo do usuário (arrastar
  // o cabeçalho), o tamanho nunca é escolha manual. ---
  useEffect(() => {
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
      className={`term-panel${minimized ? ' term-panel-minimized-hidden' : ''}${session.remoteControl ? ' term-panel-remote' : ''}`}
      style={{ zIndex }}
      ref={panelRef}
      data-session-id={session.sessionId}
      onMouseDownCapture={onFocus}
    >
      <div className="term-header" ref={headerRef}>
        <div className="term-traffic-lights">
          <button className="term-dot term-dot-close" onClick={onClose} aria-label="Fechar">
            <X size={9} strokeWidth={2.5} />
          </button>
          <button className="term-dot term-dot-min" onClick={onMinimize} aria-label="Minimizar">
            <Minus size={9} strokeWidth={2.5} />
          </button>
        </div>
        <strong className="term-title">
          {title}
          {session.remoteControl && (
            <span className="term-title-remote-tag" title="Remote Control ativo nesta sessão">remoto</span>
          )}
        </strong>
        <div className="term-header-spacer" />
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
