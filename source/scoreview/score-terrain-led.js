// In-car LED dot-matrix display for the 车窗地貌 look: the passenger panel above the window (title / station call /
// time + route strip), the lyric strip on the sill, and the two "now" arrows on the window frame.
//
// Self-contained: give it a 2D context, rectangles and data. Drawing is a pure function of its arguments; the only
// memory kept between calls is pure caches (glyph bitmaps, dot sprites, rendered strips keyed by their content).
//
// API (every call takes an optional last argument `opts` = {dpr = 1, pitch, big, small, idle}):
//   drawHeader(ctx, rect, {title, artist, section, nextSection, time, duration, sections, now}, opts)
//       rect = the panel housing {x, y, w, h}. sections = [{name, start, end}] (or [start, end, name] rows as in the
//       bundles; names must already be Chinese - see localizeSection). now defaults to time. section / nextSection
//       default to the sections around `now`. Top row: title + artist | 本站 x 下一站 y | m:ss / m:ss.
//       Bottom row: route strip, one station per section, equally spaced.
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
  const LEVEL = [null, [118, 58, 16], [214, 120, 34], [255, 176, 64]];
  const OFF = [44, 22, 8];
  const GLOW = [255, 150, 50];
  const GLOW_ALPHA = [0, .1, .2, .3];
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
      text(str, size, x, y, l, x0 = 0, x1 = cols) {
        let cx = x;
        for (const ch of chars(str)) {
          const g = glyph(ch, size);
          if (cx >= x1) break;
          if (g.bits && cx + g.w > x0) for (let j = 0; j < g.h; j++) for (let i = 0; i < g.w; i++) if (g.bits[j * g.w + i] && cx + i >= x0 && cx + i < x1) this.set(cx + i, y + j, l);
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
  function normSections(list) {
    return (Array.isArray(list) ? list : []).map(s => Array.isArray(s)
      ? {name: String(s[2] == null ? '' : s[2]), start: +s[0], end: +s[1]}
      : {name: String(s && s.name != null ? s.name : ''), start: +(s && s.start), end: +(s && s.end)}).filter(s => finite(s.start));
  }
  const num = v => (finite(+v) ? +v : 0);
  const fmt = s => { s = Math.max(0, Math.floor(num(s))); return Math.floor(s / 60) + ':' + String(s % 60).padStart(2, '0'); };
  const text = v => (v == null ? '' : String(v));

  // ---------- header model ----------
  function nameCandidates(name) {
    const m = name.match(/^(\S+?)\s*(\d+)?$/);
    const base = m ? m[1] : name, n = m && m[2] ? m[2] : '', first = chars(base)[0] || '';
    const list = [name, base + n, chars(base).slice(0, 2).join('') + n, first + n, first];
    return list.filter((s, i) => s && list.indexOf(s) === i);
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
    const S = normSections(d.sections), time = num(d.time), now = finite(+d.now) && d.now != null ? +d.now : time, duration = num(d.duration);
    const plan = (cols => routePlan(S, now, duration, cols));
    const cur = S.length ? plan(100).cur : 0;
    const curName = text(d.section != null ? d.section : (S[cur] ? S[cur].name : ''));
    const nextName = text(d.nextSection != null ? d.nextSection : (S[cur + 1] ? S[cur + 1].name : (S.length ? '终点' : '')));
    return {S, time, now, duration, plan, curName, nextName, title: text(d.title), artist: text(d.artist)};
  }
  function headerModel(d, cols, rows, big, small) {
    const P = headerParts(d), M = dotMap(cols, rows), gap = Math.round(big * .6), yA = 1;
    // ---- row A
    const t = fmt(P.time), tot = ' / ' + fmt(P.duration), tw = width(t, big), tw2 = width(tot, big);
    const tx = cols - 3 - tw - tw2;
    M.text(t, big, tx, yA, 3); M.text(tot, big, tx + tw, yA, 1);
    const mx1 = Math.round(tx - gap * 1.5), half = Math.round(gap * .5), wide = Math.round(gap * 1.4);
    const variants = [];
    if (P.curName) {
      variants.push([['本站', 1, half], [P.curName, 3, wide], ['下一站', 1, half], [P.nextName || '终点', 2, 0]]);
      variants.push([['本站', 1, half], [P.curName, 3, 0]]);
    }
    variants.push([]);
    const titleW = width(P.title, big), minTitle = Math.min(titleW, big * 5);
    const wOf = v => v.reduce((s, p) => s + width(p[0], big) + p[2], 0);
    let mid = variants[variants.length - 1];
    for (const v of variants) if (mx1 - wOf(v) - gap - 1 >= minTitle) { mid = v; break; }
    const mx0 = mid.length ? mx1 - wOf(mid) : mx1;
    let x = 1;
    const room = mx0 - gap - 1;
    const title = fit(P.title, big, room);
    x += M.text(title, big, x, yA, 3) + gap;
    if (P.artist && title === P.title && x + width(P.artist, big) <= mx0 - gap) M.text(P.artist, big, x, yA, 2);
    let mx = mx0;
    for (const [s, l, after] of mid) mx += M.text(s, big, mx, yA, l) + after;
    // ---- row B: the route
    const S = P.S, r = P.plan(cols), yL = yA + big + 2, step = r.step, sx = k => Math.round(r.x0 + step * k);
    const endX = Math.round(r.x0 + step * Math.max(1, S.length)) - 2;
    for (let xx = sx(0); xx <= endX; xx++) {
      const pos = (xx - r.x0) / step;
      M.set(xx, yL, xx <= r.litX ? (pos >= r.cur ? 3 : 2) : 1);
    }
    for (let k = 0; k < S.length; k++) {
      const l = k < r.cur ? 2 : k === r.cur ? 3 : 1, x0 = sx(k);
      for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) M.set(x0 + dx, yL + dy, (k === r.cur || dx === 0 || dy === 0) ? l : 0);
      if (k === r.cur) for (let dx = -2; dx <= 2; dx++) { M.set(x0 + dx, yL - 2, 3); M.set(x0 + dx, yL + 2, 3); }
    }
    for (let dy = -1; dy <= 1; dy++) M.set(endX, yL + dy, 1);
    // station names: abbreviate per station; if some cannot show even one character, only the current one is named
    const labels = S.map(s => nameCandidates(s.name).find(c => width(c, small) <= step - 3));
    const some = labels.every(Boolean);
    for (let k = 0; k < S.length; k++) {
      const l = k < r.cur ? 2 : k === r.cur ? 3 : 1, x0 = sx(k);
      if (some) M.text(labels[k], small, x0 - 1, yL + 3, l, x0 - 1, x0 - 1 + Math.round(step) - 1);
      else if (k === r.cur) {
        const c = nameCandidates(S[k].name).find(s => width(s, small) <= step * 4) || chars(S[k].name)[0] || '';
        M.text(c, small, x0 - 1, yL + 3, l, 0, cols);
      }
    }
    return {map: M, mid: mid.map(p => p[0]).join('|'), title, plan: r, labels: some ? labels : null};
  }
  const headerRows = (big, small) => big + small + 7;

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
      offset = Math.round(k * over);
    }
    return {rows, pitch, cols, inset, scroll, offset, textW, p0, x: scroll ? 2 - offset : Math.round((cols - textW) / 2)};
  }

  // ---------- sprites and strips ----------
  const sprites = new Map(), strips = new Map(), bases = new Map();
  function remember(map, key, value) {
    map.set(key, value);
    if (map.size > CACHE_LIMIT) map.delete(map.keys().next().value);
    return value;
  }
  function sprite(level, pitch, dpr) { // 0 = unlit
    const key = level + '|' + pitch + '|' + dpr;
    if (sprites.has(key)) return sprites.get(key);
    const S = Math.ceil(pitch * dpr * 4), c = newCanvas(S, S), g = context(c);
    let out = null;
    if (g) {
      const mid = S / 2, r = pitch * dpr * .42;
      if (level === 0) {
        g.fillStyle = css(OFF, .9); g.beginPath(); g.arc(mid, mid, r * .8, 0, Math.PI * 2); g.fill();
      } else {
        const halo = g.createRadialGradient(mid, mid, 0, mid, mid, S / 2);
        halo.addColorStop(0, css(GLOW, GLOW_ALPHA[level])); halo.addColorStop(1, css(GLOW, 0));
        g.fillStyle = halo; g.fillRect(0, 0, S, S);
        g.fillStyle = css(LEVEL[level]); g.beginPath(); g.arc(mid, mid, r, 0, Math.PI * 2); g.fill();
      }
      out = {canvas: c, size: S / dpr};
    }
    return remember(sprites, key, out);
  }
  function putDot(g, x, y, level, pitch, dpr) {
    const s = sprite(level, pitch, dpr);
    if (s) { g.drawImage(s.canvas, x - s.size / 2, y - s.size / 2, s.size, s.size); return; }
    g.fillStyle = level ? css(LEVEL[level]) : css(OFF, .9);
    g.beginPath(); g.arc(x, y, pitch * (level ? .42 : .34), 0, Math.PI * 2); g.fill();
  }
  function rr(g, x, y, w, h, r) {
    g.beginPath(); g.moveTo(x + r, y); g.lineTo(x + w - r, y); g.quadraticCurveTo(x + w, y, x + w, y + r);
    g.lineTo(x + w, y + h - r); g.quadraticCurveTo(x + w, y + h, x + w - r, y + h); g.lineTo(x + r, y + h);
    g.quadraticCurveTo(x, y + h, x, y + h - r); g.lineTo(x, y + r); g.quadraticCurveTo(x, y, x + r, y);
    g.closePath();
  }
  function housing(g, x, y, w, h, pitch) {
    const r = pitch * 2.3, ins = pitch * 1.7, grad = g.createLinearGradient(0, y, 0, y + h);
    grad.addColorStop(0, '#2a2c2f'); grad.addColorStop(.08, '#111214'); grad.addColorStop(1, '#0b0c0d');
    g.fillStyle = grad; rr(g, x, y, w, h, r); g.fill();
    g.fillStyle = '#040404'; rr(g, x + ins, y + ins, w - 2 * ins, h - 2 * ins, r * .6); g.fill();
    g.strokeStyle = 'rgba(200,206,212,.16)'; g.lineWidth = 1; rr(g, x + .5, y + .5, w - 1, h - 1, r); g.stroke();
  }
  function sheen(g, x, y, w, h, pitch) {
    const ins = pitch * 1.7;
    g.save(); rr(g, x + ins, y + ins, w - 2 * ins, h - 2 * ins, pitch); g.clip();
    const gr = g.createLinearGradient(x, y, x + w * .3, y + h);
    gr.addColorStop(0, 'rgba(255,255,255,.05)'); gr.addColorStop(.5, 'rgba(255,255,255,.015)'); gr.addColorStop(1, 'rgba(255,255,255,0)');
    g.fillStyle = gr; g.fillRect(x, y, w, h * .5); g.restore();
  }
  // housing + unlit dots (never changes while the grid does not)
  function paintBase(g, ox, oy, W, H, pitch, grid, dpr) {
    housing(g, ox, oy, W, H, grid.pitchBox);
    for (let y = 0; y < grid.rows; y++) for (let x = 0; x < grid.cols; x++) putDot(g, ox + grid.gx + x * pitch, oy + grid.gy + y * pitch, 0, pitch, dpr);
  }
  function paintLit(g, ox, oy, map, pitch, grid, dpr) {
    g.save(); g.globalCompositeOperation = 'lighter';
    for (let y = 0; y < map.rows; y++) for (let x = 0; x < map.cols; x++) {
      const l = map.a[y * map.cols + x];
      if (l) putDot(g, ox + grid.gx + x * pitch, oy + grid.gy + y * pitch, l, pitch, dpr);
    }
    g.restore();
  }
  function gridOf(W, H, pitch, cols, rows, box) {
    return {cols, rows, pitchBox: box, gx: (W - (cols - 1) * pitch) / 2, gy: (H - (rows - 1) * pitch) / 2};
  }
  // draw one strip: from the content-keyed cache when possible, else render (into a cached canvas, or straight onto ctx)
  function blit(ctx, rect, key, baseKey, pitch, grid, dpr, mapFn) {
    const W = rect.w, H = rect.h;
    const hit = strips.get(key);
    if (hit) { ctx.drawImage(hit, rect.x, rect.y, W, H); return 'hit'; }
    const map = mapFn();
    const canvas = newCanvas(W * dpr, H * dpr), g = context(canvas);
    if (!g) { // no canvas to cache into: paint straight onto the target
      paintBase(ctx, rect.x, rect.y, W, H, pitch, grid, dpr);
      paintLit(ctx, rect.x, rect.y, map, pitch, grid, dpr);
      sheen(ctx, rect.x, rect.y, W, H, grid.pitchBox);
      return 'direct';
    }
    g.save(); g.scale && g.scale(dpr, dpr);
    let base = bases.get(baseKey);
    if (base === undefined) {
      const bc = newCanvas(W * dpr, H * dpr), bg = context(bc);
      if (bg) { bg.save(); bg.scale && bg.scale(dpr, dpr); paintBase(bg, 0, 0, W, H, pitch, grid, dpr); bg.restore(); base = bc; } else base = null;
      remember(bases, baseKey, base);
    }
    if (base) g.drawImage(base, 0, 0, W, H); else paintBase(g, 0, 0, W, H, pitch, grid, dpr);
    paintLit(g, 0, 0, map, pitch, grid, dpr);
    sheen(g, 0, 0, W, H, grid.pitchBox);
    g.restore();
    remember(strips, key, canvas);
    ctx.drawImage(canvas, rect.x, rect.y, W, H);
    return 'cold';
  }

  // ---------- public drawing ----------
  function drawHeader(ctx, rect, d, opts) {
    opts = opts || {}; d = d || {};
    const dpr = opts.dpr || 1, big = opts.big || 16, small = opts.small || 12, rows = headerRows(big, small), W = rect.w, H = rect.h;
    const pitch = opts.pitch || Math.min(H / (rows + ROW_PAD), W / 200);
    const ins = pitch * 1.7, cols = Math.max(20, Math.floor((W - 2 * ins) / pitch));
    const P = headerParts(d), r = P.plan(cols);
    const key = ['H', W, H, pitch, dpr, cols, big, small, P.title, P.artist, P.curName, P.nextName, fmt(P.time), fmt(P.duration),
      P.S.map(s => s.name).join('\u0001'), r.cur, r.litX].join('|');
    const grid = gridOf(W, H, pitch, cols, rows, pitch);
    return blit(ctx, rect, key, ['B', W, H, pitch, dpr, cols, rows].join('|'), pitch, grid, dpr, () => headerModel(d, cols, rows, big, small).map);
  }
  function drawLyric(ctx, rect, d, opts) {
    opts = opts || {}; d = d || {};
    const line = text(d.line).replace(/\s+/g, ' ').trim(), dpr = opts.dpr || 1;
    if (!line && opts.idle !== 'dim') return 'none';
    const W = rect.w, H = rect.h, plan = lyricPlan(line, d.progress, W, H, opts), {rows, pitch, cols} = plan;
    const grid = gridOf(W, H, pitch, cols, rows, plan.p0);
    const key = ['L', W, H, pitch, dpr, cols, plan.x, line].join('|');
    return blit(ctx, rect, key, ['LB', W, H, pitch, dpr, cols, rows].join('|'), pitch, grid, dpr, () => {
      const M = dotMap(cols, rows);
      if (line) M.text(line, LYRIC_SIZE, plan.x, 0, 3, plan.scroll ? 2 : 0, plan.scroll ? cols - 2 : cols);
      return M;
    });
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
    for (const [dx, dy] of dots) putDot(ctx, dx, dy, 3, p, dpr);
    ctx.restore();
  }

  function setCanvasFactory(fn) { factory = typeof fn === 'function' ? fn : null; clearCaches(); }
  function clearCaches() { glyphCache.clear(); measurers.clear(); sprites.clear(); strips.clear(); bases.clear(); }
  const cacheSize = () => ({glyphs: glyphCache.size, sprites: sprites.size, strips: strips.size, bases: bases.size});

  const api = Object.freeze({drawHeader, drawLyric, drawNowTick, localizeSection, setCanvasFactory, clearCaches, cacheSize,
    headerModel, headerRows, lyricPlan, fit, width, glyph, dotMap, fmt, defaults: Object.freeze({big: 16, small: 12, lyricSize: LYRIC_SIZE})});
  root.XinScoreTerrainLed = api;
  if (typeof module === 'object' && module.exports) module.exports = api;
})(typeof globalThis !== 'undefined' ? globalThis : this);
