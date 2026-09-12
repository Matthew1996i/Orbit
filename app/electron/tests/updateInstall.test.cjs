const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const { MAC_INSTALL_SCRIPT } = require('../build/src/updateInstallScript');
for (const rollback of [false, true]) {
  test(rollback ? 'restores old app if moving new bundle fails' : 'installs staged app and keeps previous bundle', { skip: process.platform === 'win32' }, () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'orbit-install-test-'));
    try {
      const target = path.join(dir, 'Orbit with spaces.app');
      const staged = path.join(dir, 'staged.app');
      const backup = path.join(dir, 'backup.app');
      fs.mkdirSync(target); fs.writeFileSync(path.join(target, 'version'), 'old');
      if (!rollback) { fs.mkdirSync(staged); fs.writeFileSync(path.join(staged, 'version'), 'new'); }
      const script = path.join(dir, 'install.sh');
      // Não abre aplicativos no teste; todo o restante usa a rotina real de troca.
      fs.writeFileSync(script, MAC_INSTALL_SCRIPT.replaceAll('/usr/bin/open', '/usr/bin/true'));
      const result = spawnSync('/bin/sh', [script, '99999999', target, staged, backup]);
      assert.equal(result.status, rollback ? 1 : 0);
      assert.equal(fs.readFileSync(path.join(target, 'version'), 'utf8'), rollback ? 'old' : 'new');
      if (!rollback) assert.equal(fs.readFileSync(path.join(backup, 'version'), 'utf8'), 'old');
    } finally { fs.rmSync(dir, { recursive: true, force: true }); }
  });
}
