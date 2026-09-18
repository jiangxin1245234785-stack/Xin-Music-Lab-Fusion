import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

import {
  buildVisualRegressionArtifact,
  serializeVisualRegressionManifest
} from './support/visual-regression.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const snapshotDirectory = path.join(root, 'tests', '__snapshots__');

test('visual target timeline and renderer contract match the approved snapshot', () => {
  const artifact = buildVisualRegressionArtifact();
  const expectedPng = readFileSync(
    path.join(snapshotDirectory, 'phase6-visual-timeline.png')
  );
  const expectedManifest = readFileSync(
    path.join(snapshotDirectory, 'phase6-visual-timeline.json'),
    'utf8'
  );
  const message =
    'Unexpected visual change. Review the generated difference, then run ' +
    '`pnpm test:visual:update` only when the change is intentional.';

  assert.equal(
    serializeVisualRegressionManifest(artifact.manifest),
    expectedManifest,
    message
  );
  assert.deepEqual(artifact.png, expectedPng, message);
});
