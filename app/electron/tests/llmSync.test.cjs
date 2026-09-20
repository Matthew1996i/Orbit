const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { syncLlm } = require('../build/src/llmSync.js');

test('sync preserves user instructions and imports config without tokens', () => {
  const home = fs.mkdtempSync(path.join(os.tmpdir(), 'orbit-llm-sync-'));
  try {
    const bin = path.join(home, '.local', 'bin');
    fs.mkdirSync(bin, { recursive: true });
    fs.writeFileSync(path.join(bin, 'codex'), '');
    fs.chmodSync(path.join(bin, 'codex'), 0o755);
    const codex = path.join(home, '.codex');
    fs.mkdirSync(codex);
    fs.writeFileSync(path.join(codex, 'AGENTS.md'), 'Minhas instruções.\n');
    fs.writeFileSync(path.join(codex, 'config.toml'), 'model = "gpt-5"\napi_key = "sk-private"\n[mcp_servers.demo.env]\nSECRET = "private"\n');
    fs.mkdirSync(path.join(codex, 'agents'));
    fs.writeFileSync(path.join(codex, 'agents', 'reviewer.toml'), 'description = "Revisa código"\ndeveloper_instructions = "Verifique erros e explique a correção."\n');
    const orbit = path.join(home, '.orbit');
    fs.mkdirSync(orbit);
    fs.writeFileSync(path.join(orbit, 'secrets.json'), JSON.stringify([{ entries: [{ key: 'API_TOKEN', sealed: { c: 'ciphertext' } }] }]));
    const first = syncLlm('codex', home);
    const second = syncLlm('codex', home);
    assert.equal(first.ok, true);
    assert.equal(second.ok, true);
    assert.equal(first.importedAgents, 1);
    assert.equal(second.importedAgents, 0);
    const agent = fs.readFileSync(path.join(home, '.claude', 'agents', 'orbit-import-codex-reviewer.md'), 'utf8');
    assert.match(agent, /Verifique erros e explique a correção/);
    const instructions = fs.readFileSync(path.join(codex, 'AGENTS.md'), 'utf8');
    assert.match(instructions, /Minhas instruções/);
    assert.match(instructions, /Orbit — ponto central/);
    assert.equal(instructions.match(/Orbit sync: start/g).length, 1);
    const imported = fs.readFileSync(path.join(orbit, 'llm-sync', 'codex', 'config.toml'), 'utf8');
    assert.match(imported, /model = "gpt-5"/);
    assert.doesNotMatch(imported, /sk-private|SECRET|private/);
    const manifest = JSON.parse(fs.readFileSync(first.manifestPath, 'utf8'));
    assert.deepEqual(manifest.secretKeys, ['API_TOKEN']);
    assert.ok(manifest.agents.includes('orbit-import-codex-reviewer'));
  } finally {
    fs.rmSync(home, { recursive: true, force: true });
  }
});
