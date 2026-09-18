'use strict';

const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');
const resolverApi = require('../music-feature-resolver.js');
const shadowApi = require('../resolver-legacy-shadow.js');

const root = path.resolve(__dirname, '..');
const read = file => fs.readFileSync(path.join(root, file), 'utf8');
const sha256 = value => crypto
  .createHash('sha256')
  .update(value)
  .digest('hex');

function providerMeta(sourceProvider, options = {}) {
  const available = options.available !== false;
  return {
    sourceProvider,
    providerDetail: {
      engineId: options.engineId || `${sourceProvider}-fixture`,
      providerVersion: 'fixture-v1'
    },
    confidence: available ? options.confidence ?? 0.88 : null,
    available,
    ageMs: options.ageMs || 0,
    fallbackReason: available
      ? null
      : options.fallbackReason || 'PROVIDER_UNAVAILABLE'
  };
}

function realtimeFrame(options = {}) {
  const meta = providerMeta('realtime.core', {
    available: options.available,
    ageMs: options.ageMs,
    fallbackReason: options.fallbackReason || 'REALTIME_STALE'
  });
  return {
    contract: 'xin.music-frame/1',
    contractVersion: 1,
    continuous: {
      loudness: options.loudness ?? 0.72,
      bass: 0.62,
      mid: 0.55,
      treble: 0.48,
      flux: 0.38
    },
    states: { silence: 0 },
    events: { onset: null, bassPeak: null },
    meta: Object.fromEntries(
      [
        'loudness',
        'bass',
        'mid',
        'treble',
        'flux',
        'silence',
        'onset',
        'bassPeak'
      ].map(featureId => [featureId, { ...meta }])
    )
  };
}

function xldFrame() {
  const structure = providerMeta('xld.songformer', {
    engineId: 'songformer',
    confidence: 0.91
  });
  const harmony = providerMeta('xld.harmony', {
    engineId: 'chord-btc',
    confidence: 0.84
  });
  return {
    contract: 'xin.music-frame/1',
    contractVersion: 1,
    continuous: { chordConfidence: 0.84 },
    states: {
      silence: 0,
      inBuild: 0,
      inDrop: 0,
      inClimax: 1
    },
    events: {},
    labels: {
      sectionId: 'songformer:chorus:2',
      sectionLabel: 'chorus',
      chord: 'C#m7'
    },
    meta: {
      chordConfidence: harmony,
      silence: structure,
      inBuild: structure,
      inDrop: structure,
      inClimax: structure,
      sectionId: structure,
      sectionLabel: structure,
      chord: harmony
    }
  };
}

function heuristicFrame() {
  const meta = providerMeta('realtime.heuristic', {
    engineId: 'xml-section-heuristic',
    confidence: 0.42
  });
  const continuous = {
    dynamicRange: 0.52,
    spectralDensity: 0.64,
    flatness: 0.31,
    sharpness: 0.45,
    buildEnergy: 0.58,
    sectionDrive: 0.67,
    rhythmPhase: 0.25,
    chordConfidence: 0.38
  };
  const states = {
    inBuild: 1,
    inDrop: 0,
    inClimax: 0
  };
  const labels = {
    sectionId: 'realtime:LAYERING',
    sectionLabel: 'LAYERING',
    chord: 'Am'
  };
  return {
    contract: 'xin.music-frame/1',
    contractVersion: 1,
    continuous,
    states,
    events: {},
    labels,
    meta: Object.fromEntries(
      [...Object.keys(continuous), ...Object.keys(states), ...Object.keys(labels)]
        .map(featureId => [featureId, { ...meta }])
    )
  };
}

function transport(options = {}) {
  const external = options.mode === 'external';
  return {
    mode: external ? 'external' : 'internal',
    state: options.state || 'playing',
    trackId: external ? null : 'fixture-track',
    mediaTimeMs: external ? null : options.mediaTimeMs ?? 10000,
    durationMs: external ? null : 180000
  };
}

