// Tema fixo da aplicacao inteira — pedido explicito: nao ha mais selecao de
// tema (removida a submenu "Tema" da ActivityBar e todo o estado associado
// em AppShell), entao nao deve existir nenhuma UI que sugira que o Dracula e
// "um tema escolhido" ou que outros temas ainda sao selecionaveis.
export const FIXED_THEME_ID = 'dracula';

// o atributo vai no <html> (document.documentElement), NAO no shell — title
// bar, paineis de terminal e modais renderizam via createPortal pro <body>,
// fora da arvore do AppShell, e so herdam as custom properties se elas
// estiverem definidas la em cima (ver theme/themes.css).
export function applyFixedTheme(): void {
  document.documentElement.setAttribute('data-theme', FIXED_THEME_ID);
}
