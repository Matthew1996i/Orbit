import { useEffect, useRef, useState } from 'react';
import TitleBar from './TitleBar';
import ActivityBar from './ActivityBar';
import Sidebar from './Sidebar';
import LlmCatalogScreen from './LlmCatalogScreen';
import LlmDetailScreen from './LlmDetailScreen';
import AgentEditScreen from './AgentEditScreen';
import AgentCatalogScreen from './AgentCatalogScreen';
import { readPref, writePref } from '../utils/uiPrefs';
import { loadThemeId, applyTheme } from '../theme/themes';
import { SectionKey } from '../utils/sidebarSections';
import { AgentFileKind } from '../api';
import './AppShell.css';

// primeiro caso do padrao "tela cheia no lugar do conteudo" (substitui
// modal) — a Sidebar dispara, o AppShell troca `.orbit-content` por uma
// dessas telas em vez de renderizar `children` (a pagina normal). Agentes
// (segundo caso, mesmo padrao) reaproveita o AgentEditScreen tanto pra
// criar quanto editar — so muda `isNew`.
type FullScreen =
  | { kind: 'llmCatalog' }
  | { kind: 'llmDetail'; id: string }
  | { kind: 'agentCatalog' }
  | { kind: 'agentEdit'; name: string; fileKind: AgentFileKind; subtitle?: string; isNew?: boolean };

// a qual secao da Activity Bar cada tela cheia "pertence" — usado so pra
// decidir se trocar de secao deve fechar a tela cheia atual (ver
// selectSection): trocar pra uma secao DIFERENTE da dona fecha; ficar na
// mesma secao (ex: clicar noutro agente com a tela de edicao ja aberta)
// nao deveria.
function fullScreenSection(fs: FullScreen | null): SectionKey | null {
  if (!fs) return null;
  if (fs.kind === 'agentCatalog' || fs.kind === 'agentEdit') return 'agents';
  return 'llms';
}

const SIDEBAR_OPEN_KEY = 'dashboard.sidebarOpen';
const SIDEBAR_WIDTH_KEY = 'dashboard.sidebarWidth';
const SIDEBAR_SECTION_KEY = 'dashboard.sidebarActiveSection';
// persiste qual tela cheia esta aberta (catalogo, ou detalhe de qual LLM) —
// sem isso, dar refresh no app (Ctrl+R) sempre voltava pra tela normal,
// mesmo que o usuario estivesse no meio de gerenciar uma LLM.
const FULL_SCREEN_KEY = 'dashboard.fullScreen';

function readFullScreen(): FullScreen | null {
  const raw = readPref(FULL_SCREEN_KEY, '');
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw);
    if (parsed?.kind === 'llmCatalog') return { kind: 'llmCatalog' };
    if (parsed?.kind === 'llmDetail' && typeof parsed.id === 'string') return { kind: 'llmDetail', id: parsed.id };
    if (parsed?.kind === 'agentCatalog') return { kind: 'agentCatalog' };
    if (parsed?.kind === 'agentEdit' && typeof parsed.name === 'string' && typeof parsed.fileKind === 'string') {
      return {
        kind: 'agentEdit',
        name: parsed.name,
        fileKind: parsed.fileKind,
        subtitle: typeof parsed.subtitle === 'string' ? parsed.subtitle : undefined,
        isNew: !!parsed.isNew,
      };
    }
    return null;
  } catch {
    return null;
  }
}
const SIDEBAR_MIN = 200;
const SIDEBAR_MAX = 600;
const SIDEBAR_DEFAULT = 300;
// pequeno atraso pra abrir/fechar o preview de hover — sem o de abertura,
// passar o mouse rapido pelos icones pra chegar em outro lugar fica
// piscando painel a cada icone. sem o de fechamento, mover o cursor do
// botao ate dentro do proprio painel (que fica ao lado, nao embaixo) fecha
// o preview no meio do caminho antes de alcancar o conteudo.
const HOVER_OPEN_DELAY = 120;
const HOVER_CLOSE_DELAY = 200;

