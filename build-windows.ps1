# Builda o instalador Windows (.exe via NSIS) em app\electron\dist.
# Rodar numa maquina Windows (electron-builder nao faz cross-compile confiavel).
$ErrorActionPreference = "Stop"
Set-Location $PSScriptRoot

Write-Host "==> Instalando deps e buildando o frontend (app/)"
Set-Location app
npm install
npm run build

# O Electron NAO serve direto de app/dist — ele le de app/electron/app/, uma
# copia sincronizada pelo Capacitor. Sem esse passo o instalador empacota o
# bundle web ANTIGO, mesmo com o dist/ atualizado.
Write-Host "==> Sincronizando o bundle web pro Electron (cap copy)"
npx cap copy electron

Write-Host "==> Instalando deps e empacotando o app Electron (app/electron)"
Set-Location electron
npm install
npm run electron:make

Write-Host "==> Pronto. Instalador .exe em app\electron\dist\"
