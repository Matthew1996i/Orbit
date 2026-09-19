import { useModalNavigation } from '../utils/modalNavigation';
import { useEffect, useRef, useState } from 'react';
import { FolderOpen, Robot, CaretDown } from '@phosphor-icons/react';
import { LlmCli } from '../api';
import { fetchAllLlms } from '../utils/llmCatalog';
import { llmLogoFor } from '../utils/llmLogos';
import './ConfirmDialog.css';
import './NewAgentDialog.css';

interface Props {
  open: boolean;
  onClose: () => void;
  onSubmit: (cwd: string, name: string, llm: string) => void;
}

export default function NewAgentDialog({ open, onClose, onSubmit }: Props) {
  useModalNavigation(open);
  const [cwd, setCwd] = useState('~');
  const [name, setName] = useState('');
  const [llm, setLlm] = useState('');
  const [llmOptions, setLlmOptions] = useState<LlmCli[]>([]);
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
      setLlm('');
      setLlmOptions([]);
      setLlmMenuOpen(false);
      submittedRef.current = false;
      fetchAllLlms().then((options) => {
        setLlmOptions(options.filter((option) => option.status !== 'none'));
        setLlm(options.find((option) => option.connected)?.bin || '');
      }).catch(() => setLlmOptions([]));
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

  const selectedLlm = llmOptions.find((opt) => opt.bin === llm);
  const SelectedLogo = selectedLlm ? llmLogoFor(selectedLlm.id) : null;

  const pickFolder = async () => {
    if (!window.dashboardAPI) return;
    const picked = await window.dashboardAPI.pickDirectory();
    if (picked) setCwd(picked);
  };

  const submit = () => {
    if (submittedRef.current || !selectedLlm?.connected) return;
    submittedRef.current = true;
    onSubmit(cwd || '~', name, llm);
  };

  return (
    <div className="confirm-overlay" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className="confirm-dialog">
        <div className="confirm-header">
          <span className="confirm-icon"><Robot size={18} /></span>
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
          placeholder="Ex.: refatorar-checkout"
        />

        <label className="new-agent-label">LLM</label>
        <div className="new-agent-llm-picker" ref={llmPickerRef}>
          <button
            type="button"
            className="new-agent-input new-agent-llm-trigger"
            onClick={() => setLlmMenuOpen((v) => !v)}
          >
            {SelectedLogo && <span className="new-agent-llm-logo"><SelectedLogo size={15} /></span>}
            <span className="new-agent-llm-name">{selectedLlm?.name || 'Nenhuma LLM conectada'}</span>
            <CaretDown size={14} className={`new-agent-llm-chevron ${llmMenuOpen ? 'open' : ''}`} />
          </button>

          {llmMenuOpen && (
            <div className="new-agent-llm-menu">
              {llmOptions.length === 0 && <div className="new-agent-llm-option">Nenhuma LLM instalada</div>}
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
          <button className="confirm-btn-submit" onClick={submit} type="button" disabled={!selectedLlm?.connected}>
            Iniciar
          </button>
        </div>
      </div>
    </div>
  );
}
