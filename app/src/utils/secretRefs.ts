import { SecretGroup } from '../api';

// mesma sintaxe que o backend resolve em tempo de geracao (ver
// resolve_secret_refs em server.py): {{identificador.CHAVE}} ou
// {{identificador.CHAVE.campo.sub}} pra acessar dentro de um valor guardado
// como JSON, como se fosse um objeto. O endereco e' escopado por grupo de
// proposito — grupos diferentes podem ter uma chave com o mesmo nome sem
// colidir, so o identificador do grupo precisa ser unico.
const SECRET_REF_RE = /^\{\{\s*([A-Za-z0-9_-]+)\.([A-Za-z0-9_]+)((?:\.[A-Za-z0-9_]+)*)\s*\}\}$/;

export function isSecretRef(text: string): boolean {
  return SECRET_REF_RE.test(text.trim());
}

// valida um `{{identificador.CHAVE}}`/`{{identificador.CHAVE.campo}}` contra
// os grupos cadastrados — usado so pro highlight visual (valido/invalido), a
// resolucao de verdade acontece no backend na hora de gerar.
export function validateSecretRef(text: string, groups: SecretGroup[]): { ok: true } | { ok: false; message: string } {
  const match = text.trim().match(SECRET_REF_RE);
  if (!match) return { ok: false, message: 'sintaxe inválida — use {{identificador.CHAVE}}' };
  const [, groupId, key, path] = match;
  const group = groups.find((g) => g.identifier === groupId);
  if (!group) return { ok: false, message: `grupo "${groupId}" não encontrado em Chaves e tokens` };
  const entry = group.entries.find((e) => e.key.trim() === key);
  if (!entry) return { ok: false, message: `chave "${key}" não encontrada no grupo "${groupId}"` };
  if (!path) return { ok: true };
  let obj: unknown;
  try {
    obj = JSON.parse(entry.value);
  } catch {
    return { ok: false, message: `chave "${groupId}.${key}" não é um JSON válido para acessar "${path.slice(1)}"` };
  }
  for (const part of path.slice(1).split('.')) {
    if (obj && typeof obj === 'object' && part in (obj as Record<string, unknown>)) {
      obj = (obj as Record<string, unknown>)[part];
    } else {
      return { ok: false, message: `campo "${part}" não existe em "${groupId}.${key}"` };
    }
  }
  return { ok: true };
}
