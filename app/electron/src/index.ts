import type { CapacitorElectronConfig } from '@capacitor-community/electron';
import { getCapacitorElectronConfig, setupElectronDeepLinking } from '@capacitor-community/electron';
import type { MenuItemConstructorOptions } from 'electron';
import { app, dialog, ipcMain, Menu, MenuItem } from 'electron';
import electronIsDev from 'electron-is-dev';
import unhandled from 'electron-unhandled';
import { autoUpdater } from 'electron-updater';

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

// Run Application
(async () => {
  // Wait for electron app to be ready.
  await app.whenReady();
  // Security - Set Content-Security-Policy based on whether or not we are in dev mode.
  setupContentSecurityPolicy(myCapacitorApp.getCustomURLScheme());
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
// chrome nativo do SO, entao min/max/close precisam ser reimplementados aqui)
ipcMain.handle('window-minimize', () => myCapacitorApp.getMainWindow().minimize());
ipcMain.handle('window-toggle-maximize', () => {
  const win = myCapacitorApp.getMainWindow();
  if (win.isMaximized()) {
    win.unmaximize();
  } else {
    win.maximize();
  }
  return win.isMaximized();
});
ipcMain.handle('window-close', () => myCapacitorApp.getMainWindow().close());
ipcMain.handle('window-is-maximized', () => myCapacitorApp.getMainWindow().isMaximized());
