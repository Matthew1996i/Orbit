import type { CapacitorElectronConfig } from '@capacitor-community/electron';
import { getCapacitorElectronConfig, setupElectronDeepLinking } from '@capacitor-community/electron';
import type { MenuItemConstructorOptions } from 'electron';
import { app, BrowserWindow, dialog, ipcMain, Menu, MenuItem } from 'electron';
import electronIsDev from 'electron-is-dev';
import unhandled from 'electron-unhandled';
import { autoUpdater } from 'electron-updater';
import { join } from 'path';

import { startBackend, stopBackend } from './backend';
import { ElectronCapacitorApp, setupContentSecurityPolicy, setupReloadWatcher } from './setup';

// Graceful handling of unhandled errors.
unhandled();

// Define our menu templates (these are optional)
const trayMenuTemplate: (MenuItemConstructorOptions | MenuItem)[] = [new MenuItem({ label: 'Quit App', role: 'quit' })];
const appMenuBarMenuTemplate: (MenuItemConstructorOptions | MenuItem)[] = [
  { role: process.platform === 'darwin' ? 'appMenu' : 'fileMenu' },
  { role: 'viewMenu' },
];

// Get Config options from capacitor.config
const capacitorFileConfig: CapacitorElectronConfig = getCapacitorElectronConfig();

// Initialize our app. You can pass menu templates into the app here.
// const myCapacitorApp = new ElectronCapacitorApp(capacitorFileConfig);
const myCapacitorApp = new ElectronCapacitorApp(capacitorFileConfig, trayMenuTemplate, appMenuBarMenuTemplate);

// so uma instancia por vez — sem isso, rodar `npx electron .` de novo sem
// ter certeza que a instancia anterior morreu de verdade (ex: um kill que
// nao pegou o backend Python a tempo) sobe uma SEGUNDA arvore inteira de
// janelas em paralelo, cada uma com seu proprio Map de janelas "destacadas"
// (ver open-session-window abaixo) — e uma janela orfa de uma instancia
// anterior pode aparecer na frente sem nenhuma relacao com o que o usuario
// acabou de clicar na instancia atual. app.quit() aqui encerra a instancia
// NOVA na hora (antes dela sequer chegar no app.whenReady() abaixo); a
// instancia ANTIGA (que ja tinha o lock) so foca a propria janela principal.
const gotSingleInstanceLock = app.requestSingleInstanceLock();
if (!gotSingleInstanceLock) {
  app.quit();
} else {
  app.on('second-instance', () => {
    const win = myCapacitorApp.getMainWindow();
    if (!win) return;
    if (win.isMinimized()) win.restore();
    win.focus();
  });
}

// If deeplinking is enabled then we will set it up here.
if (capacitorFileConfig.electron?.deepLinkingEnabled) {
  setupElectronDeepLinking(myCapacitorApp, {
    customProtocol: capacitorFileConfig.electron.deepLinkingCustomProtocol ?? 'mycapacitorapp',
  });
}

// If we are in Dev mode, use the file watcher components.
if (electronIsDev) {
  setupReloadWatcher(myCapacitorApp);
}

// Run Application — so segue se essa instancia realmente pegou o lock
// (app.quit() acima ja foi chamado pra outra, mas nao interrompe a execucao
// sincrona do resto do modulo por conta propria).
if (gotSingleInstanceLock) (async () => {
  // Wait for electron app to be ready.
  await app.whenReady();
  // Security - Set Content-Security-Policy based on whether or not we are in dev mode.
  setupContentSecurityPolicy(myCapacitorApp.getCustomURLScheme());
  // Sobe o backend Python (se ainda nao estiver rodando) antes de carregar a
  // UI, pra funcionar com um unico app instalado, sem exigir uma segunda
  // instancia manual do server.py.
  await startBackend();
  // Initialize our app, build windows, and load content.
  await myCapacitorApp.init();
  // Remove a barra de menu nativa do SO (File/View) — o app tem seu próprio
  // menu customizado embutido na UI, não precisa do menu nativo do Electron.
  Menu.setApplicationMenu(null);
  // Checagem de update desligada: o app nunca é publicado/empacotado com feed de
  // update configurado, e isso ficava disparando uma notificação nativa confusa
  // ("Claude Sessions" + \"\" está pronto) sem relação com nenhuma ação do usuário.
  if (app.isPackaged) {
    autoUpdater.checkForUpdatesAndNotify();
  }
})();

// localStorage (onde o app guarda quais paineis estavam abertos, pra
// reabrir sozinho no proximo boot) e escrito em disco de forma assincrona
// pelo Chromium — fechar o app rapido demais (app.quit() direto) podia sair
// ANTES desse flush terminar, perdendo a lista de paineis abertos mesmo com
// os agentes de verdade continuando vivos no backend. Intercepta o quit uma
// vez, forca o flush, e so entao deixa sair de fato.
let quittingAfterFlush = false;
app.on('before-quit', (event) => {
  if (quittingAfterFlush) return;
  const win = myCapacitorApp.getMainWindow();
  if (!win || win.isDestroyed()) return;
  event.preventDefault();
  quittingAfterFlush = true;
  win.webContents.session.flushStorageData();
  setTimeout(() => app.quit(), 150);
});

