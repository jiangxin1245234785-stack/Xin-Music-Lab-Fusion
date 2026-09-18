import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';

import {
  FeatureHistoryBuffer,
  PRESET_DEFAULTS,
  VISUAL_TARGETS,
  coreFeatureSourceValues,
  createValidationBuffer,
  learnV0,
  runOfflineDeterministicSession
} from '../dist/index.js';

const timeline = runOfflineDeterministicSession({
  buffer: createValidationBuffer(),
  preset: PRESET_DEFAULTS,
  sessionSeed: 225
});

const offlineSamples = timeline.map(frame => ({
  engineTimeMs: frame.clock.nowMs,
  sources: coreFeatureSourceValues(frame.features)
}));

function uniformSamples(sourceId, valueAt, count = 80) {
  return Array.from({ length: count }, (_, index) => ({
    engineTimeMs: index * 50,
    sources: { [sourceId]: valueAt(index) }
  }));
}

test('Learn v0 suggests deterministic initial values from offline playback', () => {
  const before = structuredClone(offlineSamples);
  const options = {
    sourceId: 'audio.loudness',
    samples: offlineSamples,
    target: {
      min: 0.5,
      max: 2,
      defaultValue: 1
    }
  };
  const first = learnV0(options);
  const second = learnV0(options);

  assert.equal(first.ok, true);
  assert.deepEqual(second, first);
  assert.deepEqual(offlineSamples, before);
  assert.ok(first.confidence >= 0 && first.confidence <= 1);
  assert.ok(first.suggestion.threshold >= 0 && first.suggestion.threshold <= 1);
  assert.ok(first.suggestion.range.every(value => value >= 0.5 && value <= 2));
  assert.ok(first.suggestion.attackMs >= 0);
  assert.ok(first.suggestion.fallMs >= 0);
});

test('FeatureHistoryBuffer uses engine time, stays bounded and clears on rewind', () => {
  const history = new FeatureHistoryBuffer(1_000);
  history.record(0, { arbitrary: 0 });
  history.record(600, { arbitrary: 0.5 });
  history.record(1_200, { arbitrary: 1 });
  assert.deepEqual(
    history.list().map(sample => sample.engineTimeMs),
    [600, 1_200]
  );

  history.record(100, { arbitrary: 0.25 });
  assert.deepEqual(
    history.list().map(sample => sample.engineTimeMs),
    [100]
  );
});

test('Learn v0 fails explicitly for short, silent and low-dynamic segments', () => {
  const tooShort = learnV0({
    sourceId: 'audio.loudness',
    samples: offlineSamples.slice(0, 10)
  });
  const silent = learnV0({
    sourceId: 'audio.loudness',
    samples: uniformSamples('audio.loudness', () => 0)
  });
  const flat = learnV0({
    sourceId: 'audio.loudness',
    samples: uniformSamples('audio.loudness', () => 0.4)
  });

  assert.deepEqual(
    [tooShort.ok ? '' : tooShort.code, silent.ok ? '' : silent.code, flat.ok ? '' : flat.code],
    ['TOO_SHORT', 'SILENT', 'LOW_DYNAMICS']
  );
  assert.equal(tooShort.confidence, 0);
  assert.equal(silent.confidence, 0);
  assert.equal(flat.confidence, 0);
});

test('Learn v0 reports an unavailable source rather than substituting one', () => {
  const result = learnV0({
    sourceId: 'phase3.notRecorded',
    samples: offlineSamples
  });
  assert.equal(result.ok, false);
  assert.equal(result.code, 'SOURCE_UNAVAILABLE');
});

test('Learn v0 accepts future generic source ids without source-specific logic', () => {
  const samples = uniformSamples(
    'phase3.futureFlux',
    index => 0.15 + 0.75 * Math.abs(Math.sin(index * 0.23))
  );
  const result = learnV0({
    sourceId: 'phase3.futureFlux',
    samples,
    target: { min: 0, max: 1, defaultValue: 0 }
  });

  assert.equal(result.ok, true);
  assert.equal(result.sourceId, 'phase3.futureFlux');
  assert.ok(result.suggestion.range[1] > result.suggestion.range[0]);
});

test('Learn UI exposes suggestions and has no auto-apply control', () => {
  const html = fs.readFileSync(
    new URL('../demo/index.html', import.meta.url),
    'utf8'
  );
  const source = fs.readFileSync(
    new URL('../src/ui-debug/phase1-demo.ts', import.meta.url),
    'utf8'
  );

  for (const id of [
    'learnWindowSeconds',
    'learnAnalyzeButton',
    'learnConfidence',
    'learnThreshold',
    'learnRange',
    'learnAttack',
    'learnFall'
  ]) {
    assert.match(html, new RegExp(`id="${id}"`));
  }
  assert.doesNotMatch(html, /id="learnApply/i);
  assert.match(source, /learnHistory\.record\(clockFrame\.nowMs, sourceValues\)/);
  assert.match(source, /renderLearnResult\(learnV0\(/);
  assert.doesNotMatch(source, /function applyLearnSuggestion/);
});

test('Learn does not alter the fixed TargetMixer or physical safety path', () => {
  const source = fs.readFileSync(
    new URL('../src/ui-debug/phase1-demo.ts', import.meta.url),
    'utf8'
  );
  assert.match(source, /const mixed = mixer\.mixFrame\(/);
  assert.match(
    source,
    /const targets = performanceProfiler\.measure\(\s*'mixer',\s*\(\) => safety\.apply\(\s*mixed\.targets,\s*clockFrame,\s*targetDefinitions\s*\)\s*\)/
  );
  assert.equal(VISUAL_TARGETS.feedbackZoom, 'feedback.zoom');
});
