const { app, BrowserWindow } = require('electron');
const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');
const root = path.resolve(process.argv[2] || path.join(__dirname, '..', '..', 'dist'));
const sessions = Array.from({ length: 24 }, (_, index) => ({ sessionId: `fixture-${index}`, pid: 1000 + index, cwd: '/fixture', name: `Agente ${index}`, llm: 'claude', alive: true, status: 'idle', startedAt: Date.now() - 60000 }));
const requests = {};
const errors = [];
const delay = (milliseconds) => new Promise(resolve => setTimeout(resolve, milliseconds));
app.commandLine.appendSwitch('enable-precise-memory-info');
app.whenReady().then(async () => {
  const server = http.createServer((request, response) => {
    const url = new URL(request.url, 'http://localhost');
    response.setHeader('Access-Control-Allow-Origin', '*');
    if (url.pathname.startsWith('/api/')) {
      requests[url.pathname] = (requests[url.pathname] || 0) + 1;
      if (url.pathname === '/api/stream') {
        response.writeHead(200, { 'Content-Type': 'text/event-stream' });
        response.write('data: {"kind":"ping"}\n\n');
        const timer = setInterval(() => response.write('data: {"kind":"ping"}\n\n'), 1000);
        request.on('close', () => clearInterval(timer));
        return;
      }
      const value = url.pathname === '/api/state' ? { sessions, teams: [], now: Date.now() }
        : url.pathname.includes('cost') ? { perSession: {}, tokensTotal: 0, costBrl: 0, costUsd: 0, inputTokens: 0, outputTokens: 0 }
        : { llms: [], claude: null, codex: null, agents: [], skills: [], commands: [], tools: [], mcps: [], claudeAuthenticated: false };
      response.writeHead(200, { 'Content-Type': 'application/json' });
      response.end(JSON.stringify(value));
      return;
    }
    const target = path.join(root, url.pathname.includes('.') ? url.pathname : 'index.html');
    if (!target.startsWith(root) || !fs.existsSync(target)) { response.writeHead(404); response.end(); return; }
    const mime = { '.js': 'text/javascript', '.css': 'text/css', '.html': 'text/html', '.png': 'image/png' }[path.extname(target)] || 'application/octet-stream';
    response.writeHead(200, { 'Content-Type': mime });
    fs.createReadStream(target).pipe(response);
  });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const origin = `http://127.0.0.1:${server.address().port}`;
  const window = new BrowserWindow({ width: 1280, height: 800, show: true, webPreferences: { contextIsolation: true, nodeIntegration: false } });
  window.webContents.session.webRequest.onBeforeRequest({ urls: ['http://localhost:8765/*'] }, (details, callback) => callback({ redirectURL: origin + new URL(details.url).pathname }));
  window.webContents.on('console-message', (_, level, message) => { if (level >= 3) errors.push(message); });
  const sample = async (phase) => {
    const result = await window.webContents.executeJavaScript(`({heapMiB: performance.memory.usedJSHeapSize / 1048576, nodes: document.querySelectorAll('*').length, canvases: document.querySelectorAll('canvas').length, text: document.body.innerText.slice(0, 180)})`);
    console.log(JSON.stringify({ phase, ...result, processes: app.getAppMetrics().map(metric => ({ type: metric.type, workingSetMiB: metric.memory.workingSetSize / 1024 })), requests }));
    return result;
  };
  try {
    await window.loadURL(origin);
    await delay(2500);
    assert.equal((await sample('home')).canvases, 0);
    await window.webContents.executeJavaScript(`document.querySelector('[aria-label="Astra"]').click()`);
    await delay(4000);
    assert.equal((await sample('astra')).canvases, 1);
    await window.webContents.executeJavaScript(`document.querySelector('[aria-label="Folha de agentes"]').click()`);
    await delay(2500);
    assert.equal((await sample('returned')).canvases, 0);
    window.hide();
    await delay(2500);
    const before = { ...requests };
    await delay(3000);
    console.log(JSON.stringify({ phase: 'hidden', before, after: requests, errors }));
    assert.deepEqual(requests, before, 'UI polling should stop while the window is hidden');
    assert.deepEqual(errors, []);
  } catch (error) { console.error(error, errors); process.exitCode = 1; }
  window.destroy();
  server.close();
  app.exit(process.exitCode || 0);
});
