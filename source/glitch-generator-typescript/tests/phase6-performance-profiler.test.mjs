import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

import {
  PerformanceProfiler,
  TargetMixer,
  VISUAL_TARGETS,
  createVisualTargetState
} from '../dist/index.js';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

function syntheticNow(values) {
  let index = 0;
  return () => {
    assert.ok(index < values.length, 'synthetic profiler clock exhausted');
    return values[index++];
  };
}

test('over-budget frame identifies conditioning as the dominant stage', () => {
  const profiler = new PerformanceProfiler({
    thresholdMs: 16.7,
    windowSize: 8,
    now: syntheticNow([
      0,
      0, 2,
      2, 11,
      11, 14,
      14, 16,
      16, 18,
      20
    ])
  });
  profiler.beginFrame({ frameIndex: 4, nowMs: 80, deltaMs: 20 });
  profiler.measure('feature-extraction', () => 'features');
  profiler.measure('conditioning', () => 'conditioned');
  profiler.measure('nodes', () => 'nodes');
  profiler.measure('mixer', () => 'mixed');
  profiler.measure('render:builtin-feedback', () => 'rendered');
  const frame = profiler.endFrame();
  const snapshot = profiler.snapshot();

  assert.equal(frame.frameTimeMs, 20);
  assert.equal(frame.overBudget, true);
  assert.equal(frame.dominantStage, 'conditioning');
  assert.equal(frame.dominantStageMs, 9);
  assert.equal(snapshot.bottleneckStage, 'conditioning');
  assert.equal(snapshot.bottleneckAverageMs, 9);
  assert.equal(snapshot.overBudgetFrames, 1);
});

test('repeated measurements accumulate and disabled profiler is transparent', () => {
  const profiler = new PerformanceProfiler({
    thresholdMs: 20,
    now: syntheticNow([0, 0, 2, 2, 5, 6])
  });
  profiler.beginFrame({ frameIndex: 0, nowMs: 0, deltaMs: 0 });
  profiler.measure('mixer', () => undefined);
  profiler.measure('mixer', () => undefined);
  const frame = profiler.endFrame();
  assert.equal(
    frame.stages.find(stage => stage.stageId === 'mixer').durationMs,
    5
  );

  profiler.setEnabled(false);
  let operationCount = 0;
  profiler.beginFrame({ frameIndex: 1, nowMs: 16, deltaMs: 16 });
  const result = profiler.measure('nodes', () => ++operationCount);
  assert.equal(result, 1);
  assert.equal(profiler.endFrame(), null);
});

test('profiling hooks do not change TargetMixer output or seven-step order', () => {
  const input = {
    mappings: [{
      id: 'profiled-mapping',
      sourceId: 'audio.loudness',
      targetId: VISUAL_TARGETS.colorBrightness,
      amount: 0.8
    }],
    sourceValues: { 'audio.loudness': 0.6 },
    baseState: createVisualTargetState({
      values: { [VISUAL_TARGETS.colorBrightness]: 0.2 }
    }),
    clock: { frameIndex: 0, nowMs: 0, deltaMs: 0 },
    randomFloat: () => 0
  };
  const unprofiled = new TargetMixer().mixFrame(input);
  const measuredStages = [];
  const profiled = new TargetMixer().mixFrame({
    ...input,
    profiler: {
      measure(stageId, operation) {
        measuredStages.push(stageId);
        return operation();
      }
    }
  });

  assert.deepEqual(profiled, unprofiled);
  assert.deepEqual(measuredStages, ['mixer', 'conditioning', 'mixer']);
  assert.deepEqual(
    Object.keys(profiled.trace),
    ['base', 'multiply', 'add', 'maxMin', 'replace', 'gate', 'energyBudget', 'clamp']
  );
});

test('renderer and Advanced UI expose every requested profiler stage', () => {
  const html = readFileSync(path.join(root, 'demo', 'index.html'), 'utf8');
  const runtime = readFileSync(
    path.join(root, 'src', 'ui-debug', 'phase1-demo.ts'),
    'utf8'
  );
  const renderer = readFileSync(
    path.join(root, 'src', 'render', 'minimal-webgl-renderer.ts'),
    'utf8'
  );
  for (const id of [
    'performanceProfilerEnabled',
    'performanceProfilerThreshold',
    'performanceProfilerReset',
    'performanceProfilerStatus',
    'performanceFrameAverage',
    'performanceFramePeak',
    'performanceOverBudget',
    'performanceBottleneck',
    'performanceStageList'
  ]) {
    assert.match(html, new RegExp(`id="${id}"`));
  }
  for (const stage of [
    'feature-extraction',
    'conditioning',
    'nodes',
    'mixer',
    'render-setup',
    'render:builtin-feedback',
    'render:custom-glsl',
    'render:display'
  ]) {
    assert.match(
      `${runtime}\n${renderer}`,
      new RegExp(stage.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'))
    );
  }
  assert.match(html, /Autosave \+ Crash Recovery/i);
});
