import assert from 'node:assert/strict';
import test from 'node:test';

import { VISUAL_TARGETS, createEventEnvelope } from '../dist/index.js';
import { createLocaleController } from '../dist/ui/i18n/index.js';
import {
  createMappingIntentViewModel
} from '../dist/ui/presenters/index.js';

function translator(locale = 'zh-CN') {
  return createLocaleController({ hostLocale: locale });
}

function continuous(overrides = {}) {
  return {
    id: 'intent-continuous',
    kind: 'continuous',
    sourceId: 'audio.bass',
    targetId: VISUAL_TARGETS.feedbackZoom,
    amount: 1.25,
    range: [0.9, 1.2],
    curve: 1.4,
    threshold: 0.2,
    attackMs: 90,
    fallMs: 360,
    polarity: 'normal',
    replaceMode: 'replace',
    probability: 1,
    ...overrides
  };
}

test('Step 5 intent presenter distinguishes positive and negative amount without mutating Mapping data', () => {
  const positive = continuous();
  const negative = continuous({
    id: 'intent-negative',
    amount: -0.75,
    replaceMode: 'add'
  });
  const positiveBefore = structuredClone(positive);
  const negativeBefore = structuredClone(negative);

  const positiveVm = createMappingIntentViewModel({
    mapping: positive,
    translator: translator()
  });
  const negativeVm = createMappingIntentViewModel({
    mapping: negative,
    translator: translator()
  });

  assert.equal(positiveVm.available, true);
  assert.equal(positiveVm.mapping.amount, 1.25);
  assert.equal(positiveVm.amountRole, '正作用量');
  assert.match(positiveVm.summary, /正作用量 1\.25/);
  assert.equal(negativeVm.mapping.amount, -0.75);
  assert.equal(negativeVm.amountRole, '负作用量');
  assert.match(negativeVm.summary, /负作用量 -0\.75/);
  assert.equal(negativeVm.operation.id, 'add');
  assert.deepEqual(positive, positiveBefore);
  assert.deepEqual(negative, negativeBefore);
});

test('Step 5 intent presenter exposes continuous and event semantics including Gate, Probability and Envelope', () => {
  const continuousVm = createMappingIntentViewModel({
    mapping: continuous(),
    translator: translator()
  });
  assert.equal(continuousVm.kind.id, 'continuous');
  assert.equal(continuousVm.envelope, null);
  assert.equal(continuousVm.responseText, '90 ms / 360 ms');

  const mapping = continuous({
    id: 'intent-event',
    kind: 'event',
    sourceId: 'event.onset',
    targetId: VISUAL_TARGETS.colorFlashStrength,
    envelopeId: 'impact',
    amount: 0.6,
    range: [0, 0.8],
    gateSourceId: 'state.inClimax',
    gateThreshold: 0.7,
    probability: 0.35,
    replaceMode: 'add'
  });
  const envelope = {
    id: 'impact',
    delayMs: 5,
    attackMs: 10,
    holdMs: 20,
    decayMs: 30,
    sustain: 0.4,
    releaseMs: 40,
    cooldownMs: 50,
    retriggerMode: 'accumulate'
  };
  const before = structuredClone({ mapping, envelope });
  const eventVm = createMappingIntentViewModel({
    mapping,
    envelope,
    translator: translator()
  });

  assert.equal(eventVm.kind.id, 'event');
  assert.equal(eventVm.retrigger.id, 'accumulate');
  assert.equal(eventVm.gateSource.id, 'state.inClimax');
  assert.equal(eventVm.gateText, `${eventVm.gateSource.label} ≥ 70%`);
  assert.equal(eventVm.probabilityText, '35%');
  assert.match(eventVm.envelopeText, /^impact · D 5 \/ A 10 \/ H 20 \/ D 30 /);
  assert.match(eventVm.envelopeText, /S 0\.4 \/ R 40 \/ C 50 ms$/);
  assert.match(eventVm.summary, /impact/);
  assert.match(eventVm.summary, /35%/);
  assert.match(eventVm.summary, /70%/);
  assert.deepEqual({ mapping, envelope }, before);
});

