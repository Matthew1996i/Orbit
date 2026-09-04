export type OsPlatform = 'mac' | 'windows' | 'linux';

// so os controles de janela usam isso — decide se cada "janela" (real, via
// Electron, ou simulada, como o header do TerminalPanel) deve imitar mac
// (semaforos/dots), Windows (botoes quadrados) ou Linux/GNOME (botoes
// circulares), ver TitleBar.css e TerminalPanel.css.
export function getOsPlatform(): OsPlatform {
  const raw = window.dashboardAPI?.platform;
  if (raw === 'darwin') return 'mac';
  if (raw === 'win32') return 'windows';
  return 'linux';
}
