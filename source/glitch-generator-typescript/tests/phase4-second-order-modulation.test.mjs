import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

import {
  FixedStepEngineClock,
  NodeGraphRuntime,
  TARGET_MIXER_STEPS,
  TargetMixer,
  VISUAL_TARGETS,
  createMappingCard,
  createNextMappingModulation,
  deleteMappingModulation,
  mergeNodeOutputSources,
  projectGraphView,
  resolveMappingModulations,
  updateMappingModulation,
  validatePreset
} from '../dist/index.js';

test('all four Mapping parameters resolve from source or node modulation', () => {
  const resolved = resolveMappingModulations({
    id: 'four-parameter-card',
    sourceId: 'audio.bass',
    targetId: VISUAL_TARGETS.feedbackZoom,
    amount: 1,
    threshold: 0.2,
    fallMs: 200,
    probability: 0.5,
    modulations: [
      {
        id: 'amount-mod',
        sourceId: 'state.inDrop',
        targetParameter: 'amount',
        depth: 1.1
      },
      {
        id: 'threshold-mod',
        sourceId: 'node:control-lfo',
        targetParameter: 'threshold',
        depth: 0.1
      },
      {
        id: 'fall-mod',
        sourceId: 'audio.mid',
        targetParameter: 'fallMs',
        depth: 100
      },
      {
        id: 'probability-mod',
        sourceId: 'audio.treble',
        targetParameter: 'probability',
        depth: -0.4
      }
    ]
  }, {
    'state.inDrop': 1,
    'node:control-lfo': 0.5,
    'audio.mid': 0.5,
    'audio.treble': 0.5
  });

  assert.equal(resolved.mapping.amount, 2.1);
  assert.ok(Math.abs(resolved.mapping.threshold - 0.25) < 1e-12);
  assert.equal(resolved.mapping.fallMs, 250);
  assert.ok(Math.abs(resolved.mapping.probability - 0.3) < 1e-12);
  assert.deepEqual(
    resolved.traces.map(trace => trace.id),
    ['amount-mod', 'fall-mod', 'probability-mod', 'threshold-mod']
  );
});

function bassPeakImpact(inDrop) {
  const mixer = new TargetMixer();
  const clock = new FixedStepEngineClock(20);
  const mapping = {
    id: 'bass-peak-impact',
    kind: 'event',
    sourceId: 'event.bassPeak',
    targetId: VISUAL_TARGETS.blockDisplacementX,
    envelopeId: 'impact',
    amount: 0.2,
    range: [0, 1],
    threshold: 0.5,
    modulations: [{
      id: 'drop-amount',
      sourceId: 'state.inDrop',
      targetParameter: 'amount',
      depth: 0.4
    }]
  };
  const envelopes = [{
    id: 'impact',
    attackMs: 0,
    holdMs: 100,
    decayMs: 0,
    sustain: 1,
    releaseMs: 100,
    cooldownMs: 0
  }];
  mixer.mixFrame({
    mappings: [mapping],
    envelopes,
    sourceValues: {
      'event.bassPeak': 0,
      'state.inDrop': inDrop
    },
    baseState: {
      values: { [VISUAL_TARGETS.blockDisplacementX]: 0 }
    },
    clock: clock.tick(),
    randomFloat: () => 0
  });
  return mixer.mixFrame({
    mappings: [mapping],
    envelopes,
    sourceValues: {
      'event.bassPeak': 1,
      'state.inDrop': inDrop
    },
    baseState: {
      values: { [VISUAL_TARGETS.blockDisplacementX]: 0 }
    },
    clock: clock.tick(),
    randomFloat: () => 0
  }).targets.values[VISUAL_TARGETS.blockDisplacementX];
}

test('In Drop modulates BassPeak to BlockDisplacement amount', () => {
  const outsideDrop = bassPeakImpact(0);
  const insideDrop = bassPeakImpact(1);

  assert.ok(outsideDrop > 0);
  assert.ok(Math.abs(insideDrop - outsideDrop * 3) < 1e-12);
});

test('engine-clock LFO modulates the amount driving RGBSplit.Angle', () => {
  const graph = {
    nodes: [{
      id: 'rgb-angle-lfo',
      kind: 'lfo',
      lfoWaveform: 'sine',
      frequencyHz: 1,
      amplitude: 1,
      offset: 0
    }],
    edges: []
  };
  const mapping = {
    id: 'mid-angle',
    sourceId: 'audio.mid',
    targetId: VISUAL_TARGETS.rgbAngle,
    amount: 0.25,
    range: [0, 1],
    attackMs: 0,
    fallMs: 0,
    modulations: [{
      id: 'lfo-angle-amount',
      sourceId: 'node:rgb-angle-lfo',
      targetParameter: 'amount',
      depth: 1
    }]
  };
  const clock = new FixedStepEngineClock(250);
  const nodeRuntime = new NodeGraphRuntime();
  const mixer = new TargetMixer();
  const render = () => {
    const clockFrame = clock.tick();
    const primary = { 'audio.mid': 1 };
    const nodeFrame = nodeRuntime.evaluate(
      graph,
      primary,
      clockFrame,
      () => 0
    );
    return mixer.mixFrame({
      mappings: [mapping],
      sourceValues: mergeNodeOutputSources(primary, nodeFrame),
      baseState: { values: { [VISUAL_TARGETS.rgbAngle]: 0 } },
      clock: clockFrame,
      randomFloat: () => 0
    }).targets.values[VISUAL_TARGETS.rgbAngle];
  };

  const atZero = render();
  const atQuarterCycle = render();
  assert.ok(Math.abs(atZero - 0.25) < 1e-12);
  assert.ok(Math.abs(atQuarterCycle - 1.25) < 1e-12);
});

