import { useState } from 'react';
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

// Mantemos o mesmo <input> nativo durante toda a edição. Texto comum é senha;
// ao existir uma expressão {{...}}, apenas o tipo de exibição muda — o nó e o
// foco permanecem os mesmos.
export default function SecretRefInput({ value, onChange, placeholder, secretGroups, password }: Props) {
  const isRef = isSecretRef(value);
  const validation = isRef ? validateSecretRef(value, secretGroups) : null;
  const [caret, setCaret] = useState(value.length);
  // Usa apenas o texto antes do cursor. Assim {{|}} abre o catálogo, e a
  // busca continua funcionando ao editar uma variável no meio de uma string.
  const tokenBeforeCaret = value.slice(0, caret).match(/\{\{([^}]*)$/);
  const partial = tokenBeforeCaret?.[1]?.toLowerCase() ?? null;
  const suggestions = partial === null ? [] : secretGroups
    .flatMap((group) => group.entries.map((entry) => ({
      value: `{{${group.identifier}.${entry.key}}}`,
      search: `${group.identifier}.${entry.key}`.toLowerCase(),
      group: group.title,
    })))
    .filter((item) => item.search.includes(partial))
    .slice(0, 8);
  const hasTemplate = value.includes('{{');
  const hasCompletedTemplate = /\{\{[^}]*\}\}/.test(value);
  const hasInvalidCompletedTemplate = hasCompletedTemplate && (!validation || !validation.ok);
  const updateValue = (next: string, nextCaret: number) => {
    setCaret(nextCaret);
    onChange(next);
  };
  const insertSuggestion = (replacement: string) => {
    if (!tokenBeforeCaret || tokenBeforeCaret.index === undefined) return;
    const start = tokenBeforeCaret.index;
    const close = value.indexOf('}}', caret);
    const end = close === -1 ? caret : close + 2;
    updateValue(`${value.slice(0, start)}${replacement}${value.slice(end)}`, start + replacement.length);
  };

  return (
    <div className="secret-ref-wrap">
      <input
        className={`new-agent-input secret-ref-input${password && hasTemplate ? ' secret-ref-variable-input' : ''}${password && hasInvalidCompletedTemplate ? ' secret-ref-variable-invalid' : ''}`}
        value={value}
        onChange={(event) => updateValue(event.target.value, event.target.selectionStart ?? event.target.value.length)}
        onSelect={(event) => setCaret(event.currentTarget.selectionStart ?? value.length)}
        onClick={(event) => setCaret(event.currentTarget.selectionStart ?? value.length)}
        onKeyUp={(event) => setCaret(event.currentTarget.selectionStart ?? value.length)}
        placeholder={placeholder}
        type={password && !hasTemplate ? 'password' : 'text'}
        spellCheck={false}
      />
      {suggestions.length > 0 && (
        <div className="secret-ref-suggestions" role="listbox">
          <div className="secret-ref-suggestions-title">Chaves salvas</div>
          {suggestions.map((item) => (
            <button key={item.value} type="button" className="secret-ref-suggestion" onMouseDown={(event) => event.preventDefault()} onClick={() => insertSuggestion(item.value)}>
              <span className="secret-ref-suggestion-icon">{'{}'}</span><code>{item.value}</code><span>{item.group}</span>
            </button>
          ))}
        </div>
      )}
      {isRef && validation && !validation.ok && <span className="ai-provider-hint ai-provider-hint-error">{validation.message}</span>}
    </div>
  );
}
