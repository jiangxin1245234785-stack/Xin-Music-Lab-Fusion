import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

import {
  FixedStepEngineClock,
  NodeGraphRuntime,
  NodeProbeBank,
  TargetMixer,
  VISUAL_TARGETS,
  createValidationBuffer,
  mergeNodeOutputSources,
  nodeOutputSourceIds,
  projectNodeProbeWaveform,
  runOfflineDeterministicSession,
  validatePreset
} from '../dist/index.js';

const graph = {
  nodes: [{
    id: 'bass-flux-bus',
    kind: 'bus',
    label: 'Bass + Flux Bus',
    busMode: 'average'
  }],
  edges: [
    {
      id: 'bass-input',
      sourceId: 'audio.bass',
      targetNodeId: 'bass-flux-bus',
      targetPort: 'input'
    },
    {
      id: 'flux-input',
      sourceId: 'audio.flux',
      targetNodeId: 'bass-flux-bus',
      targetPort: 'input'
    }
  ]
};

const mapping = {
  id: 'bus-to-spawn',
  sourceId: 'node:bass-flux-bus',
  targetId: VISUAL_TARGETS.blockSpawnProbability,
  range: [0, 1],
  attackMs: 0,
  fallMs: 0
};

test('Node output ids are stable Mapping source ids', () => {
  assert.deepEqual(nodeOutputSourceIds(graph), ['node:bass-flux-bus']);
  const primary = Object.freeze({
    'audio.bass': 0.25,
    'audio.flux': 0.75
  });
  const clock = new FixedStepEngineClock(20);
  const frame = new NodeGraphRuntime().evaluate(
    graph,
    primary,
    clock.tick(),
    () => 0.5
  );
  const merged = mergeNodeOutputSources(primary, frame);

  assert.equal(merged['node:bass-flux-bus'], 0.5);
  assert.equal(merged['audio.bass'], 0.25);
  assert.deepEqual(primary, {
    'audio.bass': 0.25,
    'audio.flux': 0.75
  });
});

test('Bass + Flux Bus drives Block.SpawnProbability through MappingCard data', () => {
  const clock = new FixedStepEngineClock(20);
  const clockFrame = clock.tick();
  const primary = {
    'audio.bass': 0.3,
    'audio.flux': 0.7
  };
  const nodeFrame = new NodeGraphRuntime().evaluate(
    graph,
    primary,
    clockFrame,
    () => 0.5
  );
  const mixed = new TargetMixer().mixFrame({
    mappings: [mapping],
    envelopes: [],
    sourceValues: mergeNodeOutputSources(primary, nodeFrame),
    baseState: {
      values: {
        [VISUAL_TARGETS.blockSpawnProbability]: 0
      }
    },
    clock: clockFrame,
    randomFloat: () => 0.25
  });

  assert.equal(nodeFrame.outputs['node:bass-flux-bus'], 0.5);
  assert.equal(
    mixed.targets.values[VISUAL_TARGETS.blockSpawnProbability],
    0.5
  );
});

test('offline deterministic playback evaluates NodeGraph before mappings', () => {
  const preset = {
    name: 'Node source offline fixture',
    seed: 4343,
    nodeGraph: graph,
    mappings: [mapping],
    targetDefaults: {
      values: {
        [VISUAL_TARGETS.blockSpawnProbability]: 0
      }
    }
  };
  const buffer = createValidationBuffer();
  const first = runOfflineDeterministicSession({
    buffer,
    preset,
    sessionSeed: 19
  });
  const second = runOfflineDeterministicSession({
    buffer,
    preset,
    sessionSeed: 19
  });
  const firstValues = first.map(frame =>
    frame.targets.values[VISUAL_TARGETS.blockSpawnProbability]
  );
  const secondValues = second.map(frame =>
    frame.targets.values[VISUAL_TARGETS.blockSpawnProbability]
  );

  assert.deepEqual(secondValues, firstValues);
  assert.ok(Math.max(...firstValues) > Math.min(...firstValues) + 0.02);
});

test('Node probes retain bounded engine-clock values and deterministic waveform', () => {
  const clock = new FixedStepEngineClock(25);
  const probe = new NodeProbeBank(3);
  const frames = [0.1, 0.6, 0.3, 0.9].map(value => {
    const clockFrame = clock.tick();
    probe.record(clockFrame, {
      outputs: { 'node:bass-flux-bus': value },
      evaluationOrder: ['bass-flux-bus']
    });
    return clockFrame;
  });
  const snapshot = probe.snapshot('node:bass-flux-bus');
  const points = projectNodeProbeWaveform(snapshot.samples, 120, 32);

  assert.equal(snapshot.value, 0.9);
  assert.deepEqual(
    snapshot.samples.map(sample => sample.engineTimeMs),
    frames.slice(-3).map(frame => frame.nowMs)
  );
  assert.deepEqual(
    snapshot.samples.map(sample => sample.value),
    [0.6, 0.3, 0.9]
  );
  assert.equal(
    projectNodeProbeWaveform(snapshot.samples, 120, 32),
    points
  );
  assert.match(points, /^0\.00,/);
  assert.match(points, /120\.00,/);
});

test('preset validation accepts declared node sources and rejects missing nodes', () => {
  const accepted = validatePreset({
    name: 'Accepted node source',
    nodeGraph: graph,
    mappings: [mapping]
  });
  const rejected = validatePreset({
    name: 'Missing node source',
    mappings: [{ ...mapping, sourceId: 'node:missing' }]
  });

  assert.equal(accepted.valid, true);
  assert.equal(rejected.valid, false);
  assert.ok(rejected.issues.some(issue =>
    issue.code === 'UNKNOWN_SOURCE' &&
    issue.path === 'mappings[0].sourceId'
  ));
});

test('Step 4.3 UI exposes node source preset, selector and live probes', () => {
  const html = readFileSync(
    new URL('../demo/index.html', import.meta.url),
    'utf8'
  );
  const runtime = readFileSync(
    new URL('../src/ui-debug/phase1-demo.ts', import.meta.url),
    'utf8'
  );

  for (const token of [
    'value="nodeSourceLab"',
    'id="nodeProbeStatus"',
    'id="nodeProbeGrid"',
    'PHASE 4.3 · LIVE NODE PROBES'
  ]) {
    assert.match(html, new RegExp(token));
  }
  assert.match(runtime, /sourceId:\s*'node:bass-flux-bus'/);
  assert.match(runtime, /mergeNodeOutputSources\(primarySources,\s*nodeFrame\)/);
  assert.match(runtime, /nodeProbeBank\.record\(clockFrame,\s*nodeFrame\)/);
  assert.doesNotMatch(runtime, /\bsecondOrderModulation\b/);
});
