import { useEffect, useRef, useState } from 'react';
import TitleBar from './TitleBar';
import ActivityBar from './ActivityBar';
import Sidebar from './Sidebar';
import { readPref, writePref } from '../utils/uiPrefs';
import { loadThemeId, applyTheme } from '../theme/themes';
import { SectionKey } from '../utils/sidebarSections';
import './AppShell.css';

const SIDEBAR_OPEN_KEY = 'dashboard.sidebarOpen';
const SIDEBAR_WIDTH_KEY = 'dashboard.sidebarWidth';
const SIDEBAR_SECTION_KEY = 'dashboard.sidebarActiveSection';
const SIDEBAR_MIN = 200;
const SIDEBAR_MAX = 600;
const SIDEBAR_DEFAULT = 300;

interface Props {
  stats?: React.ReactNode;
  children: React.ReactNode;
}

export default function AppShell({ stats, children }: Props) {
  const [sidebarOpen, setSidebarOpen] = useState(() => readPref(SIDEBAR_OPEN_KEY, '0') === '1');
  const [sidebarWidth, setSidebarWidth] = useState(() =>
    Math.min(SIDEBAR_MAX, Math.max(SIDEBAR_MIN, Number(readPref(SIDEBAR_WIDTH_KEY, String(SIDEBAR_DEFAULT))) || SIDEBAR_DEFAULT)),
  );
  const [themeId, setThemeId] = useState(() => loadThemeId());
  const [resizing, setResizing] = useState(false);
  const [activeSection, setActiveSection] = useState<SectionKey | null>(() => {
    const saved = readPref(SIDEBAR_SECTION_KEY, '');
    return (saved as SectionKey) || null;
  });

  // evita stale closure no listener de pointerup, que le o valor MAIS RECENTE
  // pra gravar — sem isso o handler capturava o `sidebarWidth` do momento em
  // que o arraste comecou, nao o final.
  const sidebarWidthRef = useRef(sidebarWidth);
  useEffect(() => {
    sidebarWidthRef.current = sidebarWidth;
  }, [sidebarWidth]);

  useEffect(() => {
    applyTheme(themeId);
  }, [themeId]);

  // cada icone da Activity Bar = uma secao da Sidebar (ver sidebarSections.ts).
  // Clicar no icone da secao JA ATIVA fecha o painel (mesmo gesto de toggle
  // de antes); clicar em outro icone troca a secao e garante o painel aberto.
  const selectSection = (key: SectionKey) => {
    setSidebarOpen((curOpen) => {
      const next = !(curOpen && activeSection === key);
      writePref(SIDEBAR_OPEN_KEY, next ? '1' : '0');
      return next;
    });
    setActiveSection(key);
    writePref(SIDEBAR_SECTION_KEY, key);
  };

  const closeSidebar = () => {
    setSidebarOpen(false);
    writePref(SIDEBAR_OPEN_KEY, '0');
  };

  const onSashPointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    e.preventDefault();
    const startX = e.clientX;
    const startW = sidebarWidth;
    const el = e.currentTarget;
    el.setPointerCapture(e.pointerId);
    setResizing(true);
    document.body.classList.add('orbit-resizing');

    const move = (ev: PointerEvent) => {
      const w = Math.min(SIDEBAR_MAX, Math.max(SIDEBAR_MIN, startW + (ev.clientX - startX)));
      setSidebarWidth(w);
    };
    const up = () => {
      el.removeEventListener('pointermove', move);
      el.removeEventListener('pointerup', up);
      document.body.classList.remove('orbit-resizing');
      setResizing(false);
      writePref(SIDEBAR_WIDTH_KEY, String(sidebarWidthRef.current));
    };
    el.addEventListener('pointermove', move);
    el.addEventListener('pointerup', up);
  };

  return (
    <>
      <TitleBar stats={stats} />
      <div className="orbit-shell">
        <ActivityBar
          activeSection={activeSection}
          sidebarOpen={sidebarOpen}
          onSelectSection={selectSection}
          themeId={themeId}
          onSelectTheme={setThemeId}
        />
        {sidebarOpen && (
          <div className="orbit-sidebar" style={{ width: sidebarWidth }}>
            <Sidebar activeSection={activeSection} onClose={closeSidebar} />
            <div
              className={`orbit-sash${resizing ? ' dragging' : ''}`}
              onPointerDown={onSashPointerDown}
            />
          </div>
        )}
        <div className="orbit-content">{children}</div>
      </div>
    </>
  );
}
