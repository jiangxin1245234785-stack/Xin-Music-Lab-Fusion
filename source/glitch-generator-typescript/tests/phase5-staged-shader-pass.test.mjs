import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

import {
  BROKEN_SHADER_PASS_SAMPLE,
  CURRENT_ENGINE_VERSION,
  CURRENT_SCHEMA_VERSION,
  StagedShaderPass,
  VALID_SHADER_PASS_SAMPLE
} from '../dist/index.js';

function createPassHarness() {
  const disposed = [];
  let sequence = 0;
  const pass = new StagedShaderPass({
    initialResource: { id: 'built-in' },
    initialSource: 'built-in-source',
    compile: source => {
      if (source === BROKEN_SHADER_PASS_SAMPLE) {
        throw new Error('Fragment shader compile failed: expected semicolon.');
      }
      sequence += 1;
      return {
        resource: { id: `candidate-${sequence}` },
        log: 'Compile and link succeeded.'
      };
    },
    dispose: resource => disposed.push(resource.id)
  });
  return { disposed, pass };
}

test('valid GLSL candidate atomically replaces the live pass', () => {
  const { disposed, pass } = createPassHarness();
  const result = pass.stage(VALID_SHADER_PASS_SAMPLE, 'Valid sample');

  assert.equal(result.applied, true);
  assert.equal(result.status, 'applied');
  assert.equal(result.livePass.label, 'Valid sample');
  assert.equal(result.livePass.revision, 1);
  assert.equal(pass.liveResource.id, 'candidate-1');
  assert.deepEqual(disposed, ['built-in']);
});

test('broken GLSL reports compile log and preserves the last valid pass', () => {
  const { disposed, pass } = createPassHarness();
  const valid = pass.stage(VALID_SHADER_PASS_SAMPLE, 'Last valid');
  const liveResource = pass.liveResource;
  const rejected = pass.stage(BROKEN_SHADER_PASS_SAMPLE, 'Broken candidate');

  assert.equal(valid.applied, true);
  assert.equal(rejected.applied, false);
  assert.equal(rejected.status, 'rejected');
  assert.match(rejected.log, /compile failed/i);
  assert.equal(rejected.livePass.label, 'Last valid');
  assert.equal(rejected.livePass.revision, 1);
  assert.equal(pass.liveResource, liveResource);
  assert.deepEqual(disposed, ['built-in']);
});

test('Step 5.1 exposes upload, staged apply and compile log only', () => {
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

  for (const token of [
    'data-page-button="shader"',
    'id="shaderPassFile"',
    'id="shaderPassSource"',
    'id="shaderApplyButton"',
    'id="shaderPassStatus"',
    'id="shaderCompileLog"'
  ]) {
    assert.match(html, new RegExp(token));
  }
  assert.match(runtime, /stageFragmentPass\(/);
  assert.match(renderer, /new StagedShaderPass/);
  assert.match(renderer, /if \(result\.applied\) this\.resetFeedback\(\)/);
  assert.equal(CURRENT_SCHEMA_VERSION, 16);
  assert.equal(CURRENT_ENGINE_VERSION, '6.6.1-integration-v.3');
});
