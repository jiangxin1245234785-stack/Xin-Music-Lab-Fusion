import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import {
  cpSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  statSync,
  writeFileSync
} from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath, pathToFileURL } from 'node:url';

const root = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  '..'
);
const distDirectory = path.join(root, 'dist');
const browserEntry = path.join(distDirectory, 'browser', 'index.js');
const manifestPath = path.join(distDirectory, 'browser-manifest.json');

function hashFile(filePath) {
  return createHash('sha256')
    .update(readFileSync(filePath))
    .digest('hex');
}

function readJson(filePath) {
  return JSON.parse(readFileSync(filePath, 'utf8'));
}

test('I-4 exposes one stable side-effect-free browser entry', async () => {
  const packageJson = readJson(path.join(root, 'package.json'));
  const api = await import(
    `${pathToFileURL(browserEntry).href}?node-esm-smoke`
  );

  assert.equal(packageJson.browser, './dist/browser/index.js');
  assert.equal(
    packageJson.exports['./browser'].default,
    './dist/browser/index.js'
  );
  assert.equal(
    api.GLITCH_GENERATOR_BROWSER_ENTRY_ID,
    '@xins-music-lab/glitch-mapping-generator/browser'
  );
  assert.equal(api.GLITCH_GENERATOR_BROWSER_API_VERSION, 1);
  assert.equal(
    api.GLITCH_GENERATOR_PACKAGE_VERSION,
    packageJson.version
  );
  assert.equal(typeof api.buildUnifiedMusicFrame, 'function');
});

test('I-4 browser manifest covers the exact runtime closure with SHA256', () => {
  const manifest = readJson(manifestPath);
  const packageJson = readJson(path.join(root, 'package.json'));

  assert.equal(
    manifest.format,
    'xin.glitch-generator.browser-manifest/1'
  );
  assert.equal(manifest.packageName, packageJson.name);
  assert.equal(manifest.packageVersion, packageJson.version);
  assert.equal(manifest.browserApiVersion, 1);
  assert.equal(manifest.entry, 'browser/index.js');
  assert.equal(manifest.moduleFormat, 'esm');
  assert.ok(manifest.files.length > 1);
  assert.ok(manifest.files.some(file => file.path === 'package.json'));
  assert.ok(manifest.files.some(file => file.path === manifest.entry));
  assert.equal(
    manifest.files.some(file =>
      file.path.endsWith('ui-debug/phase1-demo.js')
    ),
    false
  );
  assert.equal(
    manifest.files.some(file => file.path.includes('ui/i18n/')),
    false,
    'UI locale adapters must not enter the side-effect-free browser closure'
  );
  assert.equal(
    manifest.files.some(file => file.path.includes('ui/semantics/')),
    false,
    'UI semantic catalogs must not enter the side-effect-free browser closure'
  );

  for (const file of manifest.files) {
    const filePath = path.join(distDirectory, ...file.path.split('/'));
    assert.equal(statSync(filePath).size, file.bytes, file.path);
    assert.equal(hashFile(filePath), file.sha256, file.path);
  }
});

test('I-4 imports through file URL inside an isolated CommonJS host', async () => {
  const temporaryRoot = mkdtempSync(
    path.join(tmpdir(), 'xin-glitch-browser-')
  );
  const isolatedDist = path.join(temporaryRoot, 'vendor');
  try {
    cpSync(distDirectory, isolatedDist, { recursive: true });
    const hostPackage = path.join(temporaryRoot, 'package.json');
    writeFileSync(hostPackage, '{"type":"commonjs"}\n', 'utf8');
    const entry = path.join(isolatedDist, 'browser', 'index.js');
    const api = await import(`${pathToFileURL(entry).href}?file-smoke`);
    const frame = api.buildUnifiedMusicFrame({
      clock: {
        frameIndex: 7,
        nowMs: 100,
        deltaMs: 16
      }
    });

    assert.equal(api.GLITCH_GENERATOR_BROWSER_API_VERSION, 1);
    assert.equal(frame.contract, 'xin.music-frame/1');
    assert.equal(frame.clock.frameIndex, 7);
  } finally {
    rmSync(temporaryRoot, { recursive: true, force: true });
  }
});
