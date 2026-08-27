export function shortCwd(cwd: string): string {
  if (cwd.startsWith('/home/')) {
    const parts = cwd.split('/');
    const home = parts.slice(0, 3).join('/');
    return '~' + cwd.slice(home.length);
  }
  return cwd;
}

// "claude-sonnet-5" -> "Sonnet 5", "claude-haiku-4-5-20251001" -> "Haiku 4.5"
// (mesma familia de nomes que a propria CLI mostra no cabecalho do terminal)
export function shortModel(model: string): string {
  const m = model.replace(/^claude-/, '');
  const parts = m.split('-').filter((p) => !/^\d{6,}$/.test(p)); // corta sufixo de data tipo 20251001
  if (parts.length === 0) return model;
  const [name, ...versionParts] = parts;
  const version = versionParts.join('.');
  const label = name.charAt(0).toUpperCase() + name.slice(1);
  return version ? `${label} ${version}` : label;
}

export function formatModelEffort(model?: string | null, effort?: string | null): string {
  const parts: string[] = [];
  if (model) parts.push(shortModel(model));
  if (effort) parts.push(effort);
  return parts.join(' · ');
}
