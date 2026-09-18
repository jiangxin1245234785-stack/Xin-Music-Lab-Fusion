const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const api = require('../music-feature-resolver.js');

function clock(frameIndex, nowMs, deltaMs = 20) {
  return { frameIndex, nowMs, deltaMs };
}

function transport(
  mediaTimeMs,
  options = {}
) {
  return {
    mode: options.mode || 'internal',
    state: options.state || 'playing',
    trackId: options.mode === 'external'
      ? null
      : options.trackId || 'fixture-track',
    mediaTimeMs: options.mode === 'external' ? null : mediaTimeMs,
    durationMs: options.mode === 'external'
      ? null
      : options.durationMs || 100000,
  };
}

function meta(
  sourceProvider,
  options = {}
) {
  return {
    sourceProvider,
    providerDetail: {
      engineId: options.engineId || `${sourceProvider}-fixture`,
      providerVersion: 'fixture-v1',
    },
    confidence: options.available === false
      ? null
      : options.confidence ?? 0.9,
    available: options.available !== false,
    ageMs: options.ageMs || 0,
    fallbackReason: options.available === false
      ? options.fallbackReason || 'PROVIDER_UNAVAILABLE'
      : null,
  };
}

function realtimeFrame(options = {}) {
  const available = options.available !== false;
  const providerMeta = meta('realtime.core', {
    available,
    ageMs: options.ageMs || 0,
    fallbackReason: options.fallbackReason || 'REALTIME_STALE',
  });
  return {
    contract: 'xin.music-frame/1',
    contractVersion: 1,
    continuous: {
      loudness: options.loudness ?? 0.7,
      bass: options.bass ?? 0.6,
      mid: options.mid ?? 0.5,
      treble: options.treble ?? 0.4,
      flux: options.flux ?? 0.3,
    },
    states: {
      silence: options.silence ?? 0,
    },
    events: {
      onset: options.onset || null,
      bassPeak: options.bassPeak || null,
    },
    meta: Object.fromEntries(
      [
        'loudness',
        'bass',
        'mid',
        'treble',
        'flux',
        'silence',
        'onset',
        'bassPeak',
      ].map(featureId => [featureId, { ...providerMeta }]),
    ),
  };
}

function xldFrame(options = {}) {
  const provider = options.provider || 'xld.songformer';
  const structureMeta = meta(provider, {
    confidence: options.sectionConfidence ?? 0.88,
    engineId: options.engineId || 'songformer',
  });
  const harmonyMeta = meta('xld.harmony', {
    confidence: options.chordConfidence ?? 0.82,
    engineId: 'chord-btc',
  });
  const sectionLabel = options.sectionLabel || 'verse';
  const sectionId = options.sectionId || `songformer:${sectionLabel}:0`;
  const chord = options.chord || 'C#m7';
  return {
    contract: 'xin.music-frame/1',
    contractVersion: 1,
    continuous: {
      chordConfidence: options.chordConfidence ?? 0.82,
    },
    states: {
      silence: options.silence ?? 0,
      inBuild: options.inBuild ?? 0,
      inDrop: options.inDrop ?? 0,
      inClimax: options.inClimax ?? 0,
    },
    events: {},
    labels: {
      sectionId,
      sectionLabel,
      chord,
    },
    meta: {
      chordConfidence: harmonyMeta,
      silence: structureMeta,
      inBuild: structureMeta,
      inDrop: structureMeta,
      inClimax: structureMeta,
      sectionId: structureMeta,
      sectionLabel: structureMeta,
      chord: harmonyMeta,
    },
  };
}

function cursor(sectionIndex, harmonyIndex) {
  return {
    available: true,
    section: {
      token: `songformer:${sectionIndex}`,
      provider: 'xld.songformer',
      segmentIndex: sectionIndex,
    },
    harmony: {
      token: `chord-btc:${harmonyIndex}`,
      provider: 'xld.harmony',
      segmentIndex: harmonyIndex,
    },
  };
}

