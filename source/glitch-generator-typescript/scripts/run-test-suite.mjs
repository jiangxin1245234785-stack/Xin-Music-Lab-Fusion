import { readdirSync } from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const testsDirectory = path.join(root, 'tests');
const testFiles = readdirSync(testsDirectory)
  .filter(filename => filename.endsWith('.test.mjs'))
  .sort((left, right) => left.localeCompare(right))
  .map(filename => path.join(testsDirectory, filename));

if (testFiles.length === 0) {
  console.error('[Phase 6.1] No test files were discovered.');
  process.exitCode = 1;
} else {
  console.log(
    `[Phase 6.1] Running consolidated suite: ${testFiles.length} test files.`
  );
  const result = spawnSync(
    process.execPath,
    ['--test', ...testFiles],
    { cwd: root, stdio: 'inherit' }
  );
  if (result.error) throw result.error;
  process.exitCode = result.status ?? 1;
}