function resolve(resolver, options = {}) {
  return resolver.resolve({
    clock: {
      frameIndex: options.frameIndex || 0,
      nowMs: options.nowMs || 0,
      deltaMs: options.deltaMs ?? 20
    },
    transport: transport(options.transport),
    transition: options.transition || null,
    realtimeFrame: options.realtimeFrame || null,
    xldFrame: options.xldFrame || null,
    xldCursor: options.xldFrame
      ? {
          section: { token: 'songformer:2' },
          harmony: { token: 'chord-btc:8' }
        }
      : null,
    heuristicFrame: options.heuristicFrame || null
  });
}

function legacySnapshot() {
  const continuous = Object.fromEntries(
    shadowApi.constants.LEGACY_CONTINUOUS_KEYS
      .map((featureId, index) => [featureId, (index + 1) / 20])
  );
  const events = Object.fromEntries(
    shadowApi.constants.LEGACY_EVENT_KEYS
      .map((featureId, index) => [featureId, (index + 1) / 10])
  );
  return {
    now: 1000,
    frame: 60,
    seed: 0.317,
    continuous,
    events
  };
}

function observeScenario({
  frame,
  context,
  nowMs = 1000
}) {
  const shadow = shadowApi.create({ intervalMs: 125 });
  const legacy = legacySnapshot();
  const unifiedBefore = JSON.stringify(frame);
  const legacyBefore = JSON.stringify(legacy);
  const report = shadow.update(nowMs, frame, legacy, context);
  assert.equal(JSON.stringify(frame), unifiedBefore, 'UnifiedMusicFrame was mutated');
  assert.equal(JSON.stringify(legacy), legacyBefore, 'Legacy snapshot was mutated');
  assert.equal(report.formalPipeline, 'legacy');
  assert.equal(report.comparatorMode, 'read-only');
  assert.equal(report.legacy.frozenShape, true);
  assert.equal(report.scenarioGate.observed, true);
  assert.equal(report.scenarioGate.pass, true);
  assert.equal(report.isolation.writesLegacyBus, false);
  assert.equal(report.isolation.writesRenderer, false);
  assert.equal(report.isolation.writesTimeline, false);
  return { shadow, report };
}

const localXldResolver = resolverApi.create();
const localXldFrame = resolve(localXldResolver, {
  realtimeFrame: realtimeFrame(),
  xldFrame: xldFrame(),
  heuristicFrame: heuristicFrame()
});
const localXld = observeScenario({
  frame: localXldFrame,
  context: {
    sourceMode: 'internal',
    realtimeFrame: realtimeFrame(),
    xldStatus: { loaded: true, error: null }
  }
});
assert.equal(localXld.report.scenario, 'local-xld');

const noXldResolver = resolverApi.create();
const noXldRealtime = realtimeFrame();
const noXldFrame = resolve(noXldResolver, {
  realtimeFrame: noXldRealtime,
  heuristicFrame: heuristicFrame()
});
const noXld = observeScenario({
  frame: noXldFrame,
  context: {
    sourceMode: 'internal',
    realtimeFrame: noXldRealtime,
    xldStatus: { loaded: false, error: 'XLD_NOT_LOADED' }
  }
});
assert.equal(noXld.report.scenario, 'local-no-xld');

const externalResolver = resolverApi.create();
const externalRealtime = realtimeFrame();
const externalFrame = resolve(externalResolver, {
  realtimeFrame: externalRealtime,
  heuristicFrame: heuristicFrame(),
  transport: { mode: 'external' }
});
const external = observeScenario({
  frame: externalFrame,
  context: {
    sourceMode: 'external',
    realtimeFrame: externalRealtime,
    xldStatus: { loaded: false, error: 'XLD_NOT_LOADED' }
  }
});
assert.equal(external.report.scenario, 'external-listening');

const staleResolver = resolverApi.create({
  realtimeTtlMs: 150,
  holdLastMs: 350
});
resolve(staleResolver, {
  nowMs: 0,
  realtimeFrame: realtimeFrame(),
  xldFrame: xldFrame(),
  heuristicFrame: heuristicFrame()
});
const staleRealtime = realtimeFrame({
  available: false,
  ageMs: 500,
  fallbackReason: 'REALTIME_STALE'
});
const staleFrame = resolve(staleResolver, {
  frameIndex: 1,
  nowMs: 500,
  mediaTimeMs: 10500,
  realtimeFrame: staleRealtime,
  xldFrame: xldFrame(),
  heuristicFrame: heuristicFrame()
});
const stale = observeScenario({
  frame: staleFrame,
  nowMs: 500,
  context: {
    sourceMode: 'internal',
    realtimeFrame: staleRealtime,
    xldStatus: { loaded: true, error: null }
  }
});
assert.equal(stale.report.scenario, 'realtime-stale');

