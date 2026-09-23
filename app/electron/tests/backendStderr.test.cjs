const test = require('node:test');
const assert = require('node:assert/strict');
const { spawn } = require('node:child_process');
const { drainBackendStderr } = require('../build/src/backendStderr.js');

test('drains a large Python-style stderr stream without blocking the backend', async () => {
  const child = spawn(process.execPath, ['-e', "process.stderr.write('x'.repeat(1024 * 1024))"], {
    stdio: ['ignore', 'ignore', 'pipe'],
  });
  drainBackendStderr(child);
  let timer;
  const exitCode = await Promise.race([
    new Promise((resolve, reject) => {
      child.once('error', reject);
      child.once('exit', resolve);
    }),
    new Promise((_, reject) => {
      timer = setTimeout(() => {
        child.kill();
        reject(new Error('stderr pipe blocked'));
      }, 3000);
    }),
  ]).finally(() => clearTimeout(timer));
  assert.equal(exitCode, 0);
});
