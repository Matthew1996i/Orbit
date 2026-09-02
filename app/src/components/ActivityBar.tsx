import { useState } from 'react';
import { PanelLeft, Settings, Check } from 'lucide-react';
import ContextMenu, { ContextMenuItem } from './ContextMenu';
import { THEMES } from '../theme/themes';
import './ActivityBar.css';

interface Props {
  sidebarOpen: boolean;
  onToggleSidebar: () => void;
  themeId: string;
  onSelectTheme: (id: string) => void;
}

export default function ActivityBar({ sidebarOpen, onToggleSidebar, themeId, onSelectTheme }: Props) {
  const [themeMenuAnchor, setThemeMenuAnchor] = useState<{ x: number; y: number } | null>(null);

  const openThemeMenu = (e: React.MouseEvent) => {
    const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
    setThemeMenuAnchor({ x: rect.right + 4, y: rect.top });
  };

  const themeItems: ContextMenuItem[] = THEMES.map((t) => ({
    label: t.label,
    icon: t.id === themeId ? <Check size={14} /> : <span style={{ width: 14, display: 'inline-block' }} />,
    onClick: () => onSelectTheme(t.id),
  }));

  return (
    <div className="orbit-activitybar">
      <button
        className={`orbit-activitybar-btn${sidebarOpen ? ' active' : ''}`}
        onClick={onToggleSidebar}
        aria-label="Recursos disponíveis"
        title="LLMs, agentes, skills, tools e MCPs"
      >
        <PanelLeft size={22} />
      </button>

      <button
        className={`orbit-activitybar-btn orbit-activitybar-btn-footer${themeMenuAnchor ? ' active' : ''}`}
        onClick={openThemeMenu}
        aria-label="Selecionar tema"
        title="Tema de cores"
      >
        <Settings size={22} />
      </button>

      {themeMenuAnchor && (
        <ContextMenu
          x={themeMenuAnchor.x}
          y={themeMenuAnchor.y}
          items={themeItems}
          onClose={() => setThemeMenuAnchor(null)}
        />
      )}
    </div>
  );
}