function heuristicFrame(options = {}) {
  const providerMeta = meta('realtime.heuristic', {
    confidence: options.confidence ?? 0.42,
    engineId: 'xml-section-heuristic',
  });
  const label = options.sectionLabel || 'FULL';
  const chord = options.chord || 'Am';
  return {
    contract: 'xin.music-frame/1',
    contractVersion: 1,
    continuous: {
      dynamicRange: 0.55,
      spectralDensity: 0.62,
      flatness: 0.3,
      sharpness: 0.48,
      buildEnergy: 0.4,
      sectionDrive: 0.7,
      chordConfidence: options.chordConfidence ?? 0.4,
    },
    states: {
      inBuild: label === 'LAYERING' ? 1 : 0,
      inDrop: label === 'DROP' ? 1 : 0,
      inClimax: label === 'CLIMAX' ? 1 : 0,
    },
    events: {},
    labels: {
      sectionId: `realtime:${label}`,
      sectionLabel: label,
      chord,
    },
    meta: Object.fromEntries(
      [
        'dynamicRange',
        'spectralDensity',
        'flatness',
        'sharpness',
        'buildEnergy',
        'sectionDrive',
        'chordConfidence',
        'inBuild',
        'inDrop',
        'inClimax',
        'sectionId',
        'sectionLabel',
        'chord',
      ].map(featureId => [featureId, { ...providerMeta }]),
    ),
  };
}

function resolveAt(resolver, options) {
  return resolver.resolve({
    clock: clock(
      options.frameIndex,
      options.nowMs,
      options.deltaMs,
    ),
    transport: transport(
      options.mediaTimeMs,
      options.transport,
    ),
    transition: options.transition || null,
    realtimeFrame: options.realtimeFrame || null,
    xldFrame: options.xldFrame || null,
    xldCursor: options.xldCursor || null,
    heuristicFrame: options.heuristicFrame || null,
  });
}

const hybrid = api.create({
  realtimeTtlMs: 150,
  holdLastMs: 350,
});
let frame = resolveAt(hybrid, {
  frameIndex: 0,
  nowMs: 0,
  mediaTimeMs: 9990,
  realtimeFrame: realtimeFrame(),
  xldFrame: xldFrame(),
  xldCursor: cursor(0, 0),
  heuristicFrame: heuristicFrame(),
});
assert.equal(frame.continuous.loudness, 0.7);
assert.equal(frame.meta.loudness.sourceProvider, 'realtime.core');
assert.equal(frame.labels.sectionLabel, 'verse');
assert.equal(frame.meta.sectionLabel.sourceProvider, 'xld.songformer');
assert.equal(frame.labels.chord, 'C#m7');
assert.equal(frame.meta.chord.sourceProvider, 'xld.harmony');
assert.equal(frame.events.sectionBoundary, null);

frame = resolveAt(hybrid, {
  frameIndex: 1,
  nowMs: 20,
  mediaTimeMs: 10010,
  realtimeFrame: realtimeFrame(),
  xldFrame: xldFrame({
    sectionId: 'songformer:climax:1',
    sectionLabel: 'climax',
    chord: 'E',
    inClimax: 1,
  }),
  xldCursor: cursor(1, 1),
  heuristicFrame: heuristicFrame(),
});
assert.ok(frame.events.sectionBoundary);
assert.ok(frame.events.climaxEnter);
assert.ok(frame.events.chordChange);
assert.equal(frame.events.sectionBoundary.epoch, 0);
assert.match(
  frame.events.sectionBoundary.eventId,
  /^xld:[0-9a-f]{8}:sectionBoundary:e0:b[0-9a-f]{8}$/,
);
assert.ok(!frame.events.sectionBoundary.eventId.includes('10010'));

frame = resolveAt(hybrid, {
  frameIndex: 2,
  nowMs: 40,
  mediaTimeMs: 10030,
  realtimeFrame: realtimeFrame(),
  xldFrame: xldFrame({
    sectionId: 'songformer:climax:1',
    sectionLabel: 'climax',
    chord: 'E',
    inClimax: 1,
  }),
  xldCursor: cursor(1, 1),
});
assert.equal(frame.events.sectionBoundary, null);
assert.equal(frame.events.climaxEnter, null);
assert.equal(frame.events.chordChange, null);

frame = resolveAt(hybrid, {
  frameIndex: 3,
  nowMs: 60,
  mediaTimeMs: 50000,
  transition: { type: 'seek', serial: 1 },
  realtimeFrame: realtimeFrame(),
  xldFrame: xldFrame({
    sectionId: 'songformer:outro:4',
    sectionLabel: 'outro',
    chord: 'B',
  }),
  xldCursor: cursor(4, 5),
});
assert.equal(frame.transport.epoch, 1);
assert.equal(frame.events.sectionBoundary, null);
assert.equal(frame.events.chordChange, null);

