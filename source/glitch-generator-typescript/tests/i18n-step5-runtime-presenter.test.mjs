import assert from 'node:assert/strict';
import test from 'node:test';

import {
  FixedStepEngineClock,
  TargetMixer,
  VISUAL_TARGETS,
  createSeededPrng
} from '../dist/index.js';
import { createLocaleController } from '../dist/ui/i18n/index.js';
import {
  createMappingRuntimeViewModel
} from '../dist/ui/presenters/index.js';

const translator = (locale = 'zh-CN') =>
  createLocaleController({ hostLocale: locale });

function continuous(overrides = {}) {
  return {
    id: 'runtime-card',
    kind: 'continuous',
    sourceId: 'audio.bass',
    targetId: VISUAL_TARGETS.feedbackZoom,
    amount: 1,
    range: [1.2, 1.2],
    curve: 1,
    threshold: 0,
    attackMs: 0,
    fallMs: 0,
    priority: 10,
    polarity: 'normal',
    replaceMode: 'replace',
    probability: 1,
    safetyClamp: false,
    enabled: true,
    ...overrides
  };
}

function mixFrame({
  mixer = new TargetMixer(),
  mapping = continuous(),
  envelopes = [],
  sourceValues = { 'audio.bass': 1 },
  baseValue = 1,
  clock = new FixedStepEngineClock(10),
  randomFloat
} = {}) {
  const clockFrame = clock.tick();
  const mixerFrame = mixer.mixFrame({
    mappings: [mapping],
    envelopes,
    sourceValues,
    baseState: { values: { [mapping.targetId]: baseValue } },
    clock: clockFrame,
    ...(randomFloat ? { randomFloat } : {})
  });
  return { clockFrame, mixerFrame, sourceValues };
}

function present({
  mapping,
  clockFrame,
  mixerFrame,
  sourceValues,
  finalState = mixerFrame.targets,
  sourceMeta = null,
  locale = 'zh-CN'
}) {
  return createMappingRuntimeViewModel({
    mapping,
    mixerFrame,
    finalState,
    sourceValues,
    sourceMeta,
    frameIndex: clockFrame.frameIndex,
    engineTimeMs: clockFrame.nowMs,
    translator: translator(locale)
  });
}

test('Step 5 runtime presenter reads contributing and below-threshold values from a real mixer trace', () => {
  const mapping = continuous();
  const active = mixFrame({ mapping });
  const activeVm = present({ mapping, ...active });

  assert.equal(activeVm.mappingStatus.id, 'CONTRIBUTING');
  assert.equal(activeVm.targetStatus.id, 'SELECTED_MAPPING');
  assert.equal(activeVm.breakdown.sourceValue, 1);
  assert.equal(
    activeVm.breakdown.contributionValue,
    active.mixerFrame.contributions[0].value
  );
  assert.equal(
    activeVm.breakdown.finalTargetValue,
    active.mixerFrame.targets.values[mapping.targetId]
  );
  assert.equal(activeVm.frameIndex, active.clockFrame.frameIndex);
  assert.equal(activeVm.engineTimeMs, active.clockFrame.nowMs);
  assert.deepEqual(
    activeVm.pipeline.slice(0, 8).map(stage => stage.value),
    [
      active.mixerFrame.trace.base,
      active.mixerFrame.trace.multiply,
      active.mixerFrame.trace.add,
      active.mixerFrame.trace.maxMin,
      active.mixerFrame.trace.replace,
      active.mixerFrame.trace.gate,
      active.mixerFrame.trace.energyBudget,
      active.mixerFrame.trace.clamp
    ].map(state => state.values[mapping.targetId])
  );
  assert.deepEqual(
    activeVm.pipeline.map(stage => stage.id),
    [
      'base',
      'multiply',
      'add',
      'max-min',
      'replace',
      'gate',
      'energy-budget',
      'absolute-clamp',
      'physical-safety-final'
    ]
  );

  const quietMapping = continuous({ threshold: 0.6, range: [1, 1.2] });
  const quiet = mixFrame({
    mapping: quietMapping,
    sourceValues: { 'audio.bass': 0.2 }
  });
  const quietVm = present({ mapping: quietMapping, ...quiet });
  assert.equal(quietVm.mappingStatus.id, 'BELOW_THRESHOLD');
  assert.equal(quietVm.targetStatus.id, 'TARGET_AT_BASE');
});

