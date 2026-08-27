# Orbit (Claude Sessions Dashboard)

Dashboard local para acompanhar e interagir com as sessões do Claude Code
rodando na sua máquina. É composto por duas partes:

- **Backend** (`server.py`): servidor HTTP/WebSocket em Python puro (só
  biblioteca padrão, sem `pip install`), que lê o estado das sessões em
  `~/.claude/sessions`, `~/.claude/teams` e `~/.claude/projects`, e expõe
  terminais interativos via PTY.
- **Frontend** (`app/`): aplicação Ionic + React + Vite, empacotada como
  app desktop via Electron (`app/electron/`). Também existe uma UI estática
  simples em `static/index.html`, servida diretamente pelo backend.

> ⚠️ **Compatibilidade de SO do backend**: `server.py` usa os módulos
> `pty`, `fcntl` e `termios`, que só existem em sistemas **POSIX**
> (Linux e macOS). No Windows, rode o backend dentro do **WSL** (Windows
> Subsystem for Linux) — veja a seção [Windows](#windows) abaixo. O
> frontend/Electron roda nativamente em qualquer SO.

---

## Pré-requisitos

| Ferramenta | Versão mínima | Para quê |
|---|---|---|
| Python 3   | 3.9+          | Rodar o backend |
| Node.js    | 18+ (recomendado 20+) | Build do frontend e do app Electron |
| npm        | vem com o Node | Instalar dependências |

Não há `requirements.txt` — o backend não tem dependências externas.

---

## Rodando localmente (modo desenvolvimento)

### 1. Suba o backend

```bash
python3 server.py 8765
```

O servidor sobe em `http://localhost:8765` e já expõe uma UI mínima em
`static/index.html` — basta abrir essa URL no navegador para começar a usar
sem precisar buildar nada do frontend.

Deixe esse terminal aberto (ou rode em background, veja `run.sh` como
referência de como o projeto faz isso com `setsid`/`nohup`).

### 2a. Opção rápida: script pronto (Linux/macOS)

```bash
./run.sh
```

Esse script:
1. Sobe o backend em `:8765` (se ainda não estiver rodando), destacado do
   terminal atual (sobrevive a fechar a aba/terminal).
2. Abre o app Electron a partir de `app/electron` via `npx electron`.

Pré-requisito: já ter rodado `npm install` em `app/electron` (veja abaixo)
e o `build/` do Electron já gerado (`npm run build` dentro de `app/electron`).

### 2b. Rodando o frontend em modo dev (com hot reload)

Útil quando você está mexendo na UI e quer reload automático no navegador,
sem precisar do Electron:

```bash
cd app
npm install
npm run dev
```

Abre em `http://localhost:5173` (padrão do Vite) e já consome o backend em
`http://localhost:8765` (URL fixa em `app/src/api.ts`).

### 2c. Rodando o app desktop (Electron) em modo dev

```bash
# 1) instale as deps do app web e gere o dist/
cd app
npm install
npm run build

# 2) instale as deps do wrapper Electron
cd electron
npm install

# 3) rode em modo live-reload (recompila ao salvar)
npm run electron:start-live

# ou, sem live-reload:
npm run electron:start
```

O backend (`python3 server.py 8765`) precisa estar rodando em paralelo —
o app Electron não sobe o backend sozinho no modo dev (só o `run.sh` faz
isso).

---

## Build de instalador / distribuição para qualquer SO

O empacotamento usa **electron-builder**, configurado em
`app/electron/electron-builder.config.json`, com alvos para Windows, macOS
e Linux.

### Passo comum a todos os SOs

```bash
cd app
npm install
npm run build          # gera app/dist (bundle web de produção)

cd electron
npm install
```

> **Importante:** o `electron-builder` empacota o binário nativo para a
> plataforma em que você **roda o build** (não faz cross-compile completo
> de forma confiável entre SOs diferentes). Para gerar o instalador de cada
> SO, rode o comando correspondente numa máquina (ou VM/CI) daquele SO.

### Windows

Rodar em uma máquina Windows (PowerShell/CMD) dentro de `app/electron`:

```powershell
npm run electron:make
```

Gera um instalador `.exe` (NSIS) em `app/electron/dist/`. O instalador
permite escolher o diretório de instalação (`allowToChangeInstallationDirectory`)
e pede elevação quando necessário.

**Instalar:** rode o `.exe` gerado e siga o assistente.

### macOS

Rodar em uma máquina macOS dentro de `app/electron`:

```bash
npm run electron:make
```

Gera um `.dmg` em `app/electron/dist/`.

**Instalar:** abra o `.dmg`, arraste o app para a pasta `Applications`.

> Para distribuir fora da App Store sem o macOS bloquear por "app de
> desenvolvedor não identificado", é necessário assinar e notarizar o
> build (fora do escopo desta configuração padrão).

### Linux

Rodar em uma máquina Linux dentro de `app/electron`:

```bash
npm run electron:make
```

Gera dois formatos em `app/electron/dist/`:
- **AppImage** (`*.AppImage`): portátil, não precisa instalar.
  ```bash
  chmod +x ClaudeSessions-*.AppImage
  ./ClaudeSessions-*.AppImage
  ```
- **`.deb`** (Debian/Ubuntu):
  ```bash
  sudo dpkg -i claude-sessions_*.deb
  ```

### Build sem gerar instalador (pasta descompactada, para testar rápido)

Em qualquer SO, dentro de `app/electron`:

```bash
npm run electron:pack
```

Gera o app descompactado (sem instalador) em `app/electron/dist/`, útil
para testar o empacotamento sem esperar o instalador final.

### Rodando o app buildado

O app Electron buildado **não sobe o backend sozinho**. Antes de abrir o
executável instalado, garanta que o backend está rodando:

```bash
python3 server.py 8765
```

(ou use um script/atalho equivalente ao `run.sh` no seu SO).

---

## Windows

Como `server.py` depende de módulos POSIX (`pty`, `fcntl`, `termios`), o
backend não roda em Python nativo do Windows. Duas opções:

1. **WSL (recomendado):** instale o WSL (`wsl --install`), abra uma
   distro Linux (ex: Ubuntu) e rode `python3 server.py 8765` de dentro
   dela. O app Electron (rodando nativamente no Windows) consegue acessar
   `localhost:8765` normalmente, já que o WSL2 compartilha rede com o
   host via `localhost`.
2. Rodar tudo (backend + Electron) dentro do WSL com um servidor X (ex:
   WSLg, já incluso no WSL2 recente), se preferir não misturar host
   Windows + WSL.

---

## Estrutura do repositório

```
.
├── server.py              # backend HTTP/WebSocket (stdlib apenas)
├── run.sh                 # sobe backend + abre Electron (Linux/macOS)
├── static/                # UI mínima servida direto pelo backend
└── app/                   # frontend Ionic + React + Vite
    ├── src/                # código da UI
    ├── dist/               # build de produção (gerado por `npm run build`)
    └── electron/           # wrapper desktop (Capacitor Electron)
        ├── src/            # main process do Electron
        └── electron-builder.config.json  # config de empacotamento
```
