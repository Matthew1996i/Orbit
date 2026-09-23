const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { discoverLlms } = require('../build/src/cliDiscovery.js');

test('Windows uses the bundled Codex SDK without inventing a Claude installation', () => {
  const home = fs.mkdtempSync(path.join(os.tmpdir(), 'orbit-cli-discovery-'));
  try {
    const npm = path.join(home, 'AppData', 'Roaming', 'npm');
    fs.mkdirSync(npm, { recursive: true });
    fs.writeFileSync(path.join(npm, 'codex.cmd'), '@echo off\r\n');
    const sdkBridge = path.join(home, 'codex-runtime', 'bridge.mjs');
    fs.mkdirSync(path.dirname(sdkBridge), { recursive: true });
    fs.writeFileSync(sdkBridge, '');
    fs.mkdirSync(path.join(home, '.codex'));
    fs.writeFileSync(path.join(home, '.codex', 'auth.json'), '{}');
    const found = discoverLlms('win32', { Path: npm, APPDATA: path.join(home, 'AppData', 'Roaming') }, home, sdkBridge);
    assert.equal(found.find((cli) => cli.id === 'codex').status, 'connected');
    assert.equal(found.find((cli) => cli.id === 'codex').path, sdkBridge);
    assert.equal(discoverLlms('win32', { Path: npm }, home, null).find((cli) => cli.id === 'codex').status, 'none');
    assert.equal(found.find((cli) => cli.id === 'claude').status, 'none');
  } finally {
    fs.rmSync(home, { recursive: true, force: true });
  }
});

test('Claude appears installed only when its executable is present', () => {
  const home = fs.mkdtempSync(path.join(os.tmpdir(), 'orbit-cli-discovery-'));
  try {
    const bin = path.join(home, 'bin');
    fs.mkdirSync(bin);
    fs.writeFileSync(path.join(bin, 'claude'), '');
    fs.chmodSync(path.join(bin, 'claude'), 0o755);
    const found = discoverLlms('darwin', { PATH: bin }, home);
    assert.equal(found.find((cli) => cli.id === 'claude').status, 'installed');
  } finally {
    fs.rmSync(home, { recursive: true, force: true });
  }
});