const stale = api.create({
  realtimeTtlMs: 150,
  holdLastMs: 350,
});
resolveAt(stale, {
  frameIndex: 0,
  nowMs: 0,
  mediaTimeMs: 1000,
  realtimeFrame: realtimeFrame({ loudness: 0.65 }),
  xldFrame: xldFrame(),
  xldCursor: cursor(0, 0),
});
frame = resolveAt(stale, {
  frameIndex: 1,
  nowMs: 100,
  mediaTimeMs: 1100,
  realtimeFrame: realtimeFrame({
    available: false,
    ageMs: 100,
    fallbackReason: 'REALTIME_STALE',
  }),
  xldFrame: xldFrame(),
  xldCursor: cursor(0, 0),
});
assert.equal(frame.continuous.loudness, 0.65);
assert.equal(frame.meta.loudness.sourceProvider, 'held-last');
assert.equal(frame.meta.loudness.fallbackReason, 'HELD_LAST');
frame = resolveAt(stale, {
  frameIndex: 2,
  nowMs: 500,
  mediaTimeMs: 1500,
  realtimeFrame: realtimeFrame({
    available: false,
    ageMs: 500,
    fallbackReason: 'REALTIME_STALE',
  }),
  xldFrame: xldFrame(),
  xldCursor: cursor(0, 0),
});
assert.equal(frame.continuous.loudness, 0);
assert.equal(frame.meta.loudness.sourceProvider, 'neutral');
assert.equal(frame.meta.loudness.fallbackReason, 'REALTIME_STALE');
assert.equal(frame.labels.sectionLabel, 'verse');

const realtimeEvents = api.create();
resolveAt(realtimeEvents, {
  frameIndex: 0,
  nowMs: 0,
  mediaTimeMs: 1000,
  realtimeFrame: realtimeFrame(),
});
const onset = {
  eventId: 'external:onset:0:1',
  strength: 0.9,
  engineTimeMs: 20,
  mediaTimeMs: 1020,
  epoch: 0,
};
frame = resolveAt(realtimeEvents, {
  frameIndex: 1,
  nowMs: 20,
  mediaTimeMs: 1020,
  realtimeFrame: realtimeFrame({ onset }),
});
assert.ok(frame.events.onset);
assert.match(
  frame.events.onset.eventId,
  /^rt:[0-9a-f]{8}:onset:e0:n1$/,
);
frame = resolveAt(realtimeEvents, {
  frameIndex: 2,
  nowMs: 40,
  mediaTimeMs: 1040,
  realtimeFrame: realtimeFrame({ onset }),
});
assert.equal(frame.events.onset, null);

const paused = api.create();
resolveAt(paused, {
  frameIndex: 0,
  nowMs: 0,
  mediaTimeMs: null,
  transport: { mode: 'external', state: 'playing' },
  realtimeFrame: realtimeFrame({ loudness: 0.5 }),
  heuristicFrame: heuristicFrame({
    sectionLabel: 'FULL',
    chord: 'Am',
  }),
});
frame = resolveAt(paused, {
  frameIndex: 1,
  nowMs: 1000,
  mediaTimeMs: null,
  transport: { mode: 'external', state: 'paused' },
  transition: { type: 'pause', serial: 1 },
  realtimeFrame: realtimeFrame({
    available: false,
    ageMs: 1000,
  }),
});
assert.equal(frame.labels.sectionLabel, 'FULL');
assert.equal(frame.labels.chord, 'Am');
assert.equal(frame.meta.sectionLabel.sourceProvider, 'held-last');
assert.equal(frame.continuous.loudness, 0);
assert.ok(Object.values(frame.events).every(event => event === null));

const external = api.create();
resolveAt(external, {
  frameIndex: 0,
  nowMs: 0,
  mediaTimeMs: 1000,
  realtimeFrame: realtimeFrame(),
  xldFrame: xldFrame(),
  xldCursor: cursor(0, 0),
});
frame = resolveAt(external, {
  frameIndex: 1,
  nowMs: 20,
  mediaTimeMs: null,
  transport: { mode: 'external', state: 'playing' },
  transition: { type: 'mode-change', serial: 1 },
  realtimeFrame: realtimeFrame(),
  heuristicFrame: heuristicFrame({
    sectionLabel: 'FULL',
    chord: 'Am',
  }),
});
assert.equal(frame.transport.mode, 'external');
assert.equal(frame.transport.epoch, 1);
assert.equal(frame.meta.loudness.sourceProvider, 'realtime.core');
assert.equal(frame.meta.sectionLabel.sourceProvider, 'realtime.heuristic');
assert.equal(frame.meta.sectionLabel.confidence <= 0.55, true);
assert.ok(Object.values(frame.events).every(event => event === null));

