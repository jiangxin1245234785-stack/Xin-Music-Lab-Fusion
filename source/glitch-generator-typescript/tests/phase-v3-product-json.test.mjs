import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

import {
  CURRENT_SCHEMA_VERSION,
  PRODUCT_PRESET_JSON_CONTRACT,
  PRODUCT_PRESET_JSON_VERSION,
  createProductPresetFileName,
  createValidationBuffer,
  exportProductPresetJson,
  getProductBuiltInPreset,
  runOfflineDeterministicSession,
  stageProductPresetJson
} from '../dist/index.js';

const source = await readFile(
  new URL('../src/preset/product-json.ts', import.meta.url),
  'utf8'
);

test('V-3 exports a validated plain preset JSON file', () => {
  const preset = getProductBuiltInPreset('balanced');
  const first = exportProductPresetJson(preset);
  const second = exportProductPresetJson(preset);
  const parsed = JSON.parse(first);
  assert.equal(first, second);
  assert.equal(first.endsWith('\n'), true);
  assert.equal(parsed.id, 'balanced');
  assert.equal(parsed.schemaVersion, CURRENT_SCHEMA_VERSION);
  assert.equal(
    createProductPresetFileName(preset),
    `Xin-Glitch-balanced-schema${CURRENT_SCHEMA_VERSION}.json`
  );
  assert.equal(PRODUCT_PRESET_JSON_CONTRACT, 'xin.glitch-product-preset-json/1');
  assert.equal(PRODUCT_PRESET_JSON_VERSION, '5.3.0-product-json');
});

test('V-3 staged round trip preserves deterministic offline targets', () => {
  const preset = getProductBuiltInPreset('balanced');
  const staged = stageProductPresetJson(exportProductPresetJson(preset));
  assert.equal(staged.applied, false);
  assert.equal(staged.valid, true);
  assert.equal(staged.code, 'PRESET_READY');
  assert.equal(staged.compatibility.status, 'current');
  const buffer = createValidationBuffer();
  const first = runOfflineDeterministicSession({
    buffer,
    preset,
    sessionSeed: 91
  });
  const second = runOfflineDeterministicSession({
    buffer,
    preset: staged.preset,
    sessionSeed: 91
  });
  assert.equal(second.length, first.length);
  for (let index = 0; index < first.length; index++) {
    assert.deepEqual(second[index].targets.values, first[index].targets.values);
    assert.equal(second[index].randomSample, first[index].randomSample);
  }
});

test('V-3 migrates known old schemas before making them applicable', () => {
  const legacy = getProductBuiltInPreset('balanced');
  legacy.schemaVersion = CURRENT_SCHEMA_VERSION - 1;
  delete legacy.engineVersion;
  const staged = stageProductPresetJson(JSON.stringify(legacy));
  assert.equal(staged.valid, true);
  assert.equal(staged.code, 'PRESET_MIGRATED');
  assert.equal(staged.compatibility.status, 'migrated');
  assert.equal(staged.preset.schemaVersion, CURRENT_SCHEMA_VERSION);
  assert.equal(staged.compatibility.appliedMigrations.length, 1);
});

test('V-3 rejects parse errors, future schemas and partial migration', () => {
  const parse = stageProductPresetJson('{broken');
  assert.equal(parse.valid, false);
  assert.equal(parse.code, 'PRESET_JSON_PARSE_FAILED');

  const future = stageProductPresetJson(JSON.stringify({
    schemaVersion: CURRENT_SCHEMA_VERSION + 1,
    name: 'Future'
  }));
  assert.equal(future.valid, false);
  assert.equal(future.code, 'PRESET_INCOMPATIBLE');

  const partial = getProductBuiltInPreset('balanced');
  partial.unknownProductField = true;
  const partialStage = stageProductPresetJson(JSON.stringify(partial));
  assert.equal(partialStage.valid, false);
  assert.equal(partialStage.code, 'PRESET_PARTIAL_REQUIRES_EDITOR');
  assert.equal(partialStage.compatibility.status, 'partial');
});

test('V-3 keeps custom shader transactions in the advanced editor', () => {
  const preset = getProductBuiltInPreset('balanced');
  preset.shaderPipeline = {
    passOrder: ['builtin-feedback', 'custom-glsl'],
    customPass: {
      enabled: true,
      label: 'Imported custom pass',
      source: 'void main(){ fragColor = vec4(1.0); }'
    },
    uniformRegistry: []
  };
  const staged = stageProductPresetJson(JSON.stringify(preset));
  assert.equal(staged.valid, false);
  assert.equal(staged.code, 'PRESET_SHADER_PIPELINE_REQUIRES_EDITOR');
  assert.equal(staged.compatibility.compatible, true);
});

test('V-3 product JSON boundary has no runtime or wall-clock ownership', () => {
  for (const forbidden of [
    'requestAnimationFrame',
    'getContext(',
    'Math.random(',
    'performance.now(',
    'Date.now('
  ]) {
    assert.equal(source.includes(forbidden), false, forbidden);
  }
});
