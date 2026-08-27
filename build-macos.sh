#!/usr/bin/env bash
# Builda o instalador macOS (.dmg) em app/electron/dist.
# Rodar numa maquina macOS (electron-builder nao faz cross-compile confiavel).
set -e
cd "$(dirname "$0")"

echo "==> Instalando deps e buildando o frontend (app/)"
cd app
npm install
npm run build

# O Electron NAO serve direto de app/dist — ele le de app/electron/app/, uma
# copia sincronizada pelo Capacitor. Sem esse passo o instalador empacota o
# bundle web ANTIGO, mesmo com o dist/ atualizado.
echo "==> Sincronizando o bundle web pro Electron (cap copy)"
npx cap copy electron

echo "==> Instalando deps e empacotando o app Electron (app/electron)"
cd electron
npm install
npm run electron:make

echo "==> Pronto. Instalador .dmg em app/electron/dist/"
echo "    (nao assinado/notarizado — necessario fora deste script para distribuir"
echo "    fora da App Store sem bloqueio do Gatekeeper)"