test('Step 5 runtime presenter uses the real GateDecision, including equality-open behavior', () => {
  const mapping = continuous({
    id: 'runtime-gate',
    replaceMode: 'add',
    range: [0.2, 0.2],
    gateSourceId: 'state.inBuild',
    gateThreshold: 0.8
  });
  const closed = mixFrame({
    mapping,
    sourceValues: { 'audio.bass': 1, 'state.inBuild': 0.2 }
  });
  const closedVm = present({ mapping, ...closed });
  assert.equal(closed.mixerFrame.gateDecisions[0].open, false);
  assert.equal(closedVm.mappingStatus.id, 'GATE_CLOSED');
  assert.equal(closedVm.gateDecision, closed.mixerFrame.gateDecisions[0]);
  assert.match(closedVm.summary, /20%/);
  assert.match(closedVm.summary, /80%/);

  const open = mixFrame({
    mapping,
    sourceValues: { 'audio.bass': 1, 'state.inBuild': 0.8 }
  });
  const openVm = present({ mapping, ...open });
  assert.equal(open.mixerFrame.gateDecisions[0].open, true);
  assert.equal(openVm.mappingStatus.id, 'CONTRIBUTING');
});

test('Step 5 runtime presenter reports deterministic Probability block and pass from seeded samples', () => {
  const seed = 5305;
  const stream = 17;
  const expectedSample = createSeededPrng(seed, stream).nextFloat();
  const blockedProbability = Math.max(0, expectedSample / 2);
  const passedProbability = Math.min(1, (expectedSample + 1) / 2);

  const blockedMapping = continuous({
    id: 'runtime-probability-block',
    probability: blockedProbability
  });
  const blockedRandom = createSeededPrng(seed, stream);
  const blocked = mixFrame({
    mapping: blockedMapping,
    randomFloat: () => blockedRandom.nextFloat()
  });
  const blockedVm = present({ mapping: blockedMapping, ...blocked });
  assert.equal(
    blocked.mixerFrame.contributions[0].probabilitySample,
    expectedSample
  );
  assert.equal(blockedVm.mappingStatus.id, 'PROBABILITY_BLOCKED');
  assert.doesNotMatch(blockedVm.probabilityText, /PASS|BLOCK|ARMED/);
  assert.match(blockedVm.probabilityText, /最近一次采样未通过$/);

  const passedMapping = continuous({
    id: 'runtime-probability-pass',
    probability: passedProbability
  });
  const passedRandom = createSeededPrng(seed, stream);
  const passed = mixFrame({
    mapping: passedMapping,
    randomFloat: () => passedRandom.nextFloat()
  });
  const passedVm = present({ mapping: passedMapping, ...passed });
  assert.equal(
    passed.mixerFrame.contributions[0].probabilitySample,
    expectedSample
  );
  assert.equal(passedVm.mappingStatus.id, 'CONTRIBUTING');
  assert.doesNotMatch(passedVm.probabilityText, /PASS|BLOCK|ARMED/);
  assert.match(passedVm.probabilityText, /最近一次采样通过$/);
});

test('Step 5 Probability summary preserves a nonzero decay tail after a blocked rising edge', () => {
  const mapping = continuous({
    id: 'runtime-probability-decay',
    targetId: VISUAL_TARGETS.rgbAngle,
    replaceMode: 'add',
    range: [0, 1],
    fallMs: 100,
    probability: 0.5
  });
  const mixer = new TargetMixer();
  const clock = new FixedStepEngineClock(10);
  const random = createSeededPrng(8, 17);
  const run = value => mixFrame({
    mixer,
    mapping,
    sourceValues: { 'audio.bass': value },
    baseValue: 0,
    clock,
    randomFloat: () => random.nextFloat()
  });

  const firstPass = run(1);
  assert.ok(firstPass.mixerFrame.contributions[0].value > 0);
  run(0);
  const blockedWithTail = run(1);
  const viewModel = present({ mapping, ...blockedWithTail });

  assert.equal(viewModel.mappingStatus.id, 'PROBABILITY_BLOCKED');
  assert.ok(viewModel.contribution.value > 0);
  assert.match(viewModel.summary, /仍记录贡献/);
  assert.doesNotMatch(viewModel.summary, /未记录输出/);
  assert.doesNotMatch(viewModel.probabilityText, /PASS|BLOCK|ARMED/);
});

