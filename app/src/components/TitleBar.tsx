import { useState } from 'react';
import { createPortal } from 'react-dom';
import { Minus, Square, Copy, X } from 'lucide-react';
import { getOsPlatform } from '../utils/platform';
import './TitleBar.css';

export default function TitleBar() {
  const [maximized, setMaximized] = useState(false);
  // no macOS a janela usa titleBarStyle:'hiddenInset' (ver setup.ts) — os
  // semaforos de fechar/minimizar/maximizar sao os NATIVOS do SO, entao os
  // nossos (desenhados em React) nao devem ser desenhados, senao ficariam
  // duplicados. No Linux/Windows continuam simulados em React (a janela e
  // frame:false), so muda o ESTILO — circular (GNOME) vs quadrado (Windows),
  // ver TitleBar.css.
  const platform = getOsPlatform();
  const isMac = platform === 'mac';

  const toggleMaximize = async () => {
    if (!window.dashboardAPI) return;
    const isMax = await window.dashboardAPI.windowToggleMaximize();
    setMaximized(isMax);
  };

  return createPortal(
    <div className={`title-bar ${platform}`}>
      <span className="title-bar-name">Orbit</span>

      {!isMac && (
        <div className="title-bar-window-controls">
          <button
            className="title-bar-btn"
            onClick={() => window.dashboardAPI?.windowMinimize()}
            aria-label="Minimizar"
          >
            <Minus size={14} />
          </button>
          <button className="title-bar-btn" onClick={toggleMaximize} aria-label="Maximizar">
            {maximized ? <Copy size={12} /> : <Square size={12} />}
          </button>
          <button
            className="title-bar-btn title-bar-btn-close"
            onClick={() => window.dashboardAPI?.windowClose()}
            aria-label="Fechar"
          >
            <X size={14} />
          </button>
        </div>
      )}
    </div>,
    document.body
  );
}
