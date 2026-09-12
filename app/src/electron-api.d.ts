export {};

declare global {
  interface OrbitUpdateState {
    phase: 'idle' | 'checking' | 'current' | 'available' | 'downloading' | 'ready' | 'installing' | 'error';
    currentVersion: string;
    version?: string;
    progress?: number;
    message?: string;
    installMode: 'restart' | 'installer' | 'file';
  }
  interface Window {
    dashboardAPI?: {
      platform: 'darwin' | 'win32' | 'linux' | string;
      getUpdateState: () => Promise<OrbitUpdateState>;
      checkForUpdates: () => Promise<OrbitUpdateState>;
      downloadUpdate: () => Promise<OrbitUpdateState>;
      installUpdate: () => Promise<OrbitUpdateState>;
      onUpdateState: (callback: (state: OrbitUpdateState) => void) => () => void;
      pickDirectory: () => Promise<string | null>;
      quitApp: () => Promise<void>;
      reloadApp: () => Promise<void>;
      getAppVersion: () => Promise<string>;
      openExternal: (url: string) => Promise<void>;
      windowMinimize: () => Promise<void>;
      windowToggleMaximize: () => Promise<boolean>;
      windowClose: () => Promise<void>;
      windowIsMaximized: () => Promise<boolean>;
      openSessionWindow: (sessionId: string) => Promise<void>;
    };
  }
}
