import { useState } from 'react';
import { createPortal } from 'react-dom';
import { Menu, Minus, Square, Copy, X, RotateCw, Info, PanelLeft } from 'lucide-react';
import ContextMenu, { ContextMenuItem } from './ContextMenu';
import ConfirmDialog from './ConfirmDialog';
import Sidebar from './Sidebar';
import './TitleBar.css';

interface Props {
  stats?: React.ReactNode;
}

export default function TitleBar({ stats }: Props) {
  const [menuAnchor, setMenuAnchor] = useState<{ x: number; y: number } | null>(null);
  const [maximized, setMaximized] = useState(false);
  const [showAbout, setShowAbout] = useState(false);
  const [version, setVersion] = useState('');
  const [showSidebar, setShowSidebar] = useState(false);

  const openMenu = (e: React.MouseEvent) => {
    const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
    setMenuAnchor({ x: rect.left, y: rect.bottom + 4 });
  };

  const toggleMaximize = async () => {
    if (!window.dashboardAPI) return;
    const isMax = await window.dashboardAPI.windowToggleMaximize();
    setMaximized(isMax);
  };

  const menuItems: ContextMenuItem[] = [
    {
      label: 'Recarregar',
      icon: <RotateCw size={14} />,
      onClick: () => window.dashboardAPI?.reloadApp(),
    },
    {
      label: 'Sobre',
      icon: <Info size={14} />,
      onClick: async () => {
        const v = (await window.dashboardAPI?.getAppVersion()) || '';
        setVersion(v);
        setShowAbout(true);
      },
    },
    {
      label: 'Sair',
      icon: <X size={14} />,
      danger: true,
      onClick: () => window.dashboardAPI?.quitApp(),
    },
  ];

  return createPortal(
    <div className="title-bar">
      <div className="title-bar-drag">
        <button className="title-bar-btn title-bar-menu-btn" onClick={openMenu} aria-label="Menu">
          <Menu size={15} />
        </button>
        <button
          className="title-bar-btn title-bar-menu-btn"
          onClick={() => setShowSidebar((v) => !v)}
          aria-label="Recursos disponíveis"
          title="LLMs, agentes, skills, tools e MCPs"
        >
          <PanelLeft size={15} color="#ffffff" />
        </button>
        <span className="title-bar-name">Orbit</span>
      </div>

      {stats && <div className="title-bar-stats">{stats}</div>}

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

      {menuAnchor && (
        <ContextMenu x={menuAnchor.x} y={menuAnchor.y} items={menuItems} onClose={() => setMenuAnchor(null)} />
      )}

      <ConfirmDialog
        open={showAbout}
        title="Orbit"
        message={`Dashboard de sessões do Claude Code.\n\nVersão: ${version || '—'}`}
        singleButton
        confirmText="OK"
        onConfirm={() => setShowAbout(false)}
        onCancel={() => setShowAbout(false)}
      />

      <Sidebar open={showSidebar} onClose={() => setShowSidebar(false)} />
    </div>,
    document.body
  );
}
