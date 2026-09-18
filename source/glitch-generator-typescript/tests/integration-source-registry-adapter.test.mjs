import assert from 'node:assert/strict';
import test from 'node:test';

import {
  CORE_MAPPING_SOURCE_IDS,
  RUNTIME_SOURCE_IDS,
  adaptUnifiedMusicFrameToSources,
  buildUnifiedMusicFrame,
  validatePreset
} from '../dist/index.js';

const availableMeta = (sourceProvider, confidence = 0.9) => ({
  sourceProvider,
  providerDetail: {
    engineId: `${sourceProvider}-fixture`,
    providerVersion: 'fixture-v1'
  },
  confidence,
  available: true,
  ageMs: 4,
  fallbackReason: null
});

test('III-3 maps numeric channels plus confidence and harmony adapters to 27 stable sources', () => {
  const frame = buildUnifiedMusicFrame({
    clock: { frameIndex: 1, nowMs: 16, deltaMs: 16 },
    continuous: {
      bass: 0.72,
      chordConfidence: 0.83
    },
    states: {
      silence: 1,
      inClimax: 1
    },
    events: {
      onset: {
        eventId: 'onset:1',
        strength: 0.91,
        engineTimeMs: 16,
        mediaTimeMs: 16,
        epoch: 0
      },
      bassPeak: null
    },
    labels: {
      sectionId: 'chorus:1',
      sectionLabel: 'chorus',
      chord: 'C#m7'
    },
    meta: {
      bass: availableMeta('realtime.core'),
      chordConfidence: availableMeta('xld.harmony', 0.83),
      silence: availableMeta('realtime.core'),
      inClimax: availableMeta('xld.songformer'),
      onset: availableMeta('realtime.core'),
      bassPeak: availableMeta('realtime.core'),
      sectionId: availableMeta('xld.songformer'),
      sectionLabel: availableMeta('xld.songformer'),
      chord: availableMeta('xld.harmony')
    }
  });
  const before = JSON.stringify(frame);
  const sources = adaptUnifiedMusicFrameToSources(frame);

  assert.equal(JSON.stringify(frame), before);
  assert.equal(sources.contract, 'xin.glitch-source-frame/1');
  assert.equal(sources.registryVersion, '3.3.0-shadow');
  assert.equal(sources.sourceCount, 27);
  assert.equal(Object.keys(sources.values).length, 27);
  assert.equal(Object.keys(sources.meta).length, 27);
  assert.deepEqual(
    new Set(RUNTIME_SOURCE_IDS),
    new Set(CORE_MAPPING_SOURCE_IDS)
  );
  assert.equal(sources.values['audio.bass'], 0.72);
  assert.equal(sources.values['audio.chordConfidence'], 0.83);
  assert.equal(sources.values['state.silence'], 1);
  assert.equal(sources.values['state.inClimax'], 1);
  assert.equal(sources.values['event.onset'], 0.91);
  assert.equal(sources.values['event.bassPeak'], 0);
  assert.equal(sources.values['confidence.sectionBoundary'], 0);
  assert.equal(sources.values['confidence.chord'], 0.9);
  assert.equal(sources.values['confidence.climax'], 0.9);
  assert.equal(sources.values['harmony.chordHue'], 1 / 12);
  assert.equal(sources.meta['event.onset'].active, true);
  assert.equal(sources.meta['event.bassPeak'].active, false);
  assert.equal(
    sources.meta['audio.bass'].sourceProvider,
    'realtime.core'
  );
  assert.equal(
    sources.meta['audio.chordConfidence'].confidence,
    0.83
  );
  assert.equal(
    sources.meta['confidence.chord'].adapter,
    'meta-confidence'
  );
  assert.equal(
    sources.meta['harmony.chordHue'].adapter,
    'harmony-chord-hue'
  );
  assert.deepEqual(
    sources.excludedLabels,
    ['sectionId', 'sectionLabel', 'chord']
  );
  assert.equal('label.chord' in sources.values, false);
  assert.equal(
    Object.values(sources.values).some(value => typeof value !== 'number'),
    false
  );
});

test('III-3 unavailable and missing features resolve to neutral with provenance', () => {
  const frame = buildUnifiedMusicFrame({
    continuous: { treble: 0.94 },
    meta: {
      treble: {
        sourceProvider: 'neutral',
        providerDetail: {
          engineId: 'resolver',
          providerVersion: 'fixture-v1'
        },
        confidence: null,
        available: false,
        ageMs: 500,
        fallbackReason: 'REALTIME_STALE'
      }
    }
  });
  const sources = adaptUnifiedMusicFrameToSources(frame);

  assert.equal(sources.values['audio.treble'], 0);
  assert.equal(sources.meta['audio.treble'].available, false);
  assert.equal(
    sources.meta['audio.treble'].fallbackReason,
    'REALTIME_STALE'
  );
  assert.equal(sources.values['audio.loudness'], 0);
  assert.equal(sources.meta['audio.loudness'].available, false);
  assert.equal(
    sources.meta['audio.loudness'].fallbackReason,
    'NO_SOURCE'
  );
  assert.equal(sources.values['confidence.chord'], 0);
  assert.equal(sources.meta['confidence.chord'].available, false);
  assert.equal(sources.values['harmony.chordHue'], 0);
  assert.equal(sources.meta['harmony.chordHue'].available, false);
});

test('III-3 preset validation accepts adapter sources and rejects raw labels', () => {
  const valid = validatePreset({
    mappings: [
      {
        id: 'chord-confidence',
        sourceId: 'audio.chordConfidence',
        targetId: 'color.saturation'
      },
      {
        id: 'silence-state',
        sourceId: 'state.silence',
        targetId: 'feedback.retention'
      },
      {
        id: 'harmony-adapter',
        sourceId: 'harmony.chordHue',
        targetId: 'color.saturation',
        gateSourceId: 'confidence.chord',
        gateThreshold: 0.6
      },
      {
        id: 'chord-event',
        kind: 'event',
        sourceId: 'event.chordChange',
        targetId: 'rgbSplit.distance',
        envelopeId: 'event-envelope'
      }
    ],
    envelopes: [{ id: 'event-envelope' }]
  });
  assert.equal(valid.valid, true);

  const invalid = validatePreset({
    mappings: [{
      id: 'forbidden-label',
      sourceId: 'label.chord',
      targetId: 'color.saturation'
    }]
  });
  assert.equal(invalid.valid, false);
  assert.ok(invalid.issues.some(
    issue =>
      issue.code === 'UNKNOWN_SOURCE' &&
      issue.path === 'mappings[0].sourceId'
  ));
});