const rejectedResolver = resolverApi.create();
const rejectedRealtime = realtimeFrame();
const rejectedFrame = resolve(rejectedResolver, {
  realtimeFrame: rejectedRealtime,
  heuristicFrame: heuristicFrame()
});
const rejected = observeScenario({
  frame: rejectedFrame,
  context: {
    sourceMode: 'internal',
    realtimeFrame: rejectedRealtime,
    xldStatus: {
      loaded: false,
      error: 'XLD_TRACK_ID_MISMATCH'
    },
    xldValidationError: 'XLD_TRACK_ID_MISMATCH'
  }
});
assert.equal(rejected.report.scenario, 'xld-rejected');
assert.equal(rejected.report.rejectionCode, 'XLD_TRACK_ID_MISMATCH');

const throttled = localXld.shadow.update(
  1100,
  localXldFrame,
  legacySnapshot(),
  {
    sourceMode: 'internal',
    realtimeFrame: realtimeFrame(),
    xldStatus: { loaded: true }
  }
);
assert.equal(throttled.sampleCount, 1, 'Shadow sampler exceeded 8 Hz');

const deterministicA = shadowApi.create().update(
  2000,
  localXldFrame,
  legacySnapshot(),
  {
    sourceMode: 'internal',
    realtimeFrame: realtimeFrame(),
    xldStatus: { loaded: true }
  }
);
const deterministicB = shadowApi.create().update(
  2000,
  localXldFrame,
  legacySnapshot(),
  {
    sourceMode: 'internal',
    realtimeFrame: realtimeFrame(),
    xldStatus: { loaded: true }
  }
);
assert.deepEqual(deterministicA, deterministicB);

const app = read('app.js');
function functionSlice(startMarker, endMarker) {
  const start = app.indexOf(startMarker);
  const end = app.indexOf(endMarker, start);
  assert.ok(start >= 0 && end > start, `freeze marker missing: ${startMarker}`);
  return app.slice(start, end).trimEnd();
}
assert.equal(
  sha256(functionSlice(
    'function currentGlitchSignals()',
    'const chordHueRoots'
  )),
  '63b83f264c6d7311652bb9a9816d0f32ef57966a944df7259ad08dab41174211',
  'currentGlitchSignals changed during Phase II Gate'
);
assert.equal(
  sha256(functionSlice(
    'function buildGlitchFeatureFrame(',
    'function drawUniversalGlitchPostFx'
  )),
  '3a20e1ee46e31d6a44bd79a05ad1d56103b77b02b7614980170358ed8878a71d',
  'buildGlitchFeatureFrame changed during Phase II Gate'
);
assert.equal(
  sha256(read('glitch-feature-bus.js')),
  '267fc5b27656fb908d485f143b5d0857fcedbe090eff4606667d7baf7d6bbce4',
  'Legacy glitch-feature-bus changed during Phase II Gate'
);

const shadowSource = read('resolver-legacy-shadow.js');
for (const forbidden of [
  'Math.random',
  'performance.now',
  'Date.now',
  'glitchFeatureBus.update',
  'SmokeResonanceGlitchFeatureBus',
  'visualGlitch.set',
  'visualTimeline.set'
]) {
  assert.ok(
    !shadowSource.includes(forbidden),
    `Shadow comparator contains forbidden dependency: ${forbidden}`
  );
}

console.log(JSON.stringify({
  contract: 'resolver-legacy-shadow',
  scenarios: [
    localXld.report.scenario,
    noXld.report.scenario,
    external.report.scenario,
    stale.report.scenario,
    rejected.report.scenario
  ],
  formalPipeline: localXld.report.formalPipeline,
  comparatorMode: localXld.report.comparatorMode,
  legacyFrozenShape: localXld.report.legacy.frozenShape,
  comparableFeatures: Object.keys(localXld.report.comparisons).length,
  resolverOnlyFeatures: localXld.report.resolverOnly.length
}, null, 2));
