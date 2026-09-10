import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { Terminal } from '@xterm/xterm';
import { FitAddon } from '@xterm/addon-fit';
import { Unicode11Addon } from '@xterm/addon-unicode11';
import '@xterm/xterm/css/xterm.css';
import { X, Minus, ExternalLink, Maximize2, Minimize2, Pin, PinOff } from 'lucide-react';
import { BACKEND_WS, SessionInfo, StepEvent } from '../api';
import TranscriptView from './TranscriptView';
import { getOsPlatform } from '../utils/platform';
import './TerminalPanel.css';

// so no mac os controles viram semaforos coloridos a esquerda (padrao do
// SO); Linux/Windows usam botoes de icone a direita, como o resto do app —
// ver term-header no JSX abaixo e as classes term-win-* no CSS.
const IS_MAC_STYLE = getOsPlatform() === 'mac';
const IS_LINUX_STYLE = getOsPlatform() === 'linux';

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
  docked?: boolean;
  dockedActive?: boolean;
  onToggleDock?: () => void;
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
  docked = false,
  dockedActive = true,
  onToggleDock,
  onNeedsAction,
}: Props) {
  const panelRef = useRef<HTMLDivElement>(null);
  const [maximized, setMaximized] = useState(false);
  const headerRef = useRef<HTMLDivElement>(null);
  const bodyRef = useRef<HTMLDivElement>(null);
  const termRef = useRef<Terminal | null>(null);
  const fitRef = useRef<FitAddon | null>(null);
  const dockedRef = useRef(docked);
  dockedRef.current = docked;

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
    const orbitThemeColors = () => {
      const styles = getComputedStyle(document.documentElement);
      return {
        background: styles.getPropertyValue('--orbit-canvas-bg').trim() || '#1e1e1e',
        foreground: styles.getPropertyValue('--orbit-sidebar-fg').trim() || '#cccccc',
      };
    };
    const orbitColors = orbitThemeColors();
    const term = new Terminal({
      // convertEol:false (nao true) — um PTY de verdade ja manda \r\n certinho;
      // forcar a conversao pode duplicar quebras de linha em alguns casos. E o
      // que o Alethe (referencia madura pra terminal real em Electron/Tauri) usa.
      convertEol: false,
      allowProposedApi: true,
      fontSize: 13,
      lineHeight: 1.25,
      // Reorganiza linhas ja impressas quando a grade muda, como um terminal
      // nativo. Sem isso o canvas muda de tamanho, mas o scrollback continua
      // visualmente preso na largura anterior.
      reflowCursorLine: true,
      disableStdin: !isApp,
      cursorBlink: isApp,
      cursorStyle: 'block',
      scrollback: 5000,
      rightClickSelectsWord: true,
      fontFamily:
        '"SF Mono", Menlo, Monaco, "Cascadia Code", "Fira Code", ui-monospace, Consolas, monospace',
      theme: {
        background: orbitColors.background,
        foreground: orbitColors.foreground,
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

    // O tema e aplicado no <html data-theme="...">. Atualiza tambem o
    // canvas interno do xterm quando o usuario troca de tema, pois canvas nao
    // entende `var(--css-variable)` como cor de preenchimento.
    const themeObserver = new MutationObserver(() => {
      const colors = orbitThemeColors();
      term.options.theme = { ...term.options.theme, ...colors };
      bodyRef.current?.style.setProperty('--orbit-terminal-bg', colors.background);
      term.refresh(0, Math.max(0, term.rows - 1));
    });
    themeObserver.observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] });

    // paridade com terminal nativo: selecionar texto copia pro clipboard
    term.onSelectionChange(() => {
      const sel = term.getSelection();
      if (sel) navigator.clipboard?.writeText(sel).catch(() => {});
    });

    // detecta um prompt interativo esperando o usuario (permissao, escolha
    // de modelo, qualquer menu tipo "❯ 1. Yes") — duas pistas, OU basta uma:
    // o glifo "❯" seguido de um NUMERO DE OPCAO (ex.: "❯ 1.", "❯ 2)") — o
    // cursor de selecao que Claude Code/Codex/Gemini CLI usam em menus tipo
    // Ink — OU uma das frases fixas que a propria CLI usa pra gate de
    // aprovacao ("Do you want to proceed?", "requires approval"), pra
    // cobrir o instante em que o cursor do menu ainda esta na 1a opcao e o
    // "❯ 1." nao apareceu na hora do scan. Importante: SO o "❯" sozinho (sem
    // o numero depois) NAO conta — esse mesmo glifo e o marcador padrao do
    // PROMPT DE ENTRADA normal da CLI (ex.: "❯ escreva sua mensagem"),
    // visivel o tempo todo enquanto ela esta ociosa esperando o proximo
    // comando — usar so isso como sinal piscava o indicador constantemente,
    // mesmo sem nenhuma acao pendente de verdade.
    // So escaneia a tela VISIVEL (term.rows a partir de buf.baseY), nao o
    // scrollback inteiro — um prompt antigo que ja rolou pra fora da tela
    // nao conta mais como "precisa de acao" agora.
    const NEEDS_ACTION_PHRASES = ['do you want to proceed', 'requires approval', 'requer aprovação'];
    const MENU_CURSOR_RE = /❯\s*\d+[.)]/;
    let needsAction = false;
    const checkNeedsAction = () => {
      const buf = term.buffer.active;
      let found = false;
      for (let y = 0; y < term.rows; y++) {
        const line = buf.getLine(buf.baseY + y);
        if (!line) continue;
        const text = line.translateToString(true);
        if (MENU_CURSOR_RE.test(text) || NEEDS_ACTION_PHRASES.some((p) => text.toLowerCase().includes(p))) {
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
    let resizeFrame: number | null = null;
    let forceResizePending = false;
    let disposed = false;
    const startupTimers: Array<ReturnType<typeof setTimeout>> = [];
    let observedWidth = bodyRef.current.clientWidth;
    let observedHeight = bodyRef.current.clientHeight;

    // Mantem a grade do xterm e o PTY com exatamente as dimensoes que cabem
    // no body. `proposeDimensions` evita um resize inutil; requestAnimationFrame
    // agrupa os varios eventos que Chromium emite no mesmo frame enquanto a
    // borda e arrastada. Nao ha scale CSS: caracteres mantem o tamanho e o
    // buffer faz o reflow real, como em Terminal.app/Windows Terminal.
    const fitAndSendResize = (force = false) => {
      if (disposed || !bodyRef.current || bodyRef.current.clientWidth < 2 || bodyRef.current.clientHeight < 2) return;
      const dimensions = fit.proposeDimensions();
      if (!dimensions || dimensions.cols < 2 || dimensions.rows < 1) return;
      // No painel fixado, deixa uma linha completa de folga no canvas. Em
      // monitores grandes/fracionados o renderer do xterm pode arredondar a
      // altura acumulada das linhas para cima e recortar justamente o footer
      // da CLI. Subtrair uma LINHA da grade e mais robusto que reservar pixels
      // por CSS, pois acompanha fontSize, lineHeight e escala do monitor.
      const targetRows = Math.max(1, dimensions.rows - (dockedRef.current ? 1 : 0));
      const changed = dimensions.cols !== term.cols || targetRows !== term.rows;
      // fit() nao apenas chama resize: ele limpa o render service interno
      // antes, necessario para os canvases ocuparem imediatamente a nova
      // grade. Chamar term.resize() diretamente podia atualizar cols/rows
      // sem repintar toda a largura na janela destacada.
      if (changed) {
        term.resize(dimensions.cols, targetRows);
        // fit.fit() limpa o renderizador; o refresh garante que o scrollback
        // visivel seja pintado imediatamente, inclusive sem nova saida da CLI.
        try {
          term.refresh(0, Math.max(0, term.rows - 1));
        } catch {
          /* terminal em desmontagem */
        }
      }
      const shouldSend = force || term.cols !== lastCols || term.rows !== lastRows;
      lastCols = term.cols;
      lastRows = term.rows;
      if (shouldSend && ws.readyState === WebSocket.OPEN) {
        ws.send(JSON.stringify({ type: 'resize', rows: term.rows, cols: term.cols }));
      }
    };
    const scheduleResize = (force = false) => {
      forceResizePending = forceResizePending || force;
      if (resizeFrame !== null) return;
      resizeFrame = requestAnimationFrame(() => {
        resizeFrame = null;
        const shouldForce = forceResizePending;
        forceResizePending = false;
        fitAndSendResize(shouldForce);
      });
    };
    ws.onopen = () => {
      scheduleResize(true);
      // reajuste de seguranca: a 1a medicao pode ocorrer antes do layout do
      // painel assentar de vez (fontes/CSS/handles de resize), deixando o
      // rodape do CLI real cortado fora da area visivel. Reenvia o tamanho
      // várias vezes nos primeiros segundos (o `claude` real ainda está
      // inicializando nesse período, então não custa nada garantir) — um
      // agente novo (processo começa do zero) é mais sensível a essa corrida
      // do que uma sessão retomada/já em execução há mais tempo. `force` aqui
      // pra sempre reenviar e forcar a CLI a redesenhar, mesmo se cols/rows
      // ja bateram com a ultima medicao.
      [200, 500, 1000, 2000].forEach((delay) => {
        startupTimers.push(setTimeout(() => scheduleResize(true), delay));
      });
    };
    term.onData((data) => {
      if (ws.readyState === WebSocket.OPEN) ws.send(new TextEncoder().encode(data));
    });

    const ro = new ResizeObserver(() => scheduleResize());
    if (bodyRef.current) ro.observe(bodyRef.current);
    // segunda fonte de verdade, independente do ResizeObserver: o evento
    // nativo de resize da janela do SO. Sem isso a janela destacada (popout)
    // dependia SO do ResizeObserver no painel — redundante aqui, mas barato
    // e evita ficar refem de um unico mecanismo pra algo tao importante.
    const onWindowResize = () => scheduleResize();
    window.addEventListener('resize', onWindowResize);
    // Chromium/Electron pode deixar de emitir ResizeObserver durante certas
    // transicoes nativas (maximizar, sair de fullscreen ou resize muito
    // rapido). Confere somente o tamanho em pixels e agenda trabalho quando
    // ele realmente mudou; nao gera resize/SIGWINCH ocioso.
    const dimensionWatcher = window.setInterval(() => {
      const body = bodyRef.current;
      if (!body) return;
      if (body.clientWidth === observedWidth && body.clientHeight === observedHeight) return;
      observedWidth = body.clientWidth;
      observedHeight = body.clientHeight;
      scheduleResize();
    }, 100);

    return () => {
      disposed = true;
      if (resizeFrame !== null) cancelAnimationFrame(resizeFrame);
      startupTimers.forEach(clearTimeout);
      window.clearInterval(dimensionWatcher);
      themeObserver.disconnect();
      window.removeEventListener('resize', onWindowResize);
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
      if (panel.classList.contains('term-panel-maximized') || panel.classList.contains('term-panel-popout') || panel.classList.contains('term-panel-docked')) return;
      // o botao de destacar (.term-popout-btn) mora dentro do header
      // arrastavel, igual aos semaforos (.term-dot, so no mac) e aos botoes
      // de fechar/minimizar no estilo Windows/Linux (.term-win-btn, ver
      // IS_MAC_STYLE acima) — sem excluir os tres, o preventDefault() do
      // drag abaixo engolia o click antes dele chegar no botao, e
      // fechar/minimizar/destacar nunca disparavam fora do mac.
      if ((e.target as HTMLElement).closest('.term-dot, .term-popout-btn, .term-dock-btn, .term-win-btn')) return;
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
  }, [docked]);

  // Resize manual do painel interno. O handle nativo de `resize: both` fica
  // inconsistente em janelas Electron com `overflow:hidden` e elementos que
  // capturam pointer events (como o cabecalho arrastavel). Um handle proprio
  // garante o mesmo comportamento em macOS, Windows e Linux; a janela
  // destacada continua usando o resize nativo do BrowserWindow.
  useEffect(() => {
    if (popout || docked) return;
    const panel = panelRef.current;
    if (!panel) return;
    const handles = [...panel.querySelectorAll<HTMLElement>('[data-resize-dir]')];
    let resizing = false;
    let direction = '';
    let startX = 0;
    let startY = 0;
    let startWidth = 0;
    let startHeight = 0;
    let startLeft = 0;
    let startTop = 0;

    const onPointerDown = (event: PointerEvent) => {
      event.preventDefault();
      event.stopPropagation();
      const rect = panel.getBoundingClientRect();
      resizing = true;
      direction = (event.currentTarget as HTMLElement).dataset.resizeDir || 'se';
      startX = event.clientX;
      startY = event.clientY;
      startWidth = rect.width;
      startHeight = rect.height;
      startLeft = rect.left;
      startTop = rect.top;
      onFocusRef.current();
    };
    const onPointerMove = (event: PointerEvent) => {
      if (!resizing) return;
      const dx = event.clientX - startX;
      const dy = event.clientY - startY;
      let width = startWidth;
      let height = startHeight;
      let left = startLeft;
      let top = startTop;
      if (direction.includes('e')) width = Math.max(360, Math.min(window.innerWidth - startLeft, startWidth + dx));
      if (direction.includes('s')) height = Math.max(220, Math.min(window.innerHeight - startTop, startHeight + dy));
      if (direction.includes('w')) {
        width = Math.max(360, Math.min(startLeft + startWidth, startWidth - dx));
        left = startLeft + startWidth - width;
      }
      if (direction.includes('n')) {
        height = Math.max(220, Math.min(startTop + startHeight - 38, startHeight - dy));
        top = startTop + startHeight - height;
      }
      panel.style.width = `${width}px`;
      panel.style.height = `${height}px`;
      panel.style.left = `${left}px`;
      panel.style.top = `${top}px`;
    };
    const onPointerUp = () => {
      resizing = false;
    };
    handles.forEach((handle) => handle.addEventListener('pointerdown', onPointerDown));
    window.addEventListener('pointermove', onPointerMove);
    window.addEventListener('pointerup', onPointerUp);
    window.addEventListener('pointercancel', onPointerUp);
    return () => {
      handles.forEach((handle) => handle.removeEventListener('pointerdown', onPointerDown));
      window.removeEventListener('pointermove', onPointerMove);
      window.removeEventListener('pointerup', onPointerUp);
      window.removeEventListener('pointercancel', onPointerUp);
    };
  }, [popout, docked]);

  // Tamanho inicial; depois de aberto o usuario pode redimensionar o painel
  // pelas bordas como uma janela normal de terminal.
  const computeInitialSize = () => ({
    w: Math.max(360, Math.min(920, window.innerWidth - 16)),
    h: Math.max(220, Math.min(619, window.innerHeight - 38 - 16)),
  });

  // aplica o tamanho inicial assim que o painel nasce, encostado na DIREITA da
  // tela (so depois disso o usuario pode arrastar pra organizar) — assim o
  // card do agente que o usuario acabou de clicar (na arvore, sempre mais pra
  // esquerda) continua visivel ao lado do painel, em vez de ficar coberto por
  // um painel centralizado.
  useLayoutEffect(() => {
    // janela destacada: o CSS (.term-panel-popout) ja preenche a janela
    // inteira sozinho — nao precisa (e nao deve) forcar um tamanho/posicao
    // fixo em pixel por cima disso.
    if (popout || docked) return;
    const panel = panelRef.current;
    if (!panel) return;
    const { w, h } = computeInitialSize();
    panel.style.width = `${w}px`;
    panel.style.height = `${h}px`;
    // margem maior que os 16px "padrao" do resto do app (ver Home.css) —
    // colado bem na borda direita ficava dificil de perceber que ainda havia
    // espaco de sobra na tela, tipo uma janela "cortada".
    panel.style.left = `${Math.max(0, window.innerWidth - w - 56)}px`;
    panel.style.top = `${Math.max(38, (window.innerHeight - h) / 2)}px`;
  }, [popout, docked]);

  // Ao redimensionar a janela principal, preserva o tamanho escolhido pelo
  // usuario e apenas limita/reposiciona o painel para ele continuar visivel.
  useEffect(() => {
    if (popout || docked) return;
    const panel = panelRef.current;
    if (!panel) return;
    const onWindowResize = () => {
      if (panel.classList.contains('term-panel-maximized')) return;
      const rect = panel.getBoundingClientRect();
      const w = Math.min(rect.width, Math.max(360, window.innerWidth - 16));
      const h = Math.min(rect.height, Math.max(220, window.innerHeight - 54));
      panel.style.width = `${w}px`;
      panel.style.height = `${h}px`;
      panel.style.left = `${Math.max(0, Math.min(rect.left, window.innerWidth - w))}px`;
      panel.style.top = `${Math.max(38, Math.min(rect.top, window.innerHeight - h))}px`;
    };
    window.addEventListener('resize', onWindowResize);
    return () => window.removeEventListener('resize', onWindowResize);
  }, [popout, docked]);

  const title = useMemo(() => session.name || session.sessionId.slice(0, 8), [session]);

  const focusTerminal = () => termRef.current?.focus();

  return (
    <div
      className={`term-panel${maximized ? ' term-panel-maximized' : ''}${popout ? ' term-panel-popout' : ''}${docked ? ' term-panel-docked' : ''}${docked && !dockedActive ? ' term-panel-docked-inactive' : ''}${settledHidden ? ' term-panel-minimized-hidden' : ''}${geniePhase ? ` term-panel-genie-${geniePhase}` : ''}${session.remoteControl ? ' term-panel-remote' : ''}`}
      style={{ zIndex }}
      ref={panelRef}
      data-session-id={session.sessionId}
      onMouseDownCapture={onFocus}
    >
      <div className={`term-header${IS_LINUX_STYLE ? ' term-header-linux' : ''}`} ref={headerRef}>
        {popout || !IS_MAC_STYLE ? (
          // janela destacada (popout): o proprio SO ja da fechar/minimizar
          // (via PopoutTitleBar em SessionWindow.tsx) — repetir aqui so
          // duplicaria. Fora do mac: fechar/minimizar vao pro lado direito
          // junto do resto dos controles simulados de janela (ver abaixo).
          <div className="term-header-spacer" />
        ) : (
          <div className="term-traffic-lights">
            <button className="term-dot term-dot-close" onClick={onClose} aria-label="Fechar">
              <X size={9} strokeWidth={2.5} />
            </button>
            <button className="term-dot term-dot-min" onClick={onMinimize} aria-label="Minimizar">
              <Minus size={9} strokeWidth={2.5} />
            </button>
            <button className="term-dot term-dot-max" onClick={() => setMaximized((value) => !value)} aria-label={maximized ? 'Restaurar tamanho' : 'Maximizar'} title={maximized ? 'Restaurar tamanho' : 'Maximizar'}>
              {maximized ? <Minimize2 size={9} /> : <Maximize2 size={9} />}
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
            {onPopout && !docked && (
              <button
                className="term-popout-btn"
                onClick={onPopout}
                aria-label="Abrir em janela separada"
                title="Abrir em janela separada"
              >
                <ExternalLink size={12} strokeWidth={2.25} />
              </button>
            )}
            {onToggleDock && (
              <button
                className="term-dock-btn"
                onClick={onToggleDock}
                aria-label={docked ? 'Desafixar terminal' : 'Fixar terminal à direita'}
                title={docked ? 'Desafixar terminal' : 'Fixar terminal à direita'}
              >
                {docked ? <PinOff size={12} strokeWidth={2.25} /> : <Pin size={12} strokeWidth={2.25} />}
              </button>
            )}
            {!IS_MAC_STYLE && (
              <>
                {!docked && <button className="term-win-btn" onClick={onMinimize} aria-label="Minimizar">
                  <Minus size={11} strokeWidth={2.25} />
                </button>}
                {!docked && <button className="term-win-btn" onClick={() => setMaximized((value) => !value)} aria-label={maximized ? 'Restaurar tamanho' : 'Maximizar'}>
                  {maximized ? <Minimize2 size={11} /> : <Maximize2 size={11} />}
                </button>}
                <button className="term-win-btn term-win-btn-close" onClick={onClose} aria-label="Fechar">
                  <X size={11} strokeWidth={2.25} />
                </button>
              </>
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
      {!popout && !docked && ['n', 'e', 's', 'w', 'ne', 'nw', 'se', 'sw'].map((direction) => (
        <div
          key={direction}
          className={`term-resize-edge term-resize-${direction}`}
          data-resize-dir={direction}
          aria-label={`Redimensionar terminal (${direction})`}
        />
      ))}
    </div>
  );
}
