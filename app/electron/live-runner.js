/* eslint-disable no-undef */
/* eslint-disable @typescript-eslint/no-var-requires */
const cp = require('child_process');
const chokidar = require('chokidar');
const electron = require('electron');
const http = require('http');
const path = require('path');

let child = null;
let ownedVite = null;
const npmCmd = process.platform === 'win32' ? 'npm.cmd' : 'npm';
const devUrl = 'http://127.0.0.1:5173';
const reloadWatcher = {
  debouncer: null,
  ready: false,
  watcher: null,
  restarting: false,
};

///*
function runBuild() {
  return new Promise((resolve, reject) => {
    let tempChild = cp.spawn(npmCmd, ['run', 'build']);
    tempChild.once('exit', (code) => code === 0 ? resolve() : reject(new Error(`Electron build falhou (${code})`)));
    tempChild.stdout.pipe(process.stdout);
    tempChild.stderr.pipe(process.stderr);
  });
}
//*/

const viteReady = () => new Promise((resolve) => {
  const request = http.get(`${devUrl}/@vite/client`, { timeout: 800 }, (response) => {
    response.resume();
    resolve(response.statusCode === 200);
  });
  request.on('error', () => resolve(false));
  request.on('timeout', () => { request.destroy(); resolve(false); });
});

async function startVite() {
  if (await viteReady()) return;
  ownedVite = cp.spawn(npmCmd, ['run', 'dev', '--', '--host', '127.0.0.1', '--strictPort'], {
    cwd: path.join(__dirname, '..'),
  });
  ownedVite.stdout.pipe(process.stdout);
  ownedVite.stderr.pipe(process.stderr);
  for (let attempt = 0; attempt < 80; attempt++) {
    if (await viteReady()) return;
    if (ownedVite.exitCode !== null) break;
    await new Promise((resolve) => setTimeout(resolve, 250));
  }
  throw new Error('Vite não iniciou na porta 5173');
}

process.on('exit', () => ownedVite?.kill());

async function spawnElectron() {
  if (child !== null) {
    child.stdin.pause();
    child.kill();
    child = null;
    await runBuild();
  }
  child = cp.spawn(electron, ['--inspect=5858', './'], {
    env: { ...process.env, ORBIT_DEV_URL: devUrl },
  });
  child.on('exit', () => {
    if (!reloadWatcher.restarting) {
      process.exit(0);
    }
  });
  child.stdout.pipe(process.stdout);
  child.stderr.pipe(process.stderr);
}

function setupReloadWatcher() {
  reloadWatcher.watcher = chokidar
    .watch('./src/**/*', {
      ignored: /[/\\]\./,
      persistent: true,
    })
    .on('ready', () => {
      reloadWatcher.ready = true;
    })
    .on('all', (_event, _path) => {
      if (reloadWatcher.ready) {
        clearTimeout(reloadWatcher.debouncer);
        reloadWatcher.debouncer = setTimeout(async () => {
          console.log('Restarting');
          reloadWatcher.restarting = true;
          await spawnElectron();
          reloadWatcher.restarting = false;
          reloadWatcher.ready = false;
          clearTimeout(reloadWatcher.debouncer);
          reloadWatcher.debouncer = null;
          reloadWatcher.watcher = null;
          setupReloadWatcher();
        }, 500);
      }
    });
}

(async () => {
  await startVite();
  await runBuild();
  await spawnElectron();
  setupReloadWatcher();
})().catch((error) => { console.error(error); process.exitCode = 1; });
