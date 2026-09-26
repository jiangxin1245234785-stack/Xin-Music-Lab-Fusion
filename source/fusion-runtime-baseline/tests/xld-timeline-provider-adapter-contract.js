const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const api = require('../xld-timeline-provider-adapter.js');

const sourcePath = 'D:\\Music\\Artist - Album\\01 Track.flac';
const baseManifest = {
  schemaVersion: 2,
  contract: 'xld.music-lab/2',
  producer: { name: "Xin's Local Deck", version: '0.5.0' },
  timing: { unit: 'seconds', origin: 0, duration: 200 },
  track: {
    id: 'stable-track-id',
    number: 1,
    title: 'Same Title',
    artist: 'Same Artist',
    album: 'Album',
    source: sourcePath
  },
  analyses: [
    {
      engine: {
        id: 'msaf',
        name: 'MSAF',
        version: '0.1.80'
      },
      segments: [
        { start: 0, end: 100, label: 'A', confidence: null },
        { start: 100, end: 200, label: 'B', confidence: null }
      ]
    },
    {
      engine: {
        id: 'songformer',
        name: 'SongFormer',
        version: 'fixture-v1'
      },
      segments: [
        { start: 0, end: 80, label: 'intro', confidence: 0.8 },
        { start: 80, end: 160, label: 'build', confidence: 0.7 },
        { start: 160, end: 200, label: 'outro', confidence: 0.75 }
      ]
    }
  ],
  harmony: [
    {
      engine: { id: 'chord-btc', name: 'BTC', version: 'fixture-v1' },
      segments: [
        { start: 0, end: 120, label: 'C#m7', confidence: 0.8 },
        { start: 120, end: 200, label: 'E', confidence: 0.7 }
      ]
    },
    {
      engine: {
        id: 'chord-cqt',
        name: 'CQT',
        version: 'fixture-v1'
      },
      segments: [
        { start: 0, end: 120, label: 'C#', confidence: 0.6 },
        { start: 120, end: 200, label: 'E', confidence: 0.65 }
      ]
    }
  ],
  manualTags: [
    {
      id: 'manual-climax',
      start: 90,
      end: 110,
      label: 'climax',
      updatedAt: '2026-07-04T00:00:00.000Z'
    },
    {
      id: 'manual-silence',
      start: 90,
      end: 110,
      label: 'silence',
      updatedAt: '2026-07-04T00:00:01.000Z'
    }
  ]
};

const expected = {
  trackId: 'stable-track-id',
  sourcePath,
  durationMs: 200900
};
let validation = api.validateManifest(baseManifest, expected);
assert.equal(validation.ok, true);
assert.equal(validation.contractMajor, 2);
assert.equal(validation.contractMinor, 0);
assert.equal(validation.duration.toleranceMs, 1004.5);

validation = api.validateManifest(
  { ...baseManifest, contract: 'xld.music-lab/2.1' },
  expected
);
assert.equal(validation.ok, true);
assert.equal(validation.contractMinor, 1);

validation = api.validateManifest(
  { ...baseManifest, contract: 'xld.music-lab/3' },
  expected
);
assert.equal(validation.error, 'XLD_CONTRACT_UNSUPPORTED');
assert.equal(validation.path, 'contract');

validation = api.validateManifest(baseManifest, {
  ...expected,
  trackId: 'different-id'
});
assert.equal(validation.error, 'XLD_TRACK_ID_MISMATCH');
assert.equal(validation.path, 'track.id');

validation = api.validateManifest(baseManifest, {
  ...expected,
  sourcePath: 'D:\\Music\\Elsewhere\\01 Track.flac'
});
assert.equal(validation.error, 'XLD_TRACK_SOURCE_MISMATCH');
assert.equal(validation.path, 'track.source');

validation = api.validateManifest(baseManifest, {
  ...expected,
  durationMs: 201100
});
assert.equal(validation.error, 'XLD_DURATION_MISMATCH');
assert.equal(validation.path, 'timing.duration');
assert.equal(validation.details.toleranceMs, 1005.5);

validation = api.validateManifest({
  ...baseManifest,
  analyses: [{
    ...baseManifest.analyses[0],
    segments: [{ start: 5, end: 4, label: 'A' }]
  }]
}, expected);
assert.equal(validation.error, 'XLD_SEGMENT_INVALID');
assert.equal(validation.path, 'analyses[0].segments[0].end');