test('Step 5 intent presenter covers all five TargetMixer modes from Mapping data', () => {
  const modes = ['multiply', 'add', 'max', 'min', 'replace'];
  for (const mode of modes) {
    const viewModel = createMappingIntentViewModel({
      mapping: continuous({ id: `intent-${mode}`, replaceMode: mode }),
      translator: translator('en-US')
    });
    assert.equal(viewModel.operation.id, mode);
    assert.equal(viewModel.operation.technicalAlias, mode);
    assert.equal(viewModel.mapping.replaceMode, mode);
    assert.ok(viewModel.summary.includes(viewModel.operation.label));
  }
});

test('Step 5 event intent explains upward threshold crossing and defaults missing or mismatched Envelopes', () => {
  const mapping = continuous({
    id: 'intent-event-default-envelope',
    kind: 'event',
    sourceId: 'event.onset',
    targetId: VISUAL_TARGETS.colorFlashStrength,
    envelopeId: 'impact-default',
    threshold: 0.4,
    replaceMode: 'add'
  });
  const expectedDefault = createEventEnvelope({ id: 'impact-default' });

  const missing = createMappingIntentViewModel({
    mapping,
    translator: translator('zh-CN'),
    locale: 'zh-CN'
  });
  assert.deepEqual(missing.envelope, expectedDefault);
  assert.match(missing.summary, /向上穿过阈值/);
  assert.match(missing.summary, /impact-default/);

  const mismatchedInput = {
    id: 'another-envelope',
    attackMs: 999,
    holdMs: 888,
    retriggerMode: 'accumulate'
  };
  const before = structuredClone(mismatchedInput);
  const mismatched = createMappingIntentViewModel({
    mapping,
    envelope: mismatchedInput,
    translator: translator('en-US'),
    locale: 'en-US'
  });
  assert.deepEqual(mismatched.envelope, expectedDefault);
  assert.match(mismatched.summary, /crosses upward through/);
  assert.doesNotMatch(mismatched.envelopeText, /999|888/);
  assert.deepEqual(mismatchedInput, before);
});

test('Step 5 intent presenter safely preserves unknown Source and Target IDs', () => {
  const mapping = continuous({
    id: 'intent-unknown',
    sourceId: 'future.source/<b>',
    targetId: 'future.target/<script>'
  });
  const before = structuredClone(mapping);
  const viewModel = createMappingIntentViewModel({
    mapping,
    translator: translator()
  });

  assert.equal(viewModel.source.classification, 'unknown');
  assert.equal(viewModel.target.classification, 'unknown');
  assert.equal(viewModel.source.technicalAlias, mapping.sourceId);
  assert.equal(viewModel.target.technicalAlias, mapping.targetId);
  assert.match(viewModel.summary, /future\.source\/<b>/);
  assert.match(viewModel.summary, /future\.target\/<script>/);
  assert.deepEqual(mapping, before);
});

test('Step 5 bilingual intent changes presentation only and keeps raw intent data identical', () => {
  const mapping = continuous({
    id: 'intent-locale',
    amount: -0.5,
    gateSourceId: 'state.inBuild',
    gateThreshold: 0.65,
    probability: 0.4,
    replaceMode: 'multiply'
  });
  const zh = createMappingIntentViewModel({
    mapping,
    translator: translator('zh-CN')
  });
  const en = createMappingIntentViewModel({
    mapping,
    translator: translator('en-US')
  });

  assert.notEqual(zh.summary, en.summary);
  assert.match(zh.summary, /负作用量/);
  assert.match(en.summary, /negative amount/);
  assert.deepEqual(zh.mapping, en.mapping);
  assert.deepEqual(zh.envelope, en.envelope);
  assert.equal(zh.source.id, en.source.id);
  assert.equal(zh.target.id, en.target.id);
  assert.equal(zh.operation.id, en.operation.id);
  assert.equal(zh.polarity.id, en.polarity.id);
  assert.equal(zh.rangeText, en.rangeText);
  assert.equal(zh.responseText, en.responseText);
  assert.equal(zh.probabilityText, en.probabilityText);
});
