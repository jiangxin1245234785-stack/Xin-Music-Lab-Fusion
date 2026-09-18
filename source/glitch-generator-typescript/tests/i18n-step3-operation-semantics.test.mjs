import assert from 'node:assert/strict';
import test from 'node:test';

import {
  TARGET_MIXER_STEPS,
  TargetMixer,
  VISUAL_TARGETS
} from '../dist/index.js';
import { createLocaleController } from '../dist/ui/i18n/index.js';
import {
  ENVELOPE_FIELD_IDS,
  MAPPING_DEBUG_REASON_IDS,
  OPERATION_DESCRIPTOR_CATALOGS,
  TARGET_DEBUG_REASON_IDS,
  formatSemanticValue,
  resolveOperationDescriptor
} from '../dist/ui/semantics/index.js';

test('Step 3 operation catalogs cover the stable mixer and diagnostic unions', () => {
  assert.deepEqual(
    Object.keys(OPERATION_DESCRIPTOR_CATALOGS['mixer-step']),
    [...TARGET_MIXER_STEPS]
  );
  assert.deepEqual(
    Object.keys(OPERATION_DESCRIPTOR_CATALOGS.envelope),
    [...ENVELOPE_FIELD_IDS]
  );
  assert.deepEqual(
    Object.keys(OPERATION_DESCRIPTOR_CATALOGS['mapping-status']),
    [...MAPPING_DEBUG_REASON_IDS]
  );
  assert.deepEqual(
    Object.keys(OPERATION_DESCRIPTOR_CATALOGS['target-status']),
    [...TARGET_DEBUG_REASON_IDS]
  );
  for (const catalog of Object.values(OPERATION_DESCRIPTOR_CATALOGS)) {
    for (const descriptor of Object.values(catalog)) {
      assert.ok(descriptor.labelKey);
      assert.ok(descriptor.descriptionKey);
      assert.equal('sourceId' in descriptor, false);
      assert.equal('targetId' in descriptor, false);
    }
  }
});

test('Step 3 operation, Envelope, Gate and status text resolve in both locales', () => {
  const locale = createLocaleController();
  const sustainZh = resolveOperationDescriptor('envelope', 'sustain', locale);
  assert.match(sustainZh.description, /没有独立维持时长/);
  assert.equal(sustainZh.formatter, 'percent');
  assert.equal(
    resolveOperationDescriptor('gate', 'closed', locale).label,
    '门控未开启'
  );
  const gateThreshold = resolveOperationDescriptor(
    'gate', 'gateThreshold', locale
  );
  assert.equal(gateThreshold.technicalAlias, 'gateThreshold');
  assert.equal(gateThreshold.formatter, 'decimal');
  assert.equal(formatSemanticValue(gateThreshold, 0.5), '0.5');
  assert.equal(
    resolveOperationDescriptor('mapping-status', 'CONTRIBUTING', locale).label,
    '正在生效'
  );

  locale.setLocalLocale('en-US');
  const sustainEn = resolveOperationDescriptor('envelope', 'sustain', locale);
  assert.match(sustainEn.description, /without a separate sustain duration/);
  assert.equal(
    resolveOperationDescriptor('mapping-operation', 'replace', locale).label,
    'Replace'
  );
  assert.equal(
    resolveOperationDescriptor('target-status', 'OTHER_MAPPING_OR_POST_PROCESS', locale).label,
    'Changed Elsewhere'
  );
});

test('Step 3 unknown operation IDs keep raw evidence without throwing', () => {
  const locale = createLocaleController();
  const diagnostics = [];
  const fallback = resolveOperationDescriptor(
    'mapping-operation',
    'future-mode',
    locale,
    { onMissingDescriptor: diagnostic => diagnostics.push(diagnostic) }
  );
  assert.equal(fallback.classification, 'unknown');
  assert.match(fallback.label, /future-mode/);
  assert.deepEqual(diagnostics, [{
    domain: 'operation', id: 'mapping-operation:future-mode'
  }]);

  assert.equal(
    resolveOperationDescriptor('envelope', 'future-stage', locale).kind,
    'envelope'
  );
  assert.equal(
    resolveOperationDescriptor('gate', 'future-state', locale).kind,
    'gate'
  );
  assert.equal(
    resolveOperationDescriptor('mapping-status', 'FUTURE', locale).kind,
    'status'
  );
  const throwing = { toString() { throw new Error('blocked'); } };
  const guarded = resolveOperationDescriptor(
    'mapping-operation', throwing, locale
  );
  assert.equal(guarded.technicalAlias, '(unprintable)');
});

test('Step 3 Gate description matches the engine equality rule', () => {
  const mixer = new TargetMixer();
  const frame = mixer.mixFrame({
    mappings: [{
      id: 'gate-equality',
      sourceId: 'audio.bass',
      targetId: VISUAL_TARGETS.feedbackZoom,
      amount: 1,
      range: [0.5, 1.5],
      gateSourceId: 'state.inBuild',
      gateThreshold: 0.5
    }],
    sourceValues: {
      'audio.bass': 1,
      'state.inBuild': 0.5
    },
    clock: { frameIndex: 1, nowMs: 16, deltaMs: 16 },
    randomFloat: () => 0
  });
  assert.equal(frame.gateDecisions.length, 1);
  assert.equal(frame.gateDecisions[0].open, true);
});

test('Step 3 closed Gate excludes one Mapping without erasing another', () => {
  const mixer = new TargetMixer();
  const frame = mixer.mixFrame({
    mappings: [
      {
        id: 'closed-add',
        sourceId: 'audio.bass',
        targetId: VISUAL_TARGETS.feedbackZoom,
        amount: 1,
        range: [0, 0.5],
        replaceMode: 'add',
        gateSourceId: 'state.inBuild',
        gateThreshold: 0.8
      },
      {
        id: 'open-add',
        sourceId: 'audio.mid',
        targetId: VISUAL_TARGETS.feedbackZoom,
        amount: 1,
        range: [0, 0.25],
        replaceMode: 'add'
      }
    ],
    sourceValues: {
      'audio.bass': 1,
      'audio.mid': 1,
      'state.inBuild': 0.2
    },
    baseState: {
      values: { [VISUAL_TARGETS.feedbackZoom]: 1 }
    },
    clock: { frameIndex: 1, nowMs: 16, deltaMs: 16 },
    randomFloat: () => 0
  });
  assert.equal(frame.gateDecisions[0].open, false);
  assert.ok(frame.targets.values[VISUAL_TARGETS.feedbackZoom] > 1);
});
