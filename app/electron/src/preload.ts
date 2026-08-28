require('./rt/electron-rt');
//////////////////////////////
// User Defined Preload scripts below
console.log('User Preload!');

const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('dashboardAPI', {
  pickDirectory: () => ipcRenderer.invoke('pick-directory'),
  quitApp: () => ipcRenderer.invoke('quit-app'),
  reloadApp: () => ipcRenderer.invoke('reload-app'),
  getAppVersion: () => ipcRenderer.invoke('get-app-version'),
  windowMinimize: () => ipcRenderer.invoke('window-minimize'),
  windowToggleMaximize: () => ipcRenderer.invoke('window-toggle-maximize'),
  windowClose: () => ipcRenderer.invoke('window-close'),
  windowIsMaximized: () => ipcRenderer.invoke('window-is-maximized'),
  openSessionWindow: (sessionId) => ipcRenderer.invoke('open-session-window', sessionId),
});
