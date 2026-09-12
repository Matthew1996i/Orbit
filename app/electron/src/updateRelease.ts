export interface ReleaseAsset { name: string; browser_download_url: string; size: number; digest?: string }
export interface Release { tag_name: string; draft?: boolean; prerelease?: boolean; assets: ReleaseAsset[] }
export const REPOSITORY = 'Matthew1996i/Orbit';

export function newerVersion(candidate: string, current: string): boolean {
  const parse = (v: string) => /^v?(\d+)\.(\d+)\.(\d+)$/.exec(v)?.slice(1).map(Number);
  const a = parse(candidate), b = parse(current);
  if (!a || !b) return false;
  for (let i = 0; i < 3; i++) { if (a[i] !== b[i]) return a[i] > b[i]; }
  return false;
}

export function selectReleaseAsset(release: Release, platform: string, arch: string): ReleaseAsset | undefined {
  if (release.draft || release.prerelease || !/^v\d+\.\d+\.\d+$/.test(release.tag_name)) return;
  const version = release.tag_name.slice(1);
  const name = platform === 'darwin' ? `Orbit-${version}${arch === 'arm64' ? '-arm64' : arch === 'x64' ? '' : '-unsupported'}.dmg`
    : platform === 'win32' && arch === 'x64' ? `Orbit.Setup.${version}.exe`
    : platform === 'linux' && arch === 'x64' ? `Orbit-${version}.AppImage` : '';
  return release.assets.find((asset) => asset.name === name
    && asset.browser_download_url === `https://github.com/${REPOSITORY}/releases/download/${release.tag_name}/${name}`
    && /^sha256:[a-f0-9]{64}$/.test(asset.digest || '')
    && Number.isSafeInteger(asset.size) && asset.size > 0 && asset.size < 1024 * 1024 * 1024);
}
