const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const providerApi = require('../realtime-provider-adapter.js');

function clock(frameIndex, nowMs, fps) {
  return {
    frameIndex,
    nowMs,
    deltaMs: 1000 / fps
  };
}

function transport(state = 'playing', mode = 'external') {
  return {
    mode,
    state,
    trackId: mode === 'internal' ? 'fixture-track' : null,
    mediaTimeMs: mode === 'internal' ? 1000 : null,
    durationMs: mode === 'internal' ? 10000 : null,
    epoch: 2
  };
}

function sampleAt(nowMs, values = {}) {
  return {
    sampledAtMs: nowMs,
    confidence: 0.9,
    loudness: 0.52,
    bass: 0.44,
    mid: 0.36,
    treble: 0.28,
    flux: 0.12,
    silence: 0,
    onset: 0,
    bassPeak: 0,
    ...values
  };
}

function runRate(fps) {
  const adapter = providerApi.create();
  const events = [];
  const step = 1000 / fps;
  let frame = null;
  for (let index = 0; index <= fps; index++) {
    const nowMs = index * step;
    const onset = nowMs >= 300 && nowMs < 400 ? 0.82 : 0.02;
    const bassPeak = nowMs >= 600 && nowMs < 700 ? 0.9 : 0.02;
    frame = adapter.update({
      clock: clock(index, nowMs, fps),
      transport: transport(),
      connected: true,
      sample: sampleAt(nowMs, { onset, bassPeak })
    });
    for (const eventId of ['onset', 'bassPeak']) {
      if (frame.events[eventId]) events.push(frame.events[eventId]);
    }
  }
  return { frame, events };
}

const at30 = runRate(30);
const at60 = runRate(60);
for (const result of [at30, at60]) {
  assert.equal(result.frame.contract, 'xin.music-frame/1');
  assert.equal(result.frame.contractVersion, 1);
  assert.equal(result.frame.meta.loudness.sourceProvider, 'realtime.core');
  assert.equal(
    result.frame.meta.loudness.providerDetail.engineId,
    'xml-realtime-analyser'
  );
  assert.equal(result.frame.meta.loudness.available, true);
  assert.equal(result.frame.meta.loudness.ageMs, 0);
  assert.deepEqual(
    result.events.map(event => event.eventId),
    ['external:onset:2:1', 'external:bassPeak:2:1']
  );
}

const lifecycle = providerApi.create();
let frame = lifecycle.update({
  clock: clock(0, 0, 60),
  transport: transport(),
  connected: true,
  sample: sampleAt(0)
});
assert.equal(frame.meta.bass.available, true);

frame = lifecycle.update({
  clock: clock(1, 20, 60),
  transport: transport('playing'),
  connected: false,
  sample: null
});
assert.equal(frame.continuous.bass, 0.44);
assert.equal(frame.meta.bass.available, false);
assert.equal(frame.meta.bass.ageMs, 20);
assert.equal(frame.meta.bass.fallbackReason, 'REALTIME_STALE');
assert.equal(frame.events.onset, null);

frame = lifecycle.update({
  clock: clock(2, 40, 60),
  transport: transport('paused', 'internal'),
  connected: true,
  sample: null
});
assert.equal(frame.transport.state, 'paused');
assert.equal(frame.meta.loudness.available, false);
assert.equal(frame.meta.loudness.ageMs, 40);

frame = lifecycle.update({
  clock: clock(3, 60, 60),
  transport: transport(),
  connected: true,
  sample: sampleAt(60, { onset: 0.9, bassPeak: 0.9 })
});
assert.equal(frame.meta.onset.available, true);
assert.equal(frame.events.onset, null);
assert.equal(frame.events.bassPeak, null);

lifecycle.update({
  clock: clock(4, 80, 60),
  transport: transport(),
  connected: true,
  sample: sampleAt(80, { onset: 0, bassPeak: 0 })
});
frame = lifecycle.update({
  clock: clock(5, 180, 60),
  transport: transport(),
  connected: true,
  sample: sampleAt(180, { onset: 0.91, bassPeak: 0.92 })
});
assert.equal(frame.events.onset.eventId, 'external:onset:2:1');
assert.equal(frame.events.bassPeak.eventId, 'external:bassPeak:2:1');

const silence = providerApi.create().update({
  clock: clock(0, 0, 30),
  transport: transport(),
  connected: true,
  sample: sampleAt(0, {
    loudness: 0,
    bass: 0,
    mid: 0,
    treble: 0,
    flux: 0,
    silence: 1
  })
});
assert.equal(silence.states.silence, 1);
assert.equal(silence.meta.silence.available, true);

const unavailable = providerApi.create().update({
  clock: clock(0, 50, 60),
  transport: transport('stopped'),
  connected: false,
  sample: null
});
assert.equal(unavailable.meta.loudness.available, false);
assert.equal(
  unavailable.meta.loudness.fallbackReason,
  'PROVIDER_UNAVAILABLE'
);

const adapterSource = fs.readFileSync(
  path.join(__dirname, '..', 'realtime-provider-adapter.js'),
  'utf8'
);
for (const forbidden of [
  'createAnalyser',
  'getByteFrequencyData',
  'getFloatFrequencyData',
  'getByteTimeDomainData',
  'getFloatTimeDomainData',
  'AudioContext',
  'performance.now',
  'Date.now',
  'Math.random'
]) {
  assert.equal(
    adapterSource.includes(forbidden),
    false,
    `Adapter must not use ${forbidden}`
  );
}

const html = fs.readFileSync(
  path.join(__dirname, '..', 'index.html'),
  'utf8'
);
assert.ok(html.includes('./realtime-provider-adapter.js'));
assert.ok(html.includes('./app.js'));
assert.ok(
  html.indexOf('./realtime-provider-adapter.js') <
    html.indexOf('./app.js')
);

const appSource = fs.readFileSync(
  path.join(__dirname, '..', 'app.js'),
  'utf8'
);
assert.match(
  appSource,
  /realtimeProviderAdapter\.update\(\{[\s\S]*sample: sampling/
);
assert.match(
  appSource,
  /const energy = getEnergy\(\);\s+updateRealtimeProviderFrame\(energy, now\);/
);

console.log(JSON.stringify({
  rates: [30, 60],
  provider: frame.meta.loudness.sourceProvider,
  features: providerApi.constants.ALL_FEATURES,
  lifecycle: {
    disconnect: 'REALTIME_STALE',
    pause: 'unavailable',
    resume: 'primed-without-event',
    silence: silence.states.silence
  },
  noAdditionalAnalysis: true
}, null, 2));
