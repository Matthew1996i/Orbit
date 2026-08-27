export {};

declare global {
  interface Window {
    dashboardAPI?: {
      pickDirectory: () => Promise<string | null>;
      quitApp: () => Promise<void>;
      reloadApp: () => Promise<void>;
      getAppVersion: () => Promise<string>;
      windowMinimize: () => Promise<void>;
      windowToggleMaximize: () => Promise<boolean>;
      windowClose: () => Promise<void>;
      windowIsMaximized: () => Promise<boolean>;
    };
  }
}
