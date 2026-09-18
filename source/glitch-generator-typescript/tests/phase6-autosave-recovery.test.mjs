import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

import {
  AutosaveRecoveryManager,
  SnapshotStack
} from '../dist/index.js';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

class MemoryStorage {
  values = new Map();

  getItem(key) {
    return this.values.get(key) ?? null;
  }

  setItem(key, value) {
    this.values.set(key, String(value));
  }

  removeItem(key) {
    this.values.delete(key);
  }
}

function cloneState(state) {
  return {
    name: String(state.name),
    amount: Number(state.amount)
  };
}

function parseState(input) {
  if (typeof input !== 'object' || input === null) {
    throw new Error('state must be an object');
  }
  return cloneState(input);
}

function manager(storage, autosaveIntervalMs = 1000) {
  return new AutosaveRecoveryManager({
    storage,
    parseState,
    cloneState,
    autosaveIntervalMs
  });
}

test('simulated crash recovers the latest deterministic autosave', () => {
  const storage = new MemoryStorage();
  const crashed = manager(storage);
  assert.equal(crashed.startSession().candidate, null);
  crashed.forceAutosave({ name: 'first', amount: 0.2 }, 1000);
  crashed.forceAutosave({ name: 'latest', amount: 0.8 }, 2400);
  // Intentionally omit markClean(): this is the simulated crash.

  const restarted = manager(storage);
  const startup = restarted.startSession();
  assert.equal(startup.candidate.engineTimeMs, 2400);
  assert.deepEqual(
    restarted.recoverCandidate(),
    { name: 'latest', amount: 0.8 }
  );
  assert.equal(restarted.hasPendingRecovery, false);

  const saved = restarted.forceAutosave(
    { name: 'recovered', amount: 0.9 },
    2500
  );
  assert.equal(saved.sessionSequence, startup.sessionSequence);
  assert.equal(saved.autosaveSequence, 0);
});

test('clean shutdown does not produce a recovery candidate', () => {
  const storage = new MemoryStorage();
  const first = manager(storage);
  first.startSession();
  first.forceAutosave({ name: 'clean', amount: 0.4 }, 900);
  first.markClean();

  const second = manager(storage);
  assert.equal(second.startSession().candidate, null);
});

test('pending recovery is never overwritten before restore or discard', () => {
  const storage = new MemoryStorage();
  const first = manager(storage);
  first.startSession();
  first.forceAutosave({ name: 'crash', amount: 0.7 }, 1800);

  const second = manager(storage);
  second.startSession();
  assert.equal(
    second.forceAutosave({ name: 'new', amount: 0.1 }, 0),
    null
  );
  second.discardCandidate();
  assert.equal(
    second.forceAutosave({ name: 'new', amount: 0.1 }, 0).state.name,
    'new'
  );
});

test('autosave cadence uses engine time and handles clock rewind', () => {
  const storage = new MemoryStorage();
  const recovery = manager(storage, 1000);
  recovery.startSession();
  assert.equal(
    recovery.maybeAutosave({ name: 'zero', amount: 0 }, 0).engineTimeMs,
    0
  );
  assert.equal(
    recovery.maybeAutosave({ name: 'early', amount: 0.1 }, 999),
    null
  );
  assert.equal(
    recovery.maybeAutosave({ name: 'due', amount: 0.2 }, 1000).state.name,
    'due'
  );
  assert.equal(
    recovery.maybeAutosave({ name: 'rewind', amount: 0.3 }, 20),
    null
  );
  assert.equal(
    recovery.maybeAutosave({ name: 'rewind-due', amount: 0.4 }, 1020)
      .state.name,
    'rewind-due'
  );
});

test('invalid recovery payload is ignored without blocking startup', () => {
  const storage = new MemoryStorage();
  storage.setItem(
    'gmg.recovery.session.v1',
    JSON.stringify({
      formatVersion: 1,
      sessionSequence: 4,
      status: 'open'
    })
  );
  storage.setItem('gmg.recovery.autosave.v1', '{broken');

  const startup = manager(storage).startSession();
  assert.equal(startup.candidate, null);
  assert.match(startup.warning, /invalid autosave/i);
});

test('SnapshotStack restores entries and advances generated ids', () => {
  const source = new SnapshotStack();
  source.capture({
    id: 'snapshot-7',
    name: 'Recovered snapshot',
    engineTimeMs: 640,
    preset: {},
    targetState: {}
  });
  const restored = new SnapshotStack();
  restored.replaceAll(source.list());
  const next = restored.capture({
    preset: {},
    targetState: {}
  });
  assert.equal(restored.size, 2);
  assert.equal(next.id, 'snapshot-8');
});

test('Advanced UI recovery controls coexist with Phase 6.5 UX', () => {
  const html = readFileSync(path.join(root, 'demo', 'index.html'), 'utf8');
  const runtime = readFileSync(
    path.join(root, 'src', 'ui-debug', 'phase1-demo.ts'),
    'utf8'
  );
  for (const id of [
    'recoveryPanel',
    'recoveryStatus',
    'recoverySummary',
    'recoveryRestoreButton',
    'recoveryDiscardButton',
    'autosaveNowButton'
  ]) {
    assert.match(`${html}\n${runtime}`, new RegExp(id));
  }
  assert.match(html, /Preset Migration \+ Compatibility/i);
});
