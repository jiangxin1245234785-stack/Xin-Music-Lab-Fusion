import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

import {
  CURRENT_ENGINE_VERSION,
  CURRENT_SCHEMA_VERSION,
  DebugConsoleLogBuffer,
  buildDebugBundle,
  installConsoleLogCapture
} from '../dist/index.js';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const decoder = new TextDecoder();

function readUint16(bytes, offset) {
  return new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength)
    .getUint16(offset, true);
}

function readUint32(bytes, offset) {
  return new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength)
    .getUint32(offset, true);
}

function parseStoredZip(bytes) {
  const entries = new Map();
  let offset = 0;
  while (readUint32(bytes, offset) === 0x04034b50) {
    const method = readUint16(bytes, offset + 8);
    const compressedSize = readUint32(bytes, offset + 18);
    const filenameLength = readUint16(bytes, offset + 26);
    const extraLength = readUint16(bytes, offset + 28);
    assert.equal(method, 0);
    const nameStart = offset + 30;
    const dataStart = nameStart + filenameLength + extraLength;
    const name = decoder.decode(
      bytes.subarray(nameStart, nameStart + filenameLength)
    );
    entries.set(
      name,
      bytes.slice(dataStart, dataStart + compressedSize)
    );
    offset = dataStart + compressedSize;
  }
  assert.equal(readUint32(bytes, offset), 0x02014b50);
  return entries;
}

function sampleInput() {
  return {
    preset: { id: 'preset-1', mappings: [{ id: 'mapping-1' }] },
    snapshotState: { engineTimeMs: 320, snapshotStack: [] },
    audioFeatureSample: { loudness: 0.42, flux: 0.18 },
    mappingContributions: {
      contributions: [{ mappingId: 'mapping-1', value: 0.31 }]
    },
    targetFinalValues: { values: { 'color.brightness': 0.72 } },
    energyBudgetState: { decision: { attenuation: 0.8 } },
    safetyLimiterState: {
      mode: 'SAFE',
      physicalCapActive: true
    },
    shaderPassConfig: {
      config: { passOrder: ['builtin-feedback', 'custom-glsl'] }
    },
    screenshotPng: new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10]),
    consoleLogs: [{
      sequence: 1,
      engineTimeMs: 320,
      level: 'info',
      arguments: ['captured']
    }],
    engine: {
      presetSeed: 91,
      sessionSeed: 12,
      clockMode: 'offline-deterministic',
      engineTimeMs: 320
    }
  };
}

test('debug bundle contains every Phase 6.2 reproduction artifact', () => {
  const bundle = buildDebugBundle(sampleInput());
  const entries = parseStoredZip(bundle.archive);
  const required = [
    'manifest.json',
    'preset.json',
    'snapshot-state.json',
    'audio-feature-sample.json',
    'mapping-contributions.json',
    'target-final-values.json',
    'energy-budget-state.json',
    'safety-limiter-state.json',
    'shader-pass-config.json',
    'screenshot.png',
    'console-logs.json',
    'engine.json'
  ];

  assert.deepEqual([...entries.keys()], required);
  assert.deepEqual(bundle.manifest.files, required);
  assert.equal(bundle.manifest.engineVersion, CURRENT_ENGINE_VERSION);
  assert.equal(bundle.manifest.schemaVersion, CURRENT_SCHEMA_VERSION);
  assert.deepEqual(
    JSON.parse(decoder.decode(entries.get('engine.json'))),
    sampleInput().engine
  );
  assert.deepEqual(
    entries.get('screenshot.png'),
    sampleInput().screenshotPng
  );
});

test('same debug state produces byte-identical deterministic ZIP output', () => {
  const first = buildDebugBundle(sampleInput());
  const second = buildDebugBundle(sampleInput());
  assert.deepEqual(second.archive, first.archive);
});

test('console capture is bounded and timestamps only with engine time', () => {
  const forwarded = [];
  const target = Object.fromEntries(
    ['debug', 'info', 'log', 'warn', 'error'].map(level => [
      level,
      (...args) => forwarded.push([level, ...args])
    ])
  );
  let engineTimeMs = 40;
  const buffer = new DebugConsoleLogBuffer(2);
  const restore = installConsoleLogCapture(
    target,
    buffer,
    () => engineTimeMs
  );
  const circular = {};
  circular.self = circular;
  target.info('first');
  engineTimeMs = 80;
  target.warn(circular);
  engineTimeMs = 120;
  target.error(new Error('broken'));
  restore();
  target.log('not captured');

  assert.equal(forwarded.length, 4);
  assert.deepEqual(
    buffer.list().map(entry => [entry.sequence, entry.engineTimeMs, entry.level]),
    [[2, 80, 'warn'], [3, 120, 'error']]
  );
  assert.equal(buffer.list()[0].arguments[0].self, '[Circular]');
  assert.equal(buffer.list()[1].arguments[0].message, 'broken');
});

test('Advanced page keeps debug export intact beside Phase 6.4 recovery', () => {
  const html = readFileSync(path.join(root, 'demo', 'index.html'), 'utf8');
  const runtime = readFileSync(
    path.join(root, 'src', 'ui-debug', 'phase1-demo.ts'),
    'utf8'
  );
  for (const id of [
    'debugBundleExportButton',
    'debugBundleStatus',
    'debugBundleClockMode',
    'debugBundleSummary',
    'debugBundleContents'
  ]) {
    assert.match(html, new RegExp(`id="${id}"`));
  }
  assert.match(html, /data-page-button="advanced"/);
  assert.match(runtime, /buildDebugBundle\(\{/);
  assert.match(runtime, /captureCanvasPngBytes/);
  assert.match(html, /Autosave \+ Crash Recovery/i);
});
