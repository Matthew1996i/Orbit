import React from 'react';
import { createRoot } from 'react-dom/client';
import App from './App';
import {  } from '@phosphor-icons/react';
import { IconContext } from '@phosphor-icons/react';
import { applyFixedTheme } from './theme/themes';

// aplica o data-theme ANTES do primeiro render — sem isso o <html> nasce sem
// atributo (cai no :root default) e so ganha o tema depois que o AppShell
// monta, produzindo um flash visivel da paleta errada no boot. Tema fixo em
// Dracula pra aplicacao inteira, sem selecao do usuario (ver theme/themes.ts).
applyFixedTheme();

const container = document.getElementById('root');
const root = createRoot(container!);
root.render(
  <React.StrictMode>
    {/* todos os icones da aplicacao (Phosphor) no peso solido — pedido
        explicito; troca o estilo inteiro num lugar so. */}
    <IconContext.Provider value={{ weight: 'fill' }}>
      <App />
    </IconContext.Provider>
  </React.StrictMode>
);