import { useEffect, useRef, useState } from 'react';
import { FolderOpen, Bot, ChevronDown } from 'lucide-react';
import { fetchLlms, fetchUsage, LlmCli } from '../api';
import { CLAUDE_LLM_OPTION, llmLogoFor } from '../utils/llmLogos';
import './ConfirmDialog.css';
import './NewAgentDialog.css';

interface Props {
  open: boolean;
  onClose: () => void;
  onSubmit: (cwd: string, name: string, llm: string) => void;
}

export default function NewAgentDialog({ open, onClose, onSubmit }: Props) {
  const [cwd, setCwd] = useState('~');
  const [name, setName] = useState('');
  const [llm, setLlm] = useState('claude');
  const [llmOptions, setLlmOptions] = useState<LlmCli[]>([CLAUDE_LLM_OPTION]);
  const [llmMenuOpen, setLlmMenuOpen] = useState(false);
  const llmPickerRef = useRef<HTMLDivElement>(null);
  // ref (nao state): precisa bloquear o 2o clique JA no mesmo tick do 1o —
  // um duplo-clique rapido dispara os dois handlers antes do React re-renderizar
  // o dialogo fechado, e sem essa trava cada clique chamava startAgent() de
  // novo, criando dois agentes/processos reais pro mesmo pedido.
  const submittedRef = useRef(false);

  useEffect(() => {
    if (open) {
      setCwd('~');
      setName('');
      setLlm('claude');
      setLlmMenuOpen(false);
      submittedRef.current = false;
      fetchLlms()
        .then((r) => {
          setLlmOptions([CLAUDE_LLM_OPTION, ...r.llms]);
          // status do Claude nao vem do /api/llms (essa CLI e o proprio app);
          // busca o status real de autenticacao a parte e sobrescreve o
          // placeholder hardcoded assim que resolver.
          fetchUsage()
            .then(({ claudeAuthenticated }) => {
              setLlmOptions((cur) =>
                cur.map((opt) =>
                  opt.id === 'claude'
                    ? { ...opt, connected: claudeAuthenticated, status: claudeAuthenticated ? 'connected' : 'installed' }
                    : opt,
                ),
              );
            })
            .catch(() => {});
        })
        .catch(() => setLlmOptions([CLAUDE_LLM_OPTION]));
    }
  }, [open]);

  useEffect(() => {
    if (!llmMenuOpen) return;
    const onOutside = (e: MouseEvent) => {
      if (llmPickerRef.current && !llmPickerRef.current.contains(e.target as Node)) setLlmMenuOpen(false);
    };
    document.addEventListener('mousedown', onOutside);
    return () => document.removeEventListener('mousedown', onOutside);
  }, [llmMenuOpen]);

  if (!open) return null;

  const selectedLlm = llmOptions.find((opt) => opt.bin === llm) || CLAUDE_LLM_OPTION;
  const SelectedLogo = llmLogoFor(selectedLlm.id);

  const pickFolder = async () => {
    if (!window.dashboardAPI) return;
    const picked = await window.dashboardAPI.pickDirectory();
    if (picked) setCwd(picked);
  };

  const submit = () => {
    if (submittedRef.current) return;
    submittedRef.current = true;
    onSubmit(cwd || '~', name, llm);
  };

  return (
    <div className="confirm-overlay" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className="confirm-dialog">
        <div className="confirm-header">
          <Bot size={18} className="confirm-icon" />
          <h2>Novo agente</h2>
        </div>

        <label className="new-agent-label">Diretório de trabalho</label>
        <div className="new-agent-folder-row">
          <span className="new-agent-folder-path" title={cwd}>{cwd || '~'}</span>
          <button className="new-agent-folder-btn" onClick={pickFolder} type="button">
            <FolderOpen size={15} />
            Escolher pasta
          </button>
        </div>

        <label className="new-agent-label">Nome (opcional)</label>
        <input
          className="new-agent-input"
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="nome do agente"
        />

        <label className="new-agent-label">LLM</label>
        <div className="new-agent-llm-picker" ref={llmPickerRef}>
          <button
            type="button"
            className="new-agent-input new-agent-llm-trigger"
            onClick={() => setLlmMenuOpen((v) => !v)}
          >
            <span className="new-agent-llm-logo">
              <SelectedLogo size={15} />
            </span>
            <span className="new-agent-llm-name">{selectedLlm.name}</span>
            <ChevronDown size={14} className={`new-agent-llm-chevron ${llmMenuOpen ? 'open' : ''}`} />
          </button>

          {llmMenuOpen && (
            <div className="new-agent-llm-menu">
              {llmOptions.map((opt) => {
                const Logo = llmLogoFor(opt.id);
                return (
                  <button
                    key={opt.id}
                    type="button"
                    className={`new-agent-llm-option ${!opt.connected ? 'disabled' : ''} ${opt.bin === llm ? 'selected' : ''}`}
                    disabled={!opt.connected}
                    onClick={() => {
                      setLlm(opt.bin);
                      setLlmMenuOpen(false);
                    }}
                  >
                    <span className="new-agent-llm-logo">
                      <Logo size={15} />
                    </span>
                    <span className="new-agent-llm-name">{opt.name}</span>
                    {!opt.connected && <span className="new-agent-llm-hint">não conectado</span>}
                  </button>
                );
              })}
            </div>
          )}
        </div>

        <div className="confirm-actions">
          <button className="confirm-btn-cancel" onClick={onClose} type="button">
            Cancelar
          </button>
          <button className="confirm-btn-submit" onClick={submit} type="button">
            Iniciar
          </button>
        </div>
      </div>
    </div>
  );
}
