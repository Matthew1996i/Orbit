const { test } = require('node:test');
const assert = require('node:assert/strict');
const { newerVersion, selectReleaseAsset } = require('../build/src/updateRelease');
const release = { tag_name: 'v1.0.26', assets: [{ name: 'Orbit-1.0.26-arm64.dmg', browser_download_url: 'https://github.com/Matthew1996i/Orbit/releases/download/v1.0.26/Orbit-1.0.26-arm64.dmg', digest: 'sha256:' + 'a'.repeat(64), size: 1024 }] };
test('compares numeric versions and rejects downgrades, same versions and prereleases', () => {
  assert.equal(newerVersion('v1.0.26', '1.0.9'), true);
  for (const candidate of ['v1.0.26', 'v1.0.25', 'v1.0.27-beta', 'latest']) assert.equal(newerVersion(candidate, '1.0.26'), false);
});
test('selects only the correct architecture with trusted release URL and digest', () => {
  assert.equal(selectReleaseAsset(release, 'darwin', 'arm64'), release.assets[0]);
  assert.equal(selectReleaseAsset(release, 'darwin', 'x64'), undefined);
  for (const changed of [{ digest: undefined }, { browser_download_url: 'https://example.com/update.dmg' }, { size: -1 }]) {
    assert.equal(selectReleaseAsset({ ...release, assets: [{ ...release.assets[0], ...changed }] }, 'darwin', 'arm64'), undefined);
  }
  assert.equal(selectReleaseAsset({ ...release, prerelease: true }, 'darwin', 'arm64'), undefined);
});
