export {};

declare global {
  interface Window {
    dashboardAPI?: {
      platform: 'darwin' | 'win32' | 'linux' | string;
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
