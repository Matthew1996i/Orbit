import { useModalNavigation } from '../utils/modalNavigation';
import { createPortal } from 'react-dom';
import { X } from '@phosphor-icons/react';
import appIcon from '../../electron/assets/appIcon.png';
import './AboutDialog.css';

interface Props {
  open: boolean;
  version: string;
  onClose: () => void;
}

// Portado pro <body>: a Activity Bar (que abre este dialogo) e estreita e
// tem overflow hidden — renderizado dentro dela o card ficava cortado.
export default function AboutDialog({ open, version, onClose }: Props) {
  useModalNavigation(open);
  if (!open) return null;
  return createPortal(
    <div className="about-overlay" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className="about-dialog" role="dialog" aria-modal="true" aria-labelledby="about-title">
        <button className="about-close" onClick={onClose} type="button" aria-label="Fechar">
          <X size={16} weight="bold" />
        </button>
        <img className="about-logo" src={appIcon} alt="" draggable={false} />
        <h2 id="about-title" className="about-name">Orbit</h2>
        <p className="about-tagline">Dashboard de sessões de IA</p>
        <span className="about-version">Versão {version || '—'}</span>
        <button className="about-ok" onClick={onClose} type="button">
          OK
        </button>
      </div>
    </div>,
    document.body,
  );
}
