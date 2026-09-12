import { useState } from 'react';
import { ArrowClockwise, Info, X } from '@phosphor-icons/react';
import { TreeStructure, Gear, SidebarSimple } from '@phosphor-icons/react';
import ContextMenu, { ContextMenuItem } from './ContextMenu';
import AboutDialog from './AboutDialog';
import { SECTION_ICONS, SectionKey } from '../utils/sidebarSections';
import './ActivityBar.css';

interface Props {
  // fixado OU em preview de hover — controla so a exibicao do label/largura,
  // nao a marcacao "active" (essa continua so pro estado fixado de verdade).
  expanded: boolean;
  onSelectSection: (key: SectionKey) => void;
  // qualquer ponto sob o mouse dentro da barra (icone, Configuracoes, Fixar,
  // ou um vao sem botao) — so liga a expansao visual, sem decisao de
  // conteudo/preview (ver onHoverSection, que so dispara pra botoes com
  // secao de verdade).
  onBarHover: () => void;
  onHoverSection: (key: SectionKey) => void;
  onHoverSectionEnd: () => void;
  onSettingsMenuOpenChange: (open: boolean) => void;
  // volta pra tela inicial (sessions) fechando qualquer tela cheia aberta —
  // sem isso, com uma tela cheia aberta (catalogo de LLM, edicao de agente)
  // a unica saida era o botao "Voltar" de dentro da propria tela.
  onGoHome: () => void;
  onHoverHome: () => void;
  isHome: boolean;
  // secao "dona" da tela cheia aberta (catalogo/edicao). E a UNICA fonte do
  // destaque "ativo" (junto com Sessoes na Home): indica onde o usuario ESTA,
  // nao qual secao a sidebar mostra — senao ficavam dois icones marcados.
  screenSection: SectionKey | null;
  sidebarsPinned: boolean;
  onToggleSidebars: () => void;
}

export default function ActivityBar({
  expanded,
  onSelectSection,
  onBarHover,
  onHoverSection,
  onHoverSectionEnd,
  onSettingsMenuOpenChange,
  onGoHome,
  onHoverHome,
  isHome,
  screenSection,
  sidebarsPinned,
  onToggleSidebars,
}: Props) {
  const [settingsMenuAnchor, setSettingsMenuAnchor] = useState<{ x: number; y: number } | null>(null);
  const [showAbout, setShowAbout] = useState(false);
  const [version, setVersion] = useState('');

  const openSettingsMenu = (e: React.MouseEvent) => {
    const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
    setSettingsMenuAnchor({ x: rect.right + 4, y: rect.top });
    onSettingsMenuOpenChange(true);
  };

  const settingsMenuItems: ContextMenuItem[] = [
    {
      label: 'Recarregar',
      icon: <ArrowClockwise size={14} />,
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

  // fonte unica de verdade pra saber qual secao esta sob o cursor — antes
  // cada botao TINHA seu proprio onMouseEnter, competindo com o
  // onMouseEnter do container (que tambem disparava, cobrindo os vaos): os
  // dois eventos disparam na mesma entrada do ponteiro, mas em qual ORDEM
  // exatamente e um detalhe do browser, entao dava pra o valor do container
  // (secao errada) "vencer" o valor do botao (a secao de fato sob o mouse),
  // fazendo hover no primeiro icone abrir a segunda secao (ou a ultima
  // fixada) por engano. onMouseOver delegado bubbling resolve isso: um so
  // handler, sempre olhando o elemento REAL sob o cursor.
  //
  // Vaos sem icone (entre secoes, ou o espaco vazio antes do config) NAO
  // disparam onHoverSection — antes caiam num fallback pra secao ATIVA
  // (activeSection), o que trocava o painel/preview pra secao selecionada so
  // por tirar o mouse de cima do item hovado mas ainda dentro da barra (bug
  // reportado tanto fixado quanto em hover). Sem fallback, o vao e neutro
  // pro CONTEUDO/preview: o que ja estava mostrado continua ate o mouse
  // entrar noutro botao de verdade ou sair da barra inteira (onMouseLeave,
  // ver onHoverSectionEnd). Isso NAO afeta a expansao visual da barra —
  // `onBarHover` (abaixo) dispara pra QUALQUER ponto sob o cursor aqui
  // dentro, incluindo esses vaos e os botoes Configuracoes/Fixar (que nunca
  // tiveram secao pra abrir preview, mas ainda devem expandir a barra e
  // mostrar o proprio rotulo ao hover — sem isso o hover "nao fazia nada"
  // visivel nesses botoes).
  const handlePointerOver = (e: React.MouseEvent<HTMLDivElement>) => {
    onBarHover();
    if ((e.target as HTMLElement).closest('[data-home]')) {
      onHoverHome();
      return;
    }
    if ((e.target as HTMLElement).closest('.orbit-activitybar-pin-btn')) return;
    const btn = (e.target as HTMLElement).closest<HTMLElement>('[data-hover-key]');
    if (!btn) return;
    onHoverSection(btn.dataset.hoverKey as SectionKey);
  };

  return (
    <div
      className={`orbit-activitybar${expanded ? ' expanded' : ''}`}
      onMouseOver={handlePointerOver}
      onMouseLeave={onHoverSectionEnd}
    >
      <button
        className={`orbit-activitybar-btn${isHome ? ' active' : ''}`}
        onClick={onGoHome}
        data-home="true"
        aria-label="Sessões"
        title="Sessões"
      >
        <TreeStructure className="orbit-activitybar-icon" />
        {expanded && <span className="orbit-activitybar-label">Sessões</span>}
      </button>

      {SECTION_ICONS.map(({ key, Icon, label }) => (
        <button
          key={key}
          data-hover-key={key}
          className={`orbit-activitybar-btn${screenSection === key ? ' active' : ''}`}
          onClick={() => onSelectSection(key)}
          aria-label={label}
          title={label}
        >
          <Icon className="orbit-activitybar-icon" />
          {expanded && <span className="orbit-activitybar-label">{label}</span>}
        </button>
      ))}

      <button
        className={`orbit-activitybar-btn orbit-activitybar-btn-footer${settingsMenuAnchor ? ' active' : ''}`}
        onClick={openSettingsMenu}
        aria-label="Configurações"
        title="Configurações"
      >
        <Gear className="orbit-activitybar-icon" />
        {expanded && <span className="orbit-activitybar-label">Configurações</span>}
      </button>

      <button
        className="orbit-activitybar-btn orbit-activitybar-pin-btn"
        onClick={onToggleSidebars}
        aria-label={sidebarsPinned ? 'Recolher painéis laterais' : 'Fixar painéis laterais'}
        title={sidebarsPinned ? 'Recolher painéis laterais' : 'Fixar painéis laterais'}
      >
        <SidebarSimple className="orbit-activitybar-icon" />
        {expanded && <span className="orbit-activitybar-label">{sidebarsPinned ? 'Recolher painéis' : 'Fixar painéis'}</span>}
      </button>

      {settingsMenuAnchor && (
        <ContextMenu
          x={settingsMenuAnchor.x}
          y={settingsMenuAnchor.y}
          items={settingsMenuItems}
          onClose={() => { setSettingsMenuAnchor(null); onSettingsMenuOpenChange(false); }}
        />
      )}

      <AboutDialog open={showAbout} version={version} onClose={() => setShowAbout(false)} />
    </div>
  );
}