interface Props {
  children: React.ReactNode;
}

export default function AppShell({ children }: Props) {
  // aberto/secao-ativa juntos NUM SO estado (nao dois useState separados) —
  // assim o toggle "clicar no icone ja ativo fecha" sempre le os dois valores
  // do MESMO snapshot atomico dentro do updater funcional, sem risco de um
  // dos dois ficar defasado por causa de como os cliques disparam re-render.
  const [sidebar, setSidebar] = useState<{ open: boolean; section: SectionKey | null }>(() => ({
    open: readPref(SIDEBAR_OPEN_KEY, '0') === '1',
    section: (readPref(SIDEBAR_SECTION_KEY, '') as SectionKey) || null,
  }));
  const sidebarOpen = sidebar.open;
  const activeSection = sidebar.section;
  const [sidebarWidth, setSidebarWidth] = useState(() =>
    Math.min(SIDEBAR_MAX, Math.max(SIDEBAR_MIN, Number(readPref(SIDEBAR_WIDTH_KEY, String(SIDEBAR_DEFAULT))) || SIDEBAR_DEFAULT)),
  );
  const [themeId, setThemeId] = useState(() => loadThemeId());
  const [resizing, setResizing] = useState(false);
  const [fullScreen, setFullScreenState] = useState<FullScreen | null>(() => readFullScreen());
  const setFullScreen = (next: FullScreen | null) => {
    setFullScreenState(next);
    writePref(FULL_SCREEN_KEY, next ? JSON.stringify(next) : '');
  };

  // dispara tanto da sidebar fixada quanto do preview de hover — em ambos os
  // casos a tela cheia toma o lugar do conteudo principal, entao o painel da
  // sidebar (fixado ou preview) fecha, dando o espaço todo pra tela.
  const dismissSidebar = () => {
    clearHoverTimers();
    setHoverSection(null);
    setSidebar((cur) => ({ ...cur, open: false }));
    writePref(SIDEBAR_OPEN_KEY, '0');
  };
  const openLlmCatalog = () => {
    dismissSidebar();
    setFullScreen({ kind: 'llmCatalog' });
  };
  const openLlmDetail = (id: string) => {
    dismissSidebar();
    setFullScreen({ kind: 'llmDetail', id });
  };
  const openAgentCatalog = () => {
    dismissSidebar();
    setFullScreen({ kind: 'agentCatalog' });
  };
  const openAgentEdit = (name: string, fileKind: AgentFileKind, subtitle?: string, isNew?: boolean) => {
    dismissSidebar();
    setFullScreen({ kind: 'agentEdit', name, fileKind, subtitle, isNew });
  };
  const closeFullScreen = () => setFullScreen(null);
  // botao fixo "Inicio" na Activity Bar — unica saida de QUALQUER tela cheia
  // que nao depende de achar o botao "Voltar" de dentro da propria tela.
  const goHome = () => setFullScreen(null);

  // preview de hover: sobreposto ao conteudo, nao mexe no estado fixado
  // (sidebar/section) acima — some quando o mouse sai, sem gravar prefs.
  const [hoverSection, setHoverSection] = useState<SectionKey | null>(null);
  const hoverOpenTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const hoverCloseTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const activityBarWrapRef = useRef<HTMLDivElement>(null);
  const previewRef = useRef<HTMLDivElement>(null);

  const clearHoverTimers = () => {
    if (hoverOpenTimer.current) clearTimeout(hoverOpenTimer.current);
    if (hoverCloseTimer.current) clearTimeout(hoverCloseTimer.current);
    hoverOpenTimer.current = null;
    hoverCloseTimer.current = null;
  };

  const handleHoverSection = (key: SectionKey) => {
    clearHoverTimers();
    // ja fixado nessa secao: nao ha o que sobrepor.
    if (sidebarOpen && activeSection === key) return;
    // preview ja aberto (passando de um icone pro outro dentro da barra) —
    // troca na hora, sem o atraso de abertura (esse e so pra abrir do zero).
    if (hoverSection !== null) {
      setHoverSection(key);
      return;
    }
    hoverOpenTimer.current = setTimeout(() => setHoverSection(key), HOVER_OPEN_DELAY);
  };

  const handleHoverSectionEnd = () => {
    if (hoverOpenTimer.current) clearTimeout(hoverOpenTimer.current);
    hoverOpenTimer.current = null;
    hoverCloseTimer.current = setTimeout(() => setHoverSection(null), HOVER_CLOSE_DELAY);
  };

  const handlePreviewPointerEnter = () => {
    if (hoverCloseTimer.current) clearTimeout(hoverCloseTimer.current);
    hoverCloseTimer.current = null;
  };

  const handlePreviewPointerLeave = () => {
    hoverCloseTimer.current = setTimeout(() => setHoverSection(null), HOVER_CLOSE_DELAY);
  };

  useEffect(() => clearHoverTimers, []);

  // rede de seguranca: um clique dentro do preview (ex: "novo provedor de
  // IA") pode abrir um modal SEM o mouse se mover — o navegador so reavalia
  // mouseenter/mouseleave em resposta a movimento real do ponteiro, entao um
  // elemento novo (o modal) aparecendo por baixo do cursor parado nao dispara
  // o mouseleave do preview, que fica preso aberto/"congelado" atras do
  // modal pra sempre. Clicar em QUALQUER lugar fora da barra e do preview
  // (o proprio modal incluso) fecha na hora, sem depender de hover.
  useEffect(() => {
    if (!hoverSection) return;
    const onPointerDown = (e: PointerEvent) => {
      const target = e.target as Node;
      if (activityBarWrapRef.current?.contains(target)) return;
      if (previewRef.current?.contains(target)) return;
      clearHoverTimers();
      setHoverSection(null);
    };
    document.addEventListener('pointerdown', onPointerDown);
    return () => document.removeEventListener('pointerdown', onPointerDown);
  }, [hoverSection]);

  // expande (mostra os labels) tanto fixada quanto em preview de hover — a
  // largura REAL reservada no flex (que empurra o orbit-content) so muda
  // quando FIXADA (ver activityBarRealWidth abaixo); no hover a barra
  // cresce apenas VISUALMENTE, via position:absolute (ver .orbit-activitybar
  // no CSS), exatamente como o proprio preview da Sidebar ja faz — por cima
  // do conteudo, sem empurrar nada.
  const activityBarExpanded = sidebarOpen || hoverSection !== null;
  const activityBarRealWidth = sidebarOpen ? 208 : 48;

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

  // largura REAL (fixada, nunca hover) ocupada por Activity Bar + Sidebar —
  // exposta como variavel global no <html> pra elementos fora dessa arvore
  // (ex: o subheader de terminais minimizados em Home.tsx, que e portado pro
  // <body>) saberem onde o conteudo principal comeca. So reage a fixar/
  // desfixar e redimensionar a Sidebar — NAO ao hover, senao o subheader
  // ficava "empurrando"/pulando de posicao so de passar o mouse na Sidebar.
  // O preview de hover (que so aparece por cima, sem reservar espaco) fica
  // com z-index MAIOR que o subheader (ver AppShell.css/Home.css) — entao
  // quando ele estiver aberto, cobre visualmente o pedaco do subheader por
  // baixo dele em vez de precisar deslocar o subheader inteiro.
  useEffect(() => {
    const total = activityBarRealWidth + (sidebarOpen ? sidebarWidth : 0);
    document.documentElement.style.setProperty('--orbit-content-left', `${total}px`);
  }, [sidebarOpen, sidebarWidth, activityBarRealWidth]);

  // cada icone da Activity Bar = uma secao da Sidebar (ver sidebarSections.ts).
  // Clicar no icone da secao JA ATIVA fecha o painel (mesmo gesto de toggle
  // de antes); clicar em outro icone troca a secao e garante o painel aberto.
  const selectSection = (key: SectionKey) => {
    clearHoverTimers();
    setHoverSection(null);
    // trocar pra uma secao diferente da "dona" da tela cheia atual (ver
    // fullScreenSection) fecha ela — senao o conteudo principal ficava
    // preso nela mesmo navegando pra outra secao da Activity Bar. Ficar na
    // mesma secao (ex: clicar em "Agentes" de novo com a tela de edicao ja
    // aberta) nao fecha.
    if (fullScreenSection(fullScreen) !== null && key !== fullScreenSection(fullScreen)) setFullScreen(null);
    setSidebar((cur) => {
      const open = !(cur.open && cur.section === key);
      writePref(SIDEBAR_OPEN_KEY, open ? '1' : '0');
      writePref(SIDEBAR_SECTION_KEY, key);
      return { open, section: key };
    });
  };

  const closeSidebar = () => {
    setSidebar((cur) => ({ ...cur, open: false }));
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
      <TitleBar />
      <div
        className="orbit-shell"
        style={{ '--orbit-activitybar-w': activityBarExpanded ? '208px' : '48px' } as React.CSSProperties}
      >
        <div
          ref={activityBarWrapRef}
          className="orbit-activitybar-slot"
          style={{ width: activityBarRealWidth }}
        >
          <ActivityBar
            activeSection={activeSection}
            sidebarOpen={sidebarOpen}
            expanded={activityBarExpanded}
            onSelectSection={selectSection}
            onHoverSection={handleHoverSection}
            onHoverSectionEnd={handleHoverSectionEnd}
            themeId={themeId}
            onSelectTheme={setThemeId}
            onGoHome={goHome}
            isHome={!fullScreen}
          />
        </div>
        {sidebarOpen && (
          <div className="orbit-sidebar" style={{ width: sidebarWidth }}>
            <Sidebar
              activeSection={activeSection}
              onClose={closeSidebar}
              onOpenLlmCatalog={openLlmCatalog}
              onOpenLlmDetail={openLlmDetail}
              onOpenAgentEdit={openAgentEdit}
              onOpenAgentCatalog={openAgentCatalog}
            />
            <div
              className={`orbit-sash${resizing ? ' dragging' : ''}`}
              onPointerDown={onSashPointerDown}
            />
          </div>
        )}
        {hoverSection && (
          <div
            ref={previewRef}
            className="orbit-sidebar-preview"
            style={{ width: sidebarWidth }}
            onMouseEnter={handlePreviewPointerEnter}
            onMouseLeave={handlePreviewPointerLeave}
          >
            <Sidebar
              activeSection={hoverSection}
              onClose={() => setHoverSection(null)}
              onOpenLlmCatalog={openLlmCatalog}
              onOpenLlmDetail={openLlmDetail}
              onOpenAgentEdit={openAgentEdit}
              onOpenAgentCatalog={openAgentCatalog}
            />
          </div>
        )}
        <div className="orbit-content">
          {fullScreen?.kind === 'llmCatalog' ? (
            <LlmCatalogScreen onBack={closeFullScreen} />
          ) : fullScreen?.kind === 'llmDetail' ? (
            <LlmDetailScreen id={fullScreen.id} onBack={closeFullScreen} />
          ) : fullScreen?.kind === 'agentCatalog' ? (
            <AgentCatalogScreen
              onBack={closeFullScreen}
              onOpenAgent={(name, subtitle) => openAgentEdit(name, 'agent', subtitle)}
              onCreateAgent={() => openAgentEdit('', 'agent', undefined, true)}
            />
          ) : fullScreen?.kind === 'agentEdit' ? (
            <AgentEditScreen
              name={fullScreen.name}
              subtitle={fullScreen.subtitle}
              kind={fullScreen.fileKind}
              isNew={fullScreen.isNew}
              onBack={openAgentCatalog}
            />
          ) : (
            children
          )}
        </div>
      </div>
    </>
  );
}
