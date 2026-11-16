// Preparing the score layers (score-layers: bar lines, loudness, stem levels) from XML.
//
// XML only asks; XLD's analysis service runs the engine and writes the result (bridge.runAnalysis,
// the same path the score's manual button always used). This file is the queue in between, with no
// DOM so it can be tested with a stand-in bridge (tests/score-prepare-contract.js):
//   - one track at a time, and never the same track twice at once;
//   - a track opened in the score is prepared automatically; a failed automatic run is tried once
//     more after a pause, then it waits for the user;
//   - a run is never cancelled because another song was opened: it finishes and is saved, and whoever
//     listens decides whether the result belongs to what is on screen (onDone carries the trackId);
//   - a batch (an album, the whole library) goes through the same queue, one by one, and can be
//     cancelled.
//
// B7 (2026-11-15): the vocal line (score-vocals) is prepared too. A job runs a list of steps one after another -
// the layers first (quick), then the vocal line (slow, GPU) - and the score is reloaded after each step that
// succeeded, so the bar lines appear before the vocal line has finished. A song whose vocal line is current (also
// "no singing": XLD's runner writes a result without a lane, which reads as current) owes nothing.
(function (root) {
  'use strict';
  const ENGINE = 'score-layers';
  const VOCALS = 'score-vocals';
  const RETRY_MS = 30000;
  const stepsOf = engines => (Array.isArray(engines) && engines.length ? engines.filter(e => e === ENGINE || e === VOCALS) : [ENGINE]);

  function create(options) {
    const run = options && options.run;
    if (typeof run !== 'function') return null;
    const cancelRunning = typeof options.cancelRunning === 'function' ? options.cancelRunning : null;
    const later = options.setTimeout || ((fn, ms) => root.setTimeout(fn, ms));
    const clear = options.clearTimeout || (id => root.clearTimeout(id));
    const retryMs = Number.isFinite(options.retryMs) ? options.retryMs : RETRY_MS;
    // Whether an automatic run may start now (the scene: the score is on screen). The automatic retry
    // asks it when it falls due; without it, a retry falling due in another scene is held ('held')
    // until the score is shown again and auto() is called for the song.
    const mayStart = typeof options.mayStart === 'function' ? options.mayStart : () => true;

    // trackId -> {phase, source, attempts, error, batch, key}
    //   phase: 'queued' | 'running' | 'retrying' (waiting to try once more) | 'held' (the retry fell due
    //          while the score was not on screen) | 'done' | 'failed'
    //   key: the stem run the job was for (health.layers.stemRunId). A song prepared (or given up on) for
    //   one set of stems is looked at again when XLD has made new stems.
    const jobs = new Map();
    const queue = [];
    let current = null;
    const listeners = new Set();
    const emit = event => { for (const listener of [...listeners]) { try { listener(event); } catch (_) {} } };

    function job(trackId) { return jobs.get(trackId) || null; }
    const keyOf = value => (value === undefined ? null : value);

    function enqueue(trackId, source, batch, key, engines) {
      const id = String(trackId || '');
      if (!id) return false;
      const known = job(id);
      if (known && (known.phase === 'queued' || known.phase === 'running')) return false;
      if (known && known.timer) clear(known.timer);
      const sameRun = known && known.key === keyOf(key);
      const steps = engines === undefined && known ? known.steps : stepsOf(engines);
      if (!steps.length) return false;
      jobs.set(id, {phase: 'queued', source, attempts: known && sameRun && source === 'auto' && known.source === 'auto' ? known.attempts : 0,
                    error: null, batch: batch || null, timer: 0, key: keyOf(key), steps, step: null});
      queue.push(id);
      emit({type: 'queued', trackId: id});
      pump();
      return true;
    }

    async function pump() {
      if (current || !queue.length) return;
      const id = queue.shift();
      const entry = job(id);
      if (!entry || entry.phase !== 'queued') return pump();
      current = id;
      entry.phase = 'running';
      entry.attempts++;
      emit({type: 'running', trackId: id});
      let result = null;
      for (let index = 0; index < entry.steps.length; index++) {
        entry.step = entry.steps[index];
        if (index) emit({type: 'step', trackId: id, engine: entry.step});
        try { result = await run(id, entry.step); } catch (error) { result = {ok: false, error: String(error && error.message || error)}; }
        if (!(result && result.ok)) break;
        // A step that succeeded with more to come: the score can show it already.
        if (index < entry.steps.length - 1) emit({type: 'partial', trackId: id, ok: true, engine: entry.step, result});
      }
      current = null;
      const ok = Boolean(result && result.ok);
      if (ok) {
        entry.phase = 'done';
        entry.error = null;
      } else {
        entry.error = String(result && (result.error || result.detail) || 'failed');
        // Another program holds the analysis lock (XLD core/analysis-lock.cjs): who, and on which song.
        entry.holder = result && result.error === 'analysis-locked' ? (result.holder || {}) : null;
        // An automatic run gets one more try after a pause; anything else waits for the user.
        if (entry.source === 'auto' && entry.attempts < 2 && entry.error !== 'analysis-cancelled') {
          entry.phase = 'retrying';
          entry.timer = later(() => {
            entry.timer = 0;
            if (entry.phase !== 'retrying') return;
            // Only from the score (acceptance M1 holds for the retry too): otherwise wait for the score.
            if (!mayStart()) { entry.phase = 'held'; emit({type: 'held', trackId: id}); return; }
            entry.phase = 'queued';
            queue.push(id);
            emit({type: 'queued', trackId: id});
            pump();
          }, retryMs);
        } else entry.phase = 'failed';
      }
      emit({type: 'done', trackId: id, ok, result, phase: entry.phase, batch: entry.batch});
      if (entry.batch) entry.batch.settled(id, ok, entry.error);
      pump();
    }

    // A track the score is showing, with the stem run its verdict is about. Nothing happens if it is
    // queued, running or waiting to retry, or if it has already been prepared or given up on in this
    // session for the same stems (the user's retry is for that). New stems make it a new job.
    // `engines`: what the song owes (owedEngines(health)); without it, the layers only (as before B7).
    function auto(trackId, key, engines) {
      const known = job(String(trackId || ''));
      if (known && ['queued', 'running', 'retrying'].includes(known.phase)) return false;
      // A held retry for the same stems runs now, still as the one automatic retry (enqueue keeps the count).
      if (known && known.phase === 'held' && known.key === keyOf(key)) return enqueue(trackId, 'auto', null, key, engines);
      if (known && ['done', 'failed'].includes(known.phase) && known.key === keyOf(key)) return false;
      return enqueue(trackId, 'auto', null, key, engines);
    }

    // The user asked for this track (the retry on the score's line, or manual mode).
    function request(trackId, key, engines) {
      const known = job(String(trackId || ''));
      if (known && known.phase === 'retrying') { clear(known.timer); known.timer = 0; }
      return enqueue(trackId, 'user', null, key === undefined && known ? known.key : key, engines);
    }

    // Automatic jobs for other songs that have not started yet are dropped when the user moves on;
    // a running one is left to finish.
    function forgetWaiting(keepTrackId) {
      for (let index = queue.length - 1; index >= 0; index--) {
        const id = queue[index], entry = job(id);
        if (id !== keepTrackId && entry && entry.source === 'auto') { queue.splice(index, 1); jobs.delete(id); }
      }
      for (const [id, entry] of jobs) {
        if (id !== keepTrackId && ['retrying', 'held'].includes(entry.phase) && entry.source === 'auto') { clear(entry.timer); jobs.delete(id); }
      }
    }

    // Many tracks, one by one. `trackIds` should already be only the ones that need it (the caller
    // asks the main process which). onProgress({done, total, failed, current, cancelled, finished}).
    function batch(trackIds, onProgress, enginesFor) {
      const ids = [...new Set((trackIds || []).map(String).filter(Boolean))];
      const state = {done: 0, failed: 0, total: ids.length, current: null, cancelled: false, finished: ids.length === 0, failures: []};
      const report = () => { try { onProgress && onProgress({...state, failures: state.failures.slice()}); } catch (_) {} };
      let skipped = 0;
      const handle = {
        settled(id, ok, error) {
          state.done++;
          if (!ok) { state.failed++; state.failures.push({trackId: id, error}); }
          state.current = null;
          if (state.done >= state.total || state.cancelled) state.finished = true;
          report();
        },
        cancel() {
          if (state.finished) return;
          state.cancelled = true;
          for (let index = queue.length - 1; index >= 0; index--) {
            const entry = job(queue[index]);
            if (entry && entry.batch === handle) { jobs.delete(queue[index]); queue.splice(index, 1); }
          }
          const running = current && job(current);
          if (running && running.batch === handle && cancelRunning) cancelRunning();
          else { state.finished = true; report(); }
        },
        status: () => ({...state, failures: state.failures.slice()})
      };
      // Songs already queued or running (opened in the score just now) are left to that job.
      const mine = ids.filter(id => { const known = job(id); return !(known && (known.phase === 'running' || known.phase === 'queued')); });
      skipped = ids.length - mine.length;
      state.total = mine.length;
      state.finished = state.total === 0;
      // Listen before the first song starts: it starts as soon as it is queued.
      listeners.add(function follow(event) {
        if (event.type === 'running' && job(event.trackId) && job(event.trackId).batch === handle) { state.current = event.trackId; report(); }
        if (state.finished) listeners.delete(follow);
      });
      for (const id of mine) enqueue(id, 'batch', handle, undefined, typeof enginesFor === 'function' ? enginesFor(id) : undefined);
      if (!state.current) report();
      return handle;
    }

    return Object.freeze({
      auto, request, forgetWaiting, batch,
      phase: trackId => { const entry = job(String(trackId || '')); return entry ? entry.phase : 'idle'; },
      error: trackId => { const entry = job(String(trackId || '')); return entry ? entry.error : null; },
      holder: trackId => { const entry = job(String(trackId || '')); return entry && entry.holder ? entry.holder : null; },
      attempts: trackId => { const entry = job(String(trackId || '')); return entry ? entry.attempts : 0; },
      // The step a queued / running job is at (or will start with): 'score-layers' | 'score-vocals' | null.
      step: trackId => { const entry = job(String(trackId || '')); return entry ? (entry.step || entry.steps[0] || null) : null; },
      running: () => current,
      waiting: () => queue.slice(),
      subscribe(listener) { listeners.add(listener); return () => listeners.delete(listener); }
    });
  }

  // What the score does for the song it has just shown, from the model's health.layers (main.cjs):
  //   'none'     the layers are there and current;
  //   'no-stems' XLD has not analysed the song (no stems): only a plain hint, nothing is run;
  //   'run'      prepare them now (the setting is on);
  //   'stems-unreadable' its stems are there but could not be read: say so, run nothing;
  //   'manual'   they are missing or stale, but the setting is off: the user's button does it;
  //   'unknown'  no such information (an older main process): behave as before, manual.
  function plan(health, autoOn) {
    const layers = health && health.layers;
    if (!layers || typeof layers !== 'object') return 'unknown';
    if (layers.owed === 'no-stems') return 'no-stems';
    if (layers.owed === 'stems-unreadable') return 'stems-unreadable';
    if (!owedEngines(health).length) return 'none';
    return autoOn ? 'run' : 'manual';
  }
  // Which steps the song owes, in the order they run: the layers (health.layers.owed === 'layers'), then the vocal
  // line (health.vocals.owed === 'vocals': it has a vocal stem and no current vocal line).
  function owedEngines(health) {
    const out = [];
    if (health && health.layers && health.layers.owed === 'layers') out.push(ENGINE);
    if (health && health.vocals && health.vocals.owed === 'vocals') out.push(VOCALS);
    return out;
  }

  // Whether the score starts a preparation now: only while the score is the scene on screen and its
  // song is shown (SPEC-B2 A, acceptance M1). Songs accepted while another scene is showing (a click in
  // the library, the next song playing on, the last song restored at start-up) start nothing; the score
  // asks again when the user switches to it.
  const starts = ({active, ready, plan: decided}) => Boolean(active && ready && decided === 'run');

  // A finished job reloads the score only when it succeeded for the song that is on screen now.
  // A step that succeeded before the next one ('partial') reloads it too: the bar lines show while the vocal line runs.
  const reloads = (event, shownTrackId) => Boolean(event && (event.type === 'done' || event.type === 'partial') && event.ok && event.trackId && event.trackId === shownTrackId);

  // Many songs at once (the library drawer, SPEC-B2 B), in two steps so a large batch can be shown
  // before it starts. survey(): `ask(trackIds)` is the main process's fusion:score-layers-state; only
  // songs XLD has analysed (stems) whose layers are missing or not current are owed, the rest counted.
  async function survey(ask, trackIds) {
    const ids = [...new Set((trackIds || []).map(String).filter(Boolean))];
    let answer = null;
    try { answer = await ask(ids); } catch (error) { answer = {ok: false, error: String(error && error.message || error)}; }
    if (!answer || !answer.ok) {
      return {ok: false, owed: [], counts: {asked: ids.length, ready: 0, notAnalysed: 0, unreadable: ids.length},
              error: answer && answer.error || 'state-unavailable'};
    }
    const rows = Array.isArray(answer.rows) ? answer.rows : [];
    const known = new Set(rows.map(row => String(row.trackId)));
    const counts = {
      asked: ids.length,
      ready: rows.filter(row => row.ok && !row.owed && row.vocalsOwed !== 'vocals').length,
      notAnalysed: rows.filter(row => row.ok && row.owed === 'no-stems').length,
      unreadable: rows.filter(row => !row.ok || row.owed === 'stems-unreadable').length + ids.filter(id => !known.has(id)).length
    };
    // A song owes the layers, the vocal line, or both (row.vocalsOwed from the main process, B7).
    const owing = rows.filter(row => row.ok && (row.owed === 'layers' || (row.vocalsOwed === 'vocals' && row.stems === 'ready')));
    const engines = {};
    for (const row of owing) engines[String(row.trackId)] = [...(row.owed === 'layers' ? [ENGINE] : []), ...(row.vocalsOwed === 'vocals' ? [VOCALS] : [])];
    return {ok: true, owed: owing.map(row => String(row.trackId)), engines, counts, error: null};
  }

  // startMany(): the owed songs into the queue, one by one. The counts come with every progress report.
  function startMany(queue, surveyed, onProgress) {
    const counts = surveyed.counts;
    if (!surveyed.ok) {
      const failed = {...counts, done: 0, failed: 0, total: 0, current: null, cancelled: false, finished: true, failures: [], error: surveyed.error};
      try { onProgress && onProgress(failed); } catch (_) {}
      return {cancel() {}, status: () => failed};
    }
    const handle = queue.batch(surveyed.owed, progress => { try { onProgress && onProgress({...progress, ...counts}); } catch (_) {} },
      id => (surveyed.engines && surveyed.engines[id]) || undefined);
    return {cancel: () => handle.cancel(), status: () => ({...handle.status(), ...counts})};
  }

  async function prepareMany(queue, ask, trackIds, onProgress) {
    return startMany(queue, await survey(ask, trackIds), onProgress);
  }

  // The songs of the album that holds `trackId` (the library's album list); none without a song.
  function albumTrackIds(albums, trackId) {
    const album = (Array.isArray(albums) ? albums : []).find(item => Array.isArray(item.tracks) && item.tracks.some(track => track.id === trackId));
    return album ? album.tracks.map(track => track.id) : [];
  }

  const api = Object.freeze({create, plan, owedEngines, starts, reloads, survey, startMany, prepareMany, albumTrackIds, ENGINE, VOCALS, RETRY_MS});
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.XinScorePrepare = api;
})(typeof globalThis !== 'undefined' ? globalThis : this);
