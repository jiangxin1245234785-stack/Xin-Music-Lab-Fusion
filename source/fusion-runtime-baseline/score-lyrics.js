// Lyrics on the score (B6, 2026-11-15). A thin layer of words over the score canvas, just above the vocal lane at the
// play line: the line being sung, bright; the one before and the one after, faint. It never covers the lane, so no note
// and no pitch line is hidden. With no vocal lane the words sit above the first lane. The time is the score's own
// (view.timeAt at the play line, the latency setting included), so the words keep pace with the notes. Nothing is asked
// for while the score is not on screen or 「显示歌词」 is off; each song is asked for once per page (desktop/lyrics.cjs
// keeps its own cache).
//
// The source row (2026-11-15, the lyrics menu): where the words came from, how far they were aligned, the two 0.1 s
// nudges and the menu entry share one small row above the words. It is not on screen all the time: it shows for a few
// seconds when lyrics appear or change (or are aligned), and while the pointer is over the words; otherwise it fades
// out (CSS classes set on those events only - nothing is worked out per frame for it). Clicking the row or the words
// opens a small menu: 重新查找 / 换一份 / 用本地文件… / 这首不显示歌词 (显示歌词 to undo). A song with no lyrics found shows
// the same row, faint, reading 「没有找到歌词」, on the same terms; a song with no singing shows nothing.
(function (root) {
  'use strict';
  const KEY = 'xin-score-lyrics';
  const storedLyrics = kept => kept !== 'off';
  const GAP = 32;           // px between the words and the lane below them: clears the bar numbers drawn just above the lanes
  const SCAN_STEP = 2;      // px between the points asked of view.hit() when finding the lane's top
  const PLACE_EVERY = 400;  // ms between two measurements of where the lane is
  const FLASH_MS = 2600;    // how long the source row stays after lyrics appear or change

  function create({bridge, stage, canvas, scene, audio, core = root.XinLyricsCore, doc = root.document, storage = root.localStorage,
    say = (key, fallback, params) => { const t = root.XinMusicLabDynamicUi?.t?.(key, params || {}, fallback) || fallback; return params ? Object.entries(params).reduce((s, [k, v]) => s.split(`{${k}}`).join(v), t) : t; },
    raf = callback => root.requestAnimationFrame(callback), now = () => root.performance.now(),
    later = (fn, ms) => (typeof root.setTimeout === 'function' ? root.setTimeout(fn, ms) : 0), cancel = id => { if (typeof root.clearTimeout === 'function') root.clearTimeout(id); }} = {}) {
    if (!stage || !canvas || !scene || !core) return null;
    let enabled = true;
    try { enabled = storedLyrics(storage?.getItem(KEY)); } catch (_) {}
    const box = doc.createElement('div');
    box.className = 'score-lyrics';
    box.hidden = true;
    const from = doc.createElement('small'), before = doc.createElement('div'), current = doc.createElement('div'), after = doc.createElement('div');
    from.className = 'score-lyrics__from'; before.className = 'score-lyrics__near'; current.className = 'score-lyrics__now'; after.className = 'score-lyrics__near';
    // B7: where the words came from, how far they were moved, and two small 0.1 s nudges kept per song.
    const head = doc.createElement('div'), earlier = doc.createElement('button'), laterButton = doc.createElement('button'), more = doc.createElement('button');
    head.className = 'score-lyrics__head';
    const stop = event => { event.stopPropagation?.(); };
    for (const [button, delta, key, text, tip, tipText] of [[earlier, -0.1, 'score.lyricsEarlier', '早 0.1 秒', 'score.lyricsEarlierTip', '歌词提前 0.1 秒'],
      [laterButton, 0.1, 'score.lyricsLater', '晚 0.1 秒', 'score.lyricsLaterTip', '歌词推后 0.1 秒']]) {
      button.type = 'button'; button.className = 'score-lyrics__nudge'; button.dataset.delta = String(delta);
      button.textContent = say(key, text); button.title = say(tip, tipText);
      button.addEventListener('click', event => { stop(event); nudge(delta); });
      button.addEventListener('pointerdown', stop);
    }
    more.type = 'button'; more.className = 'score-lyrics__nudge score-lyrics__more'; more.textContent = '⋯';
    more.title = say('score.lyricsMenu', '歌词：重新查找 / 换一份 / 本地文件 / 不显示');
    more.addEventListener('click', event => { stop(event); toggleMenu(); });
    more.addEventListener('pointerdown', stop);
    head.append(from, earlier, laterButton, more);
    const menu = doc.createElement('div');
    menu.className = 'score-lyrics__menu'; menu.hidden = true;
    menu.addEventListener('pointerdown', stop);
    box.append(head, before, current, after, menu);
    if (canvas.parentNode) canvas.parentNode.insertBefore(box, canvas.nextSibling); else stage.appendChild(box);

    const byTrack = new Map();    // trackId -> {lines, source, offset} | {lines: null, settled, reason, hidden}
    let trackId = null, placedAt = -Infinity, anchor = null, shownIndex = null, frame = 0, asks = 0, fromKey = '', flashTimer = 0, busy = false;
    const reasked = new Set();    // songs asked again once their vocal line came (at most once each per page)
    // The whole-song offset (main process: estimated once from the vocal line, plus the user's nudges). Shown time =
    // play time - shift; positive shift = the lyrics were early and are shown later.
    const shiftOf = found => (found && found.offset ? (Number(found.offset.auto) || 0) + (Number(found.offset.manual) || 0) : 0);

    // The source row: shown for a moment after a change, and while the pointer is over the words (classes only).
    function flash() {
      box.classList.add('is-flash');
      if (flashTimer) cancel(flashTimer);
      flashTimer = later(() => { flashTimer = 0; box.classList.remove('is-flash'); }, FLASH_MS);
    }
    box.addEventListener('pointerover', () => box.classList.add('is-hover'));
    box.addEventListener('pointerout', event => { if (!box.contains?.(event.relatedTarget)) box.classList.remove('is-hover'); });
    for (const line of [from, before, current, after]) line.addEventListener('click', event => { stop(event); toggleMenu(); });

    function nudge(delta) {
      const id = trackId, found = id && byTrack.get(id);
      if (!found?.lines || typeof bridge?.lyricsNudge !== 'function') return;
      Promise.resolve(bridge.lyricsNudge(id, delta)).then(answer => {
        if (answer?.ok && byTrack.get(id) === found) { found.offset = answer.offset; shownIndex = null; fromKey = ''; flash(); }
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

    function hide() { if (!box.hidden) box.hidden = true; shownIndex = null; closeMenu(); }

    function ask(id) {
      if (byTrack.has(id) || typeof bridge?.lyrics !== 'function') return;
      byTrack.set(id, {lines: null, pending: true});
      asks++;
      const duration = Number(audio?.duration);
      Promise.resolve(bridge.lyrics(id, Number.isFinite(duration) ? duration : 0)).then(answer => {
        const parsed = answer?.ok && answer.lrc ? core.parseLrc(answer.lrc) : null;
        byTrack.set(id, parsed && parsed.timed ? {lines: parsed.lines, source: answer.source, file: answer.file || null, chosen: Boolean(answer.chosen), offset: answer.offset || null}
          : {lines: null, settled: true, reason: answer?.reason || 'none', hidden: Boolean(answer?.hidden)});
        if (id === trackId) { shownIndex = null; fromKey = ''; flash(); }
      }, () => byTrack.set(id, {lines: null, settled: true, reason: 'error'}));
    }

    // --- the menu ------------------------------------------------------------------------------------------------------
    function closeMenu() { if (!menu.hidden) menu.hidden = true; box.classList.remove('is-menu'); }
    function item(text, onClick, {disabled = false, note = ''} = {}) {
      const b = doc.createElement('button'); b.type = 'button'; b.className = 'score-lyrics__item'; b.textContent = text; b.disabled = Boolean(disabled || busy);
      if (note) b.title = note;
      b.addEventListener('click', event => { stop(event); onClick(); });
      return b;
    }
    function act(action, extra = {}) {
      const id = trackId;
      if (!id || busy || typeof bridge?.lyricsMenu !== 'function') return Promise.resolve(null);
      busy = true; drawMenu();
      const duration = Number(audio?.duration);
      return Promise.resolve(bridge.lyricsMenu(id, action, {...extra, duration: Number.isFinite(duration) ? duration : 0}))
        .then(answer => answer, () => ({ok: false, reason: 'error'}))
        .then(answer => {
          busy = false;
          if (answer && answer.ok && !answer.canceled && action !== 'candidates') { byTrack.delete(id); reasked.delete(id); closeMenu(); ask(id); }
          else drawMenu(answer && !answer.ok ? say('score.lyricsFailed', '没成：{why}', {why: answer.reason || ''}) : '');
          return answer;
        });
    }
    let candidateList = null;
    function drawMenu(message = '') {
      if (menu.hidden) return;
      const found = byTrack.get(trackId) || {};
      menu.replaceChildren();
      if (candidateList) {
        const list = candidateList;
        if (!list.length) menu.append(Object.assign(doc.createElement('small'), {className: 'score-lyrics__note', textContent: say('score.lyricsNoOther', 'LRCLIB 上没有别的带时间的版本')}));
        for (const c of list) {
          const m = Math.floor(c.duration / 60), s = String(Math.round(c.duration % 60)).padStart(2, '0');
          const label = [c.album || c.title, `${m}:${s}`, say('score.lyricsLines', '{count} 行', {count: c.lines})].filter(Boolean).join(' · ');
          menu.append(item(label, () => act('choose', {id: c.id})));
        }
        menu.append(item(say('score.lyricsBack', '返回'), () => { candidateList = null; drawMenu(); }));
      } else {
        menu.append(item(say('score.lyricsRefresh', '重新查找'), () => act('refresh')));
        if (!found.hidden) menu.append(item(say('score.lyricsOther', '换一份'), () => act('candidates').then(answer => {
          if (answer?.ok) { candidateList = answer.candidates || []; drawMenu(); }
        })));
        menu.append(item(say('score.lyricsFileMenu', '用本地文件…'), () => act('file')));
        menu.append(found.hidden ? item(say('score.lyricsShow', '显示歌词'), () => act('show'))
          : item(say('score.lyricsHide', '这首不显示歌词'), () => act('hide')));
      }
      if (message || busy) menu.append(Object.assign(doc.createElement('small'), {className: 'score-lyrics__note', textContent: busy ? say('score.lyricsWorking', '正在处理…') : message}));
    }
    function toggleMenu() {
      if (!menu.hidden) { closeMenu(); return; }
      candidateList = null; menu.hidden = false; box.classList.add('is-menu'); drawMenu();
    }
    doc.addEventListener?.('pointerdown', event => { if (!menu.hidden && !box.contains?.(event.target)) closeMenu(); }, true);

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

    function sourceName(found) {
      if (found.source === 'file') return say('score.lyricsFile', '歌曲文件夹里的 .lrc');
      if (found.source === 'chosen-file') return found.file || '.lrc';
      return found.chosen ? say('score.lyricsChosen', 'LRCLIB（你选的那份）') : 'LRCLIB';
    }

    const signed = value => (value > 0 ? '+' : value < 0 ? '−' : '') + Math.abs(value).toFixed(1);
    function fromText(found) {
      if (!found.lines) return found.hidden ? say('score.lyricsHidden', '这首不显示歌词') : say('score.lyricsNone', '没有找到歌词');
      const parts = [say('score.lyricsFrom', '歌词来自 {source}', {source: sourceName(found)})];
      const o = found.offset;
      if (o && o.sure && Number(o.auto)) parts.push(say('score.lyricsAligned', '已对齐 {shift} 秒', {shift: signed(Number(o.auto))}));
      if (o && Number(o.manual)) parts.push(say('score.lyricsManual', '手调 {shift} 秒', {shift: signed(Number(o.manual))}));
      return parts.join(' · ');
    }
    // A song with no singing (its vocal line is made and has nothing sung): no "没有找到歌词" row for it.
    const noSinging = status => status.health?.vocals?.state === 'current' && status.health?.contour && status.health.contour.ok === false;

    function render() {
      const status = scene.status?.();
      if (!enabled || !status || !status.active || status.status !== 'ready' || !status.trackId) { hide(); return; }
      if (status.trackId !== trackId) { trackId = status.trackId; anchor = null; placedAt = -Infinity; shownIndex = null; fromKey = ''; closeMenu(); }
      // The vocal line arrived after the lyrics were asked for (XML prepares it, B7 A): ask once more for the estimate.
      const asked = byTrack.get(trackId);
      if (asked?.lines && asked.offset && asked.offset.why === 'no-vocal-line' && !reasked.has(trackId) && status.health?.contour?.ok) {
        reasked.add(trackId); byTrack.delete(trackId);
      }
      ask(trackId);
      const found = byTrack.get(trackId);
      const view = scene.viewHandle?.();
      const empty = found && !found.lines && found.settled;
      if (!view || !found || (!found.lines && !empty) || (empty && !found.hidden && noSinging(status))) { hide(); return; }
      const width = canvas.clientWidth, height = canvas.clientHeight;
      if (!width || !height) { hide(); return; }
      const x = width * (Number(view.options?.().playhead) || 0);
      if (now() - placedAt > PLACE_EVERY) { anchor = place(view, width, height, x); placedAt = now(); }
      if (!anchor) { hide(); return; }
      if (empty) {
        // Only the faint row, on the same terms as the source row (a moment after opening, then while pointed at).
        if (shownIndex !== -2) { shownIndex = -2; current.textContent = before.textContent = after.textContent = ''; }
      } else {
        const at = core.lineAt(found.lines, view.timeAt(x) - shiftOf(found));
        if (!at.now && !at.after && menu.hidden) { hide(); return; }
        if (shownIndex !== at.index) {
          shownIndex = at.index;
          current.textContent = at.now ? at.now.text : '';
          before.textContent = at.before && at.now ? at.before.text : '';
          after.textContent = at.after ? at.after.text : '';
          current.classList.remove('is-new'); void current.offsetWidth; current.classList.add('is-new');
        }
      }
      const text = fromText(found);
      if (text !== fromKey) { fromKey = text; from.textContent = text; earlier.hidden = laterButton.hidden = !found.lines; box.classList.toggle('is-empty', !found.lines); }
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
      openMenu: () => { if (menu.hidden) toggleMenu(); },
      menuItems: () => [...menu.querySelectorAll?.('.score-lyrics__item') || []].map(b => b.textContent),
      status: () => ({enabled, trackId, asks, shown: !box.hidden, anchor: anchor ? {...anchor} : null,
        lines: trackId && byTrack.get(trackId)?.lines ? byTrack.get(trackId).lines.length : 0, source: trackId ? byTrack.get(trackId)?.source || null : null,
        offset: trackId && byTrack.get(trackId)?.offset ? {...byTrack.get(trackId).offset} : null, from: from.textContent,
        rowShown: box.classList.contains('is-flash') || box.classList.contains('is-hover') || box.classList.contains('is-menu'),
        menuOpen: !menu.hidden, hidden: Boolean(trackId && byTrack.get(trackId)?.hidden),
        now: current.textContent, before: before.textContent, after: after.textContent}),
      destroy: () => { if (frame && root.cancelAnimationFrame) root.cancelAnimationFrame(frame); if (flashTimer) cancel(flashTimer); box.remove(); }
    });
  }

  root.XinScoreLyrics = Object.freeze({create, storedLyrics, KEY, GAP, FLASH_MS});
})(globalThis);
