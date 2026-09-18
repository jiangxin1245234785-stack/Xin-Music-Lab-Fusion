import { existsSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const candidates = [
  process.env.ELECTRON_BIN,
  'D:/Program Files/smoke-resonance/node_modules/electron/dist/electron.exe'
].filter(Boolean);
const electronBinary = candidates.find(candidate => existsSync(candidate));

if (!electronBinary) {
  console.error(
    '[Step 6 acceptance] Electron executable not found. Set ELECTRON_BIN.'
  );
  process.exitCode = 1;
} else {
  const result = spawnSync(
    electronBinary,
    [path.join(root, 'tests', 'electron-step6-acceptance.cjs')],
    {
      cwd: root,
      encoding: 'utf8',
      stdio: 'inherit',
      windowsHide: true,
      timeout: 240_000
    }
  );
  if (result.error) throw result.error;
  process.exitCode = result.status ?? 1;
}
