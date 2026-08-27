import { AlertTriangle } from 'lucide-react';
import './ConfirmDialog.css';

interface Props {
  open: boolean;
  title: string;
  message: string;
  confirmText?: string;
  cancelText?: string;
  danger?: boolean;
  singleButton?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}

export default function ConfirmDialog({
  open,
  title,
  message,
  confirmText = 'Confirmar',
  cancelText = 'Cancelar',
  danger = false,
  singleButton = false,
  onConfirm,
  onCancel,
}: Props) {
  if (!open) return null;

  return (
    <div className="confirm-overlay" onMouseDown={(e) => e.target === e.currentTarget && onCancel()}>
      <div className="confirm-dialog">
        <div className="confirm-header">
          {danger && <AlertTriangle size={18} className="confirm-icon" />}
          <h2>{title}</h2>
        </div>
        <p className="confirm-message">{message}</p>
        <div className="confirm-actions">
          {!singleButton && (
            <button className="confirm-btn-cancel" onClick={onCancel} type="button">
              {cancelText}
            </button>
          )}
          <button
            className={danger ? 'confirm-btn-danger' : 'confirm-btn-submit'}
            onClick={onConfirm}
            type="button"
          >
            {confirmText}
          </button>
        </div>
      </div>
    </div>
  );
}
