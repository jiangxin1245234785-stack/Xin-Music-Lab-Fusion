// Lyrics on the score (B6, 2026-11-15). A thin layer of words over the score canvas, just above the vocal lane at the
// play line: the line being sung, bright; the one before and the one after, faint; a small note of where the words came
// from. It never covers the lane, so no note and no pitch line is hidden. With no vocal lane the words sit above the
// first lane. The time is the score's own (view.timeAt at the play line, the latency setting included), so the words
// keep pace with the notes. Nothing is asked for while the score is not on screen or 「显示歌词」 is off; each song is
// asked for once per page (desktop/lyrics.cjs keeps its own cache). Nothing found: nothing shown, no message.
(function (root) {
  'use strict';
  const KEY = 'xin-score-lyrics';
  const storedLyrics = kept => kept !== 'off';
  const GAP = 32;           // px between the words and the lane below them: clears the bar numbers drawn just above the lanes
  const SCAN_STEP = 2;      // px between the points asked of view.hit() when finding the lane's top
  const PLACE_EVERY = 400;  // ms between two measurements of where the lane is

  function create({bridge, stage, canvas, scene, audio, core = root.XinLyricsCore, doc = root.document, storage = root.localStorage,
    say = (key, fallback, params) => { const t = root.XinMusicLabDynamicUi?.t?.(key, params || {}, fallback) || fallback; return params ? Object.entries(params).reduce((s, [k, v]) => s.split(`{${k}}`).join(v), t) : t; },
    raf = callback => root.requestAnimationFrame(callback), now = () => root.performance.now()} = {}) {
    if (!stage || !canvas || !scene || !core) return null;
    let enabled = true;
    try { enabled = storedLyrics(storage?.getItem(KEY)); } catch (_) {}
    const box = doc.createElement('div');
    box.className = 'score-lyrics';
    box.setAttribute('aria-hidden', 'true');
    box.hidden = true;
    const from = doc.createElement('small'), before = doc.createElement('div'), current = doc.createElement('div'), after = doc.createElement('div');
    from.className = 'score-lyrics__from'; before.className = 'score-lyrics__near'; current.className = 'score-lyrics__now'; after.className = 'score-lyrics__near';
    box.append(from, before, current, after);
    if (canvas.parentNode) canvas.parentNode.insertBefore(box, canvas.nextSibling); else stage.appendChild(box);

    const byTrack = new Map();    // trackId -> {lines, source} | {lines: null}
    let trackId = null, placedAt = -Infinity, anchor = null, shownIndex = null, frame = 0, asks = 0;

    const toggle = doc.getElementById?.('scoreLyrics');
    if (toggle) {
      toggle.checked = enabled;
      toggle.addEventListener('change', () => {
        enabled = Boolean(toggle.checked);
        try { storage?.setItem(KEY, enabled ? 'on' : 'off'); } catch (_) {}
        if (!enabled) hide();
      });
    }

    function hide() { if (!box.hidden) box.hidden = true; shownIndex = null; }

    function ask(id) {
      if (byTrack.has(id) || typeof bridge?.lyrics !== 'function') return;
      byTrack.set(id, {lines: null, pending: true});
      asks++;
      const duration = Number(audio?.duration);
      Promise.resolve(bridge.lyrics(id, Number.isFinite(duration) ? duration : 0)).then(answer => {
        const parsed = answer?.ok && answer.lrc ? core.parseLrc(answer.lrc) : null;
        byTrack.set(id, parsed && parsed.timed ? {lines: parsed.lines, source: answer.source} : {lines: null});
      }, () => byTrack.set(id, {lines: null}));
    }

    // Where the vocal lane starts, asked of the score itself: the first point down the play line that view.hit() calls
    // the vocal lane; without one, the first lane of any kind.
    function place(view, width, height, x) {
      const vocal = (view.lanes?.() || []).some(lane => lane.group === 'vocals' && lane.visible !== false && lane.shown !== false);
      let first = null;
      for (let y = 0; y < height; y += SCAN_STEP) {
        const hit = view.hit?.(x, y);
        if (!hit || hit.kind !== 'lane') continue;
        if (first === null) first = y;
        if (!vocal || hit.group === 'vocals') return {top: y, vocal};
      }
      return first === null ? null : {top: first, vocal: false};
    }

    function sourceName(source) {
      return source === 'file' ? say('score.lyricsFile', '歌曲文件夹里的 .lrc') : 'LRCLIB';
    }

    function render() {
      const status = scene.status?.();
      if (!enabled || !status || !status.active || status.status !== 'ready' || !status.trackId) { hide(); return; }
      if (status.trackId !== trackId) { trackId = status.trackId; anchor = null; placedAt = -Infinity; shownIndex = null; }
      ask(trackId);
      const found = byTrack.get(trackId);
      const view = scene.viewHandle?.();
      if (!found?.lines || !view) { hide(); return; }
      const width = canvas.clientWidth, height = canvas.clientHeight;
      if (!width || !height) { hide(); return; }
      const x = width * (Number(view.options?.().playhead) || 0);
      if (now() - placedAt > PLACE_EVERY) { anchor = place(view, width, height, x); placedAt = now(); }
      if (!anchor) { hide(); return; }
      const at = core.lineAt(found.lines, view.timeAt(x));
      if (!at.now && !at.after) { hide(); return; }
      if (shownIndex !== at.index) {
        shownIndex = at.index;
        current.textContent = at.now ? at.now.text : '';
        before.textContent = at.before && at.now ? at.before.text : '';
        after.textContent = at.after ? at.after.text : '';
        from.textContent = say('score.lyricsFrom', '歌词来自 {source}', {source: sourceName(found.source)});
        current.classList.remove('is-new'); void current.offsetWidth; current.classList.add('is-new');
      }
      const left = canvas.offsetLeft + x - 2;
      box.style.left = `${Math.round(left)}px`;
      box.style.maxWidth = `${Math.max(80, Math.round(canvas.offsetLeft + width - left - 16))}px`;
      box.hidden = false;
      box.style.top = `${Math.round(canvas.offsetTop + anchor.top - GAP - box.offsetHeight)}px`;
      box.dataset.anchor = anchor.vocal ? 'vocals' : 'top';
    }

    function loop() { frame = raf(loop); try { render(); } catch (_) { hide(); } }
    frame = raf(loop);
    return Object.freeze({
      render,
      status: () => ({enabled, trackId, asks, shown: !box.hidden, anchor: anchor ? {...anchor} : null,
        lines: trackId && byTrack.get(trackId)?.lines ? byTrack.get(trackId).lines.length : 0, source: trackId ? byTrack.get(trackId)?.source || null : null,
        now: current.textContent, before: before.textContent, after: after.textContent}),
      destroy: () => { if (frame && root.cancelAnimationFrame) root.cancelAnimationFrame(frame); box.remove(); }
    });
  }

  root.XinScoreLyrics = Object.freeze({create, storedLyrics, KEY, GAP});
})(globalThis);
