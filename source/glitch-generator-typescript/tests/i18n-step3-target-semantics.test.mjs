import assert from 'node:assert/strict';
import test from 'node:test';

import {
  FORMAL_TARGET_UNIFORM_BINDINGS,
  GLSLUniformTargetRegistry,
  VISUAL_TARGET_REGISTRY,
  VISUAL_TARGETS
} from '../dist/index.js';
import { createLocaleController } from '../dist/ui/i18n/index.js';
import {
  FORMAL_TARGET_DESCRIPTORS,
  LEGACY_TARGET_DESCRIPTORS,
  STATIC_TARGET_DESCRIPTORS,
  formatSemanticValue,
  resolveTargetDescriptor
} from '../dist/ui/semantics/index.js';

function sorted(values) {
  return [...values].sort((left, right) => left.localeCompare(right));
}

test('Step 3 partitions formal, legacy and uniform-bound Targets exactly', () => {
  const formalIds = VISUAL_TARGET_REGISTRY.map(item => item.id);
  const legacyIds = ['visual.alpha', 'visual.brightness', 'visual.scale'];
  assert.equal(FORMAL_TARGET_DESCRIPTORS.length, 21);
  assert.equal(LEGACY_TARGET_DESCRIPTORS.length, 3);
  assert.deepEqual(
    sorted(FORMAL_TARGET_DESCRIPTORS.map(item => item.id)),
    sorted(formalIds)
  );
  assert.deepEqual(
    sorted(LEGACY_TARGET_DESCRIPTORS.map(item => item.id)),
    legacyIds
  );
  assert.deepEqual(
    sorted(STATIC_TARGET_DESCRIPTORS.map(item => item.id)),
    sorted(Object.values(VISUAL_TARGETS))
  );
  assert.deepEqual(
    sorted(FORMAL_TARGET_UNIFORM_BINDINGS.map(item => item.targetId)),
    sorted(formalIds)
  );
  assert.equal(
    new Set(FORMAL_TARGET_UNIFORM_BINDINGS.map(item => item.uniformName)).size,
    FORMAL_TARGET_UNIFORM_BINDINGS.length
  );
  assert.ok(FORMAL_TARGET_DESCRIPTORS.every(item => item.classification === 'formal'));
  assert.ok(LEGACY_TARGET_DESCRIPTORS.every(item => item.classification === 'legacy-fallback'));
});

test('Step 3 Target descriptions explain only their own visual behavior', () => {
  const locale = createLocaleController();
  for (const descriptor of STATIC_TARGET_DESCRIPTORS) {
    const chinese = resolveTargetDescriptor(descriptor.id, locale);
    locale.setLocalLocale('en-US');
    const english = resolveTargetDescriptor(descriptor.id, locale);
    assert.ok(chinese.label && chinese.description, descriptor.id);
    assert.ok(english.label && english.description, descriptor.id);
    assert.equal('sourceId' in descriptor, false);
    assert.equal('audioFeatureId' in descriptor, false);
    locale.setLocalLocale('zh-CN');
  }
  const rgbDecay = resolveTargetDescriptor('rgbSplit.decay', locale);
  assert.equal(rgbDecay.label, '色道分离保留度');
  assert.match(rgbDecay.technicalAlias, /Decay.*uRgbDecay/);
  assert.equal(
    resolveTargetDescriptor('visual.scale', locale).classification,
    'legacy-fallback'
  );
});

test('Step 3 recognizes only actually registered GLSL extension Targets', () => {
  const locale = createLocaleController();
  const registry = new GLSLUniformTargetRegistry();
  const floatTarget = registry.register({
    name: 'uArtistFracture',
    type: 'float',
    range: [0, 1],
    default: 0.2,
    label: 'Artist Fracture'
  }).target;
  const intTarget = registry.register({
    name: 'uSliceCount',
    type: 'int',
    range: [1, 12],
    default: 4
  }).target;
  const boolTarget = registry.register({
    name: 'uInvertField',
    type: 'bool',
    range: [0, 1],
    default: 0
  }).target;

  const floatDescriptor = resolveTargetDescriptor(floatTarget.id, locale, {
    extensionDefinitions: registry.targetDefinitions()
  });
  assert.equal(floatDescriptor.classification, 'extension');
  assert.equal(floatDescriptor.unit, 'scalar');
  assert.equal(floatDescriptor.formatter, 'decimal');
  assert.match(floatDescriptor.label, /Artist Fracture/);
  assert.equal(
    resolveTargetDescriptor(intTarget.id, locale, {
      extensionDefinitions: registry.targetDefinitions()
    }).formatter,
    'integer'
  );
  assert.equal(
    resolveTargetDescriptor(boolTarget.id, locale, {
      extensionDefinitions: registry.targetDefinitions()
    }).formatter,
    'boolean'
  );

  registry.remove('uArtistFracture');
  const diagnostics = [];
  const removed = resolveTargetDescriptor(floatTarget.id, locale, {
    onMissingDescriptor: diagnostic => diagnostics.push(diagnostic)
  });
  assert.equal(removed.classification, 'unknown');
  assert.match(removed.label, /未登记的 GLSL/);
  assert.deepEqual(diagnostics, [{ domain: 'target', id: floatTarget.id }]);

  const malformed = resolveTargetDescriptor('glsl:uMalformed', locale, {
    extensionDefinitions: [{
      id: 'glsl:uMalformed',
      module: 'Custom(GLSL)',
      label: 'Malformed',
      defaultValue: 0,
      min: 0,
      max: 1,
      uniformName: 'uMalformed'
    }]
  });
  assert.equal(malformed.classification, 'unknown');
});

test('Step 3 semantic formatters are deterministic and non-finite safe', () => {
  const descriptor = formatter => ({ formatter });
  assert.equal(formatSemanticValue(descriptor('degrees'), Math.PI), '180°');
  assert.equal(formatSemanticValue(descriptor('duration'), 0.35), '350 ms');
  assert.equal(formatSemanticValue(descriptor('percent'), 0.08), '8%');
  assert.equal(formatSemanticValue(descriptor('signed-percent'), -0.5), '-50%');
  assert.equal(formatSemanticValue(descriptor('multiplier'), 1), '1×');
  assert.equal(formatSemanticValue(descriptor('hue-angle'), 11 / 12), '330°');
  assert.equal(formatSemanticValue(descriptor('boolean'), 1, 'zh-CN'), '开');
  assert.equal(formatSemanticValue(descriptor('boolean'), 0, 'en-US'), 'Off');
  assert.equal(formatSemanticValue(descriptor('decimal'), Number.NaN), '—');
  assert.equal(formatSemanticValue(descriptor('decimal'), Infinity), '—');
});
