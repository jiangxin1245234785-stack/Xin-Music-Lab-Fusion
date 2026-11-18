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
//
// Track facts (2026-11-18): next to the lyrics, the song's facts in the outside world are asked for the same way
// (desktop/track-info.cjs: a hand-written .info.txt beside the song, the user's choice, the tags, then MusicBrainz) and
// handed over, not drawn: status().trackInfo, trackInfo(id) and snapshot().trackInfo carry {state, items: [{key, value,
// from}], source}. The radar's ticker tape prints them for a song without lyrics. The lyrics menu has a 「歌曲资料…」
// page: 重新查找 / 换一份 / 用本地文件… / 这首不显示 (显示 to undo).
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
    let anchorWidth = 0, anchorHeight = 0;
    const reasked = new Set();    // songs asked again once their vocal line came (at most once each per page)
    const sideWords = doc.getElementById?.('scoreSidebarLyrics');
    const compactWords = doc.getElementById?.('scoreCompactLyrics');
    const entry = doc.createElement('button');
    entry.type = 'button'; entry.className = 'score-lyrics-entry'; entry.id = 'scoreLyricsFind';
    entry.hidden = true;
    menu.id = 'scoreLyricsMenu';
    entry.setAttribute('aria-controls', menu.id);
    entry.setAttribute('aria-expanded', 'false');
    entry.addEventListener('click', event => { stop(event); toggleMenu(); });
    sideWords?.append(entry);
    let lyricSlot = null;
    function dockLyrics() {
      let target = null;
      if (sideWords && compactWords && stage.classList?.contains('score-layout-active')) {
        target = stage.classList.contains('score-layout-collapsed') || stage.classList.contains('ui-hidden') ? compactWords : sideWords;
      }
      if (target !== lyricSlot) {
        closeMenu();
        if (target) target.appendChild(box);
        else canvas.parentNode.insertBefore(box, canvas.nextSibling);
        box.removeAttribute('style');
        menu.removeAttribute('style');
        box.classList.remove('is-tight');
        lyricSlot = target;
        anchor = null;
        placedAt = -Infinity;
      }
      return target;
    }
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

    const infoByTrack = new Map();
    function askInfo(id) {
      if (!id || infoByTrack.has(id) || typeof bridge?.trackInfo !== 'function') return;
      const pending = {state: 'pending'};
      infoByTrack.set(id, pending);
      const duration = Number(audio?.duration);
      pending.promise = Promise.resolve(bridge.trackInfo(id, Number.isFinite(duration) ? duration : 0)).then(answer => {
        if (infoByTrack.get(id) !== pending) return;
        infoByTrack.set(id, answer?.ok ? {state: 'ready', items: Array.isArray(answer.items) ? answer.items : [], source: answer.source || null}
          : {state: answer?.hidden ? 'hidden' : 'none', items: [], reason: answer?.reason || 'none', source: null});
      }, () => { if (infoByTrack.get(id) === pending) infoByTrack.set(id, {state: 'none', items: [], reason: 'error', source: null}); });
    }
    const infoOf = id => { const v = infoByTrack.get(id); return v ? {state: v.state, items: (v.items || []).map(i => ({...i})), source: v.source ? JSON.parse(JSON.stringify(v.source)) : null, reason: v.reason || null} : {state: 'unknown', items: [], source: null, reason: null}; };
    function ask(id) {
      if (byTrack.has(id) || typeof bridge?.lyrics !== 'function') return;
      const pending = {lines: null, pending: true};
      byTrack.set(id, pending);
      asks++;
      const duration = Number(audio?.duration);
      pending.promise = Promise.resolve(bridge.lyrics(id, Number.isFinite(duration) ? duration : 0)).then(answer => {
        if (byTrack.get(id) !== pending) return;
        const parsed = answer?.ok && answer.lrc ? core.parseLrc(answer.lrc) : null;
        byTrack.set(id, parsed && parsed.timed ? {lines: parsed.lines, source: answer.source, file: answer.file || null, chosen: Boolean(answer.chosen), offset: answer.offset || null}
          : {lines: null, settled: true, reason: answer?.reason || 'none', hidden: Boolean(answer?.hidden), instrumental: Boolean(answer?.instrumental)});
        if (id === trackId) { shownIndex = null; fromKey = ''; flash(); }
      }, () => { if (byTrack.get(id) === pending) byTrack.set(id, {lines: null, settled: true, reason: 'network'}); });
    }

    // --- the menu ------------------------------------------------------------------------------------------------------
    let menuPage = 'home', searchTitle = '', searchArtist = '', shareUrl = '', preview = null, candidateList = null, menuRequest = 0;
    function closeMenu() {
      if (menu.hidden) return;
      menu.hidden = true; busy = false; menuRequest++;
      entry.setAttribute('aria-expanded', 'false');
      box.classList.remove('is-menu');
    }
    function item(text, onClick, {disabled = false, note = ''} = {}) {
      const b = doc.createElement('button'); b.type = 'button'; b.className = 'score-lyrics__item'; b.textContent = text; b.disabled = Boolean(disabled || busy);
      if (note) b.title = note;
      b.addEventListener('click', event => { stop(event); onClick(); });
      return b;
    }
    function act(action, extra = {}) {
      const id = trackId;
      if (!id || busy || typeof bridge?.lyricsMenu !== 'function') return Promise.resolve(null);
      const request = ++menuRequest;
      busy = true; drawMenu();
      const duration = Number(audio?.duration);
      return Promise.resolve(bridge.lyricsMenu(id, action, {...extra, duration: Number.isFinite(duration) ? duration : 0}))
        .then(answer => answer, () => ({ok: false, reason: 'error'}))
        .then(answer => {
          const currentMenu = request === menuRequest && id === trackId && !menu.hidden;
          if (currentMenu) busy = false;
          if (answer?.ok && !answer.canceled && action !== 'candidates' && action !== 'netease-preview') {
            byTrack.delete(id); reasked.delete(id);
            if (currentMenu) closeMenu();
            if (id === trackId && enabled && scene.status?.()?.active) ask(id);
          } else if (currentMenu) {
            if (action === 'refresh' && answer && !answer.ok && !byTrack.get(id)?.lines) {
              byTrack.set(id, {lines:null, settled:true, reason:answer.reason || 'error'});
            }
            drawMenu(answer && !answer.ok ? failText(answer.reason) : '');
          }
          if (!currentMenu) return null;
          return answer;
        });
    }
    function failText(reason) {
      if (reason === 'invalid-link' || reason === 'need-song-link') return say('score.lyricsBadLink', '请粘贴网易云的单曲分享链接。');
      if (reason === 'no-timed-lyrics') return say('score.lyricsLinkUntimed', '这份录音没有同步歌词。');
      if (['none','not-found','not-the-song','not-offered'].includes(reason)) return say('score.lyricsNoResult', '没有找到这份歌词。');
      if (reason === 'rate-limited' || reason === 'waiting') return say('score.lyricsWait', '歌词服务暂时限制了查询，请稍后再试。');
      if (reason === 'no-names') return say('score.lyricsNeedNames', '请填写歌名或艺人。');
      if (reason === 'chosen-file-missing') return say('score.lyricsMissingFile', '之前选的本地歌词文件已移走。');
      return say('score.lyricsServiceError', '暂时无法读取歌词，请稍后再试。');
    }
    function note(text, className = 'score-lyrics__note') {
      const row = doc.createElement('small');
      row.className = className;
      row.textContent = text;
      return row;
    }
    const clockText = duration => {
      if (!Number.isFinite(duration) || duration <= 0) return '';
      const seconds = Math.round(duration);
      return Math.floor(seconds / 60) + ':' + String(seconds % 60).padStart(2, '0');
    };
    function formField(form, id, label, value, update, limit) {
      const group = doc.createElement('label'), input = doc.createElement('input');
      input.id = id; input.type = 'text'; input.value = value;
      input.maxLength = limit; input.autocomplete = 'off'; input.disabled = busy;
      group.textContent = label;
      input.addEventListener('input', () => update(input.value));
      group.append(input);
      form.append(group);
    }
    function menuForm(page) {
      const form = doc.createElement('form');
      form.className = 'score-lyrics__form';
      const search = page === 'search';
      if (search) {
        formField(form, 'scoreLyricsQuery', say('score.lyricsTitleField', '歌名'), searchTitle, value => { searchTitle = value; }, 256);
        formField(form, 'scoreLyricsArtistQuery', say('score.lyricsArtistField', '艺人'), searchArtist, value => { searchArtist = value; }, 256);
      } else {
        formField(form, 'scoreLyricsShareUrl', say('score.lyricsLinkField', '网易云歌曲分享链接'), shareUrl, value => { shareUrl = value; }, 2048);
      }
      const submit = doc.createElement('button');
      submit.type = 'submit'; submit.className = 'score-lyrics__item'; submit.disabled = busy;
      submit.textContent = search ? say('score.lyricsSearch', '搜索歌词') : say('score.lyricsPreview', '预览歌词版本');
      form.append(submit);
      form.addEventListener('submit', event => {
        event.preventDefault();
        if (busy) return;
        if (search && !searchTitle.trim() && !searchArtist.trim()) { drawMenu(failText('no-names')); return; }
        if (!search && !shareUrl.trim()) { drawMenu(failText('invalid-link')); return; }
        preview = null; candidateList = null;
        const task = search ? act('candidates', {query: searchTitle.trim(), artist: searchArtist.trim()}) : act('netease-preview', {url: shareUrl.trim()});
        task.then(answer => {
          if (!answer?.ok) return;
          if (search) candidateList = answer.candidates || [];
          else preview = answer.candidate;
          drawMenu();
          (menu.querySelector?.('[data-lyrics-choice]') || menu.querySelector?.('input'))?.focus();
        });
      });
      return form;
    }
    function enterMenuPage(page) {
      candidateList = null; preview = null; menuPage = page;
      if (page === 'search') {
        const title = doc.getElementById?.('fusionTrack')?.textContent || '';
        const artist = doc.getElementById?.('fusionArtist')?.textContent || '';
        const parsed = core.query?.({title, artist});
        searchTitle = parsed?.title || title;
        searchArtist = parsed?.artist || (['unknown artist','未知艺术家','—'].includes(artist.trim().toLowerCase()) ? '' : artist);
      } else if (page === 'netease') shareUrl = '';
      drawMenu();
      menu.querySelector?.('input:not([disabled]),button:not([disabled])')?.focus();
    }
    let infoList = null;
    function infoAct(action, extra = {}) {
      const id = trackId;
      if (!id || busy || typeof bridge?.trackInfoMenu !== 'function') return Promise.resolve(null);
      const request = ++menuRequest;
      busy = true; drawMenu();
      const duration = Number(audio?.duration);
      return Promise.resolve(bridge.trackInfoMenu(id, action, {...extra, duration: Number.isFinite(duration) ? duration : 0}))
        .then(answer => answer, () => ({ok: false, reason: 'error'}))
        .then(answer => {
          const currentMenu = request === menuRequest && id === trackId && !menu.hidden;
          if (currentMenu) busy = false;
          if (answer?.ok && !answer.canceled && action !== 'candidates') { infoByTrack.delete(id); infoList = null; askInfo(id); }
          if (currentMenu) drawMenu(answer && !answer.ok ? failText(answer.reason) : (answer?.ok && action !== 'candidates' && !answer.canceled ? say('score.infoDone', '资料已更新') : ''));
          return currentMenu ? answer : null;
        });
    }
    function drawInfoPage() {
      const info = infoByTrack.get(trackId) || {};
      const where = info.source?.kind ? say('score.infoFrom.' + info.source.kind, info.source.kind) : '';
      menu.append(note(info.state === 'ready' ? say('score.infoCount', '歌曲资料 · {count} 项', {count: (info.items || []).length}) + (where ? ' · ' + where : '')
        : info.state === 'hidden' ? say('score.infoHidden', '这首不显示歌曲资料') : say('score.infoNone', '没有找到歌曲资料'), 'score-lyrics__result'));
      if (infoList) {
        if (!infoList.length) menu.append(note(say('score.infoNoOther', 'MusicBrainz 上没有别的版本')));
        for (const c of infoList) {
          const label = [c.album || c.title, c.date, c.country, clockText(c.duration)].filter(Boolean).join(' · ');
          const choice = item(label, () => infoAct('choose', {id: c.id}), {note: label});
          choice.dataset.infoChoice = String(c.id); menu.append(choice);
        }
        menu.append(item(say('score.lyricsBack', '返回'), () => { infoList = null; drawMenu(); }));
        return;
      }
      menu.append(item(say('score.infoRefresh', '重新查找资料'), () => infoAct('refresh')));
      if (info.state !== 'hidden') menu.append(item(say('score.infoOther', '换一份资料'), () => infoAct('candidates').then(answer => { if (answer?.ok) { infoList = answer.candidates || []; drawMenu(); } })));
      menu.append(item(say('score.infoFile', '用本地资料文件…'), () => infoAct('file')));
      menu.append(info.state === 'hidden' ? item(say('score.infoShow', '显示歌曲资料'), () => infoAct('show')) : item(say('score.infoHide', '这首不显示歌曲资料'), () => infoAct('hide')));
      menu.append(item(say('score.lyricsBack', '返回'), () => { menuPage = 'home'; infoList = null; drawMenu(); }));
    }
    function drawMenu(message = '') {
      if (menu.hidden) return;
      const found = byTrack.get(trackId) || {};
      menu.replaceChildren();
      if (menuPage === 'info') {
        drawInfoPage();
        if (message || busy) { const status = note(busy ? say('score.lyricsWorking', '正在处理…') : message); status.setAttribute('role','status'); menu.append(status); }
        return;
      }
      if (menuPage === 'search' || menuPage === 'netease') {
        if (menuPage === 'search' || !preview) menu.append(menuForm(menuPage));
        if (candidateList) {
          if (!candidateList.length) menu.append(note(say('score.lyricsNoOther', 'LRCLIB 上没有别的带时间的版本')));
          for (const c of candidateList) {
            const label = [c.title, c.artist, c.album, clockText(c.duration)].filter(Boolean).join(' · ');
            const choice = item(label, () => act('choose', {id:c.id}), {note:label});
            choice.dataset.lyricsChoice = String(c.id);
            menu.append(choice);
          }
        }
        if (preview) {
          menu.append(note([preview.title, preview.artist, preview.album, clockText(preview.duration), say('score.lyricsLines', '{count} 行', {count: preview.lines})].filter(Boolean).join(' · '), 'score-lyrics__result'));
          if (preview.recordingMismatch) menu.append(note(say('score.lyricsDifferentVersion', '曲目信息与本地录音有差异，请核对版本。')));
          const use = item(say('score.lyricsUseVersion', '使用这份歌词'), () => act('netease-choose', {id:preview.id}));
          use.id = 'scoreLyricsConfirm'; use.dataset.lyricsChoice = String(preview.id); menu.append(use);
        }
        menu.append(item(say('score.lyricsBack', '返回'), () => enterMenuPage('home')));
      } else if (candidateList) {
        const list = candidateList;
        if (!list.length) menu.append(Object.assign(doc.createElement('small'), {className: 'score-lyrics__note', textContent: say('score.lyricsNoOther', 'LRCLIB 上没有别的带时间的版本')}));
        for (const c of list) {
          const m = Math.floor(c.duration / 60), s = String(Math.round(c.duration % 60)).padStart(2, '0');
          const label = [c.album || c.title, `${m}:${s}`, say('score.lyricsLines', '{count} 行', {count: c.lines})].filter(Boolean).join(' · ');
          menu.append(item(label, () => act('choose', {id: c.id})));
        }
        menu.append(item(say('score.lyricsBack', '返回'), () => { candidateList = null; drawMenu(); }));
      } else if (lyricSlot === sideWords && sideWords) {
        if (found.instrumental) {
          menu.append(item(say('score.lyricsUndoInstrumental', '撤销无歌词标记'), () => act('undo-instrumental')));
        } else if (found.hidden) {
          menu.append(item(say('score.lyricsShow', '显示歌词'), () => act('show')));
        } else {
          menu.append(item(say('score.lyricsSearch', '搜索歌词'), () => enterMenuPage('search')));
          menu.append(item(say('score.lyricsNetEaseLink', '粘贴网易云链接…'), () => enterMenuPage('netease')));
          menu.append(item(say('score.lyricsFileMenu', '用本地文件…'), () => act('file')));
          if (!found.lines) menu.append(item(say('score.lyricsRefresh', '重新查找'), () => act('refresh')));
          menu.append(item(say('score.lyricsMarkInstrumental', '标记为无歌词'), () => act('instrumental')));
          if (found.lines) menu.append(item(say('score.lyricsHide', '这首不显示歌词'), () => act('hide')));
        }
      } else {
        menu.append(item(say('score.lyricsRefresh', '重新查找'), () => act('refresh')));
        if (!found.hidden) menu.append(item(say('score.lyricsOther', '换一份'), () => act('candidates').then(answer => {
          if (answer?.ok) { candidateList = answer.candidates || []; drawMenu(); }
        })));
        menu.append(item(say('score.lyricsFileMenu', '用本地文件…'), () => act('file')));
        menu.append(found.hidden ? item(say('score.lyricsShow', '显示歌词'), () => act('show'))
          : item(say('score.lyricsHide', '这首不显示歌词'), () => act('hide')));
      }
      if (menuPage === 'home' && !candidateList && typeof bridge?.trackInfoMenu === 'function') {
        const facts = item(say('score.infoMenu', '歌曲资料…'), () => { menuPage = 'info'; infoList = null; drawMenu(); });
        facts.dataset.infoMenu = '1'; menu.append(facts);
      }
      if (message || busy) {
        const status = note(busy ? say('score.lyricsWorking', '正在处理…') : message);
        status.setAttribute('role','status'); menu.append(status);
      }
    }
    function toggleMenu() {
      if (!menu.hidden) { closeMenu(); return; }
      candidateList = null; preview = null; infoList = null; menuPage = 'home'; menu.hidden = false;
      entry.setAttribute('aria-expanded', 'true');
      box.hidden = false; box.classList.add('is-menu'); drawMenu();
    }
    doc.addEventListener?.('pointerdown', event => { if (!menu.hidden && !box.contains?.(event.target) && !entry.contains?.(event.target)) closeMenu(); }, true);
    menu.addEventListener('keydown', event => {
      if (event.key === 'Escape') { event.preventDefault(); closeMenu(); (entry.hidden ? more : entry).focus?.(); }
      event.stopPropagation();
    });

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
      if (found.source === 'netease') return say('score.lyricsNetEase', '网易云音乐');
      return found.chosen ? say('score.lyricsChosen', 'LRCLIB（你选的那份）') : 'LRCLIB';
    }

    const signed = value => (value > 0 ? '+' : value < 0 ? '−' : '') + Math.abs(value).toFixed(1);
    function fromText(found) {
      if (!found.lines) {
        if (found.instrumental) return say('score.lyricsInstrumental', '已标记为无歌词');
        if (found.hidden) return say('score.lyricsHidden', '这首不显示歌词');
        return stateFor(found) === 'unavailable' ? failText(found.reason) : say('score.lyricsNone', '没有找到歌词');
      }
      const parts = [say('score.lyricsFrom', '歌词来自 {source}', {source: sourceName(found)})];
      const o = found.offset;
      if (o && o.sure && Number(o.auto)) parts.push(say('score.lyricsAligned', '已对齐 {shift} 秒', {shift: signed(Number(o.auto))}));
      if (o && Number(o.manual)) parts.push(say('score.lyricsManual', '手调 {shift} 秒', {shift: signed(Number(o.manual))}));
      return parts.join(' · ');
    }
    // A song with no singing (its vocal line is made and has nothing sung): no "没有找到歌词" row for it.
    const noSinging = status => status.health?.vocals?.state === 'current' && status.health?.contour && status.health.contour.ok === false;

    function stateFor(found) {
      if (!found || found.pending) return 'pending';
      if (found.lines) return 'ready';
      if (found.instrumental) return 'instrumental';
      if (found.hidden) return 'hidden';
      if (['none','not-found','no-names','no-timed-lyrics','not-the-song','chosen-file-missing'].includes(found.reason)) return 'missing';
      return 'unavailable';
    }
    let entryLabelKey = '';
    function showEntry(state, slot) {
      if (stage.dataset && stage.dataset.scoreLyricState !== state) stage.dataset.scoreLyricState = state;
      const managed = state === 'instrumental' || state === 'hidden';
      const visible = sideWords && slot === sideWords && (managed || state === 'missing' || state === 'unavailable');
      if (entry.hidden !== !visible) entry.hidden = !visible;
      if (visible) {
        const key = (managed ? 'manage' : 'find') + (doc.documentElement?.lang || '');
        if (entryLabelKey !== key) {
          entryLabelKey = key;
          entry.textContent = managed ? say('score.lyricsManage', '歌词设置…') : say('score.lyricsFind', '找歌词…');
        }
      }
    }
    function render() {
      const slot = dockLyrics();
      const status = scene.status?.();
      if (!enabled || !status?.active || !status.trackId || (!slot && status.status !== 'ready')) {
        showEntry(enabled ? 'idle' : 'off', slot); hide(); return;
      }
      if (status.trackId !== trackId) {
        trackId = status.trackId; anchor = null; placedAt = -Infinity; shownIndex = null; fromKey = '';
        current.textContent = before.textContent = after.textContent = from.textContent = ''; closeMenu();
      }
      // The vocal line arrived after the lyrics were asked for (XML prepares it, B7 A): ask once more for the estimate.
      const asked = byTrack.get(trackId);
      if (asked?.lines && asked.offset && asked.offset.why === 'no-vocal-line' && !reasked.has(trackId) && status.health?.contour?.ok) {
        reasked.add(trackId); byTrack.delete(trackId);
      }
      ask(trackId); askInfo(trackId);
      const found = byTrack.get(trackId);
      showEntry(stateFor(found), slot);
      const view = scene.viewHandle?.();
      const empty = found && !found.lines && found.settled;
      if ((!view && !slot) || !found || (!found.lines && !empty) ||
          (empty && !slot && !found.hidden && noSinging(status))) { hide(); return; }
      if (empty && slot && menu.hidden) {
        hide();
        return;
      }
      const width = canvas.clientWidth, height = canvas.clientHeight;
      if (!slot && (!width || !height)) { hide(); return; }
      const x = width * (Number(view?.options?.().playhead) || 0);
      if (!slot && (now() - placedAt > PLACE_EVERY || width !== anchorWidth || height !== anchorHeight)) {
        anchor = place(view, width, height, x); placedAt = now(); anchorWidth = width; anchorHeight = height;
      }
      if (!slot && !anchor) { hide(); return; }
      if (empty) {
        // Only the faint row, on the same terms as the source row (a moment after opening, then while pointed at).
        if (shownIndex !== -2) { shownIndex = -2; current.textContent = before.textContent = after.textContent = ''; }
      } else {
        const time = view && status.status === 'ready' ? view.timeAt(x) : (Number(audio?.currentTime) || 0) - (Number(status.latencyMs) || 0) / 1000;
        const at = core.lineAt(found.lines, time - shiftOf(found));
        if (!at.now && !at.after && menu.hidden && (!sideWords || slot !== sideWords)) { hide(); return; }
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
      if (slot) {
        box.hidden = false;
        box.dataset.anchor = slot === sideWords ? 'sidebar' : 'compact';
        return;
      }
      const left = canvas.offsetLeft + x - 2;
      box.style.left = `${Math.round(left)}px`;
      box.style.maxWidth = `${Math.max(80, Math.round(canvas.offsetLeft + width - left - 16))}px`;
      box.hidden = false;
      // Prefer the space above the named lane, but keep the expanded lines inside the
      // score when the vocal lane comes first. The menu floats beside these words.
      box.classList.toggle('is-tight', anchor.top < 100);
      const margin = 4, boxHeight = box.offsetHeight;
      const relativeTop = Math.max(margin, Math.min(anchor.top - GAP - boxHeight, height - boxHeight - margin));
      box.style.top = Math.round(canvas.offsetTop + relativeTop) + 'px';
      if (!menu.hidden) {
        const boxLeft = left - canvas.offsetLeft, boxRight = boxLeft + box.offsetWidth;
        const rightRoom = width - boxRight - 2 * margin, leftRoom = boxLeft - 2 * margin;
        const goRight = rightRoom >= 158 || rightRoom >= leftRoom;
        const sideRoom = goRight ? rightRoom : leftRoom;
        if (sideRoom >= 128) {
          menu.style.maxWidth = Math.floor(sideRoom) + 'px';
          menu.style.left = goRight ? (box.offsetWidth + margin) + 'px' : 'auto';
          menu.style.right = goRight ? 'auto' : (box.offsetWidth + margin) + 'px';
          menu.style.top = (margin - relativeTop) + 'px';
          menu.style.maxHeight = Math.max(36, Math.min(height - 2 * margin, anchor.top - 2 * margin)) + 'px';
        } else {
          // Very narrow screens: put the scrollable popup on its own row.
          menu.style.left = '0px'; menu.style.right = 'auto'; menu.style.top = (boxHeight + margin) + 'px';
          menu.style.maxWidth = Math.max(64, width - boxLeft - margin) + 'px';
          menu.style.maxHeight = Math.max(32, height - relativeTop - boxHeight - 2 * margin) + 'px';
        }
      }
      box.dataset.anchor = anchor.vocal ? 'vocals' : 'top';
    }

    function snapshot(id = trackId) {
      const found = byTrack.get(id);
      const available = !found?.hidden && Boolean(found?.lines?.length);
      return {trackId: id, enabled: enabled && !found?.hidden, alignment: available,
        offset: shiftOf(found), lines: available ? found.lines : [], trackInfo: infoOf(id)};
    }
    async function exportData(id = trackId) {
      if (enabled && id) { ask(id); await byTrack.get(id)?.promise; }
      return snapshot(id);
    }
    function loop() { frame = raf(loop); try { render(); } catch (_) { hide(); } }
    frame = raf(loop);
    return Object.freeze({
      render, snapshot, exportData,
      trackInfo: (id = trackId) => { askInfo(id); return infoOf(id); },
      openMenu: () => { if (menu.hidden) toggleMenu(); },
      menuItems: () => [...menu.querySelectorAll?.('.score-lyrics__item') || []].map(b => b.textContent),
      status: () => ({enabled, trackId, asks, shown: !box.hidden, state: stage.dataset?.scoreLyricState, anchor: anchor ? {...anchor} : null,
        lines: trackId && byTrack.get(trackId)?.lines ? byTrack.get(trackId).lines.length : 0, source: trackId ? byTrack.get(trackId)?.source || null : null,
        offset: trackId && byTrack.get(trackId)?.offset ? {...byTrack.get(trackId).offset} : null, from: from.textContent,
        rowShown: box.classList.contains('is-flash') || box.classList.contains('is-hover') || box.classList.contains('is-menu'),
        menuOpen: !menu.hidden, hidden: Boolean(trackId && byTrack.get(trackId)?.hidden), trackInfo: trackId ? infoOf(trackId) : null,
        now: current.textContent, before: before.textContent, after: after.textContent}),
      destroy: () => { if (frame && root.cancelAnimationFrame) root.cancelAnimationFrame(frame); if (flashTimer) cancel(flashTimer); box.remove(); entry.remove(); }
    });
  }

  root.XinScoreLyrics = Object.freeze({create, storedLyrics, KEY, GAP, FLASH_MS});
})(globalThis);