test('Step 5 runtime presenter distinguishes event waiting and active Envelope output on one Engine Clock', () => {
  const mapping = continuous({
    id: 'runtime-event',
    kind: 'event',
    sourceId: 'event.onset',
    targetId: VISUAL_TARGETS.colorFlashStrength,
    envelopeId: 'impact',
    range: [0, 0.5],
    replaceMode: 'add'
  });
  const envelope = {
    id: 'impact',
    attackMs: 0,
    holdMs: 20,
    decayMs: 0,
    sustain: 1,
    releaseMs: 20,
    cooldownMs: 0,
    retriggerMode: 'restart'
  };
  const mixer = new TargetMixer();
  const clock = new FixedStepEngineClock(10);
  const waiting = mixFrame({
    mixer,
    mapping,
    envelopes: [envelope],
    sourceValues: { 'event.onset': 0 },
    baseValue: 0,
    clock
  });
  const waitingVm = present({ mapping, ...waiting });
  assert.equal(waitingVm.mappingStatus.id, 'WAITING_EVENT');
  assert.equal(waitingVm.contribution, null);
  assert.doesNotMatch(waitingVm.probabilityText, /PASS|BLOCK|ARMED/);

  const active = mixFrame({
    mixer,
    mapping,
    envelopes: [envelope],
    sourceValues: { 'event.onset': 1 },
    baseValue: 0,
    clock
  });
  const activeVm = present({ mapping, ...active });
  assert.equal(activeVm.mappingStatus.id, 'CONTRIBUTING');
  assert.equal(activeVm.contribution.eventVoiceCount, 1);
  assert.equal(activeVm.frameIndex, waitingVm.frameIndex + 1);
  assert.ok(activeVm.engineTimeMs > waitingVm.engineTimeMs);
});

test('Step 5 runtime presenter mirrors all five TargetMixer mode stages', () => {
  const cases = [
    ['multiply', 1.2, 1.2, 'multiply'],
    ['add', 0.2, 1.2, 'add'],
    ['max', 1.2, 1.2, 'max-min'],
    ['min', 0.8, 0.8, 'max-min'],
    ['replace', 1.2, 1.2, 'replace']
  ];
  for (const [mode, contribution, expected, changedStage] of cases) {
    const mapping = continuous({
      id: `runtime-${mode}`,
      replaceMode: mode,
      range: [contribution, contribution]
    });
    const mixed = mixFrame({ mapping, baseValue: 1 });
    const viewModel = present({ mapping, ...mixed });
    assert.equal(viewModel.operation.id, mode);
    assert.equal(mixed.mixerFrame.targets.values[mapping.targetId], expected);
    assert.equal(viewModel.breakdown.finalTargetValue, expected);
    assert.equal(
      viewModel.pipeline.find(stage => stage.id === changedStage)
        .changedFromPrevious,
      true
    );
  }
});

