import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';

import {
  PRESET_DEFAULTS,
  VISUAL_TARGETS,
  analyzeOfflineBuffer,
  coreFeatureSourceValues,
  createContinuousFeatureValidationBuffer,
  learnV0,
  runOfflineDeterministicSession
} from '../dist/index.js';

const FEATURE_KEYS = [
  'dynamicRange',
  'spectralDensity',
  'buildEnergy',
  'sectionDrive',
  'rhythmPhase',
  'flux',
  'flatness',
  'sharpness'
];

const buffer = createContinuousFeatureValidationBuffer();
const frames = analyzeOfflineBuffer(buffer);

function meanInWindow(key, startMs, endMs) {
  const values = frames
    .filter(frame =>
      frame.engineTimeMs >= startMs &&
      frame.engineTimeMs < endMs
    )
    .map(frame => frame[key]);
  return values.reduce((sum, value) => sum + value, 0) /
    Math.max(1, values.length);
}

test('all Phase 3.1 continuous features are finite, bounded and moving', () => {
  for (const key of FEATURE_KEYS) {
    const values = frames.map(frame => frame[key]);
    assert.ok(values.every(Number.isFinite), `${key} must stay finite`);
    assert.ok(values.every(value => value >= 0 && value <= 1), `${key} must stay normalized`);
    assert.ok(Math.max(...values) - Math.min(...values) > 0.04, `${key} must visibly move`);
  }
});

test('spectral statistics distinguish density, noise and high-frequency weight', () => {
  const singleToneDensity = meanInWindow('spectralDensity', 600, 950);
  const layeredDensity = meanInWindow('spectralDensity', 3_050, 3_450);
  const tonalFlatness = meanInWindow('flatness', 3_050, 3_450);
  const noiseFlatness = meanInWindow('flatness', 4_550, 4_950);
  const bassSharpness = meanInWindow('sharpness', 600, 950);
  const highSharpness = meanInWindow('sharpness', 4_050, 4_450);

  assert.ok(layeredDensity > singleToneDensity * 2);
  assert.ok(noiseFlatness > tonalFlatness + 0.35);
  assert.ok(highSharpness > bassSharpness + 0.2);
});

test('build and section signals respond to the deterministic layered build', () => {
  const earlyBuild = meanInWindow('buildEnergy', 600, 950);
  const lateBuild = meanInWindow('buildEnergy', 3_050, 3_450);
  const earlyDrive = meanInWindow('sectionDrive', 600, 950);
  const lateDrive = meanInWindow('sectionDrive', 3_050, 3_450);

  assert.ok(lateBuild > earlyBuild + 0.08);
  assert.ok(lateDrive > earlyDrive + 0.08);
  assert.ok(frames.some(frame => frame.rhythmPhase > 0.5));
  assert.ok(frames.some(frame => frame.flux > 0.08));
});

test('second batch extraction is deterministic for fixed offline audio', () => {
  const second = analyzeOfflineBuffer(buffer);
  assert.deepEqual(second, frames);
});

test('every Phase 3.1 feature is exposed as a generic MappingCard source', () => {
  const values = coreFeatureSourceValues(frames.at(-1));
  for (const key of FEATURE_KEYS) {
    assert.ok(Object.hasOwn(values, `audio.${key}`));
  }
});

test('buildEnergy drives Feedback.Retention through editable mapping data', () => {
  const preset = {
    ...PRESET_DEFAULTS,
    mappings: [{
      id: 'build-retention-test',
      sourceId: 'audio.buildEnergy',
      targetId: VISUAL_TARGETS.feedbackRetention,
      range: [0.72, 0.98],
      attackMs: 0,
      fallMs: 0
    }],
    targetDefaults: {
      values: {
        [VISUAL_TARGETS.feedbackRetention]: 0.72
      }
    }
  };
  const timeline = runOfflineDeterministicSession({
    buffer,
    preset,
    sessionSeed: 311
  });
  const retention = timeline.map(
    frame => frame.targets.values[VISUAL_TARGETS.feedbackRetention]
  );

  assert.ok(Math.max(...retention) - Math.min(...retention) > 0.08);
  assert.equal(preset.mappings[0].sourceId, 'audio.buildEnergy');
});

test('Learn v0 accepts a recorded Phase 3.1 source', () => {
  const result = learnV0({
    sourceId: 'audio.buildEnergy',
    samples: frames.map(frame => ({
      engineTimeMs: frame.engineTimeMs,
      sources: coreFeatureSourceValues(frame)
    })),
    target: {
      min: 0,
      max: 1,
      defaultValue: 0.82
    },
    rangeAnchor: 0.74,
    rangeDirection: 1
  });

  assert.equal(result.ok, true);
  assert.ok(result.confidence > 0);
  assert.ok(result.suggestion.threshold >= 0);
  assert.ok(result.suggestion.range[1] > result.suggestion.range[0]);
});

test('Phase 3.1 UI exposes meters, sources and an editable build lab preset', () => {
  const html = fs.readFileSync(
    new URL('../demo/index.html', import.meta.url),
    'utf8'
  );
  const source = fs.readFileSync(
    new URL('../src/ui-debug/phase1-demo.ts', import.meta.url),
    'utf8'
  );

  for (const key of FEATURE_KEYS) {
    assert.match(html, new RegExp(`data-meter-value="${key}"`));
    assert.match(html, new RegExp(`value="audio\\.${key}"`));
  }
  assert.match(html, /value="buildLab"/);
  assert.match(source, /sourceId: 'audio\.buildEnergy'/);
  assert.match(source, /targetId: VISUAL_TARGETS\.feedbackRetention/);
});