validation = api.validateManifest({
  ...baseManifest,
  timing: { ...baseManifest.timing, unit: 'milliseconds' }
}, expected);
assert.equal(validation.error, 'XLD_TIMING_UNIT_UNSUPPORTED');

const adapter = api.create();
let load = adapter.load(baseManifest, {
  trackId: expected.trackId,
  sourcePath: expected.sourcePath
});
assert.equal(load.ok, true);
assert.equal(load.durationState, 'pending');
assert.equal(load.cache.builds, 1);
assert.equal(load.cache.manualSegments, 2);
assert.equal(load.cache.analyses.songformer, 3);
assert.equal(load.cache.harmony['chord-btc'], 2);

let duration = adapter.setPlaybackDuration(200900);
assert.equal(duration.ok, true);
assert.equal(duration.durationState, 'accepted');

let frame = adapter.frameAt(95000, {
  clock: { frameIndex: 1, nowMs: 1000, deltaMs: 100 },
  transport: {
    mode: 'internal',
    state: 'playing',
    trackId: expected.trackId,
    durationMs: 200900,
    epoch: 0
  },
  structureEngineId: 'auto',
  harmonyEngineId: 'consensus'
});
assert.equal(frame.labels.sectionId, 'manual:manual-silence');
assert.equal(frame.labels.sectionLabel, 'silence');
assert.equal(frame.states.silence, 1);
assert.equal(frame.states.inClimax, 1);
assert.equal(frame.meta.sectionLabel.sourceProvider, 'xld.manual');
assert.equal(frame.labels.chord, 'C#m7');
assert.equal(frame.meta.chord.sourceProvider, 'xld.harmony');

frame = adapter.frameAt(85000, {
  clock: { frameIndex: 2, nowMs: 1100, deltaMs: 100 },
  transport: {
    mode: 'internal',
    state: 'playing',
    trackId: expected.trackId,
    durationMs: 200900,
    epoch: 0
  },
  structureEngineId: 'auto',
  harmonyEngineId: 'chord-btc'
});
assert.equal(frame.labels.sectionLabel, 'build');
assert.equal(frame.states.inBuild, 1);
assert.equal(frame.meta.sectionLabel.sourceProvider, 'xld.songformer');
let cursor = adapter.cursorAt(85000, {
  structureEngineId: 'auto',
  harmonyEngineId: 'chord-btc'
});
assert.equal(cursor.available, true);
assert.equal(cursor.section.token, 'songformer:1');
assert.equal(cursor.section.segmentIndex, 1);
assert.equal(cursor.harmony.token, 'chord-btc:0');
assert.equal(cursor.harmony.segmentIndex, 0);

frame = adapter.frameAt(150000, {
  clock: { frameIndex: 3, nowMs: 1200, deltaMs: 100 },
  transport: {
    mode: 'internal',
    state: 'paused',
    trackId: expected.trackId,
    durationMs: 200900,
    epoch: 0
  },
  structureEngineId: 'msaf',
  harmonyEngineId: 'chord-cqt'
});
assert.equal(frame.labels.sectionId, 'msaf:cluster:B');
assert.equal(Object.hasOwn(frame.labels, 'sectionLabel'), false);
assert.equal(Object.hasOwn(frame.states, 'inClimax'), false);
assert.equal(frame.meta.sectionId.sourceProvider, 'xld.msaf');
assert.equal(adapter.status().cache.builds, 1);
cursor = adapter.cursorAt(150000, {
  structureEngineId: 'msaf',
  harmonyEngineId: 'chord-cqt'
});
assert.equal(cursor.section.token, 'msaf:1');
assert.equal(cursor.harmony.token, 'chord-cqt:1');

duration = adapter.setPlaybackDuration(201100);
assert.equal(duration.error, 'XLD_DURATION_MISMATCH');
frame = adapter.frameAt(1000, {
  clock: { frameIndex: 4, nowMs: 1300, deltaMs: 100 },
  transport: { mode: 'internal', state: 'playing', epoch: 0 }
});
assert.equal(frame.transport.mediaTimeMs, 1000);
assert.equal(frame.transport.durationMs, null);
assert.equal(frame.meta.sectionId.available, false);
assert.equal(
  frame.meta.sectionId.fallbackReason,
  'DURATION_MISMATCH'
);

