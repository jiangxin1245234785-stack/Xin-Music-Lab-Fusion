import assert from 'node:assert/strict';
import test from 'node:test';

import {
  GLSLUniformTargetRegistry,
  createGeneratorRuntime,
  createSourceAwareWebglRenderPort,
  getProductBuiltInPreset
} from '../dist/index.js';

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
    const event = { preventDefault() {} };
    for (const listener of this.listeners.get(type) ?? []) listener(event);
  }
}

test('history sampler names stay reserved for the rendering engine', () => {
  const registry = new GLSLUniformTargetRegistry();
  for (const name of [
    'uSourceFrame',
    'uSourceAvailable',
    'uHistory1',
    'uHistory2',
    'uHistory4',
    'uHistory7',
    'uHistoryAvailable'
  ]) {
    assert.throws(
      () => registry.register({
        name,
        type: 'float',
        range: [0, 1],
        default: 0
      }),
      /reserved by the rendering engine/
    );
  }
});

test('source-aware render port stages preset GLSL and restores it with context', () => {
  const canvas = new FakeCanvas();
  const renderers = [];
  const port = createSourceAwareWebglRenderPort(canvas, {
    rendererFactory: () => {
      const calls = {
        staged: [],
        orders: [],
        enabled: []
      };
      renderers.push(calls);
      return {
        render() {},
        resetFeedback() {},
        stageFragmentPass(source, label) {
          calls.staged.push({ source, label });
          return {
            applied: true,
            label,
            log: '',
            liveRevision: calls.staged.length
          };
        },
        setPassOrder(order) {
          calls.orders.push([...order]);
        },
        setCustomPassEnabled(enabled) {
          calls.enabled.push(enabled);
        },
        dispose() {}
      };
    }
  });
  const preset = getProductBuiltInPreset('temporal-excavation');
  const result = port.configurePresetShaderPipeline(preset.shaderPipeline);
  assert.equal(result.enabled, true);
  assert.equal(result.customTargetCount, 4);
  assert.deepEqual(result.passOrder, ['builtin-feedback', 'custom-glsl']);
  assert.match(renderers[0].staged[0].source, /uHistory7/);
  assert.equal(renderers[0].enabled.at(-1), true);

  canvas.dispatch('webglcontextlost');
  canvas.dispatch('webglcontextrestored');
  assert.equal(renderers.length, 2);
  assert.match(renderers[1].staged[0].source, /uHistoryAvailable/);
  assert.deepEqual(
    renderers[1].orders.at(-1),
    ['builtin-feedback', 'custom-glsl']
  );
  port.dispose();
});

test('runtime applies preset shader configuration at construction and swap', () => {
  const configured = [];
  const resetReasons = [];
  const runtime = createGeneratorRuntime({
    preset: getProductBuiltInPreset('temporal-excavation'),
    renderPort: {
      render() {},
      configurePresetShaderPipeline(pipeline) {
        configured.push(pipeline.customPass.label);
      },
      reset(reason) {
        resetReasons.push(reason);
      }
    }
  });
  assert.deepEqual(configured, [
    'Temporal Excavation · 8-frame reservoir'
  ]);
  runtime.setPreset(
    getProductBuiltInPreset('raster-deflection'),
    'phase1-reconciliation'
  );
  assert.deepEqual(configured, [
    'Temporal Excavation · 8-frame reservoir',
    'Raster Deflection · luminance scan field'
  ]);
  assert.equal(resetReasons.at(-1), 'phase1-reconciliation');
  runtime.dispose();
});