test('Step 5 runtime presenter remains conservative for a losing Replace and later processing', () => {
  const selected = continuous({
    id: 'replace-selected',
    range: [1.2, 1.2],
    priority: 1
  });
  const winner = continuous({
    id: 'replace-winner',
    range: [1.4, 1.4],
    priority: 2
  });
  const clockFrame = new FixedStepEngineClock(10).tick();
  const sourceValues = { 'audio.bass': 1 };
  const mixerFrame = new TargetMixer().mixFrame({
    mappings: [selected, winner],
    sourceValues,
    baseState: { values: { [selected.targetId]: 1 } },
    clock: clockFrame
  });
  const losingVm = present({
    mapping: selected,
    clockFrame,
    mixerFrame,
    sourceValues
  });
  assert.equal(losingVm.mappingStatus.id, 'CONTRIBUTING');
  assert.equal(losingVm.targetStatus.id, 'OTHER_MAPPING_OR_POST_PROCESS');
  assert.match(losingVm.summary, /另一条 Mapping 或后续阶段/);

  const postProcessedVm = present({
    mapping: winner,
    clockFrame,
    mixerFrame,
    sourceValues,
    finalState: { values: { [winner.targetId]: 1.1 } }
  });
  assert.equal(
    postProcessedVm.targetStatus.id,
    'OTHER_MAPPING_OR_POST_PROCESS'
  );
  assert.match(postProcessedVm.summary, /另一条 Mapping 或后续阶段/);
  assert.match(
    postProcessedVm.targetStatus.description,
    /另一条映射|后续处理/
  );
});

test('Step 5 CONTRIBUTING at an unchanged Target uses a conservative TARGET_AT_BASE summary', () => {
  const mapping = continuous({
    id: 'runtime-max-below-base',
    replaceMode: 'max',
    range: [0.8, 0.8]
  });
  const mixed = mixFrame({ mapping, baseValue: 1 });
  const viewModel = present({ mapping, ...mixed });

  assert.equal(viewModel.mappingStatus.id, 'CONTRIBUTING');
  assert.equal(viewModel.targetStatus.id, 'TARGET_AT_BASE');
  assert.equal(viewModel.contribution.value, 0.8);
  assert.equal(viewModel.breakdown.finalTargetValue, 1);
  assert.match(viewModel.summary, /另一条 Mapping 或后续阶段/);
});

test('Step 5 runtime presenter shows only supplied Provider evidence and preserves all inputs', () => {
  const mapping = continuous({ id: 'runtime-provider' });
  const mixed = mixFrame({ mapping });
  const sourceMeta = {
    sourceId: mapping.sourceId,
    sourceProvider: 'realtime.core',
    confidence: 0.87,
    ageMs: 12,
    available: true,
    providerDetail: {
      engineId: 'offline-deterministic-fixture',
      providerVersion: '1'
    },
    fallbackReason: null
  };
  const before = structuredClone({
    mapping,
    mixerFrame: mixed.mixerFrame,
    sourceValues: mixed.sourceValues,
    sourceMeta
  });
  const withProvider = present({ mapping, ...mixed, sourceMeta });
  assert.equal(withProvider.sourceMeta, sourceMeta);
  assert.match(withProvider.providerText, /realtime\.core/);
  assert.match(withProvider.providerText, /0\.87/);
  assert.match(withProvider.providerText, /12 ms/);

  const withoutProvider = present({ mapping, ...mixed, sourceMeta: null });
  assert.equal(withoutProvider.sourceMeta, null);
  assert.match(withoutProvider.providerText, /没有可用的声音来源诊断/);
  assert.deepEqual({
    mapping,
    mixerFrame: mixed.mixerFrame,
    sourceValues: mixed.sourceValues,
    sourceMeta
  }, before);
});

test('Step 5 Provider diagnostics reject unavailable and mismatched evidence without inventing provenance', () => {
  const mapping = continuous({ id: 'runtime-provider-boundary' });
  const mixed = mixFrame({ mapping });
  const unavailable = {
    sourceId: mapping.sourceId,
    sourceProvider: 'neutral',
    confidence: null,
    ageMs: 500,
    available: false,
    fallbackReason: 'REALTIME_STALE'
  };
  const unavailableBefore = structuredClone(unavailable);
  const unavailableVm = present({ mapping, ...mixed, sourceMeta: unavailable });
  assert.equal(unavailableVm.sourceMeta, unavailable);
  assert.match(unavailableVm.providerText, /当前不可用/);
  assert.match(unavailableVm.providerText, /REALTIME_STALE/);
  assert.doesNotMatch(unavailableVm.providerText, /声音来源为 neutral/);

  const mismatched = {
    ...unavailable,
    sourceId: 'audio.mid',
    sourceProvider: 'xld.songformer',
    available: true,
    confidence: 0.99,
    fallbackReason: null
  };
  const mismatchedBefore = structuredClone(mismatched);
  const mismatchedVm = present({ mapping, ...mixed, sourceMeta: mismatched });
  assert.equal(mismatchedVm.sourceMeta, mismatched);
  assert.match(mismatchedVm.providerText, /属于另一项 Source/);
  assert.doesNotMatch(mismatchedVm.providerText, /xld\.songformer|0\.99/);
  assert.deepEqual(unavailable, unavailableBefore);
  assert.deepEqual(mismatched, mismatchedBefore);
});

