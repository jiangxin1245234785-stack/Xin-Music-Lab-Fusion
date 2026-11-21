(() => {
  'use strict';
  // 车窗地貌 (style key 'terrain'), rebuilt 2026-11-19 from the round-6 sketch S1 (work/terrain-20261119/mock6/page.html).
  // Setting: a modern train crossing the American West; out of the side window range after range of mountains; one song
  // is one stretch of the line. One stem = one range, near to far bass, guitar, piano, other, winds, strings, violin,
  // vocals (drums are not a range). Range height = that stem's loudness now (levels.groups), notes only decide how fine
  // or craggy its ridge is. Every range moves at its own speed and all of them line up only at the "now" point (37 % of
  // the window). Fixed late-afternoon light; a cover only tints the low sky and the haze. Plain at both ends of the song.
  // Text, the playhead and the LED displays live in the carriage (a separate module); this file leaves their room free.
  //
  // Geometry is computed in the sketch's own coordinates (a 1440 x 900 frame, window y 136..832) with the window height
  // fixed at 696 units and its width following the picture's aspect, then scaled by window height: a wider picture
  // shows more seconds instead of stretching. Each range's shape is cached per world sample (its own time grid) and
  // only moves from frame to frame; sky, clouds, ground, glass and grain are rasters made once per size and light.
  // The picture is a function of song time only: no clock, no random numbers (hash noise with fixed seeds).

  const STEM_COLOR = {vocals: '#e2ada0', violin: '#cf9a86', strings: '#d9bc8d', winds: '#d0a073', piano: '#f3d7ab', guitar: '#ad6847', other: '#527782', bass: '#24394a'};
  const STEM_NAME = {vocals: '人声', violin: '小提琴', strings: '弦乐', winds: '管乐', piano: '钢琴', guitar: '吉他', other: '其它', bass: '贝斯'};
  const NEAR_TO_FAR = ['bass', 'guitar', 'piano', 'other', 'winds', 'strings', 'violin', 'vocals'];
  const SPAN_NEAR = 10, SPAN_FAR = 30, NOW = .37;
  // sketch coordinates
  const M_LEFT = 64, M_TOP = 136, M_BOTTOM = 832, M_W = 1312, M_H = 696;
  const HORIZON = 664, BASE0 = 716, STEP = 24, TOPMOST = M_TOP + 70, BASIN = 720;
  const COL = 2; // sketch px per column = one world sample of a range
  const RAMP_PX = 400; // a range eases into / out of the plain over this many px of its own layer
  const GATE_PX = 900; // at the song's two ends: from plain to full range over this many px of the layer (low hills first)
  const HILL = .11; // the hills' height, as a share of the range's full height
  const RAMP_R = Math.round(RAMP_PX / 2 / 6); // three box passes of this many samples
  const PLAIN_MAX = 8; // s: the plain at each end lasts until the first instrument (until the last one stops), at most this
  const RUG = 1;
  const GROUND_K = 5.0;
  const speedAtY = y => GROUND_K * (y - HORIZON);
  const CHUNK = 128;
  const MARGIN = 800; // columns past the window edges (nearest range; the farthest gets half): the lift then matches an endless strip within .01 px (measured)

  const clamp = (v, a = 0, b = 1) => Math.max(a, Math.min(b, v));
  const lerp = (a, b, k) => a + (b - a) * k;
  const rgb = hex => [1, 3, 5].map(i => parseInt(hex.slice(i, i + 2), 16));
  const mix = (a, b, k) => [lerp(a[0], b[0], k), lerp(a[1], b[1], k), lerp(a[2], b[2], k)];
  const css = (c, a = 1) => 'rgba(' + Math.round(clamp(c[0], 0, 255)) + ',' + Math.round(clamp(c[1], 0, 255)) + ',' + Math.round(clamp(c[2], 0, 255)) + ',' + (+a.toFixed(4)) + ')';
  function hash(n, seed) { const x = Math.sin(n * 127.1 + seed * 311.7) * 43758.5453; return x - Math.floor(x); }
  function vnoise(x, seed) { const i = Math.floor(x), f = x - i, u = f * f * (3 - 2 * f); return lerp(hash(i, seed), hash(i + 1, seed), u); }
  function ridged(x, seed) { const n = 1 - Math.abs(2 * vnoise(x, seed) - 1); return n * n; }
  const smooth = (a, b, x) => { const u = clamp((x - a) / (b - a)); return u * u * (3 - 2 * u); };
  function firstAt(arr, t) { let lo = 0, hi = arr.length; while (lo < hi) { const m = (lo + hi) >> 1; if (arr[m] < t) lo = m + 1; else hi = m; } return lo; }

  // ---------- the hand-painted materials (batch 7): GPT's pictures, or this file's own drawing ----------
  // score-terrain-assets.js (global XinScoreTerrainAssets) loads and decodes the whole set; until every picture is in,
  // and wherever the module is missing or failed (tests under Node), this look draws everything with its own code as
  // before. ART is decided once at the start of each draw() - all pictures or none, never a mix - and every cache that
  // holds a drawn picture (rasters, sprites, tiles, station sprites) has the mode in its key, so the frame after the
  // switch is the same as one drawn with the pictures there from the start. The switch itself may change the picture once.
  let ART = null;
  const artModule = () => globalThis.XinScoreTerrainAssets || null;
  function artNow() {
    const A = artModule();
    if (!A || typeof A.isReady !== 'function') return null;
    if (A.state && A.state() === 'idle' && typeof A.ready === 'function') A.ready();
    return A.isReady() ? A : null;
  }
  const MODE = () => ART ? 'art' : 'code';
  const ready = () => { const A = artModule(); return A && typeof A.ready === 'function' ? Promise.resolve(A.ready()).then(Boolean, () => false) : Promise.resolve(false); };
  // one picture by its table key, with its anchor at (x, y), f units per original pixel (the table keeps the original
  // canvas size, anchor and visible box; the shipped file may be smaller, drawImage scales it back)
  const pic = key => ART && ART.get(key);
  function put(g, a, x, y, f, flip) {
    if (!a) return;
    if (flip) { g.save(); g.translate(x, y); g.scale(-1, 1); g.drawImage(a.img, -a.anchor[0] * f, -a.anchor[1] * f, a.ow * f, a.oh * f); g.restore(); return; }
    g.drawImage(a.img, x - a.anchor[0] * f, y - a.anchor[1] * f, a.ow * f, a.oh * f);
  }
  const tallOf = a => a.anchor[1] - a.bbox[1]; // visible height above the anchor, original px
  const wideOf = a => a.bbox[2] + 1 - a.bbox[0];
  // the visible box of a picture placed as put() places it, in the caller's units: [left, top, right, bottom]
  const boxOf = (a, f, flip) => { const l = (a.bbox[0] - a.anchor[0]) * f, r = (a.bbox[2] + 1 - a.anchor[0]) * f; return [flip ? -r : l, (a.bbox[1] - a.anchor[1]) * f, flip ? -l : r, (a.bbox[3] + 1 - a.anchor[1]) * f]; };
  const ABC = 'abcdef';
  // E (batch 7): the hand-painted skin over what the program shapes. The grey textures go on as XinScoreTerrainAssets'
  // soft layers (white / black, alpha |2 s - 1|) at TEX_K: about what soft light does to a mid colour (NOTES.md: multiply
  // would halve the brightness). They are painted into the range tiles, so they move with each range's world.
  const TEX_TEXEL = .75, TEX_K = .45, STRATA_K = .5, GRAIN_TEXEL = .5, HAZE_H = 150, DUST_K = 1, STREAK_K = 1;
  const HAZE_ROWS = [.24, .74]; // both haze strips are empty outside these rows (measured): only these are laid
  // the coarsest brush (a) only on the nearest one or two ranges, then b, c, d with distance
  const textureOf = d => d < .15 ? 'a' : d < .45 ? 'b' : d < .75 ? 'c' : 'd';
  function patternOf(g, canvas, sc, ex, ey, rep) {
    if (!canvas || typeof g.createPattern !== 'function') return null;
    const p = g.createPattern(canvas, rep || 'repeat');
    if (p && p.setTransform && typeof DOMMatrix === 'function') p.setTransform(new DOMMatrix([sc, 0, 0, sc, ex, ey]));
    return p;
  }
  const tintedHaze = new Map();
  function hazeOf(LT, v, col) { // a haze strip in the haze colour, twice along x (so a slice never runs off its end)
    const key = (lightIds.get(LT) || 0) + '|' + v + '|' + col.join(',');
    if (tintedHaze.has(key)) return tintedHaze.get(key);
    const src = ART.derived('haze:' + v), c = src && makeCanvas(src.width * 2, src.height), g = c && c.getContext('2d');
    if (!g) return null;
    g.drawImage(src, 0, 0); g.drawImage(src, src.width, 0);
    g.globalCompositeOperation = 'source-in'; g.fillStyle = css(col); g.fillRect(0, 0, c.width, c.height);
    if (tintedHaze.size > 8) tintedHaze.delete(tintedHaze.keys().next().value);
    tintedHaze.set(key, c);
    return c;
  }

  // ---------- light: fixed late-afternoon sun (sketch F2), a cover tints only the low sky and the haze ----------
  const toLin = v => { v /= 255; return v <= .04045 ? v / 12.92 : Math.pow((v + .055) / 1.055, 2.4); };
  const toSrgb = v => 255 * (v <= .0031308 ? 12.92 * v : 1.055 * Math.pow(Math.max(v, 0), 1 / 2.4) - .055);
  function oklab(c) {
    const r = toLin(c[0]), g = toLin(c[1]), b = toLin(c[2]);
    const l = Math.cbrt(.4122214708 * r + .5363325363 * g + .0514459929 * b), m = Math.cbrt(.2119034982 * r + .6806995451 * g + .1073969566 * b), s = Math.cbrt(.0883024619 * r + .2817188376 * g + .6299787005 * b);
    return [.2104542553 * l + .7936177850 * m - .0040720468 * s, 1.9779984951 * l - 2.4285922050 * m + .4505937099 * s, .0259040371 * l + .7827717662 * m - .8086757660 * s];
  }
  function fromLabRaw([L, A, B]) {
    const l = Math.pow(L + .3963377774 * A + .2158037573 * B, 3), m = Math.pow(L - .1055613458 * A - .0638541728 * B, 3), s = Math.pow(L - .0894841775 * A - 1.2914855480 * B, 3);
    return [4.0767416621 * l - 3.3077115913 * m + .2309699292 * s, -1.2684380046 * l + 2.6097574011 * m - .3413193965 * s, -.0041960863 * l - .7034186147 * m + 1.7076147010 * s].map(toSrgb);
  }
  const fromLab = lab => fromLabRaw(lab).map(v => clamp(v, 0, 255));
  const lch = c => { const [L, A, B] = oklab(c); return [L, Math.hypot(A, B), (Math.atan2(B, A) * 180 / Math.PI + 360) % 360]; };
  function fromLch([L, C, h]) { // reduce chroma until in gamut
    for (let k = 0; k < 30; k++) { const r = h * Math.PI / 180, x = fromLabRaw([L, C * Math.cos(r), C * Math.sin(r)]); if (x.every(v => v >= -.5 && v <= 255.5)) return x.map(v => clamp(v, 0, 255)); C *= .9; }
    return fromLab([L, 0, 0]);
  }
  const labMix = (a, b, k) => { const p = oklab(a), q = oklab(b); return fromLab([lerp(p[0], q[0], k), lerp(p[1], q[1], k), lerp(p[2], q[2], k)]); };
  const stops = list => list.map(([k, h]) => [k, rgb(h)]);

  const BASE = Object.freeze({
    name: 'afternoon',
    sky: stops([[0, '#46719d'], [.42, '#86a9c2'], [.78, '#d4d0bf'], [1, '#f3d2a2']]),
    glow: {x: 140, y: HORIZON - 30, r: 860, c: [255, 212, 158], a: .5},
    cloud: {hi: [255, 242, 224], lo: [255, 226, 192], a: 1},
    virga: {dark: [120, 128, 146], top: [246, 226, 200], rain: [110, 122, 142], a: 1},
    haze: [206, 205, 202], light: [255, 210, 150], shade: [30, 36, 58],
    floor: stops([[0, '#d3bc90'], [.25, '#b9a374'], [.6, '#988557'], [1, '#786a46']]),
    band: {c: [242, 220, 186], a: .55}, air: {c: [242, 220, 186], a: .12},
    mistK: 1, washK: 1, litK: 1.35, shadeK: 1.25, faceLen: 1.55,
    castLen: 1.8, castA: 1, litFace: 1.1, flatLit: 1,
    glass: {streak: [255, 255, 255], streakA: .035, smear: [255, 234, 200], smearA: .08}
  });

  // k-means in OKLab on a 64 x 64 cover thumbnail, deterministic init (farthest point); same rules as the sketch
  function analysePixels(data) {
    const n = Math.floor(data.length / 4), K = 6, P = new Float64Array(n * 3);
    for (let i = 0; i < n; i++) { const q = oklab([data[i * 4], data[i * 4 + 1], data[i * 4 + 2]]); P[i * 3] = q[0]; P[i * 3 + 1] = q[1]; P[i * 3 + 2] = q[2]; }
    const d2 = (i, c) => (P[i * 3] - c[0]) ** 2 + (P[i * 3 + 1] - c[1]) ** 2 + (P[i * 3 + 2] - c[2]) ** 2;
    const mean = [0, 0, 0];
    for (let i = 0; i < n; i++) for (let j = 0; j < 3; j++) mean[j] += P[i * 3 + j] / n;
    let best = 0; for (let i = 1; i < n; i++) if (d2(i, mean) > d2(best, mean)) best = i;
    const cen = [[P[best * 3], P[best * 3 + 1], P[best * 3 + 2]]];
    const near = new Float64Array(n).fill(Infinity);
    while (cen.length < K) {
      const c = cen[cen.length - 1];
      for (let i = 0; i < n; i++) near[i] = Math.min(near[i], d2(i, c));
      best = 0; for (let i = 1; i < n; i++) if (near[i] > near[best]) best = i;
      cen.push([P[best * 3], P[best * 3 + 1], P[best * 3 + 2]]);
    }
    const lab = new Int32Array(n);
    for (let it = 0; it < 15; it++) {
      for (let i = 0; i < n; i++) { let bi = 0, bd = d2(i, cen[0]); for (let k = 1; k < K; k++) { const dk = d2(i, cen[k]); if (dk < bd) { bd = dk; bi = k; } } lab[i] = bi; }
      for (let k = 0; k < K; k++) {
        let c = 0; const s = [0, 0, 0];
        for (let i = 0; i < n; i++) if (lab[i] === k) { c++; s[0] += P[i * 3]; s[1] += P[i * 3 + 1]; s[2] += P[i * 3 + 2]; }
        if (c) cen[k] = [s[0] / c, s[1] / c, s[2] / c];
      }
    }
    const count = new Array(K).fill(0); for (let i = 0; i < n; i++) count[lab[i]]++;
    const clusters = cen.map((q, k) => ({share: count[k] / n, L: q[0], C: Math.hypot(q[1], q[2]), h: (Math.atan2(q[2], q[1]) * 180 / Math.PI + 360) % 360}))
      .filter(x => x.share > 0).sort((a, b) => b.share - a.share);
    let sumC = 0, coloured = 0;
    for (let i = 0; i < n; i++) { const c = Math.hypot(P[i * 3 + 1], P[i * 3 + 2]); sumC += c; if (c > .045) coloured++; }
    const meanC = sumC / n, colourShare = coloured / n;
    const w = x => x.share * smooth(.02, .08, x.C);
    const chrom = clusters.filter(x => x.C > .03).sort((a, b) => w(b) - w(a));
    const achromatic = meanC < .03 || colourShare < .12 || !chrom.length;
    return {achromatic, meanC, colourShare, dom: chrom[0] || null, clusters};
  }
  // the sketch's "C-mild": the upper sky keeps a blue hue (clamped into 215..262 deg), the cover's hue goes to the low sky
  // and the haze with chroma <= .045; a grey or colourless cover keeps the plain afternoon
  function coverMild(A) {
    if (!A || A.achromatic || !A.dom) return BASE;
    const h = A.dom.h, cz = clamp(A.dom.C * .6, .03, .045);
    const near = (x, a, b) => { if (x >= a && x <= b) return x; const da = Math.min(Math.abs(x - a), 360 - Math.abs(x - a)), db = Math.min(Math.abs(x - b), 360 - Math.abs(x - b)); return da < db ? a : b; };
    const hz = near(h, 215, 262);
    const sky = BASE.sky.map(([k, c], i) => {
      const [L, C, h0] = lch(c);
      if (i === 0) return [k, fromLch([L, C * .95, hz])];
      if (i === 1) return [k, fromLch([L, C * .9, lerp(h0, hz, .7)])];
      if (i === 2) return [k, fromLch([L, cz, h])];
      return [k, labMix(c, fromLch([L, cz, h]), .5)];
    });
    const haze = fromLch([lch(BASE.haze)[0], .03, h]);
    return Object.freeze(Object.assign({}, BASE, {name: 'cover', hue: Math.round(h), sky, haze, band: {c: labMix(BASE.band.c, haze, .4), a: .55}}));
  }
  const lightCache = new WeakMap();
  function lightFor(cover) {
    if (!cover || typeof cover !== 'object') return BASE;
    if (lightCache.has(cover)) return lightCache.get(cover);
    let cfg = BASE;
    try {
      if ((cover.naturalWidth || cover.width) > 0) {
        const c = makeCanvas(64, 64), g = c && c.getContext('2d');
        if (g && typeof g.getImageData === 'function') { g.drawImage(cover, 0, 0, 64, 64); cfg = coverMild(analysePixels(g.getImageData(0, 0, 64, 64).data)); }
      }
    } catch { cfg = BASE; } // an unreadable cover (tainted, not decoded) keeps the plain afternoon
    lightCache.set(cover, cfg);
    return cfg;
  }
  function ramp(list, k) { k = clamp(k); for (let i = 1; i < list.length; i++) if (k <= list[i][0]) return mix(list[i - 1][1], list[i][1], (k - list[i - 1][0]) / (list[i][0] - list[i - 1][0])); return list[list.length - 1][1]; }
  const floorAt = (LT, y) => ramp(LT.floor, (y - HORIZON) / (M_BOTTOM - HORIZON));
  const basinAt = (LT, y) => y >= HORIZON
    ? mix(floorAt(LT, y), LT.haze, .3 * clamp(1 - (y - HORIZON) / 56))
    : mix(mix(LT.haze, LT.light, .22), mix(floorAt(LT, HORIZON), LT.haze, .3), clamp((y - 540) / (HORIZON - 540)));

  // ---------- the song: stems, loudness, note texture ----------
  const songCache = new WeakMap();
  const groupOf = g => STEM_COLOR[g] ? g : 'other';
  const scoreApi = () => globalThis.XinScoreView || (typeof require === 'function' ? require('./score-view.js') : null);
  function prefixOf(db) { const p = new Float64Array(db.length + 1); for (let i = 0; i < db.length; i++) p[i + 1] = p[i] + Math.pow(10, Math.max(Number.isFinite(db[i]) ? db[i] : -100, -100) / 10); return p; }
  function prefixAt(p, x) { const n = p.length - 1; x = clamp(x, 0, n); const i = Math.min(n - 1, Math.floor(x)); return p[i] + (x - i) * (p[i + 1] - p[i]); }
  const dbOf = v => 10 * Math.log10(Math.max(v, 1e-10));

  // No levels: the notes stand in for loudness. Per 0.5 s: each sounding note adds (velocity / 127)^2 for the share of
  // the bin it covers, each onset adds 0.6 of that once more; -30 dB + 10 log10 of the sum (one full held note = -30 dB).
  function levelsFromNotes(list, duration, hop) {
    const bins = Math.max(1, Math.ceil(duration / hop)), a = new Float64Array(bins);
    for (const [s, len, vel] of list) {
      const w = Math.pow(clamp(vel / 127, .05, 1), 2), e = s + Math.max(len, .08);
      if (!(e > 0) || s >= duration) continue;
      for (let b = Math.max(0, Math.floor(s / hop)); b < bins && b * hop < e; b++) a[b] += (Math.min(e, (b + 1) * hop) - Math.max(s, b * hop)) / hop * w;
      const ob = Math.floor(s / hop); if (ob >= 0 && ob < bins) a[ob] += .6 * w;
    }
    return Array.from(a, v => v > 0 ? -30 + 10 * Math.log10(v) : -100);
  }

  // Notes become rock, not teeth (sketch round 3): short notes within 0.45 s merge into one block (at most 2.2 s); each
  // block is a flat-topped butte, a narrow hoodoo or a broken rim; held notes (>= 1 s) stay wide swells.
  function rockFeatures(list) {
    const out = []; let cur = null;
    for (const [o, len, vel] of list) {
      if (len >= 1) { out.push({kind: 'swell', s: o, e: o + Math.min(len, 3), v: vel}); continue; }
      if (cur && o - cur.last < .45 && o - cur.s < 2.2) { cur.last = o; cur.e = Math.max(cur.e, o + Math.min(len, .3)); cur.v = Math.max(cur.v, vel); cur.n++; }
      else { cur = {kind: 'rock', s: o, last: o, e: o + Math.min(len, .3), v: vel, n: 1}; out.push(cur); }
    }
    for (const F of out) {
      const key = Math.round(F.s * 50);
      F.key = key;
      if (F.kind === 'rock') { const r = hash(key, 21); F.kind = r < .2 && F.n <= 3 ? 'hoodoo' : r < .4 ? 'rim' : 'butte'; }
      F.split = .35 + .3 * hash(key, 23); F.h = Math.pow(clamp(F.v / 127, 0, 1), .6) * (.35 + .65 * hash(key, 7));
    }
    out.sort((a, b) => a.s - b.s);
    return out;
  }
  function rockRelief(list, tt, f) {
    if (!list || !list.length) return 0;
    let best = 0;
    const cliff = .05 * f, talus = .34 * f;
    let lo = 0, hi = list.length; while (lo < hi) { const m = (lo + hi) >> 1; if (list[m].s < tt - 4) lo = m + 1; else hi = m; }
    for (let k = lo; k < list.length && list[k].s <= tt + talus + cliff + .2; k++) {
      const F = list[k];
      let h = F.h, s = F.s, e = F.e, v = 0;
      if (F.kind === 'swell') {
        const c = (s + e) / 2, w = (e - s) / 2 + .35 * f, u = (tt - c) / w;
        v = h * .8 * Math.exp(-u * u * 2.2);
      } else {
        if (F.kind === 'hoodoo') { const c = s + .05, w = (.035 + .03 * hash(F.key, 22)) * f; s = c - w; e = c + w; h = Math.min(1.1, h * 1.3); }
        else if (e - s < .18 * f) { const c = (s + e) / 2; s = c - .09 * f; e = c + .09 * f; }
        if (tt >= s && tt <= e) {
          const p = (tt - s) / (e - s);
          v = h * (1 - .07 * p);
          if (F.kind === 'rim' && p > F.split) v -= h * .2;
          if (F.kind === 'hoodoo' && (p < .2 || p > .8)) v -= h * .06;
        } else {
          const dist = tt < s ? s - tt : tt - e;
          const sh = F.kind === 'hoodoo' ? .35 : .55;
          if (dist < cliff) v = h * lerp(1, sh, dist / cliff);
          else if (dist < cliff + talus) v = h * sh * Math.pow(1 - (dist - cliff) / talus, 1.5);
        }
      }
      if (v > best) best = v;
    }
    return best;
  }

  function songSource(song, duration) {
    const cached = songCache.get(song);
    if (cached && cached.duration === duration) return cached;
    const other = (song.lanes || []).find(lane => scoreApi()?.isOtherMidi(lane));
    const layerId = group => groupOf(other && group === 'other' ? 'strings' : group);
    const notes = {};
    for (const lane of Array.isArray(song.lanes) ? song.lanes : []) {
      if (!lane || lane.kind === 'drums' || lane.group === 'drums' || !Array.isArray(lane.notes)) continue;
      const id = layerId(lane.group);
      const list = notes[id] || (notes[id] = []);
      for (const n of lane.notes) if (Array.isArray(n) && Number.isFinite(n[0]) && Number.isFinite(n[1])) list.push([n[0], Math.max(0, n[1]), Number.isFinite(n[3]) ? n[3] : 90]);
    }
    for (const id of Object.keys(notes)) notes[id].sort((a, b) => a[0] - b[0]);
    // loudness per stem: levels.groups when the song has them (unknown non-drum groups add into 'other'), otherwise notes
    const raw = song.levels && song.levels.groups && typeof song.levels.groups === 'object' ? song.levels.groups : null;
    const rawIds = raw ? Object.keys(raw).filter(k => k !== 'drums' && Array.isArray(raw[k]) && raw[k].length) : [];
    let basis = 'none';
    const db = {}, hops = {}, estimated = [];
    if (rawIds.length) {
      basis = 'levels';
      const hop = song.levels.hop > 0 ? song.levels.hop : 1, power = {};
      for (const k of rawIds) {
        const id = layerId(k), v = raw[k], p = power[id] || (power[id] = new Float64Array(v.length));
        for (let i = 0; i < v.length && i < p.length; i++) p[i] += Number.isFinite(v[i]) && v[i] > -100 ? Math.pow(10, v[i] / 10) : 0;
      }
      for (const id of Object.keys(power)) { db[id] = Array.from(power[id], x => x > 0 ? 10 * Math.log10(x) : -100); hops[id] = hop; }
    } else if (Object.keys(notes).length) basis = 'notes';
    // a stem with notes but no level of its own (no levels at all, or the census's winds / strings without a level row)
    for (const id of Object.keys(notes)) if (!db[id]) { db[id] = levelsFromNotes(notes[id], duration, .5); hops[id] = .5; estimated.push(id); }
    const groups = {};
    for (const id of Object.keys(db)) {
      const audible = db[id].filter(x => x > -50).length * hops[id];
      if (audible < Math.min(duration * .55, Math.max(4, duration * .015))) continue;
      groups[id] = {p: prefixOf(db[id]), hop: hops[id]};
    }
    const onsets = {}, rocks = {};
    for (const id of Object.keys(notes)) { onsets[id] = notes[id].map(n => n[0]); rocks[id] = rockFeatures(notes[id]); }
    const power = (g, t, win) => { const a = (t - win / 2) / g.hop, b = (t + win / 2) / g.hop; return (prefixAt(g.p, b) - prefixAt(g.p, a)) / (b - a); };
    const stemDb = (id, t, win) => { const g = groups[id]; return dbOf((power(g, t - win * .25, win) + power(g, t, win) + power(g, t + win * .25, win)) / 3); };
    const density = (id, t, win) => { const a = onsets[id]; return a ? (firstAt(a, t + win / 2) - firstAt(a, t - win / 2)) / win : 0; };
    const ids = NEAR_TO_FAR.filter(id => groups[id]);
    // first and last time any range is clearly there: the plain lasts until then (at most PLAIN_MAX at each end)
    let first = duration, last = 0;
    for (const id of ids) {
      for (let tt = 0; tt <= duration; tt += .25) if (stemDb(id, tt, 1.2) > -38) { first = Math.min(first, tt); break; }
      for (let tt = duration; tt >= 0; tt -= .25) if (stemDb(id, tt, 1.2) > -38) { last = Math.max(last, tt); break; }
    }
    const N = ids.length;
    const layers = ids.map((id, i) => {
      const d = N > 1 ? i / (N - 1) : 0, span = lerp(SPAN_NEAR, SPAN_FAR, d);
      const name = id === 'strings' && other ? other.label : STEM_NAME[id];
      return {id, name, i, d, span, f: span / 16, dt: span * COL / M_W, pps: M_W / span, amp: lerp(150, 250, Math.pow(d, 1.1)), rw: lerp(1, .6, d), seed: 100 + i * 9,
        R: new Map(), P: new Map(), E: new Map()};
    });
    // drum hits for the roadside: one object per hit; crashes thinned as in the sketch (a windmill only if none in the
    // last 7 s, else a flock of birds if none in the last 3 s, else nothing). Fixed per song, not per frame.
    const ROW = {kick: 0, snare: 1, hihat: 2, openhat: 3, tom: 4, crash: 5, ride: 6};
    let hits = [];
    for (const lane of Array.isArray(song.lanes) ? song.lanes : []) {
      if (!lane || lane.kind !== 'drums' || !Array.isArray(lane.hits)) continue;
      const rows = Array.isArray(lane.rows) ? lane.rows : Object.keys(ROW);
      for (const h of lane.hits) {
        const r = ROW[rows[h && h[1]]];
        if (Array.isArray(h) && Number.isFinite(h[0]) && r !== undefined) hits.push([h[0], r, Number.isFinite(h[2]) ? h[2] : 100]);
      }
    }
    hits.sort((a, b) => a[0] - b[0] || a[1] - b[1]);
    let lastMill = -99, lastFlock = -99, lastCrash = -99;
    hits = hits.filter(h => {
      if (h[1] !== 5) return true;
      if (h[0] - lastCrash < .6) return false;
      lastCrash = h[0];
      if (h[0] - lastMill > 7) { lastMill = h[0]; return true; }
      if (h[0] - lastFlock > 3 && h[0] - lastMill > 1.5) { lastFlock = h[0]; h[1] = 7; return true; } // 7 = a flock
      return false;
    });
    const src = {duration, basis, hits, hitTimes: hits.map(h => h[0]), estimated: estimated.filter(id => groups[id]), ids, layers, notes, rocks, onsets, stemDb, density,
      plainStart: Math.min(first, PLAIN_MAX), plainEnd: Math.max(last, duration - PLAIN_MAX), first, last};
    songCache.set(song, src);
    return src;
  }

  // ---------- world samples of one range (cached in chunks, each a pure function of the sample index) ----------
  const knee = u => u <= .8 ? u : .8 + .45 * (1 - Math.exp(-(u - .8) / .45));
  function relief(src, L, tt) {
    const {id, f, i, d, rw} = L;
    const v0 = x => Math.pow(knee(Math.max(0, (src.stemDb(id, x, 1.4 * f) + 46) / 32)), 1.15);
    const now = v0(tt);
    const slow = (v0(tt - 3 * f) + v0(tt - 1.5 * f) + now + v0(tt + 1.5 * f) + v0(tt + 3 * f)) / 5;
    const v = Math.max(0, slow + 1.7 * (now - slow));
    const body = Math.min(1, v * 2.5);
    if (body <= 0) return v;
    const rock = rockRelief(src.rocks[id], tt, f);
    // notes as texture: local note density -> fine craggy teeth; sparse playing -> broad buttes and broken rims
    const dens = clamp(src.density(id, tt, 2.4 * f) / 7);
    const crag = dens * (ridged(tt * 2.7 / f + i * 5.1, 31 + i) - .35) * .085 + dens * (ridged(tt * 6.1 / f + i * 3.3, 41 + i) - .35) * .03;
    const rug = (ridged(tt * .31 / f + i * 17.3, 11 + i) - .42) * lerp(.12, .2, d) * (1 + .5 * RUG) + (rock - .22) * lerp(.2, .13, d) * rw * (1 + .6 * RUG)
      + RUG * ((ridged(tt * .9 / f + i * 9.7, 21 + i) - .4) * lerp(.08, .1, d) + crag);
    return Math.max(0, v + rug * body);
  }
  const presence = (src, L, tt) => smooth(.05, .6, (src.stemDb(L.id, tt, 1.2 * L.f) + 46) / 24);
  function chunkOf(map, c, make) { let a = map.get(c); if (!a) { a = make(c); map.set(c, a); } return a; }
  function sampleR(src, L, k) {
    const c = Math.floor(k / CHUNK);
    return chunkOf(L.R, c, c => { const a = new Float32Array(CHUNK); for (let j = 0; j < CHUNK; j++) a[j] = relief(src, L, (c * CHUNK + j) * L.dt); return a; })[k - c * CHUNK];
  }
  function sampleP(src, L, k) {
    const c = Math.floor(k / CHUNK);
    return chunkOf(L.P, c, c => { const a = new Float32Array(CHUNK); for (let j = 0; j < CHUNK; j++) a[j] = presence(src, L, (c * CHUNK + j) * L.dt); return a; })[k - c * CHUNK];
  }
  // presence eased over RAMP_PX of this layer: three box passes; 3 x RAMP_R samples of padding make every kept value exact
  function sampleE(src, L, k) {
    const c = Math.floor(k / CHUNK);
    return chunkOf(L.E, c, c => {
      const pad = 3 * RAMP_R, n = CHUNK + 2 * pad, k0 = c * CHUNK - pad;
      let a = new Float64Array(n);
      for (let j = 0; j < n; j++) a[j] = sampleP(src, L, k0 + j);
      a = boxBlur(a, RAMP_R, 3);
      return Float32Array.from(a.subarray(pad, pad + CHUNK));
    })[k - c * CHUNK];
  }

  // ---------- column helpers (O(n)) ----------
  function boxBlur(a, r, passes) { // window clipped at the ends and averaged over what is there
    const n = a.length;
    let cur = Float64Array.from(a), out = new Float64Array(n);
    for (let p = 0; p < passes; p++) {
      let s = 0, lo = 0, hi = -1;
      for (let k = 0; k < n; k++) {
        const L = Math.max(0, k - r), H = Math.min(n - 1, k + r);
        while (hi < H) s += cur[++hi];
        while (lo < L) s -= cur[lo++];
        out[k] = s / (H - L + 1);
      }
      const tmp = cur; cur = out; out = tmp;
    }
    return cur;
  }
  function rolling(a, r, max) {
    const n = a.length, out = new Float64Array(n), q = new Int32Array(n);
    let head = 0, tail = 0, next = 0;
    const worse = (x, y) => max ? x <= y : x >= y;
    for (let k = 0; k < n; k++) {
      const hi = Math.min(n - 1, k + r);
      while (next <= hi) { while (tail > head && worse(a[q[tail - 1]], a[next])) tail--; q[tail++] = next++; }
      while (q[head] < k - r) head++;
      out[k] = a[q[head]];
    }
    return out;
  }
  function at(R, arr, x) {
    const u = (x - R.x0) / COL, n = R.n;
    if (u <= 0) return arr[0];
    if (u >= n - 1) return arr[n - 1];
    const i = Math.floor(u);
    return arr[i] + (u - i) * (arr[i + 1] - arr[i]);
  }

  // ---------- layout ----------
  function layout(w, h) {
    const u = Math.min(w / 1440, h / 900);
    const top = 136 * u, bottom = 68 * u, side = 64 * u;
    const win = {x: side, y: top, w: Math.max(1, w - 2 * side), h: Math.max(1, h - top - bottom), r: 40 * u};
    const s = win.h / M_H;
    const Wm = win.w / s; // window width in sketch units
    return {
      w, h, u, s, win, Wm, left: M_LEFT, right: M_LEFT + Wm, nowM: M_LEFT + Wm * NOW, nowX: win.x + win.w * NOW,
      // the carriage's own displays (drawn by the LED module, not here): sizes as in the sketch
      header: {x: 64 * u, y: 4 * u, w: Math.max(1, w - 128 * u), h: 118 * u},
      sill: {x: w / 2 - 524 * u, y: h - 44 * u, w: 1048 * u, h: 42 * u}
    };
  }
  const durationOf = frame => Number.isFinite(frame.duration) && frame.duration > 0 ? frame.duration : frame.song && frame.song.track && frame.song.track.duration;

  // ---------- geometry of one frame (sketch coordinates) ----------
  // arr (another range's column array) read on this range's columns: every grid has the same step, so the other one is
  // a constant shift away (integer part + fraction); outside its columns the end value holds
  function shifted(Q, arr, R, out, op) {
    const off = (R.x0 - Q.x0) / COL, io = Math.floor(off), fr = off - io, last = Q.n - 1;
    for (let j = 0; j < R.n; j++) {
      const u = j + io;
      const v = u < 0 ? arr[0] : u >= last ? arr[last] : arr[u] + fr * (arr[u + 1] - arr[u]);
      out[j] = op === 0 ? out[j] + v : Math.min(out[j], v);
    }
  }
  function geometry(src, L, t, margin = MARGIN) {
    const ranges = [];
    const pad = 8, N = src.layers.length;
    for (const layer of src.layers) {
      const {i, d, dt, pps, amp} = layer;
      // nearer ranges feed the lift of every range behind them, so they reach further past the window edges
      const mg = Math.round(margin * (.5 + .5 * (N - 1 - i) / Math.max(1, N - 1)));
      const k0 = Math.floor((t + (L.left - pad - L.nowM) / pps) / dt) - mg;
      const k1 = Math.ceil((t + (L.right + pad - L.nowM) / pps) / dt) + mg;
      const n = k1 - k0 + 1, x0 = L.nowM + (k0 * dt - t) * pps;
      const R = {id: layer.id, layer, i, d, k0, n, x0, env: new Float64Array(n), ys: new Float64Array(n), foot: new Float64Array(n)};
      // the plain at both ends, on this layer's own clock: nothing until the first instrument (at most PLAIN_MAX s) has
      // reached this layer's right window edge, nothing once the last one (at least PLAIN_MAX s before the end) has
      // left its left edge; eased over RAMP_PX of the layer
      const ahead = (L.right - L.nowM) / pps, behind = (L.nowM - L.left) / pps, rampT = GATE_PX / pps;
      const gA = src.plainStart + ahead, gB = src.plainEnd - behind;
      const rel = new Float64Array(n), gates = new Float64Array(n), pres = new Float64Array(n);
      for (let j = 0; j < n;) { // one chunk at a time
        const k = k0 + j, c = Math.floor(k / CHUNK), m = Math.min(n - j, (c + 1) * CHUNK - k);
        let E = null, Rc = null;
        for (let q = 0; q < m; q++, j++) {
          const kk = k + q, tt = kk * dt;
          const gate = tt <= gA || tt >= gB ? 0 : smooth(gA, gA + rampT, tt) * (1 - smooth(gB - rampT, gB, tt));
          gates[j] = gate;
          if (gate <= 0) continue;
          if (!E) { sampleE(src, layer, kk); E = layer.E.get(c); }
          pres[j] = E[kk - c * CHUNK];
          const e = pres[j] * gate;
          R.env[j] = e;
          if (e > 0) {
            if (!Rc) { sampleR(src, layer, kk); Rc = layer.R.get(c); }
            rel[j] = Rc[kk - c * CHUNK];
            // entering / leaving the window at the song's ends: low rolling hills first, the range's own shape grows in
            // behind them (shape x gate^2 + hills x a bump that is 0 on the plain and 0 once the range is fully in)
            if (gate < 1) rel[j] = (rel[j] * gate + HILL * 4 * (1 - gate) * (.35 + .4 * vnoise(tt * .55 / layer.f + i * 3.1, 61 + i) + .25 * vnoise(tt * 1.7 / layer.f + i * 7.7, 71 + i)));
          }
        }
      }
      // the foot steps up once for every nearer range that is in the picture at this column (each on its own clock)
      const sum = new Float64Array(n);
      for (let q = 0; q < i; q++) shifted(ranges[q], ranges[q].env, R, sum, 0);
      for (let j = 0; j < n; j++) {
        R.foot[j] = BASE0 - STEP * sum[j];
        R.ys[j] = R.foot[j] - amp * R.env[j] * rel[j];
      }
      if (i > 0) { // a range behind is lifted until it shows at least a strip over the ranges in front of it
        const front = new Float64Array(n).fill(Infinity);
        for (let q = 0; q < i; q++) shifted(ranges[q], ranges[q].ys, R, front, 1);
        const fenv = boxBlur(rolling(front, 30, false), 40, 2);
        const need = new Float64Array(n), keep = lerp(24, 16, d);
        for (let j = 0; j < n; j++) need[j] = Math.max(0, R.ys[j] - (fenv[j] - keep * R.env[j])) * R.env[j];
        const lift = boxBlur(rolling(need, 90, true), 60, 2);
        for (let j = 0; j < n; j++) {
          let y = R.ys[j] - lift[j] * R.env[j];
          if (y < TOPMOST + 50) y = TOPMOST + 50 * Math.exp((y - TOPMOST - 50) / 50);
          R.ys[j] = y;
        }
      }
      // no walls: a flank may not be steeper than S px per column (both ways); the nearest range keeps its butte cliffs
      // A range easing in or out (at the song's ends, or a stem starting / stopping) gets gentler flanks still
      const S = (i ? 1.5 + 1.3 * RUG : 6) * 2, hg = new Float64Array(n), cap = new Float64Array(n);
      for (let j = 0; j < n; j++) {
        hg[j] = R.foot[j] - R.ys[j];
        cap[j] = S * Math.min(.22 + .78 * gates[j] * gates[j], .4 + .6 * smooth(.3, .9, pres[j]));
      }
      for (let j = 1; j < n; j++) hg[j] = Math.min(hg[j], hg[j - 1] + Math.max(cap[j], cap[j - 1]));
      for (let j = n - 2; j >= 0; j--) hg[j] = Math.min(hg[j], hg[j + 1] + Math.max(cap[j], cap[j + 1]));
      for (let j = 0; j < n; j++) R.ys[j] = R.foot[j] - hg[j];
      R.ja = Math.max(0, Math.floor((L.left - pad - x0) / COL));
      R.jb = Math.min(n - 1, Math.ceil((L.right + pad - x0) / COL));
      ranges.push(R);
    }
    return ranges;
  }

  function scene(frame) {
    if (!(frame && Number.isFinite(frame.w) && frame.w > 0 && Number.isFinite(frame.h) && frame.h > 0 && frame.song && typeof frame.song === 'object')) return null;
    const duration = durationOf(frame);
    if (!Number.isFinite(duration) || duration <= 0) return null;
    const L = layout(frame.w, frame.h);
    const time = clamp(Number.isFinite(frame.time) ? frame.time : 0, 0, duration);
    const src = songSource(frame.song, duration);
    const ranges = geometry(src, L, time);
    const pps = M_W / SPAN_NEAR * L.s; // the nearest range's speed, screen px per second
    const {win} = L;
    const detail = {
      left: win.x, right: win.x + win.w, top: win.y, bottom: win.y + win.h,
      playheadX: L.nowX, pxPerSecond: pps, span: win.w / pps, time,
      start: time - (L.nowX - win.x) / pps, end: time + (win.x + win.w - L.nowX) / pps,
      notes: [], basis: src.basis, estimated: src.estimated, plain: {start: src.plainStart, end: src.plainEnd},
      ranges: ranges.map(R => summary(R, L)),
      led: {header: L.header, sill: L.sill, nowX: L.nowX, frameTop: win.y, frameBottom: win.y + win.h}
    };
    return {layout: L, src, ranges, duration, time, detail, main: detail, locating: frame.playing === false || frame.locating === true};
  }
  function summary(R, L) {
    const j = Math.round((L.nowM - R.x0) / COL);
    let top = Infinity, tall = 0, rough = 0, cnt = 0;
    for (let k = R.ja; k <= R.jb; k++) {
      const hgt = R.foot[k] - R.ys[k];
      top = Math.min(top, R.ys[k]); tall = Math.max(tall, hgt);
      if (k > R.ja && k < R.jb && hgt > 4) { rough += Math.abs(R.ys[k + 1] - 2 * R.ys[k] + R.ys[k - 1]); cnt++; }
    }
    const s = L.s, toY = y => L.win.y + (y - M_TOP) * s;
    return {id: R.id, name: R.layer.name, span: +R.layer.span.toFixed(2), pxPerSecond: R.layer.pps * s,
      heightAtNow: (R.foot[j] - R.ys[j]) * s, footAtNow: toY(R.foot[j]), ridgeAtNow: toY(R.ys[j]), envAtNow: R.env[j],
      maxHeight: tall * s, top: toY(top), roughness: cnt ? rough / cnt : 0, x0: L.win.x + (R.x0 - M_LEFT) * s, step: COL * s,
      ridge: (from, to) => Array.from(R.ys.subarray(from, to), y => toY(y))};
  }

  // ---------- rasters (once per size and light) ----------
  function makeCanvas(w, h) {
    w = Math.max(1, Math.ceil(w)); h = Math.max(1, Math.ceil(h));
    let c = null;
    if (typeof OffscreenCanvas === 'function') c = new OffscreenCanvas(w, h);
    else if (typeof document === 'object' && document && document.createElement) c = document.createElement('canvas');
    if (!c) return null;
    c.width = w; c.height = h;
    return c;
  }
  function roundRect(ctx, x, y, w, h, r) { ctx.beginPath(); ctx.moveTo(x + r, y); ctx.arcTo(x + w, y, x + w, y + h, r); ctx.arcTo(x + w, y + h, x, y + h, r); ctx.arcTo(x, y + h, x, y, r); ctx.arcTo(x, y, x + w, y, r); ctx.closePath(); }
  const CLOUD_P = 2200, CLOUD_Y0 = 120, CLOUD_Y1 = 480, GROUND_P = 2600, GROUND_BAND = 6, GROUND_PAD = 12;
  const lightIds = new WeakMap(); let lightSerial = 0;
  const rasterCache = new Map();
  function rasters(L, LT, dpr) {
    if (!lightIds.has(LT)) lightIds.set(LT, ++lightSerial);
    const key = lightIds.get(LT) + '|' + L.w + 'x' + L.h + '@' + dpr + '|' + MODE();
    if (rasterCache.has(key)) return rasterCache.get(key);
    const R = makeRasters(L, LT, dpr);
    if (!R) return null; // no canvas to paint on here (tests without one): nothing cached
    if (rasterCache.size >= 4) rasterCache.delete(rasterCache.keys().next().value);
    rasterCache.set(key, R);
    return R;
  }
  // a canvas in sketch units: x from x0, y from y0, at s * dpr device px per unit
  function sketchCanvas(L, dpr, x0, y0, w, h) {
    const c = makeCanvas(w * L.s * dpr, h * L.s * dpr);
    if (!c) return null;
    const g = c.getContext('2d');
    g.setTransform(L.s * dpr, 0, 0, L.s * dpr, -x0 * L.s * dpr, -y0 * L.s * dpr);
    return {c, g, x0, y0, w, h};
  }
  function makeRasters(L, LT, dpr) {
    const {win, s} = L;
    const back = makeCanvas(L.w * dpr, L.h * dpr);
    if (!back) return null;
    const toSketch = (g) => g.setTransform(s * dpr, 0, 0, s * dpr, (win.x - M_LEFT * s) * dpr, (win.y - M_TOP * s) * dpr);
    // sky + floor + the fixed rain shaft, inside the window
    {
      const g = back.getContext('2d');
      g.setTransform(dpr, 0, 0, dpr, 0, 0);
      // batch 7: opaque everywhere first. The glass's anti-aliased edge row is half transparent, so the frame before
      // showed through it (1-2 levels, different after playing than after a jump); the code's frame stroke covered that
      // row, the frame picture starts just outside it.
      if (ART) { g.fillStyle = '#141618'; g.fillRect(0, 0, L.w, L.h); }
      roundRect(g, win.x, win.y, win.w, win.h, win.r); g.clip();
      toSketch(g);
      const x0 = L.left - 10, x1 = L.right + 10;
      const sky = g.createLinearGradient(0, M_TOP, 0, HORIZON);
      for (const [k, c] of LT.sky) sky.addColorStop(k, css(c));
      g.fillStyle = sky; g.fillRect(x0, M_TOP - 10, x1 - x0, HORIZON + 2 - M_TOP + 10);
      const G = LT.glow, glow = g.createRadialGradient(G.x, G.y, 10, G.x, G.y, G.r);
      glow.addColorStop(0, css(G.c, G.a)); glow.addColorStop(.5, css(G.c, G.a * .3)); glow.addColorStop(1, css(G.c, 0));
      g.fillStyle = glow; g.fillRect(x0, M_TOP - 10, x1 - x0, HORIZON + 2 - M_TOP + 10);
      const grainArt = pic('overlay/sky-grain-a');
      if (grainArt) { // batch 7: the paper grain on the sky, true soft light (the sky is opaque here)
        const pg = patternOf(g, grainArt.img, GRAIN_TEXEL * grainArt.ow / grainArt.w, 0, 0);
        if (pg) { g.save(); g.globalCompositeOperation = 'soft-light'; g.fillStyle = pg; g.fillRect(x0, M_TOP - 10, x1 - x0, HORIZON + 2 - M_TOP + 10); g.restore(); }
      }
      const vx = 1040, vy = 410, V = LT.virga; // a distant rain shaft; fixed (the sketch slid it on a 54 s saw-tooth)
      g.save();
      g.filter = 'blur(' + (20 * s * dpr).toFixed(1) + 'px)'; g.fillStyle = css(V.dark, .22 * V.a); g.beginPath(); g.ellipse(vx, vy, 230, 16, 0, 0, Math.PI * 2); g.fill();
      g.fillStyle = css(V.top, .30 * V.a); g.beginPath(); g.ellipse(vx - 30, vy - 24, 170, 16, 0, 0, Math.PI * 2); g.fill();
      g.filter = 'blur(' + (16 * s * dpr).toFixed(1) + 'px)';
      const rg = g.createLinearGradient(0, vy, 0, HORIZON);
      rg.addColorStop(0, css(V.rain, .17 * V.a)); rg.addColorStop(1, css(V.rain, 0));
      g.fillStyle = rg; g.beginPath(); g.moveTo(vx - 150, vy); g.lineTo(vx + 130, vy); g.lineTo(vx + 40, HORIZON); g.lineTo(vx - 220, HORIZON); g.closePath(); g.fill();
      g.restore();
      const fl = g.createLinearGradient(0, HORIZON, 0, M_BOTTOM);
      for (const [k, c] of LT.floor) fl.addColorStop(k, css(c));
      g.fillStyle = fl; g.fillRect(x0, HORIZON, x1 - x0, M_BOTTOM - HORIZON + 10);
      const hz = g.createLinearGradient(0, HORIZON - 26, 0, HORIZON + 30);
      hz.addColorStop(0, css(LT.band.c, 0)); hz.addColorStop(.5, css(LT.band.c, LT.band.a)); hz.addColorStop(1, css(LT.band.c, 0));
      g.fillStyle = hz; g.fillRect(x0, HORIZON - 26, x1 - x0, 56);
    }
    // clouds: one wrapped strip that drifts (batch 7: GPT's cloud strip, its 600 px on the code's band, period 0.6 x 4096)
    const cloudArt = pic('ground-sky/cloud-strip-a'), cloudP = cloudArt ? cloudArt.ow * (CLOUD_Y1 - CLOUD_Y0) / cloudArt.oh : CLOUD_P;
    const clouds = sketchCanvas(L, dpr, 0, CLOUD_Y0, cloudArt ? cloudP + 40 : CLOUD_P, CLOUD_Y1 - CLOUD_Y0);
    if (clouds) { clouds.P = cloudP; clouds.drawW = clouds.w; }
    if (clouds && cloudArt) for (const x of [0, cloudP]) clouds.g.drawImage(cloudArt.img, x, CLOUD_Y0, cloudP, CLOUD_Y1 - CLOUD_Y0);
    else if (clouds) {
      const g = clouds.g, seed = 9;
      g.filter = 'blur(' + (7 * s * dpr).toFixed(1) + 'px)';
      for (let i = 0; i < 46; i++) {
        const band = hash(i, seed + 1) < .6 ? 0 : 1;
        const px = hash(i, seed + 2) * CLOUD_P;
        const cy = band ? 300 + hash(i, seed + 3) * 130 : 175 + hash(i, seed + 3) * 110;
        const len = 150 + hash(i, seed + 4) * 420, th = 3 + hash(i, seed + 5) * (band ? 7 : 11);
        const a = (.10 + hash(i, seed + 7) * .22) * LT.cloud.a, cc = band ? LT.cloud.lo : LT.cloud.hi;
        for (const cx of [px - CLOUD_P, px, px + CLOUD_P]) {
          if (cx + len < -40 || cx - len > CLOUD_P + 40) continue;
          g.save(); g.translate(cx, cy); g.rotate(-.05 - hash(i, seed + 6) * .07);
          const gg = g.createLinearGradient(-len / 2, 0, len / 2, 0);
          gg.addColorStop(0, css(cc, 0)); gg.addColorStop(.35, css(cc, a)); gg.addColorStop(.7, css(cc, a * .8)); gg.addColorStop(1, css(cc, 0));
          g.fillStyle = gg; g.beginPath(); g.ellipse(0, 0, len / 2, th, 0, 0, Math.PI * 2); g.fill(); g.restore();
        }
      }
    }
    // the plain beside the line: bands of ground, each band its own wrapped strip moving at its depth's speed
    const ground = [];
    const obj = c => c;
    const flats = [], dots = [];
    const seed = 5;
    for (let i = 0; i < 46; i++) {
      const z = Math.pow(hash(i, seed + 20), 1.5), y = lerp(HORIZON + 6, M_BOTTOM, z);
      flats.push({y, z, len: lerp(140, 620, z) * (.5 + hash(i, seed + 22)), x: hash(i, seed + 21) * GROUND_P - 500, light: hash(i, seed + 23) < .5});
    }
    for (let i = 0; i < 1430; i++) { // the sketch's 1100 dots over a 2000 px wrap, here over 2600 px
      if (vnoise(hash(i, seed + 31) * 23, seed + 40) < .38) continue;
      const z = Math.pow(hash(i, seed + 30), 2.3), y = lerp(HORIZON + 5, M_BOTTOM + 6, z);
      dots.push({y, z, x: hash(i, seed + 31) * GROUND_P - 280, i});
    }
    for (let y0 = HORIZON; y0 < M_BOTTOM + 6; y0 += GROUND_BAND) {
      const y1 = y0 + GROUND_BAND, inBand = o => o.y >= y0 && o.y < y1;
      const fs = flats.filter(inBand), ds = dots.filter(inBand);
      if (!fs.length && !ds.length) continue;
      const tile = sketchCanvas(L, dpr, 0, y0 - GROUND_PAD, GROUND_P, GROUND_BAND + 2 * GROUND_PAD);
      if (!tile) break;
      const g = tile.g;
      for (const o of fs) {
        g.fillStyle = o.light ? css(obj([226, 212, 172]), lerp(.10, .22, o.z) * LT.flatLit) : css(obj([84, 88, 62]), lerp(.08, .2, o.z));
        for (const dx of [-GROUND_P, 0, GROUND_P]) { g.beginPath(); g.ellipse(((o.x % GROUND_P) + GROUND_P) % GROUND_P + dx, o.y, o.len / 2, lerp(1, 5, o.z), 0, 0, Math.PI * 2); g.fill(); }
      }
      for (const o of ds) {
        const {z, y, i} = o, sz = lerp(.7, 7.5, z) * (.6 + hash(i, seed + 32) * .8), smear = 1 + z * z * 5.5;
        const c = mix(obj(mix(rgb('#6f7458'), rgb('#4d5440'), hash(i, seed + 33))), floorAt(LT, y), lerp(.55, .05, z));
        const bx = ((o.x % GROUND_P) + GROUND_P) % GROUND_P;
        for (const dx of [-GROUND_P, 0, GROUND_P]) {
          const x = bx + dx;
          if (x + 60 < 0 || x - 60 > GROUND_P) continue;
          g.fillStyle = css(mix(c, LT.shade, .35), lerp(.25, .5, z) * LT.castA);
          g.beginPath(); g.ellipse(x + sz * 1.1 * smear * .5 * LT.castLen, y + sz * .32, sz * smear * lerp(.62, .9, clamp(LT.castLen)), sz * .26, 0, 0, Math.PI * 2); g.fill();
          g.fillStyle = css(c, lerp(.6, .92, z));
          g.beginPath(); g.ellipse(x, y - sz * .25, sz * smear * .62, sz * .5, 0, 0, Math.PI * 2); g.fill();
          g.fillStyle = css(mix(c, LT.light, .4), lerp(.25, .5, z) * LT.litFace);
          g.beginPath(); g.ellipse(x - sz * .2 * smear, y - sz * .42, sz * smear * .34, sz * .22, 0, 0, Math.PI * 2); g.fill();
        }
      }
      ground.push({tile, speed: speedAtY((y0 + y1) / 2)});
    }
    // batch 7: the plain from GPT's picture, as bands of depth like the code's ground (each its own speed), opaque, drawn
    // before the ranges (their feet stand on it as before); the code's horizon haze and band (cover-tinted) baked in
    const plain = pic('ground-sky/plain-tile-a') ? plainBands(L, LT, dpr) : null;
    // and the ground flowing past right under the window (GROUND_FLOW): ballast, then the next track's rail
    const flow = ART && GROUND_FLOW ? {ballast: flowStrip(L, dpr, 'ground-sky/ballast-strip-a', FLOW.ballast), rail: flowStrip(L, dpr, 'ground-sky/rail-strip-a', FLOW.rail)} : null;
    // the track bed right under the window: gravel smeared by speed
    const bedY = 820, bed = sketchCanvas(L, dpr, 0, bedY - 6, GROUND_P, M_BOTTOM - bedY + 12);
    if (bed) {
      const g = bed.g;
      g.filter = 'blur(' + (1.5 * s * dpr).toFixed(2) + 'px)';
      for (let i = 0; i < 400; i++) {
        const yy = bedY + hash(i, 301) * (M_BOTTOM - bedY), x = hash(i, 302) * GROUND_P, w = 30 + 50 * hash(i, 304);
        g.fillStyle = hash(i, 303) < .5 ? 'rgba(170,160,140,.35)' : 'rgba(50,44,38,.35)';
        for (const dx of [-GROUND_P, 0, GROUND_P]) g.fillRect(x + dx, yy, w, 1.5);
      }
    }
    // glass and the carriage around the window
    const overlay = makeCanvas(L.w * dpr, L.h * dpr);
    {
      const g = overlay.getContext('2d'), u = L.u;
      g.setTransform(dpr, 0, 0, dpr, 0, 0);
      g.save();
      const fx = m => win.x + (m - M_LEFT) / M_W * win.w, B = win.y + win.h;
      roundRect(g, win.x, win.y, win.w, win.h, win.r); g.clip();
      const GL = LT.glass, bar = transomOf(L);
      // two panes (batch 6): the big view pane below the transom keeps the old streaks; the small pane above it has a
      // faint cool tint and its own, steeper streaks, so the two read as two pieces of glass
      const streakA = pic('overlay/sun-streak-a'), streakB = pic('overlay/sun-streak-b'), dust = pic('overlay/glass-dust-b');
      if (streakA && streakB && dust) { // batch 7: GPT's sun streaks on each pane and the dust over the glass, their own alpha
        g.save(); g.globalAlpha = STREAK_K;
        g.drawImage(streakA.img, win.x, bar.y + bar.t, win.w, B - bar.y - bar.t);
        g.fillStyle = 'rgba(40,58,76,.12)'; g.fillRect(win.x, win.y, win.w, bar.y - win.y);
        g.drawImage(streakB.img, win.x, win.y, win.w, bar.y - win.y);
        g.globalAlpha = DUST_K; g.drawImage(dust.img, win.x, win.y, win.w, win.h);
        g.restore();
      } else {
      g.save(); g.beginPath(); g.rect(win.x, bar.y + bar.t, win.w, B - bar.y - bar.t); g.clip();
      g.fillStyle = css(GL.streak, GL.streakA);
      g.beginPath(); g.moveTo(fx(980), win.y); g.lineTo(fx(1100), win.y); g.lineTo(fx(840), B); g.lineTo(fx(720), B); g.closePath(); g.fill();
      g.beginPath(); g.moveTo(fx(1130), win.y); g.lineTo(fx(1160), win.y); g.lineTo(fx(900), B); g.lineTo(fx(870), B); g.closePath(); g.fill();
      g.restore();
      g.save(); g.beginPath(); g.rect(win.x, win.y, win.w, bar.y - win.y); g.clip();
      g.fillStyle = 'rgba(40,58,76,.12)'; g.fillRect(win.x, win.y, win.w, bar.y - win.y);
      g.fillStyle = css(GL.streak, GL.streakA * 1.6);
      for (const [m0, mw] of [[1150, 64], [1236, 16], [470, 36]]) { // steeper than the view pane's streaks
        const sl = .6 * (bar.y - win.y);
        g.beginPath(); g.moveTo(fx(m0), win.y); g.lineTo(fx(m0 + mw), win.y); g.lineTo(fx(m0 + mw) - sl, bar.y); g.lineTo(fx(m0) - sl, bar.y); g.closePath(); g.fill();
      }
      g.filter = 'blur(' + (10 * u * dpr).toFixed(1) + 'px)'; g.fillStyle = css(GL.smear, GL.smearA); g.fillRect(fx(214), win.y + 16 * u, 520 / M_W * win.w, 7 * u);
      g.filter = 'none';
      g.restore();
      }
      const v = g.createLinearGradient(0, win.y, 0, win.y + 70 * u); v.addColorStop(0, 'rgba(8,12,18,.34)'); v.addColorStop(1, 'rgba(8,12,18,0)');
      g.fillStyle = v; g.fillRect(win.x, win.y, win.w, 70 * u);
      const v2 = g.createLinearGradient(0, B - 50 * u, 0, B); v2.addColorStop(0, 'rgba(8,12,18,0)'); v2.addColorStop(1, 'rgba(8,12,18,.3)');
      g.fillStyle = v2; g.fillRect(win.x, B - 50 * u, win.w, 50 * u);
      if (ART) artTransom(g, L, bar); else paintTransom(g, L, bar);
      g.restore();
      // the carriage wall around the window (the LED displays go in the room above and below)
      g.save();
      roundRect(g, win.x, win.y, win.w, win.h, win.r); g.rect(0, 0, L.w, L.h);
      const wall = g.createLinearGradient(0, 0, 0, L.h); wall.addColorStop(0, '#1c1e21'); wall.addColorStop(.5, '#141618'); wall.addColorStop(1, '#1f2124');
      if (ART) artWall(g, L); else { g.fillStyle = wall; g.fill('evenodd'); }
      g.restore();
      const sillY = B + 22 * u;
      if (ART) { artFrame(g, L); artSill(g, L, sillY); artCurtains(g, L); }
      else {
        g.lineWidth = 7 * u; g.strokeStyle = '#08090a'; roundRect(g, win.x, win.y, win.w, win.h, win.r); g.stroke();
        g.lineWidth = Math.max(.6, 1.2 * u); g.strokeStyle = 'rgba(160,168,176,.28)'; roundRect(g, win.x - 9 * u, win.y - 9 * u, win.w + 18 * u, win.h + 18 * u, win.r + 9 * u); g.stroke();
        const sill = g.createLinearGradient(0, sillY, 0, L.h); sill.addColorStop(0, '#34373b'); sill.addColorStop(.12, '#26292c'); sill.addColorStop(1, '#17191b');
        g.fillStyle = sill; g.fillRect(0, sillY, L.w, L.h - sillY);
        g.fillStyle = 'rgba(210,216,222,.22)'; g.fillRect(0, sillY, L.w, Math.max(.6, 1.2 * u));
        curtains(g, L, dpr);
      }
    }
    return {back, clouds, ground: plain ? [] : ground, plain, flow, bed, overlay};
  }
  // the plain picture: its rows top (far) to bottom (near) on the ground rows HORIZON .. M_BOTTOM, PLAIN_X sketch px a
  // picture px along x (1.7 x its scale down, so its period, 1638 px, is wider than a wide window: no repeat in view)
  const PLAIN_X = .4, PLAIN_BAND = 6;
  function plainBands(L, LT, dpr) {
    const a = pic('ground-sky/plain-tile-a'), P = a.ow * PLAIN_X, k = a.w / a.ow, out = [];
    const rowAt = y => clamp((y - HORIZON) / (M_BOTTOM - HORIZON)) * a.oh;
    for (let y0 = HORIZON; y0 < M_BOTTOM + 6; y0 += PLAIN_BAND) {
      const y1 = y0 + PLAIN_BAND, tile = sketchCanvas(L, dpr, 0, y0 - 1, P + 24, y1 - y0 + 2);
      if (!tile) return null;
      const g = tile.g, r0 = rowAt(y0 - 1), r1 = Math.max(r0 + 1, rowAt(y1 + 1));
      for (const x of [0, P]) g.drawImage(a.img, 0, r0 * k, a.w, (r1 - r0) * k, x, y0 - 1, P, y1 - y0 + 2);
      const hz = g.createLinearGradient(0, HORIZON, 0, HORIZON + 56); // the haze as basinAt mixes it, fading out over 56 px
      hz.addColorStop(0, css(LT.haze, .3)); hz.addColorStop(1, css(LT.haze, 0));
      g.fillStyle = hz; g.fillRect(0, y0 - 1, P + 24, y1 - y0 + 2);
      const band = g.createLinearGradient(0, HORIZON - 26, 0, HORIZON + 30);
      band.addColorStop(0, css(LT.band.c, 0)); band.addColorStop(.5, css(LT.band.c, LT.band.a)); band.addColorStop(1, css(LT.band.c, 0));
      g.fillStyle = band; g.fillRect(0, y0 - 1, P + 24, y1 - y0 + 2);
      tile.P = P; tile.drawW = P + 24;
      out.push({tile, speed: speedAtY((y0 + y1) / 2)});
    }
    return out;
  }
  // GROUND_FLOW (internal switch, batch 7; the user has not decided on "the ground streaming past the car" yet): on, the
  // ballast and the next track's rail run along the window's lower edge at the nearest ground's speed, smeared by it;
  // off, the code's track bed as before.
  const GROUND_FLOW = true;
  const FLOW = {ballast: {y0: 798, y1: 834}, rail: {y0: 812, y1: 834}};
  function flowStrip(L, dpr, key, at) {
    const a = pic(key), H = at.y1 - at.y0, f = H / a.oh, P0 = a.ow * f, P = P0 * Math.ceil(1800 / P0), blur = speedAtY(828) * BLUR;
    // several of the picture's periods in one canvas (wider than any window), so a frame lays it once or twice
    const c = sketchCanvas(L, dpr, -blur, at.y0, P + 2 * blur + 24, H);
    if (!c) return null;
    const one = sketchCanvas(L, dpr, -blur, at.y0, P + 2 * blur + 24, H);
    for (let x = -P0; x < P + P0; x += P0) one.g.drawImage(a.img, x, at.y0, P0, H);
    const K = Math.max(5, Math.round(blur * L.s * dpr));
    c.g.setTransform(1, 0, 0, 1, 0, 0); c.g.globalCompositeOperation = 'lighter'; c.g.globalAlpha = 1 / K;
    for (let q = 0; q < K; q++) c.g.drawImage(one.c, (q / (K - 1) - .5) * blur * L.s * dpr, 0);
    c.P = P; c.x0 = -blur; c.drawW = P + 2 * blur + 24;
    return c;
  }

  // ---------- the window (batch 6): a slim transom high in the sky, tied-back curtains at both sides ----------
  // The user chose 「C 框配 B 帘」 from the round-7 sketch (mock7): C's single slim bar across the glass, B's cloth drapes
  // tied back to the frame. Both are part of the overlay raster (made once per size), so a frame costs nothing more.
  // The transom: the brief asked for ~11 % of the window's height and never over a mountain. The library's highest ridge
  // (batch6/census6.json, 32 songs with levels, three window sizes) reaches y = 212.2 sketch units (himitsu, vocals),
  // past 11 % (212.6); and every range behind the nearest is held below TOPMOST (206) by geometry()'s soft clamp, while the
  // nearest (bass) cannot rise above ~520. So the bar sits with its shadow ending above 206: top 196, 5 units thick
  // (centre at 9.0 % of the window's height) - no song can reach it.
  const TRANSOM_Y = 196, TRANSOM_T = 5, TRANSOM_SHADOW = 3;
  function transomOf(L) {
    const s = L.s, y = L.win.y + (TRANSOM_Y - M_TOP) * s;
    return {y, t: TRANSOM_T * s, shadow: TRANSOM_SHADOW * s};
  }
  function paintTransom(g, L, bar) {
    const {win} = L;
    g.fillStyle = 'rgba(0,0,0,.26)'; g.fillRect(win.x, bar.y + bar.t, win.w, bar.shadow); // its shadow on the glass below
    const gr = g.createLinearGradient(0, bar.y, 0, bar.y + bar.t);
    gr.addColorStop(0, '#8d8b86'); gr.addColorStop(.2, '#5a5a5a'); gr.addColorStop(.75, '#3a3b3d'); gr.addColorStop(1, '#1e1f21');
    g.fillStyle = gr; g.fillRect(win.x, bar.y, win.w, bar.t);
    const sun = g.createLinearGradient(win.x, 0, win.x + win.w, 0); // the afternoon sun from the left front catches its top edge
    sun.addColorStop(0, 'rgba(255,214,160,.55)'); sun.addColorStop(.5, 'rgba(255,214,160,.12)'); sun.addColorStop(1, 'rgba(255,214,160,.04)');
    g.fillStyle = sun; g.fillRect(win.x, bar.y, win.w, Math.max(.5, bar.t * .2));
  }
  // ---- batch 7: the carriage from GPT's pictures (once per size, in the overlay raster like the code's) ----
  // a strip picture repeated along x from x0 to x1 at f css px per original px, its top at y
  function tileX(g, a, x0, x1, y, f, rows) {
    if (!a) return;
    const [r0, r1] = rows || [0, a.oh], w = a.ow * f, k = a.w / a.ow;
    for (let x = x0; x < x1; x += w) { const cw = Math.min(w, x1 - x); g.drawImage(a.img, 0, r0 * k, cw / f * k, (r1 - r0) * k, x, y, cw, (r1 - r0) * f); }
  }
  // the transom: the bar's rows (11-78 of the picture) on the code's bar, the code's shadow under it
  function artTransom(g, L, bar) {
    const {win} = L, a = pic('carriage/window-transom-a');
    g.fillStyle = 'rgba(0,0,0,.26)'; g.fillRect(win.x, bar.y + bar.t, win.w, bar.shadow);
    tileX(g, a, win.x, win.x + win.w, bar.y, bar.t / 67, [11, 78]);
  }
  // the wall: the panel picture as a pattern (a tile about 300 x 300 css px at 1440 x 900), a little darker at the top
  // and the bottom as the code's gradient
  function artWall(g, L) {
    const a = pic('carriage/wall-panel-a'), u = L.u;
    const p = a && typeof g.createPattern === 'function' ? g.createPattern(a.img, 'repeat') : null;
    if (p && p.setTransform && typeof DOMMatrix === 'function') { const sc = 300 * u / a.w; p.setTransform(new DOMMatrix([sc, 0, 0, sc, 0, 0])); }
    g.fillStyle = p || '#1c1e21'; g.fill('evenodd');
    const sh = g.createLinearGradient(0, 0, 0, L.h); sh.addColorStop(0, 'rgba(0,0,0,.42)'); sh.addColorStop(.5, 'rgba(0,0,0,.3)'); sh.addColorStop(1, 'rgba(0,0,0,.38)');
    g.fillStyle = sh; g.fill('evenodd');
  }
  // the frame: the corner picture at the four corners (flipped), its inner edge (48 px in) on the glass's edge and its
  // inner radius (~100 px) on the window's; the straight runs stretched from the picture's last 4 px
  const CORNER_IN = 48, CORNER_R = 100;
  function artFrame(g, L) {
    const a = pic('carriage/window-corner-a'), {win} = L;
    if (!a) return;
    const f = win.r / CORNER_R, S = a.ow * f, o = CORNER_IN * f, k = a.w / a.ow, e = 4, band = 64;
    const run = (W, H) => { // the top-left quarter's pieces in a frame where the corner is at (0, 0)
      g.drawImage(a.img, 0, 0, a.w, a.h, -o, -o, S, S);
      if (W > 2 * (S - o)) g.drawImage(a.img, (a.ow - e) * k, 0, e * k, band * k, S - o, -o, W / 2 - (S - o) + .5, band * f);
      if (H > 2 * (S - o)) g.drawImage(a.img, 0, (a.oh - e) * k, band * k, e * k, -o, S - o, band * f, H / 2 - (S - o) + .5);
    };
    for (const [sx, sy] of [[1, 1], [-1, 1], [1, -1], [-1, -1]]) {
      g.save(); g.translate(sx > 0 ? win.x : win.x + win.w, sy > 0 ? win.y : win.y + win.h); g.scale(sx, sy); run(win.w, win.h); g.restore();
    }
  }
  function artSill(g, L, sillY) {
    const a = pic('carriage/sill-a');
    if (a) tileX(g, a, 0, L.w, sillY, (L.h - sillY) / a.oh);
  }
  // the curtains: curtain-left-a / curtain-right-a (the brief: always a), hung by their heading point [260, 95] from the
  // rail just over the window, the hem at the code's hem; the wall side well over the wall (CURTAIN_OUT), so the tied
  // cloth leaves the glass about as the code's did; a narrow window squeezes them as the code's (x only). Their shadow
  // (a blurred copy) falls on the wall and the frame only, never on the glass. Then the rail across the window's top.
  const CURTAIN_OUT = 58, CURTAIN_X = .8;
  function curtainPlace(L, side) {
    const C = curtainShapes(L), {win, u} = L, a = pic(side < 0 ? 'carriage/curtain-left-a' : 'carriage/curtain-right-a');
    if (!a) return null;
    const railY = C.top - 2.5 * u, f = (C.bot - railY) / (a.bbox[3] - a.anchor[1]), fx = f * CURTAIN_X * Math.min(1, C.k / u);
    const hx = side < 0 ? win.x - CURTAIN_OUT * u + (a.anchor[0] - a.bbox[0]) * fx : win.x + win.w + CURTAIN_OUT * u - (a.bbox[2] + 1 - a.anchor[0]) * fx;
    return {a, f, fx, x: hx - a.anchor[0] * fx, y: railY - a.anchor[1] * f, w: a.ow * fx, h: a.oh * f, railY};
  }
  function artCurtains(g, L) {
    const {win, u} = L, P = [curtainPlace(L, -1), curtainPlace(L, 1)].filter(Boolean);
    g.save();
    roundRect(g, win.x, win.y, win.w, win.h, win.r); g.rect(0, 0, L.w, L.h); g.clip('evenodd');
    g.shadowColor = 'rgba(0,0,0,.5)'; g.shadowBlur = 9 * u; g.shadowOffsetX = 7 * u; g.shadowOffsetY = 4 * u;
    for (const c of P) g.drawImage(c.a.img, c.x, c.y, c.w, c.h);
    g.restore();
    for (const c of P) g.drawImage(c.a.img, c.x, c.y, c.w, c.h);
    const rail = pic('carriage/curtain-rail-a');
    if (rail && P.length) {
      const f = 7 * u / 44, x0 = Math.min(...P.map(c => c.x)) + 10 * u, x1 = Math.max(...P.map(c => c.x + c.w)) - 10 * u;
      tileX(g, rail, x0, x1, P[0].railY - 4.5 * u - 10 * f, f);
    }
  }
  // the LED housings' bezels: a picture's frame in nine pieces round the display's rect, each border as thick as the
  // housing's own rim (1.7 dot pitches), the opening left clear for the dots; baked once per rect and dpr
  const BEZEL = {header: {key: 'carriage/led-bezel-a', cut: [58, 53, 58, 48]}, sill: {key: 'carriage/led-bezel-b', cut: [57, 31, 57, 27]}};
  const bezels = new Map();
  function bezel(ctx, which, rect, ins, dpr) {
    const B = BEZEL[which], a = pic(B.key);
    if (!a) return;
    const key = [which, rect.x, rect.y, rect.w, rect.h, ins, dpr].join('|');
    let c = bezels.get(key);
    if (!c) {
      c = makeCanvas(rect.w * dpr, rect.h * dpr);
      const g = c && c.getContext('2d');
      if (!g) return;
      g.setTransform(dpr, 0, 0, dpr, 0, 0);
      const k = a.w / a.ow, [bx0, by0, bx1, by1] = a.bbox, sx = [bx0, bx0 + B.cut[0], bx1 + 1 - B.cut[2], bx1 + 1], sy = [by0, by0 + B.cut[1], by1 + 1 - B.cut[3], by1 + 1];
      const dx = [0, ins, rect.w - ins, rect.w], dy = [0, ins, rect.h - ins, rect.h];
      for (let i = 0; i < 3; i++) for (let j = 0; j < 3; j++) {
        if (i === 1 && j === 1) continue;
        g.drawImage(a.img, sx[i] * k, sy[j] * k, (sx[i + 1] - sx[i]) * k, (sy[j + 1] - sy[j]) * k, dx[i], dy[j], dx[i + 1] - dx[i], dy[j + 1] - dy[j]);
      }
      if (bezels.size > 8) bezels.delete(bezels.keys().next().value);
      bezels.set(key, c);
    }
    ctx.drawImage(c, rect.x, rect.y, rect.w, rect.h);
  }
  // The curtains: deep blue-grey cloth (the carriage's trim, not the scenery's colours) hung from a short rod over each
  // side, tied back to the frame by a band, so the inner edge sweeps in an arc to the tie and flares out below it. Painted
  // per pixel once per size: the folds are uneven (each its own width and depth), tight under the rod and looser toward
  // the hem, fanning out across the cloth; lit on the slopes that face the light from the left front, the edge that faces
  // the window warm-rimmed (the right curtain, facing the light, more). Its shadow falls on the wall and the frame only:
  // the sun is outside, so nothing of the cloth darkens the glass.
  const FABRIC = {lit: [104, 116, 134], mid: [58, 70, 88], dark: [24, 30, 40]}, SUNLIT = [255, 200, 140];
  function curtainShapes(L) {
    const {win, u} = L;
    // as the sketch's B at 1440 x 900 (u = 1); a window narrower than its height asks keeps the cloth under 9 % of its width
    const k = u * Math.min(1, win.w * .09 / (106 * u));
    const top = win.y - 10 * u, bot = win.y + win.h + 10 * u, tie = win.y + win.h * .59;
    const side = (outer, s, wTop, wTie, wBot, rim, seed) => {
      const w = y => y < tie ? lerp(wTop, wTie, Math.pow(clamp((y - top) / (tie - top)), 1.6)) : lerp(wTie, wBot, Math.pow(clamp((y - tie) / (bot - tie)), .7));
      return {s, rim, seed, xo: () => outer, xi: y => outer + s * k * w(y), w: y => k * w(y), maxW: k * Math.max(wTop, wTie, wBot)};
    };
    return {top, bot, tie, k, sides: [side(win.x - 16 * u, 1, 102, 46, 76, .55, 21), side(win.x + win.w + 16 * u, -1, 106, 48, 80, 1, 33)]};
  }
  function curtains(g, L, dpr) {
    const C = curtainShapes(L), {top, bot, tie} = C, u = L.u, {win} = L;
    // shadows: on the wall and frame, never on the glass
    g.save();
    roundRect(g, win.x, win.y, win.w, win.h, win.r); g.rect(0, 0, L.w, L.h); g.clip('evenodd');
    g.filter = 'blur(' + (7 * u * dpr).toFixed(1) + 'px)'; g.fillStyle = 'rgba(0,0,0,.42)';
    for (const S of C.sides) {
      const dx = (S.s > 0 ? 6 : 10) * u;
      g.beginPath();
      for (let y = top; y <= bot; y += 6 * u) g.lineTo(S.xi(y) + dx, y + 4 * u);
      for (let y = bot; y >= top; y -= 6 * u) g.lineTo(S.xo(y) + dx, y + 4 * u);
      g.closePath(); g.fill();
    }
    g.filter = 'none';
    g.restore();
    for (const S of C.sides) cloth(g, L, C, S, dpr);
    for (const S of C.sides) { // the tie band round the gathered waist, its hook on the wall; the rod over the drape
      const s = S.s, xo = S.xo(tie), xi = S.xi(tie), x0 = Math.min(xo, xi) - 3 * u, x1 = Math.max(xo, xi) + 3 * u;
      // the band pulls the cloth in a little above and below it: a soft shade, then the band
      g.fillStyle = 'rgba(0,0,0,.35)'; roundRect(g, x0, tie - 8 * u, x1 - x0, 18 * u, 6 * u); g.fill();
      const band = g.createLinearGradient(0, tie - 9 * u, 0, tie + 9 * u);
      band.addColorStop(0, '#8a8f97'); band.addColorStop(.35, '#4a5160'); band.addColorStop(1, '#232833');
      g.fillStyle = band; roundRect(g, x0, tie - 9 * u, x1 - x0, 16 * u, 6 * u); g.fill();
      g.fillStyle = css(SUNLIT, s > 0 ? .3 : .55); g.fillRect(x0 + 3 * u, tie - 8.5 * u, (x1 - x0) * .5, Math.max(.6, 1.3 * u));
      g.fillStyle = '#6b6862'; g.beginPath(); g.arc(xo - s * 6 * u, tie, 4 * u, 0, Math.PI * 2); g.fill();
      const ra = Math.min(S.xo(top), S.xi(top)) - 10 * u, rb = Math.max(S.xo(top), S.xi(top)) + 10 * u;
      const rod = g.createLinearGradient(0, top - 6 * u, 0, top + 2 * u); rod.addColorStop(0, '#a29d94'); rod.addColorStop(1, '#3a3937');
      g.fillStyle = rod; roundRect(g, ra, top - 6 * u, rb - ra, 7 * u, 3.5 * u); g.fill();
      g.fillStyle = '#585652'; g.beginPath(); g.arc(s > 0 ? ra : rb, top - 2.5 * u, 5 * u, 0, Math.PI * 2); g.fill();
    }
  }
  // one drape, per device pixel. p runs across the cloth (0 at the wall, 1 at the edge facing the window). The folds are
  // a phase F(y) * warp(p): F falls from 8 under the rod to 4.5 at the hem (tight above, loose below - the fold lines fan
  // out), the warp makes each fold its own width, and each fold has its own depth. The fold's cross-section is skewed:
  // a short steep side that faces the light and a long one in shade, not a sine (a sine read as a pleated skirt).
  function cloth(g, L, C, S, dpr) {
    const {top, bot, tie} = C, u = L.u, seed = S.seed;
    const bx0 = Math.floor((S.s > 0 ? S.xo(0) : S.xo(0) - S.maxW) * dpr) - 2, bx1 = Math.ceil((S.s > 0 ? S.xo(0) + S.maxW : S.xo(0)) * dpr) + 2;
    const by0 = Math.floor(top * dpr) - 1, by1 = Math.ceil((bot + 4 * u) * dpr) + 1;
    const W = bx1 - bx0, H = by1 - by0, cv = makeCanvas(W, H), cg = cv && cv.getContext('2d');
    if (!cg || typeof cg.createImageData !== 'function') return;
    const img = cg.createImageData(W, H), d = img.data;
    const warp = p => p + .04 * Math.sin(2 * Math.PI * 1.7 * p + seed) + .018 * Math.sin(2 * Math.PI * 4.3 * p + 2 * seed);
    for (let r = 0; r < H; r++) {
      const y = (by0 + r + .5) / dpr;
      const v = clamp((y - top) / (bot - top)), F = lerp(8, 4.5, v * v * (3 - 2 * v));
      const drift = (vnoise(y / (220 * u), seed) - .5) * .35;
      const xo = S.xo(y), w = S.w(y);
      const bunch = .32 * Math.exp(-Math.pow((y - tie) / (26 * u), 2)), shade = (1 - bunch) * (.8 + .2 * (1 - v));
      for (let c = 0; c < W; c++) {
        const x = (bx0 + c + .5) / dpr, p = S.s > 0 ? (x - xo) / w : (xo - x) / w;
        const ein = Math.min(p * w, (1 - p) * w) * dpr + .5; // device px inside the cloth's side edges
        if (ein <= 0) continue;
        const ph = F * warp(p) + drift, n = Math.floor(ph), f = ph - n;
        const depth = .55 + .45 * hash(n, seed + 3);
        // the hem follows the folds: a fold's crest hangs a little lower than its valleys
        const crest = Math.sin(Math.PI * f);
        const yb = bot + (1.5 + 2.5 * crest * depth) * u;
        const ebot = (yb - y) * dpr + .5, etop = (y - top) * dpr + .5;
        const a = clamp(Math.min(ein, ebot, etop));
        if (a <= 0) continue;
        // skewed profile: rises over the first 30 % of the fold (faces the light: bright), falls over the rest
        const fold = f < .38 ? Math.sin(Math.PI * f / .38) : -Math.sin(Math.PI * (f - .38) / .62) * .55;
        // and a broad swell across two or three folds, so the cloth billows instead of standing in even pleats
        const lit = .68 * fold + .32 * Math.sin(2 * Math.PI * (.36 * F * warp(p) + .5 * drift) + seed);
        let b = clamp((.42 + .45 * lit * depth) * shade * (.7 + .3 * smooth(0, .14, p)));
        b *= 1 - .25 * clamp(1 - ebot / (3 * dpr)) ; // the hem's lower edge turns under
        let col = b > .5 ? mix(FABRIC.mid, FABRIC.lit, (b - .5) * 2) : mix(FABRIC.dark, FABRIC.mid, b * 2);
        const warm = clamp((b - .55) / .3) * S.rim * (.25 + .75 * p * p) + S.rim * clamp(1 - (1 - p) * w * dpr / (2.2 * dpr)) * .9;
        col = mix(col, SUNLIT, clamp(warm) * .55);
        const i = (r * W + c) * 4;
        d[i] = col[0]; d[i + 1] = col[1]; d[i + 2] = col[2]; d[i + 3] = 255 * a;
      }
    }
    cg.putImageData(img, 0, 0);
    g.save(); g.setTransform(1, 0, 0, 1, 0, 0); g.drawImage(cv, bx0, by0); g.restore();
  }
  // film grain on the glass: a fixed tile (the sketch added fresh noise to every pixel, too slow for 60 frames a second)
  let grainTile = null;
  function grain() {
    if (grainTile) return grainTile;
    const c = makeCanvas(256, 256), g = c && c.getContext('2d');
    if (!g || typeof g.createImageData !== 'function') return null;
    const img = g.createImageData(256, 256), p = img.data;
    let st = 20261119;
    for (let i = 0; i < p.length; i += 4) {
      st = (Math.imul(st, 1664525) + 1013904223) | 0;
      const n = ((st >>> 16) & 255) / 255 - .5, v = n > 0 ? 255 : 0;
      p[i] = p[i + 1] = p[i + 2] = v; p[i + 3] = Math.round(Math.abs(n) * .11 * 255);
    }
    g.putImageData(img, 0, 0);
    grainTile = c;
    return grainTile;
  }
  const patterns = new WeakMap();

  // ---------- painting one range (sketch coordinates) ----------
  function peaksOf(ys, a, b, sep, prom) {
    const out = [];
    for (let k = a + 3; k < b - 3; k++) {
      let ok = true, lowR = ys[k], lowL = ys[k];
      for (let j = Math.max(a, k - sep); j <= Math.min(b - 1, k + sep); j++) {
        if (ys[j] < ys[k] || (ys[j] === ys[k] && j < k)) { ok = false; break; }
        if (j > k) lowR = Math.max(lowR, ys[j]); else lowL = Math.max(lowL, ys[j]);
      }
      if (ok && Math.max(lowR, lowL) - ys[k] >= prom) out.push(k);
    }
    return out;
  }
  // the body (ridge down to the basin) over every run of columns where the range stands; built once a frame and used for
  // the fill, the clip of its faces and the clip of the haze over it (a Path2D where the canvas has one)
  function bodyPath(ctx, R) {
    if (R.body !== undefined) { if (R.body) return R.body; }
    const {ys, foot, x0} = R, a = R.ja, b = R.jb;
    const p = typeof Path2D === 'function' ? new Path2D() : (ctx.beginPath(), ctx);
    // below the foot the body runs on as basin down to BASIN, but only as deep as the range is tall (a range that is
    // nearly gone leaves no flat band behind it)
    const bottom = k => foot[k] + (BASIN + 2 - foot[k]) * smooth(0, 40, foot[k] - ys[k]);
    let run = -1;
    for (let k = a; k <= b + 1; k++) {
      const up = k <= b && foot[k] - ys[k] >= .5;
      if (up && run < 0) { run = k; p.moveTo(x0 + k * COL, foot[k]); }
      if (up) p.lineTo(x0 + k * COL, Math.min(ys[k], foot[k]));
      if (!up && run >= 0) { for (let q = k - 1; q >= run; q--) p.lineTo(x0 + q * COL, bottom(q)); p.closePath(); run = -1; }
    }
    R.body = p === ctx ? null : p;
    return R.body;
  }
  const fillPath = (ctx, R) => { const p = bodyPath(ctx, R); if (p) ctx.fill(p); else ctx.fill(); };
  const clipPath = (ctx, R) => { const p = bodyPath(ctx, R); if (p) ctx.clip(p); else ctx.clip(); };
  function paintRange(ctx, R, LT, view) {
    const {ys, foot, x0, env} = R, a = R.ja, b = R.jb, detail = 1 - R.d, seed = R.layer.seed;
    let tall = 0, top = BASIN, fsum = 0, fn = 0;
    for (let k = a; k <= b; k++) { const hgt = foot[k] - ys[k]; if (hgt > tall) tall = hgt; if (ys[k] < top) top = ys[k]; if (hgt >= .5) { fsum += foot[k]; fn++; } }
    if (tall < 3) return false;
    const wash = lerp(.06, .62, Math.pow(R.d, .85));
    const color = rgb(STEM_COLOR[R.id]);
    const c = mix(color, LT.haze, clamp(wash * LT.washK)), lit = mix(c, LT.light, .10 * (1 - wash) * LT.litK);
    const fm = fn ? fsum / fn : BASE0;
    // body: lit at the ridge, into the haze toward the foot, then the basin down to the plain
    const kf = clamp((fm - top) / (BASIN - top));
    const g = ctx.createLinearGradient(0, top, 0, BASIN);
    g.addColorStop(0, css(lit)); g.addColorStop(kf * .55, css(mix(c, LT.haze, .12)));
    g.addColorStop(kf * .775, css(mix(c, LT.haze, .3)));
    g.addColorStop(Math.min(1, kf + .001), css(mix(mix(c, LT.haze, .55), basinAt(LT, fm), .5)));
    g.addColorStop(Math.min(1, kf + .002 + (1 - kf) * .4), css(basinAt(LT, lerp(fm, BASIN, .4))));
    g.addColorStop(1, css(basinAt(LT, BASIN)));
    ctx.fillStyle = g; fillPath(ctx, R);
    // faces: the shaded east face below each peak and the sunlit west face, then rock bedding on the near ranges
    ctx.save();
    clipPath(ctx, R);
    const sep = Math.round(lerp(34, 20, detail)), pa = Math.max(0, a - 2 * sep), pb = Math.min(R.n, b + 2 * sep + 1);
    const peaks = peaksOf(ys, pa, pb, sep, lerp(9, 4, detail));
    const X = k => x0 + k * COL, key = k => R.k0 + k; // hash keys follow the world sample, so a peak keeps its face as it moves
    for (let p = 0; p < peaks.length; p++) {
      const k = peaks[p], prev = p ? peaks[p - 1] : pa, next = p < peaks.length - 1 ? peaks[p + 1] : pb - 1;
      let kv = k, kl = k;
      for (let j = k; j <= next; j++) if (ys[j] > ys[kv]) kv = j;
      for (let j = k; j >= prev; j--) if (ys[j] > ys[kl]) kl = j;
      if (kv < a - 4 && k < a) continue;
      if (kl > b + 4 && k > b) continue;
      const run = X(kv) - X(k), drop = ys[kv] - ys[k];
      if (run < 8 || drop < 4) continue;
      const tx = X(k) + run * (.42 + .2 * hash(key(k), seed + 5)), ty = Math.min(foot[kv] - 2, ys[kv] + (run * .22 + drop * .35 + 8) * LT.faceLen);
      const spur = [];
      for (let m = 1; m < 5; m++) spur.push([lerp(X(k), tx, m / 5) + (hash(key(k) * 7 + m, seed + 6) - .5) * run * .22, lerp(ys[k], ty, m / 5)]);
      ctx.beginPath(); ctx.moveTo(X(k), ys[k]);
      for (let j = k; j <= kv; j++) ctx.lineTo(X(j), ys[j] - 1);
      ctx.lineTo(lerp(X(kv), tx, .5) + (hash(key(k), seed + 8) - .5) * 12, lerp(ys[kv], ty, .55));
      ctx.lineTo(tx, ty);
      for (let m = spur.length - 1; m >= 0; m--) ctx.lineTo(spur[m][0], spur[m][1]);
      ctx.closePath();
      const sa = lerp(.12, .5, detail) * (1 - wash * .6) * LT.shadeK;
      const sg = ctx.createLinearGradient(0, ys[k], 0, ty);
      sg.addColorStop(0, css(mix(c, LT.shade, .75), sa)); sg.addColorStop(.6, css(mix(c, LT.shade, .7), sa * .6)); sg.addColorStop(1, css(mix(c, LT.shade, .7), 0));
      ctx.fillStyle = sg; ctx.fill();
      const runL = X(k) - X(kl);
      if (runL > 8) {
        ctx.beginPath(); ctx.moveTo(X(kl), ys[kl]);
        for (let j = kl; j <= k; j++) ctx.lineTo(X(j), ys[j]);
        for (const q of spur) ctx.lineTo(q[0], q[1]);
        ctx.lineTo(tx, ty); ctx.lineTo(lerp(X(kl), tx, .4), lerp(ys[kl], ty, .7)); ctx.closePath();
        const la = lerp(.08, .34, detail) * (1 - wash * .5) * LT.litK;
        const lg = ctx.createLinearGradient(0, ys[k], 0, ty);
        lg.addColorStop(0, css(LT.light, la)); lg.addColorStop(1, css(LT.light, 0));
        ctx.fillStyle = lg; ctx.fill();
      }
    }
    if (detail > .45) { // faint horizontal bedding: sandstone, not forest
      ctx.lineWidth = 1;
      for (let m = 0; m < 5; m++) {
        ctx.strokeStyle = m % 2 ? css(mix(c, LT.shade, .7), (detail - .45) * .2) : css(mix(c, LT.light, .6), (detail - .45) * .16);
        ctx.beginPath();
        for (let k = a - (a & 1); k <= b + 1; k += 2) { // every other column, on even world samples so it does not crawl
          const kk = Math.min(R.n - 1, Math.max(0, k + (R.k0 & 1)));
          const hgt = foot[kk] - ys[kk], y = foot[kk] - hgt * (.25 + m * .13) + (vnoise(key(kk) * .05 + m * 7, seed + 40 + m) - .5) * 3;
          if (hgt < 30) ctx.moveTo(X(kk), y); else ctx.lineTo(X(kk), y);
        }
        ctx.stroke();
      }
    }
    ctx.restore();
    // the crest: sunlit where it rises toward the sun, a thin shade line where it falls (strokes batched by strength)
    const buckets = [[], [], [], []], shade = [];
    for (let k = Math.max(a, 1); k <= b; k++) {
      if (foot[k] - ys[k] < 4) continue;
      const rise = ys[k - 1] - ys[k];
      if (rise > 0) buckets[Math.min(3, Math.floor((clamp(rise / 2 + .25) - .25) / .75 * 4))].push(k); else shade.push(k);
    }
    ctx.lineWidth = lerp(.8, 1.5, detail);
    const strokeSet = (list, style) => {
      if (!list.length) return;
      ctx.strokeStyle = style; ctx.beginPath();
      for (const k of list) { ctx.moveTo(X(k - 1), ys[k - 1]); ctx.lineTo(X(k), ys[k]); }
      ctx.stroke();
    };
    for (let q = 0; q < 4; q++) strokeSet(buckets[q], css(mix(c, LT.light, .7), lerp(.25, .75, detail) * (.25 + .75 * (q + .5) / 4) * LT.litK));
    strokeSet(shade, css(mix(c, LT.shade, .5), lerp(.08, .3, detail)));
    // where a range eases in or out, a low haze lies over its foot so it sinks into the plain instead of ending in a wall
    const m = view.matrix;
    if (m) {
      const hz = ctx.createLinearGradient(0, 0, 0, 1), hc = basinAt(LT, fm);
      hz.addColorStop(0, css(hc, 0)); hz.addColorStop(1, css(hc, 1));
      ctx.save(); ctx.fillStyle = hz;
      for (let k = a - (a & 1); k <= b; k += 2) {
        const e = env[k], al = 4 * e * (1 - e) * .75;
        if (al < .02) continue;
        const hgt = foot[k] - ys[k], hh = Math.max(24, hgt * .9), y1 = foot[k] + 4;
        ctx.globalAlpha = al;
        ctx.setTransform(m.a * 2 * COL, 0, 0, m.d * hh, m.a * (X(k) - COL) + m.e, m.d * (y1 - hh) + m.f);
        ctx.fillRect(0, 0, 1, 1);
      }
      ctx.restore();
    }
    return true;
  }
  // haze in the basin between a nearer ridge and the range behind it (stepped bands, clipped to the range behind)
  function mist(ctx, far, near, a, LT) {
    if (a <= 0) return;
    const line = boxBlur(near.ys, 4, 1);
    // the haze is soft: every third column of the range behind, on world samples divisible by 3 so it does not crawl
    const first = far.ja - ((far.k0 + far.ja) % 3 + 3) % 3, xs = [], ln = [];
    for (let k = first; k <= far.jb + 3; k += 3) { const x = far.x0 + k * COL; xs.push(x); ln.push(at(near, line, x) + 4); }
    ctx.save();
    clipPath(ctx, far);
    const H = 44, ramp = .8 * (H + 10), steps = 5;
    const col = basinAt(LT, 600);
    const band = (from, to, alpha) => {
      ctx.fillStyle = css(col, alpha); ctx.beginPath();
      for (let k = 0; k < xs.length; k++) ctx.lineTo(xs[k], ln[k] + from);
      for (let k = xs.length - 1; k >= 0; k--) ctx.lineTo(xs[k], ln[k] + to);
      ctx.closePath(); ctx.fill();
    };
    for (let q = 0; q < steps; q++) band(-H + ramp * q / steps, -H + ramp * (q + 1) / steps, a * (q + .5) / steps);
    band(-H + ramp, 10, a);
    ctx.restore();
  }

  // ---------- the ranges from cached tiles (batch 5, 2026-11-19) ----------
  // Measured in XML's real window (1440 x 778 CSS at DPR 2): the script part of a frame took 4-7 ms but frames came every
  // 50-60 ms; the cost was the GPU painting each range's clip, faces, bedding, crest, foot haze and the haze bands every
  // frame. And the shaded faces were chosen anew every frame from the ridge as it stood in the window (peaks found in the
  // sliding window, the valley after each peak up to the window's edge), so they kept changing: the flicker.
  // Now: a range's details (shaded and lit faces, bedding, crest, foot haze; and the haze band it lays on the range
  // behind it) are painted once per tile of TILE world samples from the range's own world shape - the ridge as its stem
  // alone makes it, standing on BASE0 - and kept. Each frame the body is still filled from the frame's exact ridge, and
  // the tiles are laid over it in vertical strips, each strip moved up or down by how far the frame's ridge stands from
  // the world ridge there (the steps and lifts behind nearer ranges, which change with the music), strips split wherever
  // that offset changes by more than STRIP_TOL device px. The haze goes on with 'source-atop' in a composite of the ranges
  // only, instead of a clip per range. Every pixel is still a function of song time: tiles are pure functions of their
  // index, and the cache only saves time.
  const TILE = 256, TILE_REACH = 400, PEAK_REACH = 300, FEATURE_REACH = 200, VALLEY_MAX = 160;
  const STRIP_TOL = .3, TILE_BUDGET = 64e6; // device px; total tile pixels kept
  const srcIds = new WeakMap(); let srcSerial = 0;
  const tileCache = new Map(); let tilePixels = 0, frameNo = 0;
  function gatesOf(src, L, layer) {
    const ahead = (L.right - L.nowM) / layer.pps, behind = (L.nowM - L.left) / layer.pps;
    return {gA: src.plainStart + ahead, gB: src.plainEnd - behind, rampT: GATE_PX / layer.pps};
  }
  // the range's world shape over samples [k0, k1]: what geometry() makes of this stem before any nearer range steps its
  // foot up or lifts it (the same gates, presence, relief, hills and flank caps)
  function worldShape(src, L, layer, k0, k1) {
    const {i, dt, amp} = layer, n = k1 - k0 + 1, G = gatesOf(src, L, layer);
    const hg = new Float64Array(n), env = new Float64Array(n), cap = new Float64Array(n);
    const S = (i ? 1.5 + 1.3 * RUG : 6) * 2;
    for (let j = 0; j < n; j++) {
      const kk = k0 + j, tt = kk * dt;
      const gate = tt <= G.gA || tt >= G.gB ? 0 : smooth(G.gA, G.gA + G.rampT, tt) * (1 - smooth(G.gB - G.rampT, G.gB, tt));
      let pres = 0;
      if (gate > 0) {
        pres = sampleE(src, layer, kk);
        const e = pres * gate;
        env[j] = e;
        if (e > 0) {
          let rel = sampleR(src, layer, kk);
          if (gate < 1) rel = rel * gate + HILL * 4 * (1 - gate) * (.35 + .4 * vnoise(tt * .55 / layer.f + i * 3.1, 61 + i) + .25 * vnoise(tt * 1.7 / layer.f + i * 7.7, 71 + i));
          hg[j] = amp * e * rel;
        }
      }
      cap[j] = S * Math.min(.22 + .78 * gate * gate, .4 + .6 * smooth(.3, .9, pres));
    }
    for (let j = 1; j < n; j++) hg[j] = Math.min(hg[j], hg[j - 1] + Math.max(cap[j], cap[j - 1]));
    for (let j = n - 2; j >= 0; j--) hg[j] = Math.min(hg[j], hg[j + 1] + Math.max(cap[j], cap[j + 1]));
    return {k0, n, hg, env};
  }
  // one tile: the details of `layer` over world samples [c*TILE, (c+1)*TILE), and the haze band it lays on the range behind
  function makeTile(src, L, LT, dpr, layer, c) {
    const kS = c * TILE, W = worldShape(src, L, layer, kS - TILE_REACH, kS + TILE + TILE_REACH);
    const at = k => k - W.k0, ys = new Float64Array(W.n);
    for (let j = 0; j < W.n; j++) ys[j] = BASE0 - W.hg[j];
    const hgT = Float32Array.from(W.hg.subarray(at(kS), at(kS + TILE)));
    const tile = {kS, hg: hgT, detail: null, mist: null, pixels: 0};
    const scale = L.s * dpr, x0 = -COL / 2 - 2, w = TILE * COL + 4;
    const X = k => (k - kS) * COL;
    let top = Infinity;
    for (let k = kS - FEATURE_REACH; k < kS + TILE + FEATURE_REACH; k++) if (W.hg[at(k)] >= .5) top = Math.min(top, ys[at(k)]);
    if (top < Infinity) {
      const y0 = top - 8, h = BASE0 + 10 - y0;
      const cv = makeCanvas(w * scale, h * scale);
      if (cv) {
        const g = cv.getContext('2d'), base = [scale, 0, 0, scale, -x0 * scale, -y0 * scale];
        g.setTransform(...base);
        paintDetails(g, base, src, layer, LT, W, ys, kS, X);
        tile.detail = {c: cv, x0, y0, h};
        tile.pixels += cv.width * cv.height;
      }
    }
    const far = src.layers[layer.i + 1];
    if (far) { // the haze band over the range behind, along this range's (softened) ridge
      const a = lerp(.5, .62, far.d) * LT.mistK;
      const line = boxBlur(ys, 4, 1), xs = [], ln = [];
      const first = kS - 6 - (((kS - 6) % 3) + 3) % 3;
      for (let k = first; k <= kS + TILE + 6; k += 3) { xs.push(X(k)); ln.push(line[at(k)] + 4); }
      let lo = Infinity, hi = -Infinity;
      for (const v of ln) { lo = Math.min(lo, v); hi = Math.max(hi, v); }
      const col0 = basinAt(LT, 600), hz = ART && hazeOf(LT, layer.i % 2 ? 'b' : 'a', col0);
      if (hz) { lo += -14 - HAZE_H / 2 + HAZE_ROWS[0] * HAZE_H + 44; hi += -14 - HAZE_H / 2 + HAZE_ROWS[1] * HAZE_H - 10; } // room for the strip's rows that hold haze
      const H = 44, y0 = lo - H - 2, h = hi + 12 - y0;
      const cv = makeCanvas(w * scale, h * scale);
      if (cv && a > 0 && hz) { // batch 7: GPT's haze strip, one slice a world sample along this range's softened ridge
        const g = cv.getContext('2d'), half = hz.width / 2;
        g.setTransform(scale, 0, 0, scale, -x0 * scale, -y0 * scale);
        g.globalAlpha = a;
        // one slice every third world sample (as the code's band took every third column), on samples divisible by 3
        for (let k = kS - 3 - (((kS - 3) % 3) + 3) % 3; k <= kS + TILE + 3; k += 3) {
          const sx = ((k * COL + layer.i * 701) % half + half) % half, yc = line[at(k + 1)] + 4 - 14;
          g.drawImage(hz, sx, HAZE_ROWS[0] * hz.height, 3 * COL, (HAZE_ROWS[1] - HAZE_ROWS[0]) * hz.height, X(k) - COL / 2, yc - HAZE_H / 2 + HAZE_ROWS[0] * HAZE_H, 3 * COL, (HAZE_ROWS[1] - HAZE_ROWS[0]) * HAZE_H);
        }
        tile.mist = {c: cv, x0, y0, h};
        tile.pixels += cv.width * cv.height;
      } else if (cv && a > 0) {
        const g = cv.getContext('2d');
        g.setTransform(scale, 0, 0, scale, -x0 * scale, -y0 * scale);
        const ramp = .8 * (H + 10), steps = 5, col = basinAt(LT, 600);
        const band = (from, to, alpha) => {
          g.fillStyle = css(col, alpha); g.beginPath();
          for (let k = 0; k < xs.length; k++) g.lineTo(xs[k], ln[k] + from);
          for (let k = xs.length - 1; k >= 0; k--) g.lineTo(xs[k], ln[k] + to);
          g.closePath(); g.fill();
        };
        for (let q = 0; q < steps; q++) band(-H + ramp * q / steps, -H + ramp * (q + 1) / steps, a * (q + .5) / steps);
        band(-H + ramp, 10, a);
        tile.mist = {c: cv, x0, y0, h};
        tile.pixels += cv.width * cv.height;
      }
    }
    return tile;
  }
  // faces, bedding, crest and foot haze of the world shape, as paintRange draws them, in tile coordinates
  function paintDetails(g, base, src, layer, LT, W, ys, kS, X) {
    const at = k => k - W.k0, detail = 1 - layer.d, seed = layer.seed;
    const wash = lerp(.06, .62, Math.pow(layer.d, .85));
    const color = rgb(STEM_COLOR[layer.id]);
    const c = mix(color, LT.haze, clamp(wash * LT.washK));
    const a0 = kS - FEATURE_REACH, b0 = kS + TILE + FEATURE_REACH; // samples whose features can reach into the tile
    // the body of the world shape, for clipping the faces and the bedding (as paintRange clips them to the body)
    const body = typeof Path2D === 'function' ? new Path2D() : null;
    const P = body || g;
    if (!body) g.beginPath();
    let run = -1;
    const bottom = k => BASE0 + (BASIN + 2 - BASE0) * smooth(0, 40, BASE0 - ys[at(k)]);
    for (let k = a0; k <= b0 + 1; k++) {
      const up = k <= b0 && W.hg[at(k)] >= .5;
      if (up && run < 0) { run = k; P.moveTo(X(k), BASE0); }
      if (up) P.lineTo(X(k), Math.min(ys[at(k)], BASE0));
      if (!up && run >= 0) { for (let q = k - 1; q >= run; q--) P.lineTo(X(q), bottom(q)); P.closePath(); run = -1; }
    }
    g.save();
    if (body) g.clip(body); else g.clip();
    const sep = Math.round(lerp(34, 20, detail)), prom = lerp(9, 4, detail);
    const peaks = peaksOf(ys, at(kS - PEAK_REACH), at(kS + TILE + PEAK_REACH), sep, prom).map(j => j + W.k0);
    for (let p = 0; p < peaks.length; p++) {
      const k = peaks[p];
      if (k < a0 || k > b0) continue;
      const prev = Math.max(p ? peaks[p - 1] : -Infinity, k - VALLEY_MAX), next = Math.min(p < peaks.length - 1 ? peaks[p + 1] : Infinity, k + VALLEY_MAX);
      let kv = k, kl = k;
      for (let j = k; j <= next; j++) if (ys[at(j)] > ys[at(kv)]) kv = j;
      for (let j = k; j >= prev; j--) if (ys[at(j)] > ys[at(kl)]) kl = j;
      const run = X(kv) - X(k), drop = ys[at(kv)] - ys[at(k)];
      if (run < 8 || drop < 4) continue;
      const yk = ys[at(k)], ykv = ys[at(kv)];
      const tx = X(k) + run * (.42 + .2 * hash(k, seed + 5)), ty = Math.min(BASE0 - 2, ykv + (run * .22 + drop * .35 + 8) * LT.faceLen);
      const spur = [];
      for (let m = 1; m < 5; m++) spur.push([lerp(X(k), tx, m / 5) + (hash(k * 7 + m, seed + 6) - .5) * run * .22, lerp(yk, ty, m / 5)]);
      g.beginPath(); g.moveTo(X(k), yk);
      for (let j = k; j <= kv; j++) g.lineTo(X(j), ys[at(j)] - 1);
      g.lineTo(lerp(X(kv), tx, .5) + (hash(k, seed + 8) - .5) * 12, lerp(ykv, ty, .55));
      g.lineTo(tx, ty);
      for (let m = spur.length - 1; m >= 0; m--) g.lineTo(spur[m][0], spur[m][1]);
      g.closePath();
      const sa = lerp(.12, .5, detail) * (1 - wash * .6) * LT.shadeK;
      const sg = g.createLinearGradient(0, yk, 0, ty);
      sg.addColorStop(0, css(mix(c, LT.shade, .75), sa)); sg.addColorStop(.6, css(mix(c, LT.shade, .7), sa * .6)); sg.addColorStop(1, css(mix(c, LT.shade, .7), 0));
      g.fillStyle = sg; g.fill();
      const runL = X(k) - X(kl);
      if (runL > 8) {
        g.beginPath(); g.moveTo(X(kl), ys[at(kl)]);
        for (let j = kl; j <= k; j++) g.lineTo(X(j), ys[at(j)]);
        for (const q of spur) g.lineTo(q[0], q[1]);
        g.lineTo(tx, ty); g.lineTo(lerp(X(kl), tx, .4), lerp(ys[at(kl)], ty, .7)); g.closePath();
        const la = lerp(.08, .34, detail) * (1 - wash * .5) * LT.litK;
        const lg = g.createLinearGradient(0, yk, 0, ty);
        lg.addColorStop(0, css(LT.light, la)); lg.addColorStop(1, css(LT.light, 0));
        g.fillStyle = lg; g.fill();
      }
    }
    const tex = ART && ART.derived('soft:range-' + textureOf(layer.d)), strata = ART && ART.derived('soft:strata-' + (layer.i % 2 ? 'b' : 'a'));
    if (tex) { // batch 7: the brush texture over the whole body, anchored to the range's world x (+ a phase per range)
      const sc = TEX_TEXEL, P = tex.width * sc, ph = ((kS * COL + layer.i * 311) % P + P) % P;
      const pt = patternOf(g, tex, sc, -ph, layer.i * 97 % (tex.height * sc));
      if (pt) { g.globalAlpha = TEX_K; g.fillStyle = pt; g.fillRect(X(kS - 4), BASE0 - layer.amp * 1.6, (TILE + 8) * COL, layer.amp * 1.6 + 20); g.globalAlpha = 1; }
    }
    if (strata && detail > .45) { // and instead of the code's five bedding lines, the strata (level, as sandstone lies)
      const band = layer.amp * .9, sc = band / strata.height, P = strata.width * sc, ph = ((kS * COL + layer.i * 523) % P + P) % P;
      const pt = patternOf(g, strata, sc, -ph, BASE0 - band, 'repeat-x');
      if (pt) { g.globalAlpha = STRATA_K * (detail - .45) / .55; g.fillStyle = pt; g.fillRect(X(kS - 4), BASE0 - band, (TILE + 8) * COL, band); g.globalAlpha = 1; }
    }
    if (detail > .45 && !strata) { // faint horizontal bedding on even world samples
      g.lineWidth = 1;
      for (let m = 0; m < 5; m++) {
        g.strokeStyle = m % 2 ? css(mix(c, LT.shade, .7), (detail - .45) * .2) : css(mix(c, LT.light, .6), (detail - .45) * .16);
        g.beginPath();
        for (let k = kS - 4 - (((kS - 4) % 2) + 2) % 2; k <= kS + TILE + 4; k += 2) {
          const hgt = W.hg[at(k)], y = BASE0 - hgt * (.25 + m * .13) + (vnoise(k * .05 + m * 7, seed + 40 + m) - .5) * 3;
          if (hgt < 30) g.moveTo(X(k), y); else g.lineTo(X(k), y);
        }
        g.stroke();
      }
    }
    g.restore();
    // the crest: sunlit where it rises toward the sun, a thin shade line where it falls
    const buckets = [[], [], [], []], shade = [];
    for (let k = kS - 3; k <= kS + TILE + 3; k++) {
      if (W.hg[at(k)] < 4) continue;
      const rise = ys[at(k - 1)] - ys[at(k)];
      if (rise > 0) buckets[Math.min(3, Math.floor((clamp(rise / 2 + .25) - .25) / .75 * 4))].push(k); else shade.push(k);
    }
    g.lineWidth = lerp(.8, 1.5, detail);
    const strokeSet = (list, style) => {
      if (!list.length) return;
      g.strokeStyle = style; g.beginPath();
      for (const k of list) { g.moveTo(X(k - 1), ys[at(k - 1)]); g.lineTo(X(k), ys[at(k)]); }
      g.stroke();
    };
    for (let q = 0; q < 4; q++) strokeSet(buckets[q], css(mix(c, LT.light, .7), lerp(.25, .75, detail) * (.25 + .75 * (q + .5) / 4) * LT.litK));
    strokeSet(shade, css(mix(c, LT.shade, .5), lerp(.08, .3, detail)));
    // a low haze over the foot where the range eases in or out
    const hz = g.createLinearGradient(0, 0, 0, 1), hc = basinAt(LT, BASE0);
    hz.addColorStop(0, css(hc, 0)); hz.addColorStop(1, css(hc, 1));
    g.save(); g.fillStyle = hz;
    for (let k = kS - 4 - (((kS - 4) % 2) + 2) % 2; k <= kS + TILE + 4; k += 2) {
      const e = W.env[at(k)], al = 4 * e * (1 - e) * .75;
      if (al < .02) continue;
      const hgt = W.hg[at(k)], hh = Math.max(24, hgt * .9), y1 = BASE0 + 4;
      g.globalAlpha = al;
      g.setTransform(base[0] * 2 * COL, 0, 0, base[3] * hh, base[0] * (X(k) - COL) + base[4], base[3] * (y1 - hh) + base[5]);
      g.fillRect(0, 0, 1, 1);
    }
    g.restore();
  }
  const tileKey = (src, L, LT, dpr, layer, c) => srcIds.get(src) + '|' + layer.id + '|' + c + '|' + L.w + 'x' + L.h + '@' + dpr + '|' + lightIds.get(LT) + '|' + MODE();
  function tileOf(src, L, LT, dpr, layer, c) {
    if (!srcIds.has(src)) srcIds.set(src, ++srcSerial);
    if (!lightIds.has(LT)) lightIds.set(LT, ++lightSerial);
    const key = tileKey(src, L, LT, dpr, layer, c);
    let t = tileCache.get(key);
    if (t) { tileCache.delete(key); tileCache.set(key, t); t.used = frameNo; return t; }
    t = makeTile(src, L, LT, dpr, layer, c);
    t.used = frameNo;
    tileCache.set(key, t); tilePixels += t.pixels;
    for (const [k, old] of tileCache) { // least recently used first; never a tile this frame needs
      if (tilePixels <= TILE_BUDGET) break;
      if (old.used === frameNo) continue;
      tileCache.delete(k); tilePixels -= old.pixels;
    }
    return t;
  }
  // a range's tiles laid over its frame. The offset (frame ridge - world ridge) per column is followed piecewise
  // linearly: knots where a straight line between them strays more than STRIP_TOL device px from any column's offset;
  // between two knots the tile is drawn sheared (y moves linearly with x), so neighbouring pieces meet exactly at a knot.
  function offsetKnots(R, tiles, j0, j1, tol) {
    const off = new Float64Array(j1 - j0 + 1);
    for (let j = j0; j <= j1; j++) { const k = R.k0 + j, t = tiles(k); off[j - j0] = R.ys[j] - (BASE0 - t.hg[k - t.kS]); }
    const knots = [j0];
    let i = 0;
    const n = off.length;
    while (i < n - 1) {
      let e = i + 1;
      const lim = Math.min(n - 1, i + 160);
      while (e < lim) {
        const E = e + 1, slope = (off[E] - off[i]) / (E - i);
        let ok = true;
        for (let q = i + 1; q < E; q++) if (Math.abs(off[i] + slope * (q - i) - off[q]) > tol) { ok = false; break; }
        if (!ok) break;
        e = E;
      }
      knots.push(j0 + e);
      i = e;
    }
    return {knots, off: j => off[j - j0]};
  }
  function layStrips(g, R, which, src, L, LT, dpr, m) {
    const layer = R.layer, scale = L.s * dpr;
    let j = Math.max(0, R.ja - 1);
    const jEnd = Math.min(R.n - 1, R.jb + 1);
    while (j <= jEnd) {
      const k = R.k0 + j, c = Math.floor(k / TILE), tile = tileOf(src, L, LT, dpr, layer, c), img = tile[which];
      const tileEnd = R.k0 + jEnd < (c + 1) * TILE - 1 ? jEnd : (c + 1) * TILE - 1 - R.k0;
      if (!img) { j = tileEnd + 1; continue; }
      const {knots, off} = offsetKnots(R, () => tile, j, tileEnd, STRIP_TOL / scale);
      for (let q = 0; q < knots.length - 1 || q === 0; q++) {
        const jA = knots[q], jB = knots.length > 1 ? knots[q + 1] : jA;
        // the piece covers from knot to knot (the tile's first and last pieces reach the half column beyond). Its two
        // edges sit on whole device pixels, so neighbouring pieces meet with no gap and no overlap (an overlap painted
        // the faces' translucent shade twice: thin dark lines)
        const snap = x => (Math.round(m.a * x + m.e) - m.e) / m.a;
        const xa = snap(R.x0 + jA * COL - (jA === j ? COL / 2 : 0)), xb = snap(R.x0 + jB * COL + (jB === tileEnd ? COL / 2 : 0));
        const oA = off(jA), slope = jB > jA ? (off(jB) - oA) / ((jB - jA) * COL) : 0, xA = R.x0 + jA * COL;
        const sx = (xa - (R.x0 + (tile.kS - R.k0) * COL) - img.x0) * scale, sw = Math.min((xb - xa) * scale, img.c.width - sx);
        if (sw <= 0) continue;
        g.setTransform(m.a, m.d * slope, 0, m.d, m.e, m.f + m.d * (oA - slope * xA));
        g.drawImage(img.c, sx, 0, sw, img.c.height, xa, img.y0, sw / scale, img.c.height / scale);
      }
      j = tileEnd + 1;
    }
    g.setTransform(m.a, 0, 0, m.d, m.e, m.f);
  }
  const composites = new Map();
  // returns false when there is no offscreen canvas or no transform to work with (then draw() paints the old way)
  function paintTiled(ctx, S, LT, dpr, view) {
    const m = view.matrix, L = S.layout;
    if (!m || typeof ctx.getTransform !== 'function') return false;
    const cw = ctx.canvas && ctx.canvas.width > 0 ? ctx.canvas.width : Math.ceil(L.w * dpr), ch = ctx.canvas && ctx.canvas.height > 0 ? ctx.canvas.height : Math.ceil(L.h * dpr);
    const key = cw + 'x' + ch;
    let comp = composites.get(key);
    if (!comp) {
      const c = makeCanvas(cw, ch);
      if (!c) return false;
      if (composites.size >= 2) composites.delete(composites.keys().next().value);
      comp = {c, g: c.getContext('2d')};
      composites.set(key, comp);
    }
    frameNo++;
    const g = comp.g, {ranges, src} = S;
    g.setTransform(1, 0, 0, 1, 0, 0); g.globalCompositeOperation = 'source-over'; g.globalAlpha = 1;
    g.clearRect(0, 0, comp.c.width, comp.c.height);
    g.setTransform(m.a, 0, 0, m.d, m.e, m.f);
    for (let i = ranges.length - 1; i >= 0; i--) {
      const R = ranges[i];
      if (fillBody(g, R, LT)) layStrips(g, R, 'detail', src, S.layout, LT, dpr, m);
      if (i > 0) { g.globalCompositeOperation = 'source-atop'; layStrips(g, ranges[i - 1], 'mist', src, S.layout, LT, dpr, m); g.globalCompositeOperation = 'source-over'; }
    }
    ctx.save(); ctx.setTransform(1, 0, 0, 1, 0, 0); ctx.drawImage(comp.c, 0, 0); ctx.restore();
    // one tile ahead of the right edge for the nearest range that lacks it (cost spread over frames, pixels unchanged)
    for (const R of ranges) {
      const c = Math.floor((R.k0 + R.jb) / TILE) + 1;
      if (!tileCache.has(tileKey(src, L, LT, dpr, R.layer, c))) { tileOf(src, L, LT, dpr, R.layer, c); break; }
    }
    return true;
  }
  // the body from the frame's own ridge: lit at the ridge, into the haze toward the foot, the basin down to the plain.
  // The gradient's top is the range's full height over its mean foot (it used to be the highest ridge in the window,
  // which jumped whenever a tall peak came in or went out)
  function fillBody(g, R, LT) {
    const {ys, foot} = R, a = R.ja, b = R.jb;
    let tall = 0, fsum = 0, fn = 0;
    for (let k = a; k <= b; k++) { const hgt = foot[k] - ys[k]; if (hgt > tall) tall = hgt; if (hgt >= .5) { fsum += foot[k]; fn++; } }
    if (tall < 3) return false;
    const wash = lerp(.06, .62, Math.pow(R.d, .85));
    const color = rgb(STEM_COLOR[R.id]);
    const c = mix(color, LT.haze, clamp(wash * LT.washK)), lit = mix(c, LT.light, .10 * (1 - wash) * LT.litK);
    const fm = fn ? fsum / fn : BASE0, top = fm - R.layer.amp;
    const kf = clamp((fm - top) / (BASIN - top));
    const gr = g.createLinearGradient(0, top, 0, BASIN);
    gr.addColorStop(0, css(lit)); gr.addColorStop(kf * .55, css(mix(c, LT.haze, .12)));
    gr.addColorStop(kf * .775, css(mix(c, LT.haze, .3)));
    gr.addColorStop(Math.min(1, kf + .001), css(mix(mix(c, LT.haze, .55), basinAt(LT, fm), .5)));
    gr.addColorStop(Math.min(1, kf + .002 + (1 - kf) * .4), css(basinAt(LT, lerp(fm, BASIN, .4))));
    gr.addColorStop(1, css(basinAt(LT, BASIN)));
    g.fillStyle = gr;
    R.body = undefined; fillPath(g, R);
    return true;
  }

  // ---------- drawing ----------
  function draw(ctx, frame) {
    const S = scene(frame);
    if (!S) return null;
    ART = artNow();
    const {layout: L, ranges} = S, {win, s} = L;
    const LT = lightFor(frame.cover);
    const base = typeof ctx.getTransform === 'function' ? ctx.getTransform() : null;
    const dpr = clamp(Math.round((base ? base.a : 1) * 4) / 4, 1, 3);
    const R = rasters(L, LT, dpr);
    const t = S.time;
    ctx.save();
    if (R) ctx.drawImage(R.back, 0, 0, L.w, L.h);
    else { ctx.fillStyle = css(LT.sky[1][1]); ctx.fillRect(0, 0, L.w, L.h); }
    ctx.save();
    roundRect(ctx, win.x, win.y, win.w, win.h, win.r); ctx.clip();
    ctx.translate(win.x - M_LEFT * s, win.y - M_TOP * s); ctx.scale(s, s);
    const mm = typeof ctx.getTransform === 'function' ? ctx.getTransform() : null;
    const view = {matrix: mm && Number.isFinite(mm.a) ? {a: mm.a, d: mm.d, e: mm.e, f: mm.f} : null};
    if (R && R.clouds) {
      const P = R.clouds.P, W = R.clouds.drawW, drift = t * 2.2, off = ((-drift % P) + P) % P - 380;
      for (let x = off - P; x < L.right + 20; x += P) if (x + W > L.left - 20) ctx.drawImage(R.clouds.c, x, CLOUD_Y0, W, CLOUD_Y1 - CLOUD_Y0);
    }
    // a strip that repeats every P sketch px (drawn drawW wide from x0), moving at `speed`
    const loop = (tile, speed) => {
      const P = tile.P, W = tile.drawW, x0 = tile.x0 || 0, off = ((-t * speed) % P + P) % P;
      for (let x = off - P; x < L.right + 10; x += P) if (x + x0 + W > L.left - 10) ctx.drawImage(tile.c, x + x0, tile.y0, W, tile.h);
    };
    if (R && R.plain) for (const band of R.plain) loop(band.tile, band.speed); // batch 7: the plain under the ranges
    if (!(R && paintTiled(ctx, S, LT, dpr, view))) { // no offscreen canvas (tests): every range painted in full each frame
      for (let i = ranges.length - 1; i >= 0; i--) {
        paintRange(ctx, ranges[i], LT, view);
        if (i > 0) mist(ctx, ranges[i], ranges[i - 1], lerp(.5, .62, ranges[i].d) * LT.mistK, LT);
      }
    }
    const strip = (tile, speed) => {
      const off = ((-t * speed) % GROUND_P + GROUND_P) % GROUND_P;
      for (let x = off - GROUND_P; x < L.right + 10; x += GROUND_P) if (x + GROUND_P > L.left - 10) ctx.drawImage(tile.c, x, tile.y0, GROUND_P, tile.h);
    };
    if (R) for (const band of R.ground) strip(band.tile, band.speed);
    // a town passing in the middle ground (batch 6): before the air, so the haze over the plain lies on it as on the hills
    const stationList = stationsOf(S.src, frame.song);
    S.stations = R ? passTowns(ctx, stationList, L, t, LT, dpr) : [];
    const air = ctx.createLinearGradient(0, HORIZON - 150, 0, HORIZON + 40);
    air.addColorStop(0, css(LT.air.c, 0)); air.addColorStop(.8, css(LT.air.c, LT.air.a)); air.addColorStop(1, css(LT.air.c, 0));
    ctx.fillStyle = air; ctx.fillRect(L.left - 10, HORIZON - 150, L.Wm + 20, 190);
    // the roadside option arrives with the frame (XML's settings pass it once batch 4 wires it; default off)
    S.roadside = roadside(ctx, S.src, L, t, LT, dpr, frame.terrainRoadside || (frame.options && frame.options.terrainRoadside) || 'off', stationList);
    if (R && R.flow && R.flow.ballast && R.flow.rail) { loop(R.flow.ballast, speedAtY(828)); loop(R.flow.rail, speedAtY(828)); }
    else if (R && R.bed) {
      const y = 820, g = ctx.createLinearGradient(0, y - 4, 0, M_BOTTOM);
      g.addColorStop(0, 'rgba(110,98,80,0)'); g.addColorStop(.35, 'rgba(110,98,80,.9)'); g.addColorStop(1, 'rgba(80,72,60,1)');
      ctx.fillStyle = g; ctx.fillRect(L.left - 10, y - 4, L.Wm + 20, M_BOTTOM - y + 8);
      strip(R.bed, speedAtY(828));
    }
    if (R) S.stations.push(...passNear(ctx, stationList, L, t, LT, dpr)); // the sign and the crossing: nearer than all else
    ctx.restore();
    if (R) ctx.drawImage(R.overlay, 0, 0, L.w, L.h);
    const tile = grain();
    if (tile && typeof ctx.createPattern === 'function') {
      let p = patterns.get(ctx);
      if (!p) { p = ctx.createPattern(tile, 'repeat'); patterns.set(ctx, p); }
      if (p) { ctx.save(); ctx.setTransform(1, 0, 0, 1, 0, 0); ctx.fillStyle = p; ctx.fillRect(0, 0, ctx.canvas ? ctx.canvas.width : L.w * dpr, ctx.canvas ? ctx.canvas.height : L.h * dpr); ctx.restore(); }
    }
    S.carriage = carriage(ctx, frame, S, dpr);
    ctx.restore();
    S.light = LT.name;
    S.art = MODE();
    return S;
  }

  // ---------- the roadside: one drum hit = one object passing "now" at the moment of the hit (option terrainRoadside) ----------
  // off (default) / all / kick-snare. Lines and objects as in the sketch (mock6, round 3 + 6 fixes): kick = telegraph pole
  // (a kick within 0.38 s of the last tall pole = a short stub with a guy wire), snare = mile post or whistle post,
  // hi-hat = fence post (open = taller, braced), tom = rock pile or sage, crash = windpump (or a flock), ride = birds
  // lifting off the fence. Each line moves at its ground depth's speed; motion blur is baked into per-variant sprites.
  const LINE = {crash: 712, fence: 742, tom: 760, pole: 790, post: 812};
  const PX_PER_M = .316, BLUR = .6 / 60, STUB_GAP = .38;
  const RIDE_RUN = 2, BIRD_MAX = 8; // batch 6: a ride run within 2 s = one bird; at most 8 birds in the window at once
  const mAtY = y => (y - HORIZON) * PX_PER_M;
  const WOOD = rgb('#3a3129'), DARKWOOD = rgb('#2a241f'), IRON = rgb('#2b2e30'), CONCRETE = rgb('#cfc8b6'), CAST = [46, 38, 30];
  const vBucket = v => Math.min(3, Math.floor(clamp(v / 127) * 4)), vOf = b => (b + .5) / 4 * 127;
  // velocity steps per sprite: four for the poles (their height shows it), two for the small objects
  const repVel = (type, v) => type === 'pole' ? vOf(vBucket(v)) : v >= 64 ? 96 : 32;
  function roadLines(src) {
    if (src.road) return src.road;
    const by = rows => src.hits.filter(h => rows.includes(h[1]));
    const collapse = (list, gap) => { const out = []; for (const [t, row, v] of list) { const last = out[out.length - 1]; if (last && t - last.t < gap) { last.v = Math.max(last.v, v); continue; } out.push({t, row, v}); } return out; };
    const pole = collapse(by([0]), .09);
    let lastTall = -9;
    for (const p of pole) { p.tall = p.t - lastTall >= STUB_GAP; if (p.tall) lastTall = p.t; }
    // ride: a run of hits each within RIDE_RUN s of the one before counts once, at its first hit (batch 6)
    const ride = [];
    let lastRide = -99;
    for (const [t, row, v] of by([6])) { if (t - lastRide >= RIDE_RUN) ride.push({t, row, v}); lastRide = t; }
    src.road = {crash: collapse(by([5]), .6), flock: collapse(by([7]), .6), fence: collapse(by([2, 3]), .04), ride,
      tom: collapse(by([4]), .08), pole, post: collapse(by([1]), .06)};
    for (const k of Object.keys(src.road)) src.road[k].times = src.road[k].map(o => o.t);
    // fewer birds (batch 6, the user: 「鸟作为镲片应该数量上少一些」): a crash's flock is 2-3 birds, a ride 1; and at most
    // BIRD_MAX in the air at once. Decided per song, in hit order, from each group's own flight time (until its last bird
    // has risen past the window's top - sketch units, so the same at every window size): a group that would push the
    // count past BIRD_MAX keeps only what is left, so no bird ever appears mid-flight when an earlier one leaves.
    const groups = [];
    for (const o of src.road.flock) { const key = Math.round(o.t * 50); groups.push({o, key, y: LINE.crash, M: mAtY(LINE.crash) * 1.6, want: 2 + Math.floor(hash(key, 60) * 2)}); }
    for (const o of src.road.ride) { const key = Math.round(o.t * 50); groups.push({o, key, y: LINE.fence, M: mAtY(LINE.fence), want: 1}); }
    groups.sort((a, b) => a.o.t - b.o.t || a.y - b.y);
    const alive = [];
    for (const G of groups) {
      G.life = G.o.life = birdLife(G.y, G.M, G.key, G.want);
      const inAir = alive.filter(A => A.o.t + A.life > G.o.t).reduce((s, A) => s + A.o.n, 0);
      G.o.n = Math.max(0, Math.min(G.want, BIRD_MAX - inAir));
      if (G.o.n) alive.push(G);
    }
    return src.road;
  }
  // seconds until the last of a group's birds (as birds() flies them) is above the window's top edge
  function birdLife(y, M, key, n) {
    let life = 0;
    for (let j = 0; j < n; j++) {
      const sz = (.3 + .1 * hash(key + j, 62)) * M, vy = 160 + 120 * hash(key + j, 64), wing = sz * 1.5;
      const rise = y - .4 * M + wing - (M_TOP - 4); // the lowest point of the bird has to clear the top
      life = Math.max(life, (-vy + Math.sqrt(vy * vy + 120 * rise)) / 60);
    }
    return life;
  }
  function shadow(c, LT, x, y, len, w, a) {
    len *= LT.castLen; a *= LT.castA;
    c.fillStyle = css(CAST, a);
    if (len > 2) { c.beginPath(); c.moveTo(x - w * .5, y); c.lineTo(x + len, y + len * .05); c.lineTo(x + len, y + len * .05 + w * .5); c.lineTo(x + w * .5, y + 1.5); c.closePath(); c.fill(); }
    c.fillStyle = css(CAST, Math.min(.6, a * 1.6)); c.beginPath(); const cw = Math.min(w * 1.1 + 1.5, 14); c.ellipse(x + cw * .25, y + .5, cw, Math.max(1.2, cw * .2), 0, 0, Math.PI * 2); c.fill();
  }
  function post(c, LT, x, y, h, w, col, lit) {
    shadow(c, LT, x, y, h * 1.1, w, .3);
    c.fillStyle = css(col); c.fillRect(x - w / 2, y - h, w, h + 1);
    c.fillStyle = css(mix(col, LT.light, .35), .8); c.fillRect(x - w / 2, y - h, Math.max(1, w * .3), h);
    if (lit) { c.fillStyle = css(mix(col, LT.shade, .4), .7); c.fillRect(x + w * .15, y - h, w * .35, h); }
  }
  const PAINT = {
    pole(c, LT, M, vel) {
      const H = 9.5 * M * (.95 + .1 * vel / 127), w = .3 * M, col = mix(WOOD, DARKWOOD, .3 + .5 * vel / 127);
      shadow(c, LT, 0, 0, H, w * 1.2, .26);
      c.fillStyle = css(col);
      c.beginPath(); c.moveTo(-w / 2, 1); c.lineTo(-w * .36, -H); c.lineTo(w * .36, -H); c.lineTo(w / 2, 1); c.closePath(); c.fill();
      c.fillStyle = css(mix(col, LT.light, .45), .75); c.fillRect(-w * .44, -H, Math.max(1, w * .22), H);
      const arms = [H - .55 * M, H - 1.35 * M];
      for (let a = 0; a < 2; a++) {
        const ay = -arms[a], half = (a ? 1.0 : 1.25) * M;
        c.fillStyle = css(col); c.fillRect(-half, ay - .07 * M, half * 2, .16 * M);
        c.fillStyle = css(mix(rgb('#9fb4b8'), LT.light, .2), .85);
        for (const p of a ? [-.85, .85] : [-1.1, -.45, .45, 1.1]) c.fillRect(p * M - .05 * M, ay - .26 * M, .1 * M, .2 * M);
      }
      c.strokeStyle = css(col); c.lineWidth = Math.max(1, .05 * M);
      c.beginPath(); c.moveTo(-.8 * M, -arms[0]); c.lineTo(0, -arms[0] + .7 * M); c.lineTo(.8 * M, -arms[0]); c.stroke();
    },
    stub(c, LT, M, vel) {
      const h = (2.0 + .5 * vel / 127) * M, w = .2 * M, col = mix(WOOD, DARKWOOD, .5);
      post(c, LT, 0, 0, h, w, col, false);
      c.fillStyle = css(DARKWOOD); c.fillRect(-w * .7, -h - .1 * M, w * 1.4, .18 * M);
    },
    fence(c, LT, M, vel, variant) { // variant 0..5 closed hi-hat, 6..8 open
      const open = variant >= 6, hk = open ? (variant - 6) / 2 : variant / 5;
      const ph = (open ? 1.85 : 1.3) * M * (.95 + .1 * vel / 127) * (open ? 1 : .94 + .1 * hk);
      post(c, LT, 0, 0, ph, (open ? .2 : .13) * M, mix(WOOD, DARKWOOD, hk), false);
      if (open) { c.strokeStyle = css(WOOD); c.lineWidth = Math.max(1.5, .08 * M); c.beginPath(); c.moveTo(0, -ph * .8); c.lineTo(1.3 * M, 0); c.stroke(); }
    },
    tom(c, LT, M, vel, variant) { // variant 0..7: the first four sage, the rest rock piles
      const s = (.8 + .4 * vel / 127) * 1.8, key = 1000 + variant * 37;
      if (variant < 4) {
        shadow(c, LT, 0, 0, 1.4 * M * s, 1.2 * M * s, .28);
        for (let j = 0; j < 7; j++) {
          const ox = (hash(key + j, 72) - .5) * 1.1 * M * s, r = (.25 + .2 * hash(key + j, 73)) * M * s, oy = -r * .8 - hash(key + j, 74) * .3 * M * s;
          c.fillStyle = css(mix(rgb('#4c5139'), rgb('#6e7352'), hash(key + j, 75))); c.beginPath(); c.ellipse(ox, oy, r * 1.15, r, 0, 0, Math.PI * 2); c.fill();
        }
        c.fillStyle = css(mix(rgb('#8c906a'), LT.light, .2), .5); c.beginPath(); c.ellipse(-.25 * M * s, -.6 * M * s, .3 * M * s, .15 * M * s, 0, 0, Math.PI * 2); c.fill();
      } else {
        shadow(c, LT, 0, 0, 1.2 * M * s, 1.3 * M * s, .3);
        const n = 3 + Math.floor(hash(key, 76) * 3);
        for (let j = 0; j < n; j++) {
          const r = (.22 + .22 * hash(key + j, 77)) * M * s, ox = (hash(key + j, 78) - .5) * 1.2 * M * s, oy = j > 2 ? -r * 1.3 : 0;
          const col = mix(rgb('#6b5848'), rgb('#8a7560'), hash(key + j, 79));
          c.fillStyle = css(col); c.beginPath();
          for (let q = 0; q < 7; q++) { const a = Math.PI + q / 6 * Math.PI, rr = r * (.8 + .3 * hash(key * 7 + q + j, 80)); c.lineTo(ox + Math.cos(a) * rr * 1.2, oy + Math.sin(a) * rr); }
          c.closePath(); c.fill();
          c.fillStyle = css(mix(col, LT.light, .45), .7); c.beginPath(); c.ellipse(ox - r * .4, oy - r * .55, r * .4, r * .2, -.3, 0, Math.PI * 2); c.fill();
        }
      }
    },
    post(c, LT, M, vel, variant) { // variant 0 concrete mile post, 1 whistle post
      const s = (.92 + .16 * vel / 127) * 1.45;
      if (variant === 0) {
        const h = 1.25 * M * s, w = .2 * M * 1.15;
        post(c, LT, 0, 0, h, w, mix(CONCRETE, LT.shade, .1), true);
        c.fillStyle = css(rgb('#2b2a27')); c.fillRect(-w * .62, -h + .12 * M, w * 1.24, .36 * M);
        c.fillStyle = css(rgb('#e9e3d2'), .8); c.fillRect(-w * .3, -h + .2 * M, w * .25, .2 * M);
      } else {
        const h = 1.6 * M * s;
        post(c, LT, 0, 0, h - .1 * M, .15 * M, IRON, false);
        c.fillStyle = css(IRON); c.fillRect(-.26 * M, -h - .1 * M, .52 * M, .5 * M);
        c.fillStyle = css(mix(CONCRETE, LT.light, .2)); c.fillRect(-.2 * M, -h - .05 * M, .3 * M, .4 * M);
      }
    },
    crash(c, LT, M, vel, variant) { // windpump with its stock tank; variant = the wheel's turn
      const s = .9 + .2 * vel / 127, col = mix(IRON, LT.haze, .16), H = 9 * M * s;
      shadow(c, LT, 0, 0, H * .9, 2.2 * M, .14);
      c.fillStyle = css(mix(col, LT.haze, .1)); c.beginPath(); c.ellipse(2.6 * M, -.35 * M, 1.5 * M, .5 * M, 0, 0, Math.PI * 2); c.fill();
      c.fillRect(1.1 * M, -.8 * M, 3 * M, .5 * M);
      c.strokeStyle = css(col); c.lineCap = 'round';
      const bw = 1.3 * M, tw = .25 * M, top = -H;
      c.lineWidth = Math.max(1.2, .14 * M);
      c.beginPath(); c.moveTo(-bw, 0); c.lineTo(-tw, top); c.moveTo(bw, 0); c.lineTo(tw, top); c.stroke();
      c.lineWidth = Math.max(.7, .06 * M); c.beginPath();
      for (let m = 0; m < 4; m++) {
        const y0 = lerp(0, top, m / 4), y1 = lerp(0, top, (m + 1) / 4), w0 = lerp(bw, tw, m / 4), w1 = lerp(bw, tw, (m + 1) / 4);
        c.moveTo(-w0, y0); c.lineTo(w1, y1); c.moveTo(w0, y0); c.lineTo(-w1, y1); c.moveTo(-w1, y1); c.lineTo(w1, y1);
      }
      c.stroke();
      const R = 1.55 * M * s, cx = -.2 * M, cy = top - .3 * M, rot = variant / 3 * Math.PI;
      c.lineWidth = Math.max(.8, .1 * M);
      c.beginPath(); c.ellipse(cx, cy, R * .55, R, 0, 0, Math.PI * 2); c.stroke();
      c.beginPath();
      for (let b = 0; b < 18; b++) { const a = rot + b / 18 * Math.PI * 2; c.moveTo(cx + Math.cos(a) * R * .12, cy + Math.sin(a) * R * .2); c.lineTo(cx + Math.cos(a) * R * .55, cy + Math.sin(a) * R); }
      c.stroke();
      c.fillStyle = css(col);
      c.beginPath(); c.moveTo(cx + .2 * M, cy - .1 * M); c.lineTo(cx + 2.4 * M, cy - .25 * M); c.lineTo(cx + 2.6 * M, cy - 1.0 * M); c.lineTo(cx + 3.4 * M, cy - .9 * M); c.lineTo(cx + 3.3 * M, cy + .5 * M); c.lineTo(cx + 2.5 * M, cy + .35 * M); c.lineTo(cx + .2 * M, cy + .15 * M); c.closePath(); c.fill();
      c.beginPath(); c.arc(cx, cy, .25 * M, 0, Math.PI * 2); c.fill();
    }
  };
  // sprite bounds in metres around the base point: [left, top, right, bottom]; the shadow runs right
  const BOUNDS = {pole: [-2, -11, 20, 1], stub: [-1, -3.2, 6, 1], fence: [-1, -2.4, 5, 1], tom: [-2.4, -2.4, 6, 1], post: [-1, -3, 6, 1], crash: [-2.5, -12.5, 18, 1.2]};
  // ---- batch 7: the roadside from GPT's pictures. Same lines, same heights as the code's things, the shadow on the ground
  // and the motion blur still the program's; which picture of a kind = a hash of "the how-many-th of its line in this
  // song" (artVariant). Painters work in sketch px around the base point; box() is the sprite's extent (shadow included).
  // The telegraph wires hang from each pole picture's insulator tops (measured on the originals, px, left to right).
  const POLE_TIPS = [[[100, 98], [178, 98], [256, 98]], [[50, 128], [105, 128], [232, 128], [285, 128]], [[128, 128], [291, 153]], [[94, 84], [147, 84], [266, 84], [319, 84]]];
  // the windpump towers' hubs and wheel sizes (NOTES.md, tower px); the 18-blade wheel repeats every 20 degrees, spun
  // from WHEEL_FRAMES sprites over one blade at WHEEL_DPS degrees a song second
  const PUMP = [{hub: [191, 192], wheel: 392}, {hub: [203, 94], wheel: 413}, {hub: [205, 290], wheel: 348}], PUMP_TALL = 938;
  const WHEEL_FRAMES = 6, WHEEL_DPS = 60, BIRD_FLAPS = 3.2;
  const unionBox = (a, b) => [Math.min(a[0], b[0]), Math.min(a[1], b[1]), Math.max(a[2], b[2]), Math.max(a[3], b[3])];
  const shadowBox = (len, w) => [-w, -1, len * 1.85 + w, Math.max(2, w * .6)];
  const poleH = (M, vel) => 9.5 * M * (.95 + .1 * vel / 127);
  const stubH = (M, vel) => (3.2 + .5 * vel / 127) * M; // a half pole with a crossarm (the code's 2-2.5 m post would make it a toy)
  const fenceH = (M, vel, open) => (open ? 1.85 : 1.3) * M * (.95 + .1 * vel / 127);
  const tomS = vel => (.8 + .4 * vel / 127) * 1.8;
  const postS = vel => (.92 + .16 * vel / 127) * 1.45;
  const pumpF = (M, vel) => 9 * M * (.9 + .2 * vel / 127) / PUMP_TALL;
  const artKey = {
    pole: v => 'roadside/pole-' + ABC[v], stub: v => 'roadside/pole-stub-' + ABC[v],
    fence: v => v < 4 ? 'roadside/fence-post-' + ABC[v] : 'roadside/fence-post-braced-' + ABC[v - 4],
    tom: v => v < 4 ? 'roadside/sagebrush-' + ABC[v] : 'roadside/rock-pile-' + ABC[v - 4],
    post: v => v < 3 ? 'roadside/mile-post-' + ABC[v] : 'roadside/whistle-post-' + ABC[v - 3],
    crash: v => 'roadside/windpump-' + ABC[v]};
  // [picture, f (sketch px per original px), shadow length, shadow width, shadow alpha]
  function artPlan(type, M, vel, variant) {
    const a = pic(artKey[type](variant));
    if (!a) return null;
    if (type === 'pole') { const H = poleH(M, vel); return [a, H / tallOf(a), H, .36 * M, .26]; }
    if (type === 'stub') { const h = stubH(M, vel); return [a, h / tallOf(a), h * 1.1, .2 * M, .3]; }
    if (type === 'fence') { const h = fenceH(M, vel, variant >= 4); return [a, h / tallOf(a), h * 1.1, (variant >= 4 ? .2 : .13) * M, .3]; }
    if (type === 'tom') { const s = tomS(vel), sage = variant < 4; return [a, 2.0 * M * s / wideOf(a), (sage ? 1.4 : 1.2) * M * s, (sage ? 1.2 : 1.3) * M * s, sage ? .28 : .3]; }
    if (type === 'post') { const s = postS(vel), h = (variant < 3 ? 1.25 : 1.6) * M * s; return [a, h / tallOf(a), h * 1.1, .23 * M, .3]; }
    if (type === 'crash') { const f = pumpF(M, vel); return [a, f, 9 * M * .9, 2.2 * M, .14]; }
    return null;
  }
  const ART_PAINT = {
    box(type, M, vel, variant) {
      if (type === 'wheel') { const v = Math.floor(variant / WHEEL_FRAMES), r = PUMP[v].wheel * pumpF(M, vel) / 2; return [-r, -r, r, r]; }
      const P = artPlan(type, M, vel, variant);
      return P ? unionBox(boxOf(P[0], P[1]), shadowBox(P[2], P[3])) : null;
    },
    paint(g, LT, type, M, vel, variant) {
      if (type === 'wheel') { // one frame of the wheel's turn, centred on the hub
        const v = Math.floor(variant / WHEEL_FRAMES), fr = variant % WHEEL_FRAMES, a = pic('roadside/windpump-wheel-a'), d = PUMP[v].wheel * pumpF(M, vel);
        if (!a) return;
        g.rotate(fr / WHEEL_FRAMES * Math.PI / 9);
        g.drawImage(a.img, -d / 2, -d / 2, d, d);
        return;
      }
      const P = artPlan(type, M, vel, variant);
      if (!P) return;
      shadow(g, LT, 0, 0, P[2], P[3], P[4]);
      put(g, P[0], 0, 0, P[1]);
    }
  };
  const artVariant = (type, i, open) => type === 'pole' ? Math.floor(hash(i, 201) * 4) : type === 'stub' ? Math.floor(hash(i, 202) * 2)
    : type === 'fence' ? (open ? 4 + Math.floor(hash(i, 204) * 2) : Math.floor(hash(i, 203) * 4))
    : type === 'crash' ? Math.floor(hash(i, 208) * 3) : 0;
  // the four wire points of a pole picture (the insulators, an end one taken twice where a pole has fewer than four)
  const tipMemo = new Map(); // (line scale, velocity step, picture) -> the four points; nothing allocated a frame
  function poleTips(M, vel, variant) {
    const key = M + '|' + vel + '|' + variant;
    let out = tipMemo.get(key);
    if (out) return out;
    const a = pic(artKey.pole(variant)), tips = POLE_TIPS[variant], f = poleH(M, vel) / tallOf(a);
    out = [0, 1, 2, 3].map(j => { const p = tips[Math.round(j * (tips.length - 1) / 3)]; return [(p[0] - a.anchor[0]) * f, (p[1] + 6 - a.anchor[1]) * f]; });
    if (tipMemo.size > 64) tipMemo.clear();
    tipMemo.set(key, out);
    return out;
  }
  function stubTop(M, vel, variant) { const a = pic(artKey.stub(variant)); return stubH(M, vel) * (a.anchor[1] - a.bbox[1] - 4) / tallOf(a); }
  function wheelPlace(M, vel, v, t, i) {
    const a = pic(artKey.crash(v)), f = pumpF(M, vel), hub = PUMP[v].hub;
    const turn = ((t * WHEEL_DPS + 360 * hash(i, 209)) / 20) % 1, fr = Math.floor((turn < 0 ? turn + 1 : turn) * WHEEL_FRAMES) % WHEEL_FRAMES;
    return {dx: (hub[0] - a.anchor[0]) * f, dy: (hub[1] - a.anchor[1]) * f, variant: v * WHEEL_FRAMES + fr};
  }
  const spriteCache = new Map();
  function sprite(L, LT, dpr, type, y, vel, variant, blurK = 1) {
    const rv = repVel(type === 'wheel' ? 'crash' : type, vel), key = [lightIds.get(LT), L.s, dpr, type, y, rv, variant, blurK, MODE()].join('|');
    if (spriteCache.has(key)) return spriteCache.get(key);
    const M = mAtY(y), blur = speedAtY(y) * BLUR * blurK;
    const B = ART ? ART_PAINT.box(type, M, rv, variant) : BOUNDS[type].map(v => v * M);
    const e = ART ? 1 : 0; // a pixel of room round a picture's box (the code's boxes keep their old size)
    const x0 = B[0] - blur - e, y0 = B[1] - e, w = B[2] - B[0] + 2 * blur + 2 * e, h = B[3] - B[1] + 2 * e, k = L.s * dpr;
    const a = makeCanvas(w * k, h * k);
    let out = null;
    if (a) {
      const g = a.getContext('2d');
      g.setTransform(k, 0, 0, k, -x0 * k, -y0 * k);
      if (ART) ART_PAINT.paint(g, LT, type, M, rv, variant); else PAINT[type](g, LT, M, rv, variant);
      let c = a;
      if (blur * k >= 1.5) { // horizontal motion blur: the average of shifted copies
        const b = makeCanvas(a.width, a.height), bg = b.getContext('2d'), K = Math.max(5, Math.round(blur * k));
        bg.globalCompositeOperation = 'lighter'; bg.globalAlpha = 1 / K;
        for (let q = 0; q < K; q++) bg.drawImage(a, (q / (K - 1) - .5) * blur * k, 0);
        c = b;
      }
      out = {c, x0, y0, w, h};
    }
    if (spriteCache.size > 240) spriteCache.delete(spriteCache.keys().next().value);
    spriteCache.set(key, out);
    return out;
  }
  const stamp = (ctx, sp, x, y, scale = 1) => { if (sp) ctx.drawImage(sp.c, x + sp.x0 * scale, y + sp.y0 * scale, sp.w * scale, sp.h * scale); };
  function birds(ctx, x, y, M, dt, key, n) {
    if (dt < 0) return; // not drawn before the hit (birds sitting on the ground read as debris)
    if (ART) { // batch 7: GPT's six wing positions, a -> f in turn, BIRD_FLAPS beats a song second; same flight as below
      for (let j = 0; j < n; j++) {
        const sz = (.3 + .1 * hash(key + j, 62)) * M, vx = (hash(key + j, 63) - .45) * 160, vy = 160 + 120 * hash(key + j, 64);
        const bx = x + (hash(key + j, 61) - .5) * 3.2 * M + vx * dt, by = y - .4 * M - vy * dt - 30 * dt * dt;
        const beat = dt * BIRD_FLAPS + hash(key + j, 66), a = pic('roadside/bird-' + ABC[Math.floor((beat - Math.floor(beat)) * 6) % 6]);
        if (a) put(ctx, a, bx, by, 3 * sz / wideOf(a), vx < 0); // the picture faces right; a bird flying left is mirrored
      }
      return;
    }
    ctx.strokeStyle = css(DARKWOOD, .9); ctx.lineCap = 'round'; ctx.beginPath();
    for (let j = 0; j < n; j++) {
      const sz = (.3 + .1 * hash(key + j, 62)) * M, vx = (hash(key + j, 63) - .45) * 160, vy = 160 + 120 * hash(key + j, 64);
      const bx = x + (hash(key + j, 61) - .5) * 3.2 * M + vx * dt, by = y - .4 * M - vy * dt - 30 * dt * dt;
      const flap = (hash(key + j, 65) - .5) * 1.4, wing = sz * 1.5;
      ctx.moveTo(bx - wing, by - wing * (.35 + flap * .5)); ctx.quadraticCurveTo(bx - wing * .4, by - wing * .1, bx, by); ctx.quadraticCurveTo(bx + wing * .4, by - wing * .1, bx + wing, by - wing * (.35 - flap * .5));
    }
    ctx.lineWidth = Math.max(1.1, .3 * M * .2); ctx.stroke();
  }
  // every sprite this song will need, made on its first roadside frame (not when an object first shows mid-song)
  function warmRoad(src, road, L, LT, dpr, mode) {
    const key = [lightIds.get(LT), L.s, dpr, mode, MODE()].join('|');
    if (src.roadWarm === key) return;
    src.roadWarm = key;
    const has = list => ({lo: list.some(o => o.v < 64), hi: list.some(o => o.v >= 64)});
    const vels = list => { const h = has(list); return [h.lo ? 32 : null, h.hi ? 96 : null].filter(v => v !== null); };
    if (ART) { // every picture variant the lines can ask for
      for (const b of [0, 1, 2, 3]) if (road.pole.some(o => o.tall && vBucket(o.v) === b)) for (let k = 0; k < 4; k++) sprite(L, LT, dpr, 'pole', LINE.pole, vOf(b), k);
      for (const v of vels(road.pole.filter(o => !o.tall))) for (let k = 0; k < 2; k++) sprite(L, LT, dpr, 'stub', LINE.pole, v, k);
      for (const v of vels(road.post)) for (let k = 0; k < 5; k++) sprite(L, LT, dpr, 'post', LINE.post, v, k, .45);
      if (mode !== 'all') return;
      for (const v of vels(road.fence)) for (let k = 0; k < 6; k++) sprite(L, LT, dpr, 'fence', LINE.fence, v, k);
      for (const v of vels(road.tom)) for (let k = 0; k < 8; k++) sprite(L, LT, dpr, 'tom', LINE.tom, v, k);
      for (const v of vels(road.crash)) for (let k = 0; k < 3; k++) { sprite(L, LT, dpr, 'crash', LINE.crash, v, k); for (let f = 0; f < WHEEL_FRAMES; f++) sprite(L, LT, dpr, 'wheel', LINE.crash, v, k * WHEEL_FRAMES + f); }
      return;
    }
    for (const b of [0, 1, 2, 3]) if (road.pole.some(o => o.tall && vBucket(o.v) === b)) sprite(L, LT, dpr, 'pole', LINE.pole, vOf(b), 0);
    for (const v of vels(road.pole.filter(o => !o.tall))) sprite(L, LT, dpr, 'stub', LINE.pole, v, 0);
    for (const v of vels(road.post)) for (const k of [0, 1]) sprite(L, LT, dpr, 'post', LINE.post, v, k, .45);
    if (mode !== 'all') return;
    for (const v of vels(road.fence)) for (let k = 0; k < 9; k++) sprite(L, LT, dpr, 'fence', LINE.fence, v, k);
    for (const v of vels(road.tom)) for (let k = 0; k < 8; k++) sprite(L, LT, dpr, 'tom', LINE.tom, v, k);
    for (const v of vels(road.crash)) for (let k = 0; k < 3; k++) sprite(L, LT, dpr, 'crash', LINE.crash, v, k);
  }
  function roadside(ctx, src, L, t, LT, dpr, mode, stations) {
    const yields = (line, T) => yieldsTo(stations, line, T);
    if (mode !== 'all' && mode !== 'kick-snare') return null;
    const road = roadLines(src), counts = {}, poles = [];
    warmRoad(src, road, L, LT, dpr, mode);
    // the plain stays bare: nothing that would be in the window before the plain ends or after it starts again
    const visible = (list, y, padL, padR) => {
      const sp = speedAtY(y), lo = t + (L.left - padL - L.nowM) / sp, hi = t + (L.right + padR - L.nowM) / sp;
      const from = Math.max(src.plainStart + (L.right - L.nowM) / sp, lo), to = Math.min(src.plainEnd - (L.nowM - L.left) / sp, hi);
      const a = firstAt(list.times, from), b = firstAt(list.times, to);
      return {a, b, sp};
    };
    const X = (T, sp) => L.nowM + (T - t) * sp;
    const count = (k, n) => { counts[k] = (counts[k] || 0) + n; };
    const all = mode === 'all';
    if (all) { // windpumps and flocks on the far line
      const y = LINE.crash, M = mAtY(y);
      let v = visible(road.crash, y, 20 * M, 3 * M);
      for (let i = v.a; i < v.b; i++) { const o = road.crash[i]; if (yields('crash', o.t)) { count('yielded', 1); continue; } const x = X(o.t, v.sp);
        if (!ART) { stamp(ctx, sprite(L, LT, dpr, 'crash', y, o.v, Math.floor(hash(Math.round(o.t * 50), 3) * 3)), x, y); continue; }
        const pv = artVariant('crash', i), wp = wheelPlace(M, repVel('crash', o.v), pv, t, i); // the tower, then its wheel turning on song time
        stamp(ctx, sprite(L, LT, dpr, 'crash', y, o.v, pv), x, y); stamp(ctx, sprite(L, LT, dpr, 'wheel', y, o.v, wp.variant), x + wp.dx, y + wp.dy); }
      count('crash', v.b - v.a);
      v = visible(road.flock, y, 300, 300);
      for (let i = v.a; i < v.b; i++) { const o = road.flock[i], key = Math.round(o.t * 50); if (yields('crash', o.t)) { count('yielded', 1); continue; } if (o.n) birds(ctx, X(o.t, v.sp), y, M * 1.6, t - o.t, key, o.n); }
      count('flock', v.b - v.a);
    }
    if (all) { // the fence: wires first, then the posts; birds lifting off it on a ride
      const y = LINE.fence, M = mAtY(y), list = road.fence, v = visible(list, y, 6 * M, 300);
      ctx.strokeStyle = 'rgba(52,46,40,.55)'; ctx.lineWidth = 1; ctx.beginPath();
      for (let i = Math.max(1, v.a); i <= Math.min(list.length - 1, v.b); i++) {
        const p = list[i - 1], q = list[i];
        if (q.t - p.t > 1.6 || p.t < src.plainStart || q.t > src.plainEnd) continue;
        if (i - 1 < v.a - 1 || i > v.b) continue;
        const xa = X(p.t, v.sp), xb = X(q.t, v.sp), sag = Math.min(3, (xb - xa) * .006);
        for (const hh of [.4, .68, .95]) { const ya = y - hh * M * 1.3; ctx.moveTo(xa, ya); ctx.quadraticCurveTo((xa + xb) / 2, ya + sag * 2, xb, ya); }
      }
      ctx.stroke();
      for (let i = v.a; i < v.b; i++) {
        const o = list[i], key = Math.round(o.t * 50), open = o.row === 3;
        stamp(ctx, sprite(L, LT, dpr, 'fence', y, o.v, ART ? artVariant('fence', i, open) : open ? 6 + Math.floor(hash(key, 52) * 3) : Math.floor(hash(key, 51) * 6)), X(o.t, v.sp), y);
      }
      count('fence', v.b - v.a);
      const r = visible(road.ride, y, 300, 300);
      for (let i = r.a; i < r.b; i++) { const o = road.ride[i], key = Math.round(o.t * 50); if (o.n) birds(ctx, X(o.t, r.sp), y, M, t - o.t, key, o.n); }
      count('ride', r.b - r.a);
    }
    if (all) { // rock piles and sage, each at its own depth
      const y0 = LINE.tom, list = road.tom, v = visible(list, y0, 4 * mAtY(y0), 300);
      for (let i = v.a; i < v.b; i++) {
        const o = list[i], key = Math.round(o.t * 50), y = y0 + (hash(key, 81) - .5) * 14;
        if (yields('tom', o.t)) { count('yielded', 1); continue; } // inside a town's stretch (batch 7)
        const tv = Math.floor(hash(key, 71) * 8); // sage (0-3) or a rock pile (4-7); with pictures the picture by its place in the line
        stamp(ctx, sprite(L, LT, dpr, 'tom', y0, o.v, ART ? (tv < 4 ? 0 : 4) + Math.floor(hash(i, 205) * 4) : tv), L.nowM + (o.t - t) * speedAtY(y), y, mAtY(y) / mAtY(y0));
      }
      count('tom', v.b - v.a);
    }
    { // telegraph poles (kick): a kick right after a tall pole is a stub with a guy wire up to that pole
      const y = LINE.pole, M = mAtY(y), list = road.pole, v = visible(list, y, 20 * M, 400);
      const tops = (o, i) => {
        const x = X(o.t, v.sp);
        if (ART) return poleTips(M, repVel('pole', o.v), artVariant('pole', i)).map(p => [x + p[0], y + p[1]]);
        const H = 9.5 * M * (.95 + .1 * repVel('pole', o.v) / 127), ay = y - (H - .55 * M) - .24 * M; return [-1.1, -.45, .45, 1.1].map(dx => [x + dx * M, ay]);
      };
      ctx.strokeStyle = 'rgba(34,32,30,.6)'; ctx.lineWidth = 1.1; ctx.beginPath();
      let prev = null, prevI = -1;
      for (let i = Math.max(0, v.a - 1); i <= Math.min(list.length - 1, v.b); i++) {
        const o = list[i]; if (!o.tall) continue;
        if (prev && o.t - prev.t <= 3 && prev.t >= src.plainStart && o.t <= src.plainEnd && (i >= v.a || prev === null)) {
          const a = tops(prev, prevI), b = tops(o, i), sag = Math.min(1.1 * M, Math.abs(b[0][0] - a[0][0]) * .045);
          for (let j = 0; j < 4; j++) { ctx.moveTo(a[j][0], a[j][1]); ctx.quadraticCurveTo((a[j][0] + b[j][0]) / 2, (a[j][1] + b[j][1]) / 2 + sag * 2, b[j][0], b[j][1]); }
        }
        prev = o; prevI = i;
      }
      ctx.stroke();
      let tall = null;
      for (let i = v.a - 1; i >= 0; i--) if (list[i].tall) { tall = list[i]; break; }
      ctx.strokeStyle = 'rgba(34,32,30,.55)'; ctx.lineWidth = 1; ctx.beginPath();
      for (let i = v.a; i < v.b; i++) {
        const o = list[i], x = X(o.t, v.sp);
        poles.push({t: o.t, x, tall: o.tall});
        if (o.tall) { stamp(ctx, sprite(L, LT, dpr, 'pole', y, o.v, ART ? artVariant('pole', i) : 0), x, y); tall = o; count('kick', 1); continue; }
        const sv = ART ? artVariant('stub', i) : 0;
        stamp(ctx, sprite(L, LT, dpr, 'stub', y, o.v, sv), x, y); count('kickstub', 1);
        const first = i === 0 || list[i - 1].tall;
        if (tall && first) { const h = ART ? stubTop(M, repVel('stub', o.v), sv) : (2.0 + .5 * repVel('stub', o.v) / 127) * M; ctx.moveTo(x, y - h); ctx.lineTo(X(tall.t, v.sp), y - 5.5 * M); }
      }
      ctx.stroke();
    }
    { // mile posts and whistle posts (snare), half the blur so they read
      const y = LINE.post, M = mAtY(y), list = road.post, v = visible(list, y, 2 * M, 300);
      for (let i = v.a; i < v.b; i++) { const o = list[i]; if (yields('post', o.t)) { count('yielded', 1); continue; } const mile = hash(Math.round(o.t * 50), 91) < .68; // a mile post or a whistle post; with pictures the picture by its place in the line
        stamp(ctx, sprite(L, LT, dpr, 'post', y, o.v, ART ? (mile ? Math.floor(hash(i, 206) * 3) : 3 + Math.floor(hash(i, 207) * 2)) : mile ? 0 : 1, .45), X(o.t, v.sp), y); }
      count('snare', v.b - v.a);
    }
    return Object.assign(counts, {poles});
  }

  // ---------- passing stations (batch 6): the route board's stations, out of the window ----------
  // The LED route board calls every section a station and moves its lamp at the moment a section starts. Out of the
  // window something now passes the "now" line at exactly that moment (the train does not stop):
  //   a town for a big section (into a chorus, an interlude / instrumental / solo: by the section's kind, its name when it
  //   has no kind - the same words the sill's lyric line uses for sections nobody sings), a station sign for every other
  //   change. None on the plains at either end, none at the first section's start or the last one's end, none in a song
  //   without sections. Two changes less than 8 s apart: the later is a sign; less than 3 s: the later has none (counted
  //   from the last station drawn). Stations belong to the line, not to the roadside: they show with the roadside off too.
  // Ground model as the roadside's: a ground row y has M = .316 (y - 664) sketch px a metre and moves 5 (y - 664) sketch px
  // a second, so the train runs at V = 5 / .316 m/s and a thing that passes "now" at T0 sits at x = nowM + (T0 - t) x speed.
  // Each kind is a sprite painted once per light, size and dpr (motion blur baked in) and only moved each frame.
  // Drawn after the round-8 sketch (mock8: A for the sign, C for the town), with the brief's changes for the town: about
  // 5-6 s in the window, no road reaching into the near ground, no taller than half the nearest range standing behind it
  // and no brighter than the hills (folded into the haze), four kinds chosen in turn by which big section of the song it is.
  const STATION = {signY: 980, townY: 736, xingY: 852, signBlur: 1.5, sign: 8, none: 3, townLead: 3, xingAfter: 1};
  const V_MS = 5 / PX_PER_M; // the train, metres a second
  const KNOWN_KIND = /^(intro|verse|pre-?chorus|chorus|bridge|inst|interlude|instrumental|solo|break|outro)$/i;
  const MAJOR_KIND = /^(chorus|inst|interlude|instrumental|solo)$/i;
  const MAJOR_NAME = /^(副歌|chorus|间奏|器乐段?|独奏|interlude|instrumental|inst|solo)(\s|\d|$)/i;
  function isMajor(row) {
    const kind = String(row[4] == null ? '' : row[4]).trim();
    if (KNOWN_KIND.test(kind)) return MAJOR_KIND.test(kind);
    return MAJOR_NAME.test(String(row[2] == null ? '' : row[2]).trim());
  }
  // Batch 7 (the brief: batch 6 made them too small and pale - grey dots in the real window - and kind 3 hid behind the
  // roadside): the water tower / the silo is 0.8 x the height of the nearest range standing behind it at the change,
  // at most 150 sketch px, at least 60 (4 px steps); the town's layout widens with it (k = tall / 110, .75 .. 1.36); the
  // haze takes only 30 %; on the town's stretch of line the rock piles, sage and mile posts make way too (not the poles).
  const TOWN_H = 110, TOWN_MIN = 60, TOWN_MAX = 150, TOWN_OF_BEHIND = .8; // sketch px over its ground row
  // the four towns: [min x, max x] in sketch px around the tallest thing (at x = 0), at k = 1
  const TOWN_SPAN = [[-150, 130], [-50, 245], [-130, 150], [-240, 280]];
  const townK = tall => clamp(tall / TOWN_H, .75, 1.36);
  function stationsOf(src, song) {
    if (src.stations) return src.stations;
    const rows = (Array.isArray(song && song.sections) ? song.sections : []).filter(r => Array.isArray(r) && Number.isFinite(r[0])).slice().sort((a, b) => a[0] - b[0]);
    const list = [], table = [];
    let last = null, majors = 0, signs = 0;
    const L0 = layout(1440, 900); // the scale of a town is decided once per song, on the sketch's own frame
    for (let i = 1; i < rows.length; i++) {
      const T = rows[i][0], major = isMajor(rows[i]), ord = major ? majors++ : -1;
      const row = {t: T, from: String(rows[i - 1][2] == null ? '' : rows[i - 1][2]), to: String(rows[i][2] == null ? '' : rows[i][2]), major, kind: null, why: ''};
      table.push(row);
      if (!(T > src.plainStart && T < src.plainEnd)) { row.why = 'plain'; continue; }
      const gap = last ? T - last.t : Infinity;
      if (gap < STATION.none) { row.why = 'close'; continue; }
      let kind = major ? 'town' : 'sign';
      if (kind === 'town' && gap < STATION.sign) { kind = 'sign'; row.why = 'close'; }
      if (kind === 'town' && (T - src.plainStart < STATION.townLead || src.plainEnd - T < STATION.townLead)) { kind = 'sign'; row.why = 'plain'; }
      const st = {t: T, kind, i};
      if (kind === 'sign') { st.sv = Math.floor(hash(signs, 301) * 3); st.lv = Math.floor(hash(signs, 302) * 2); signs++; } // which pictures (batch 7)
      if (kind === 'town') {
        st.variant = ord % 4;
        // no taller than half the nearest range standing behind it at the change (its own height at "now")
        let behind = 0;
        try {
          for (const R of geometry(src, L0, T, 200)) { const j = Math.round((L0.nowM - R.x0) / COL), hgt = R.foot[j] - R.ys[j]; if (hgt >= 20) { behind = hgt; break; } }
        } catch { behind = 0; }
        st.behind = behind;
        // the silo and the water tower are scaled to that (in steps of 4 px, one sprite per step); houses and trees grow
        // less (see the painters), so a small town still reads as a town
        st.tall = Math.max(TOWN_MIN, Math.min(TOWN_MAX, Math.floor(TOWN_OF_BEHIND * (behind || 75) / 4) * 4));
        st.k = townK(st.tall);
        const sp = TOWN_SPAN[st.variant], mt = mAtY(STATION.townY);
        st.span = [sp[0] * st.k / mt, sp[1] * st.k / mt]; // metres along the line around the town's tallest thing
        st.tv = Math.floor(hash(ord, 311) * 3); st.ev = Math.floor(hash(ord, 312) * 3); // which tower / elevator picture
        if (st.variant === 2) { st.xing = V_MS * STATION.xingAfter; st.xv = Math.floor(hash(ord, 313) * 2); } // the level crossing, metres past the town
      }
      row.kind = kind;
      list.push(st); last = st;
    }
    list.table = table;
    src.stations = list;
    return list;
  }
  // roadside things standing where a station stands make way: the far line (windpumps, flocks) inside a town, the post
  // line at a crossing. By the thing's place along the line (V x (T - T0) metres), so they leave with the station.
  function yieldsTo(stations, line, T) {
    if (!stations || !stations.length) return false;
    let lo = 0, hi = stations.length;
    while (lo < hi) { const m = (lo + hi) >> 1; if (stations[m].t < T - 12) lo = m + 1; else hi = m; }
    for (let k = lo; k < stations.length && stations[k].t <= T + 12; k++) {
      const st = stations[k], X = V_MS * (T - st.t);
      if ((line === 'crash' || line === 'tom' || line === 'post') && st.kind === 'town' && X >= st.span[0] - 4 && X <= st.span[1] + 4) return true;
      if (line === 'post' && st.xing !== undefined && Math.abs(X - st.xing) <= 4) return true;
    }
    return false;
  }
  const stationSprites = new Map();
  // a sprite in sketch units around a base point; paint(g) draws in those units; blurred along x by `blur` sketch px
  function bakeSprite(L, dpr, key, box, blur, paint) {
    if (stationSprites.has(key)) return stationSprites.get(key);
    const k = L.s * dpr, x0 = box[0] - blur, y0 = box[1], w = box[2] - box[0] + 2 * blur, h = box[3] - box[1];
    const a = makeCanvas(w * k, h * k);
    let out = null;
    if (a) {
      const g = a.getContext('2d');
      g.setTransform(k, 0, 0, k, -x0 * k, -y0 * k);
      paint(g);
      let c = a;
      if (blur * k >= 1.5) {
        const b = makeCanvas(a.width, a.height), bg = b.getContext('2d'), K = Math.max(5, Math.round(blur * k));
        bg.globalCompositeOperation = 'lighter'; bg.globalAlpha = 1 / K;
        for (let q = 0; q < K; q++) bg.drawImage(a, (q / (K - 1) - .5) * blur * k, 0);
        c = b;
      }
      out = {c, x0, y0, w, h};
    }
    if (stationSprites.size > 48) stationSprites.delete(stationSprites.keys().next().value);
    stationSprites.set(key, out);
    return out;
  }
  const spriteKey = (L, LT, dpr, what) => [lightIds.get(LT), L.s, dpr, what, MODE()].join('|');
  // ---- painters, sketch px around the base point; the sun is to the left and ahead: lit left faces, shadows to the right
  const tint = (LT, hex, k) => mix(mix(rgb(hex), LT.haze, k), LT.shade, .22); // into the haze, then a little down: never paler than the hills
  function box(g, x0, x1, h0, h1, fill) { g.fillStyle = fill; g.fillRect(x0, -h1, x1 - x0, h1 - h0); }
  function poly(g, pts, fill) { g.fillStyle = fill; g.beginPath(); pts.forEach((p, i) => i ? g.lineTo(p[0], -p[1]) : g.moveTo(p[0], -p[1])); g.closePath(); g.fill(); }
  function castShadow(g, LT, x0, x1, h, a) { // on the ground, to the right and a little toward us
    const len = 1.1 * h * (LT.castLen / 1.8);
    g.fillStyle = css(CAST, a * LT.castA); g.beginPath(); g.moveTo(x0, 0); g.lineTo(x1, 0); g.lineTo(x1 + len, len * .05); g.lineTo(x0 + len * .55, len * .05 + .3); g.closePath(); g.fill();
  }
  // a town's things fold into the haze: mixed half-way into it and a touch darker, so nothing is brighter than the hills
  const TOWN_HAZE = .3;
  function silo(g, LT, x, r, h, col) {
    const gr = g.createLinearGradient(x - r, 0, x + r, 0);
    gr.addColorStop(0, css(mix(col, LT.light, .18))); gr.addColorStop(.4, css(col)); gr.addColorStop(1, css(mix(col, LT.shade, .3)));
    g.fillStyle = gr; g.beginPath(); g.moveTo(x - r, 0); g.lineTo(x - r, -h); g.ellipse(x, -h, r, r * .18, 0, Math.PI, 0); g.lineTo(x + r, 0); g.closePath(); g.fill();
  }
  function elevator(g, LT, x, H) { // three silos, a head house on top, a low annex to the right
    const conc = mix(tint(LT, '#8d8679', TOWN_HAZE), LT.shade, .06), dark = tint(LT, '#4c463f', TOWN_HAZE * .8);
    castShadow(g, LT, x - 30, x + 30, H * .8, .2);
    box(g, x - 7, x + 7, H * .78, H, css(mix(conc, LT.shade, .08)));
    box(g, x - 7, x - 4.5, H * .78, H, css(mix(conc, LT.light, .18)));
    poly(g, [[x - 8.5, H], [x + 8.5, H], [x + 5, H + 4], [x - 5, H + 4]], css(dark));
    for (const dx of [-17, 0, 17]) silo(g, LT, x + dx, 8.4, H * .76, conc);
    box(g, x + 26, x + 50, 0, H * .26, css(tint(LT, '#7d7365', TOWN_HAZE)));
    poly(g, [[x + 25, H * .26], [x + 51, H * .26], [x + 51, H * .31], [x + 25, H * .38]], css(dark));
    g.strokeStyle = css(dark); g.lineWidth = 1.2; g.beginPath(); g.moveTo(x + 7, -H * .86); g.lineTo(x + 38, -H * .3); g.stroke();
  }
  function waterTower(g, LT, x, H) {
    const tank = tint(LT, '#888d86', TOWN_HAZE), leg = tint(LT, '#4d5352', TOWN_HAZE * .8), legTop = H * .66, w = H * .16;
    castShadow(g, LT, x - w, x + w, H * .85, .17);
    g.strokeStyle = css(leg); g.lineWidth = 1.4; g.beginPath();
    for (const [b, tp] of [[-1, -.62], [1, .62], [-.45, -.3], [.45, .3]]) { g.moveTo(x + b * w, 0); g.lineTo(x + tp * w, -legTop); }
    for (const f of [.34, .66]) { const ww = w * (1 - .38 * f); g.moveTo(x - ww, -legTop * f); g.lineTo(x + ww, -legTop * f); }
    g.stroke();
    const xa = x - w * .95, xb = x + w * .95, y0 = -legTop, y1 = -H * .88, yr = -H;
    const gr = g.createLinearGradient(xa, 0, xb, 0);
    gr.addColorStop(0, css(mix(tank, LT.light, .2))); gr.addColorStop(.45, css(tank)); gr.addColorStop(1, css(mix(tank, LT.shade, .32)));
    g.fillStyle = gr; g.beginPath(); g.moveTo(xa, y0); g.lineTo(xa, y1); g.lineTo(x, yr); g.lineTo(xb, y1); g.lineTo(xb, y0); g.quadraticCurveTo(x, y0 + 5, xa, y0); g.closePath(); g.fill();
  }
  function house(g, LT, x, w, h, wall, roof) {
    const col = mix(tint(LT, wall, TOWN_HAZE), LT.shade, .05), rc = tint(LT, roof, TOWN_HAZE * .8), hr = h * 1.6;
    castShadow(g, LT, x - w / 2, x + w / 2, hr, .22);
    box(g, x - w / 2, x + w / 2, 0, h, css(col));
    box(g, x - w / 2, x - w / 2 + 2, 0, h, css(mix(col, LT.light, .25)));
    poly(g, [[x - w / 2 - 2, h], [x + w / 2 + 2, h], [x + w / 2 - w * .2, hr], [x - w / 2 + w * .2, hr]], css(rc));
    poly(g, [[x - w / 2 - 2, h], [x - w / 2 + w * .2, hr], [x - w / 2 + w * .2 + 2, hr], [x - w / 2, h]], css(mix(rc, LT.light, .25)));
    for (const k of [.25, .62]) box(g, x - w / 2 + w * k, x - w / 2 + w * k + w * .14, h * .32, h * .7, css(mix(col, LT.shade, .45)));
  }
  function tree(g, LT, x, H, seed) {
    const col = tint(LT, '#47503a', TOWN_HAZE * .9);
    castShadow(g, LT, x - H * .2, x + H * .2, H * .7, .16);
    box(g, x - 1.5, x + 1.5, 0, H * .45, css(tint(LT, '#3f352b', TOWN_HAZE)));
    for (let j = 0; j < 6; j++) {
      const r = hash(seed * 13 + j, 87), cx = x + (r - .5) * H * .45, cy = -H * (.55 + .3 * ((j * .37 + r) % 1));
      g.fillStyle = css(j < 2 ? mix(col, LT.light, .14) : col); g.beginPath(); g.ellipse(cx, cy, H * .22, H * .17, 0, 0, Math.PI * 2); g.fill();
    }
  }
  function ground(g, LT, x0, x1) { // the dusty lot the town stands on, and a haze band over its feet
    g.fillStyle = css(mix(tint(LT, '#b9a77f', .3), LT.light, .05), .35); g.beginPath(); g.ellipse((x0 + x1) / 2, 2, (x1 - x0) / 2 + 20, 6, 0, 0, Math.PI * 2); g.fill();
  }
  // tall = the silo's / water tower's height; houses 22 px to the eaves (35 to the ridge), trees 40-60 px
  // (batch 7: the places widen with the town, k = townK(H))
  const TOWNS = [
    (g, LT, H, k) => { ground(g, LT, -140 * k, 125 * k); house(g, LT, -105 * k, 58, 22, '#8f8574', '#4a453f'); tree(g, LT, -52 * k, 40, 1); waterTower(g, LT, 0, H); house(g, LT, 92 * k, 54, 21, '#7d665a', '#47423c'); },
    (g, LT, H, k) => { ground(g, LT, -35 * k, 190 * k); elevator(g, LT, 0, H); house(g, LT, 112 * k, 58, 22, '#868d82', '#45413b'); tree(g, LT, 165 * k, 44, 2); },
    (g, LT, H, k) => { ground(g, LT, -120 * k, 135 * k); house(g, LT, -86 * k, 58, 22, '#8f8574', '#4a453f'); tree(g, LT, -36 * k, 50, 4); tree(g, LT, 0, Math.min(62, Math.max(46, H)), 3); house(g, LT, 62 * k, 54, 21, '#7d665a', '#47423c'); tree(g, LT, 108 * k, 46, 5); },
    (g, LT, H, k) => { ground(g, LT, -225 * k, 225 * k); house(g, LT, -192 * k, 56, 22, '#868d82', '#45413b'); tree(g, LT, -148 * k, 44, 6); waterTower(g, LT, -98 * k, H * .92); elevator(g, LT, 0, H); house(g, LT, 98 * k, 56, 22, '#8f8574', '#4a453f'); house(g, LT, 158 * k, 50, 20, '#7d665a', '#47423c'); tree(g, LT, 202 * k, 48, 7); }
  ];
  // The towns from GPT's pictures (batch 7): the same four kinds, things at the same places (x k), the tower / silo at
  // H, houses 0.3 H (28-44 px), trees 0.42 H (36-60), a depot where the code had a house beside a silo. Each thing gets
  // the program's cast shadow; then the whole town takes TOWN_HAZE of the haze colour (cover-tinted).
  const ART_TOWNS = [
    [['house-a', -105, 'h'], ['tree-a', -55, 't'], ['T', 0, 'H'], ['house-b', 92, 'h']],
    [['E', 0, 'H'], ['depot-a', 125, 'd'], ['tree-b', 200, 't']],
    [['house-c', -86, 'h'], ['tree-c', -36, 't'], ['tree-d', 0, 'c'], ['house-d', 62, 'h'], ['tree-b', 108, 't']],
    [['house-e', -192, 'h'], ['tree-a', -148, 't'], ['T', -98, 'H92'], ['E', 0, 'H'], ['house-f', 98, 'h'], ['depot-b', 175, 'd'], ['tree-d', 245, 't']]];
  function artTown(g, LT, st) {
    const H = st.tall, k = st.k, hh = clamp(.3 * H, 28, 44), th = clamp(.42 * H, 36, 60);
    const size = {H, H92: H * .92, h: hh, d: hh * .95, t: th, c: clamp(.55 * H, 46, 80)};
    const sp = TOWN_SPAN[st.variant];
    ground(g, LT, sp[0] * k + 10, sp[1] * k - 10);
    for (const [name, x0, sz] of ART_TOWNS[st.variant]) {
      const key = 'station/' + (name === 'T' ? 'town-water-tower-' + ABC[st.tv] : name === 'E' ? 'town-grain-elevator-' + ABC[st.ev] : 'town-' + name);
      const a = pic(key);
      if (!a) continue;
      const x = x0 * k, hgt = size[sz], f = hgt / tallOf(a), b = boxOf(a, f);
      castShadow(g, LT, x + b[0] * .8, x + b[2] * .8, hgt * (name === 'T' || name === 'E' ? .85 : 1.2), .2);
      put(g, a, x, 0, f);
    }
    g.save(); g.globalCompositeOperation = 'source-atop'; g.fillStyle = css(LT.haze, TOWN_HAZE); g.fillRect(-1e4, -1e4, 2e4, 2e4); g.restore();
  }
  function townSprite(L, LT, dpr, st) {
    const v = st.variant, H = st.tall, k = st.k, sp = TOWN_SPAN[v];
    return bakeSprite(L, dpr, spriteKey(L, LT, dpr, 'town' + v + '@' + H + (ART ? '/' + st.tv + st.ev : '')), [sp[0] * k - 20, -Math.max(H, 80) - 20, sp[1] * k + 90, 12], speedAtY(STATION.townY) * BLUR,
      g => ART ? artTown(g, LT, st) : TOWNS[v](g, LT, H, k));
  }
  // batch 7: the sign as GPT's board (3.6 m to its top, ~6.9 m across) and lamp (5 m, its glow on), pictures chosen per sign of the song
  function signSprite(L, LT, dpr, st) {
    const y = STATION.signY, M = mAtY(y), sv = ART && st ? st.sv : 0, lv = ART && st ? st.lv : 0;
    return bakeSprite(L, dpr, spriteKey(L, LT, dpr, 'sign' + (ART ? sv + '/' + lv : '')), [-6.2 * M, -5.6 * M, (ART ? 3.8 : 3.4) * M, 0], speedAtY(y) * BLUR * STATION.signBlur, g => {
      if (ART) {
        const lamp = pic('station/station-lamp-' + ABC[lv]), glow = pic('station/station-lamp-glow-' + ABC[lv]), board = pic('station/station-sign-' + ABC[sv]);
        if (lamp) { const f = 5 * M / tallOf(lamp); put(g, lamp, -5.2 * M, 0, f); put(g, glow, -5.2 * M, 0, f); }
        if (board) put(g, board, 0, 0, 3.6 * M / tallOf(board)); // its top where the code's board was (only the top clears the window's lower edge)
        return;
      }
      g.scale(M, M); // metres from here on
      const iron = mix(rgb('#2f3336'), LT.haze, .05);
      const post = (X, h, w, col) => { box(g, X - w / 2, X + w / 2, 0, h, css(col)); box(g, X - w / 2, X - w / 2 + w * .3, 0, h, css(mix(col, LT.light, .4), .85)); box(g, X + w * .2, X + w / 2, 0, h, css(mix(col, LT.shade, .35), .7)); };
      // the lamp: a post, a gooseneck arm toward the track, a hood and its glow
      const lc = mix(rgb('#2d3133'), LT.haze, .06);
      post(-5.2, 5.0, .14, lc);
      g.strokeStyle = css(lc); g.lineWidth = .09; g.lineCap = 'round';
      g.beginPath(); g.moveTo(-5.2, -5.0); g.quadraticCurveTo(-4.65, -5.25, -4.45, -4.95); g.stroke();
      poly(g, [[-4.65, 4.98], [-4.25, 4.98], [-4.35, 4.78], [-4.55, 4.78]], css(lc));
      const gl = g.createRadialGradient(-4.45, -4.74, 0, -4.45, -4.74, .55);
      gl.addColorStop(0, 'rgba(255,236,196,.85)'); gl.addColorStop(.25, 'rgba(255,214,150,.35)'); gl.addColorStop(1, 'rgba(255,214,150,0)');
      g.fillStyle = gl; g.beginPath(); g.arc(-4.45, -4.74, .55, 0, Math.PI * 2); g.fill();
      post(-2.1, 3.6, .14, iron); post(2.1, 3.6, .14, iron);
      // the board: a frame, a blue-grey face and one pale band where a name would be - a smear, never letters
      const fr = mix(rgb('#262a2c'), LT.haze, .05), face = mix(rgb('#3a5257'), LT.haze, .12);
      box(g, -2.7, 2.7, 2.35, 3.55, css(fr));
      box(g, -2.63, 2.63, 2.42, 3.48, css(face));
      box(g, -2.1, 2.1, 2.77, 3.13, css(mix(rgb('#dcd4c0'), LT.haze, .1), .8));
      box(g, -2.7, 2.7, 3.52, 3.55, css(mix(fr, LT.light, .6), .9));
    });
  }
  // batch 7: the crossing as GPT's signal (4.4 m) and gate (its pivot .35 m right of the post, 1.05 m up, 7.7 m long);
  // lit = 'l' / 'r': only that lamp's glow layer, drawn over the unlit signal
  function crossingSprite(L, LT, dpr, st, lit) {
    const y = STATION.xingY, M = mAtY(y), xv = ART && st ? st.xv : 0;
    return bakeSprite(L, dpr, spriteKey(L, LT, dpr, 'xing' + (ART ? xv + (lit || '') : '')), [-2.6 * M, -4.6 * M, 9.5 * M, .2 * M], speedAtY(y) * BLUR, g => {
      if (ART) {
        const sig = pic('station/crossing-signal-' + (lit ? 'lit-' + lit + '-' : '') + ABC[xv]), base = pic('station/crossing-signal-' + ABC[xv]), gate = pic('station/crossing-gate-a');
        if (!sig || !base) return;
        const f = 4.4 * M / tallOf(base);
        if (!lit && gate) put(g, gate, .35 * M, -1.05 * M, 7.7 * M / (gate.bbox[2] + 1 - gate.anchor[0]));
        put(g, sig, 0, 0, f);
        return;
      }
      g.scale(M, M);
      const white = mix(rgb('#d4d0c4'), LT.haze, .08), iron = mix(rgb('#3a3d3e'), LT.haze, .05), pc = mix(rgb('#c2bfb6'), LT.haze, .06);
      box(g, -.08, .08, 0, 4.4, css(pc)); box(g, -.08, -.03, 0, 4.4, css(mix(pc, LT.light, .4), .85));
      for (const sgn of [1, -1]) { // a crossbuck: two blank boards in an X
        g.save(); g.translate(0, -3.95); g.rotate(sgn * .72);
        g.fillStyle = css(iron); g.fillRect(-1.25, -.15, 2.5, .3); g.fillStyle = css(white); g.fillRect(-1.2, -.11, 2.4, .22); g.restore();
      }
      box(g, -.9, .9, 2.85, 3.25, css(iron));
      for (const dx of [-.55, .55]) { g.fillStyle = css(rgb('#141414')); g.beginPath(); g.arc(dx, -3.05, .32, 0, Math.PI * 2); g.fill(); }
      // the gate arm, down across the road, red and white
      const a0 = .2, a1 = 2 * ROAD_HALF + 1.5, ah = 1.05; // from the signal (.9 m before the road) to .6 m past it
      box(g, a0, a1, ah - .12, ah + .12, css(white));
      for (let x = a0 + .6; x < a1; x += 1.2) box(g, x, Math.min(a1, x + .6), ah - .12, ah + .12, css(mix(rgb('#b8463a'), LT.haze, .08)));
      box(g, -.35, .35, .6, 1.5, css(iron));
    });
  }
  // the crossing's lamps: one of the pair lit, swapping twice a song second (drawn live, they are two dots)
  function crossingLamps(ctx, x, y, t) {
    const M = mAtY(y), on = Math.floor(t * 2) % 2;
    for (const [k, dx] of [[0, -.55], [1, .55]]) {
      const lx = x + dx * M, ly = y - 3.05 * M, r = .26 * M;
      ctx.fillStyle = k === on ? 'rgba(232,74,52,1)' : 'rgba(92,40,34,1)'; ctx.beginPath(); ctx.arc(lx, ly, r, 0, Math.PI * 2); ctx.fill();
      if (k === on) { const gr = ctx.createRadialGradient(lx, ly, 0, lx, ly, r * 3.2); gr.addColorStop(0, 'rgba(255,120,90,.45)'); gr.addColorStop(1, 'rgba(255,120,90,0)'); ctx.fillStyle = gr; ctx.beginPath(); ctx.arc(lx, ly, r * 3.2, 0, Math.PI * 2); ctx.fill(); }
    }
  }
  const inView = (L, x, sp) => sp && x + sp.x0 + sp.w > L.left - 4 && x + sp.x0 < L.right + 4;
  function warmStations(stations, L, LT, dpr) {
    const key = spriteKey(L, LT, dpr, 'all');
    if (stations.warm === key) return;
    stations.warm = key;
    for (const st of stations) {
      if (st.kind === 'sign') { signSprite(L, LT, dpr, st); continue; }
      townSprite(L, LT, dpr, st);
      if (st.xing !== undefined) { crossingSprite(L, LT, dpr, st); if (ART) { crossingSprite(L, LT, dpr, st, 'l'); crossingSprite(L, LT, dpr, st, 'r'); } }
    }
  }
  function passTowns(ctx, stations, L, t, LT, dpr) {
    const out = [];
    if (!stations.length) return out;
    warmStations(stations, L, LT, dpr);
    const y = STATION.townY, sp = speedAtY(y);
    for (const st of stations) {
      if (st.kind !== 'town' || Math.abs(st.t - t) > 30) continue;
      const s = townSprite(L, LT, dpr, st), x = L.nowM + (st.t - t) * sp;
      if (!inView(L, x, s)) continue;
      ctx.drawImage(s.c, x + s.x0, y + s.y0, s.w, s.h);
      out.push({kind: 'town', variant: st.variant, t: st.t, x, tall: st.tall});
    }
    return out;
  }
  function passNear(ctx, stations, L, t, LT, dpr) {
    const out = [];
    for (const st of stations) {
      if (Math.abs(st.t - t) > 30) continue;
      if (st.kind === 'sign') {
        const y = STATION.signY, s = signSprite(L, LT, dpr, st), x = L.nowM + (st.t - t) * speedAtY(y);
        if (!inView(L, x, s)) continue;
        ctx.drawImage(s.c, x + s.x0, y + s.y0, s.w, s.h);
        out.push({kind: 'sign', t: st.t, x});
      } else if (st.xing !== undefined) {
        const y = STATION.xingY, s = crossingSprite(L, LT, dpr, st), T = st.t + (st.xing - ROAD_HALF - .9) / V_MS, x = L.nowM + (T - t) * speedAtY(y);
        // the road's planks over the track bed under the window (rows 814 down), each row at its own speed
        const r0 = st.xing - ROAD_HALF, r1 = st.xing + ROAD_HALF, at = (X, yy) => L.nowM + (X / V_MS + st.t - t) * speedAtY(yy);
        if (at(r1, 814) > L.left - 40 && at(r0, M_BOTTOM + 2) < L.right + 40) {
          ctx.fillStyle = css(mix(rgb('#6f665a'), LT.haze, .1), .92); ctx.beginPath();
          ctx.moveTo(at(r0, 814), 814); ctx.lineTo(at(r1, 814), 814); ctx.lineTo(at(r1, M_BOTTOM + 2), M_BOTTOM + 2); ctx.lineTo(at(r0, M_BOTTOM + 2), M_BOTTOM + 2); ctx.closePath(); ctx.fill();
        }
        if (!inView(L, x, s)) continue;
        ctx.drawImage(s.c, x + s.x0, y + s.y0, s.w, s.h);
        if (ART) { const l = crossingSprite(L, LT, dpr, st, Math.floor(t * 2) % 2 ? 'r' : 'l'); if (l) ctx.drawImage(l.c, x + l.x0, y + l.y0, l.w, l.h); } // one lamp lit, swapping twice a song second
        else crossingLamps(ctx, x, y, t);
        out.push({kind: 'crossing', t: T, x});
      }
    }
    return out;
  }
  const ROAD_HALF = 3.2; // metres each side of the crossing road's middle

  // ---------- the carriage: the LED displays (score-terrain-led.js, global XinScoreTerrainLed) ----------
  // Above the window: title, artist, this station / next, time, the route of all sections. On the sill: the lyric line
  // (nothing lit when there is none). On the frame: the two "now" arrows. Section names come from the song's own rows
  // (Chinese in the bundles; English labels go through the module's fallback).
  const warmed = new WeakSet();
  // The route board speaks English (batch 6, item 5): station names in upper case (Led.englishSection), and the readout
  // at the right is the distance run at the module's TRAIN_MPH. To go back to song time, set HEADER_READOUT to 'time';
  // to go back to Chinese names, set HEADER_NAMES to 'zh'. Internal switches only, not in XML's settings.
  const HEADER_READOUT = 'miles', HEADER_NAMES = 'en';
  function carriage(ctx, frame, S, dpr) {
    const Led = globalThis.XinScoreTerrainLed;
    if (!Led) return null;
    const L = S.layout, song = frame.song, track = song.track || {}, opts = {dpr};
    const sections = (Array.isArray(song.sections) ? song.sections : [])
      .filter(r => Array.isArray(r) && Number.isFinite(r[0]))
      .map(r => [r[0], r[1], HEADER_NAMES === 'en' && Led.englishSection ? Led.englishSection(String(r[2] == null ? '' : r[2])) : Led.localizeSection(String(r[2] == null ? '' : r[2]))]);
    if (!warmed.has(song) && Led.warm) { // the first frame of a song rasterises every name it will show, not later frames
      warmed.add(song);
      Led.warm([String(track.title || ''), String(track.artist || ''), ...sections.map(r => r[2]), '0123456789:/ .…MI', '本站下一站终点'], opts);
    }
    Led.drawHeader(ctx, L.header, {title: track.title || '', artist: track.artist || '', sections, time: S.time, duration: S.duration, readout: HEADER_READOUT}, opts);
    // a lyric line too long for the sill scrolls; its progress comes with the frame when the host knows the line's timing
    // (lyricProgress), otherwise it sweeps back and forth on song time (a whole character at a time, in the module)
    const line = typeof frame.lyric === 'string' ? frame.lyric : frame.lyric && frame.lyric.text || '';
    let progress = Number.isFinite(frame.lyricProgress) ? frame.lyricProgress : null;
    if (progress === null) { const period = Math.max(6, Array.from(line).length * .45), u = (S.time / period) % 2; progress = 1 - Math.abs(u - 1); }
    // the sill board is always there (batch 6, the user: 「下方的歌词LED背景板应该一直存在」): with no line every dot is
    // dark but the housing and the unlit dots show - at the ends, in a song without lyrics, with lyrics turned off
    Led.drawLyric(ctx, L.sill, {line, progress: line ? progress : 0}, Object.assign({}, opts, {idle: 'dim'}));
    if (ART) { // GPT's bezels over the housings' rims (batch 7); the pitch as the LED module works it out
      const hp = Math.min(L.header.h / ((Led.headerRows ? Led.headerRows(16, 12) : 35) + 2.6), L.header.w / 200);
      bezel(ctx, 'header', L.header, 1.7 * hp, dpr);
      bezel(ctx, 'sill', L.sill, 1.7 * L.sill.h / (12 + 2.6), dpr);
    }
    Led.drawNowTick(ctx, L.nowX, L.win.y, L.win.y + L.win.h, {pitch: 3 * L.u, dpr});
    return {sections: sections.length, lyric: line};
  }

  function inspect(frame) {
    const S = scene(frame);
    if (S) S.light = lightFor(frame.cover).name;
    return S;
  }

  // a click inside the window: the time under it at the nearest range's speed (the bass layer, 10 s across the sketch window)
  function timeAt(x, y, frame) {
    if (!Number.isFinite(x) || !Number.isFinite(y) || !frame || !(frame.w > 0) || !(frame.h > 0)) return null;
    const duration = durationOf(frame);
    if (!Number.isFinite(duration) || duration <= 0) return null;
    const L = layout(frame.w, frame.h), {win} = L;
    if (x < win.x || x > win.x + win.w || y < win.y || y > win.y + win.h) return null;
    const time = clamp(Number.isFinite(frame.time) ? frame.time : 0, 0, duration) + (x - L.nowX) / (M_W / SPAN_NEAR * L.s);
    return time < -1e-9 || time > duration + 1e-9 ? null : clamp(time, 0, duration);
  }
  const noteAt = () => null; // notes are texture only in this look; nothing to pick

  const invalidate = song => { songCache.delete(song); };
  const api = Object.freeze({draw, timeAt, noteAt, inspect, invalidate, ready,
    // for tests and measurements only
    _internal: Object.freeze({layout, analysePixels, curtainShapes, transomOf, curtainPlace, overlay: (w, h, dpr) => { ART = artNow(); const R = rasters(layout(w, h), BASE, dpr); return R && R.overlay; }, worldShape: (song, w, h, id, k0, k1) => { const src = songSource(song, song.track.duration), L = layout(w, h); return worldShape(src, L, src.layers.find(l => l.id === id), k0, k1); }, roadLines: song => roadLines(songSource(song, song.track.duration)), stations: song => stationsOf(songSource(song, song.track.duration), song), coverMild, BASE, NEAR_TO_FAR, STEM_COLOR, geometry: (frame, margin) => {
      const duration = durationOf(frame), L = layout(frame.w, frame.h), src = songSource(frame.song, duration);
      return {L, src, ranges: geometry(src, L, clamp(frame.time, 0, duration), margin)};
    }})});
  globalThis.XinArt ??= {};
  globalThis.XinArt.terrain = api;
  if (typeof module === 'object' && module && module.exports) module.exports = api;
})();
