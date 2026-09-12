const { test } = require('node:test');
const assert = require('node:assert/strict');
const { EventEmitter } = require('node:events');
const { Readable } = require('node:stream');
const { createHash } = require('node:crypto');
const Module = require('node:module');
const os = require('node:os');
const app = new EventEmitter();
app.isPackaged = true; app.getVersion = () => '1.0.25'; app.getPath = () => os.tmpdir();
const handlers = {};
const event = { sender: { mainFrame: {} } }; event.senderFrame = event.sender.mainFrame;
let invalidDigest = false;
const bytes = Buffer.from('fixture installer');
const name = process.platform === 'darwin' ? `Orbit-1.0.26${process.arch === 'arm64' ? '-arm64' : ''}.dmg` : process.platform === 'win32' ? 'Orbit.Setup.1.0.26.exe' : 'Orbit-1.0.26.AppImage';
const originalLoad = Module._load;
Module._load = function(nameArg, ...args) {
  if (nameArg === 'electron') return { app, Notification: class { static isSupported() { return false; } }, BrowserWindow: { getAllWindows: () => [], fromWebContents: () => ({}) }, ipcMain: { handle: (key, fn) => { handlers[key] = fn; } }, shell: {} };
  if (nameArg === 'https') return { get: (url, _options, callback) => {
    const request = new EventEmitter(); request.setTimeout = () => request;
    const release = { tag_name: 'v1.0.26', assets: [{ name, browser_download_url: `https://github.com/Matthew1996i/Orbit/releases/download/v1.0.26/${name}`, size: bytes.length, digest: 'sha256:' + (invalidDigest ? '0'.repeat(64) : createHash('sha256').update(bytes).digest('hex')) }] };
    const response = Readable.from([url.hostname === 'api.github.com' ? Buffer.from(JSON.stringify(release)) : bytes]);
    response.statusCode = 200; response.setTimeout = () => response;
    queueMicrotask(() => callback(response));
    return request;
  } };
  return originalLoad.call(this, nameArg, ...args);
};
const { setupAppUpdates } = require('../build/src/appUpdates');
Module._load = originalLoad;
setupAppUpdates();
app.emit('will-quit'); // remove os timers automáticos neste teste isolado

test('rejects requests from child frames', () => {
  assert.throws(() => handlers['app-update-check']({ ...event, senderFrame: {} }), /não autorizada/);
});
test('only offers installation after download checksum passes', async () => {
  invalidDigest = true;
  assert.equal((await handlers['app-update-check'](event)).phase, 'available');
  assert.equal((await handlers['app-update-download'](event)).phase, 'error');
  invalidDigest = false;
  await handlers['app-update-check'](event);
  const result = await handlers['app-update-download'](event);
  assert.equal(result.phase, 'ready');
  assert.equal(result.progress, 100);
});
