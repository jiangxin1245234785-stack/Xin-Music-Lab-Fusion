import assert from 'node:assert/strict';
import test from 'node:test';

import {
  buildUnifiedMusicFrame,
  createGeneratorRuntime,
  FORMAL_TARGET_UNIFORM_BINDINGS,
  FORMAL_TARGET_UNIFORM_CONTRACT,
  resolveFormalTargetUniformBindings,
  VISUAL_TARGET_REGISTRY
} from '../dist/index.js';

test('IV-2 exposes exactly 21 unique final-target to shader-uniform bindings', () => {
  assert.equal(FORMAL_TARGET_UNIFORM_CONTRACT, 'xin.generator-target-uniform-bindings/1');
  assert.equal(FORMAL_TARGET_UNIFORM_BINDINGS.length, 21);
  assert.equal(VISUAL_TARGET_REGISTRY.length, 21);
  assert.equal(new Set(FORMAL_TARGET_UNIFORM_BINDINGS.map(item => item.targetId)).size, 21);
  assert.equal(new Set(FORMAL_TARGET_UNIFORM_BINDINGS.map(item => item.uniformName)).size, 21);
  assert.deepEqual(
    new Set(FORMAL_TARGET_UNIFORM_BINDINGS.map(item => item.targetId)),
    new Set(VISUAL_TARGET_REGISTRY.map(item => item.id))
  );
});

test('IV-2 TargetMixer base fills all formal targets before Physical Safety', () => {
  const runtime = createGeneratorRuntime({ sessionSeed: 4202 });
  const clock = { frameIndex: 1, nowMs: 16, deltaMs: 16 };
  const frame = buildUnifiedMusicFrame({
    clock,
    transport: {
      mode: 'offline-test',
      state: 'playing',
      trackId: 'iv-2-target-bindings',
      mediaTimeMs: 16,
      durationMs: 1000,
      epoch: 0
    }
  });
  const evaluation = runtime.evaluate(frame, clock);
  const bindings = resolveFormalTargetUniformBindings(evaluation.targets);

  assert.equal(bindings.length, 21);
  assert.ok(bindings.every(binding => Number.isFinite(binding.value)));
  assert.deepEqual(evaluation.mixer.pipeline, [
    'base', 'multiply', 'add', 'max-min', 'replace', 'gate',
    'energy-budget-clamp'
  ]);
  assert.equal(evaluation.safety.physicalCapActive, true);
  runtime.dispose();
});

test('IV-2 rejects a missing final target instead of using renderer fallback', () => {
  assert.throws(
    () => resolveFormalTargetUniformBindings({
      id: 'missing-targets',
      enabled: true,
      values: {}
    }),
    /RENDER_TARGET_MISSING:feedback\.retention/
  );
});
