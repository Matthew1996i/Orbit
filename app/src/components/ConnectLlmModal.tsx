import { useState } from 'react';
import { createPortal } from 'react-dom';
import { X, Check } from 'lucide-react';
import { LlmCli, startInstall } from '../api';
import { llmLogoFor } from '../utils/llmLogos';
import InstallLogView from './InstallLogView';
import './ConnectLlmModal.css';

interface Props {
  llms: LlmCli[];
  onClose: () => void;
  onInstalled: () => void;
}

export default function ConnectLlmModal({ llms, onClose, onInstalled }: Props) {
  const [installing, setInstalling] = useState<{ cliId: string; agentId: string; label: string } | null>(null);

  const connect = async (cliId: string) => {
    const res = await startInstall(cliId, 'install');
    if ('error' in res) return;
    setInstalling({ cliId, agentId: res.id, label: 'Instalando e autenticando' });
  };

  const onLogDone = () => {
    setInstalling(null);
    onInstalled();
  };

  return createPortal(
    <div className="connect-llm-overlay" onMouseDown={(e) => e.target === e.currentTarget && !installing && onClose()}>
      <div className="connect-llm-dialog">
        <div className="connect-llm-header">
          <h2>Conectar LLM</h2>
          <button className="sidebar-close-btn" onClick={onClose} aria-label="Fechar" disabled={!!installing}>
            <X size={16} />
          </button>
        </div>

        {installing ? (
          <div className="connect-llm-installing">
            <div className="connect-llm-installing-label">
              {installing.label} {llms.find((l) => l.id === installing.cliId)?.name}…
            </div>
            <InstallLogView agentId={installing.agentId} onDone={onLogDone} />
          </div>
        ) : (
          <div className="connect-llm-list">
            {llms.map((llm) => {
              const Logo = llmLogoFor(llm.id);
              return (
                <div key={llm.id} className="connect-llm-row">
                  <div className="connect-llm-logo">
                    <Logo size={18} strokeWidth={2} />
                  </div>
                  <div className="connect-llm-info">
                    <div className="connect-llm-name">{llm.name}</div>
                    <div className="connect-llm-vendor">{llm.vendor}</div>
                  </div>
                  {llm.connected ? (
                    <span className="connect-llm-connected">
                      <Check size={13} /> instalado
                    </span>
                  ) : (
                    <button className="connect-llm-btn" onClick={() => connect(llm.id)}>
                      Conectar
                    </button>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>,
    document.body,
  );
}