test('Step 5 pipeline keeps EnergyBudget, absolute Clamp and optional Physical Safety distinct', () => {
  const mapping = continuous({
    id: 'runtime-budget-clamp',
    targetId: VISUAL_TARGETS.colorFlashStrength,
    range: [0, 2],
    safetyClamp: false
  });
  const clockFrame = new FixedStepEngineClock(10).tick();
  const sourceValues = { 'audio.bass': 1 };
  const mixerFrame = new TargetMixer().mixFrame({
    mappings: [mapping],
    sourceValues,
    baseState: { values: { [mapping.targetId]: 0 } },
    clock: clockFrame,
    energyBudget: {
      enabled: true,
      budget: 2,
      weights: { [mapping.targetId]: 1 }
    }
  });
  assert.equal(mixerFrame.trace.replace.values[mapping.targetId], 2);
  assert.equal(mixerFrame.trace.energyBudget.values[mapping.targetId], 0.7);
  assert.equal(mixerFrame.trace.clamp.values[mapping.targetId], 0.35);

  const withFinal = present({
    mapping,
    clockFrame,
    mixerFrame,
    sourceValues,
    finalState: { values: { [mapping.targetId]: 0.2 } }
  });
  assert.deepEqual(
    withFinal.pipeline.slice(-3).map(stage => [stage.id, stage.value]),
    [
      ['energy-budget', 0.7],
      ['absolute-clamp', 0.35],
      ['physical-safety-final', 0.2]
    ]
  );

  const withoutFinal = createMappingRuntimeViewModel({
    mapping,
    mixerFrame,
    sourceValues,
    frameIndex: clockFrame.frameIndex,
    engineTimeMs: clockFrame.nowMs,
    translator: translator('zh-CN'),
    locale: 'zh-CN'
  });
  assert.deepEqual(
    withoutFinal.pipeline.slice(-2).map(stage => [stage.id, stage.value]),
    [
      ['energy-budget', 0.7],
      ['absolute-clamp', 0.35]
    ]
  );
  assert.equal(
    withoutFinal.pipeline.some(stage => stage.id === 'physical-safety-final'),
    false
  );
});

test('Step 5 runtime locale changes labels only, not trace evidence or raw values', () => {
  const mapping = continuous({ id: 'runtime-locale', replaceMode: 'add', range: [0.2, 0.2] });
  const mixed = mixFrame({ mapping });
  const zh = present({ mapping, ...mixed, locale: 'zh-CN' });
  const en = present({ mapping, ...mixed, locale: 'en-US' });

  assert.notEqual(zh.summary, en.summary);
  assert.equal(zh.mappingId, en.mappingId);
  assert.equal(zh.sourceId, en.sourceId);
  assert.equal(zh.targetId, en.targetId);
  assert.equal(zh.operation.id, en.operation.id);
  assert.equal(zh.mappingStatus.id, en.mappingStatus.id);
  assert.equal(zh.targetStatus.id, en.targetStatus.id);
  assert.deepEqual(zh.breakdown, en.breakdown);
  assert.deepEqual(zh.contribution, en.contribution);
  assert.deepEqual(zh.gateDecision, en.gateDecision);
  assert.deepEqual(
    zh.pipeline.map(stage => ({
      id: stage.id,
      value: stage.value,
      changedFromPrevious: stage.changedFromPrevious
    })),
    en.pipeline.map(stage => ({
      id: stage.id,
      value: stage.value,
      changedFromPrevious: stage.changedFromPrevious
    }))
  );
  assert.equal(zh.frameIndex, en.frameIndex);
  assert.equal(zh.engineTimeMs, en.engineTimeMs);
});
