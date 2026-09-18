import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

import {
  CURRENT_SCHEMA_VERSION,
  getProductBuiltInPreset
} from '../dist/index.js';
import { createLocaleController } from '../dist/ui/i18n/index.js';
import {
  SOURCE_DESCRIPTORS,
  STATIC_TARGET_DESCRIPTORS,
  buildSemanticCoverageReport,
  resolveSourceDescriptor,
  resolveTargetDescriptor
} from '../dist/ui/semantics/index.js';
import {
  buildI18nStep1DeterministicBaseline,
  serializeI18nStep1Baseline
} from './support/i18n-step1-baseline.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

test('Step 3 semantic coverage report is complete against every real Registry', () => {
  const report = buildSemanticCoverageReport();
  assert.equal(report.complete, true);
  assert.equal(report.sourceRegistry.expected.length, 33);
  assert.equal(report.formalTargets.expected.length, 21);
  assert.equal(report.staticTargetPartition.expected.length, 24);
  assert.equal(report.formalUniformNames.complete, true);
  assert.deepEqual(report.missingEnglishKeys, []);
  assert.deepEqual(report.missingChineseKeys, []);
  assert.deepEqual(report.forbiddenDescriptorFields, []);
  assert.deepEqual(report.forbiddenTargetRelations, []);
  assert.ok(Object.values(report.operationDomains).every(item => item.complete));
});

test('Step 3 descriptor reads do not mutate preset JSON or schema', () => {
  const locale = createLocaleController();
  const preset = getProductBuiltInPreset('temporal-excavation');
  const before = JSON.stringify(preset);
  for (const item of SOURCE_DESCRIPTORS) {
    resolveSourceDescriptor(item.id, locale);
  }
  for (const item of STATIC_TARGET_DESCRIPTORS) {
    resolveTargetDescriptor(item.id, locale);
  }
  locale.setLocalLocale('en-US');
  for (const item of SOURCE_DESCRIPTORS) resolveSourceDescriptor(item.id, locale);
  assert.equal(JSON.stringify(preset), before);
  assert.equal(CURRENT_SCHEMA_VERSION, 16);
});

test('Step 3 keeps the approved 188-frame engine outputs byte-identical', () => {
  const expected = JSON.parse(readFileSync(
    path.join(root, 'artifacts', 'i18n-step1', 'deterministic-baseline.json'),
    'utf8'
  ));
  const actual = JSON.parse(
    serializeI18nStep1Baseline(buildI18nStep1DeterministicBaseline())
  );
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
    assert.equal(actual.hashes[key], expected.hashes[key], key);
  }
});

test('Step 3 remains an independent UI subpath outside Browser runtime closure', () => {
  const packageJson = JSON.parse(readFileSync(path.join(root, 'package.json'), 'utf8'));
  const manifest = JSON.parse(readFileSync(
    path.join(root, 'dist', 'browser-manifest.json'),
    'utf8'
  ));
  assert.equal(
    packageJson.exports['./ui/semantics'].default,
    './dist/ui/semantics/index.js'
  );
  assert.equal(
    manifest.files.some(file => file.path.includes('ui/semantics/')),
    false
  );
});
