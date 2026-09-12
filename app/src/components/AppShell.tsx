import { useEffect, useRef, useState } from 'react';
import TitleBar from './TitleBar';
import ActivityBar from './ActivityBar';
import Sidebar from './Sidebar';
import LlmCatalogScreen from './LlmCatalogScreen';
import LlmDetailScreen from './LlmDetailScreen';
import AgentEditScreen from './AgentEditScreen';
import AgentCatalogScreen from './AgentCatalogScreen';
import SkillCatalogScreen from './SkillCatalogScreen';
import CommandCatalogScreen from './CommandCatalogScreen';
import McpCatalogScreen from './McpCatalogScreen';
import McpEditScreen from './McpEditScreen';
import McpPresetCatalogScreen from './McpPresetCatalogScreen';
import SecretsCatalogScreen from './SecretsCatalogScreen';
import AiProvidersCatalogScreen from './AiProvidersCatalogScreen';
import SecretsModal from './SecretsModal';
import AiProviderModal from './AiProviderModal';
import { AiProvider, McpDef, SecretGroup, SessionInfo } from '../api';
import { readPref, writePref } from '../utils/uiPrefs';
import { SectionKey } from '../utils/sidebarSections';
import { AgentFileKind } from '../api';
import './AppShell.css';
import ToolsCatalogScreen from './ToolsCatalogScreen';
import ToolsEditScreen from './ToolsEditScreen';

// primeiro caso do padrao "tela cheia no lugar do conteudo" (substitui
// modal) — a Sidebar dispara, o AppShell troca `.orbit-content` por uma
// dessas telas em vez de renderizar `children` (a pagina normal). Agentes
// (segundo caso, mesmo padrao) reaproveita o AgentEditScreen tanto pra
// criar quanto editar — so muda `isNew`.
type FullScreen =
  | { kind: 'llmCatalog' }
  | { kind: 'llmDetail'; id: string }
  | { kind: 'agentCatalog' }
  | { kind: 'skillCatalog' }
  | { kind: 'commandCatalog' }
  | { kind: 'toolsCatalog' }
  | { kind: 'toolsEdit'; tool: import('../api').ToolDef; allTools: import('../api').ToolDef[] }
  | { kind: 'mcpCatalog' }
  | { kind: 'mcpPresetCatalog' }
  | { kind: 'mcpEdit'; mcp?: McpDef; draft?: { name: string; config: Record<string, unknown> } }
  | { kind: 'secretsCatalog' }
  | { kind: 'aiProvidersCatalog' }
  | { kind: 'secretEdit'; group?: SecretGroup }
  | { kind: 'aiProviderEdit'; provider?: AiProvider }
  | { kind: 'agentEdit'; name: string; fileKind: AgentFileKind; subtitle?: string; isNew?: boolean };

// a qual secao da Activity Bar cada tela cheia "pertence" — usado so pra
// decidir se trocar de secao deve fechar a tela cheia atual (ver
// selectSection): trocar pra uma secao DIFERENTE da dona fecha; ficar na
// mesma secao (ex: clicar noutro agente com a tela de edicao ja aberta)
// nao deveria. `agentEdit` reusa a MESMA tela pra agent/skill/command (ver
// AgentEditScreen), entao a secao dona depende do `fileKind` guardado nesse
// estado, nao de um kind de tela cheia separado por dominio.
function fullScreenSection(fs: FullScreen | null): SectionKey | null {
  if (!fs) return null;
  if (fs.kind === 'agentCatalog') return 'agents';
  if (fs.kind === 'skillCatalog') return 'skills';
  if (fs.kind === 'commandCatalog') return 'commands';
  if (fs.kind === 'toolsCatalog') return 'tools';
  if (fs.kind === 'toolsEdit') return 'tools';
  if (fs.kind === 'mcpCatalog' || fs.kind === 'mcpPresetCatalog' || fs.kind === 'mcpEdit') return 'mcps';
  if (fs.kind === 'secretsCatalog') return 'secrets';
  if (fs.kind === 'aiProvidersCatalog') return 'aiProviders';
  if (fs.kind === 'secretEdit') return 'secrets';
  if (fs.kind === 'aiProviderEdit') return 'aiProviders';
  if (fs.kind === 'agentEdit') {
    if (fs.fileKind === 'skill') return 'skills';
    if (fs.fileKind === 'command') return 'commands';
    return 'agents';
  }
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
    if (parsed?.kind === 'skillCatalog') return { kind: 'skillCatalog' };
    if (parsed?.kind === 'commandCatalog') return { kind: 'commandCatalog' };
    if (parsed?.kind === 'mcpCatalog') return { kind: 'mcpCatalog' };
    if (parsed?.kind === 'mcpPresetCatalog') return { kind: 'mcpPresetCatalog' };
    if (parsed?.kind === 'secretsCatalog') return { kind: 'secretsCatalog' };
    if (parsed?.kind === 'aiProvidersCatalog') return { kind: 'aiProvidersCatalog' };
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
  sessions: SessionInfo[];
  onOpenSession: (session: SessionInfo) => void;
}

