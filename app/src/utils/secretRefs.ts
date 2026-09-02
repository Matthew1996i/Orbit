import { SecretGroup } from '../api';

// mesma sintaxe que o backend resolve em tempo de geracao (ver
// resolve_secret_refs em server.py): {{CHAVE}} ou {{CHAVE.campo.sub}} pra
// acessar dentro de um valor guardado como JSON, como se fosse um objeto.
const SECRET_REF_RE = /^\{\{\s*([A-Za-z0-9_]+)((?:\.[A-Za-z0-9_]+)*)\s*\}\}$/;

export function isSecretRef(text: string): boolean {
  return SECRET_REF_RE.test(text.trim());
}

function flattenSecrets(groups: SecretGroup[]): Record<string, string> {
  const flat: Record<string, string> = {};
  for (const group of groups) {
    for (const entry of group.entries) {
      if (entry.key.trim()) flat[entry.key.trim()] = entry.value;
    }
  }
  return flat;
}

// valida um `{{CHAVE}}`/`{{CHAVE.campo}}` contra os grupos cadastrados —
// usado so pro highlight visual (valido/invalido), a resolucao de verdade
// acontece no backend na hora de gerar.
export function validateSecretRef(text: string, groups: SecretGroup[]): { ok: true } | { ok: false; message: string } {
  const match = text.trim().match(SECRET_REF_RE);
  if (!match) return { ok: false, message: 'sintaxe inválida — use {{CHAVE}} ou {{CHAVE.campo}}' };
  const [, key, path] = match;
  const flat = flattenSecrets(groups);
  if (!(key in flat)) return { ok: false, message: `chave "${key}" não encontrada em Chaves e tokens` };
  if (!path) return { ok: true };
  let obj: unknown;
  try {
    obj = JSON.parse(flat[key]);
  } catch {
    return { ok: false, message: `chave "${key}" não é um JSON válido para acessar "${path.slice(1)}"` };
  }
  for (const part of path.slice(1).split('.')) {
    if (obj && typeof obj === 'object' && part in (obj as Record<string, unknown>)) {
      obj = (obj as Record<string, unknown>)[part];
    } else {
      return { ok: false, message: `campo "${part}" não existe em "${key}"` };
    }
  }
  return { ok: true };
}