const looped = api.create();
resolveAt(looped, {
  frameIndex: 0,
  nowMs: 0,
  mediaTimeMs: 90000,
  realtimeFrame: realtimeFrame(),
  xldFrame: xldFrame({ sectionLabel: 'outro' }),
  xldCursor: cursor(4, 5),
});
frame = resolveAt(looped, {
  frameIndex: 1,
  nowMs: 20,
  mediaTimeMs: 1000,
  realtimeFrame: realtimeFrame(),
  xldFrame: xldFrame({ sectionLabel: 'intro' }),
  xldCursor: cursor(0, 0),
});
assert.equal(frame.transport.epoch, 1);
assert.equal(looped.status().transition, 'loop');
assert.ok(Object.values(frame.events).every(event => event === null));

const switched = api.create();
resolveAt(switched, {
  frameIndex: 0,
  nowMs: 0,
  mediaTimeMs: 5000,
  realtimeFrame: realtimeFrame(),
  xldFrame: xldFrame(),
  xldCursor: cursor(0, 0),
});
frame = resolveAt(switched, {
  frameIndex: 1,
  nowMs: 20,
  mediaTimeMs: 0,
  transport: { trackId: 'fixture-track-b' },
  transition: { type: 'track-change', serial: 1 },
  realtimeFrame: realtimeFrame(),
  xldFrame: xldFrame({ sectionLabel: 'intro' }),
  xldCursor: cursor(0, 0),
});
assert.equal(frame.transport.epoch, 1);
assert.equal(frame.transport.trackId, 'fixture-track-b');
assert.ok(Object.values(frame.events).every(event => event === null));

function deterministicRun() {
  const resolver = api.create();
  const outputs = [];
  for (let index = 0; index < 4; index++) {
    outputs.push(resolveAt(resolver, {
      frameIndex: index,
      nowMs: index * 20,
      mediaTimeMs: 9990 + index * 20,
      realtimeFrame: realtimeFrame({
        onset: index === 2
          ? {
              eventId: 'fixture-onset',
              strength: 0.8,
              engineTimeMs: 40,
              mediaTimeMs: 10030,
              epoch: 0,
            }
          : null,
      }),
      xldFrame: xldFrame(),
      xldCursor: cursor(0, 0),
    }));
  }
  return outputs;
}
assert.deepEqual(deterministicRun(), deterministicRun());

const resolverSource = fs.readFileSync(
  path.join(__dirname, '..', 'music-feature-resolver.js'),
  'utf8',
);
for (const forbidden of [
  'performance.now',
  'Date.now',
  'Math.random',
  'currentTime',
  'AudioContext',
  'querySelector',
]) {
  assert.equal(
    resolverSource.includes(forbidden),
    false,
    `Resolver must not use ${forbidden}`,
  );
}
assert.ok(!resolverSource.includes('mediaTimeMs}`'));
assert.ok(!resolverSource.includes('mediaTimeMs).toString'));

const fusionSource = fs.readFileSync(
  path.join(__dirname, '..', 'fusion.js'),
  'utf8',
);
assert.match(
  fusionSource,
  /musicFeatureResolver\.resolve\(\{[\s\S]*realtimeFrame:[\s\S]*xldFrame:/,
);
assert.match(
  fusionSource,
  /visualFrameClock\?\.subscribe\(\s*updateResolverShadow,\s*\{ phase: 'pre-material' \}\s*\)/,
);
assert.ok(
  !fusionSource.includes('visualTimeline?.set(unifiedMusicFrame'),
);
assert.ok(
  !fusionSource.includes('visualGlitch?.set(unifiedMusicFrame'),
);

console.log(JSON.stringify({
  contract: frame.contract,
  contractVersion: frame.contractVersion,
  domains: {
    energy: 'realtime.core',
    structure: 'xld.* -> realtime.heuristic',
    harmony: 'xld.harmony -> realtime.heuristic',
  },
  lifecycle: [
    'seek',
    'pause',
    'loop',
    'track-change',
    'external',
    'realtime-stale',
  ],
  deterministicEventIds: true,
  visualMode: 'shadow',
}, null, 2));
