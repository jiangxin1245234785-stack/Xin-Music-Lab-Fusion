import assert from 'node:assert/strict';
import test from 'node:test';

import {
  CURRENT_SCHEMA_VERSION,
  VISUAL_TARGETS,
  captureSnapshot,
  createValidationBuffer,
  deserializePreset,
  loadPresetFromStorage,
  restoreSnapshot,
  runOfflineDeterministicSession,
  savePresetToStorage
} from '../dist/index.js';

class MemoryStorage {
  values = new Map();

  getItem(key) {
    return this.values.get(key) ?? null;
  }

  setItem(key, value) {
    this.values.set(key, value);
  }
}

const preset = {
  schemaVersion: 3,
  name: 'Persistence fixture',
  seed: 771,
  mappings: [
    {
      id: 'bass-to-zoom',
      sourceId: 'audio.bass',
      targetId: VISUAL_TARGETS.feedbackZoom,
      range: [0.9, 1.2],
      attackMs: 80,
      fallMs: 260
    },
    {
      id: 'bass-event',
      kind: 'event',
      sourceId: 'event.bassPeak',
      targetId: VISUAL_TARGETS.blockDisplacementX,
      envelopeId: 'impact',
      range: [0, 1],
      threshold: 0.1
    }
  ],
  envelopes: [{
    id: 'impact',
    attackMs: 0,
    holdMs: 40,
    decayMs: 80,
    sustain: 0.3,
    releaseMs: 160,
    cooldownMs: 240,
    retriggerMode: 'restart'
  }],
  targetDefaults: {
    values: {
      [VISUAL_TARGETS.feedbackZoom]: 1,
      [VISUAL_TARGETS.blockDisplacementX]: 0,
      [VISUAL_TARGETS.colorBrightness]: 0.7
    }
  }
};

test('Snapshot capture and restore make isolated deep resolved copies', () => {
  const targetState = {
    values: {
      [VISUAL_TARGETS.feedbackZoom]: 1.17
    }
  };
  const snapshot = captureSnapshot({
    id: 'snapshot-1',
    name: 'Frame A',
    engineTimeMs: 1200,
    note: 'Quiet bridge',
    thumbnail: 'data:image/webp;base64,fixture',
    preset,
    targetState
  });
  targetState.values[VISUAL_TARGETS.feedbackZoom] = 0.5;

  const restored = restoreSnapshot(snapshot);
  assert.equal(restored.id, 'snapshot-1');
  assert.equal(restored.engineTimeMs, 1200);
  assert.equal(restored.schemaVersion, CURRENT_SCHEMA_VERSION);
  assert.equal(restored.note, 'Quiet bridge');
  assert.equal(restored.thumbnail, 'data:image/webp;base64,fixture');
  assert.equal(restored.preset.schemaVersion, CURRENT_SCHEMA_VERSION);
  assert.equal(restored.targetState.values[VISUAL_TARGETS.feedbackZoom], 1.17);
  assert.notStrictEqual(restored.targetState, snapshot.targetState);
  assert.notStrictEqual(restored.preset, snapshot.preset);
});

test('Preset Save/Load always traverses migration and rejects invalid storage', () => {
  const storage = new MemoryStorage();
  const saved = savePresetToStorage(storage, preset);
  const loaded = loadPresetFromStorage(storage);

  assert.equal(saved.schemaVersion, CURRENT_SCHEMA_VERSION);
  assert.equal(loaded.schemaVersion, CURRENT_SCHEMA_VERSION);
  assert.equal(loaded.name, 'Persistence fixture');
  assert.equal(loaded.mappings[1].kind, 'event');
  assert.throws(
    () => deserializePreset('{broken'),
    /invalid JSON/
  );
  assert.throws(
    () => loadPresetFromStorage(new MemoryStorage()),
    /No saved preset/
  );
});

test('saved and reloaded preset reproduces every offline target frame', () => {
  const storage = new MemoryStorage();
  const saved = savePresetToStorage(storage, preset);
  const reloaded = loadPresetFromStorage(storage);
  const buffer = createValidationBuffer();
  const first = runOfflineDeterministicSession({
    buffer,
    preset: saved,
    sessionSeed: 19
  });
  const second = runOfflineDeterministicSession({
    buffer,
    preset: reloaded,
    sessionSeed: 19
  });

  assert.equal(second.length, first.length);
  for (let index = 0; index < first.length; index++) {
    assert.deepEqual(second[index].targets.values, first[index].targets.values);
    assert.equal(second[index].randomSample, first[index].randomSample);
  }
});
