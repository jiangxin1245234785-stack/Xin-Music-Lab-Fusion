'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const api = require('../generator-output-controller.js');

const source = fs.readFileSync(
  path.join(__dirname, '..', 'generator-output-controller.js'),
  'utf8'
);

function classList() {
  const values = new Set();
  return {
    toggle(name, enabled) {
      if (enabled) values.add(name);
      else values.delete(name);
    },
    contains: name => values.has(name)
  };
}

function runtime({
  context = 'ready',
  bindings = 21,
  rendered = true,
  skipReason = null
} = {}) {
  return {
    loadState: 'ready',
    renderError: null,
    renderCalls: rendered ? 1 : 4,
    renderPort: { context: { state: context } },
    renderReport: {
      status: 'rendered',
      output: {
        rendered,
        skipReason,
        context: { state: context },
        targetBindingContract:
          'xin.generator-target-uniform-bindings/1',
        targetBindingCount: bindings,
        targetBindings: Array.from({ length: bindings }, (_, index) => ({
          targetId: `target.${index}`,
          uniformName: `uTarget${index}`,
          value: index / Math.max(1, bindings - 1)
        }))
      }
    }
  };
}

const stage = { classList: classList(), dataset: {} };
const attributes = {};
const canvas = {
  setAttribute(name, value) {
    attributes[name] = value;
  }
};
const controller = api.create({ stage, canvas, requiredBindingCount: 21 });

assert.equal(controller.get().activePipeline, 'warming');
assert.equal(stage.classList.contains('generator-renderer-on'), false);
assert.equal(controller.snapshotCanvas(), null);

const sourceStatus = { available: true, sourceKind: 'base-canvas' };
const ownership = { pass: true };
const active = controller.update(
  { frameIndex: 10, nowMs: 160 },
  runtime(),
  sourceStatus,
  ownership,
  true
);
assert.equal(active.contract, 'xin.xml-generator-output/1');
assert.equal(active.version, '4.5.0-formal-output-switch');
assert.equal(active.activePipeline, 'generator');
assert.equal(active.visible, true);
assert.equal(stage.dataset.generatorOutput, 'generator');
assert.equal(stage.classList.contains('generator-renderer-on'), true);
assert.equal(attributes['aria-hidden'], 'false');
assert.equal(controller.snapshotCanvas(), canvas);

const budgetHold = controller.update(
  { frameIndex: 11, nowMs: 170 },
  runtime({ rendered: false, skipReason: 'quality-budget' }),
  sourceStatus,
  ownership,
  true
);
assert.equal(budgetHold.activePipeline, 'generator');
assert.equal(budgetHold.holdingBudgetFrame, true);

const bypass = controller.update(
  { frameIndex: 12, nowMs: 176 },
  runtime(),
  sourceStatus,
  ownership,
  false
);
assert.equal(bypass.activePipeline, 'legacy-bypass');
assert.equal(bypass.fxBypassed, true);
assert.deepEqual(bypass.reasons, ['FX_BYPASS']);
assert.equal(stage.classList.contains('generator-renderer-on'), false);
assert.equal(controller.snapshotCanvas(), null);

controller.update(
  { frameIndex: 13, nowMs: 192 },
  runtime(),
  sourceStatus,
  ownership,
  true
);
const lost = controller.update(
  { frameIndex: 14, nowMs: 208 },
  runtime({ context: 'lost' }),
  sourceStatus,
  ownership,
  true
);
assert.equal(lost.activePipeline, 'legacy-fallback');
assert.equal(lost.fallbackActive, true);
assert.ok(lost.reasons.includes('RENDER_CONTEXT_UNAVAILABLE'));
assert.equal(stage.classList.contains('generator-renderer-on'), false);

const invalid = controller.update(
  { frameIndex: 15, nowMs: 224 },
  runtime({ bindings: 20 }),
  sourceStatus,
  ownership,
  true
);
assert.ok(invalid.reasons.includes('TARGET_BINDINGS_INVALID'));

const restored = controller.update(
  { frameIndex: 16, nowMs: 240 },
  runtime(),
  sourceStatus,
  ownership,
  true
);
assert.equal(restored.activePipeline, 'generator');
assert.equal(restored.promotions, 3);
assert.equal(restored.fallbacks, 2);
assert.equal(restored.bypasses, 1);

controller.dispose();
assert.equal(stage.classList.contains('generator-renderer-on'), false);
assert.equal(controller.get().reasons[0], 'DISPOSED');

for (const forbidden of [
  'requestAnimationFrame',
  'cancelAnimationFrame',
  'performance.now',
  'Date.now',
  'Math.random',
  'setInterval',
  'setTimeout',
  'getContext('
]) {
  assert.equal(source.includes(forbidden), false, `forbidden: ${forbidden}`);
}

console.log(JSON.stringify({
  contract: active.contract,
  activePipeline: restored.activePipeline,
  promotions: restored.promotions,
  fallbacks: restored.fallbacks,
  bypasses: restored.bypasses
}, null, 2));
