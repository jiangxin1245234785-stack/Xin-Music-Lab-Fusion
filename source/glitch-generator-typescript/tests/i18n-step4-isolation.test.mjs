import assert from 'node:assert/strict';
import test from 'node:test';

import {
  CONTINUOUS_MUSIC_FEATURE_IDS,
  CURRENT_SCHEMA_VERSION,
  ContinuousFeatureExtractor,
  OfflineDeterministicPlayback,
  buildUnifiedMusicFrame,
  createGeneratorRuntime,
  createSineBuffer,
  getProductBuiltInPreset
} from '../dist/index.js';
import {
  createLocaleController,
  translateSurfaceText
} from '../dist/ui/i18n/index.js';

const FRAME_COUNT = 188;
const FRAME_SIZE = 2048;
const SESSION_SEED = 0x4931344e;

function continuousValues(feature) {
  return Object.fromEntries(CONTINUOUS_MUSIC_FEATURE_IDS.map(id => [
    id,
    id === 'chordConfidence' ? 0 : Number(feature[id] ?? 0)
  ]));
}

function continuousMeta() {
  return Object.fromEntries(CONTINUOUS_MUSIC_FEATURE_IDS.map(id => [id, {
    sourceProvider: 'realtime.core',
    providerDetail: {
      engineId: 'step4-offline-deterministic',
      providerVersion: '1'
    },
    confidence: 1,
    available: true,
    ageMs: 0,
    fallbackReason: null
  }]));
}

test('Step 4 locale switching leaves 188 offline deterministic frames untouched', () => {
  const buffer = createSineBuffer({
    frequencyHz: 997,
    amplitude: 0.63,
    durationSeconds: 9.5
  });
  const playback = new OfflineDeterministicPlayback(buffer, FRAME_SIZE);
  const extractor = new ContinuousFeatureExtractor();
  const preset = getProductBuiltInPreset('balanced');
  const reference = createGeneratorRuntime({ preset, sessionSeed: SESSION_SEED });
  const localized = createGeneratorRuntime({ preset, sessionSeed: SESSION_SEED });
  const locale = createLocaleController();
  const presetBefore = JSON.stringify(localized.getPreset());
  const frameDurationMs = FRAME_SIZE / buffer.sampleRate * 1000;
  let observedNonZeroAudio = false;

  for (let frameIndex = 0; frameIndex < FRAME_COUNT; frameIndex++) {
    if (frameIndex === 40) locale.setLocalLocale('en-US');
    if (frameIndex === 80) locale.setHostLocale('zh-CN');
    if (frameIndex === 120) locale.clearHostLocale();
    if (frameIndex === 160) locale.setLocalLocale('zh-CN');

    // Exercise the presentation API while the fixed offline playback advances.
    translateSurfaceText(locale.getLocale(), 'Perform');
    translateSurfaceText(locale.getLocale(), 'OFFLINE DETERMINISTIC');

    const pcm = playback.nextFrame();
    assert.ok(pcm, `offline fixture ended before frame ${frameIndex}`);
    const clock = {
      frameIndex,
      nowMs: frameIndex * frameDurationMs,
      deltaMs: frameIndex === 0 ? 0 : frameDurationMs
    };
    const feature = extractor.extract(pcm, clock);
    const frame = buildUnifiedMusicFrame({
      clock,
      transport: {
        mode: 'offline-test',
        state: 'playing',
        trackId: 'i18n-step4-fixed-sine',
        mediaTimeMs: clock.nowMs,
        durationMs: buffer.channels[0].length / buffer.sampleRate * 1000,
        epoch: 0
      },
      continuous: continuousValues(feature),
      meta: continuousMeta()
    });
    const expected = reference.evaluate(frame, frame.clock);
    const actual = localized.evaluate(frame, frame.clock);
    assert.deepEqual(actual, expected, `locale changed frame ${frameIndex}`);
    observedNonZeroAudio ||= actual.sources.values['audio.loudness'] > 0;
  }

  assert.equal(observedNonZeroAudio, true);
  assert.equal(JSON.stringify(localized.getPreset()), presetBefore);
  assert.equal(reference.status().evaluationSerial, FRAME_COUNT);
  assert.equal(localized.status().evaluationSerial, FRAME_COUNT);
  assert.equal(localized.status().resetCount, 0);
  assert.equal(localized.status().lastClock.frameIndex, FRAME_COUNT - 1);
});

test('Step 4 remains presentation-only and does not bump schemaVersion', () => {
  const preset = getProductBuiltInPreset('balanced');
  const before = JSON.stringify(preset);
  const locale = createLocaleController();

  locale.setLocalLocale('en-US');
  translateSurfaceText(locale.getLocale(), 'Map');
  locale.setHostLocale('zh-CN');
  translateSurfaceText(locale.getLocale(), 'Visual');
  locale.clearHostLocale();

  assert.equal(CURRENT_SCHEMA_VERSION, 16);
  assert.equal(preset.schemaVersion, 16);
  assert.equal(JSON.stringify(preset), before);
});
