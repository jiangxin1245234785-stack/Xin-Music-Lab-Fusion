import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

import {
  RenderQualityController,
  createDefaultVisualValues,
  createSourceAwareWebglRenderPort,
  createVisualTargetState
} from '../dist/index.js';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const qualitySource = fs.readFileSync(
  path.join(root, 'src', 'render', 'render-quality-controller.ts'),
  'utf8'
);

function clock(frameIndex, nowMs, deltaMs) {
  return Object.freeze({ frameIndex, nowMs, deltaMs });
}

function evaluation(frameIndex, nowMs, deltaMs) {
  return {
    evaluationSerial: frameIndex + 1,
    clock: clock(frameIndex, nowMs, deltaMs),
    targets: createVisualTargetState({ values: createDefaultVisualValues() })
  };
}

class FakeCanvas {
  constructor() {
    this.nodeName = 'CANVAS';
    this.width = 64;
    this.height = 64;
    this.listeners = new Map();
  }

  addEventListener(type, listener) {
    const listeners = this.listeners.get(type) ?? new Set();
    listeners.add(listener);
    this.listeners.set(type, listeners);
  }

  removeEventListener(type, listener) {
    this.listeners.get(type)?.delete(listener);
  }

  dispatch(type) {
    let prevented = false;
    const event = { preventDefault: () => { prevented = true; } };
    for (const listener of this.listeners.get(type) ?? []) listener(event);
    return prevented;
  }
}

test('IV-3 Eco/High budgets are deterministic on the unified engine clock', () => {
  const run = mode => {
    const controller = new RenderQualityController(mode);
    const frames = [];
    for (let index = 0; index < 120; index++) {
      frames.push(controller.decide(clock(
        index,
        index * (1000 / 60),
        1000 / 60
      )).shouldRender);
    }
    return { frames, status: controller.status() };
  };
  const ecoA = run('eco');
  const ecoB = run('eco');
  const high = run('high');
  assert.deepEqual(ecoA, ecoB);
  assert.ok(ecoA.status.renderedFrames >= 59);
  assert.ok(ecoA.status.renderedFrames <= 61);
  assert.equal(ecoA.status.profileId, undefined);
  assert.equal(ecoA.status.id, 'eco');
  assert.equal(ecoA.status.renderScale, 0.5);
  assert.equal(high.status.renderedFrames, 120);
  assert.equal(high.status.id, 'high');
  assert.equal(high.status.renderScale, 1);
});

test('IV-3 Auto downshifts deterministically without wall-clock timing', () => {
  const run = () => {
    const controller = new RenderQualityController('auto');
    for (let index = 0; index < 24; index++) {
      controller.decide(clock(index, index * 30, 30));
    }
    return controller.status();
  };
  assert.deepEqual(run(), run());
  assert.equal(run().autoLevel, 0);
  assert.equal(run().id, 'auto-eco');
  for (const forbidden of ['performance.now', 'Date.now', 'Math.random']) {
    assert.doesNotMatch(qualitySource, new RegExp(forbidden.replace('.', '\\.')));
  }
});

test('IV-3 context loss pauses rendering and restore rebuilds one context', () => {
  const canvas = new FakeCanvas();
  let rendererInstances = 0;
  let rendererCalls = 0;
  const budgets = [];
  const port = createSourceAwareWebglRenderPort(canvas, {
    qualityMode: 'high',
    rendererFactory: () => {
      rendererInstances++;
      return {
        render(_targets, _clock, _seed, _custom, _profiler, _source, budget) {
          rendererCalls++;
          budgets.push({ ...budget });
        },
        resetFeedback() {},
        dispose() {}
      };
    }
  });
  const source = { nodeName: 'CANVAS', width: 64, height: 64 };
  const first = port.render(source, evaluation(0, 0, 0));
  assert.equal(first.rendered, true);
  assert.equal(first.context.state, 'ready');
  assert.equal(canvas.dispatch('webglcontextlost'), true);
  const lost = port.render(source, evaluation(1, 16, 16));
  assert.equal(lost.rendered, false);
  assert.equal(lost.skipReason, 'context-lost');
  assert.equal(lost.context.contextLosses, 1);
  canvas.dispatch('webglcontextrestored');
  const restored = port.render(source, evaluation(2, 32, 16));
  assert.equal(restored.rendered, true);
  assert.equal(restored.context.state, 'ready');
  assert.equal(restored.context.contextRestores, 1);
  assert.equal(restored.context.gpuContextsCreated, 2);
  assert.equal(rendererInstances, 2);
  assert.equal(rendererCalls, 2);
  assert.equal(budgets.every(budget => budget.renderScale === 1), true);
  assert.deepEqual(port.profile(), {
    renderCalls: 2,
    gpuContextsCreated: 2,
    canvasTouches: 2,
    rafRequests: 0
  });
  port.dispose();
  assert.equal(canvas.listeners.get('webglcontextlost')?.size, 0);
  assert.equal(canvas.listeners.get('webglcontextrestored')?.size, 0);
});