export default function AppShell({ children, sessions, onOpenSession }: Props) {
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
  const [sidebarsPinned, setSidebarsPinned] = useState(false);
  const settingsMenuOpenRef = useRef(false);
  const [resizing, setResizing] = useState(false);
  const [fullScreen, setFullScreenState] = useState<FullScreen | null>(() => readFullScreen());
  const setFullScreen = (next: FullScreen | null) => {
    setFullScreenState(next);
    writePref(FULL_SCREEN_KEY, next ? JSON.stringify(next) : '');
  };

  // Abrir uma tela cheia NAO fecha os paineis laterais — nem o preview de
  // hover (some sozinho ao tirar o mouse) nem a sidebar fixada (pedido
  // explicito: clicar num item do side/subside nao pode recolher nada).
  const openLlmCatalog = () => {
    setFullScreen({ kind: 'llmCatalog' });
  };
  const openLlmDetail = (id: string) => {
    setFullScreen({ kind: 'llmDetail', id });
  };
  const openAgentCatalog = () => {
    setFullScreen({ kind: 'agentCatalog' });
  };
  const openAgentEdit = (name: string, fileKind: AgentFileKind, subtitle?: string, isNew?: boolean) => {
    setFullScreen({ kind: 'agentEdit', name, fileKind, subtitle, isNew });
  };
  const openSkillCatalog = () => {
    setFullScreen({ kind: 'skillCatalog' });
  };
  const openCommandCatalog = () => {
    setFullScreen({ kind: 'commandCatalog' });
  };
  const openToolsCatalog = () => {
    setFullScreen({ kind: 'toolsCatalog' });
  };
  const openToolsEdit = (tool: import('../api').ToolDef, allTools: import('../api').ToolDef[]) => {
    setFullScreen({ kind: 'toolsEdit', tool, allTools });
  };
  // reusa a MESMA tela de edicao de agente (kind='skill'), nao existe um
  // "skillEdit" separado — ver comentario no tipo FullScreen acima.
  const openSkillEdit = (name: string, subtitle?: string, isNew?: boolean) =>
    openAgentEdit(name, 'skill', subtitle, isNew);
  const openCommandEdit = (name: string, subtitle?: string, isNew?: boolean) =>
    openAgentEdit(name, 'command', subtitle, isNew);
  const openMcpCatalog = () => {
    setFullScreen({ kind: 'mcpCatalog' });
  };
  const openMcpPresetCatalog = () => {
    setFullScreen({ kind: 'mcpPresetCatalog' });
  };
  const openMcpEdit = (mcp?: McpDef, draft?: { name: string; config: Record<string, unknown> }) => {
    setFullScreen({ kind: 'mcpEdit', mcp, draft });
  };
  const openSecretsCatalog = () => {
    setFullScreen({ kind: 'secretsCatalog' });
  };
  const openAiProvidersCatalog = () => {
    setFullScreen({ kind: 'aiProvidersCatalog' });
  };
  const openSecretEdit = (group?: SecretGroup) => {
    setFullScreen({ kind: 'secretEdit', group });
  };
  const openAiProviderEdit = (provider?: AiProvider) => {
    setFullScreen({ kind: 'aiProviderEdit', provider });
  };
  const closeFullScreen = () => setFullScreen(null);
  // botao fixo "Inicio" na Activity Bar — unica saida de QUALQUER tela cheia
  // que nao depende de achar o botao "Voltar" de dentro da propria tela.
  const goHome = () => {
    selectSection('sessions');
  };

  // preview de hover: sobreposto ao conteudo, nao mexe no estado fixado
  // (sidebar/section) acima — some quando o mouse sai, sem gravar prefs.
  const [hoverSection, setHoverSection] = useState<SectionKey | null>(null);
  // true sempre que o mouse estiver sobre QUALQUER parte da ActivityBar —
  // icone de secao, "Inicio", Configuracoes, Fixar, ou ate um vao sem botao
  // — so pra decidir a largura visual dela (labels aparecendo).
  // Deliberadamente SEPARADO de `hoverSection` (que so guarda a secao do
  // PREVIEW de conteudo, e fica null quando o item hovado ja e a secao
  // fixada/ativa, ou quando o alvo nao tem secao nenhuma — Configuracoes,
  // Fixar, vaos vazios — pra nao abrir/trocar preview indevidamente). Sem
  // essa segunda fonte, a largura tambem dependia so de `hoverSection`, e
  // isso quebrava dois casos: (1) passar o mouse sobre o proprio item ja
  // ativo zerava `hoverSection` na hora e colapsava a barra NO MEIO do
  // hover, com o rotulo "fugindo" de baixo do cursor; (2) passar o mouse
  // sobre Configuracoes/Fixar/um vao nunca setava `hoverSection` (nao tem
  // secao pra abrir preview), entao a barra simplesmente nunca expandia
  // ali, dando a impressao de que o hover "nao funciona" nesses botoes.
  // Com `barHovered` cobrindo QUALQUER ponto da barra (ver
  // ActivityBar > onBarHover, chamado incondicionalmente antes da logica
  // especifica de secao), a expansao visual funciona em toda a barra,
  // enquanto o preview de conteudo continua so respondendo a botoes com
  // secao de verdade. So encolhe quando o mouse de fato SAI da barra
  // (handleHoverSectionEnd), nunca por causa do preview fechar.
  const [barHovered, setBarHovered] = useState(false);
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

  // chamado incondicionalmente pra QUALQUER ponto sob o mouse dentro da
  // ActivityBar (ver ActivityBar > handlePointerOver) — so liga a expansao
  // visual da barra, sem decisao nenhuma de conteudo/preview.
  const handleBarHover = () => setBarHovered(true);

  const handleHoverSection = (key: SectionKey) => {
    clearHoverTimers();
    // O preview também funciona sobre uma sidebar fixada. Ao voltar à
    // seção fixada, remove qualquer preview anterior que a esteja cobrindo.
    if (sidebarOpen && activeSection === key) {
      setHoverSection(null);
      return;
    }
    // preview ja aberto (passando de um icone pro outro dentro da barra) —
    // troca na hora, sem o atraso de abertura (esse e so pra abrir do zero).
    if (hoverSection !== null) {
      setHoverSection(key);
      return;
    }
    hoverOpenTimer.current = setTimeout(() => setHoverSection(key), HOVER_OPEN_DELAY);
  };

  const handleHoverSectionEnd = () => {
    if (settingsMenuOpenRef.current) return;
    // o mouse de fato saiu da barra — so agora ela pode voltar a colapsar
    // (nunca so por causa do preview fechar, ver comentario acima).
    setBarHovered(false);
    if (hoverOpenTimer.current) clearTimeout(hoverOpenTimer.current);
    hoverOpenTimer.current = null;
    hoverCloseTimer.current = setTimeout(() => setHoverSection(null), HOVER_CLOSE_DELAY);
  };

  const handlePreviewPointerEnter = () => {
    if (hoverCloseTimer.current) clearTimeout(hoverCloseTimer.current);
    hoverCloseTimer.current = null;
  };

  const handlePreviewPointerLeave = () => {
    if (settingsMenuOpenRef.current) return;
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
      // menus de contexto (engrenagem > Tema etc.) sao portados pro <body>,
      // fora da barra — clicar numa opcao deles nao pode fechar o preview.
      if (settingsMenuOpenRef.current) return;
      if ((target as Element).closest?.('.context-menu')) return;
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
  // A Activity Bar só mostra rótulos durante o preview OU enquanto o mouse
  // estiver de fato sobre QUALQUER ponto dela (barHovered) — inclusive
  // Configuracoes, Fixar e vaos sem botao, que nao abrem preview nenhum mas
  // ainda devem reagir visualmente ao hover. Com a sidebar fixada, permanece
  // expandida sempre, sem depender do mouse.
  const activityBarExpanded = sidebarsPinned || barHovered || hoverSection !== null;
  const activityBarRealWidth = sidebarsPinned ? 176 : 48;

  // evita stale closure no listener de pointerup, que le o valor MAIS RECENTE
  // pra gravar — sem isso o handler capturava o `sidebarWidth` do momento em
  // que o arraste comecou, nao o final.
  const sidebarWidthRef = useRef(sidebarWidth);
  useEffect(() => {
    sidebarWidthRef.current = sidebarWidth;
  }, [sidebarWidth]);

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
    const panelGap = sidebarOpen ? 6 : 0;
    const total = activityBarRealWidth + panelGap + (sidebarOpen ? sidebarWidth : 0);
    document.documentElement.style.setProperty('--orbit-content-left', `${total}px`);
  }, [sidebarOpen, sidebarWidth, activityBarRealWidth]);

  // cada icone da Activity Bar = uma secao da Sidebar (ver sidebarSections.ts).
  // Os ícones de navegação apenas trocam a seção. Recolher a sidebar é uma
  // ação explícita do botão no cabeçalho dela.
  const selectSection = (key: SectionKey) => {
    // em modo hover, o clique so troca a secao do preview (que continua
    // aberto); com a sidebar fixada, troca a secao fixada. Nunca fecha.
    clearHoverTimers();
    setHoverSection(sidebarsPinned ? null : key);
    // Sincroniza a sidebar antes dos retornos dos catálogos abaixo.
    // No modo de preview, preserva a visibilidade do painel reservado.
    setSidebar((current) => ({ open: sidebarsPinned || current.open, section: key }));
    if (sidebarsPinned) writePref(SIDEBAR_OPEN_KEY, '1');
    writePref(SIDEBAR_SECTION_KEY, key);
    if (key === 'sessions') {
      setFullScreen(null);
      return;
    }
    // Agentes e LLMs sao destinos de navegacao, nao filtros da Home. Abrir
    // diretamente seus catalogos evita o salto visual de volta para sessões
    // que acontecia ao clicar nesses icones da barra lateral.
    if (key === 'agents') {
      openAgentCatalog();
      return;
    }
    if (key === 'llms') {
      openLlmCatalog();
      return;
    }
    if (key === 'skills') {
      openSkillCatalog();
      return;
    }
    if (key === 'commands') {
      openCommandCatalog();
      return;
    }
    if (key === 'tools') {
      openToolsCatalog();
      return;
    }
    if (key === 'mcps') {
      openMcpCatalog();
      return;
    }
    if (key === 'secrets') {
      openSecretsCatalog();
      return;
    }
    if (key === 'aiProviders') {
      openAiProvidersCatalog();
      return;
    }
    // trocar pra uma secao diferente da "dona" da tela cheia atual (ver
    // fullScreenSection) fecha ela — senao o conteudo principal ficava
    // preso nela mesmo navegando pra outra secao da Activity Bar. Ficar na
    // mesma secao (ex: clicar em "Agentes" de novo com a tela de edicao ja
    // aberta) nao fecha.
    if (fullScreenSection(fullScreen) !== null && key !== fullScreenSection(fullScreen)) setFullScreen(null);
    writePref(SIDEBAR_OPEN_KEY, '1');
    writePref(SIDEBAR_SECTION_KEY, key);
    setSidebar({ open: true, section: key });
  };

  const closeSidebar = () => {
    setSidebar((cur) => ({ ...cur, open: false }));
    writePref(SIDEBAR_OPEN_KEY, '0');
  };

  const toggleSidebars = () => {
    if (sidebarsPinned) {
      setSidebarsPinned(false);
      closeSidebar();
      return;
    }
    const section = hoverSection ?? activeSection ?? fullScreenSection(fullScreen) ?? 'sessions';
    clearHoverTimers();
    setHoverSection(null);
    setSidebarsPinned(true);
    setSidebar({ open: section !== null, section });
    writePref(SIDEBAR_OPEN_KEY, section !== null ? '1' : '0');
    writePref(SIDEBAR_SECTION_KEY, section ?? '');
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
        // orbit-shell-light-content: as telas cheias (catalogos, edicao) tem
        // fundo branco fixo — nesse caso o vidro do sidebar volta a usar a cor
        // do tema (senao vidro branco + texto claro do tema ficam ilegiveis).
        className={`orbit-shell${fullScreen ? ' orbit-shell-light-content' : ''}`}
        style={{ '--orbit-activitybar-w': activityBarExpanded ? '176px' : '48px' } as React.CSSProperties}
      >
        <div
          ref={activityBarWrapRef}
          className="orbit-activitybar-slot"
          style={{ width: activityBarRealWidth }}
        >
          <ActivityBar
            expanded={activityBarExpanded}
            onSelectSection={selectSection}
            onBarHover={handleBarHover}
            onHoverSection={handleHoverSection}
            onHoverSectionEnd={handleHoverSectionEnd}
            onSettingsMenuOpenChange={(open) => {
              settingsMenuOpenRef.current = open;
              clearHoverTimers();
              if (!open) handleHoverSectionEnd();
            }}
            onGoHome={goHome}
            onHoverHome={() => {
              handleHoverSection('sessions');
            }}
            isHome={!fullScreen}
            screenSection={fullScreenSection(fullScreen)}
            sidebarsPinned={sidebarsPinned}
            onToggleSidebars={toggleSidebars}
          />
        </div>
        <div className={`orbit-sidebar${sidebarOpen ? '' : ' orbit-sidebar-hidden'}`} style={{ width: sidebarWidth }}>
            {/* So existe UM <Sidebar> montado por vez em toda a AppShell — nunca
                um fixado e um de preview vivos ao mesmo tempo (o que antes exigia
                esconder um dos dois via CSS, e ainda assim empilhava o blur/vidro
                translucido dos dois, parecendo "2 paineis" com comportamentos
                diferentes). Enquanto o preview de hover esta aberto pra uma secao
                diferente, o <Sidebar> fixado simplesmente NAO renderiza aqui —
                quem esta montado nesse momento e a instancia dentro do preview
                logo abaixo. */}
            {sidebarOpen && !hoverSection && (
              <Sidebar
                activeSection={activeSection}
                sessions={sessions}
                onOpenSession={onOpenSession}
                onClose={closeSidebar}
                onOpenLlmCatalog={openLlmCatalog}
                onOpenLlmDetail={openLlmDetail}
                onOpenAgentEdit={openAgentEdit}
                onOpenAgentCatalog={openAgentCatalog}
                onOpenSkillCatalog={openSkillCatalog}
                onOpenSkillEdit={openSkillEdit}
                onOpenCommandCatalog={openCommandCatalog}
                onOpenCommandEdit={openCommandEdit}
                onOpenMcpCatalog={openMcpCatalog}
                onOpenMcpEdit={openMcpEdit}
                onOpenSecretsCatalog={openSecretsCatalog}
                onOpenSecretEdit={openSecretEdit}
                onOpenAiProvidersCatalog={openAiProvidersCatalog}
                onOpenAiProviderEdit={openAiProviderEdit}
              />
            )}
            <div
              className={`orbit-sash${resizing ? ' dragging' : ''}`}
              aria-label="Redimensionar painel lateral"
              onPointerDown={onSashPointerDown}
            />
        </div>
        {hoverSection && (
          <div
            // "ponte" de hover: cobre o vao morto (var(--orbit-panel-gap), 6px)
            // entre a borda direita da ActivityBar e a borda esquerda do
            // preview, que nao tinha listener de mouse nenhum — atravessar
            // essa faixa (ex: movimento vertical junto a fronteira, ou so
            // mais devagar que HOVER_CLOSE_DELAY) deixava o hoverCloseTimer
            // disparar antes do ponteiro chegar ao preview, fechando-o cedo
            // demais. Compartilha os mesmos handlers do preview: passar por
            // cima mantem o fechamento cancelado exatamente como o preview.
            className="orbit-hover-bridge"
            onMouseEnter={handlePreviewPointerEnter}
            onMouseLeave={handlePreviewPointerLeave}
          />
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
              sessions={sessions}
              onOpenSession={onOpenSession}
              onClose={() => setHoverSection(null)}
              onOpenLlmCatalog={openLlmCatalog}
              onOpenLlmDetail={openLlmDetail}
              onOpenAgentEdit={openAgentEdit}
              onOpenAgentCatalog={openAgentCatalog}
              onOpenSkillCatalog={openSkillCatalog}
              onOpenSkillEdit={openSkillEdit}
              onOpenCommandCatalog={openCommandCatalog}
              onOpenCommandEdit={openCommandEdit}
              onOpenMcpCatalog={openMcpCatalog}
              onOpenMcpEdit={openMcpEdit}
              onOpenSecretsCatalog={openSecretsCatalog}
              onOpenSecretEdit={openSecretEdit}
              onOpenAiProvidersCatalog={openAiProvidersCatalog}
              onOpenAiProviderEdit={openAiProviderEdit}
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
          ) : fullScreen?.kind === 'skillCatalog' ? (
            <SkillCatalogScreen
              onBack={closeFullScreen}
              onOpenSkill={(name, subtitle) => openSkillEdit(name, subtitle)}
              onCreateSkill={() => openSkillEdit('', undefined, true)}
            />
          ) : fullScreen?.kind === 'commandCatalog' ? (
            <CommandCatalogScreen
              onBack={closeFullScreen}
              onOpenCommand={(name, subtitle) => openCommandEdit(name, subtitle)}
              onCreateCommand={() => openCommandEdit('', undefined, true)}
            />
          ) : fullScreen?.kind === 'toolsCatalog' ? (
            <ToolsCatalogScreen onBack={closeFullScreen} onOpenTool={openToolsEdit} />
          ) : fullScreen?.kind === 'toolsEdit' ? (
            <ToolsEditScreen tool={fullScreen.tool} allTools={fullScreen.allTools} onBack={openToolsCatalog} />
          ) : fullScreen?.kind === 'mcpCatalog' ? (
            <McpCatalogScreen
              onBack={closeFullScreen}
              onOpenMcp={(mcp) => openMcpEdit(mcp)}
              onCreateMcp={() => openMcpPresetCatalog()}
            />
          ) : fullScreen?.kind === 'mcpPresetCatalog' ? (
            <McpPresetCatalogScreen
              onBack={openMcpCatalog}
              onChoose={(draft) => openMcpEdit(undefined, draft)}
              onManual={() => openMcpEdit()}
            />
          ) : fullScreen?.kind === 'mcpEdit' ? (
            <McpEditScreen
              mcp={fullScreen.mcp}
              draft={fullScreen.draft}
              onBack={openMcpCatalog}
              onDeleted={openMcpCatalog}
            />
          ) : fullScreen?.kind === 'secretsCatalog' ? (
            <SecretsCatalogScreen onBack={closeFullScreen} onOpenGroup={openSecretEdit} />
          ) : fullScreen?.kind === 'aiProvidersCatalog' ? (
            <AiProvidersCatalogScreen onBack={closeFullScreen} onOpenProvider={openAiProviderEdit} />
          ) : fullScreen?.kind === 'secretEdit' ? (
            <SecretsModal group={fullScreen.group} existingGroups={[]} onClose={openSecretsCatalog} onSaved={() => undefined} />
          ) : fullScreen?.kind === 'aiProviderEdit' ? (
            <AiProviderModal provider={fullScreen.provider} onClose={openAiProvidersCatalog} onSaved={() => undefined} />
          ) : fullScreen?.kind === 'agentEdit' ? (
            <AgentEditScreen
              name={fullScreen.name}
              subtitle={fullScreen.subtitle}
              kind={fullScreen.fileKind}
              isNew={fullScreen.isNew}
              // "voltar" leva ao catalogo DA MESMA secao do arquivo aberto —
              // nao sempre pro de agentes (bug corrigido nesta entrega).
              onBack={
                fullScreen.fileKind === 'skill'
                  ? openSkillCatalog
                  : fullScreen.fileKind === 'command'
                    ? openCommandCatalog
                    : openAgentCatalog
              }
              onDeleted={
                fullScreen.fileKind === 'skill'
                  ? openSkillCatalog
                  : fullScreen.fileKind === 'command'
                    ? openCommandCatalog
                    : openAgentCatalog
              }
            />
          ) : (
            children
          )}
        </div>
      </div>
    </>
  );
}
