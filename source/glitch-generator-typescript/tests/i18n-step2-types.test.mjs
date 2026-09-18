import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const root = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  '..'
);

test('Step 2 exposes typed translation keys and two supported locales', () => {
  const tsc = path.join(root, 'node_modules', 'typescript', 'bin', 'tsc');
  const fixture = path.join(root, 'tests', 'fixtures', 'i18n-step2-types.ts');
  const result = spawnSync(process.execPath, [
    tsc,
    '--noEmit',
    '--strict',
    '--skipLibCheck',
    '--target', 'ES2022',
    '--module', 'NodeNext',
    '--moduleResolution', 'NodeNext',
    fixture
  ], {
    cwd: root,
    encoding: 'utf8'
  });
  assert.equal(
    result.status,
    0,
    `${result.stdout}\n${result.stderr}`
  );
});
