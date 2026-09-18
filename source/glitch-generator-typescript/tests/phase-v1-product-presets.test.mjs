import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

import {
  CURRENT_SCHEMA_VERSION,
  PRODUCT_BUILTIN_PRESET_CONTRACT,
  createValidationBuffer,
  getProductBuiltInPreset,
  listProductBuiltInPresets,
  loadValidatedPreset,
  runOfflineDeterministicSession
} from '../dist/index.js';

const builtInSource = await readFile(
  new URL('../src/preset/built-in-presets.ts', import.meta.url),
  'utf8'
);
const demoSource = await readFile(
  new URL('../src/ui-debug/phase1-demo.ts', import.meta.url),
  'utf8'
);

test('V-1 exposes the reconciled five validated read-only product presets', () => {
  assert.equal(
    PRODUCT_BUILTIN_PRESET_CONTRACT,
    'xin.glitch-product-presets/1'
  );
  const summaries = listProductBuiltInPresets();
  assert.deepEqual(
    summaries.map(item => item.id),
    [
      'balanced',
      'temporal-excavation',
      'raster-deflection',
      'bitplane-drift',
      'quantized-memory'
    ]
  );
  for (const summary of summaries) {
    assert.equal(summary.category, 'built-in');
    assert.equal(summary.readOnly, true);
    assert.equal(summary.schemaVersion, CURRENT_SCHEMA_VERSION);
    const preset = loadValidatedPreset(
      getProductBuiltInPreset(summary.id)
    );
    assert.equal(preset.id, summary.id);
    assert.equal(preset.schemaVersion, CURRENT_SCHEMA_VERSION);
    assert.ok(preset.mappings.length > 0);
  }
  assert.equal(summaries.some(item => item.id === 'fracture'), false);
  assert.equal(summaries.some(item => item.id === 'impact'), false);
});

test('reconciled mechanism presets own shader pipelines and typed targets', () => {
  const mechanisms = {
    'temporal-excavation': [
      'uTemporalDepth',
      'uTemporalAgeBias',
      'uTemporalCellScale',
      'uTemporalBleed'
    ],
    'raster-deflection': [
      'uRasterBend',
      'uRasterLift',
      'uRasterDensity',
      'uRasterSync'
    ],
    'bitplane-drift': [
      'uBitDepth',
      'uBitplaneMix',
      'uPaletteBins',
      'uDitherScale'
    ]
  };
  for (const [id, uniforms] of Object.entries(mechanisms)) {
    const preset = loadValidatedPreset(getProductBuiltInPreset(id));
    assert.equal(preset.shaderPipeline.customPass.enabled, true);
    assert.deepEqual(
      preset.shaderPipeline.passOrder,
      ['builtin-feedback', 'custom-glsl']
    );
    assert.deepEqual(
      preset.shaderPipeline.uniformRegistry.map(item => item.name),
      uniforms
    );
    assert.equal(
      preset.mappings.some(mapping => mapping.targetId.startsWith('glsl:')),
      true
    );
  }
});

test('Quantized Memory carries a real visual clock and four held timing layers', () => {
  const preset = loadValidatedPreset(
    getProductBuiltInPreset('quantized-memory')
  );
  assert.equal(preset.visualClock.enabled, true);
  assert.deepEqual(preset.visualClock.divisions, [2, 4, 8, 16]);
  assert.equal(preset.nodeGraph.nodes.length, 4);
  assert.deepEqual(
    preset.nodeGraph.edges.map(edge => edge.sourceId),
    [
      'control.pulse2',
      'control.pulse4',
      'control.pulse8',
      'control.pulse16'
    ]
  );
});

test('V-1 returns isolated preset data and keeps mappings editable data', () => {
  const first = getProductBuiltInPreset('balanced');
  const second = getProductBuiltInPreset('balanced');
  first.name = 'mutated copy';
  first.mappings[0].amount = 0;
  assert.equal(second.name, 'Balanced Motion');
  assert.notEqual(second.mappings[0].amount, 0);
  assert.match(builtInSource, /sourceId: 'audio\.bass'/);
  assert.match(builtInSource, /targetId: VISUAL_TARGETS\.feedbackZoom/);
  assert.doesNotMatch(builtInSource, /requestAnimationFrame|Math\.random/);
  assert.match(demoSource, /\.\.\.PRODUCT_BUILTIN_PRESETS/);
});

test('V-1 product presets are deterministic in offline playback', () => {
  const buffer = createValidationBuffer();
  for (const { id } of listProductBuiltInPresets()) {
    const preset = getProductBuiltInPreset(id);
    const first = runOfflineDeterministicSession({
      buffer,
      preset,
      sessionSeed: 5101
    });
    const second = runOfflineDeterministicSession({
      buffer,
      preset,
      sessionSeed: 5101
    });
    assert.deepEqual(second, first, `nondeterministic preset: ${id}`);
  }
});

test('V-1 rejects unknown product preset ids', () => {
  assert.throws(
    () => getProductBuiltInPreset('../unknown'),
    /PRODUCT_PRESET_NOT_FOUND/
  );
});
