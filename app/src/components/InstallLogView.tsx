import { useEffect, useRef } from 'react';
import { Terminal } from '@xterm/xterm';
import { FitAddon } from '@xterm/addon-fit';
import '@xterm/xterm/css/xterm.css';
import { BACKEND_WS } from '../api';

interface Props {
  agentId: string;
  onDone: () => void;
}

// log ao vivo de um comando de instalacao (npm install -g, curl | bash etc)
// ENCADEADO com o login da CLI — reaproveita o mesmo xterm.js + WS que o
// TerminalPanel usa pra agentes normais. Precisa aceitar digitacao (nao é só
// log passivo): o login de varias CLIs abre um prompt interativo de verdade
// (ex: "Do you trust this folder?" do Gemini CLI, escolha com setas/Enter),
// e sem stdin habilitado o usuario fica travado sem conseguir responder.
export default function InstallLogView({ agentId, onDone }: Props) {
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
    fit.fit();
    term.focus();
    termRef.current = term;

    const ws = new WebSocket(`${BACKEND_WS}/ws/agent/${agentId}`);
    ws.binaryType = 'arraybuffer';
    ws.onmessage = (ev) => term.write(new Uint8Array(ev.data as ArrayBuffer));
    const sendResize = () => {
      if (ws.readyState === WebSocket.OPEN) {
        ws.send(JSON.stringify({ type: 'resize', rows: term.rows, cols: term.cols }));
      }
    };
    ws.onopen = sendResize;
    ws.onclose = () => onDone();
    term.onData((data) => {
      if (ws.readyState === WebSocket.OPEN) ws.send(new TextEncoder().encode(data));
    });

    const ro = new ResizeObserver(() => {
      fit.fit();
      sendResize();
    });
    ro.observe(el);

    return () => {
      ro.disconnect();
      ws.close();
      term.dispose();
      termRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [agentId]);

  return <div className="install-log-body" ref={bodyRef} onMouseDown={() => termRef.current?.focus()} />;
}
