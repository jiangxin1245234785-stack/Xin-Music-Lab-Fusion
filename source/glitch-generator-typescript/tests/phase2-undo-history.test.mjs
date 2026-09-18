import assert from 'node:assert/strict';
import test from 'node:test';

import {
  PRESET_DEFAULTS,
  UndoHistory,
  createValidationBuffer,
  runOfflineDeterministicSession
} from '../dist/index.js';

const clone = state => structuredClone(state);
const offlineTimeline = runOfflineDeterministicSession({
  buffer: createValidationBuffer(),
  preset: PRESET_DEFAULTS,
  sessionSeed: 210
});

function createHistory() {
  return new UndoHistory({
    clone,
    limit: 20
  });
}

test('one continuous slider gesture creates exactly one undo transaction', () => {
  const history = createHistory();
  const start = { intensity: 0.2 };

  history.beginContinuous(
    'macro.intensity',
    'Change intensity macro',
    start,
    offlineTimeline[1].clock.nowMs
  );
  // Intermediate drag values intentionally do not enter history.
  const end = { intensity: 1.4 };
  const transaction = history.commitContinuous(end);

  assert.equal(transaction.kind, 'continuous');
  assert.equal(transaction.engineTimeMs, offlineTimeline[1].clock.nowMs);
  assert.deepEqual(history.undo().state, start);
  assert.equal(history.undo(), null);
  assert.deepEqual(history.redo().state, end);
});

test('discrete edits undo one operation at a time and a new edit clears redo', () => {
  const history = createHistory();
  const initial = { mappings: ['a'] };
  const added = { mappings: ['a', 'b'] };
  const duplicated = { mappings: ['a', 'b', 'b-copy'] };

  history.recordDiscrete(
    'Add mapping',
    initial,
    added,
    offlineTimeline[2].clock.nowMs
  );
  history.recordDiscrete(
    'Duplicate mapping',
    added,
    duplicated,
    offlineTimeline[3].clock.nowMs
  );

  assert.deepEqual(history.undo().state, added);
  assert.deepEqual(history.undo().state, initial);
  assert.deepEqual(history.redo().state, added);

  const renamed = { mappings: ['renamed', 'b'] };
  history.recordDiscrete(
    'Rename mapping',
    added,
    renamed,
    offlineTimeline[4].clock.nowMs
  );
  assert.equal(history.canRedo, false);
  assert.deepEqual(history.undo().state, added);
});

test('snapshot restore is a special transaction and remains undoable', () => {
  const history = createHistory();
  const before = { preset: 'working', intensity: 0.85 };
  const restored = { preset: 'snapshot-a', intensity: 0.35 };

  const transaction = history.recordDiscrete(
    'Restore snapshot',
    before,
    restored,
    offlineTimeline[5].clock.nowMs,
    'snapshot-restore'
  );

  assert.equal(transaction.kind, 'snapshot-restore');
  assert.deepEqual(history.undo().state, before);
  assert.deepEqual(history.redo().state, restored);
});
