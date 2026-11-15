'use strict';
// Preparing the score layers from XML (score-prepare.js, SPEC-B2 A and B), with a stand-in bridge:
// layers there = nothing runs; missing = one automatic run; done = the shown song reloads; another
// song's result is not put on screen; one song never twice at once; one track at a time; a failed
// automatic run is tried once more and then waits for the user; the setting off = no automatic run;
// no stems = only a hint. The batch: only what is passed, skips what is already running, counts,
// can be cancelled.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const Prepare = require('../score-prepare.js');

const root = path.resolve(__dirname, '..');

// A bridge whose runs finish only when the test says so.
function standIn() {
  const calls = [];
  const pending = new Map();
  let cancels = 0;
  return {
    calls, pending,
    get cancels() { return cancels; },
    run(trackId, engine) {
      calls.push([trackId, engine]);
      return new Promise(resolve => pending.set(trackId, resolve));
    },
    finish(trackId, result) {
      const resolve = pending.get(trackId);
      assert.ok(resolve, `no run pending for ${trackId}`);
      pending.delete(trackId);
      resolve(result);
    },
    cancel() { cancels++; }
  };
}
// Timers the test fires by hand.
function clock() {
  const timers = new Map();
  let next = 1;
  return {
    setTimeout(fn, ms) { const id = next++; timers.set(id, {fn, ms}); return id; },
    clearTimeout(id) { timers.delete(id); },
    fireAll() { const due = [...timers.values()]; timers.clear(); due.forEach(timer => timer.fn()); },
    get count() { return timers.size; },
    get delays() { return [...timers.values()].map(timer => timer.ms); }
  };
}
const settle = () => new Promise(resolve => setImmediate(resolve));

