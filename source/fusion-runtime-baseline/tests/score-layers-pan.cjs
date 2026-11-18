'use strict';
// A score-layers result with stem levels but no left/right difference is prepared once more; a version 2 result, or one
// without levels, is not (desktop/score-layers-state.cjs).
const test = require('node:test');
const assert = require('node:assert/strict');
const {layersState, owed} = require('../desktop/score-layers-state.cjs');

const stems = {ok: true, runId: 'r1'};
const base = extra => ({kind: 'score-layers', source: {stemRunId: 'r1'}, ...extra});

test('levels without pan are stale once; with pan (even empty) or without levels they are current', () => {
  const levels = {hop: 1, groups: {guitar: [-20]}};
  assert.equal(layersState(base({levels}), stems), 'stale', 'no identity, levels, no pan: prepared once more');
  assert.equal(owed(layersState(base({levels}), stems), 'ready'), 'layers');
  assert.equal(layersState(base({levels: {...levels, pan: {hop: 1, groups: {}, mix: null}}}), stems), 'current', 'version 2 with nothing to measure: no loop');
  assert.equal(layersState(base({levels: {...levels, pan: {hop: 1, groups: {}, mix: [0, 1]}}, identity: {version: 2, weights: {beat: null}}}), stems), 'current');
  assert.equal(layersState(base({levels: null, missing: {levels: 'no stems'}}), stems), 'current', 'no levels measured: left alone');
  assert.equal(layersState(base({}), stems), 'current', 'an earlier result without a levels layer stays current');
  assert.equal(layersState(base({levels}), {ok: true, runId: 'r2'}), 'stale', 'other stems: stale as before');
});
