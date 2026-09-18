import assert from 'node:assert/strict';
import test from 'node:test';

import {
  PRESET_DEFAULTS,
  SnapshotStack,
  UndoHistory,
  VISUAL_TARGETS,
  createValidationBuffer,
  loadCustomPresetsFromStorage,
  runOfflineDeterministicSession,
  saveCustomPresetToStorage
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

const offlineTimeline = runOfflineDeterministicSession({
  buffer: createValidationBuffer(),
  preset: PRESET_DEFAULTS,
  sessionSeed: 221
});

function captureFixture(stack, index, name) {
  return stack.capture({
    name,
    note: `note-${index}`,
    thumbnail: `data:image/webp;base64,fixture-${index}`,
    engineTimeMs: offlineTimeline[index].clock.nowMs,
    preset: {
      ...PRESET_DEFAULTS,
      name: `${name} preset`
    },
    targetState: {
      values: {
        [VISUAL_TARGETS.feedbackZoom]: 1 + index / 100
      }
    }
  });
}

test('Snapshot Stack captures multiple isolated session snapshots and restores any one', () => {
  const stack = new SnapshotStack();
  const first = captureFixture(stack, 1, 'First');
  const second = captureFixture(stack, 2, 'Second');
  const third = captureFixture(stack, 3, 'Third');

  assert.equal(stack.size, 3);
  assert.deepEqual(
    stack.list().map(snapshot => snapshot.id),
    ['snapshot-1', 'snapshot-2', 'snapshot-3']
  );
  assert.equal(stack.latest().id, third.id);
  assert.equal(stack.restore(first.id).name, 'First');
  assert.equal(stack.restore(second.id).note, 'note-2');

  const listed = stack.list();
  listed[0].targetState.values[VISUAL_TARGETS.feedbackZoom] = 9;
  assert.equal(
    stack.restore(first.id).targetState.values[VISUAL_TARGETS.feedbackZoom],
    1.01
  );
});

test('Snapshot Stack deletion and promotion keep snapshots separate from preset storage', () => {
  const stack = new SnapshotStack();
  const storage = new MemoryStorage();
  const first = captureFixture(stack, 4, 'Promote me');
  const second = captureFixture(stack, 5, 'Delete me');

  assert.equal(stack.delete(second.id), true);
  assert.equal(stack.delete('missing'), false);
  assert.equal(stack.size, 1);

  const promoted = stack.promoteToPreset(first.id, {
    id: 'custom-promoted',
    name: 'Promoted preset'
  });
  const saved = saveCustomPresetToStorage(storage, promoted);
  const library = loadCustomPresetsFromStorage(storage);

  assert.equal(stack.size, 1);
  assert.equal(saved.id, 'custom-promoted');
  assert.equal(library.length, 1);
  assert.equal(library[0].name, 'Promoted preset');
  assert.equal(library[0].metadata.sourceSnapshotId, first.id);
  assert.deepEqual(library[0].targetDefaults, first.targetState);

  saveCustomPresetToStorage(storage, {
    ...saved,
    name: 'Promoted preset updated'
  });
  assert.equal(loadCustomPresetsFromStorage(storage).length, 1);
  assert.equal(
    loadCustomPresetsFromStorage(storage)[0].name,
    'Promoted preset updated'
  );
});

test('restoring a stack snapshot records one undoable snapshot-restore transaction', () => {
  const stack = new SnapshotStack();
  const snapshot = captureFixture(stack, 6, 'Undo target');
  const before = {
    presetName: 'Working state',
    zoom: 0.96
  };
  const restoredSnapshot = stack.restore(snapshot.id);
  const after = {
    presetName: restoredSnapshot.preset.name,
    zoom: restoredSnapshot.targetState.values[VISUAL_TARGETS.feedbackZoom]
  };
  const history = new UndoHistory({
    clone: state => structuredClone(state)
  });

  const transaction = history.recordDiscrete(
    'Restore snapshot',
    before,
    after,
    offlineTimeline[6].clock.nowMs,
    'snapshot-restore'
  );

  assert.equal(transaction.kind, 'snapshot-restore');
  assert.deepEqual(history.undo().state, before);
  assert.deepEqual(history.redo().state, after);
});
