import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

import {
  TargetMixer,
  VISUAL_TARGETS,
  createSeededPrng
} from '../dist/index.js';

const frame = (frameIndex, nowMs, deltaMs = frameIndex === 0 ? 0 : 10) => ({
  frameIndex,
  nowMs,
  deltaMs
});

const continuous = overrides => ({
  id: 'complete-card',
  sourceId: 'audio.bass',
  targetId: VISUAL_TARGETS.rgbAngle,
  range: [0, 1],
  attackMs: 0,
  fallMs: 0,
  threshold: 0,
  probability: 1,
  safetyClamp: true,
  replaceMode: 'replace',
  polarity: 'normal',
  ...overrides
});

const mixOne = (mapping, sourceValue, baseValues = {}, randomFloat) =>
  new TargetMixer().mixFrame({
    mappings: [mapping],
    sourceValues: { [mapping.sourceId]: sourceValue },
    baseState: { values: baseValues },
    clock: frame(0, 0),
    randomFloat
  });

test('polarity inverts conditioned mapping direction without hard-coded target logic', () => {
  const normal = mixOne(
    continuous({ range: [-1, 1], polarity: 'normal' }),
    0.25
  );
  const inverted = mixOne(
    continuous({ range: [-1, 1], polarity: 'inverted' }),
    0.25
  );

  assert.equal(normal.targets.values[VISUAL_TARGETS.rgbAngle], -0.5);
  assert.equal(inverted.targets.values[VISUAL_TARGETS.rgbAngle], 0.5);
  assert.equal(normal.contributions[0].polarizedValue, 0.25);
  assert.equal(inverted.contributions[0].polarizedValue, 0.75);
});

test('replaceMode fills the existing Multiply, Add, Max/Min and Replace layers', () => {
  const targetId = VISUAL_TARGETS.colorContrast;
  const mappings = [
    continuous({
      id: 'multiply',
      targetId,
      range: [1.5, 1.5],
      replaceMode: 'multiply'
    }),
    continuous({
      id: 'add',
      targetId,
      range: [0.25, 0.25],
      replaceMode: 'add'
    }),
    continuous({
      id: 'max',
      targetId,
      range: [1.9, 1.9],
      replaceMode: 'max'
    }),
    continuous({
      id: 'min',
      targetId,
      range: [1.8, 1.8],
      replaceMode: 'min'
    }),
    continuous({
      id: 'replace',
      targetId,
      range: [1.6, 1.6],
      replaceMode: 'replace',
      priority: 10
    })
  ];
  const mixed = new TargetMixer().mixFrame({
    mappings,
    sourceValues: { 'audio.bass': 1 },
    baseState: { values: { [targetId]: 1 } },
    clock: frame(0, 0)
  });

  assert.equal(mixed.trace.multiply.values[targetId], 1.5);
  assert.equal(mixed.trace.add.values[targetId], 1.75);
  assert.equal(mixed.trace.maxMin.values[targetId], 1.8);
  assert.equal(mixed.trace.replace.values[targetId], 1.6);
  assert.equal(mixed.targets.values[targetId], 1.6);
});

test('safetyClamp constrains the card layer while the physical cap always remains active', () => {
  const targetId = VISUAL_TARGETS.colorContrast;
  const safe = mixOne(
    continuous({
      targetId,
      range: [5, 5],
      replaceMode: 'add',
      safetyClamp: true
    }),
    1,
    { [targetId]: 1 }
  );
  const raw = mixOne(
    continuous({
      targetId,
      range: [5, 5],
      replaceMode: 'add',
      safetyClamp: false
    }),
    1,
    { [targetId]: 1 }
  );

  assert.equal(safe.trace.add.values[targetId], 2);
  assert.equal(raw.trace.add.values[targetId], 6);
  assert.equal(safe.targets.values[targetId], 2);
  assert.equal(raw.targets.values[targetId], 2);
});

