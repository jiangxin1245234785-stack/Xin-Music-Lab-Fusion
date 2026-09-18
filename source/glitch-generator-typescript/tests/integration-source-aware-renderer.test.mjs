import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

import {
  MATERIAL_FIELD_INPUT_CONTRACT,
  buildUnifiedMusicFrame,
  createGeneratorRuntime,
  createSourceAwareWebglRenderPort,
  describeTexImageSource,
  SOURCE_AWARE_RENDER_PORT_VERSION
} from '../dist/index.js';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const source = fs.readFileSync(
  path.join(root, 'src', 'render', 'source-aware-render-port.ts'),
  'utf8'
);

test('IV-1 describes XML canvas sources without reading audio semantics', () => {
  assert.equal(SOURCE_AWARE_RENDER_PORT_VERSION, '4.3.0-resilient-quality');
  assert.deepEqual(describeTexImageSource({
    nodeName: 'CANVAS',
    width: 1920,
    height: 1080
  }), {
    available: true,
    width: 1920,
    height: 1080,
    kind: 'canvas'
  });
  assert.deepEqual(describeTexImageSource(null), {
    available: false,
    width: 0,
    height: 0,
    kind: 'unavailable'
  });
});

test('IV-1 render port delegates source plus final targets with no RAF', () => {
  assert.match(source, /implements RuntimeRenderPort/);
  assert.match(source, /evaluation\.targets/);
  assert.match(source, /evaluation\.clock/);
  assert.match(source, /source as TexImageSource/);
  assert.match(source, /RENDER_SOURCE_UNAVAILABLE/);
  assert.doesNotMatch(source, /requestAnimationFrame/);
  assert.doesNotMatch(source.toLowerCase(), /loudness|bass|mid|treble|onset/);
});

test('Phase 2 transports density and age fields through the source-aware port', () => {
  const calls = [];
  const canvas = {
    width: 64,
    height: 64,
    addEventListener() {},
    removeEventListener() {}
  };
  const port = createSourceAwareWebglRenderPort(canvas, {
    rendererFactory: () => ({
      render(...args) { calls.push(args); },
      resetFeedback() {},
      stageFragmentPass() {
        return { applied: true, label: '', log: '', liveRevision: 1 };
      },
      setPassOrder() {},
      setCustomPassEnabled() {},
      dispose() {}
    })
  });
  const runtime = createGeneratorRuntime({ renderPort: port });
  const frame = buildUnifiedMusicFrame({
    clock: { frameIndex: 1, nowMs: 16, deltaMs: 16 },
    transport: { epoch: 0 }
  });
  const evaluation = runtime.evaluate(frame, frame.clock);
  const color = { nodeName: 'CANVAS', width: 64, height: 64 };
  const density = { nodeName: 'CANVAS', width: 32, height: 32 };
  const age = { nodeName: 'CANVAS', width: 16, height: 16 };
  const rendered = runtime.render({
    source: color,
    materialFields: {
      density: { source: density },
      age: { source: age }
    }
  }, evaluation);

  assert.equal(rendered.status, 'rendered');
  assert.equal(rendered.output.materialFields.contract, MATERIAL_FIELD_INPUT_CONTRACT);
  assert.deepEqual(rendered.output.materialFields.availableIds, ['density', 'age']);
  assert.equal(calls.length, 1);
  assert.equal(calls[0][5], color);
  assert.equal(calls[0][7].density, density);
  assert.equal(calls[0][7].age, age);
  assert.equal(rendered.output.targetBindingCount, 21);
  runtime.dispose();
});

test('Phase 2 material fields are optional and preserve the raw source path', () => {
  const calls = [];
  const canvas = {
    width: 64,
    height: 64,
    addEventListener() {},
    removeEventListener() {}
  };
  const port = createSourceAwareWebglRenderPort(canvas, {
    rendererFactory: () => ({
      render(...args) { calls.push(args); },
      resetFeedback() {},
      stageFragmentPass() {
        return { applied: true, label: '', log: '', liveRevision: 1 };
      },
      setPassOrder() {},
      setCustomPassEnabled() {},
      dispose() {}
    })
  });
  const runtime = createGeneratorRuntime({ renderPort: port });
  const frame = buildUnifiedMusicFrame({
    clock: { frameIndex: 1, nowMs: 16, deltaMs: 16 },
    transport: { epoch: 0 }
  });
  const evaluation = runtime.evaluate(frame, frame.clock);
  const sourceCanvas = { nodeName: 'CANVAS', width: 64, height: 64 };
  const rendered = runtime.render(sourceCanvas, evaluation);

  assert.deepEqual(rendered.output.materialFields.availableIds, []);
  assert.equal(calls[0][5], sourceCanvas);
  assert.equal(calls[0][7].density, null);
  assert.equal(calls[0][7].age, null);
  runtime.dispose();
});
