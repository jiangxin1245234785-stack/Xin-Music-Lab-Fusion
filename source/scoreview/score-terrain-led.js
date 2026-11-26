// In-car LED dot-matrix display for the 车窗地貌 look: the passenger panel above the window (title / station call /
// time + route strip), the lyric strip on the sill, and the two "now" arrows on the window frame.
//
// Self-contained: give it a 2D context, rectangles and data. Drawing is a pure function of its arguments; the only
// memory kept between calls is pure caches (glyph bitmaps, dot sprites, rendered strips keyed by their content).
//
// API (every call takes an optional last argument `opts` = {dpr = 1, pitch, big, small, idle}):
//   drawHeader(ctx, rect, {title, artist, section, nextSection, time, duration, sections, now}, opts)
//       rect = the panel housing {x, y, w, h}. sections = [{name, start, end}] (or [start, end, name] rows as in the
//       bundles). The first two rows carry the tags, next section and countdown, distance and song clock.
//       Column widths are measured once for the whole route. A long title can use the entire first row.
//       An overflowing name travels on its own song-time clock in whole glyphs. With no artist tag, "artist - title"
//       is split. The third line is the route, one station per section, equally spaced:
//       stations passed dim, this one brightest and boxed, the next one's name medium and its lamp blinking once a
//       second of song time, the later ones dimmest; the line lit as far as the song has come.
//   drawLyric(ctx, rect, {line, progress}, opts)
//       rect = the sill strip housing. progress 0..1 = how far into the line's sung time. Empty line: draws nothing
//       (opts.idle === 'dim' draws the housing with its unlit dots only).
//   drawNowTick(ctx, x, yTop, yBottom, opts)
//       top arrow points down, its tip at yTop; bottom arrow points up, its tip at yBottom. Both sit outside the
//       window opening (yTop = the opening's top edge, yBottom = its bottom edge). opts.pitch = dot pitch (3).
//   localizeSection(name): English labels (Intro, Chorus 2 ...) -> Chinese; anything else is returned as is.
//   setCanvasFactory(fn(w, h) -> canvas | null): for tests / hosts; null restores OffscreenCanvas / document.
//   clearCaches(), headerModel(), lyricPlan(), fit(), width(), cacheSize(): exposed for tests and tools.
// Text is rasterised with a system font (SimSun first) and sampled onto the dot grid, one glyph at a time. Without any
// canvas the glyphs degrade to hollow boxes and the frame is painted directly; nothing throws.
(function (root) {
  'use strict';

  const finite = Number.isFinite;
  const clamp = (n, lo, hi) => Math.max(lo, Math.min(hi, n));
  const FONT = 'SimSun, "Microsoft YaHei", "Noto Sans CJK SC", "Noto Sans CJK JP", "PingFang SC", "Yu Gothic", sans-serif';
  const LEVEL = [null, [104, 50, 14], [160, 86, 24], [214, 120, 34], [255, 176, 64]];
  const OFF = [44, 22, 8];
  const GLOW = [255, 150, 50];
  const GLOW_ALPHA = [0, .08, .13, .2, .3];
  const THEMES = {
    amber: {level: LEVEL, off: OFF, glow: GLOW, glowAlpha: GLOW_ALPHA, bg: '#040404', rim: 'rgba(200,206,212,.16)', body: ['#2a2c2f', '#111214', '#0b0c0d'], sheen: [255, 255, 255]},
    vfd: {
      level: [null, [35, 76, 72], [70, 141, 134], [125, 194, 183], [181, 214, 205]],
      off: [12, 28, 29],
      glow: [85, 191, 174],
      glowAlpha: [0, .075, .115, .17, .225],
      bg: '#071012',
      rim: 'rgba(130,196,192,.14)',
      body: ['#141a1d', '#080c0e', '#050809'],
      sheen: [164, 206, 194]
    }
  };
  const themeOf = name => THEMES[name] || THEMES.amber;
  const css = (c, a = 1) => `rgba(${c[0]},${c[1]},${c[2]},${a})`;
  const ROW_PAD = 2.6; // housing height = (rows + ROW_PAD) pitches
  const CACHE_LIMIT = 10;

  // ---------- canvases ----------
  let factory = null;
  function newCanvas(w, h) {
    w = Math.max(1, Math.ceil(w)); h = Math.max(1, Math.ceil(h));
    try {
      if (factory) return factory(w, h);
      if (typeof OffscreenCanvas === 'function') return new OffscreenCanvas(w, h);
      if (typeof document !== 'undefined' && document.createElement) {
        const c = document.createElement('canvas'); c.width = w; c.height = h; return c;
      }
    } catch (e) { /* no canvas here */ }
    return null;
  }
  function context(canvas, read) {
    if (!canvas) return null;
    try { return canvas.getContext('2d', read ? {willReadFrequently: true} : undefined) || null; } catch (e) { return null; }
  }

  // ---------- glyphs ----------
  const glyphCache = new Map();
  const measurers = new Map();
  const WIDE = /[ᄀ-ᇿ…⺀-鿿가-힯豈-﫿＀-￯　-〿]/;
  function measurer(size) {
    if (measurers.has(size)) return measurers.get(size);
    const g = context(newCanvas(4, 4), true);
    if (g) g.font = size + 'px ' + FONT;
    measurers.set(size, g);
    return g;
  }
  function advanceOf(ch, size) {
    const g = measurer(size);
    if (g && g.measureText) {
      const w = g.measureText(ch).width;
      if (finite(w) && w > 0) return Math.max(1, Math.round(w));
    }
    return WIDE.test(ch) ? size : Math.ceil(size / 2);
  }
  function digitAdvance(size) { // digits share one advance, so the clock does not jitter
    const key = size + '|digits';
    if (!glyphCache.has(key)) { let w = 1; for (let d = 0; d < 10; d++) w = Math.max(w, advanceOf(String(d), size)); glyphCache.set(key, w); }
    return glyphCache.get(key);
  }
  function glyph(ch, size) {
    const key = size + '|' + ch;
    const hit = glyphCache.get(key);
    if (hit) return hit;
    const adv = /[0-9]/.test(ch) ? digitAdvance(size) : advanceOf(ch, size);
    let bits = null;
    if (ch.trim() !== '') {
      const c = newCanvas(adv, size), g = context(c, true);
      if (g && g.getImageData) {
        try {
          g.clearRect && g.clearRect(0, 0, adv, size);
          g.font = size + 'px ' + FONT; g.fillStyle = '#fff'; g.textBaseline = 'alphabetic';
          g.fillText(ch, 0, Math.round(size * .85));
          const d = g.getImageData(0, 0, adv, size).data;
          bits = new Uint8Array(adv * size);
          for (let i = 0; i < bits.length; i++) bits[i] = d[i * 4 + 3] > 100 ? 1 : 0;
        } catch (e) { bits = null; }
      }
      if (!bits) { // degraded: a hollow box where the character would be
        bits = new Uint8Array(adv * size);
        const y0 = Math.round(size * .15), y1 = Math.round(size * .8);
        for (let y = y0; y <= y1; y++) for (let x = 1; x < adv - 1; x++) if (y === y0 || y === y1 || x === 1 || x === adv - 2) bits[y * adv + x] = 1;
      }
    }
    const out = {w: adv, h: size, bits};
    glyphCache.set(key, out);
    return out;
  }
  const chars = s => Array.from(String(s));
  function width(str, size) { let w = 0; for (const ch of chars(str)) w += glyph(ch, size).w; return w; }
  function fit(str, size, maxW) {
    str = String(str);
    if (width(str, size) <= maxW) return str;
    const list = chars(str), tail = width('…', size);
    let out = '', w = 0;
    for (const ch of list) { const cw = glyph(ch, size).w; if (w + cw + tail > maxW) break; out += ch; w += cw; }
    return w + tail <= maxW ? out + '…' : '';
  }

  // ---------- dot map ----------
  function dotMap(cols, rows) {
    const a = new Uint8Array(cols * rows);
    return {
      cols, rows, a,
      set(x, y, l) { x = Math.round(x); y = Math.round(y); if (x >= 0 && x < cols && y >= 0 && y < rows && a[y * cols + x] < l) a[y * cols + x] = l; },
      // whole = true: a character that would be cut by x0 or x1 is left out entirely (no half characters at the edges)
      text(str, size, x, y, l, x0 = 0, x1 = cols, whole = false) {
        let cx = x;
        for (const ch of chars(str)) {
          const g = glyph(ch, size);
          if (cx >= x1) break;
          const cut = cx < x0 || cx + g.w > x1;
          if (g.bits && cx + g.w > x0 && !(whole && cut)) for (let j = 0; j < g.h; j++) for (let i = 0; i < g.w; i++) if (g.bits[j * g.w + i] && cx + i >= x0 && cx + i < x1) this.set(cx + i, y + j, l);
          cx += g.w;
        }
        return cx - x;
      }
    };
  }

  // ---------- section names ----------
  const ZH = {intro: '引子', verse: '主歌', 'pre-chorus': '导歌', prechorus: '导歌', chorus: '副歌', interlude: '间奏', instrumental: '间奏',
    inst: '间奏', bridge: '桥段', outro: '尾奏', transition: '过门', solo: '独奏', break: '间奏'};
  function localizeSection(name) {
    const m = String(name == null ? '' : name).trim().match(/^([A-Za-z][A-Za-z -]*?)\s*(\d+)?$/);
    if (!m) return String(name == null ? '' : name);
    const zh = ZH[m[1].toLowerCase().replace(/\s+/g, '-')];
    return zh ? zh + (m[2] ? ' ' + m[2] : '') : String(name);
  }
  // English station names for the route board (batch 6, item 5; the user: 「上方的屏幕文字都改成英文」): Chinese or English
  // section names to upper-case English, the number kept (主歌 1 -> VERSE 1); a name it does not know stays as it is.
  // Full names for the trackside signs and instrumental sill. The route board has its own short labels below.
  const EN = {'引子': 'INTRO', '前奏': 'INTRO', '主歌': 'VERSE', '导歌': 'PRE', '導歌': 'PRE', '副歌': 'CHORUS', '间奏': 'BREAK', '間奏': 'BREAK',
    '器乐段': 'INST', '器乐': 'INST', '器樂段': 'INST', '独奏': 'SOLO', '獨奏': 'SOLO', '桥段': 'BRIDGE', '橋段': 'BRIDGE', '尾奏': 'OUTRO', '尾声': 'OUTRO', '尾聲': 'OUTRO',
    intro: 'INTRO', verse: 'VERSE', 'pre-chorus': 'PRE', prechorus: 'PRE', pre: 'PRE', chorus: 'CHORUS', interlude: 'BREAK', break: 'BREAK',
    instrumental: 'INST', inst: 'INST', solo: 'SOLO', bridge: 'BRIDGE', outro: 'OUTRO'};
  function englishSection(name) {
    const raw = String(name == null ? '' : name).trim(), m = raw.match(/^(.+?)\s*(\d+)?$/);
    if (!m) return raw;
    const key = m[1].toLowerCase().replace(/\s+/g, '-');
    const en = Object.hasOwn(EN, key) && EN[key];
    return en ? en + (m[2] ? ' ' + m[2] : '') : raw;
  }
  function stationName(name, kind, order) {
    const label = englishSection(name);
    if (/[A-Za-z]/.test(label) && /^[\x20-\x7e]+$/.test(label)) return label.toUpperCase();
    const number = label.match(/\d+$/)?.[0];
    const fallback = englishSection(kind);
    return Object.hasOwn(EN, String(kind || '').trim().toLowerCase().replace(/\s+/g, '-'))
      ? fallback + (number ? ' ' + number : '') : 'SECTION ' + (order + 1);
  }
  // The host supplies the scenery's speed for the distance readout. Miles are rounded down to tenths.
  const METRES_PER_MILE = 1609.344;
  const milesOf = (seconds, speedMps) => num(seconds) * num(speedMps) / METRES_PER_MILE;
  const tenth = v => (Math.floor(v * 10 + 1e-9) / 10).toFixed(1);
  function readout(d, time, duration) {
    if (d && d.readout === 'miles' && finite(d.speedMps) && d.speedMps > 0) {
      return {now: tenth(milesOf(time, d.speedMps)), total: ' / ' + tenth(milesOf(duration, d.speedMps)) + ' MI'};
    }
    return {now: fmt(time), total: ' / ' + fmt(duration)};
  }
  function normSections(list) {
    return (Array.isArray(list) ? list : []).map(s => Array.isArray(s)
      ? {name: String(s[2] == null ? '' : s[2]), kind: s[4], start: +s[0], end: +s[1]}
      : {name: String(s && s.name != null ? s.name : ''), kind: s?.kind, start: +(s && s.start), end: +(s && s.end)}).filter(s => finite(s.start));
  }
  const num = v => (finite(+v) ? +v : 0);
  const fmt = s => { s = Math.max(0, Math.floor(num(s))); return Math.floor(s / 60) + ':' + String(s % 60).padStart(2, '0'); };
  const text = v => (v == null ? '' : String(v));

  // ---------- header model ----------
  const ROUTE_CODE = {INTRO: 'IN', VERSE: 'V', PRE: 'PR', CHORUS: 'C', BREAK: 'BK', BRIDGE: 'BR', SOLO: 'S', INST: 'IS', OUTRO: 'OUT'};
  function prepareRoute(sections) {
    const stops = normSections(sections);
    const labels = stops.map(({name}, i) => {
      const raw = name.normalize('NFKC').trim(), digits = raw.match(/\d+$/)?.[0] || '';
      const word = raw.slice(0, raw.length - digits.length).trim();
      const base = englishSection(word).toUpperCase();
      const code = Object.hasOwn(ROUTE_CODE, base) ? ROUTE_CODE[base] : '';
      const letters = code || (word.normalize('NFKD').toUpperCase().match(/\p{Script=Latin}/gu) || []).slice(0, 2).join('');
      // A long numeric identifier is not a useful LED station number. Use its route ordinal in that case.
      const number = digits.length > 3 ? String(i + 1) : digits;
      if (!letters) return 'X' + (number || (i + 1));
      return (code === 'BK' && stops.length > 18 ? 'B' : letters) + number;
    });
    const names = stops.map((s, i) => {
      const raw = s.name.normalize('NFKC').trim() || s.kind || '';
      const name = englishSection(raw).toUpperCase().replace(/^过门(?=\s|$)/, 'TRANSITION');
      return (/^[\x20-\x7e]+$/.test(name) ? name : stationName(raw, s.kind, i))
        .replace(/^PRE(?=\s|$)/, 'PRE-CHORUS').replace(/^INST(?=\s|$)/, 'INSTRUMENTAL');
    });
    return {stops, labels, names, key: labels.join('/')};
  }
  let labelLayouts = new WeakMap();
  function routeLabelPositions(route, plan, cols, size) {
    let cache = labelLayouts.get(route);
    if (!cache) { cache = new Map(); labelLayouts.set(route, cache); }
    const key = size + '|' + cols;
    if (cache.has(key)) return cache.get(key);
    const slots = route.labels.map((str, k) => {
      let advance = 0, left = Infinity, right = -1;
      for (const ch of str) {
        const g = glyph(ch, size);
        if (g.bits) for (let i = 0; i < g.bits.length; i++) if (g.bits[i]) {
          const x = advance + i % g.w;
          left = Math.min(left, x); right = Math.max(right, x);
        }
        advance += g.w;
      }
      const lamp = Math.round(plan.x0 + k * plan.step), half = Math.floor(plan.step / 2);
      const edge = Math.max(0, cols - advance);
      return {preferred: clamp(lamp - 1, 0, edge), lo: clamp(lamp - half, 0, edge), hi: clamp(lamp + half, 0, edge),
        left: finite(left) ? left : 0, right: right >= 0 ? right : advance - 1};
    });
    // Work backwards to reserve space, then stay as close as possible to each lamp's original left edge.
    // Nine unlit columns are wider than a word space. Even when a custom route is too dense, retain every label.
    const last = slots.length - 1, latest = [], positions = slots.map(s => s.preferred);
    for (let gap = 9; gap >= 0 && last >= 0; gap--) {
      latest[last] = slots[last].hi;
      let feasible = true;
      for (let k = last - 1; k >= 0; k--) {
        latest[k] = Math.min(slots[k].hi, latest[k + 1] + slots[k + 1].left - slots[k].right - gap - 1);
        if (latest[k] < slots[k].lo) { feasible = false; break; }
      }
      if (!feasible) continue;
      for (let k = 0; k <= last; k++) {
        const s = slots[k], lo = k ? Math.max(s.lo, positions[k - 1] + slots[k - 1].right + gap + 1 - s.left) : s.lo;
        positions[k] = clamp(s.preferred, lo, latest[k]);
      }
      break;
    }
    return remember(cache, key, positions);
  }
  function routePlan(S, now, duration, cols) {
    const n = S.length, step = n ? (cols - 4) / n : cols - 4;
    let cur = 0;
    for (let i = 0; i < n; i++) if (S[i].start <= now) cur = i;
    const next = S[cur + 1];
    const end = n ? (next ? next.start : (finite(duration) && duration > S[cur].start ? duration : S[cur].end)) : 0;
    const prog = n ? clamp((now - S[cur].start) / Math.max(1, end - S[cur].start), 0, 1) : clamp(now / Math.max(1, duration), 0, 1);
    const pos = n ? cur + prog : prog * 1; // stations passed, fractional
    const x0 = 2;
    return {n, step, cur, prog, pos, x0, litX: Math.round(x0 + (n ? pos * step : prog * (cols - 4)))};
  }
  function headerParts(d) {
    const route = d.route || prepareRoute(d.sections), S = route.stops, time = num(d.time), now = finite(+d.now) && d.now != null ? +d.now : time, duration = num(d.duration);
    const plan = (cols => routePlan(S, now, duration, cols));
    const named = splitTitle(text(d.title), text(d.artist));
    return {S, route, time, now, duration, plan, title: named.title, artist: named.artist, readout: readout(d, time, duration),
      miles: d.readout === 'miles' && finite(d.speedMps) && d.speedMps > 0};
  }
  // no artist in the tags and a title like 周杰伦 - 七里香: the artist is the part before the dash
  // A placeholder the tagger wrote ("Unknown Artist", 未知艺术家 ...) counts as no artist: in the user's library 七里香
  // carries "Unknown Artist" and the title 周杰伦 - 七里香 (seen in terrain.2's real window).
  const NO_ARTIST = /^\s*(<?unknown( artist)?>?|various artists?|未知(艺术家|歌手|藝術家|艺人)?|不明なアーティスト)?\s*$/i;
  function splitTitle(title, artist) {
    if (NO_ARTIST.test(artist)) {
      const m = title.match(/^\s*(.+?)\s+[-–—]\s+(.+?)\s*$/);
      return m ? {title: m[2], artist: m[1]} : {title, artist: ''};
    }
    return {title, artist};
  }
  const headerRows = (big, small) => big + small + 22;
  const nameEdges = new Map();
  function textLine(str, size, x1, y, time, x0 = 1) {
    const key = size + '|' + str;
    let edges = nameEdges.get(key);
    if (!edges) {
      edges = [0];
      for (const ch of str) edges.push(edges[edges.length - 1] + glyph(ch, size).w);
      remember(nameEdges, key, edges, 32);
    }
    const room = Math.max(0, x1 - x0), total = edges[edges.length - 1], over = total - room;
    let offset = 0;
    if (over > 0) {
      const halfPeriod = Math.max(8, edges.length * .6), phase = (Math.max(0, time) / halfPeriod) % 2;
      const k = clamp((1 - Math.abs(phase - 1) - .1) / .8, 0, 1);
      const target = k * over;
      let lo = 0, hi = edges.length - 1;
      while (lo < hi) {
        const mid = (lo + hi) >>> 1;
        if (edges[mid] < target) lo = mid + 1; else hi = mid;
      }
      offset = k < 1 && lo && target - edges[lo - 1] <= edges[lo] - target ? edges[lo - 1] : edges[lo];
    }
    return {str, size, x0, x1, y0: y, y1: y + size, total, room, scroll: over > 0, offset};
  }
  let boardLayouts = new WeakMap();
  // Reserve for the longest actual name, largest interval and final readouts. No measurement depends on the current stop.
  function boardLayout(P, cols, big, opts) {
    let cache = boardLayouts.get(P.route);
    if (!cache) { cache = new Map(); boardLayouts.set(P.route, cache); }
    const artistSize = opts.artistSize || (WIDE.test(P.artist) ? 13 : 12);
    const milesTotal = P.miles && P.duration > 0 ? P.readout.total.slice(3, -3) : '';
    const total = P.duration > 0 ? fmt(P.duration) : '';
    const key = JSON.stringify([cols, big, artistSize, opts.counterSize, P.title, P.artist, P.miles, milesTotal, P.duration]);
    if (cache.has(key)) return cache.get(key);
    const end = cols - 2, titleW = width(P.title, big), artistW = width(P.artist, artistSize);
    let interval = P.duration, previous = 0;
    if (P.S.length) {
      interval = 0;
      for (const s of P.S) { interval = Math.max(interval, s.start - previous); previous = s.start; }
      interval = Math.max(interval, P.duration - previous);
    }
    const count = fmt(interval), names = P.route.names || P.S.map(s => englishSection(s.name).toUpperCase());
    function measure(inline, nameSize, numberSize) {
      const labelSize = 12, countdownSize = inline ? 12 : 14;
      const name = Math.max(width('END', nameSize), ...names.map(s => width(s, nameSize)));
      const next = width('NEXT ', labelSize), tail = width('IN ', labelSize) + width(count, countdownSize);
      const distanceW = P.miles ? 2 * width(milesTotal || '0.0', numberSize) + width(' / ', numberSize) + width(' MI', labelSize) : 0;
      const clockSize = P.miles ? 12 : numberSize;
      const clockW = width(total || '0:00', clockSize) * 2 + width(' / ', clockSize);
      const showClock = !inline || !P.miles;
      return {nameSize, numberSize, labelSize, countdownSize, clockSize, showClock, next, tail,
        mid: inline ? next + name + 5 + tail : Math.max(next + name, tail),
        right: Math.max(distanceW, showClock ? clockW : 0)};
    }
    let mode = 'columns', gap = 12, info = measure(false, 18, opts.counterSize || 16);
    const free = () => end - 1 - 2 * gap - info.mid - info.right;
    const need = Math.max(titleW, artistW);
    if (need > free()) info = measure(false, 16, opts.counterSize || 14);
    let leftNeed = need;
    if (need > free()) {
      mode = 'full-title'; leftNeed = artistW;
      info = measure(true, 14, opts.counterSize || 14);
      if (leftNeed > free()) { gap = 8; info = measure(true, 12, 12); }
      if (leftNeed > free()) {
        // Both tags are very long. Give the artist the entire lower row and let the title travel in its own cell.
        mode = 'full-artist'; leftNeed = Math.min(titleW, Math.max(big, free()));
      }
    }
    // An unusually long custom section may scroll in its reserved cell. The labels and countdown stay anchored.
    info.right = Math.min(info.right, Math.max(0, end - 1 - 2 * gap - big - info.next - 5));
    info.mid = Math.min(info.mid, Math.max(0, end - 1 - 2 * gap - big - info.right));
    const spare = Math.max(0, free() - leftNeed);
    const left = Math.max(1, Math.min(free(), leftNeed + Math.round(spare * .22)));
    const middle = 1 + left + gap, right = end - info.right - Math.round(spare * .26);
    return remember(cache, key, {key, names, mode, artistSize, gap, middle, right, end, info, total, milesTotal});
  }
  function headerLines(P, cols, big, opts, plan, board = boardLayout(P, cols, big, opts)) {
    const {mode, middle, right, end, gap, info} = board;
    const inline = mode !== 'columns', artistWide = mode === 'full-artist';
    const upper = Math.round(.85 * big), lower = big + 14, row = inline && !artistWide ? lower : upper;
    const top = (base, size) => Math.max(0, base - Math.round(.85 * size));
    const title = textLine(P.title, big, mode === 'full-title' ? end : middle - gap, 0, P.time);
    const artist = textLine(P.artist, board.artistSize, artistWide ? end : middle - gap, top(lower, board.artistSize), P.time);
    const nextIndex = P.S.length && P.now < P.S[0].start ? 0 : plan.cur + 1;
    const next = P.S[nextIndex], name = next ? board.names[nextIndex] : 'END';
    const target = next ? next.start : P.duration, remaining = target > 0 || next ? fmt(target - P.now) : '';
    const fields = [], live = [];
    function field(str, size, x, base, level, dynamic = false) {
      const item = {str, size, x0:x, x1:x + width(str,size), y0:top(base,size), y1:top(base,size)+size, offset:0, level};
      fields.push(item); if (dynamic) live.push(item); return item;
    }
    const midEnd = right - gap;
    field('NEXT ', info.labelSize, middle, row, 2);
    const countX = inline ? midEnd - info.tail : middle;
    const nextLine = textLine(name, info.nameSize, inline ? countX - 5 : midEnd, top(row,info.nameSize), P.time, middle + info.next);
    if (remaining) {
      const base = inline ? row : lower;
      const word = field('IN ', info.labelSize, countX, base, 2);
      field(remaining, info.countdownSize, word.x1, base, 4, true);
    }
    function counter(value, total, size, base, level, unit) {
      let x = end;
      if (unit) { x -= width(unit, info.labelSize); field(unit, info.labelSize, x, base, 2); }
      if (total) {
        x -= width(total, size); field(total, size, x, base, level);
        x -= width(' / ', size); field(' / ', size, x, base, 2);
      }
      field(value, size, x - width(value, size), base, level, true);
    }
    if (P.miles) counter(P.readout.now, board.milesTotal, info.numberSize, row, 4, ' MI');
    if (info.showClock) counter(fmt(P.time), board.total, info.clockSize, P.miles ? lower : row, P.miles ? 3 : 4, '');
    return {board, title, artist, nextLine, name, remaining, fields, live,
      dividers: [middle - Math.ceil(gap/2), right - Math.ceil(gap/2)],
      dividerTop: inline && !artistWide ? big + 1 : 0, dividerBottom: artistWide ? big - 1 : big + 15};
  }
  function paintLine(M, line, level) {
    M.text(line.str, line.size, line.x0 - line.offset, line.y0, level, line.x0, line.x1, true);
  }
  function routeLamps(M, r, yL, blinkOn, first, last) {
    const sx = k => Math.round(r.x0 + r.step * k), endX = sx(r.n) - 2;
    for (let x = Math.max(first, sx(0)); x <= Math.min(last, endX); x++) {
      const pos = (x - r.x0) / r.step;
      M.set(x, yL, x <= r.litX ? (pos >= r.cur ? 4 : 2) : 1);
    }
    for (let k = 0; k < r.n; k++) {
      const x = sx(k);
      if (x + 2 < first || x - 2 > last) continue;
      const l = k < r.cur ? 2 : k === r.cur ? 4 : k === r.cur + 1 && blinkOn ? 4 : 1;
      for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
        if (k === r.cur || dx === 0 || dy === 0) M.set(x + dx, yL + dy, l);
      }
      if (k === r.cur) for (let dx = -2; dx <= 2; dx++) { M.set(x + dx, yL - 2, 4); M.set(x + dx, yL + 2, 4); }
    }
    for (let dy = -1; dy <= 1; dy++) M.set(endX, yL + dy, 1);
  }
  function headerModel(d, cols, rows, big, small, opts = {}, P = headerParts(d), r = P.plan(cols), lines = headerLines(P, cols, big, opts, r)) {
    const M = dotMap(cols, rows);
    paintLine(M, lines.title, 4); paintLine(M, lines.artist, 3); paintLine(M, lines.nextLine, 4);
    for (const f of lines.fields) paintLine(M, f, f.level);
    for (const x of lines.dividers) for (let y = lines.dividerTop; y <= lines.dividerBottom; y += 2) M.set(x,y,1);
    const S = P.S, yL = rows - small - 3, step = r.step, sx = k => Math.round(r.x0 + step * k);
    const regions = {route: null};
    const result = {map: M, title: P.title, plan: r, labels: null, regions, lines, routeY: yL};
    const blinkOn = Math.floor(P.time * 2) % 2 === 0; // the next station's lamp: on the first half of every song second
    if (!S.length) return result;
    const endX = Math.round(r.x0 + step * Math.max(1, S.length)) - 2;
    routeLamps(M, r, yL, blinkOn, 0, cols - 1);
    const labels = P.route.labels, positions = routeLabelPositions(P.route, r, cols, small);
    for (let k = 0; k < S.length; k++) {
      const l = k < r.cur ? 2 : k === r.cur ? 4 : k === r.cur + 1 ? 3 : 1;
      M.text(labels[k], small, positions[k], yL + 3, l);
    }
    regions.route = {x0: sx(r.cur) + 2, x1: endX + 1, y0: yL - 1, y1: yL + 2};
    result.labels = labels;
    result.labelX = positions;
    return result;
  }
  function clearRegion(map, region) {
    if (!region) return;
    const x0 = clamp(region.x0, 0, map.cols), x1 = clamp(region.x1, x0, map.cols);
    for (let y = region.y0; y < region.y1; y++) map.a.fill(0, y * map.cols + x0, y * map.cols + x1);
  }

  // ---------- lyric plan ----------
  const LYRIC_SIZE = 12;
  function lyricPlan(line, progress, W, H, opts = {}) {
    const rows = LYRIC_SIZE, p0 = opts.pitch || H / (rows + ROW_PAD), inset = 1.7 * p0, areaW = Math.max(1, W - 2 * inset);
    const textW = width(line, LYRIC_SIZE), need = textW + 4;
    const floor = Math.min(p0, Math.max(p0 * .72, 1.9));
    let pitch = p0, scroll = false, offset = 0;
    if (need * p0 > areaW) {
      pitch = areaW / need;
      if (pitch < floor) { pitch = floor; scroll = true; }
    }
    const cols = Math.max(1, Math.floor(areaW / pitch));
    if (scroll) {
      const view = cols - 4, over = Math.max(0, textW - view);
      const k = clamp((num(progress) - .1) / .8, 0, 1); // hold the start, hold the end
      // scroll a whole character at a time, so the left edge never shows half a character; at the end, far enough to
      // show the last one whole
      const edges = [0]; for (const ch of chars(line)) edges.push(edges[edges.length - 1] + glyph(ch, LYRIC_SIZE).w);
      const want = k * over;
      offset = k >= 1 ? edges.find(e => e >= over) : edges.reduce((b, e) => Math.abs(e - want) < Math.abs(b - want) ? e : b, 0);
    }
    return {rows, pitch, cols, inset, scroll, offset, textW, p0, x: scroll ? 2 - offset : Math.round((cols - textW) / 2)};
  }

  // ---------- sprites and strips ----------
  const sprites = new Map(), strips = new Map(), bases = new Map();
  const SPRITE_LIMIT = 24;
  function remember(map, key, value, limit = CACHE_LIMIT) {
    map.set(key, value);
    if (map.size > limit) map.delete(map.keys().next().value);
    return value;
  }
  function sprite(level, pitch, dpr, theme = 'amber') { // 0 = unlit
    const key = (theme === 'amber' ? '' : theme + '|') + level + '|' + pitch + '|' + dpr;
    if (sprites.has(key)) return sprites.get(key);
    const T = themeOf(theme);
    const S = Math.ceil(pitch * dpr * 4), c = newCanvas(S, S), g = context(c);
    let out = null;
    if (g) {
      const mid = S / 2, r = pitch * dpr * .42;
      if (level === 0) {
        g.fillStyle = css(T.off, .9); g.beginPath(); g.arc(mid, mid, r * .8, 0, Math.PI * 2); g.fill();
      } else {
        const halo = g.createRadialGradient(mid, mid, 0, mid, mid, S / 2);
        halo.addColorStop(0, css(T.glow, T.glowAlpha[level])); halo.addColorStop(1, css(T.glow, 0));
        g.fillStyle = halo; g.fillRect(0, 0, S, S);
        g.fillStyle = css(T.level[level]); g.beginPath(); g.arc(mid, mid, r, 0, Math.PI * 2); g.fill();
      }
      out = {canvas: c, size: S / dpr};
    }
    return remember(sprites, key, out, SPRITE_LIMIT);
  }
  function putDot(g, x, y, level, pitch, dpr, theme = 'amber') {
    const s = sprite(level, pitch, dpr, theme);
    if (s) { g.drawImage(s.canvas, x - s.size / 2, y - s.size / 2, s.size, s.size); return; }
    const T = themeOf(theme);
    g.fillStyle = level ? css(T.level[level]) : css(T.off, .9);
    g.beginPath(); g.arc(x, y, pitch * (level ? .42 : .34), 0, Math.PI * 2); g.fill();
  }
  function rr(g, x, y, w, h, r) {
    g.beginPath(); g.moveTo(x + r, y); g.lineTo(x + w - r, y); g.quadraticCurveTo(x + w, y, x + w, y + r);
    g.lineTo(x + w, y + h - r); g.quadraticCurveTo(x + w, y + h, x + w - r, y + h); g.lineTo(x + r, y + h);
    g.quadraticCurveTo(x, y + h, x, y + h - r); g.lineTo(x, y + r); g.quadraticCurveTo(x, y, x + r, y);
    g.closePath();
  }
  function housing(g, x, y, w, h, pitch, theme = 'amber') {
    const T = themeOf(theme);
    const r = pitch * (theme === 'vfd' ? 1.5 : 2.3), ins = pitch * (theme === 'vfd' ? 1.2 : 1.7);
    const grad = g.createLinearGradient(0, y, 0, y + h);
    grad.addColorStop(0, T.body[0]); grad.addColorStop(.08, T.body[1]); grad.addColorStop(1, T.body[2]);
    g.fillStyle = grad; rr(g, x, y, w, h, r); g.fill();
    g.fillStyle = T.bg; rr(g, x + ins, y + ins, w - 2 * ins, h - 2 * ins, r * .6); g.fill();
    if (theme === 'vfd') {
      // Subtle vacuum-tube phosphor cavity tint + faint inner top shadow lip.
      const cav = g.createLinearGradient(0, y + ins, 0, y + h - ins);
      cav.addColorStop(0, 'rgba(0,0,0,.45)');
      cav.addColorStop(.18, 'rgba(18,74,78,.08)');
      cav.addColorStop(.82, 'rgba(14,64,68,.06)');
      cav.addColorStop(1, 'rgba(0,0,0,.28)');
      g.fillStyle = cav; rr(g, x + ins, y + ins, w - 2 * ins, h - 2 * ins, r * .6); g.fill();
    }
    g.strokeStyle = T.rim; g.lineWidth = 1; rr(g, x + .5, y + .5, w - 1, h - 1, r); g.stroke();
  }
  function sheen(g, x, y, w, h, pitch, theme = 'amber') {
    const T = themeOf(theme);
    const ins = pitch * (theme === 'vfd' ? 1.2 : 1.7);
    g.save(); rr(g, x + ins, y + ins, w - 2 * ins, h - 2 * ins, pitch); g.clip();
    const gr = g.createLinearGradient(x, y, x + w * .3, y + h);
    const topA = theme === 'vfd' ? .075 : .05, midA = theme === 'vfd' ? .022 : .015;
    gr.addColorStop(0, css(T.sheen, topA)); gr.addColorStop(.5, css(T.sheen, midA)); gr.addColorStop(1, css(T.sheen, 0));
    g.fillStyle = gr; g.fillRect(x, y, w, h * .55); g.restore();
  }
  // housing + unlit dots (never changes while the grid does not)
  function paintBase(g, ox, oy, W, H, pitch, grid, dpr, theme = 'amber') {
    housing(g, ox, oy, W, H, grid.pitchBox, theme);
    for (let y = 0; y < grid.rows; y++) for (let x = 0; x < grid.cols; x++) putDot(g, ox + grid.gx + x * pitch, oy + grid.gy + y * pitch, 0, pitch, dpr, theme);
  }
  function paintLit(g, ox, oy, map, pitch, grid, dpr, theme = 'amber') {
    g.save(); g.globalCompositeOperation = 'lighter';
    for (let y = 0; y < map.rows; y++) for (let x = 0; x < map.cols; x++) {
      const l = map.a[y * map.cols + x];
      if (l) putDot(g, ox + grid.gx + x * pitch, oy + grid.gy + y * pitch, l, pitch, dpr, theme);
    }
    g.restore();
  }
  function gridOf(W, H, pitch, cols, rows, box) {
    return {cols, rows, pitchBox: box, gx: (W - (cols - 1) * pitch) / 2, gy: (H - (rows - 1) * pitch) / 2};
  }
  // draw one strip: from the content-keyed cache when possible, else render (into a cached canvas, or straight onto ctx)
  function blit(ctx, rect, key, baseKey, pitch, grid, dpr, mapFn, theme = 'amber') {
    const W = rect.w, H = rect.h;
    const hit = strips.get(key);
    if (hit) { ctx.drawImage(hit, rect.x, rect.y, W, H); return 'hit'; }
    const map = mapFn();
    const canvas = newCanvas(W * dpr, H * dpr), g = context(canvas);
    if (!g) { // no canvas to cache into: paint straight onto the target
      paintBase(ctx, rect.x, rect.y, W, H, pitch, grid, dpr, theme);
      paintLit(ctx, rect.x, rect.y, map, pitch, grid, dpr, theme);
      sheen(ctx, rect.x, rect.y, W, H, grid.pitchBox, theme);
      return 'direct';
    }
    g.save(); g.scale && g.scale(dpr, dpr);
    let base = bases.get(baseKey);
    if (base === undefined) {
      const bc = newCanvas(W * dpr, H * dpr), bg = context(bc);
      if (bg) { bg.save(); bg.scale && bg.scale(dpr, dpr); paintBase(bg, 0, 0, W, H, pitch, grid, dpr, theme); bg.restore(); base = bc; } else base = null;
      remember(bases, baseKey, base);
    }
    if (base) g.drawImage(base, 0, 0, W, H); else paintBase(g, 0, 0, W, H, pitch, grid, dpr, theme);
    paintLit(g, 0, 0, map, pitch, grid, dpr, theme);
    sheen(g, 0, 0, W, H, grid.pitchBox, theme);
    g.restore();
    remember(strips, key, canvas);
    ctx.drawImage(canvas, rect.x, rect.y, W, H);
    return 'cold';
  }

  // ---------- public drawing ----------
  // Names that fit are baked into the panel. Each moving name, the counter and the live track are independent pieces.
  const overlays = new Map();
  function overlay(ctx, rect, key, region, pitch, grid, dpr, paint) {
    if (!region || region.x1 <= region.x0) return 'hit';
    let hit = overlays.get(key), state = 'hit';
    if (hit === undefined) {
      state = 'partial';
      const map = dotMap(region.x1 - region.x0, region.y1 - region.y0);
      paint(map);
      const w = (map.cols + 2) * pitch, h = (map.rows + 2) * pitch;
      const c = newCanvas(w * dpr, h * dpr), g = context(c);
      if (g) {
        g.save(); g.scale && g.scale(dpr, dpr); g.globalCompositeOperation = 'lighter';
        for (let y = 0; y < map.rows; y++) for (let x = 0; x < map.cols; x++) {
          const l = map.a[y * map.cols + x];
          if (l) putDot(g, (x + 1) * pitch, (y + 1) * pitch, l, pitch, dpr);
        }
        g.restore();
        hit = {canvas: c, w, h};
      } else hit = null;
      remember(overlays, key, hit);
    }
    if (hit) {
      ctx.save(); ctx.globalCompositeOperation = 'lighter';
      ctx.drawImage(hit.canvas, rect.x + grid.gx + (region.x0 - 1) * pitch, rect.y + grid.gy + (region.y0 - 1) * pitch, hit.w, hit.h);
      ctx.restore();
    }
    return state;
  }
  function drawHeader(ctx, rect, d, opts) {
    opts = opts || {}; d = d || {};
    const dpr = opts.dpr || 1, big = opts.big || 16, small = opts.small || 12, rows = headerRows(big, small), W = rect.w, H = rect.h;
    const pitch = opts.pitch || Math.min(H / (rows + ROW_PAD), W / 200);
    const ins = pitch * 1.7, cols = Math.max(20, Math.floor((W - 2 * ins) / pitch));
    const previous = lastPanel, time = num(d.time), now = finite(+d.now) && d.now != null ? +d.now : time;
    if (previous && d.route && previous.route === d.route && previous.title === d.title && previous.artist === d.artist &&
        previous.duration === d.duration && previous.readout === d.readout && previous.speed === d.speedMps &&
        previous.w === W && previous.h === H && previous.pitch === pitch && previous.dpr === dpr &&
        previous.big === big && previous.small === small && previous.artistSize === opts.artistSize && previous.counterSize === opts.counterSize &&
        Math.floor(time * 2) === previous.halfSecond && Math.floor(previous.target - now) === previous.count &&
        now >= previous.start && now < previous.end && Math.floor(milesOf(time,d.speedMps)*10+1e-9) === previous.tenth &&
        routePlan(d.route.stops,now,num(d.duration),cols).litX === previous.litX) {
      ctx.drawImage(previous.strip,rect.x,rect.y,W,H);
      ctx.save(); ctx.globalCompositeOperation = 'lighter';
      for (const p of previous.pieces) ctx.drawImage(p.canvas,rect.x+p.x,rect.y+p.y,p.w,p.h);
      ctx.restore();
      return 'hit';
    }
    const P = headerParts(d), r = P.plan(cols), board = boardLayout(P,cols,big,opts);
    const next = P.S[P.S.length && P.now < P.S[0].start ? 0 : r.cur + 1];
    const stamp = [r.cur, next?.start, Math.floor((next?.start ?? P.duration) - P.now), Math.floor(P.time), P.readout.now].join('|');
    if (!lastInfo || lastInfo.board !== board || lastInfo.stamp !== stamp || lastInfo.scroll) {
      const lines = headerLines(P,cols,big,opts,r,board), live = lines.live;
      const box = {x0:Math.min(...live.map(f=>f.x0)), x1:Math.max(...live.map(f=>f.x1)),
        y0:Math.min(...live.map(f=>f.y0)), y1:Math.max(...live.map(f=>f.y1))};
      lastInfo = {board, stamp, lines, box, scroll:lines.title.scroll || lines.artist.scroll || lines.nextLine.scroll,
        ink:JSON.stringify(live.map(f=>[f.str,f.size,f.level,f.x0,f.y0]))};
    }
    const {lines,box,ink} = lastInfo, blink = Math.floor(P.time * 2) % 2;
    const layout = ['H', W, H, pitch, dpr, cols, big, small].join('|');
    const routeKey = [layout, P.route.key, r.cur].join('|');
    const key = JSON.stringify([routeKey, board.key, lines.name, board.middle, board.right, board.mode, board.info.nameSize, board.info.tail]);
    const grid = gridOf(W, H, pitch, cols, rows, pitch);
    let model = null;
    const full = () => model || (model = headerModel(d, cols, rows, big, small, opts, P, r, lines));
    // where the running parts sit depends only on the static key: remember it with the strip
    let regs = regionCache.get(key);
    if (!regs) { regs = full().regions; remember(regionCache, key, regs); }
    if (canCache === null) canCache = Boolean(context(newCanvas(1, 1)));
    if (!canCache) { // no canvas to cache into: paint the whole header straight onto the target
      return blit(ctx, rect, key + '|' + stamp + '|' + r.litX + '|' + blink, ['B', W, H, pitch, dpr, cols, rows].join('|'), pitch, grid, dpr, () => full().map);
    }
    const s = blit(ctx, rect, key, ['B', W, H, pitch, dpr, cols, rows].join('|'), pitch, grid, dpr, () => {
      const map = full().map;
      for (const f of lines.live) clearRegion(map,f);
      clearRegion(map, regs.route);
      if (lines.title.scroll) clearRegion(map, lines.title);
      if (lines.artist.scroll) clearRegion(map, lines.artist);
      if (lines.nextLine.scroll) clearRegion(map, lines.nextLine);
      return map;
    });
    const digitsKey = layout + '|digits|' + ink, lampsKey = routeKey + '|R|' + r.litX + '|' + blink;
    const a = overlay(ctx, rect, digitsKey, box, pitch, grid, dpr, map => {
      for (const f of lines.live) map.text(f.str,f.size,f.x0-box.x0,f.y0-box.y0,f.level);
    });
    const b = overlay(ctx, rect, lampsKey, regs.route, pitch, grid, dpr, map => {
      const {x0, x1, y0} = regs.route;
      routeLamps({set: (x, y, level) => map.set(x - x0, y - y0, level)}, r, y0 + 1, blink === 0, x0, x1 - 1);
    });
    function moving(line, level) {
      if (!line.scroll) return 'hit';
      return overlay(ctx, rect, JSON.stringify([layout, level, line.str, line.size, line.x1-line.x0, line.offset]), line, pitch, grid, dpr,
        map => map.text(line.str, line.size, -line.offset, 0, level, 0, map.cols, true));
    }
    const title = moving(lines.title, 4), artist = moving(lines.artist, 3), station = moving(lines.nextLine, 4);
    lastPanel = null;
    if (d.route && !lastInfo.scroll && strips.has(key)) {
      const pieces = [];
      for (const [id, region] of [[digitsKey,box],[lampsKey,regs.route]]) {
        const image = overlays.get(id);
        if (image && region) pieces.push({...image,x:grid.gx+(region.x0-1)*pitch,y:grid.gy+(region.y0-1)*pitch});
      }
      const target = next?.start ?? P.duration;
      lastPanel = {route:d.route, title:d.title, artist:d.artist, duration:d.duration, readout:d.readout, speed:d.speedMps,
        w:W,h:H,pitch,dpr,big,small,artistSize:opts.artistSize,counterSize:opts.counterSize,strip:strips.get(key),pieces,
        halfSecond:Math.floor(time*2), target,count:Math.floor(target-now),tenth:Math.floor(milesOf(time,d.speedMps)*10+1e-9),
        start:P.S[r.cur] && now>=P.S[r.cur].start ? P.S[r.cur].start : -Infinity,end:next?.start ?? Infinity,litX:r.litX};
    }
    return s === 'cold' ? 'cold' : [a, b, title, artist, station].includes('partial') ? 'partial' : 'hit';
  }
  const regionCache = new Map();
  let lastInfo = null, lastPanel = null;
  let canCache = null;
  // fill the glyph cache for strings that will show later (station names, digits), so no later frame rasterises them
  function warm(list, opts) {
    opts = opts || {};
    const sizes = [opts.big || 16, opts.small || 12, LYRIC_SIZE];
    for (const s of list) for (const size of sizes) width(s, size);
    return glyphCache.size;
  }
  function drawLyric(ctx, rect, d, opts) {
    opts = opts || {}; d = d || {};
    const line = text(d.line).replace(/\s+/g, ' ').trim(), dpr = opts.dpr || 1;
    const theme = opts.theme === 'vfd' ? 'vfd' : 'amber';
    const sb = !line && theme === 'vfd' && opts.standby && typeof opts.standby === 'object' ? opts.standby : null;
    if (!line && !sb && opts.idle !== 'dim') return 'none';
    const W = rect.w, H = rect.h, plan = lyricPlan(line, d.progress, W, H, opts), {rows, pitch, cols} = plan;
    const grid = gridOf(W, H, pitch, cols, rows, plan.p0);
    const bPrefix = theme === 'vfd' ? 'LVB' : 'LB';
    const baseKey = [bPrefix, W, H, pitch, dpr, cols, rows].join('|');
    if (!sb) {
      const kPrefix = theme === 'vfd' ? 'LV' : 'L';
      const key = [kPrefix, W, H, pitch, dpr, cols, plan.x, line].join('|');
      return blit(ctx, rect, key, baseKey, pitch, grid, dpr, () => {
        const M = dotMap(cols, rows);
        if (line) M.text(line, LYRIC_SIZE, plan.x, 0, 4, plan.scroll ? 2 : 0, plan.scroll ? cols - 2 : cols, plan.scroll);
        return M;
      }, theme);
    }
    // VFD instrumental standby: cached 1-second static readout (section tag + clock + meter baseline) + live VU bars.
    const bars = Array.isArray(sb.bars) ? sb.bars : [];
    const bandStep = cols < 185 ? 4 : 5, bandW = cols < 185 ? 2 : 3;
    const nBars = Math.min(bars.length, cols < 185 ? 8 : 10, Math.max(0, Math.floor((cols * .30) / bandStep)));
    const vuX0 = 4, vuSpan = nBars ? nBars * bandStep : 0;
    const divX = nBars ? vuX0 + vuSpan + 2 : 0;
    const clock = cols < 185 || !(finite(sb.duration) && sb.duration > 0) ? fmt(sb.time) : fmt(sb.time) + ' / ' + fmt(sb.duration);
    const clockW = width(clock, LYRIC_SIZE);
    const clockX = Math.max(divX + 5, cols - 4 - clockW);
    const tagZone0 = nBars ? divX + 5 : 4;
    const tagZoneW = Math.max(0, clockX - tagZone0 - 4);
    const rawTag = text(sb.tag || 'INSTRUMENTAL').replace(/\s+/g, ' ').trim();
    const tag = tagZoneW > 12 ? fit(rawTag, LYRIC_SIZE, tagZoneW) : '';
    const key = ['LVS', W, H, pitch, dpr, cols, nBars, bandStep, tag, clock].join('|');
    const state = blit(ctx, rect, key, baseKey, pitch, grid, dpr, () => {
      const M = dotMap(cols, rows);
      if (nBars) {
        // Powered-on baseline floor dots for each VFD spectrum band + subtle vertical separator.
        for (let i = 0; i < nBars; i++) {
          const bx = vuX0 + i * bandStep;
          for (let dx = 0; dx < bandW; dx++) M.set(bx + dx, rows - 2, 1);
        }
        if (divX < cols - 8) for (let y = 2; y <= rows - 3; y++) M.set(divX, y, 1);
      }
      if (tag) {
        const tw = width(tag, LYRIC_SIZE);
        const tx = tagZone0 + Math.max(0, Math.round((tagZoneW - tw) / 2));
        M.text(tag, LYRIC_SIZE, tx, 0, 2, tagZone0, clockX - 3, false);
      }
      if (clock && clockX + clockW <= cols - 1) {
        M.text(clock, LYRIC_SIZE, clockX, 0, 3, Math.max(0, clockX - 1), cols, false);
      }
      return M;
    }, theme);
    if (nBars) {
      const maxH = Math.max(1, rows - 2);
      ctx.save();
      ctx.globalCompositeOperation = 'lighter';
      for (let i = 0; i < nBars; i++) {
        const levelCount = Math.round(clamp(num(bars[i]), 0, 1) * maxH);
        const bx = vuX0 + i * bandStep;
        for (let seg = 0; seg < levelCount; seg++) {
          const y = rows - 2 - seg;
          const lvl = seg >= maxH - 2 ? 4 : seg >= Math.floor(maxH * .55) ? 3 : 2;
          const py = rect.y + grid.gy + y * pitch;
          for (let dx = 0; dx < bandW; dx++) putDot(ctx, rect.x + grid.gx + (bx + dx) * pitch, py, lvl, pitch, dpr, theme);
        }
      }
      ctx.restore();
    }
    return state;
  }
  function drawNowTick(ctx, x, yTop, yBottom, opts) {
    opts = opts || {};
    const p = opts.pitch || 3, dpr = opts.dpr || 1, dots = [];
    const topTip = yTop - p, botTip = yBottom + p;
    for (let r = 0; r < 3; r++) for (let k = -(2 - r); k <= 2 - r; k++) dots.push([x + k * p, topTip - (2 - r) * p]);
    for (let r = 0; r < 4; r++) for (let k = -r; k <= r; k++) dots.push([x + k * p, botTip + r * p]);
    ctx.save();
    ctx.fillStyle = '#0a0b0c';
    rr(ctx, x - 3.5 * p, topTip - 3.5 * p, 7 * p, 4.5 * p, p); ctx.fill();
    rr(ctx, x - 4.5 * p, botTip - 1 * p, 9 * p, 5.5 * p, p); ctx.fill();
    ctx.globalCompositeOperation = 'lighter';
    for (const [dx, dy] of dots) putDot(ctx, dx, dy, 4, p, dpr);
    ctx.restore();
  }

  function setCanvasFactory(fn) { factory = typeof fn === 'function' ? fn : null; clearCaches(); }
  function clearCaches() { glyphCache.clear(); measurers.clear(); nameEdges.clear(); labelLayouts = new WeakMap(); boardLayouts = new WeakMap(); lastInfo = lastPanel = null; sprites.clear(); strips.clear(); bases.clear(); overlays.clear(); regionCache.clear(); canCache = null; }
  const cacheSize = () => ({glyphs: glyphCache.size, sprites: sprites.size, strips: strips.size, bases: bases.size});

  const api = Object.freeze({drawHeader, drawLyric, drawNowTick, localizeSection, englishSection, stationName, prepareRoute, readout, milesOf, setCanvasFactory, clearCaches, cacheSize, warm,
    headerModel, headerRows, lyricPlan, fit, width, glyph, dotMap, fmt, splitTitle, defaults: Object.freeze({big: 16, small: 12, lyricSize: LYRIC_SIZE})});
  root.XinScoreTerrainLed = api;
  if (typeof module === 'object' && module.exports) module.exports = api;
})(typeof globalThis !== 'undefined' ? globalThis : this);