test('probability samples once per continuous source excursion using injected PRNG', () => {
  const mapping = continuous({ probability: 0.5 });
  const mixer = new TargetMixer();
  const samples = [0.75, 0.25];
  let sampleCount = 0;
  const randomFloat = () => samples[sampleCount++] ?? 1;
  const run = (value, index) => mixer.mixFrame({
    mappings: [mapping],
    sourceValues: { 'audio.bass': value },
    baseState: { values: { [VISUAL_TARGETS.rgbAngle]: 0 } },
    clock: frame(index, index * 10),
    randomFloat
  });

  run(0, 0);
  const blocked = run(1, 1);
  const heldBlocked = run(1, 2);
  run(0, 3);
  const passed = run(1, 4);

  assert.equal(blocked.targets.values[VISUAL_TARGETS.rgbAngle], 0);
  assert.equal(heldBlocked.targets.values[VISUAL_TARGETS.rgbAngle], 0);
  assert.equal(passed.targets.values[VISUAL_TARGETS.rgbAngle], 1);
  assert.equal(sampleCount, 2);
});

test('event probability is deterministic for a seeded PRNG', () => {
  const mapping = {
    ...continuous({
      kind: 'event',
      sourceId: 'event.onset',
      probability: 0.5,
      envelopeId: 'impact'
    })
  };
  const envelope = {
    id: 'impact',
    attackMs: 0,
    holdMs: 20,
    decayMs: 0,
    sustain: 1,
    releaseMs: 20,
    cooldownMs: 0,
    retriggerMode: 'restart'
  };
  const run = () => {
    const random = createSeededPrng(3303, 12);
    const mixer = new TargetMixer();
    return [1, 0, 1, 0, 1].map((value, index) =>
      mixer.mixFrame({
        mappings: [mapping],
        envelopes: [envelope],
        sourceValues: { 'event.onset': value },
        baseState: { values: { [VISUAL_TARGETS.rgbAngle]: 0 } },
        clock: frame(index, index * 30, index === 0 ? 0 : 30),
        randomFloat: () => random.nextFloat()
      }).targets.values[VISUAL_TARGETS.rgbAngle]
    );
  };

  assert.deepEqual(run(), run());
});

test('accumulate retriggerMode adds overlapping event voices', () => {
  const mapping = continuous({
    kind: 'event',
    sourceId: 'event.bassPeak',
    envelopeId: 'impact',
    safetyClamp: false
  });
  const envelope = {
    id: 'impact',
    attackMs: 0,
    holdMs: 100,
    decayMs: 0,
    sustain: 1,
    releaseMs: 100,
    cooldownMs: 0
  };
  const accumulate = new TargetMixer();
  const restart = new TargetMixer();
  const run = (mixer, retriggerMode, value, index) => mixer.mixFrame({
    mappings: [mapping],
    envelopes: [{ ...envelope, retriggerMode }],
    sourceValues: { 'event.bassPeak': value },
    baseState: { values: { [VISUAL_TARGETS.rgbAngle]: 0 } },
    clock: frame(index, index * 10)
  });

  run(accumulate, 'accumulate', 1, 0);
  run(restart, 'restart', 1, 0);
  run(accumulate, 'accumulate', 0, 1);
  run(restart, 'restart', 0, 1);
  const stacked = run(accumulate, 'accumulate', 1, 2);
  const replaced = run(restart, 'restart', 1, 2);

  assert.equal(stacked.trace.replace.values[VISUAL_TARGETS.rgbAngle], 2);
  assert.equal(replaced.trace.replace.values[VISUAL_TARGETS.rgbAngle], 1);
});

test('Phase 3.3 UI exposes complete MappingCard fields and accumulate retrigger', () => {
  const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
  const html = fs.readFileSync(path.join(root, 'demo', 'index.html'), 'utf8');
  const source = fs.readFileSync(
    path.join(root, 'src', 'ui-debug', 'phase1-demo.ts'),
    'utf8'
  );

  for (const id of [
    'mappingPolarity',
    'mappingReplaceMode',
    'mappingProbability',
    'mappingSafetyClamp',
    'mappingModeReadout',
    'probabilityReadout',
    'safetyClampReadout'
  ]) {
    assert.match(html, new RegExp(`id="${id}"`));
  }
  for (const mode of ['multiply', 'add', 'max', 'min', 'replace']) {
    assert.match(html, new RegExp(`value="${mode}"`));
  }
  assert.match(html, /value="accumulate"/);
  assert.match(source, /randomFloat: \(\) => random\.nextFloat\(\)/);
  assert.doesNotMatch(source, /Math\.random\(/);
});
