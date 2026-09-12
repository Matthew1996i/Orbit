export type TerminalPlacement = 'floating' | 'docked' | 'minimized';

export function terminalDropPlacement(
  x: number,
  y: number,
  width: number,
  titlebarHeight: number,
  dockedWidth = 280,
): TerminalPlacement {
  const dockStart = width - dockedWidth;
  // A faixa real começa logo abaixo da titlebar e inclui o respiro/altura da
  // tab; a tolerância evita perder o destino quando o cursor passa pela borda.
  if (y >= titlebarHeight && y < titlebarHeight + 60 && x < dockStart) return 'minimized';
  if (x >= dockStart && y >= titlebarHeight) return 'docked';
  return 'floating';
}
