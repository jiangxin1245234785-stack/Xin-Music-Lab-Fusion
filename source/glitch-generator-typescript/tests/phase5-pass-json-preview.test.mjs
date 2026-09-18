import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

import {
  CURRENT_ENGINE_VERSION,
  CURRENT_SCHEMA_VERSION,
  SnapshotStack,
  UndoHistory,
  VALID_SHADER_PASS_SAMPLE,
  createPreset,
  deserializePreset,
  moveShaderPass,
  serializePreset,
  stagePresetJson
} from '../dist/index.js';

function shaderPreset(name = 'Live') {
  return createPreset({
    name,
    shaderPipeline: {
      passOrder: ['builtin-feedback', 'custom-glsl'],
      customPass: {
        enabled: true,
        label: 'Corruption pass',
        source: VALID_SHADER_PASS_SAMPLE
      },
      uniformRegistry: [{
        name: 'u_corruptionAmount',
        type: 'float',
        range: [0, 1],
        default: 0,
        label: 'Corruption Amount',
        impactWeight: 0.9,
        impactCategory: 'high'
      }]
    },
    mappings: [{
      id: 'flux-corruption',
      sourceId: 'audio.flux',
      targetId: 'glsl:u_corruptionAmount'
    }]
  });
}

test('pass order changes deterministically without losing a pass', () => {
  const original = ['builtin-feedback', 'custom-glsl'];
  const swapped = moveShaderPass(original, 'custom-glsl', -1);

  assert.deepEqual(swapped, ['custom-glsl', 'builtin-feedback']);
  assert.deepEqual(original, ['builtin-feedback', 'custom-glsl']);
  assert.deepEqual(
    moveShaderPass(swapped, 'custom-glsl', -1),
    swapped
  );
});

test('invalid JSON and invalid pass config never expose an apply candidate', () => {
  const live = shaderPreset();
  const invalidJson = stagePresetJson('{ "name": ');
  const invalidConfig = stagePresetJson(JSON.stringify({
    ...live,
    shaderPipeline: {
      ...live.shaderPipeline,
      passOrder: ['custom-glsl', 'custom-glsl']
    }
  }));

  assert.equal(invalidJson.valid, false);
  assert.equal(invalidJson.preset, undefined);
  assert.equal(invalidConfig.valid, false);
  assert.equal(invalidConfig.preset, undefined);
  assert.deepEqual(live, shaderPreset());
});

test('valid Raw JSON edit is snapshot-backed and one undo transaction', () => {
  const live = shaderPreset('Before');
  const candidate = stagePresetJson(JSON.stringify({
    ...live,
    name: 'After',
    shaderPipeline: {
      ...live.shaderPipeline,
      passOrder: ['custom-glsl', 'builtin-feedback']
    }
  }));
  assert.equal(candidate.valid, true);
  assert.ok(candidate.preset);

  const snapshots = new SnapshotStack();
  snapshots.capture({
    name: 'Before Raw JSON',
    engineTimeMs: 640,
    note: 'Automatic snapshot before Raw JSON apply',
    preset: live,
    targetState: live.targetDefaults
  });
  const history = new UndoHistory({
    clone: value => createPreset(value)
  });
  history.recordDiscrete(
    'Apply staged Raw JSON',
    live,
    candidate.preset,
    640
  );

  assert.equal(snapshots.size, 1);
  assert.equal(history.canUndo, true);
  assert.equal(history.undo().state.name, 'Before');
});

test('preset serialization preserves pass config and uniform registry', () => {
  const restored = deserializePreset(serializePreset(shaderPreset()));

  assert.deepEqual(
    restored.shaderPipeline.passOrder,
    ['builtin-feedback', 'custom-glsl']
  );
  assert.equal(
    restored.shaderPipeline.customPass.source,
    VALID_SHADER_PASS_SAMPLE
  );
  assert.equal(
    restored.shaderPipeline.uniformRegistry[0].name,
    'u_corruptionAmount'
  );
  assert.equal(
    restored.mappings[0].targetId,
    'glsl:u_corruptionAmount'
  );
  assert.equal(CURRENT_SCHEMA_VERSION, 16);
  assert.equal(CURRENT_ENGINE_VERSION, '6.6.1-integration-v.3');
});

test('Step 5.4 UI exposes only the requested expert controls', () => {
  const html = readFileSync(
    new URL('../demo/index.html', import.meta.url),
    'utf8'
  );
  const runtime = readFileSync(
    new URL('../src/ui-debug/phase1-demo.ts', import.meta.url),
    'utf8'
  );
  const renderer = readFileSync(
    new URL('../src/render/minimal-webgl-renderer.ts', import.meta.url),
    'utf8'
  );

  for (const id of [
    'passOrderEditor',
    'framebufferPreview',
    'rawJsonEditor',
    'rawJsonValidateButton',
    'rawJsonApplyButton'
  ]) {
    assert.match(html, new RegExp(`id="${id}"`));
  }
  assert.match(runtime, /stagePresetJson\(rawJsonEditor\.value\)/);
  assert.match(runtime, /Automatic snapshot before Raw JSON apply/);
  assert.match(runtime, /runDiscrete\('Apply staged Raw JSON'/);
  assert.match(renderer, /for \(const passId of this\.passOrder\)/);
  assert.match(renderer, /getFramebufferPreviewState/);
  assert.match(
    renderer,
    /this\.canvas\.clientWidth <= 0 \|\| this\.canvas\.clientHeight <= 0/
  );
});
