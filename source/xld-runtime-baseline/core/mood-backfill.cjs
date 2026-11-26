'use strict';

const fs = require('node:fs/promises');
const path = require('node:path');
const {ENGINE} = require('./mood-curve.cjs');

async function analyzedTracks(root, cancelled) {
  let albums;
  try { albums = await fs.readdir(root, {withFileTypes: true}); }
  catch (error) { if (error.code === 'ENOENT') return []; throw error; }
  const records = [];
  for (const album of albums) {
    if (cancelled()) break;
    if (!album.isDirectory() || album.name === 'logs' || album.name === '.tmp') continue;
    const albumDir = path.join(root, album.name);
    for (const song of await fs.readdir(albumDir, {withFileTypes: true})) {
      if (cancelled()) break;
      if (!song.isDirectory()) continue;
      const dir = path.join(albumDir, song.name);
      try {
        const meta = JSON.parse(await fs.readFile(path.join(dir, 'track.json'), 'utf8'));
        if (typeof meta?.trackId !== 'string' || !meta.trackId || typeof meta.source !== 'string' || !path.isAbsolute(meta.source)) {
          throw Error('mood-backfill-metadata');
        }
        records.push({id: meta.trackId, filePath: meta.source, title: meta.title, number: meta.number, artist: meta.artist,
          album: meta.album, bridgePath: path.join(dir, 'music-lab.json')});
      } catch (error) {
        if (error.code !== 'ENOENT') records.push({title: path.join(album.name, song.name), error: 'mood-backfill-metadata'});
      }
    }
  }
  return records;
}

function createMoodBackfill({service, getRoot, getAlbum, isBusy, onChange, onTask}) {
  let latest = null, job = null, inEngine = false, revision = 0;
  function publish(update) {
    latest = {...latest, ...update, revision: ++revision};
    onChange?.(latest);
  }
  function stop() {
    if (!job) return {ok: false, error: 'no-active-task'};
    job.cancelled = true;
    if (inEngine) service.cancel();
    publish({stopping: true});
    return {ok: true};
  }
  async function run(scope, albumId) {
    if (job || isBusy()) return {ok: false, error: 'analysis-busy'};
    if (scope !== 'album' && scope !== 'library') return {ok: false, error: 'mood-backfill-scope'};
    const album = scope === 'album' ? getAlbum(albumId) : null;
    if (scope === 'album' && !album?.tracks.length) return {ok: false, error: 'mood-backfill-album'};
    const root = getRoot();
    job = {cancelled: false};
    const issues = [];
    latest = null;
    publish({scope, album: album?.title, running: true, stopping: false, index: 0, total: 0, title: '', computed: 0, current: 0, missing: 0, failed: 0});
    let error = null;
    try {
      service.setAnalysisRoot(root);
      // Snapshot this selection before work starts. Library discovery reads existing result directories only.
      const tracks = album?.tracks || await analyzedTracks(root, () => job.cancelled);
      for (const [index, track] of tracks.entries()) {
        if (job.cancelled) break;
        const title = track.title || track.id;
        publish({index: index + 1, total: tracks.length, title});
        try {
          if (track.error) throw Error(track.error);
          const stat = await fs.stat(track.filePath).catch(problem => { if (problem.code !== 'ENOENT') throw problem; return null; });
          if (!stat?.isFile()) {
            issues.push({title, error: 'track-missing'});
            publish({missing: latest.missing + 1});
            continue;
          }
          if (await service.readMoodStatus(track) === 'current') {
            publish({current: latest.current + 1});
            continue;
          }
          if (job.cancelled) break;
          // run() rechecks the result under the normal cross-process lock and publishes through the mood engine.
          inEngine = true;
          let response;
          try { response = await service.run(track, ENGINE, {}, onTask); }
          finally { inEngine = false; }
          if (response.ok) {
            const key = response.cached ? 'current' : 'computed';
            publish({[key]: latest[key] + 1});
          } else if (response.error === 'analysis-cancelled') {
            job.cancelled = true;
            break;
          } else if (['analysis-locked', 'analysis-busy', 'runtime-missing'].includes(response.error)) {
            error = response.error;
            if (response.holder) publish({holder: response.holder});
            break;
          } else {
            throw Error(response.detail || response.error || 'analysis-failed');
          }
        } catch (problem) {
          issues.push({title, error: problem.message});
          publish({failed: latest.failed + 1});
        }
      }
      publish({total: tracks.length});
    } catch (problem) { error = problem.message; }
    finally {
      const cancelled = job.cancelled;
      job = null;
      publish({running: false, stopping: false, cancelled, issues, error});
    }
    return {ok: !error && !latest.failed && !latest.cancelled, status: latest};
  }
  return {run, stop, status: () => latest, busy: () => Boolean(job)};
}

module.exports = {createMoodBackfill};
