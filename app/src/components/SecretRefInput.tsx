import { SecretGroup } from '../api';
import { isSecretRef, validateSecretRef } from '../utils/secretRefs';
import './SecretRefInput.css';

interface Props {
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  secretGroups: SecretGroup[];
  password?: boolean;
}

// campo que aceita `{{CHAVE}}`/`{{CHAVE.campo}}` pra puxar um valor ja
// cadastrado em Chaves e tokens — quando o conteudo inteiro e uma referencia
// dessas, mostra ela como uma pill destacada por cima do input (mesma ideia
// do Insomnia pros templates de variavel), verde se a chave existe, vermelha
// se nao. A resolucao de verdade acontece no backend na hora de usar.
export default function SecretRefInput({ value, onChange, placeholder, secretGroups, password }: Props) {
  const isRef = isSecretRef(value);
  const validation = isRef ? validateSecretRef(value, secretGroups) : null;

  return (
    <div className="secret-ref-wrap">
      <input
        className={`new-agent-input secret-ref-input${isRef ? ' has-ref-chip' : ''}`}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        // uma referencia {{CHAVE}} fica visivel (e' so um nome, nao o
        // segredo em si) — a mascara de senha so faz sentido pro valor cru.
        type={isRef ? 'text' : password ? 'password' : 'text'}
        spellCheck={false}
      />
      {isRef && <span className={`secret-ref-chip ${validation?.ok ? 'valid' : 'invalid'}`}>{value}</span>}
      {isRef && validation && !validation.ok && <span className="ai-provider-hint ai-provider-hint-error">{validation.message}</span>}
    </div>
  );
}
