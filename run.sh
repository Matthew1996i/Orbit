#!/usr/bin/env bash
# Sobe o backend (se nao estiver rodando) e abre o app desktop (Electron).
set -e
cd "$(dirname "$0")"

if ! pgrep -f "python3 server.py 8765" > /dev/null; then
  echo "Iniciando backend em :8765..."
  # setsid (nao so nohup): tira o backend da sessao/grupo de processos deste
  # terminal de vez — assim ele (e os agentes que ele mantem vivos) sobrevive
  # tanto a fechar so a janela do Electron quanto a fechar o terminal/aba que
  # rodou este script, ate o usuario matar o agente explicitamente pelo app.
  setsid nohup python3 server.py 8765 > /tmp/claude-sessions-dashboard-backend.log 2>&1 < /dev/null &
  disown
  sleep 1
else
  echo "Backend já está rodando."
fi

cd app/electron
echo "Abrindo o app..."
npx electron --no-sandbox ./
