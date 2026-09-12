import { MAC_INSTALL_SCRIPT } from './updateInstallScript';
import { app, BrowserWindow, Notification, ipcMain, shell } from 'electron';
import { get } from 'https';
import { createHash } from 'crypto';
import { createReadStream, createWriteStream, promises as fs, constants } from 'fs';
import { dirname, join } from 'path';
import { execFile, spawn } from 'child_process';
import { promisify } from 'util';
import { Transform } from 'stream';
import { pipeline } from 'stream/promises';
import { REPOSITORY, newerVersion, selectReleaseAsset, Release, ReleaseAsset } from './updateRelease';

const exec = promisify(execFile);
type Phase = 'idle' | 'checking' | 'current' | 'available' | 'downloading' | 'ready' | 'installing' | 'error';
interface UpdateState { phase: Phase; currentVersion: string; version?: string; progress?: number; message?: string; installMode: 'restart' | 'installer' | 'file' }
let state: UpdateState;
let selected: ReleaseAsset | undefined;
let downloaded = '';
let workDir = '';
let busy = false;
let notifiedVersion = '';

function publish(change: Partial<UpdateState>) {
  state = { ...state, message: undefined, ...change };
  for (const win of BrowserWindow.getAllWindows()) {
    if (!win.isDestroyed()) win.webContents.send('app-update-state', state);
  }
  return state;
}

function request(url: string, redirects = 0): Promise<import('http').IncomingMessage> {
  return new Promise((resolve, reject) => {
    const parsed = new URL(url);
    if (parsed.protocol !== 'https:' || !['api.github.com', 'github.com', 'release-assets.githubusercontent.com', 'objects.githubusercontent.com'].includes(parsed.hostname)) {
      reject(new Error('Endereço de atualização inválido.')); return;
    }
    const req = get(parsed, { headers: { 'User-Agent': 'Orbit-Updater', Accept: 'application/vnd.github+json' } }, (res) => {
      if (res.statusCode && res.statusCode >= 300 && res.statusCode < 400 && res.headers.location && redirects < 5) {
        res.resume(); resolve(request(new URL(res.headers.location, parsed).href, redirects + 1)); return;
      }
      if (res.statusCode !== 200) { res.resume(); reject(new Error(`GitHub indisponível (HTTP ${res.statusCode}). Tente novamente mais tarde.`)); return; }
      res.setTimeout(30000, () => res.destroy(new Error('O download ficou sem resposta. Tente novamente.')));
      resolve(res);
    });
    req.setTimeout(30000, () => req.destroy(new Error('Sem resposta do GitHub. Verifique sua conexão.')));
    req.on('error', reject);
  });
}

async function check() {
  if (busy || state.phase === 'ready') return state;
  if (!app.isPackaged) return publish({ phase: 'current', message: 'Atualizações disponíveis somente no app instalado.' });
  busy = true;
  publish({ phase: 'checking', version: undefined, progress: undefined });
  try {
    const res = await request(`https://api.github.com/repos/${REPOSITORY}/releases/latest`);
    const chunks: Buffer[] = []; let size = 0;
    for await (const chunk of res) {
      size += chunk.length;
      if (size > 2 * 1024 * 1024) { res.destroy(); throw new Error('Resposta de atualização inválida.'); }
      chunks.push(Buffer.from(chunk));
    }
    const release: Release = JSON.parse(Buffer.concat(chunks).toString('utf8'));
    selected = undefined;
    if (!newerVersion(release.tag_name, app.getVersion()) || release.draft || release.prerelease) return publish({ phase: 'current' });
    selected = selectReleaseAsset(release, process.platform, process.arch);
    if (!selected) throw new Error('A nova versão ainda não possui instalador compatível com este computador.');
    const version = release.tag_name.slice(1);
    const next = publish({ phase: 'available', version });
    if (notifiedVersion !== version && Notification.isSupported()) {
      notifiedVersion = version;
      const notification = new Notification({
        title: 'Atualização disponível para o Orbit',
        body: `A versão ${version} está pronta para download. Clique para abrir o Orbit.`,
        silent: false,
      });
      notification.on('click', () => {
        const win = BrowserWindow.getAllWindows().find((candidate) => !candidate.isDestroyed());
        if (win) { if (win.isMinimized()) win.restore(); win.show(); win.focus(); }
      });
      notification.show();
    }
    return next;
  } catch (error) { return publish({ phase: 'error', message: (error as Error).message }); }
  finally { busy = false; }
}

async function download() {
  if (busy || !selected || state.phase === 'ready') return state;
  busy = true;
  publish({ phase: 'downloading', progress: 0 });
  try {
    if (workDir) await fs.rm(workDir, { recursive: true, force: true });
    workDir = await fs.mkdtemp(join(app.getPath('temp'), 'orbit-update-'));
    const destination = join(workDir, selected.name);
    const res = await request(selected.browser_download_url);
    const hash = createHash('sha256'); let received = 0; let lastProgress = -1;
    const meter = new Transform({ transform(chunk, _encoding, callback) {
      received += chunk.length;
      if (received > selected!.size) { callback(new Error('O instalador tem um tamanho inesperado.')); return; }
      hash.update(chunk);
      const progress = Math.floor(received * 100 / selected!.size);
      if (progress !== lastProgress) { lastProgress = progress; publish({ phase: 'downloading', progress }); }
      callback(null, chunk);
    } });
    await pipeline(res, meter, createWriteStream(destination, { flags: 'wx', mode: 0o600 }));
    if (received !== selected.size || `sha256:${hash.digest('hex')}` !== selected.digest) throw new Error('O instalador não passou na verificação de integridade. Baixe novamente.');
    downloaded = destination;
    return publish({ phase: 'ready', progress: 100 });
  } catch (error) { downloaded = ''; return publish({ phase: 'error', message: (error as Error).message }); }
  finally { busy = false; }
}

