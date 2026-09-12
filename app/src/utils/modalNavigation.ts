import { createContext, useContext, useEffect } from 'react';

export const ModalNavigationContext = createContext<() => void>(() => {});

// Notifica a navegação na abertura, inclusive em diálogos renderizados por portal.
export function useModalNavigation(open: boolean) {
  const dismissNavigation = useContext(ModalNavigationContext);
  useEffect(() => {
    if (open) dismissNavigation();
  }, [open, dismissNavigation]);
}
