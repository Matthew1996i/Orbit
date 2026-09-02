// preferencias de UI persistidas — mesmo padrao ja usado em Home.tsx
// (localStorage com chave prefixada e try/catch silencioso), so que
// compartilhado entre a largura da sidebar, o estado aberta/fechada e o tema.
export function readPref(key: string, fallback: string): string {
  try {
    return localStorage.getItem(key) ?? fallback;
  } catch {
    return fallback;
  }
}

export function writePref(key: string, value: string): void {
  try {
    localStorage.setItem(key, value);
  } catch {
    /* localStorage indisponível (privado/bloqueado) — sem persistência, sem problema */
  }
}