(async () => {
  // --- the decision for a song that was just shown -------------------------------------------
  assert.equal(Prepare.plan({layers: {state: 'current', stemsReady: true, owed: null}}, true), 'none', 'layers there: nothing runs');
  assert.equal(Prepare.plan({layers: {state: 'missing', stemsReady: true, owed: 'layers'}}, true), 'run', 'missing: run');
  assert.equal(Prepare.plan({layers: {state: 'stale', stemsReady: true, owed: 'layers'}}, true), 'run', 'not current: run');
  assert.equal(Prepare.plan({layers: {state: 'missing', stemsReady: true, owed: 'layers'}}, false), 'manual', 'setting off: no automatic run');
  assert.equal(Prepare.plan({layers: {state: 'missing', stemsReady: false, owed: 'no-stems'}}, true), 'no-stems', 'no stems: only a hint');
  assert.equal(Prepare.plan({}, true), 'unknown');
  assert.equal(Prepare.plan(null, true), 'unknown');

  // --- missing layers: one automatic run, then the shown song reloads ------------------------
  {
    const bridge = standIn(), timers = clock();
    const queue = Prepare.create({run: bridge.run, setTimeout: timers.setTimeout, clearTimeout: timers.clearTimeout});
    const events = [];
    queue.subscribe(event => events.push(event));
    assert.equal(queue.auto('A'), true);
    assert.deepEqual(bridge.calls, [['A', 'score-layers']], 'the XLD service is asked for score-layers');
    // The same song again while it runs (the user opens it again, the language changes...): not twice.
    assert.equal(queue.auto('A'), false);
    assert.equal(queue.request('A'), false);
    assert.equal(bridge.calls.length, 1, 'one song never runs twice at once');
    bridge.finish('A', {ok: true});
    await settle();
    const done = events.find(event => event.type === 'done');
    assert.equal(done.ok, true);
    assert.equal(Prepare.reloads(done, 'A'), true, 'done for the song on screen: reload');
    assert.equal(queue.phase('A'), 'done');
    // Opened again later in the session: nothing runs (the reloaded model says current anyway).
    assert.equal(queue.auto('A'), false);
    assert.equal(bridge.calls.length, 1);
  }

  // --- another song is opened while one runs: the first finishes, its result is not put on screen,
  //     and the second waits its turn (one at a time) ------------------------------------------
  {
    const bridge = standIn(), timers = clock();
    const queue = Prepare.create({run: bridge.run, setTimeout: timers.setTimeout, clearTimeout: timers.clearTimeout});
    const events = [];
    queue.subscribe(event => events.push(event));
    queue.auto('A');
    queue.forgetWaiting('B');
    queue.auto('B');
    assert.equal(queue.running(), 'A', 'switching songs does not cancel the running one');
    assert.deepEqual(queue.waiting(), ['B']);
    assert.equal(bridge.calls.length, 1, 'only one track at a time');
    bridge.finish('A', {ok: true});
    await settle();
    const doneA = events.find(event => event.type === 'done' && event.trackId === 'A');
    assert.equal(Prepare.reloads(doneA, 'B'), false, "A's result is not put on B's score");
    assert.equal(queue.running(), 'B', 'then B runs');
    bridge.finish('B', {ok: true});
    await settle();
    // Browsing past songs drops their waiting automatic jobs, not the running one.
    queue.auto('C');
    queue.auto('D');
    queue.forgetWaiting('E');
    assert.equal(queue.running(), 'C');
    assert.deepEqual(queue.waiting(), [], 'D (waiting, automatic) is dropped when the user moves on');
    assert.equal(queue.phase('D'), 'idle');
    bridge.finish('C', {ok: true});
    await settle();
  }

  // --- failure: one automatic retry after a pause, then wait for the user ---------------------
  {
    const bridge = standIn(), timers = clock();
    const queue = Prepare.create({run: bridge.run, setTimeout: timers.setTimeout, clearTimeout: timers.clearTimeout, retryMs: 30000});
    queue.auto('A');
    bridge.finish('A', {ok: false, error: 'runtime-missing'});
    await settle();
    assert.equal(queue.phase('A'), 'retrying');
    assert.deepEqual(timers.delays, [30000], 'the retry waits 30 s, it is not immediate');
    assert.equal(bridge.calls.length, 1);
    timers.fireAll();
    assert.equal(bridge.calls.length, 2, 'tried once more');
    bridge.finish('A', {ok: false, error: 'runtime-missing'});
    await settle();
    assert.equal(queue.phase('A'), 'failed', 'after the second failure it waits');
    assert.equal(timers.count, 0, 'no further timer: no retry storm');
    assert.equal(queue.error('A'), 'runtime-missing');
    assert.equal(queue.auto('A'), false, 'opening the song again does not start it again');
    assert.equal(bridge.calls.length, 2);
    // The user's click on the line runs it once more; a failure then just waits again.
    assert.equal(queue.request('A'), true);
    assert.equal(bridge.calls.length, 3);
    bridge.finish('A', {ok: false, error: 'analysis-busy'});
    await settle();
    assert.equal(queue.phase('A'), 'failed');
    assert.equal(timers.count, 0, 'a failed retry by the user is not retried automatically');
    // A throwing bridge counts as a failure, it does not break the queue.
    const throwing = Prepare.create({run: () => { throw new Error('bridge gone'); }, setTimeout: timers.setTimeout, clearTimeout: timers.clearTimeout});
    throwing.request('X');
    await settle();
    assert.equal(throwing.phase('X'), 'failed');
    assert.equal(throwing.error('X'), 'bridge gone');
  }

  // --- the user's retry during the pause starts at once and replaces the timer ----------------
  {
    const bridge = standIn(), timers = clock();
    const queue = Prepare.create({run: bridge.run, setTimeout: timers.setTimeout, clearTimeout: timers.clearTimeout});
    queue.auto('A');
    bridge.finish('A', {ok: false, error: 'x'});
    await settle();
    assert.equal(timers.count, 1);
    queue.request('A');
    assert.equal(timers.count, 0);
    assert.equal(bridge.calls.length, 2);
    bridge.finish('A', {ok: true});
    await settle();
    assert.equal(queue.phase('A'), 'done');
  }

  // --- the batch: only the given tracks, skips what already runs, progress, cancel -------------
  {
    const bridge = standIn(), timers = clock();
    const queue = Prepare.create({run: bridge.run, setTimeout: timers.setTimeout, clearTimeout: timers.clearTimeout, cancelRunning: () => bridge.cancel()});
    queue.auto('A');
    const seen = [];
    const handle = queue.batch(['A', 'B', 'C', 'B'], progress => seen.push(progress));
    assert.equal(handle.status().total, 2, 'A is already running and B is listed twice: two to do');
    bridge.finish('A', {ok: true});
    await settle();
    assert.equal(handle.status().current, 'B');
    bridge.finish('B', {ok: false, error: 'runtime-missing'});
    await settle();
    assert.equal(handle.status().done, 1);
    assert.equal(handle.status().failed, 1);
    assert.equal(queue.phase('B'), 'failed', 'a batch item is not retried automatically');
    assert.equal(timers.count, 0);
    assert.equal(handle.status().current, 'C');
    bridge.finish('C', {ok: true});
    await settle();
    assert.equal(handle.status().done, 2);
    assert.equal(handle.status().finished, true);
    assert.deepEqual(bridge.calls.map(call => call[0]), ['A', 'B', 'C']);
    assert.ok(seen.length >= 3, 'progress was reported');

    // Cancel: the waiting ones are dropped, the running one is asked to stop.
    const second = queue.batch(['D', 'E', 'F'], () => {});
    assert.equal(queue.running(), 'D');
    second.cancel();
    assert.equal(bridge.cancels, 1, 'the running batch item is cancelled');
    assert.deepEqual(queue.waiting(), [], 'E and F never start');
    bridge.finish('D', {ok: false, error: 'analysis-cancelled'});
    await settle();
    assert.equal(second.status().finished, true);
    assert.equal(second.status().cancelled, true);
    assert.equal(bridge.calls.filter(call => ['E', 'F'].includes(call[0])).length, 0);
    // An empty batch finishes at once.
    assert.equal(queue.batch([], () => {}).status().finished, true);
  }

  // --- many songs: only those XLD analysed whose layers are missing or stale -------------------
  {
    const bridge = standIn(), timers = clock();
    const queue = Prepare.create({run: bridge.run, setTimeout: timers.setTimeout, clearTimeout: timers.clearTimeout});
    const asked = [];
    const ask = async ids => {
      asked.push(ids);
      return {ok: true, rows: [
        {trackId: 'has', ok: true, stemsReady: true, state: 'current', owed: null},
        {trackId: 'missing', ok: true, stemsReady: true, state: 'missing', owed: 'layers'},
        {trackId: 'stale', ok: true, stemsReady: true, state: 'stale', owed: 'layers'},
        {trackId: 'raw', ok: true, stemsReady: false, state: 'missing', owed: 'no-stems'},
        {trackId: 'gone', ok: false, error: 'track-missing'}
      ]};
    };
    const reports = [];
    const handle = await Prepare.prepareMany(queue, ask, ['has', 'missing', 'stale', 'raw', 'gone', 'missing'], report => reports.push(report));
    assert.deepEqual(asked, [['has', 'missing', 'stale', 'raw', 'gone']], 'asked once, no duplicates');
    assert.deepEqual(bridge.calls.map(call => call[0]), ['missing'], 'only the owed songs run, one at a time');
    const first = handle.status();
    assert.equal(first.total, 2, 'missing + stale');
    assert.equal(first.ready, 1, 'already there: skipped and counted');
    assert.equal(first.notAnalysed, 1, 'not analysed in XLD: skipped and counted');
    assert.equal(first.unreadable, 1);
    bridge.finish('missing', {ok: true});
    await settle();
    assert.equal(handle.status().current, 'stale');
    assert.equal(reports.at(-1).done, 1, 'progress: one of two');
    bridge.finish('stale', {ok: true});
    await settle();
    assert.equal(handle.status().finished, true);
    assert.equal(handle.status().done, 2);
    assert.deepEqual(bridge.calls.map(call => call[0]), ['missing', 'stale'], "'has' and 'raw' never ran");
    // The state cannot be read: nothing runs, the report says so.
    const broken = await Prepare.prepareMany(queue, async () => ({ok: false, error: 'boom'}), ['x'], () => {});
    assert.equal(broken.status().finished, true);
    assert.equal(broken.status().error, 'boom');
    assert.equal(bridge.calls.length, 2);
  }

  // --- "this album": the songs of the album that holds the selected song -------------------------
  {
    const albums = [{id: 'a1', tracks: [{id: 't1'}, {id: 't2'}]}, {id: 'a2', tracks: [{id: 't3'}, {id: 't4'}, {id: 't5'}]}];
    assert.deepEqual(Prepare.albumTrackIds(albums, 't4'), ['t3', 't4', 't5']);
    assert.deepEqual(Prepare.albumTrackIds(albums, 't1'), ['t1', 't2']);
    assert.deepEqual(Prepare.albumTrackIds(albums, ''), [], 'no song selected: nothing');
    assert.deepEqual(Prepare.albumTrackIds(null, 't1'), []);
  }

  // --- the wiring in the app -------------------------------------------------------------------
  const read = file => fs.readFileSync(path.join(root, file), 'utf8');
  const html = read('index.html'), scene = read('score-scene.js'), main = read('desktop/main.cjs'), preload = read('desktop/preload.cjs');
  assert.ok(html.indexOf('<script src="./score-prepare.js"></script>') >= 0 && html.indexOf('./score-prepare.js') < html.indexOf('./score-scene.js'), 'loaded before the scene');
  assert.match(preload, /scoreLayersState: trackIds => ipcRenderer\.invoke\('fusion:score-layers-state'/);
  assert.match(main, /ipcMain\.handle\('fusion:score-layers-state'/);
  assert.match(main, /health:\{\.\.\.built\.health,layers:layersHealth/);
  // XML only asks the XLD analysis service; it never writes score-layers.json itself.
  for (const file of ['score-prepare.js', 'score-scene.js', 'fusion.js', 'desktop/score-layers-state.cjs']) {
    assert.equal(/writeFile|appendFile|createWriteStream|\.rename\(|\.mkdir\(/.test(read(file)), false, `${file} does not write files`);
  }
  assert.match(scene, /XinScorePrepare/);
  assert.match(html, /id="scoreAutoLayers"[^>]*type="checkbox"|type="checkbox"[^>]*id="scoreAutoLayers"/);

  console.log('score prepare contract ok');
})().catch(error => { console.error(error); process.exitCode = 1; });