test('modulation operations keep stable data and do not mutate input', () => {
  const base = createMappingCard({
    id: 'editable-card',
    sourceId: 'audio.bass',
    targetId: VISUAL_TARGETS.feedbackZoom
  });
  const added = createNextMappingModulation(base, {
    sourceId: 'state.inDrop',
    targetParameter: 'amount',
    depth: 0.5
  });
  const modulationId = added.modulations[0].id;
  const updated = updateMappingModulation(added, modulationId, {
    targetParameter: 'probability',
    depth: -0.25
  });
  const deleted = deleteMappingModulation(updated, modulationId);

  assert.equal(base.modulations.length, 0);
  assert.equal(added.modulations.length, 1);
  assert.equal(updated.modulations[0].id, modulationId);
  assert.equal(updated.modulations[0].targetParameter, 'probability');
  assert.equal(updated.modulations[0].depth, -0.25);
  assert.equal(deleted.modulations.length, 0);
});

test('Graph View renders main links solid and modulation links dashed', () => {
  const mappings = [{
    id: 'graph-mod-card',
    sourceId: 'audio.bass',
    targetId: VISUAL_TARGETS.feedbackZoom,
    modulations: [{
      id: 'graph-modulation',
      sourceId: 'state.inDrop',
      targetParameter: 'amount',
      depth: 0.5
    }]
  }];
  const graph = projectGraphView(mappings, { nodes: [], edges: [] });
  const css = readFileSync(
    new URL('../demo/styles.css', import.meta.url),
    'utf8'
  );

  assert.deepEqual(
    graph.mappingLinks.map(link => link.kind),
    ['main', 'modulation']
  );
  assert.ok(graph.sources.includes('state.inDrop'));
  assert.match(
    css,
    /li\[data-link-kind="modulation"\][\s\S]*border-style:\s*dashed/
  );
  assert.match(
    css,
    /li\[data-link-kind="modulation"\]::before[\s\S]*border-top-style:\s*dashed/
  );
});

test('validation reports precise modulation source and target paths', () => {
  const valid = validatePreset({
    name: 'Valid modulation',
    mappings: [{
      id: 'valid-card',
      sourceId: 'audio.bass',
      targetId: VISUAL_TARGETS.feedbackZoom,
      modulations: [{
        sourceId: 'state.inDrop',
        targetParameter: 'amount',
        depth: 1
      }]
    }]
  });
  const invalid = validatePreset({
    name: 'Invalid modulation',
    mappings: [{
      id: 'invalid-card',
      sourceId: 'audio.bass',
      targetId: VISUAL_TARGETS.feedbackZoom,
      modulations: [{
        sourceId: 'node:missing',
        targetParameter: 'unknown',
        depth: 1
      }]
    }]
  });

  assert.equal(valid.valid, true);
  assert.equal(invalid.valid, false);
  assert.ok(invalid.issues.some(issue =>
    issue.path === 'mappings[0].modulations[0].sourceId'
  ));
  assert.ok(invalid.issues.some(issue =>
    issue.path === 'mappings[0].modulations[0].targetParameter'
  ));
});

test('Step 4.4 UI exposes editable modulation without changing mixer order', () => {
  const html = readFileSync(
    new URL('../demo/index.html', import.meta.url),
    'utf8'
  );
  const runtime = readFileSync(
    new URL('../src/ui-debug/phase1-demo.ts', import.meta.url),
    'utf8'
  );

  for (const token of [
    'value="modulationLab"',
    'id="mappingModulationSelect"',
    'id="mappingModulationSource"',
    'id="mappingModulationTarget"',
    'id="mappingModulationDepth"',
    'id="mappingModulationEnabled"'
  ]) {
    assert.match(html, new RegExp(token));
  }
  assert.match(runtime, /sourceId:\s*'state\.inDrop'/);
  assert.match(runtime, /sourceId:\s*'node:rgb-angle-lfo'/);
  assert.deepEqual(TARGET_MIXER_STEPS, [
    'base',
    'multiply',
    'add',
    'max-min',
    'replace',
    'gate',
    'energy-budget-clamp'
  ]);
});
