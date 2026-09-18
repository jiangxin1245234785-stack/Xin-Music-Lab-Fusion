import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

import { CURRENT_ENGINE_VERSION } from '../dist/index.js';
import { CORE_TEST_SUITE } from './support/core-suite-manifest.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

test('consolidated suite keeps every Phase 6.1 core domain executable', () => {
  assert.deepEqual(
    CORE_TEST_SUITE.map(entry => entry.domain),
    [
      'TargetMixer',
      'EventEnvelope',
      'Preset validation',
      'NodeGraph cycle detection',
      'SafetyLimiter',
      'Schema migration',
      'Determinism',
      'Seeded PRNG',
      'Energy budget',
      'Visual regression',
      'Debug bundle',
      'Performance profiler',
      'Autosave recovery',
      'Preset compatibility'
    ]
  );
  for (const entry of CORE_TEST_SUITE) {
    const source = readFileSync(path.join(root, 'tests', entry.file), 'utf8');
    assert.match(
      source,
      new RegExp(entry.marker.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')),
      `${entry.domain} coverage marker is missing from ${entry.file}`
    );
  }
});

test('package test command runs the consolidated suite runner', () => {
  const packageJson = JSON.parse(
    readFileSync(path.join(root, 'package.json'), 'utf8')
  );
  assert.match(packageJson.scripts.test, /run-test-suite\.mjs/);
  assert.match(packageJson.scripts['test:visual'], /phase6-visual-regression/);
  assert.match(
    packageJson.scripts['test:visual:update'],
    /update-visual-snapshots/
  );
  assert.equal(packageJson.version, CURRENT_ENGINE_VERSION);
});
