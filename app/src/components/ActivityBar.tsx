import { useState } from 'react';
import { Settings, Check, RotateCw, Info, X, Palette, Home } from 'lucide-react';
import ContextMenu, { ContextMenuItem } from './ContextMenu';
import ConfirmDialog from './ConfirmDialog';
import { THEMES } from '../theme/themes';
import { SECTION_ICONS, SectionKey } from '../utils/sidebarSections';
import './ActivityBar.css';

interface Props {
  activeSection: SectionKey | null;
  sidebarOpen: boolean;
  // fixado OU em preview de hover — controla so a exibicao do label/largura,
  // nao a marcacao "active" (essa continua so pro estado fixado de verdade).
  expanded: boolean;
  onSelectSection: (key: SectionKey) => void;
  onHoverSection: (key: SectionKey) => void;
  onHoverSectionEnd: () => void;
  themeId: string;
  onSelectTheme: (id: string) => void;
  // volta pra tela inicial (sessions) fechando qualquer tela cheia aberta —
  // sem isso, com uma tela cheia aberta (catalogo de LLM, edicao de agente)
  // a unica saida era o botao "Voltar" de dentro da propria tela.
  onGoHome: () => void;
  isHome: boolean;
}

export default function ActivityBar({
  activeSection,
  sidebarOpen,
  expanded,
  onSelectSection,
  onHoverSection,
  onHoverSectionEnd,
  themeId,
  onSelectTheme,
  onGoHome,
  isHome,
}: Props) {
  const [settingsMenuAnchor, setSettingsMenuAnchor] = useState<{ x: number; y: number } | null>(null);
  const [showAbout, setShowAbout] = useState(false);
  const [version, setVersion] = useState('');

  const openSettingsMenu = (e: React.MouseEvent) => {
    const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
    setSettingsMenuAnchor({ x: rect.right + 4, y: rect.top });
  };

  const themeItems: ContextMenuItem[] = THEMES.map((t) => ({
    label: t.label,
    icon: t.id === themeId ? <Check size={14} /> : <span style={{ width: 14, display: 'inline-block' }} />,
    onClick: () => onSelectTheme(t.id),
  }));

  const settingsMenuItems: ContextMenuItem[] = [
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
      label: 'Tema',
      icon: <Palette size={14} />,
      items: themeItems,
    },
    {
      label: 'Sair',
      icon: <X size={14} />,
      danger: true,
      onClick: () => window.dashboardAPI?.quitApp(),
    },
  ];

  // ponto de entrada padrao quando o mouse esta sobre um vao sem icone (ex:
  // o espaco vazio entre as secoes e o botao de config, que usa
  // margin-top:auto, ou o proprio botao "Inicio") — sem isso, so os botoes
  // de secao abririam o preview, nao "qualquer lugar da barra" como pedido.
  const fallbackSection = activeSection ?? SECTION_ICONS[0].key;

  // fonte unica de verdade pra saber qual secao esta sob o cursor — antes
  // cada botao TINHA seu proprio onMouseEnter, competindo com o
  // onMouseEnter do container (que tambem disparava, cobrindo os vaos): os
  // dois eventos disparam na mesma entrada do ponteiro, mas em qual ORDEM
  // exatamente e um detalhe do browser, entao dava pra o valor do container
  // (secao errada) "vencer" o valor do botao (a secao de fato sob o mouse),
  // fazendo hover no primeiro icone abrir a segunda secao (ou a ultima
  // fixada) por engano. onMouseOver delegado bubbling resolve isso: um so
  // handler, sempre olhando o elemento REAL sob o cursor.
  const handlePointerOver = (e: React.MouseEvent<HTMLDivElement>) => {
    const btn = (e.target as HTMLElement).closest<HTMLElement>('[data-hover-key]');
    onHoverSection((btn?.dataset.hoverKey as SectionKey | undefined) ?? fallbackSection);
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
        aria-label="Início"
        title="Início"
      >
        <Home size={24} />
        {expanded && <span className="orbit-activitybar-label">Início</span>}
      </button>

      {SECTION_ICONS.map(({ key, Icon, label }) => (
        <button
          key={key}
          data-hover-key={key}
          className={`orbit-activitybar-btn${sidebarOpen && activeSection === key ? ' active' : ''}`}
          onClick={() => onSelectSection(key)}
          aria-label={label}
          title={label}
        >
          <Icon size={24} />
          {expanded && <span className="orbit-activitybar-label">{label}</span>}
        </button>
      ))}

      <button
        className={`orbit-activitybar-btn orbit-activitybar-btn-footer${settingsMenuAnchor ? ' active' : ''}`}
        onClick={openSettingsMenu}
        aria-label="Configurações"
        title="Configurações"
      >
        <Settings size={24} />
        {expanded && <span className="orbit-activitybar-label">Configurações</span>}
      </button>

      {settingsMenuAnchor && (
        <ContextMenu
          x={settingsMenuAnchor.x}
          y={settingsMenuAnchor.y}
          items={settingsMenuItems}
          onClose={() => setSettingsMenuAnchor(null)}
        />
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
    </div>
  );
}
