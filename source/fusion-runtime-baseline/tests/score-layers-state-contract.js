'use strict';
// The rules under preparing the score layers that the B2 acceptance found untested:
//   - desktop/score-layers-state.cjs: stemsStatus, layersState, owed (XLD's "current" rule);
//   - when the score starts a preparation (Prepare.starts: only while it is the scene on screen, M1)
//     and that it looks again when the user switches to it;
//   - a song prepared or given up on for one stem run is looked at again for a new one (L2);
//   - unreadable stems are not called "not analysed" (L4);
//   - every model of a lane's group in its tooltip (L5);
//   - the status line and the help line are not shown together (L6).
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const State = require('../desktop/score-layers-state.cjs');
const Prepare = require('../score-prepare.js');
require('../score-scene.js');
const Scene = globalThis.XinScoreScene;
const settle = () => new Promise(resolve => setImmediate(resolve));

(async () => {
  // --- stems: ready / missing (XLD's own 'stems-missing') / unreadable --------------------------
  assert.equal(State.stemsStatus({ok: true, runId: 'r1'}), 'ready');
  assert.equal(State.stemsStatus({ok: false, error: 'stems-missing', stems: []}), 'missing');
  assert.equal(State.stemsStatus({ok: false, error: 'stems-invalid'}), 'unreadable', 'a damaged stems.json is not "no stems"');
  assert.equal(State.stemsStatus({ok: false, error: 'EACCES: permission denied'}), 'unreadable');
  assert.equal(State.stemsStatus(null), 'unreadable', 'a read that threw');

  // --- layersState: XLD's rule, source.stemRunId equals the current stem run ---------------------
  const layers = stemRunId => ({kind: 'score-layers', source: {stemRunId}});
  assert.equal(State.layersState(null, {ok: true, runId: 'r1'}), 'missing');
  assert.equal(State.layersState({kind: 'score-vocals'}, {ok: true, runId: 'r1'}), 'missing', 'another kind of result is not layers');
  assert.equal(State.layersState(layers('r1'), {ok: true, runId: 'r1'}), 'current');
  assert.equal(State.layersState(layers('r1'), {ok: true, runId: 'r2'}), 'stale', 'new stems since');
  assert.equal(State.layersState({kind: 'score-layers', source: {}}, {ok: true, runId: 'r1'}), 'stale', 'made before results recorded their stem run');
  assert.equal(State.layersState({kind: 'score-layers'}, {ok: true, runId: 'r1'}), 'stale');
  assert.equal(State.layersState({kind: 'score-layers', source: {}}, {ok: true}), 'current', 'neither side knows a run: as XLD (null === null)');
  assert.equal(State.layersState(layers('r1'), {ok: false, error: 'stems-missing'}), 'stale');

  // --- owed: what the song still needs ----------------------------------------------------------
  assert.equal(State.owed('current', 'ready'), null);
  assert.equal(State.owed('missing', 'ready'), 'layers');
  assert.equal(State.owed('stale', 'ready'), 'layers');
  assert.equal(State.owed('missing', 'missing'), 'no-stems');
  assert.equal(State.owed('current', 'missing'), 'no-stems', 'without stems nothing can be run, whatever the layers say');
  assert.equal(State.owed('missing', 'unreadable'), 'stems-unreadable');

  // --- plan: unreadable stems are their own case (L4) -------------------------------------------
  assert.equal(Prepare.plan({layers: {owed: 'stems-unreadable'}}, true), 'stems-unreadable');
  assert.equal(Prepare.plan({layers: {owed: 'no-stems'}}, true), 'no-stems');

  // --- when the score starts a preparation (M1) -------------------------------------------------
  assert.equal(Prepare.starts({active: false, ready: true, plan: 'run'}), false, 'another scene is on screen: nothing starts');
  assert.equal(Prepare.starts({active: true, ready: true, plan: 'run'}), true, 'the score is on screen: it starts');
  assert.equal(Prepare.starts({active: true, ready: false, plan: 'run'}), false, 'the song is not shown yet');
  for (const plan of ['none', 'manual', 'no-stems', 'stems-unreadable', 'unknown']) {
    assert.equal(Prepare.starts({active: true, ready: true, plan}), false, `plan ${plan}: nothing starts`);
  }

  // --- the scene's wiring for M1 and L6 ---------------------------------------------------------
  const scene = fs.readFileSync(path.join(root, 'score-scene.js'), 'utf8');
  const consider = scene.slice(scene.indexOf('function consider()'), scene.indexOf('const autoInput'));
  assert.match(consider, /if \(!active\(\)\) return;/, 'consider() does nothing while another scene is on screen');
  assert.match(consider, /Prepare\.starts\(\{active: active\(\), ready: status === 'ready', plan: prepPlan\}\)\) prepare\.auto\(trackId, layers \? layers\.stemRunId : null\)/);
  const wake = scene.slice(scene.indexOf('let wasActive = false;'), scene.indexOf('function showCover'));
  assert.match(wake, /if \(now && !wasActive && trackId && status === 'ready'\) consider\(\);/, 'switching to the score looks at the loaded song');
  // load() still calls consider() (it starts only when active, see above): the song shown in the score.
  const load = scene.slice(scene.indexOf('async function load(id)'), scene.indexOf('function reset()'));
  assert.match(load, /consider\(\);/);
  // L6: the status line waits while the help line is up.
  assert.match(scene, /const prep = held \|\| hinting \? null : prepText\(\);/);
  // The other caller of load(): fusion.js accepts a song in any scene; it must not start anything itself.
  const fusion = fs.readFileSync(path.join(root, 'fusion.js'), 'utf8');
  assert.equal(/prepare\.auto\(/.test(fusion), false, 'fusion.js never starts an automatic preparation');

  // --- L2: a new stem run is a new job ----------------------------------------------------------
  {
    const runs = [];
    const pending = new Map();
    const queue = Prepare.create({run: id => { runs.push(id); return new Promise(resolve => pending.set(id, resolve)); },
                                  setTimeout: () => 0, clearTimeout: () => {}});
    assert.equal(queue.auto('A', 'r1'), true);
    pending.get('A')({ok: true});
    await settle();
    assert.equal(queue.phase('A'), 'done');
    assert.equal(queue.auto('A', 'r1'), false, 'prepared for these stems: not again');
    assert.equal(queue.auto('A', 'r2'), true, 'new stems in XLD: looked at again');
    assert.deepEqual(runs, ['A', 'A']);
    pending.get('A')({ok: false, error: 'x'});
    await settle();
    assert.equal(queue.phase('A'), 'retrying', 'the new job has its own automatic retry');
    // Given up on for one run: not again for that run, again for the next.
    const failing = Prepare.create({run: () => ({ok: false, error: 'boom'}), setTimeout: fn => { fn(); return 0; }, clearTimeout: () => {}});
    failing.auto('B', 'r1');
    await settle(); await settle(); await settle();
    assert.equal(failing.phase('B'), 'failed');
    assert.equal(failing.auto('B', 'r1'), false);
    assert.equal(failing.auto('B', 'r2'), true);
  }

  // --- survey counts unreadable stems with the unreadable rows ---------------------------------
  {
    const surveyed = await Prepare.survey(async ids => ({ok: true, rows: ids.map(id => ({trackId: id, ok: true,
      owed: id === 'u' ? 'stems-unreadable' : id === 'n' ? 'no-stems' : id === 'c' ? null : 'layers'}))}), ['u', 'n', 'c', 'm']);
    assert.deepEqual(surveyed.owed, ['m']);
    assert.deepEqual(surveyed.counts, {asked: 4, ready: 1, notAnalysed: 1, unreadable: 1});
  }

  // --- L5: every model of the lane's group --------------------------------------------------------
  {
    const lanes = [
      {id: 'strings/0', group: 'strings', meta: {engine: 'strings-muscriptor-large', engineName: 'MuScriptor Large'}},
      {id: 'strings/1', group: 'strings', meta: {engine: 'manual-revision', engineName: '人工修订'}},
      {id: 'strings/2', group: 'strings', meta: {engine: 'strings-muscriptor-large', engineName: 'MuScriptor Large'}},
      {id: 'piano', group: 'piano', meta: {engine: 'piano-transkun', engineName: 'Transkun V2'}},
      {id: 'drums', group: 'drums', meta: {engine: 'drums-adtof'}},
      {id: 'texture', group: 'other', kind: 'texture'}
    ];
    assert.deepEqual(Scene.laneModels(lanes, {id: 'strings', group: 'strings'}), ['MuScriptor Large', '人工修订'], 'a merged lane lists both');
    assert.deepEqual(Scene.laneModels(lanes, {id: 'strings/1', group: 'strings'}), ['MuScriptor Large', '人工修订']);
    assert.deepEqual(Scene.laneModels(lanes, {id: 'piano', group: 'piano'}), ['Transkun V2']);
    assert.deepEqual(Scene.laneModels(lanes, {id: 'drums', group: 'drums'}), ['drums-adtof'], 'no display name: the engine id');
    assert.deepEqual(Scene.laneModels(lanes, {id: 'texture', group: 'other', texture: true}), [], 'the texture lane has no notes');
    assert.deepEqual(Scene.laneModels(null, {id: 'piano', group: 'piano'}), []);
  }

  console.log('score layers state contract ok');
})().catch(error => { console.error(error); process.exitCode = 1; });