// O helper aguarda o processo sair, troca os bundles no mesmo volume e
// preserva o anterior. Argumentos são passados separados, nunca interpolados.


async function prepareMacInstall() {
  const target = dirname(dirname(dirname(app.getPath('exe'))));
  if (!target.endsWith('.app') || !app.isInApplicationsFolder()) throw new Error('Mova o Orbit para Aplicativos antes de atualizar.');
  await fs.access(dirname(target), constants.W_OK);
  const mount = join(workDir, 'mounted');
  await fs.mkdir(mount);
  let stageRoot = '';
  try {
    await exec('/usr/bin/hdiutil', ['attach', downloaded, '-nobrowse', '-readonly', '-mountpoint', mount]);
    const source = join(mount, 'Orbit.app');
    const plist = join(source, 'Contents', 'Info.plist');
    const version = (await exec('/usr/libexec/PlistBuddy', ['-c', 'Print :CFBundleShortVersionString', plist])).stdout.trim();
    const bundleId = (await exec('/usr/libexec/PlistBuddy', ['-c', 'Print :CFBundleIdentifier', plist])).stdout.trim();
    if (version !== state.version || bundleId !== 'br.com.axyo.orbit') throw new Error('O pacote baixado não corresponde à versão do Orbit.');
    await exec('/usr/bin/codesign', ['--verify', '--deep', '--strict', source]);
    stageRoot = await fs.mkdtemp(join(dirname(target), '.orbit-update-'));
    const staged = join(stageRoot, 'Orbit.app');
    await exec('/usr/bin/ditto', [source, staged]);
    await exec('/usr/bin/codesign', ['--verify', '--deep', '--strict', staged]);
    const script = join(workDir, 'install.sh');
    await fs.writeFile(script, MAC_INSTALL_SCRIPT, { mode: 0o700 });
    const backup = `${target}.backup-${app.getVersion()}-${Date.now()}`;
    const log = await fs.open(join(app.getPath('userData'), 'update-install.log'), 'a');
    app.once('will-quit', () => {
      const child = spawn('/bin/sh', [script, String(process.pid), target, staged, backup], { detached: true, stdio: ['ignore', log.fd, log.fd] });
      child.on('error', () => {});
      child.unref();
    });
  } catch (error) {
    if (stageRoot) await fs.rm(stageRoot, { recursive: true, force: true });
    throw error;
  } finally {
    await exec('/usr/bin/hdiutil', ['detach', mount]).catch(() => {});
  }
}

async function install() {
  if (busy || state.phase !== 'ready' || !downloaded || !selected) return state;
  busy = true;
  publish({ phase: 'installing' });
  try {
    // Revalida o arquivo no clique de instalar; ele pode ter sido alterado após o download.
    const hash = createHash('sha256');
    for await (const chunk of createReadStream(downloaded)) hash.update(chunk);
    if (`sha256:${hash.digest('hex')}` !== selected.digest) throw new Error('O instalador foi alterado. Baixe novamente.');
    if (process.platform === 'darwin') {
      await prepareMacInstall();
      app.quit();
    } else {
      if (process.platform === 'linux') {
        await fs.chmod(downloaded, 0o700);
        shell.showItemInFolder(downloaded);
        return publish({ phase: 'ready', message: 'Substitua seu AppImage pelo arquivo baixado.' });
      }
      const error = await shell.openPath(downloaded);
      if (error) throw new Error(error);
      if (process.platform === 'win32') app.quit();
      else publish({ phase: 'ready', message: 'Instalador aberto. Substitua sua instalação pelo arquivo baixado.' });
    }
    return state;
  } catch (error) { return publish({ phase: 'error', message: `Não foi possível instalar: ${(error as Error).message}` }); }
  finally { busy = false; }
}

export function setupAppUpdates() {
  state = { phase: 'idle', currentVersion: app.getVersion(), installMode: process.platform === 'darwin' ? 'restart' : process.platform === 'linux' ? 'file' : 'installer' };
  for (const [channel, action] of Object.entries({ 'app-update-get': () => state, 'app-update-check': check, 'app-update-download': download, 'app-update-install': install })) {
    ipcMain.handle(channel, (event) => {
      if (event.senderFrame !== event.sender.mainFrame || !BrowserWindow.fromWebContents(event.sender)) throw new Error('Janela não autorizada.');
      return action();
    });
  }
  if (app.isPackaged) {
    const initial = setTimeout(check, 10000);
    const interval = setInterval(() => { if (!['available', 'ready'].includes(state.phase)) void check(); }, 6 * 60 * 60 * 1000);
    app.once('will-quit', () => { clearTimeout(initial); clearInterval(interval); });
  }
}
