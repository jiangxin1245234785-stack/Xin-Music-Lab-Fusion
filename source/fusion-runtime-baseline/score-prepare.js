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
(function (root) {
  'use strict';
  const ENGINE = 'score-layers';
  const RETRY_MS = 30000;

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

    function enqueue(trackId, source, batch, key) {
      const id = String(trackId || '');
      if (!id) return false;
      const known = job(id);
      if (known && (known.phase === 'queued' || known.phase === 'running')) return false;
      if (known && known.timer) clear(known.timer);
      const sameRun = known && known.key === keyOf(key);
      jobs.set(id, {phase: 'queued', source, attempts: known && sameRun && source === 'auto' && known.source === 'auto' ? known.attempts : 0,
                    error: null, batch: batch || null, timer: 0, key: keyOf(key)});
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
      try { result = await run(id, ENGINE); } catch (error) { result = {ok: false, error: String(error && error.message || error)}; }
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
    function auto(trackId, key) {
      const known = job(String(trackId || ''));
      if (known && ['queued', 'running', 'retrying'].includes(known.phase)) return false;
      // A held retry for the same stems runs now, still as the one automatic retry (enqueue keeps the count).
      if (known && known.phase === 'held' && known.key === keyOf(key)) return enqueue(trackId, 'auto', null, key);
      if (known && ['done', 'failed'].includes(known.phase) && known.key === keyOf(key)) return false;
      return enqueue(trackId, 'auto', null, key);
    }

    // The user asked for this track (the retry on the score's line, or manual mode).
    function request(trackId, key) {
      const known = job(String(trackId || ''));
      if (known && known.phase === 'retrying') { clear(known.timer); known.timer = 0; }
      return enqueue(trackId, 'user', null, key === undefined && known ? known.key : key);
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
    function batch(trackIds, onProgress) {
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
      for (const id of mine) enqueue(id, 'batch', handle);
      if (!state.current) report();
      return handle;
    }

    return Object.freeze({
      auto, request, forgetWaiting, batch,
      phase: trackId => { const entry = job(String(trackId || '')); return entry ? entry.phase : 'idle'; },
      error: trackId => { const entry = job(String(trackId || '')); return entry ? entry.error : null; },
      holder: trackId => { const entry = job(String(trackId || '')); return entry && entry.holder ? entry.holder : null; },
      attempts: trackId => { const entry = job(String(trackId || '')); return entry ? entry.attempts : 0; },
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
    if (layers.owed !== 'layers') return 'none';
    return autoOn ? 'run' : 'manual';
  }

  // Whether the score starts a preparation now: only while the score is the scene on screen and its
  // song is shown (SPEC-B2 A, acceptance M1). Songs accepted while another scene is showing (a click in
  // the library, the next song playing on, the last song restored at start-up) start nothing; the score
  // asks again when the user switches to it.
  const starts = ({active, ready, plan: decided}) => Boolean(active && ready && decided === 'run');

  // A finished job reloads the score only when it succeeded for the song that is on screen now.
  const reloads = (event, shownTrackId) => Boolean(event && event.type === 'done' && event.ok && event.trackId && event.trackId === shownTrackId);

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
      ready: rows.filter(row => row.ok && !row.owed).length,
      notAnalysed: rows.filter(row => row.ok && row.owed === 'no-stems').length,
      unreadable: rows.filter(row => !row.ok || row.owed === 'stems-unreadable').length + ids.filter(id => !known.has(id)).length
    };
    return {ok: true, owed: rows.filter(row => row.ok && row.owed === 'layers').map(row => String(row.trackId)), counts, error: null};
  }

  // startMany(): the owed songs into the queue, one by one. The counts come with every progress report.
  function startMany(queue, surveyed, onProgress) {
    const counts = surveyed.counts;
    if (!surveyed.ok) {
      const failed = {...counts, done: 0, failed: 0, total: 0, current: null, cancelled: false, finished: true, failures: [], error: surveyed.error};
      try { onProgress && onProgress(failed); } catch (_) {}
      return {cancel() {}, status: () => failed};
    }
    const handle = queue.batch(surveyed.owed, progress => { try { onProgress && onProgress({...progress, ...counts}); } catch (_) {} });
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

  const api = Object.freeze({create, plan, starts, reloads, survey, startMany, prepareMany, albumTrackIds, ENGINE, RETRY_MS});
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.XinScorePrepare = api;
})(typeof globalThis !== 'undefined' ? globalThis : this);
