import { readPref, writePref } from '../utils/uiPrefs';

export interface OrbitTheme {
  id: string;
  label: string;
}

export const THEMES: OrbitTheme[] = [
  { id: 'dark-plus', label: 'Dark+ (padrão)' },
  { id: 'monokai', label: 'Monokai' },
  { id: 'dracula', label: 'Dracula' },
  { id: 'solarized-dark', label: 'Solarized Dark' },
  { id: 'one-dark-pro', label: 'One Dark Pro' },
];

export const THEME_KEY = 'dashboard.theme';

export function loadThemeId(): string {
  const id = readPref(THEME_KEY, 'dark-plus');
  return THEMES.some((t) => t.id === id) ? id : 'dark-plus';
}

// o atributo vai no <html> (document.documentElement), NAO no shell — title
// bar, paineis de terminal e modais renderizam via createPortal pro <body>,
// fora da arvore do AppShell, e so herdam as custom properties se elas
// estiverem definidas la em cima (ver theme/themes.css).
export function applyTheme(id: string): void {
  document.documentElement.setAttribute('data-theme', id);
  writePref(THEME_KEY, id);
}
