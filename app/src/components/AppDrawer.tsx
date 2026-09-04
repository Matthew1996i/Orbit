import { Drawer } from 'antd';
import { X } from 'lucide-react';
import { useEffect, useState, type CSSProperties, type ReactNode } from 'react';
import './AppDrawer.css';

// portado do AppDrawer do backoffice (/home/tou/backoffice/src/components/ui/AppDrawer.tsx)
// — mesmo padrao (Drawer do AntD v6, closable custom, header
// icon+title+subtitle, mask nao fecha por padrao, footer com borda), so
// adaptado pra CSS puro (Orbit nao usa Tailwind) e cor do "chip" do icone
// configuravel em vez de fixa (o app nao tem uma so cor de marca — cada tela
// que usa precisa poder escolher, ou nem usar chip nenhum: ver LlmDrawer.tsx,
// que passa o proprio `title` composto pra pular o chip e mostrar o logo da
// LLM cru, sem caixa colorida).
interface AppDrawerProps {
  open: boolean;
  onClose: () => void;
  children: ReactNode;
  title?: ReactNode;
  footer?: ReactNode;
  push?: boolean | { distance: number };
  /** Lado do drawer. Padrao "right" (diferente do backoffice, que usa "left"
   * como padrao pro mobile-full-width deles — aqui o app so roda desktop). */
  placement?: 'left' | 'right';
  /** Largura do panel. Em viewports menores que esse valor, ocupa o viewport
   * inteiro. Padrao 480 (igual backoffice). */
  width?: number;
  /** Icone exibido a esquerda do titulo, dentro de uma caixa colorida. */
  icon?: ReactNode;
  iconBg?: string;
  iconColor?: string;
  /** Linha adicional abaixo do titulo. */
  subtitle?: ReactNode;
  /** Fechar ao clicar na mascara de fundo. Padrao true — diferente do
   * backoffice (que usa false): pedido explicito pro Orbit, clicar fora
   * fecha o drawer. */
  maskClosable?: boolean;
}

export default function AppDrawer({
  open,
  onClose,
  children,
  title,
  footer,
  push,
  placement = 'right',
  width: widthProp = 480,
  icon,
  iconBg = '#f4f4f5',
  iconColor = '#18181b',
  subtitle,
  maskClosable = true,
}: AppDrawerProps) {
  const [viewportWidth, setViewportWidth] = useState<number | null>(null);

  useEffect(() => {
    const update = () => setViewportWidth(window.innerWidth);
    update();
    window.addEventListener('resize', update);
    return () => window.removeEventListener('resize', update);
  }, []);

  const resolvedWidth =
    viewportWidth && viewportWidth < widthProp ? `${viewportWidth}px` : `${widthProp}px`;
  const wrapperStyle: CSSProperties = { width: resolvedWidth, overflow: 'hidden' };

  const titleNode: ReactNode =
    icon || subtitle ? (
      <div className="app-drawer-title-row">
        {icon && (
          <div className="app-drawer-icon" style={{ background: iconBg, color: iconColor }}>
            {icon}
          </div>
        )}
        <div className="app-drawer-title-text">
          {title && <div className="app-drawer-title">{title}</div>}
          {subtitle && <div className="app-drawer-subtitle">{subtitle}</div>}
        </div>
      </div>
    ) : (
      title
    );

  return (
    <Drawer
      open={open}
      onClose={onClose}
      placement={placement}
      title={titleNode}
      footer={footer}
      closable={false}
      extra={
        <button className="app-drawer-close-btn" onClick={onClose} aria-label="Fechar">
          <X size={18} color="#71717a" />
        </button>
      }
      maskClosable={maskClosable}
      push={push}
      styles={{
        // o Drawer do AntD nasce fixed/inset:0 no <body> inteiro — sem isso,
        // o header fica por baixo da TitleBar customizada do Orbit (fixed,
        // opaca, z-index alto). Especifica TODOS os lados explicitamente
        // (nao so `top`) pra nao depender de como o AntD resolve o shorthand
        // `inset` internamente — uma tentativa anterior so com `top` deixou
        // o painel sem `right`/`bottom` definidos e ele voltou a vazar por
        // cima dos controles da janela.
        root: {
          position: 'fixed',
          top: 'var(--orbit-titlebar-h)',
          right: 0,
          bottom: 0,
          left: 0,
        },
        mask: {
          position: 'fixed',
          top: 'var(--orbit-titlebar-h)',
          right: 0,
          bottom: 0,
          left: 0,
        },
        wrapper: wrapperStyle,
        header: {
          padding: '16px 20px',
          borderBottom: '1px solid #ececef',
          fontWeight: 600,
        },
        body: {
          padding: 0,
          overflowY: 'auto',
          overflowX: 'hidden',
          display: 'flex',
          flexDirection: 'column',
        },
        footer: {
          padding: '16px 20px',
          borderTop: '1px solid #ececef',
          backgroundColor: '#fff',
        },
      }}
    >
      {children}
    </Drawer>
  );
}
