import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

import {
  buildI18nStep1DeterministicBaseline,
  serializeI18nStep1Baseline
} from './support/i18n-step1-baseline.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const expectedPath = path.join(
  root,
  'artifacts',
  'i18n-step1',
  'deterministic-baseline.json'
);

test('Step 1 fixed buffer, seed, preset and engine clock match the approved baseline', () => {
  const current = buildI18nStep1DeterministicBaseline();
  const expected = JSON.parse(readFileSync(expectedPath, 'utf8'));
  const actual = JSON.parse(serializeI18nStep1Baseline(current));

  assert.deepEqual(actual.checkpoints, expected.checkpoints);
  assert.deepEqual(actual.fixture, expected.fixture);
  assert.deepEqual(actual.registry, expected.registry);
  for (const key of [
    'extractedAudioFeatures',
    'unifiedMusicFrames',
    'runtimeSourceFrames',
    'mappingContributions',
    'targetMixerOutputs',
    'physicalSafetyOutputs'
  ]) {
    assert.equal(
      actual.hashes[key],
      expected.hashes[key],
      `engine output changed: ${key}`
    );
  }
});

test('Step 1 baseline records every required deterministic stage', () => {
  const baseline = buildI18nStep1DeterministicBaseline();
  assert.deepEqual(Object.keys(baseline.hashes), [
    'extractedAudioFeatures',
    'mappingContributions',
    'physicalSafetyOutputs',
    'preset',
    'runtimeSourceFrames',
    'targetMixerOutputs',
    'unifiedMusicFrames'
  ]);
  assert.deepEqual(baseline.registry.mixerPipeline, [
    'base',
    'multiply',
    'add',
    'max-min',
    'replace',
    'gate',
    'energy-budget-clamp'
  ]);
  assert.ok(baseline.checkpoints.length >= 6);
});
