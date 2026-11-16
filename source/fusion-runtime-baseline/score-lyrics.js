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
    // B7: where the words came from, how far they were moved, and two small 0.1 s nudges kept per song.
    const head = doc.createElement('div'), earlier = doc.createElement('button'), later = doc.createElement('button');
    head.className = 'score-lyrics__head';
    for (const [button, delta, key, text, tip, tipText] of [[earlier, -0.1, 'score.lyricsEarlier', '早 0.1 秒', 'score.lyricsEarlierTip', '歌词提前 0.1 秒'],
      [later, 0.1, 'score.lyricsLater', '晚 0.1 秒', 'score.lyricsLaterTip', '歌词推后 0.1 秒']]) {
      button.type = 'button'; button.className = 'score-lyrics__nudge'; button.dataset.delta = String(delta);
      button.textContent = say(key, text); button.title = say(tip, tipText);
      button.addEventListener('click', event => { event.stopPropagation(); nudge(delta); });
      button.addEventListener('pointerdown', event => event.stopPropagation());
    }
    head.append(from, earlier, later);
    box.append(head, before, current, after);
    if (canvas.parentNode) canvas.parentNode.insertBefore(box, canvas.nextSibling); else stage.appendChild(box);

    const byTrack = new Map();    // trackId -> {lines, source, offset} | {lines: null}
    let trackId = null, placedAt = -Infinity, anchor = null, shownIndex = null, frame = 0, asks = 0, fromKey = '';
    const reasked = new Set();    // songs asked again once their vocal line came (at most once each per page)
    // The whole-song offset (main process: estimated once from the vocal line, plus the user's nudges). Shown time =
    // play time - shift; positive shift = the lyrics were early and are shown later.
    const shiftOf = found => (found && found.offset ? (Number(found.offset.auto) || 0) + (Number(found.offset.manual) || 0) : 0);
    function nudge(delta) {
      const id = trackId, found = id && byTrack.get(id);
      if (!found?.lines || typeof bridge?.lyricsNudge !== 'function') return;
      Promise.resolve(bridge.lyricsNudge(id, delta)).then(answer => {
        if (answer?.ok && byTrack.get(id) === found) { found.offset = answer.offset; shownIndex = null; }
      }, () => {});
    }

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
        byTrack.set(id, parsed && parsed.timed ? {lines: parsed.lines, source: answer.source, offset: answer.offset || null} : {lines: null});
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

    const signed = value => (value > 0 ? '+' : value < 0 ? '−' : '') + Math.abs(value).toFixed(1);
    function fromText(found) {
      const parts = [say('score.lyricsFrom', '歌词来自 {source}', {source: sourceName(found.source)})];
      const o = found.offset;
      if (o && o.sure && Number(o.auto)) parts.push(say('score.lyricsAligned', '已对齐 {shift} 秒', {shift: signed(Number(o.auto))}));
      if (o && Number(o.manual)) parts.push(say('score.lyricsManual', '手调 {shift} 秒', {shift: signed(Number(o.manual))}));
      return parts.join(' · ');
    }

    function render() {
      const status = scene.status?.();
      if (!enabled || !status || !status.active || status.status !== 'ready' || !status.trackId) { hide(); return; }
      if (status.trackId !== trackId) { trackId = status.trackId; anchor = null; placedAt = -Infinity; shownIndex = null; }
      // The vocal line arrived after the lyrics were asked for (XML prepares it, B7 A): ask once more for the estimate.
      const asked = byTrack.get(trackId);
      if (asked?.lines && asked.offset && asked.offset.why === 'no-vocal-line' && !reasked.has(trackId) && status.health?.contour?.ok) {
        reasked.add(trackId); byTrack.delete(trackId);
      }
      ask(trackId);
      const found = byTrack.get(trackId);
      const view = scene.viewHandle?.();
      if (!found?.lines || !view) { hide(); return; }
      const width = canvas.clientWidth, height = canvas.clientHeight;
      if (!width || !height) { hide(); return; }
      const x = width * (Number(view.options?.().playhead) || 0);
      if (now() - placedAt > PLACE_EVERY) { anchor = place(view, width, height, x); placedAt = now(); }
      if (!anchor) { hide(); return; }
      const at = core.lineAt(found.lines, view.timeAt(x) - shiftOf(found));
      if (!at.now && !at.after) { hide(); return; }
      if (shownIndex !== at.index) {
        shownIndex = at.index;
        current.textContent = at.now ? at.now.text : '';
        before.textContent = at.before && at.now ? at.before.text : '';
        after.textContent = at.after ? at.after.text : '';
        const text = fromText(found);
        if (text !== fromKey) { fromKey = text; from.textContent = text; }
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
        offset: trackId && byTrack.get(trackId)?.offset ? {...byTrack.get(trackId).offset} : null, from: from.textContent,
        now: current.textContent, before: before.textContent, after: after.textContent}),
      destroy: () => { if (frame && root.cancelAnimationFrame) root.cancelAnimationFrame(frame); box.remove(); }
    });
  }

  root.XinScoreLyrics = Object.freeze({create, storedLyrics, KEY, GAP});
})(globalThis);
