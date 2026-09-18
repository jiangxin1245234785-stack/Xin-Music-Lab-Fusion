import assert from 'node:assert/strict';
import test from 'node:test';

import {
  CORE_MAPPING_SOURCE_IDS,
  GENERATOR_MAPPING_SOURCE_IDS,
  LABEL_MUSIC_FEATURE_IDS,
  RUNTIME_SOURCE_IDS,
  RUNTIME_SOURCE_REGISTRY,
  VISUAL_CLOCK_SOURCE_REGISTRY
} from '../dist/index.js';
import { createLocaleController } from '../dist/ui/i18n/index.js';
import {
  SOURCE_DESCRIPTORS,
  createDeduplicatingMissingDescriptorHandler,
  resolveSourceDescriptor
} from '../dist/ui/semantics/index.js';

function sorted(values) {
  return [...values].sort((left, right) => left.localeCompare(right));
}

test('Step 3 Source catalog covers 27 music Sources plus 6 derived controls', () => {
  assert.equal(SOURCE_DESCRIPTORS.length, 33);
  assert.deepEqual(
    sorted(SOURCE_DESCRIPTORS.map(item => item.id)),
    sorted(GENERATOR_MAPPING_SOURCE_IDS)
  );
  assert.deepEqual(sorted(RUNTIME_SOURCE_IDS), sorted(CORE_MAPPING_SOURCE_IDS));
  assert.equal(
    SOURCE_DESCRIPTORS.some(item => LABEL_MUSIC_FEATURE_IDS.includes(item.id)),
    false,
    'semantic labels are not numeric Mapping Sources'
  );

  const groups = new Map([
    ...RUNTIME_SOURCE_REGISTRY.map(item => [item.sourceId, item.group]),
    ...VISUAL_CLOCK_SOURCE_REGISTRY.map(item => [item.sourceId, item.group])
  ]);
  for (const descriptor of SOURCE_DESCRIPTORS) {
    assert.equal(descriptor.classification, 'stable');
    assert.equal(descriptor.unit, 'normalized');
    assert.ok(descriptor.technicalAlias);
    assert.equal(
      descriptor.category,
      groups.get(descriptor.id),
      descriptor.id
    );
    assert.equal('targetId' in descriptor, false);
    assert.equal('mappingId' in descriptor, false);
  }
  assert.equal(
    new Set(SOURCE_DESCRIPTORS.map(item => item.labelKey)).size,
    SOURCE_DESCRIPTORS.length
  );
  assert.equal(
    new Set(SOURCE_DESCRIPTORS.map(item => item.descriptionKey)).size,
    SOURCE_DESCRIPTORS.length
  );
});

test('Step 3 Source descriptors resolve complete calibrated Chinese and English text', () => {
  const locale = createLocaleController();
  for (const id of GENERATOR_MAPPING_SOURCE_IDS) {
    const chinese = resolveSourceDescriptor(id, locale);
    assert.ok(chinese.label.length > 0, id);
    assert.ok(chinese.description.length > 0, id);
    locale.setLocalLocale('en-US');
    const english = resolveSourceDescriptor(id, locale);
    assert.ok(english.label.length > 0, id);
    assert.ok(english.description.length > 0, id);
    assert.notEqual(chinese.label, english.label, id);
    locale.setLocalLocale('zh-CN');
  }

  assert.match(
    resolveSourceDescriptor('audio.spectralDensity', locale).description,
    /不等同于器乐数量/
  );
  assert.match(
    resolveSourceDescriptor('state.inDrop', locale).label,
    /抽空\/能量抽离/
  );
  assert.match(
    resolveSourceDescriptor('audio.loudness', locale).description,
    /不是 LUFS 或 dB/
  );
  assert.notEqual(
    resolveSourceDescriptor('audio.chordConfidence', locale).label,
    resolveSourceDescriptor('confidence.chord', locale).label
  );
});

test('Step 3 dynamic node and unknown Source fallbacks are explicit and safe', () => {
  const locale = createLocaleController();
  const diagnostics = [];
  const onMissingDescriptor = createDeduplicatingMissingDescriptorHandler(
    diagnostic => diagnostics.push(diagnostic)
  );
  const dynamic = resolveSourceDescriptor('node:bass-flux-bus', locale, {
    node: {
      nodeId: 'bass-flux-bus',
      label: 'Bass + Flux Bus',
      kind: 'bus'
    },
    onMissingDescriptor
  });
  assert.equal(dynamic.classification, 'extension');
  assert.equal(dynamic.category, 'dynamic');
  assert.match(dynamic.label, /Bass \+ Flux Bus/);
  assert.equal(diagnostics.length, 0);
  const dynamicWithoutMetadata = resolveSourceDescriptor('node:future-bus', locale);
  assert.equal(dynamicWithoutMetadata.classification, 'extension');
  assert.match(dynamicWithoutMetadata.label, /future-bus/);

  const malicious = '<img src=x onerror=alert(1)>';
  const first = resolveSourceDescriptor(malicious, locale, { onMissingDescriptor });
  const second = resolveSourceDescriptor(malicious, locale, { onMissingDescriptor });
  assert.equal(first.classification, 'unknown');
  assert.match(first.label, /<img src=x onerror=alert\(1\)>/);
  assert.equal(second.label, first.label);
  assert.deepEqual(diagnostics, [{ domain: 'source', id: malicious }]);

  const throwing = { toString() { throw new Error('do not call through'); } };
  const guarded = resolveSourceDescriptor(throwing, locale, { onMissingDescriptor });
  assert.equal(guarded.classification, 'unknown');
  assert.match(guarded.label, /\(unprintable\)/);
});