// chords.2: ChordMini leads the weighted consensus. With BTC slightly more confident on a different
// root, the ChordMini prior (1.5 vs 1.35) must still win; a BTC-only manifest keeps working unchanged.
{
  const priorAdapter = api.create();
  const manifest = {
    ...baseManifest,
    harmony: [
      { engine: { id: 'chord-btc', name: 'BTC', version: 'fixture-v1' }, segments: [{ start: 0, end: 200, label: 'Em', confidence: 0.72 }] },
      { engine: { id: 'chord-chordmini', name: 'ChordMini · BTC-CL', version: 'fixture-v1' }, segments: [{ start: 0, end: 200, label: 'G', confidence: 0.66 }] },
      { engine: { id: 'chord-consonance', name: 'consonance-ACE', version: 'fixture-v1' }, segments: [{ start: 0, end: 200, label: 'Em7', confidence: 0.9 }] }
    ]
  };
  assert.equal(priorAdapter.load(manifest, { trackId: expected.trackId, sourcePath: expected.sourcePath }).ok, true);
  priorAdapter.setPlaybackDuration(200900);
  const transport = { mode: 'internal', state: 'playing', trackId: expected.trackId, durationMs: 200900, epoch: 0 };
  const led = priorAdapter.frameAt(50000, { clock: { frameIndex: 1, nowMs: 1000, deltaMs: 100 }, transport, structureEngineId: 'auto', harmonyEngineId: 'consensus' });
  // Weights: ChordMini 0.66*1.5 = 0.99 (G) vs BTC 0.72*1.35 + ACE 0.9*1 = 1.872 (E) — agreement of two engines still wins,
  // so ACE and BTC together beat ChordMini alone; ChordMini leads only against BTC by itself.
  assert.equal(led.labels.chord, 'Em', 'two agreeing engines outvote a lone ChordMini');
  const duel = api.create();
  assert.equal(duel.load({ ...manifest, harmony: manifest.harmony.slice(0, 2) }, { trackId: expected.trackId, sourcePath: expected.sourcePath }).ok, true);
  duel.setPlaybackDuration(200900);
  const duelFrame = duel.frameAt(50000, { clock: { frameIndex: 1, nowMs: 1000, deltaMs: 100 }, transport, structureEngineId: 'auto', harmonyEngineId: 'consensus' });
  assert.equal(duelFrame.labels.chord, 'G', 'ChordMini prior must beat a slightly more confident BTC');
  assert.equal(duel.cursorAt(50000, { structureEngineId: 'auto', harmonyEngineId: 'consensus' }).harmony.token, 'consensus:chord-chordmini:0');
  const single = duel.cursorAt(50000, { structureEngineId: 'auto', harmonyEngineId: 'chord-btc' });
  assert.equal(single.harmony.token, 'chord-btc:0', 'single-engine BTC selection must still work');
  assert.deepEqual(api.constants.HARMONY_PRIOR, { 'chord-chordmini': 1.5, 'chord-btc': 1.35, 'chord-consonance': 1, 'chord-hybrid': 1, 'chord-cqt': 1, 'chord-cens': 1 });
}

const adapterSource = fs.readFileSync(
  path.join(__dirname, '..', 'xld-timeline-provider-adapter.js'),
  'utf8'
);
for (const forbidden of [
  'document.',
  'querySelector',
  'AudioContext',
  'createAnalyser',
  'performance.now',
  'Date.now',
  'Math.random'
]) {
  assert.equal(
    adapterSource.includes(forbidden),
    false,
    `XLD Adapter must not use ${forbidden}`
  );
}

const fusionSource = fs.readFileSync(
  path.join(__dirname, '..', 'fusion.js'),
  'utf8'
);
assert.match(
  fusionSource,
  /xldTimelineProvider\.frameAt\([\s\S]*structureEngineId: state\.sectionEngine/
);
assert.ok(!fusionSource.includes('validateManifest(state.manifest'));

const mainSource = fs.readFileSync(
  path.join(__dirname, '..', 'desktop', 'main.cjs'),
  'utf8'
);
assert.match(mainSource, /xldTimelineProvider\.validateManifest/);

console.log(JSON.stringify({
  contract: 'xld.music-lab/2',
  supportedMajor: 2,
  currentMinor: 0,
  durationTolerance: 'max(1000ms, 0.5%)',
  cache: load.cache,
  providers: ['xld.manual', 'xld.songformer', 'xld.msaf', 'xld.harmony'],
  errors: api.constants.ERROR_CODES
}, null, 2));
