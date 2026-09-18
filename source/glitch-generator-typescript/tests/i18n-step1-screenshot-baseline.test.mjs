import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const screenshotDirectory = path.join(
  root,
  'artifacts',
  'i18n-step1',
  'screenshots'
);
const manifest = JSON.parse(readFileSync(
  path.join(screenshotDirectory, 'manifest.json'),
  'utf8'
));

test('Step 1 screenshot manifest covers all five pages at both baseline widths', () => {
  assert.equal(manifest.files.length, 10);
  assert.deepEqual(manifest.pages, [
    'advanced',
    'map',
    'perform',
    'shader',
    'visual'
  ]);
  assert.deepEqual(manifest.viewports.regular, { width: 1366, height: 768 });
  assert.deepEqual(
    manifest.viewports.xmlEmbeddedNarrow,
    { width: 820, height: 900 }
  );
  assert.equal(manifest.consoleWarningAndErrorCount, 0);
});

test('Step 1 screenshot files match the recorded immutable artifact hashes', () => {
  for (const entry of manifest.files) {
    const jpeg = readFileSync(path.join(screenshotDirectory, entry.filename));
    const requestedWidth = Number(entry.filename.split('x')[0]);
    const requestedHeight = Number(entry.filename.split('x')[1].split('-')[0]);
    assert.equal(jpeg[0], 0xff);
    assert.equal(jpeg[1], 0xd8);
    assert.ok(
      entry.width <= requestedWidth && entry.width >= requestedWidth - 20,
      `${entry.filename} allows browser scrollbar width`
    );
    assert.ok(
      entry.height <= requestedHeight && entry.height >= requestedHeight - 20,
      `${entry.filename} allows browser viewport chrome height`
    );
    assert.equal(
      createHash('sha256').update(jpeg).digest('hex'),
      entry.sha256,
      entry.filename
    );
  }
});
