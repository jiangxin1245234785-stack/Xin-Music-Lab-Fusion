import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

import {
  CURRENT_ENGINE_VERSION,
  CURRENT_SCHEMA_VERSION,
  GLSL_IMPACT_CATEGORY_DEFAULTS,
  GLSLUniformTargetRegistry,
  glslUniformTargetId,
  inspectGlslUniformImpact,
  resolveGlslUniformMetadata
} from '../dist/index.js';

test('impact categories provide deterministic system default weights', () => {
  for (const [category, expectedWeight] of [
    ['high', 0.9],
    ['medium', 0.55],
    ['low', 0.2]
  ]) {
    const metadata = resolveGlslUniformMetadata({
      name: `u_${category}`,
      impactCategory: category
    });
    assert.equal(metadata.impactWeight, expectedWeight);
    assert.equal(
      GLSL_IMPACT_CATEGORY_DEFAULTS[category].weight,
      expectedWeight
    );
  }
});

test('declared uniform becomes a Custom(GLSL) visual target with metadata', () => {
  const registry = new GLSLUniformTargetRegistry();
  const registration = registry.register({
    name: 'u_corruptionAmount',
    type: 'float',
    range: [-0.25, 1.5],
    default: 0.1,
    label: 'Corruption Amount',
    impactCategory: 'high',
    impactWeight: 0.85
  });

  assert.equal(registration.target.id, 'glsl:u_corruptionAmount');
  assert.equal(
    registration.target.id,
    glslUniformTargetId('u_corruptionAmount')
  );
  assert.equal(registration.target.module, 'Custom(GLSL)');
  assert.equal(registration.target.uniformName, 'u_corruptionAmount');
  assert.equal(registration.target.uniformType, 'float');
  assert.equal(registration.target.min, -0.25);
  assert.equal(registration.target.max, 1.5);
  assert.equal(registration.target.defaultValue, 0.1);
  assert.equal(registration.target.impactCategory, 'high');
  assert.equal(registration.target.impactWeight, 0.85);
  assert.deepEqual(registry.targetDefinitions(), [registration.target]);
  assert.throws(
    () => registry.register({ name: 'u_corruptionAmount' }),
    /already registered/
  );
});

test('risky low impact weights remain editable but emit a warning', () => {
  const metadata = resolveGlslUniformMetadata({
    name: 'u_flashDamage',
    impactCategory: 'high',
    impactWeight: 0.25
  });
  const warnings = inspectGlslUniformImpact(metadata);

  assert.equal(warnings.length, 1);
  assert.equal(warnings[0].code, 'IMPACT_WEIGHT_BELOW_RECOMMENDED');
  assert.match(warnings[0].message, /recommended minimum 0\.80/);
});

test('uniform declarations reject invalid GLSL and numeric metadata', () => {
  assert.throws(
    () => resolveGlslUniformMetadata({ name: '3bad' }),
    /valid GLSL identifier/
  );
  assert.throws(
    () => resolveGlslUniformMetadata({ name: 'gl_reserved' }),
    /gl_ prefix/
  );
  assert.throws(
    () => resolveGlslUniformMetadata({ name: 'uTime' }),
    /reserved by the rendering engine/
  );
  assert.throws(
    () => resolveGlslUniformMetadata({
      name: 'u_range',
      range: [1, 1]
    }),
    /minimum must be less/
  );
  assert.throws(
    () => resolveGlslUniformMetadata({
      name: 'u_default',
      range: [0, 1],
      default: 2
    }),
    /inside its declared range/
  );
  assert.throws(
    () => resolveGlslUniformMetadata({
      name: 'u_integer',
      type: 'int',
      range: [0, 4.5]
    }),
    /must be integers/
  );
  assert.throws(
    () => resolveGlslUniformMetadata({
      name: 'u_boolean',
      type: 'bool',
      range: [-1, 1]
    }),
    /require range 0\.\.1/
  );
});

test('Step 5.2 UI exposes declaration and shared target surfaces only', () => {
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
    'id="uniformName"',
    'id="uniformType"',
    'id="uniformRangeMin"',
    'id="uniformRangeMax"',
    'id="uniformDefault"',
    'id="uniformLabel"',
    'id="uniformImpactWeight"',
    'id="uniformImpactCategory"',
    'id="uniformDeclareButton"',
    'id="uniformRegistryList"'
  ]) {
    assert.match(html, new RegExp(token));
  }
  assert.match(runtime, /new GLSLUniformTargetRegistry\(\)/);
  assert.match(runtime, /allVisualTargetDefinitions\(\)/);
  assert.match(runtime, /refreshTargetOptions/);
  assert.match(runtime, /refreshGraphView/);
  assert.match(runtime, /refreshVisualTableTargets/);
  assert.doesNotMatch(renderer, /uniformTargetRegistry/);
  assert.doesNotMatch(renderer, /impactWeight/);
  assert.equal(CURRENT_SCHEMA_VERSION, 16);
  assert.equal(CURRENT_ENGINE_VERSION, '6.6.1-integration-v.3');
});
