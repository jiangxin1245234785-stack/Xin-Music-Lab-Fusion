import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

import {
  UnifiedMusicFrameValidationError,
  buildUnifiedMusicFrame,
  validateUnifiedMusicFrame
} from '../dist/index.js';

function fixture(name) {
  return JSON.parse(readFileSync(
    new URL(`./fixtures/integration/${name}`, import.meta.url),
    'utf8'
  ));
}

function issueAt(report, path, code) {
  return report.issues.find(issue =>
    issue.path === path && issue.code === code
  );
}

test('I-3 builds a complete deterministic frame from the XLD provider fixture', () => {
  const input = fixture('xld-provider-fragment.json');
  const original = structuredClone(input);
  const first = buildUnifiedMusicFrame(input);
  const second = buildUnifiedMusicFrame(input);

  assert.deepEqual(first, second);
  assert.deepEqual(input, original);
  assert.equal(validateUnifiedMusicFrame(first).valid, true);
  assert.equal(first.labels.chord, 'C#m7');
  assert.equal(first.events.sectionBoundary.epoch, 2);
  assert.equal(first.meta.sectionBoundary.sourceProvider, 'xld.songformer');
  assert.equal(first.continuous.loudness, 0);
  assert.deepEqual(first.meta.loudness, {
    sourceProvider: 'neutral',
    providerDetail: { engineId: '', providerVersion: '' },
    confidence: null,
    available: false,
    ageMs: 0,
    fallbackReason: 'NO_SOURCE'
  });
});

test('I-3 builds an isolated realtime frame without inventing labels', () => {
  const input = fixture('realtime-provider-fragment.json');
  const first = buildUnifiedMusicFrame(input);
  const second = buildUnifiedMusicFrame(input);

  assert.equal(first.continuous.loudness, 0.64);
  assert.equal(first.events.onset.eventId, 'external:onset:0:18');
  assert.equal(first.labels.sectionId, null);
  assert.equal(first.labels.chord, null);
  assert.notStrictEqual(first, second);
  assert.notStrictEqual(first.meta, second.meta);
  assert.notStrictEqual(first.meta.loudness, second.meta.loudness);
  assert.notStrictEqual(
    first.meta.loudness.providerDetail,
    second.meta.loudness.providerDetail
  );
});

test('I-3 partial validation rejects unknown fields before resolution', () => {
  const report = validateUnifiedMusicFrame({
    continuous: {
      loudness: 0.5,
      madeUpFeature: 1
    }
  }, 'partial');

  assert.equal(report.valid, false);
  assert.ok(issueAt(
    report,
    'continuous.madeUpFeature',
    'UNKNOWN_FIELD'
  ));
  assert.throws(
    () => buildUnifiedMusicFrame({
      continuous: {
        loudness: 0.5,
        madeUpFeature: 1
      }
    }),
    UnifiedMusicFrameValidationError
  );
});

test('I-3 reports unsupported contract version at the exact path', () => {
  const report = validateUnifiedMusicFrame({
    contractVersion: 2
  }, 'partial');

  assert.equal(report.valid, false);
  assert.ok(issueAt(
    report,
    'frame.contractVersion',
    'CONTRACT_VERSION_UNSUPPORTED'
  ));
});

test('I-3 reports an unknown provider at its feature metadata path', () => {
  const report = validateUnifiedMusicFrame({
    meta: {
      loudness: {
        sourceProvider: 'xld'
      }
    }
  }, 'partial');

  assert.equal(report.valid, false);
  assert.ok(issueAt(
    report,
    'meta.loudness.sourceProvider',
    'INVALID_ENUM'
  ));
});

test('I-3 reports non-finite feature values without coercion', () => {
  const report = validateUnifiedMusicFrame({
    continuous: {
      loudness: Number.NaN
    }
  }, 'partial');

  assert.equal(report.valid, false);
  assert.ok(issueAt(
    report,
    'continuous.loudness',
    'NON_FINITE_NUMBER'
  ));
});

test('I-3 reports an invalid event id at the exact path', () => {
  const report = validateUnifiedMusicFrame({
    events: {
      onset: {
        eventId: '',
        strength: 0.8,
        engineTimeMs: 100,
        mediaTimeMs: null,
        epoch: 0
      }
    }
  }, 'partial');

  assert.equal(report.valid, false);
  assert.ok(issueAt(
    report,
    'events.onset.eventId',
    'EMPTY_EVENT_ID'
  ));
});

test('I-3 resolved validation reports missing per-feature metadata', () => {
  const frame = structuredClone(buildUnifiedMusicFrame());
  delete frame.meta.loudness;
  const report = validateUnifiedMusicFrame(frame);

  assert.equal(report.valid, false);
  assert.ok(issueAt(report, 'meta.loudness', 'MISSING_FIELD'));
});
