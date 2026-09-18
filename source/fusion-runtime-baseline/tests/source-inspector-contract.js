const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const api = require('../source-inspector.js');

const allFeatures = api.constants.GROUPS.flatMap(group =>
  group.features.map(([featureId]) => featureId)
);

function featureMeta(options = {}) {
  return {
    sourceProvider: options.provider || 'neutral',
    providerDetail: {
      engineId: options.engineId || 'fixture',
      providerVersion: 'fixture-v1',
    },
    confidence: options.confidence ?? null,
    available: options.available === true,
    ageMs: options.ageMs ?? 0,
    fallbackReason: Object.hasOwn(options, 'fallbackReason')
      ? options.fallbackReason
      : 'NO_SOURCE',
  };
}

function frame(options = {}) {
  const meta = Object.fromEntries(
    allFeatures.map(featureId => [
      featureId,
      featureMeta(options.meta?.[featureId]),
    ]),
  );
  return {
    contract: 'xin.music-frame/1',
    contractVersion: 1,
    clock: { frameIndex: 1, nowMs: 100, deltaMs: 16 },
    transport: {
      mode: options.mode || 'internal',
      state: options.state || 'playing',
      trackId: 'fixture-track',
      mediaTimeMs: 1000,
      durationMs: 100000,
      epoch: options.epoch || 0,
    },
    continuous: {
      loudness: options.loudness ?? 0,
      bass: 0,
      mid: 0,
      treble: 0,
      dynamicRange: 0,
      spectralDensity: 0,
      flux: 0,
      flatness: 0,
      sharpness: 0,
      buildEnergy: 0,
      sectionDrive: 0,
      rhythmPhase: 0,
      chordConfidence: 0,
    },
    states: {
      silence: 0,
      inBuild: 0,
      inDrop: 0,
      inClimax: 0,
    },
    events: {
      onset: null,
      bassPeak: null,
      sectionBoundary: null,
      dropEnter: null,
      climaxEnter: null,
      chordChange: null,
    },
    labels: {
      sectionId: null,
      sectionLabel: null,
      chord: null,
    },
    meta,
  };
}

const neutral = api.buildSnapshot(frame(), {
  xldStatus: { error: 'XLD_NOT_LOADED' },
});
assert.equal(neutral.rows.length, 26);
assert.equal(neutral.sourceState, 'NEUTRAL');
assert.equal(
  neutral.rows.find(row => row.featureId === 'loudness').value,
  'UNKNOWN',
);
assert.equal(
  neutral.rows.find(row => row.featureId === 'loudness').confidence,
  'UNKNOWN',
);
assert.equal(neutral.warning, null);

const liveFrame = frame({
  loudness: 0,
  meta: {
    loudness: {
      provider: 'realtime.core',
      engineId: 'xml-realtime-analyser',
      confidence: null,
      available: true,
      ageMs: 12,
      fallbackReason: null,
    },
    onset: {
      provider: 'realtime.core',
      engineId: 'xml-realtime-analyser',
      confidence: 0.9,
      available: true,
      ageMs: 12,
      fallbackReason: null,
    },
  },
});
const live = api.buildSnapshot(liveFrame);
const loudness = live.rows.find(row => row.featureId === 'loudness');
const onset = live.rows.find(row => row.featureId === 'onset');
assert.equal(live.sourceState, 'LIVE');
assert.equal(loudness.value, '0%');
assert.equal(loudness.confidence, 'UNKNOWN');
assert.equal(loudness.age, '12 ms');
assert.equal(
  loudness.provider,
  'realtime.core · xml-realtime-analyser',
);
assert.equal(onset.value, 'IDLE');

assert.deepEqual(
  api.classifyXldError('XLD_CONTRACT_UNSUPPORTED'),
  {
    category: 'contract',
    label: 'XLD 契约拒绝',
    code: 'XLD_CONTRACT_UNSUPPORTED',
  },
);
assert.equal(
  api.classifyXldError('XLD_TRACK_ID_MISMATCH').category,
  'track',
);
assert.equal(
  api.classifyXldError('XLD_TRACK_SOURCE_MISMATCH').category,
  'track',
);
assert.equal(
  api.classifyXldError('XLD_DURATION_MISMATCH').category,
  'duration',
);
assert.equal(api.classifyXldError('XLD_NOT_LOADED'), null);

const inspector = api.create({ intervalMs: 125 });
let result = inspector.update(0, frame());
assert.equal(result.sampled, true);
assert.equal(result.updated, true);
result = inspector.update(50, liveFrame);
assert.equal(result.sampled, false);
result = inspector.update(125, frame());
assert.equal(result.sampled, true);
assert.equal(result.updated, false);
result = inspector.update(250, liveFrame);
assert.equal(result.sampled, true);
assert.equal(result.updated, true);
const status = inspector.status();
assert.equal(status.intervalMs, 125);
assert.equal(status.rateHz, 8);
assert.equal(status.sampleCount, 3);
assert.equal(status.updateCount, 2);
assert.equal(status.domWrites, 0);

const source = fs.readFileSync(
  path.join(__dirname, '..', 'source-inspector.js'),
  'utf8',
);
for (const forbidden of [
  'performance.now',
  'Date.now',
  'Math.random',
  'requestAnimationFrame',
  'setInterval',
  'setTimeout',
]) {
  assert.equal(
    source.includes(forbidden),
    false,
    `Inspector must not own time via ${forbidden}`,
  );
}
assert.match(
  source,
  /if \(!node \|\| node\.textContent === value\) return 0;/,
);
assert.match(
  source,
  /safeNow - this\.lastSampleAt < this\.intervalMs/,
);

const html = fs.readFileSync(
  path.join(__dirname, '..', 'index.html'),
  'utf8',
);
const start = html.indexOf('<details class="source-inspector"');
const end = html.indexOf('</details>', start);
const inspectorMarkup = html.slice(start, end);
assert.ok(start >= 0);
assert.ok(inspectorMarkup.includes('只读诊断'));
assert.ok(!/<input|<button|<select|<textarea/.test(inspectorMarkup));

console.log(JSON.stringify({
  version: api.constants.VERSION,
  features: allFeatures.length,
  updateRateHz: status.rateHz,
  unknownPreserved: loudness.confidence === 'UNKNOWN',
  warningCategories: ['contract', 'track', 'duration'],
  controls: 0,
}, null, 2));
