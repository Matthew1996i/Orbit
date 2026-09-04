import { useEffect, useRef } from 'react';
import { Terminal } from '@xterm/xterm';
import { FitAddon } from '@xterm/addon-fit';
import '@xterm/xterm/css/xterm.css';
import { BACKEND_WS } from '../api';
import './InstallLogView.css';

interface Props {
  agentId: string;
  onDone: () => void;
  // algumas CLIs (Gemini, Qwen Code, Antigravity, Copilot — ver
  // utils/llmAutopilot.ts) mostram um menu interativo (setas + Enter) ANTES
  // de abrir o navegador pra autenticar. Como o fluxo de conectar da LLM
  // nunca mostra terminal nenhum pro usuario (pedido explicito), essas
  // ficariam presas esperando uma tecla que ninguem consegue apertar — com
  // autopilot=true, este componente manda Enter sozinho a cada pausa na
  // saida, avancando pela opcao padrao/destacada do menu (normalmente a
  // recomendada) ate a CLI abrir o navegador ou o processo terminar.
  autopilot?: boolean;
}

// log ao vivo de um comando de instalacao (npm install -g, curl | bash etc)
// ENCADEADO com o login da CLI — reaproveita o mesmo xterm.js + WS que o
// TerminalPanel usa pra agentes normais. Precisa aceitar digitacao (nao é só
// log passivo): o login de varias CLIs abre um prompt interativo de verdade
// (ex: "Do you trust this folder?" do Gemini CLI, escolha com setas/Enter),
// e sem stdin habilitado o usuario fica travado sem conseguir responder.
export default function InstallLogView({ agentId, onDone, autopilot }: Props) {
  const bodyRef = useRef<HTMLDivElement>(null);
  const termRef = useRef<Terminal | null>(null);

  useEffect(() => {
    const el = bodyRef.current;
    if (!el) return;
    const term = new Terminal({
      convertEol: false,
      disableStdin: false,
      cursorBlink: true,
      fontSize: 12,
      scrollback: 3000,
      theme: { background: '#0d0d0f', foreground: '#d4d4d4', cursor: '#d4d4d4' },
      fontFamily: 'ui-monospace, SFMono-Regular, Menlo, Consolas, monospace',
    });
    const fit = new FitAddon();
    term.loadAddon(fit);
    term.open(el);
    // se o container estiver com tamanho zero/quase-zero (ex: escondido de
    // proposito fora da tela num flow sem log visivel), fit() pode lancar —
    // sem o try/catch isso abortava o effect inteiro ANTES de abrir o
    // WebSocket, entao o comando real (login/logout) nunca chegava a rodar.
    try {
      fit.fit();
    } catch {
      // segue com as dimensoes padrao do Terminal — nao e critico aqui.
    }
    term.focus();
    termRef.current = term;

    const ws = new WebSocket(`${BACKEND_WS}/ws/agent/${agentId}`);
    ws.binaryType = 'arraybuffer';

    // autopilot: a cada pausa de ~900ms na saida (a CLI parou de imprimir,
    // sinal de que esta esperando uma tecla), manda Enter sozinho — aceita
    // a opcao padrao/destacada do menu. Um teto de tentativas evita loop
    // infinito se o processo estiver travado por outro motivo (ex: erro de
    // rede) em vez de so esperando input.
    let autopilotTimer: ReturnType<typeof setTimeout> | null = null;
    let autopilotAttempts = 0;
    const MAX_AUTOPILOT_ATTEMPTS = 6;
    const scheduleAutopilot = () => {
      if (!autopilot) return;
      if (autopilotTimer) clearTimeout(autopilotTimer);
      if (autopilotAttempts >= MAX_AUTOPILOT_ATTEMPTS) return;
      autopilotTimer = setTimeout(() => {
        if (ws.readyState !== WebSocket.OPEN) return;
        autopilotAttempts += 1;
        ws.send(new TextEncoder().encode('\r'));
      }, 900);
    };

    ws.onmessage = (ev) => {
      term.write(new Uint8Array(ev.data as ArrayBuffer));
      scheduleAutopilot();
    };
    const sendResize = () => {
      if (ws.readyState === WebSocket.OPEN) {
        ws.send(JSON.stringify({ type: 'resize', rows: term.rows, cols: term.cols }));
      }
    };
    ws.onopen = () => {
      sendResize();
      scheduleAutopilot();
    };
    ws.onclose = () => {
      if (autopilotTimer) clearTimeout(autopilotTimer);
      onDone();
    };
    term.onData((data) => {
      if (ws.readyState === WebSocket.OPEN) ws.send(new TextEncoder().encode(data));
    });

    const ro = new ResizeObserver(() => {
      try {
        fit.fit();
      } catch {
        // ver comentario acima — nao critico.
      }
      sendResize();
    });
    ro.observe(el);

    return () => {
      if (autopilotTimer) clearTimeout(autopilotTimer);
      ro.disconnect();
      ws.close();
      term.dispose();
      termRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [agentId, autopilot]);

  return <div className="install-log-body" ref={bodyRef} onMouseDown={() => termRef.current?.focus()} />;
}
