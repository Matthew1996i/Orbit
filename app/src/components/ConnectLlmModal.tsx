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

  // CLI ja instalada mas sem login (status "installed") reaproveita so o
  // comando de login — nao roda a instalacao inteira de novo. So quem nunca
  // teve o binario encontrado (status "none") passa pelo fluxo completo de
  // instalar + autenticar encadeado.
  const connect = async (cliId: string, status: LlmCli['status']) => {
    const action = status === 'installed' ? 'login' : 'install';
    const res = await startInstall(cliId, action);
    if ('error' in res) return;
    setInstalling({
      cliId,
      agentId: res.id,
      label: action === 'login' ? 'Autenticando' : 'Instalando e autenticando',
    });
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
                  {llm.status === 'connected' ? (
                    <span className="connect-llm-connected">
                      <Check size={13} /> conectado
                    </span>
                  ) : llm.status === 'installed' ? (
                    <span className="connect-llm-status-group">
                      <span className="connect-llm-installed-tag">instalado</span>
                      <button className="connect-llm-btn" onClick={() => connect(llm.id, llm.status)}>
                        Fazer login
                      </button>
                    </span>
                  ) : (
                    <button className="connect-llm-btn" onClick={() => connect(llm.id, llm.status)}>
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
