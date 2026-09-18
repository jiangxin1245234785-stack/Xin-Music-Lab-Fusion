import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

import {
  CONTINUOUS_MUSIC_FEATURE_IDS,
  CURRENT_SCHEMA_VERSION,
  EVENT_MUSIC_FEATURE_IDS,
  LABEL_MUSIC_FEATURE_IDS,
  STATE_MUSIC_FEATURE_IDS,
  UNIFIED_MUSIC_FEATURE_IDS,
  UNIFIED_MUSIC_FRAME_CONTRACT_VERSION,
  buildUnifiedMusicFrame,
  validateUnifiedMusicFrame
} from '../dist/index.js';

function fixture(name) {
  return JSON.parse(readFileSync(
    new URL(`./fixtures/integration/${name}`, import.meta.url),
    'utf8'
  ));
}

const matrix = fixture('contract-fixture-matrix.json');

test('I-5 valid fixture matrix is value-identical on its fixed clock', () => {
  for (const entry of matrix.validCases) {
    const input = fixture(entry.file);
    const original = structuredClone(input);
    const first = buildUnifiedMusicFrame(input);
    const second = buildUnifiedMusicFrame(structuredClone(input));

    assert.deepEqual(input, original, `${entry.id}: input mutation`);
    assert.deepEqual(first.clock, entry.expectedClock, `${entry.id}: clock`);
    assert.deepEqual(first, second, `${entry.id}: object values`);
    assert.equal(
      JSON.stringify(first),
      JSON.stringify(second),
      `${entry.id}: serialized values`
    );
    assert.equal(
      validateUnifiedMusicFrame(first, 'resolved').valid,
      true,
      `${entry.id}: resolved validation`
    );

    assert.deepEqual(
      Object.keys(first.continuous),
      [...CONTINUOUS_MUSIC_FEATURE_IDS],
      `${entry.id}: continuous registry`
    );
    assert.deepEqual(
      Object.keys(first.states),
      [...STATE_MUSIC_FEATURE_IDS],
      `${entry.id}: state registry`
    );
    assert.deepEqual(
      Object.keys(first.events),
      [...EVENT_MUSIC_FEATURE_IDS],
      `${entry.id}: event registry`
    );
    assert.deepEqual(
      Object.keys(first.labels),
      [...LABEL_MUSIC_FEATURE_IDS],
      `${entry.id}: label registry`
    );
    assert.deepEqual(
      Object.keys(first.meta),
      [...UNIFIED_MUSIC_FEATURE_IDS],
      `${entry.id}: meta registry`
    );
  }
});

test('I-5 invalid fixture matrix fails at its declared code and path', () => {
  for (const entry of matrix.invalidCases) {
    const report = validateUnifiedMusicFrame(
      fixture(entry.file),
      entry.mode
    );
    assert.equal(report.valid, false, `${entry.id}: unexpectedly valid`);
    assert.ok(
      report.issues.some(issue =>
        issue.code === entry.expectedCode &&
        issue.path === entry.expectedPath
      ),
      `${entry.id}: missing ${entry.expectedCode} at ${entry.expectedPath}`
    );
  }
});

test('I-5 keeps contract v1 while the preset schema advances independently', () => {
  assert.equal(matrix.schemaVersion, 1);
  assert.equal(UNIFIED_MUSIC_FRAME_CONTRACT_VERSION, 1);
  assert.equal(CURRENT_SCHEMA_VERSION, 16);
});
