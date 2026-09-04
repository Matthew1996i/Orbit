import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { ChevronRight } from 'lucide-react';
import './ContextMenu.css';

export interface ContextMenuItem {
  label: string;
  icon?: React.ReactNode;
  danger?: boolean;
  // item com submenu: sem onClick proprio, so abre a cascata em `items` ao passar o mouse.
  onClick?: () => void;
  items?: ContextMenuItem[];
}

interface Props {
  x: number;
  y: number;
  items: ContextMenuItem[];
  onClose: () => void;
}

// mesma logica de clamp do menu principal, reaproveitada pro submenu — sem
// isso a cascata (que abre a partir de uma linha, nao de x/y fixos) vaza
// pra fora da tela quando o item pai esta perto da borda (ex: o botao de
// engrenagem, fixo no rodape da Activity Bar).
function clampMenuPosition(x: number, y: number, itemCount: number) {
  const left = Math.max(4, Math.min(x, window.innerWidth - 220));
  const top = Math.max(4, Math.min(y, window.innerHeight - itemCount * 34 - 16));
  return { left, top };
}

export default function ContextMenu({ x, y, items, onClose }: Props) {
  const menuRef = useRef<HTMLDivElement>(null);
  // indice do item com submenu aberto no momento — so um por vez, fecha ao
  // trocar de linha (mouseenter de outra linha ja reseta pra essa ou null).
  const [openSub, setOpenSub] = useState<{ index: number; x: number; y: number } | null>(null);

  useEffect(() => {
    const onPointerDown = (e: PointerEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) onClose();
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('pointerdown', onPointerDown);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('pointerdown', onPointerDown);
      document.removeEventListener('keydown', onKey);
    };
  }, [onClose]);

  const { left, top } = clampMenuPosition(x, y, items.length);
  const submenuWidth = 220;

  return createPortal(
    <div className="context-menu" ref={menuRef} style={{ left, top }}>
      {items.map((item, idx) => (
        <div
          key={idx}
          className="context-menu-row"
          onMouseEnter={(e) => {
            if (!item.items) {
              setOpenSub(null);
              return;
            }
            const rect = e.currentTarget.getBoundingClientRect();
            // abre pra direita por padrao; se nao couber, vira pro lado esquerdo.
            const subX =
              rect.right + 4 + submenuWidth > window.innerWidth ? rect.left - submenuWidth - 4 : rect.right + 4;
            setOpenSub({ index: idx, x: subX, y: rect.top - 5 });
          }}
        >
          <button
            className={`context-menu-item${item.danger ? ' danger' : ''}`}
            onClick={() => {
              if (item.items) return;
              item.onClick?.();
              onClose();
            }}
          >
            {item.icon}
            <span>{item.label}</span>
            {item.items && <ChevronRight size={14} className="context-menu-caret" />}
          </button>

          {item.items && openSub?.index === idx && (
            <div
              className="context-menu context-menu-submenu"
              style={clampMenuPosition(openSub.x, openSub.y, item.items.length)}
            >
              {item.items.map((sub, subIdx) => (
                <button
                  key={subIdx}
                  className={`context-menu-item${sub.danger ? ' danger' : ''}`}
                  onClick={() => {
                    sub.onClick?.();
                    onClose();
                  }}
                >
                  {sub.icon}
                  <span>{sub.label}</span>
                </button>
              ))}
            </div>
          )}
        </div>
      ))}
    </div>,
    document.body
  );
}
