import { useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import './ContextMenu.css';

export interface ContextMenuItem {
  label: string;
  icon?: React.ReactNode;
  danger?: boolean;
  onClick: () => void;
}

interface Props {
  x: number;
  y: number;
  items: ContextMenuItem[];
  onClose: () => void;
}

export default function ContextMenu({ x, y, items, onClose }: Props) {
  const menuRef = useRef<HTMLDivElement>(null);

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

  const maxLeft = Math.min(x, window.innerWidth - 220);
  const maxTop = Math.min(y, window.innerHeight - items.length * 34 - 16);

  return createPortal(
    <div
      className="context-menu"
      ref={menuRef}
      style={{ left: Math.max(4, maxLeft), top: Math.max(4, maxTop) }}
    >
      {items.map((item, idx) => (
        <button
          key={idx}
          className={`context-menu-item${item.danger ? ' danger' : ''}`}
          onClick={() => {
            item.onClick();
            onClose();
          }}
        >
          {item.icon}
          <span>{item.label}</span>
        </button>
      ))}
    </div>,
    document.body
  );
}