// Handle when all of our windows are close (platforms have their own expectations).
app.on('window-all-closed', function () {
  // On OS X it is common for applications and their menu bar
  // to stay active until the user quits explicitly with Cmd + Q
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

// Encerra o backend (se foi essa instancia que o subiu) quando o app
// realmente vai fechar de vez.
app.on('will-quit', () => {
  stopBackend();
});

// When the dock icon is clicked.
app.on('activate', async function () {
  // On OS X it's common to re-create a window in the app when the
  // dock icon is clicked and there are no other windows open.
  if (myCapacitorApp.getMainWindow().isDestroyed()) {
    await myCapacitorApp.init();
  }
});

// Place all ipc or other electron api calls and custom functionality under this line

ipcMain.handle('pick-directory', async () => {
  // Importante: NAO passar a janela principal como "parent" aqui e NAO usar
  // setAlwaysOnTop nela. No Linux/X11, um parent "always on top" pode ficar
  // acima do proprio dialogo filho (o WM nao necessariamente da prioridade de
  // empilhamento pro filho sobre um pai fixado no topo) — foi isso que piorou
  // o problema numa tentativa anterior. Abrir o dialogo SEM parent faz o WM
  // tratar como uma janela de topo independente, com foco normal ao abrir.
  const result = await dialog.showOpenDialog({
    properties: ['openDirectory', 'createDirectory'],
  });
  if (result.canceled || result.filePaths.length === 0) return null;
  return result.filePaths[0];
});

// suporte pro menu customizado da UI (substitui a barra nativa File/View removida acima)
ipcMain.handle('quit-app', () => app.quit());
ipcMain.handle('reload-app', () => myCapacitorApp.getMainWindow().reload());
ipcMain.handle('get-app-version', () => app.getVersion());

// controles de janela pra barra de titulo customizada (frame: false = sem
// chrome nativo do SO, entao min/max/close precisam ser reimplementados
// aqui) — resolve a janela pelo REMETENTE do IPC (event.sender), nao mais
// hardcoded pra janela principal, pra esses mesmos 4 canais funcionarem
// tanto na janela principal quanto numa janela "destacada" (ver
// open-session-window abaixo, tambem frame:false agora, cada uma com sua
// propria barra de titulo customizada em React).
ipcMain.handle('window-minimize', (event) => BrowserWindow.fromWebContents(event.sender)?.minimize());
ipcMain.handle('window-toggle-maximize', (event) => {
  const win = BrowserWindow.fromWebContents(event.sender);
  if (!win) return false;
  if (win.isMaximized()) {
    win.unmaximize();
  } else {
    win.maximize();
  }
  return win.isMaximized();
});
ipcMain.handle('window-close', (event) => BrowserWindow.fromWebContents(event.sender)?.close());
ipcMain.handle('window-is-maximized', (event) => BrowserWindow.fromWebContents(event.sender)?.isMaximized() ?? false);

// "destacar terminal pra fora do app" — abre uma janela OS de verdade pra
// renderizar so o terminal de UMA sessao (rota /session/:id no mesmo build
// React, ver SessionWindow.tsx). frame:false igual a janela principal — a
// UI (nao o SO) desenha a barra de titulo customizada, com "externo - " no
// titulo (ver PopoutTitleBar em SessionWindow.tsx) pra deixar claro de
// longe que essa janela e uma sessao destacada, nao a janela principal do
// app. Um Map por sessionId evita abrir duas janelas pra mesma sessao se o
// usuario clicar de novo — so foca a que ja existe.
const sessionWindows = new Map<string, BrowserWindow>();

ipcMain.handle('open-session-window', (_event, sessionId: string) => {
  const existing = sessionWindows.get(sessionId);
  if (existing && !existing.isDestroyed()) {
    existing.focus();
    return;
  }
  const preloadPath = join(app.getAppPath(), 'build', 'src', 'preload.js');
  const win = new BrowserWindow({
    width: 920,
    height: 619,
    // tamanho fixo (920x619, igual o painel interno) — sem resize manual
    // nenhum, nem por borda nem por maximizar (o reflow em si funciona pra
    // qualquer tamanho, ver correcao do PTY compartilhado em server.py, mas
    // manter as janelas num tamanho unico e conhecido evita layouts
    // esquisitos da TUI da CLI em proporcoes fora do validado).
    resizable: false,
    title: 'Orbit',
    frame: false,
    webPreferences: {
      nodeIntegration: true,
      contextIsolation: true,
      preload: preloadPath,
    },
  });
  sessionWindows.set(sessionId, win);
  win.on('closed', () => sessionWindows.delete(sessionId));
  win.loadURL(`${myCapacitorApp.getCustomURLScheme()}://-/session/${encodeURIComponent(sessionId)}`);
});
