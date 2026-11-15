// Score layers: the two analyses the listening score (XML's "谱面" scene) needs beyond notes,
// chords and sections. `score-layers` gives bar lines, loudness and stem levels; `score-vocals`
// gives the lead vocal's notes and pitch curve. One button runs both for the selected track,
// the other for every track of the selected album, strictly one after the other.
//
// A track that already has a result for its current stems is answered from disk by the
// analysis service (no model runs), so pressing the album button again only fills the gaps.
// The results are files beside the track's other results; nothing in this window shows them.
(function (root) {
  'use strict';
  const ENGINES = [['score-layers', 'runtime.score.layers'], ['score-vocals', 'runtime.score.vocals']];

  function create(config) {
    const {bridge, trackButton, albumButton, getTrack, getAlbum, isBusy, setBatch, onProgress, isCancelled, log, t} = config || {};
    if (!bridge || typeof bridge.runAnalysis !== 'function' || !trackButton || !albumButton) return null;
    let running = null;      // the button whose run is in progress

    function sync() {
      const busy = Boolean(isBusy());
      trackButton.disabled = busy || !getTrack();
      albumButton.disabled = busy || !(getAlbum() && getAlbum().tracks && getAlbum().tracks.length);
      if (running !== trackButton) trackButton.textContent = t('runtime.score.track');
      if (running !== albumButton) albumButton.textContent = t('runtime.score.album');
    }

    async function run(button, tracks) {
      if (isBusy() || !tracks.length) return null;
      running = button;
      setBatch(true);
      const count = {made: 0, kept: 0, failed: 0};
      const total = tracks.length * ENGINES.length;
      let index = 0, cancelled = false;
      onProgress?.({index,total});
      log(t('runtime.score.start', {tracks: tracks.length}));
      try {
        for (const track of tracks) {
          for (const [engine, name] of ENGINES) {
            if (isCancelled()) { cancelled = true; break; }
            index += 1;
            onProgress?.({index,total,trackId:track.id,engine});
            button.textContent = t('runtime.score.progress', {index, total});
            let response;
            try { response = await bridge.runAnalysis(track.id, engine); } catch (error) { response = {ok: false, detail: String(error && error.message || error)}; }
            if (response && response.ok) count[response.cached ? 'kept' : 'made'] += 1;
            else if (response && response.error === 'analysis-cancelled') { cancelled = true; break; }
            else {
              count.failed += 1;
              const why = String(response && (response.detail || response.error) || '').trim().split(/\r?\n/).pop().slice(0, 160);
              log(t('runtime.score.failed', {track: track.title, layer: t(name), why}));
            }
          }
          if (cancelled) break;
        }
      } finally {
        running = null;
        setBatch(false);
        sync();
      }
      log(t(cancelled ? 'runtime.score.cancelled' : 'runtime.score.end', count));
      return {...count, cancelled};
    }

    trackButton.addEventListener('click', () => { const track = getTrack(); if (track) run(trackButton, [track]); });
    albumButton.addEventListener('click', () => { const album = getAlbum(); if (album && album.tracks) run(albumButton, album.tracks.slice()); });
    sync();
    return Object.freeze({sync, run});
  }

  const api = Object.freeze({create, ENGINES: ENGINES.map(item => item[0])});
  if (typeof module === 'object' && module.exports) module.exports = api;
  root.XldScoreLayers = api;
})(globalThis);
