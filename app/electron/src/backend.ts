import { spawn, ChildProcess } from 'child_process';
import { app } from 'electron';
import http from 'http';
import { join } from 'path';

const BACKEND_PORT = 8765;
let backendProcess: ChildProcess | null = null;

function isPortOpen(port: number): Promise<boolean> {
  return new Promise((resolve) => {
    const req = http.get({ host: 'localhost', port, path: '/', timeout: 800 }, (res) => {
      res.resume();
      resolve(true);
    });
    req.on('error', () => resolve(false));
    req.on('timeout', () => {
      req.destroy();
      resolve(false);
    });
  });
}

function getServerScriptPath(): string {
  // Empacotado: server.py vai pra resourcesPath via "extraResources" no
  // electron-builder.config.json. Em dev, roda direto do repo (4 niveis
  // acima de build/src: build -> electron -> app -> raiz do repo).
  return app.isPackaged
    ? join(process.resourcesPath, 'server.py')
    : join(__dirname, '..', '..', '..', '..', 'server.py');
}

async function waitForPort(port: number, timeoutMs: number): Promise<boolean> {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    if (await isPortOpen(port)) return true;
    await new Promise((r) => setTimeout(r, 300));
  }
  return false;
}

// Sobe o backend Python automaticamente se ninguem ja estiver escutando na
// porta — assim o usuario so precisa abrir o app instalado, sem rodar
// "python3 server.py" numa segunda instancia manualmente. Se a porta ja
// estiver ocupada (ex: dev com o backend rodando a parte num terminal),
// nao sobe outra copia — so aproveita a que ja existe.
export async function startBackend(): Promise<void> {
  if (await isPortOpen(BACKEND_PORT)) {
    return;
  }
  const scriptPath = getServerScriptPath();
  backendProcess = spawn('python3', [scriptPath, String(BACKEND_PORT)], {
    stdio: 'ignore',
    detached: false,
  });
  backendProcess.on('error', (err) => {
    console.error('Falha ao iniciar o backend Python:', err);
  });
  await waitForPort(BACKEND_PORT, 8000);
}

// So mata o processo se essa instancia foi quem o iniciou — se o backend ja
// estava rodando externamente (ex: dev), deixa vivo pra nao interromper quem
// esta com o servidor aberto num terminal separado.
export function stopBackend(): void {
  if (backendProcess && !backendProcess.killed) {
    backendProcess.kill('SIGTERM');
    backendProcess = null;
  }
}
