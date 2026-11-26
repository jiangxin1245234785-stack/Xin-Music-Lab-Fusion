(() => {
  'use strict';
  // 车窗地貌 (style key 'terrain'), rebuilt 2026-11-19 from the round-6 sketch S1 (work/terrain-20261119/mock6/page.html).
  // Setting: a modern train crossing the American West; out of the side window range after range of mountains; one song
  // is one stretch of the line. One stem = one range, near to far bass, guitar, piano, other, winds, strings, violin,
  // vocals (drums are not a range). Range height = that stem's loudness now (levels.groups), notes only decide how fine
  // or craggy its ridge is. Each range passes the curtain at its own depth and moves left at a fixed speed.
  // Fixed late-afternoon light; a cover only tints the low sky and the haze. Plain at both ends of the song.
  // The carriage's route and lyric displays use the song clock.
  //
  // Geometry is computed in the sketch's own coordinates (a 1440 x 900 frame, window y 136..832) with the window height
  // fixed at 696 units and its width following the picture's aspect, then scaled by window height: a wider picture
  // shows more seconds instead of stretching. Each range's shape is cached per world sample (its own time grid) and
  // only moves from frame to frame; sky, clouds, ground, glass and grain are rasters made once per size and light.
  // The picture is a function of song time only: no clock, no random numbers (hash noise with fixed seeds).

  const STEM_COLOR = {vocals: '#e2ada0', violin: '#cf9a86', strings: '#d9bc8d', winds: '#d0a073', piano: '#f3d7ab', guitar: '#ad6847', other: '#527782', bass: '#24394a'};
  const STEM_NAME = {vocals: '人声', violin: '小提琴', strings: '弦乐', winds: '管乐', piano: '钢琴', guitar: '吉他', other: '其它', bass: '贝斯'};
  const NEAR_TO_FAR = ['bass', 'guitar', 'piano', 'other', 'winds', 'strings', 'violin', 'vocals'];
  const SPAN_NEAR = 10, SPAN_FAR = 30;
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
  const MARGIN = 240; // world samples beyond the edges for the fallback's rock faces

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
  const TEX_TEXEL = .75, TEX_K = .45, STRATA_K = .5, GRAIN_TEXEL = .5, DUST_K = 1, STREAK_K = .65;
  // the coarsest brush (a) only on the nearest one or two ranges, then b, c, d with distance
  const textureOf = d => d < .15 ? 'a' : d < .45 ? 'b' : d < .75 ? 'c' : 'd';
  function patternOf(g, canvas, sc, ex, ey, rep) {
    if (!canvas || typeof g.createPattern !== 'function') return null;
    const p = g.createPattern(canvas, rep || 'repeat');
    if (p && p.setTransform && typeof DOMMatrix === 'function') p.setTransform(new DOMMatrix([sc, 0, 0, sc, ex, ey]));
    return p;
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
      return {id, name, i, d, span, f: span / 16, dt: span * COL / M_W, pps: M_W / span, foot: BASE0 - STEP * i, amp: lerp(150, 250, Math.pow(d, 1.1)), rw: lerp(1, .6, d), seed: 100 + i * 9,
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

  // ---------- layout ----------
  // Dimensions in cabin units. The handle crown and both rubber feet are inked to these limits.
  const RADIO = {width: 596, height: 69, handleRise: 12.5, feetDrop: 3.5,
    screenX: 85, screenY: 12, screenWidth: 460, screenHeight: 42};
  const CABIN_RIDGE = 1, CABIN_GASKET = 5;
  function layout(w, h) {
    const u = Math.min(w / 1440, h / 900);
    const top = 136 * u, bottom = 68 * u, side = 64 * u;
    const win = {x: side, y: top, w: Math.max(1, w - 2 * side), h: Math.max(1, h - top - bottom), r: 40 * u};
    const s = win.h / M_H;
    const Wm = win.w / s; // window width in sketch units
    // Keep the pitch of the original 35-row, 118-unit display. Only the top of the opening moves.
    const ledRows = globalThis.XinScoreTerrainLed?.headerRows?.(16, 12) ?? 50;
    const pitch = 118 * u / 37.6, rise = (ledRows - 35) * pitch;
    const opening = {x: 68.75 * u, y: 128.75 * u + rise, w: w - 129.25 * u, h: h - 213.75 * u - rise, r: 42 * u};
    const glass = {x: 86.25 * u, y: 146.65 * u + rise, w: w - 172.5 * u, h: h - 254.65 * u - rise, r: 23 * u};
    // Crop the upper sky first. Compress the common projection only enough to keep an 18-unit pane above the transom.
    const floor = h - 104.5 * u, barFraction = (TRANSOM_Y - M_TOP) / M_H;
    const projectionTop = Math.max(win.y, (glass.y + 18 * u - barFraction * floor) / (1 - barFraction));
    const projection = {...win, y: projectionTop, h: floor - projectionTop};
    const sy = projection.h / M_H;
    const shelf = {back: h - 85 * u, front: h - 2.1 * u};
    const deckUnit = u;
    const deckW = RADIO.width * u;
    const sillDeck = {x: (w - deckW) / 2, y: shelf.back + 4 * u, w: deckW, h: RADIO.height * u};
    const vfdBounds = {top: sillDeck.y - RADIO.handleRise * u, bottom: sillDeck.y + sillDeck.h + RADIO.feetDrop * u};
    const L = {w, h, u, s, sy, win, projection, Wm, cabin: {opening, glass, shelf, deckUnit, vfdBounds}, left: M_LEFT, right: M_LEFT + Wm,
      // the carriage's own displays (drawn by the LED module, not here): top train LED + standalone tabletop VFD player resting on the windowsill
      header: {x: 64 * u, y: 4 * u, w: Math.max(1, w - 128 * u), h: 118 * u + rise},
      sillDeck,
      sill: {x: sillDeck.x + RADIO.screenX * u, y: sillDeck.y + RADIO.screenY * u, w: RADIO.screenWidth * u, h: RADIO.screenHeight * u}
    };
    L.entryAt = refCurtainEntry(L);
    L.entryX = win.x + (L.entryAt(ridgeHeight(BASE0, 150)) - M_LEFT) * s;
    return L;
  }
  const ridgeHeight = (foot, amp) => foot - .55 * amp;
  const ridgeEntry = (L, layer) => L.entryAt(ridgeHeight(layer.foot, layer.amp));
  const pastEntry = (entry, eventTime, time, speed) => entry + (eventTime - time) * speed;
  const durationOf = frame => Number.isFinite(frame.duration) && frame.duration > 0 ? frame.duration : frame.song && frame.song.track && frame.song.track.duration;

  // ---------- geometry of one frame (sketch coordinates) ----------
  const geometryWindows = new WeakMap();
  const GEOMETRY_BLOCK = 256;

  function geometry(src, L, t, margin = MARGIN) {
    let windows = geometryWindows.get(src);
    if (!windows) geometryWindows.set(src, windows = new Map());
    const key = L.w + 'x' + L.h + '|' + MODE();
    let cached = windows.get(key);
    if (!cached) {
      if (windows.size >= 2) windows.delete(windows.keys().next().value);
      windows.set(key, cached = []);
    }
    const ranges = [];
    const pad = 8;
    for (const layer of src.layers) {
      const {i, d, dt, pps, foot} = layer;
      const entryM = ridgeEntry(L, layer);
      const k0 = Math.floor((t + (L.left - pad - entryM) / pps) / dt) - margin;
      const k1 = Math.ceil((t + (L.right + pad - entryM) / pps) / dt) + margin;
      const x0 = pastEntry(entryM, k0 * dt, t, pps);
      let shape = cached[i];
      if (!shape || k0 < shape.first || k1 > shape.last) {
        // Give the view room to advance between ridge evaluations. The padded
        // flank cap makes each interior sample independent of the request bounds.
        const first = Math.floor(k0 / GEOMETRY_BLOCK) * GEOMETRY_BLOCK;
        const last = Math.ceil(k1 / GEOMETRY_BLOCK) * GEOMETRY_BLOCK;
        const {n, hg, env} = worldShape(src, L, layer, first, last);
        shape = cached[i] = {first, last, ys: hg.map(h => foot - h), env, foot: new Float64Array(n).fill(foot)};
      }
      const start = k0 - shape.first, end = k1 - shape.first + 1;
      const R = {id: layer.id, layer, i, d, k0, n: end - start, x0, entryM,
        env: shape.env.subarray(start, end), ys: shape.ys.subarray(start, end), foot: shape.foot.subarray(start, end)};
      R.ja = Math.max(0, Math.floor((L.left - pad - x0) / COL));
      R.jb = Math.min(R.n - 1, Math.ceil((L.right + pad - x0) / COL));
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
      // The presentation uses playheadX for its seek and lyric time conversion.
      playheadX: L.entryX, pxPerSecond: pps, span: win.w / pps, time,
      start: time - (L.entryX - win.x) / pps, end: time + (win.x + win.w - L.entryX) / pps,
      notes: [], basis: src.basis, estimated: src.estimated, plain: {start: src.plainStart, end: src.plainEnd},
      ranges: ranges.map(R => summary(R, L)),
      led: {header: L.header, sill: L.sill, frameTop: L.cabin.glass.y, frameBottom: L.cabin.glass.y + L.cabin.glass.h}
    };
    return {layout: L, src, ranges, duration, time, detail, main: detail, locating: frame.playing === false || frame.locating === true};
  }
  function summary(R, L) {
    const j = Math.round((R.entryM - R.x0) / COL);
    let top = Infinity, tall = 0, rough = 0, cnt = 0;
    for (let k = R.ja; k <= R.jb; k++) {
      const hgt = R.foot[k] - R.ys[k];
      top = Math.min(top, R.ys[k]); tall = Math.max(tall, hgt);
      if (k > R.ja && k < R.jb && hgt > 4) { rough += Math.abs(R.ys[k + 1] - 2 * R.ys[k] + R.ys[k - 1]); cnt++; }
    }
    const {s, sy, projection} = L, toY = y => projection.y + (y - M_TOP) * sy;
    return {id: R.id, name: R.layer.name, span: +R.layer.span.toFixed(2), pxPerSecond: R.layer.pps * s,
      heightAtNow: (R.foot[j] - R.ys[j]) * sy, footAtNow: toY(R.foot[j]), ridgeAtNow: toY(R.ys[j]), envAtNow: R.env[j],
      maxHeight: tall * sy, top: toY(top), roughness: cnt ? rough / cnt : 0, x0: L.win.x + (R.x0 - M_LEFT) * s, step: COL * s,
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
  // A faint reflection of the opposite overhead moulding on the upper right pane.
  // The two glass surfaces return one broad band and a weaker offset lip.
  const CABIN_REFLECTION_STRENGTH = .065;
  function makeCabinReflection(L, dpr) {
    const {glass} = L.cabin, {u} = L;
    const w = glass.w * .285, h = Math.min(glass.h * .185, 110 * u);
    const c = makeCanvas(w * dpr, h * dpr);
    const g = c.getContext('2d');
    g.setTransform(w * dpr, 0, 0, h * dpr, 0, 0);
    const glint = g.createLinearGradient(0, 0, 1, 0);
    glint.addColorStop(0, 'rgba(213,204,180,0)');
    glint.addColorStop(.28, 'rgba(224,215,191,.32)');
    glint.addColorStop(.73, 'rgba(238,232,212,.92)');
    glint.addColorStop(1, 'rgba(219,218,206,0)');
    g.fillStyle = glint;
    g.beginPath(); g.moveTo(0, .66); g.lineTo(.79, .26); g.lineTo(1, .21);
    g.lineTo(1, .28); g.lineTo(.78, .37); g.lineTo(0, .7); g.closePath(); g.fill();
    g.globalAlpha = .4;
    g.beginPath(); g.moveTo(.29, .60); g.lineTo(.80, .35); g.lineTo(.95, .30);
    g.lineTo(.80, .38); g.lineTo(.29, .62); g.closePath(); g.fill();
    return {c, x: glass.x + .675 * glass.w, y: glass.y + .062 * glass.h, w, h};
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
    const {win, projection, s, sy} = L;
    const back = makeCanvas(L.w * dpr, L.h * dpr);
    if (!back) return null;
    const toSketch = (g) => g.setTransform(s * dpr, 0, 0, sy * dpr, (projection.x - M_LEFT * s) * dpr, (projection.y - M_TOP * sy) * dpr);
    // sky + floor + the fixed rain shaft, inside the window
    {
      const g = back.getContext('2d');
      // batch 7: opaque everywhere first. The glass's anti-aliased edge row is half transparent, so the frame before
      // showed through it (1-2 levels, different after playing than after a jump); the code's frame stroke covered that
      // row, the frame picture starts just outside it.
      // Fill the rounded-up backing dimensions in device pixels so a fractional scale also covers the last row and column.
      if (ART) { g.fillStyle = '#141618'; g.fillRect(0, 0, back.width, back.height); }
      g.setTransform(dpr, 0, 0, dpr, 0, 0);
      roundRect(g, projection.x, projection.y, projection.w, projection.h, projection.r); g.clip();
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
    if (clouds && !LT.weatherOvercast) {
      const g = clouds.g;
      g.save();
      g.filter = 'none';
      // Fine, wind-combed cirrus above the lower bank. The strip wraps with the sky.
      for (let group = 0; group < 5; group++) {
        const anchor = (group + hash(group, 117) * .74) * cloudP / 5;
        const y = 188 + hash(group, 118) * 158, length = 226 + hash(group, 119) * 330;
        const loft = 5 + hash(group, 120) * 22, sweep = 7 + hash(group, 121) * 36;
        for (const x of [anchor - cloudP, anchor, anchor + cloudP]) {
          if (x + length < 0 || x - 24 > clouds.w) continue;
          const ink = g.createLinearGradient(x, 0, x + length, 0);
          ink.addColorStop(0, 'rgba(225,234,238,0)');
          ink.addColorStop(.29, 'rgba(237,242,239,.105)');
          ink.addColorStop(.63, 'rgba(255,248,237,.17)');
          ink.addColorStop(1, 'rgba(255,248,225,0)');
          g.fillStyle = ink;
          for (let j = 0; j < 17; j++) {
            const grain = hash(group * 14 + j, 127);
            const band = hash(j, group + 131), width = length * (.18 + band * .47);
            const x1 = x + grain * (length - width), yy = y + (band - .5) * loft + (x1 - x) * sweep / length;
            const x2 = x1 + width, endY = yy + width * sweep / length - 12 * grain;
            const bend = yy - loft * (.19 + .46 * grain);
            g.beginPath(); g.moveTo(x1, yy);
            g.quadraticCurveTo(x1 + width * .47, bend, x2, endY);
            g.quadraticCurveTo(x1 + width * .55, bend + 4 + band * 5, x1, yy);
            g.closePath(); g.fill();
          }
        }
      }
      // Let the paper sky come through the last rows of the cloud artwork.
      const edge = g.createLinearGradient(0, CLOUD_Y1 - 94, 0, CLOUD_Y1);
      edge.addColorStop(0, '#000'); edge.addColorStop(1, 'transparent');
      g.globalCompositeOperation = 'destination-in'; g.fillStyle = edge;
      g.fillRect(0, CLOUD_Y0, clouds.w, CLOUD_Y1 - CLOUD_Y0);
      g.restore();
    }
    // batch 7: the plain from GPT's picture, as bands of depth like the code's ground (each its own speed), opaque, drawn
    // before the ranges (their feet stand on it as before); the code's horizon haze and band (cover-tinted) baked in
    const plain = pic('ground-sky/plain-tile-a') ? plainBands(L, LT, dpr) : null;
    const ground = plain ? [] : groundBands(L, LT, dpr);
    // and the ground flowing past right under the window (GROUND_FLOW): ballast, then the next track's rail
    const flow = ART && GROUND_FLOW ? {ballast: flowStrip(L, dpr, 'ground-sky/ballast-strip-a', FLOW.ballast), rail: flowStrip(L, dpr, 'ground-sky/rail-strip-a', FLOW.rail)} : null;
    // the track bed right under the window: gravel smeared by speed
    const bedY = 820, bed = flow?.ballast && flow.rail ? null : sketchCanvas(L, dpr, 0, bedY - 6, GROUND_P, M_BOTTOM - bedY + 12);
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
    const reflections = LT.weatherOvercast ? makeCanvas(L.w * dpr, L.h * dpr) : null;
    {
      const g = overlay.getContext('2d'), u = L.u;
      g.setTransform(dpr, 0, 0, dpr, 0, 0);
      g.save();
      const fx = m => win.x + (m - M_LEFT) / M_W * win.w, B = win.y + win.h;
      roundRect(g, win.x, win.y, win.w, win.h, win.r); g.clip();
      const GL = LT.glass, bar = transomOf(L);
      {
      const g = reflections ? reflections.getContext('2d') : overlay.getContext('2d');
      if (reflections) {
        g.setTransform(dpr, 0, 0, dpr, 0, 0);
        roundRect(g, win.x, win.y, win.w, win.h, win.r); g.clip();
      }
      // two panes (batch 6): the big view pane below the transom keeps the old streaks; the small pane above it has a
      // faint cool tint and its own, steeper streaks, so the two read as two pieces of glass
      const streakA = pic('overlay/sun-streak-a'), streakB = pic('overlay/sun-streak-b'), dust = pic('overlay/glass-dust-b');
      if (streakA && streakB && dust) { // batch 7: GPT's sun streaks on each pane and the dust over the glass, their own alpha
        g.save(); g.globalAlpha = STREAK_K;
        g.filter = 'blur(' + (2.1 * u * dpr).toFixed(1) + 'px)';
        g.drawImage(streakA.img, win.x, bar.y + bar.t, win.w, B - bar.y - bar.t);
        g.filter = 'none';
        g.fillStyle = 'rgba(40,58,76,.12)'; g.fillRect(win.x, win.y, win.w, bar.y - win.y);
        g.filter = 'blur(' + (1.3 * u * dpr).toFixed(1) + 'px)';
        g.drawImage(streakB.img, win.x, win.y, win.w, bar.y - win.y);
        g.filter = 'none';
        g.globalAlpha = DUST_K; g.drawImage(dust.img, win.x, win.y, win.w, win.h);
        g.restore();
      } else {
      const streak = (x0, y0, x1, y1, width, alpha) => {
        const span = Math.hypot(x1 - x0, y1 - y0);
        g.save();
        g.translate((x0 + x1) / 2, (y0 + y1) / 2);
        g.rotate(Math.atan2(y1 - y0, x1 - x0));
        g.scale(span * .6, width);
        const fade = g.createRadialGradient(0, 0, 0, 0, 0, 1);
        fade.addColorStop(0, css(GL.streak, alpha));
        fade.addColorStop(.5, css(GL.streak, alpha * .38));
        fade.addColorStop(1, css(GL.streak, 0));
        g.fillStyle = fade;
        g.fillRect(-1, -1, 2, 2);
        g.restore();
      };
      g.save(); g.beginPath(); g.rect(win.x, bar.y + bar.t, win.w, B - bar.y - bar.t); g.clip();
      streak(fx(1040), win.y, fx(780), B, 60 * u, GL.streakA);
      streak(fx(1145), win.y, fx(885), B, 15 * u, GL.streakA);
      g.restore();
      g.save(); g.beginPath(); g.rect(win.x, win.y, win.w, bar.y - win.y); g.clip();
      g.fillStyle = 'rgba(40,58,76,.12)'; g.fillRect(win.x, win.y, win.w, bar.y - win.y);
      for (const [m0, mw] of [[1150, 64], [1236, 16], [470, 36]]) { // steeper than the view pane's streaks
        const sl = .6 * (bar.y - win.y);
        const x = fx(m0 + mw / 2);
        streak(x + sl * .3, win.y, x - sl * 1.3, bar.y, mw * .5 * u, GL.streakA * 1.6);
      }
      g.filter = 'blur(' + (10 * u * dpr).toFixed(1) + 'px)'; g.fillStyle = css(GL.smear, GL.smearA); g.fillRect(fx(214), win.y + 16 * u, 520 / M_W * win.w, 7 * u);
      g.filter = 'none';
      g.restore();
      }
      }
      const v = g.createLinearGradient(0, win.y, 0, win.y + 70 * u); v.addColorStop(0, 'rgba(8,12,18,.38)'); v.addColorStop(1, 'rgba(8,12,18,0)');
      g.fillStyle = v; g.fillRect(win.x, win.y, win.w, 70 * u);
      const v2 = g.createLinearGradient(0, B - 50 * u, 0, B); v2.addColorStop(0, 'rgba(8,12,18,0)'); v2.addColorStop(1, 'rgba(8,12,18,.32)');
      g.fillStyle = v2; g.fillRect(win.x, B - 50 * u, win.w, 50 * u);
      // Recessed vertical jamb shadows so the glass sits physically inside the carriage wall.
      const vl = g.createLinearGradient(win.x, 0, win.x + 16 * u, 0); vl.addColorStop(0, 'rgba(6,10,15,.26)'); vl.addColorStop(1, 'rgba(6,10,15,0)');
      g.fillStyle = vl; g.fillRect(win.x, win.y, 16 * u, win.h);
      const vr = g.createLinearGradient(win.x + win.w - 16 * u, 0, win.x + win.w, 0); vr.addColorStop(0, 'rgba(6,10,15,0)'); vr.addColorStop(1, 'rgba(6,10,15,.26)');
      g.fillStyle = vr; g.fillRect(win.x + win.w - 16 * u, win.y, 16 * u, win.h);
      if (ART) artTransom(g, L, bar); else paintTransom(g, L, bar);
      g.restore();
      paintCabinShell(g, L);
    }
    return {back, clouds, ground, plain, flow, bed, overlay, reflections,
      cabinReflection: makeCabinReflection(L, dpr), drapes: makeCabinDrapes(L, dpr)};
  }
  // the plain beside the line: bands of ground, each band its own wrapped strip moving at its depth's speed
  function groundBands(L, LT, dpr) {
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
    return ground;
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

  // Sample a sparse set of marks in world space. A row shares its parallax speed
  // with the nearest depth band. Only the cells intersecting the window are drawn.
  function forSurfaceCell(L, t, speed, step, seed, paint) {
    const scroll = t * speed;
    const first = Math.floor((L.left + scroll) / step) - 1;
    const last = Math.ceil((L.right + scroll) / step);
    for (let n = first; n <= last; n++) {
      const a = hash(n, seed), b = hash(n, seed + 1), c = hash(n, seed + 2);
      paint((n + .1 + .65 * a) * step - scroll, a, b, c);
    }
  }

  function surfaceStage(weather) {
    const mode = weather?.snow ? 'snow' : weather?.sand ? 'sand' : weather?.rain ? 'rain' : 'sun';
    const storm = clamp(weather?.stormDrive || 0);
    const deposit = clamp(weather?.surface ?? (mode === 'rain' ? weather?.humidity ?? storm : storm));
    return {mode, storm, deposit, wind: clamp(weather?.wind ?? storm),
      flash: clamp(weather?.lightning?.intensity || 0)};
  }

  function paintPlainSurface(ctx, L, t, LT, stage, sun) {
    const {mode, storm, deposit, wind} = stage;
    const grassShade = mode === 'sun' ? css(mix(LT.shade, [65, 83, 46], .72)) : null;
    ctx.save();
    ctx.fillStyle = mode === 'snow' ? '#b9cbd8' : mode === 'sand' ? '#b38455' : '#354656';
    ctx.globalAlpha = mode === 'snow' ? .15 + .31 * deposit
      : mode === 'sand' ? .12 + .26 * deposit + .08 * storm
        : mode === 'rain' ? .10 + .19 * deposit + .09 * storm : 0;
    if (ctx.globalAlpha > 0) ctx.fillRect(L.left - 10, HORIZON, L.Wm + 20, M_BOTTOM - HORIZON);
    for (const y of [716, 755, 789]) {
      const z = (y - HORIZON) / (M_BOTTOM - HORIZON);
      const step = lerp(84, 171, z);
      forSurfaceCell(L, t, speedAtY(y), step, y, (x, a, b, c) => {
        const yy = y + (b - .5) * 18, w = step * (.20 + .39 * c), h = z * (2 + 4 * b);
        if (mode === 'sun') {
          ctx.globalAlpha = .29 + .24 * z;
          ctx.fillStyle = grassShade;
          surfaceWedge(ctx, x - .2 * w, yy + .55 * h, 1.15 * w, .78 * h, a);
          ctx.fillStyle = b < .55 ? '#b0b27a' : '#a4a46a';
          ctx.globalAlpha = (.31 + .32 * z) * (.69 + .31 * (sun?.warmth ?? .5));
          surfaceWedge(ctx, x, yy, .9 * w, h, a);
          ctx.fillStyle = '#dfcf8f';
          ctx.globalAlpha *= .66;
          ctx.beginPath();
          ctx.moveTo(x + .34 * w, yy - .27 * h);
          ctx.lineTo(x + .52 * w, yy - (1.04 + .46 * a) * h);
          ctx.lineTo(x + .55 * w, yy - .61 * h);
          ctx.lineTo(x + .72 * w, yy - (1.12 + .24 * c) * h);
          ctx.lineTo(x + .67 * w, yy - .45 * h);
          ctx.lineTo(x + .84 * w, yy - .61 * h);
          ctx.lineTo(x + .68 * w, yy - .17 * h);
          ctx.fill();
        } else if (mode === 'snow' || mode === 'sand') {
          const snow = mode === 'snow';
          ctx.globalAlpha = (.13 + .66 * deposit) * (.45 + .55 * z) * (.65 + .35 * b);
          ctx.fillStyle = snow ? '#8197ab' : '#835f3e';
          surfaceWedge(ctx, x - .1 * w, yy + .52 * h, w, h, a);
          ctx.fillStyle = snow ? '#e1ebef' : '#d3a76e';
          surfaceWedge(ctx, x, yy, w * (.8 + .46 * wind), h * (.7 + .7 * deposit), a);
        } else if (b < .63) {
          paintSurfaceWater(ctx, x, yy, w, h * .43, t, a, stage, z);
        }
      });
    }
    ctx.restore();
  }

  // A low asymmetric mark, with the long side pointing into the lee.
  function surfaceWedge(ctx, x, y, w, h, bias) {
    ctx.beginPath();
    ctx.moveTo(x, y);
    ctx.quadraticCurveTo(x + w * (.17 + .25 * bias), y - 1.8 * h, x + .56 * w, y - .77 * h);
    ctx.quadraticCurveTo(x + .82 * w, y - .44 * h, x + w, y + .3 * h);
    ctx.quadraticCurveTo(x + .35 * w, y + .82 * h, x, y);
    ctx.fill();
  }

  function paintSurfaceWater(ctx, x, y, w, h, t, phase, stage, depth) {
    const {deposit, storm, flash} = stage;
    ctx.globalAlpha = depth * (.07 + .66 * deposit) * (.67 + .33 * phase);
    ctx.fillStyle = '#304653';
    surfaceWedge(ctx, x, y + h * .35, w, h, phase);
    ctx.fillStyle = '#849eac';
    ctx.globalAlpha *= .61 + .39 * flash;
    surfaceWedge(ctx, x + .08 * w, y, .84 * w, .72 * h, phase);
    if (storm < .10) return;
    const pulse = (t * (1.4 + phase) + phase * 9) % 1;
    ctx.globalAlpha = .61 * depth * deposit * storm * (1 - pulse);
    ctx.strokeStyle = '#c3d5df';
    ctx.lineWidth = .65;
    ctx.beginPath();
    ctx.ellipse(x + w * (.28 + phase * .31), y - .13 * h, w * (.035 + .16 * pulse), h * (.14 + .32 * pulse), 0, .10, 2.5);
    ctx.stroke();
  }

  function paintTrackShoulder(ctx, L, t, stage, y0) {
    const {mode, storm, deposit, wind} = stage;
    if (mode === 'sun') return;
    ctx.save();
    ctx.fillStyle = mode === 'rain' ? '#222d37' : mode === 'snow' ? '#b3c3cf' : '#a37245';
    ctx.globalAlpha = mode === 'rain' ? .12 + .29 * deposit + .15 * storm : .06 + .20 * deposit;
    ctx.fillRect(L.left - 10, y0, L.Wm + 20, M_BOTTOM - y0);
    const sp = speedAtY(828);
    for (const y of [y0 + 4, 820, 830]) {
      forSurfaceCell(L, t, sp, 134, y, (x, a, b, c) => {
        if (mode === 'rain') {
          if (b < .70) paintSurfaceWater(ctx, x, y - 1.2 * b, 27 + 63 * c, .85 + 1.5 * b, t, a, stage, 1);
          return;
        }
        const snow = mode === 'snow', w = (40 + 80 * c) * (.8 + .37 * wind);
        const h = (.8 + 3.8 * b) * (.68 + .61 * deposit);
        // Coverage grows from the existing drifts. The gaps expose the gravel at every stage.
        ctx.globalAlpha = .11 + .79 * deposit * smooth(.12, .62, deposit + .26 * b);
        ctx.fillStyle = snow ? '#8195a7' : '#765236';
        surfaceWedge(ctx, x - .11 * w, y + .66 * h, 1.13 * w, .87 * h, a);
        ctx.fillStyle = snow ? '#e1eaf0' : '#d4a775';
        surfaceWedge(ctx, x, y, w, h, a);
        ctx.globalAlpha *= snow ? .48 : .74;
        ctx.fillStyle = snow ? '#f2f5f7' : '#ecc18c';
        surfaceWedge(ctx, x + .07 * w, y - .32 * h, .62 * w, .44 * h, a);
        if (snow) return;
        // Secondary ripples sit behind the crest, along the wind.
        ctx.strokeStyle = '#855d3d';
        ctx.lineWidth = .74;
        ctx.beginPath();
        ctx.moveTo(x + .21 * w, y + .31 * h);
        ctx.quadraticCurveTo(x + .55 * w, y - .33 * h, x + .89 * w, y + .53 * h);
        ctx.moveTo(x + .31 * w, y + .74 * h);
        ctx.quadraticCurveTo(x + .61 * w, y + .17 * h, x + w, y + .84 * h);
        ctx.stroke();
      });
    }
    ctx.restore();
  }

  function paintRailHeads(ctx, L, t, stage, sun, artRail) {
    const {mode, storm, deposit, wind, flash} = stage;
    // Align the edges with the two light bands in the hand-painted rail strip.
    const ys = artRail ? [814.3, 824.5] : [824.5];
    const sp = speedAtY(828), left = L.left - 10, width = L.Wm + 20;
    ctx.save();
    for (const y of ys) {
      if (!artRail) {
        ctx.fillStyle = '#39332e'; ctx.fillRect(left, y, width, 2.1);
      }
      ctx.fillStyle = mode === 'rain' ? '#9cb5c8' : mode === 'snow' ? '#b5cbd9' : mode === 'sand' ? '#bc8d5b' : '#c6a47a';
      ctx.globalAlpha = mode === 'rain' ? .16 + .22 * deposit + .26 * flash : .24;
      ctx.fillRect(left, y, width, .72);
      forSurfaceCell(L, t, sp, 183, y + 63, (x, a, b, c) => {
        const w = 27 + 101 * b;
        if (mode === 'sun') {
          const toSun = smooth(.10, .78, (x + w * .5 - L.left) / L.Wm);
          ctx.globalAlpha = (.15 + .55 * toSun) * (.64 + .36 * (sun?.beam ?? .5));
          ctx.fillStyle = '#ffdda7';
          surfaceWedge(ctx, x, y + .26, w, .47, a);
        } else if (mode === 'rain') {
          ctx.globalAlpha = (.22 + .41 * deposit + .24 * flash) * (.54 + .46 * c);
          ctx.fillStyle = '#c3dae8';
          ctx.fillRect(x, y, w * (1 + .18 * storm), .78);
          ctx.globalAlpha *= .36;
          ctx.fillRect(x + .18 * w, y + .82, .65 * w, .48);
        } else {
          const snow = mode === 'snow';
          ctx.globalAlpha = snow ? .24 + .27 * (1 - deposit) : .23 + .37 * wind;
          ctx.fillStyle = snow ? '#dce9ef' : '#edc395';
          ctx.fillRect(x, y + .08, w * (snow ? .54 : .9), .69);
        }
      });
    }
    ctx.restore();
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
    const y = L.projection.y + (TRANSOM_Y - M_TOP) * L.sy;
    return {y, t: TRANSOM_T * L.sy, shadow: TRANSOM_SHADOW * L.sy};
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
  // ---- batch 7: the carriage from GPT's pictures ----
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
  function cabinRect(g, box, inset = 0) {
    roundRect(g, box.x + inset, box.y + inset, box.w - 2 * inset,
      box.h - 2 * inset, Math.max(0, box.r - inset));
  }

  // Broken fibres and dry brush flecks are painted only when the overlay raster is built.
  function cabinBrush(g, x, y, w, h, u, count, seed, wood = false) {
    const colors = wood ? ['#22180f', '#c7a47b', '#815d41'] : ['#413a32', '#ded8ca', '#8d9393'];
    g.save();
    for (let i = 0; i < count; i++) {
      const px = x + w * hash(i, seed), py = y + h * hash(i, seed + 1);
      const length = (wood ? 12 + 126 * hash(i, seed + 2) ** 2 : 2 + 26 * hash(i, seed + 2) ** 2) * u;
      const weight = (.35 + 1.6 * hash(i, seed + 3) ** 2) * u;
      g.globalAlpha = (.04 + .15 * hash(i, seed + 4) ** 2);
      g.fillStyle = colors[i % colors.length];
      g.fillRect(px, py, Math.min(length, x + w - px), Math.min(weight, y + h - py));
    }
    g.restore();
  }

  const REVEAL_FINISH = {
    top: {color: '#34383d', bounce: 0},
    right: {color: '#777269', bounce: 1},
    bottom: {color: '#897e6f', bounce: 1},
    left: {color: '#494b4d', bounce: .22}
  };
  function cabinFaces({u, cabin: {opening, glass}}) {
    // Miter lines follow the same angle on the two rounded contours. The polygons
    // extend past the contours so the glass cutout and the curved wall edge trim them.
    const corners = ({x, y, w, h, r}) => {
      const d = r * (1 - Math.SQRT1_2);
      return [[x + d, y + d], [x + w - d, y + d], [x + w - d, y + h - d], [x + d, y + h - d]];
    };
    const outside = corners(opening), inside = corners(glass);
    const cornerAt = (i, p) => outside[i].map((v, j) => lerp(v, inside[i][j], p));
    const gx = glass.x + glass.w, gy = glass.y + glass.h;
    const ox = opening.x + opening.w, oy = opening.y + opening.h;
    const strips = [
      ['top', opening.x, opening.y, opening.w, glass.y - opening.y],
      ['right', gx, glass.y, ox - gx, glass.h],
      ['bottom', opening.x, gy, opening.w, oy - gy],
      ['left', opening.x, glass.y, glass.x - opening.x, glass.h]
    ];
    return strips.map(([side, x, y, w, h], i) => {
      const next = (i + 1) % strips.length;
      const depth = side === 'top' || side === 'bottom' ? h : w;
      return {side, ...REVEAL_FINISH[side], width: depth - (CABIN_RIDGE + CABIN_GASKET) * u,
        points: [cornerAt(i, -5), cornerAt(next, -5), cornerAt(next, 5), cornerAt(i, 5)], brush: {x, y, w, h}};
    });
  }

  function paintCabinShell(g, L) {
    const {u, w, h, header, cabin: {glass, opening, shelf}} = L;
    const {back, front} = shelf;
    const D = opening.y + opening.h;
    const unit = Math.max(.5, u);
    const rail = 4 * u;
    const railY = opening.y - rail;
    const metal = 1.5 * u;
    const shade = (y0, y1, stops) => {
      const gradient = g.createLinearGradient(0, y0, 0, y1);
      for (const [at, color] of stops) gradient.addColorStop(at, color);
      return gradient;
    };
    g.save();
    // A single transparent cutout is shared by the wall, all four reveals and the rubber lip.
    cabinRect(g, glass);
    g.rect(0, 0, w, h);
    g.clip('evenodd');
    g.fillStyle = shade(0, back, [[0, '#76716a'], [.22, '#8a867d'], [.62, '#7e7b73'], [1, '#635e56']]);
    g.fillRect(0, 0, w, Math.max(back, D));
    const panel = pic('carriage/wall-panel-a');
    const pattern = panel && g.createPattern?.(panel.img, 'repeat');
    if (pattern?.setTransform && typeof DOMMatrix === 'function') {
      const sc = 300 * u / panel.w;
      pattern.setTransform(new DOMMatrix([sc, 0, 0, sc, 0, 0]));
      g.save();
      g.fillStyle = pattern;
      g.globalCompositeOperation = 'soft-light';
      g.globalAlpha = .43;
      g.fillRect(0, 0, w, Math.max(back, D));
      g.restore();
    }
    cabinBrush(g, 0, 0, w, Math.max(back, D), u, 900, 692);
    const seam = x => {
      g.fillStyle = '#4c4842';
      g.fillRect(x, 0, 1.45 * unit, back);
      g.fillStyle = 'rgba(218,210,193,.32)';
      g.fillRect(x + 1.45 * unit, 0, .85 * unit, back);
    };
    seam(opening.x * .46);
    seam(w - opening.x * .46);
    seam(header.x - 15 * u);
    seam(header.x + header.w + 15 * u);

    // The opening is seen straight on. The four plane changes meet at the rounded plaster corners.
    g.save();
    cabinRect(g, opening);
    g.fillStyle = REVEAL_FINISH.top.color;
    g.fill();
    g.clip();
    for (const [i, {points, color, brush: {x, y, w, h}}] of cabinFaces(L).entries()) {
      g.beginPath();
      g.moveTo(...points[0]);
      for (const p of points.slice(1)) g.lineTo(...p);
      g.closePath();
      g.fillStyle = color;
      g.fill();
      g.save(); g.clip();
      cabinBrush(g, x, y, w, h, u, 100, 701 + 5 * i);
      g.restore();
    }
    g.restore();
    // The wall lip catches a thin light line just outside the dark turn into the reveal.
    cabinRect(g, opening, -.7 * CABIN_RIDGE * u);
    g.strokeStyle = 'rgba(209,198,181,.42)';
    g.lineWidth = .8 * CABIN_RIDGE * u;
    g.stroke();
    cabinRect(g, opening, .45 * CABIN_RIDGE * u);
    g.strokeStyle = 'rgba(35,31,28,.68)';
    g.lineWidth = 1.1 * CABIN_RIDGE * u;
    g.stroke();
    cabinRect(g, glass, -(CABIN_GASKET - .5) * u);
    g.strokeStyle = 'rgba(181,177,160,.31)';
    g.lineWidth = unit;
    g.stroke();
    cabinRect(g, glass, -1.85 * unit);
    g.strokeStyle = '#202123';
    g.lineWidth = 4.2 * unit;
    g.stroke();
    cabinRect(g, glass, -.55 * unit);
    g.strokeStyle = '#363639';
    g.lineWidth = .9 * unit;
    g.stroke();

    g.fillStyle = shade(railY, opening.y, [[0, '#89705a'], [.22, '#715642'], [.79, '#534034'], [1, '#302822']]);
    g.fillRect(0, railY, w, rail);
    cabinBrush(g, 0, railY, w, rail, u, 125, 721, true);
    g.fillStyle = 'rgba(222,192,155,.30)';
    g.fillRect(0, railY, w, .8 * unit);

    // A painted mounting flange behind the display; carriage() supplies the bezel and its contents.
    const mount = {x: header.x - 6 * u, y: header.y - 4 * u, w: header.w + 12 * u, h: header.h + 5 * u, r: 5 * u};
    cabinRect(g, mount, -1.4 * u);
    g.fillStyle = 'rgba(31,26,22,.68)';
    g.fill();
    cabinRect(g, mount);
    g.fillStyle = shade(mount.y, mount.y + mount.h, [[0, '#55514b'], [.14, '#3a3734'], [1, '#252421']]);
    g.fill();
    g.strokeStyle = 'rgba(222,211,192,.35)';
    g.lineWidth = .8 * unit;
    g.stroke();

    if (front > back) {
      g.fillStyle = shade(back, front, [[0, '#554335'], [.22, '#6e5540'], [.65, '#80624a'], [1, '#70533b']]);
      g.fillRect(0, back, w, front - back);
      cabinBrush(g, 0, back, w, front - back, u, 540, 730, true);
      g.fillStyle = shade(back, back + 12 * u, [[0, 'rgba(27,21,17,.79)'], [.32, 'rgba(31,23,18,.34)'], [1, 'rgba(31,23,18,0)']]);
      g.fillRect(0, back, w, Math.min(12 * u, front - back));
    }
    g.fillStyle = shade(front, front + metal, [[0, '#ada9a0'], [.28, '#8c8c87'], [.58, '#696c6c'], [1, '#424548']]);
    g.fillRect(0, front, w, metal);
    g.fillStyle = shade(front + metal, h, [[0, '#3b2d25'], [.35, '#4e3a2e'], [1, '#302720']]);
    g.fillRect(0, front + metal, w, h - front - metal);
    cabinBrush(g, 0, front + metal, w, h - front - metal, u, 135, 735, true);
    g.restore();
  }
  // terrain.27 registration for the landscape clock and roadside arrivals.
  const REF_CURTAIN_OUT = 58, REF_CURTAIN_X = .8;
  function refCurtainPlace(L, side) {
    const C = refCurtainShapes(L), {win, u} = L, a = pic(side < 0 ? 'carriage/curtain-left-a' : 'carriage/curtain-right-a');
    if (!a) return null;
    const railY = C.top - 2.5 * u, f = (C.bot - railY) / (a.bbox[3] - a.anchor[1]), fx = f * REF_CURTAIN_X * Math.min(1, C.k / u);
    const hx = side < 0 ? win.x - REF_CURTAIN_OUT * u + (a.anchor[0] - a.bbox[0]) * fx : win.x + win.w + REF_CURTAIN_OUT * u - (a.bbox[2] + 1 - a.anchor[0]) * fx;
    return {a, f, fx, x: hx - a.anchor[0] * fx, y: railY - a.anchor[1] * f, w: a.ow * fx, h: a.oh * f, railY};
  }
  // Left opaque edge of curtain-right-a, sampled every 50 original rows from y=100 at alpha >= 192.
  // Sampled from the terrain.27 curtain at rest.
  const RIGHT_CURTAIN_EDGE = [
    23, 22, 25, 26, 28, 32, 37, 44, 53, 62, 74, 86, 99, 114, 130, 146, 165, 184, 205, 226,
    248, 271, 294, 316, 323, 320, 304, 285, 265, 245, 226, 209, 193, 177, 162, 148, 134, 121, 110, 101, 234
  ];
  function refCurtainEntry(L) {
    const {win, s} = L, P = refCurtainPlace(L, 1), C = refCurtainShapes(L);
    const right = win.x + win.w;
    return sketchY => {
      const y = win.y + (sketchY - M_TOP) * s;
      const dy = Math.max(0, win.y + win.r - y, y - (win.y + win.h - win.r));
      const clipRight = right - win.r + Math.sqrt(Math.max(0, win.r ** 2 - dy ** 2));
      let edge = C.sides[1].xi(y);
      if (!P && Math.abs(y - C.tie) <= 9 * L.u) edge -= 3 * L.u;
      if (P) {
        const index = clamp(((y - P.y) / P.f - 100) / 50, 0, RIGHT_CURTAIN_EDGE.length - 1);
        const row = Math.min(RIGHT_CURTAIN_EDGE.length - 2, Math.floor(index));
        edge = P.x + lerp(RIGHT_CURTAIN_EDGE[row], RIGHT_CURTAIN_EDGE[row + 1], index - row) * P.fx;
      }
      return M_LEFT + (Math.min(edge, clipRight) - win.x) / s;
    };
  }

  // Heading and tieback bounds, in original image rows. Each panel has its own painted tieback position.
  const DRAPE_ROWS = [[176, 1302, 1386, 2109], [178, 1256, 1340, 2110]];
  const DRAPE_SHADOW_LAG = .29;
  function curtainSway(row, panel, t, u, shadow = false, wind = 0, windTravel = 0) {
    const [heading, tieTop, tieBottom, hem] = DRAPE_ROWS[panel];
    const phase = (t - (shadow ? DRAPE_SHADOW_LAG : 0)) * Math.PI * 2 / 4.8 + panel * .47;
    if (row <= heading || (row >= tieTop && row <= tieBottom)) return 0;
    const breeze = wind * Math.sin(phase * 1.6 + windTravel * .9 - panel * .64);
    if (row < tieTop) {
      const p = (row - heading) / (tieTop - heading);
      return u * Math.sin(Math.PI * p) ** 2 * (.85 * Math.sin(phase - .35 * p) + .32 * breeze);
    }
    const p = clamp((row - tieBottom) / (hem - tieBottom));
    return u * p * p * (3.1 * Math.sin(phase - .95 * p) + 1.25 * breeze);
  }

  // Shared exterior-to-interior gloom curve (0 in clear sun, rising smoothly with overcast + stormDrive + tension).
  function gloomOf(weather) {
    const storm = clamp(weather?.stormDrive || 0);
    const tension = Number.isFinite(weather?.tension) ? weather.tension : .5;
    if (weather?.rain) return clamp(.24 + .32 * storm * (.82 + .36 * tension));
    if (weather?.snow) return clamp(.14 + .22 * storm * (.84 + .32 * tension));
    if (weather?.sand) return clamp(.20 + .34 * storm * (.82 + .36 * tension));
    return 0;
  }

  const CABIN_COLORS = {
    clear: [[255, 222, 166], [44, 60, 80]],
    rain: [[157, 187, 205], [14, 25, 39]],
    snow: [[205, 227, 250], [23, 39, 62]],
    sand: [[235, 176, 109], [34, 44, 61]]
  };
  function cabinLight(weather, sun) {
    const mode = weather?.rain ? 'rain' : weather?.snow ? 'snow' : weather?.sand ? 'sand' : 'clear';
    const [bounce, shadow] = CABIN_COLORS[mode];
    const surface = clamp(weather?.surface || 0), storm = clamp(weather?.stormDrive || 0);
    const flash = mode === 'rain' ? clamp(weather?.lightning?.intensity || 0) : 0;
    const level = mode === 'clear' ? .12 + .13 * (sun?.beam ?? .65)
      : mode === 'rain' ? .09 + .06 * surface - .035 * storm
        : .14 + .12 * surface - .035 * storm;
    return {mode, bounce, shadow, level, flash};
  }
  function cabinEdgeLight(ctx, x0, x1, light, scale = 1) {
    const g = ctx.createLinearGradient(x0, 0, x1, 0);
    const rainFlash = light.flash * .32;
    const color = rainFlash ? mixRgb(light.bounce, [207, 233, 255], light.flash) : light.bounce;
    const a = scale * (light.level + rainFlash);
    g.addColorStop(0, css(color, 0));
    g.addColorStop(.24, css(color, a * (light.mode === 'clear' ? .24 : .64)));
    g.addColorStop(.72, css(color, a));
    g.addColorStop(1, css(color, 0));
    return g;
  }

  // Deterministic clear-day sunlight state: gently evolves from crisp early afternoon toward warm golden late afternoon
  // across the track, breathing softly with musical warmth swells (zero randomness, zero extra audio work).
  function clearSunState(S, t) {
    const dur = Math.max(1, S.duration || 1);
    const progress = clamp(t / dur);
    const src = S.src, ids = src && src.ids ? src.ids : [];
    let sum = 0;
    for (let i = 0; i < ids.length; i++) sum += clamp((src.stemDb(ids[i], t, 2.4) + 46) / 32);
    const musicLift = ids.length ? sum / ids.length : .35;
    const warmth = clamp(.28 + .46 * progress + .26 * musicLift);
    const beam = clamp(.56 + .44 * musicLift);
    return {progress, musicLift, warmth, beam};
  }

  // Painterly afternoon solar bloom in the upper-right sky + crisp cerulean zenith depth + golden horizon air.
  function drawClearSkySun(ctx, L, t, sun) {
    if (!sun) return;
    const {progress, warmth, beam} = sun;
    const sunX = L.left + L.Wm * (.74 - .05 * progress) + Math.sin(t * .04) * 14;
    const sunY = 238 + 42 * progress;
    ctx.save();
    // 1. Subtle deep-blue clear-sky richness on the shaded upper-left side (amplifies warm-vs-cool sunny contrast).
    const zenith = ctx.createRadialGradient(L.left, 118, 0, L.left, 118, Math.min(980, L.Wm * .78));
    zenith.addColorStop(0, 'rgba(38,96,166,' + (.15 * (.9 - .2 * warmth)).toFixed(4) + ')');
    zenith.addColorStop(.55, 'rgba(54,114,178,' + (.06 * (.9 - .2 * warmth)).toFixed(4) + ')');
    zenith.addColorStop(1, 'rgba(54,114,178,0)');
    ctx.fillStyle = zenith;
    ctx.fillRect(L.left - 10, M_TOP - 10, L.Wm + 20, M_BOTTOM - M_TOP + 20);

    // 2. Luminous afternoon sun scatter in screen blend (visibly brightens upper-right sky without a harsh hard disc).
    ctx.globalCompositeOperation = 'screen';
    const bloom = ctx.createRadialGradient(sunX, sunY, 8, sunX, sunY, 680);
    bloom.addColorStop(0, 'rgba(255,250,228,' + (.52 * beam).toFixed(4) + ')');
    bloom.addColorStop(.20, 'rgba(255,234,182,' + (.32 * beam).toFixed(4) + ')');
    bloom.addColorStop(.52, 'rgba(255,212,148,' + (.14 * warmth).toFixed(4) + ')');
    bloom.addColorStop(1, 'rgba(255,202,134,0)');
    ctx.fillStyle = bloom;
    ctx.fillRect(L.left - 10, 120, L.Wm + 20, 620);

    // 3. Warm golden-hour horizon air wash hugging the distant mountain backs (smooth 0 -> peak -> 0).
    const hz = ctx.createLinearGradient(0, 320, 0, 670);
    hz.addColorStop(0, 'rgba(255,218,156,0)');
    hz.addColorStop(.54, 'rgba(255,214,146,' + (.19 * warmth).toFixed(4) + ')');
    hz.addColorStop(1, 'rgba(255,204,132,0)');
    ctx.fillStyle = hz;
    ctx.fillRect(L.left - 10, 320, L.Wm + 20, 350);
    ctx.restore();
  }

  // Painterly diagonal crepuscular sun-shafts (screen-blended Gaussian radial shafts -> zero hard edges) + warm sunlit prairie & glass sheen.
  function drawClearBeams(ctx, L, t, sun) {
    if (!sun) return;
    const {progress, warmth, beam} = sun;
    const beams = [
      {u: .73, y: 445, rx: .18, ry: 440, a: .165, phase: .4},
      {u: .54, y: 485, rx: .21, ry: 460, a: .130, phase: 2.3},
      {u: .34, y: 520, rx: .17, ry: 420, a: .095, phase: 4.5},
    ];
    ctx.save();
    ctx.globalCompositeOperation = 'screen';
    for (const b of beams) {
      const drift = Math.sin(t * .042 + b.phase) * 32;
      const bx = L.left + L.Wm * (b.u - .03 * progress) + drift;
      const pulse = .82 + .18 * Math.sin(t * .18 + b.phase * 1.7);
      const alpha = b.a * beam * pulse;
      ctx.save();
      ctx.translate(bx, b.y);
      ctx.rotate(-.52);
      ctx.scale(b.rx, 1);
      const g = ctx.createRadialGradient(0, 0, 10, 0, 0, b.ry);
      g.addColorStop(0, 'rgba(255,244,206,' + alpha.toFixed(4) + ')');
      g.addColorStop(.46, 'rgba(255,226,168,' + (alpha * .50).toFixed(4) + ')');
      g.addColorStop(1, 'rgba(255,214,148,0)');
      ctx.fillStyle = g;
      ctx.fillRect(-b.ry, -b.ry, b.ry * 2, b.ry * 2);
      ctx.restore();
    }
    // Gentle late-afternoon golden warmth kissing the foreground sunlit prairie grass (smooth 0 -> peak -> 0).
    const grass = ctx.createLinearGradient(0, 620, 0, 832);
    grass.addColorStop(0, 'rgba(255,220,148,0)');
    grass.addColorStop(.52, 'rgba(255,216,142,' + (.11 * warmth * beam).toFixed(4) + ')');
    grass.addColorStop(1, 'rgba(255,210,132,0)');
    ctx.fillStyle = grass;
    ctx.fillRect(L.left - 10, 620, L.Wm + 20, 212);

    // Whisper-soft warm afternoon reflection sliding slowly across clean glass as the train gently curves.
    const gx = L.left + L.Wm * (.52 + .24 * Math.sin(t * .11));
    ctx.save();
    ctx.translate(gx, 470);
    ctx.rotate(-.38);
    ctx.scale(.14, 1);
    const glA = .065 * (.7 + .3 * warmth);
    const gl = ctx.createRadialGradient(0, 0, 8, 0, 0, 390);
    gl.addColorStop(0, 'rgba(255,248,228,' + glA.toFixed(4) + ')');
    gl.addColorStop(1, 'rgba(255,248,228,0)');
    ctx.fillStyle = gl;
    ctx.fillRect(-390, -390, 780, 780);
    ctx.restore();
    ctx.restore();
  }

  // Delicate deterministic golden sunlit dust motes sparkling softly in the sunlit cabin air near the window & sill.
  const cabinMotes = Array.from({length: 24}, (_, i) => [hash(i, 911), hash(i, 919), hash(i, 929), hash(i, 937)]);
  let cabinMoteBrush;
  function drawCabinSunMotes(ctx, L, t, sun) {
    if (!sun) return;
    if (!cabinMoteBrush) {
      const c = makeCanvas(48, 48), g = c && c.getContext('2d');
      if (!g) return;
      const halo = g.createRadialGradient(24, 24, 0, 24, 24, 23);
      halo.addColorStop(0, 'rgba(255,250,224,1)');
      halo.addColorStop(.32, 'rgba(255,232,172,.63)');
      halo.addColorStop(1, 'rgba(255,216,144,0)');
      g.fillStyle = halo; g.fillRect(0, 0, 48, 48);
      cabinMoteBrush = c;
    }
    const {win, u} = L, {beam, warmth} = sun;
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    const alpha = ctx.globalAlpha;
    for (const [h1, h2, h3, h4] of cabinMotes) {
      // Concentrate motes along the diagonal sunlit band from upper-right across the foreground mountains toward the wooden sill.
      const baseU = .10 + .82 * h1;
      const bandY = .28 + .66 * (1 - baseU * .45) + (h2 - .5) * .34;
      const x = win.x + win.w * clamp(baseU + Math.sin(t * (.14 + .12 * h3) + h4 * 6.28) * .024);
      const y = win.y + win.h * clamp(bandY + Math.cos(t * (.11 + .10 * h2) + h1 * 6.28) * .028);
      const twinkle = .32 + .68 * Math.pow(.5 + .5 * Math.sin(t * (.85 + 1.1 * h3) + h4 * 12.5), 2);
      const a = (.16 + .25 * h2) * beam * twinkle;
      const r = (.9 + 1.1 * h4) * u;
      ctx.globalAlpha = alpha * a * (.96 + .07 * warmth);
      ctx.drawImage(cabinMoteBrush, x - r * 4, y - r * 4, r * 8, r * 8);
    }
    ctx.restore();
  }

  // Only the weather tint and light are live. All paint texture and joinery are in the overlay raster.
  function paintCarriageLighting(ctx, L, weather, sun) {
    const {u, w, h, header, cabin} = L;
    if (!cabin) return;
    const {glass, opening, shelf: {back, front}} = cabin;
    const B = glass.y + glass.h, G = glass.x + glass.w;
    const R = opening.x + opening.w, D = opening.y + opening.h;
    const {mode, bounce, shadow, flash, level} = cabinLight(weather, sun);
    const gloom = gloomOf(weather);
    const reflected = flash > .01 ? mixRgb(bounce, [207, 233, 255], flash) : bounce;
    const alpha = ctx.globalAlpha;
    ctx.save();

    if (gloom > .003) {
      cabinRect(ctx, glass);
      ctx.rect(0, 0, w, h);
      ctx.fillStyle = css(shadow, gloom * (mode === 'rain' ? .76 : .60));
      ctx.fill('evenodd');
    }

    // A broad sky reflection catches the lower reveal before it reaches the wood.
    const rise = mode === 'snow' || mode === 'sand' ? 13 * u : 9 * u;
    const tray = ctx.createLinearGradient(0, B, 0, front);
    tray.addColorStop(0, css(reflected, .51 * level + .38 * flash));
    tray.addColorStop(.30, css(reflected, (mode === 'snow' ? .90 : .54) * level + .22 * flash));
    tray.addColorStop(1, css(reflected, .06 * level + .05 * flash));
    ctx.fillStyle = tray;
    ctx.globalAlpha = alpha * REVEAL_FINISH.bottom.bounce;
    ctx.fillRect(glass.x + rise, B + CABIN_GASKET * u, glass.w - 2 * rise, Math.max(0, back - B - (CABIN_GASKET + CABIN_RIDGE) * u));
    ctx.globalAlpha = alpha;
    ctx.fillRect(opening.x, back, opening.w, Math.max(0, front - back));

    // The jambs carry the same reflected sky as the tabletop. Flash follows the rain state.
    const edge = ctx.createLinearGradient(0, glass.y, 0, B);
    edge.addColorStop(0, css(reflected, .03 * level + .13 * flash));
    edge.addColorStop(.68, css(reflected, .32 * level + .20 * flash));
    edge.addColorStop(1, css(reflected, .72 * level + .34 * flash));
    ctx.fillStyle = edge;
    ctx.globalAlpha = alpha * REVEAL_FINISH.left.bounce;
    ctx.fillRect(opening.x + 2 * u, glass.y + glass.r, Math.max(0, glass.x - opening.x - 8 * u), glass.h - 2 * glass.r);
    ctx.globalAlpha = alpha * REVEAL_FINISH.right.bounce;
    ctx.fillRect(G + 6 * u, glass.y + glass.r, Math.max(0, R - G - 8 * u), glass.h - 2 * glass.r);
    ctx.globalAlpha = alpha;

    if (mode === 'clear' && sun && front > back) {
      const edgeX = G + CABIN_GASKET * u;
      const wallEnd = Math.min(w, R + 9 * u);
      const start = glass.y + glass.h * .26;
      const light = ctx.createLinearGradient(G - glass.w * .56, back, wallEnd, B - glass.h * .3);
      const warmth = mixRgb([255, 234, 194], [255, 198, 128], sun.warmth);
      const power = sun.beam * (.32 + .13 * sun.warmth);
      light.addColorStop(0, css(warmth, power * .70));
      light.addColorStop(.62, css(warmth, power));
      light.addColorStop(1, css(warmth, power * .40));
      ctx.globalCompositeOperation = 'screen';
      ctx.fillStyle = light;
      ctx.beginPath();
      ctx.moveTo(edgeX, start);
      ctx.lineTo(wallEnd, start + glass.h * .19);
      ctx.lineTo(wallEnd, Math.min(front, Math.max(back, D)));
      ctx.lineTo(Math.min(w, wallEnd + 39 * u), front);
      ctx.lineTo(glass.x + glass.w * .21, front);
      ctx.lineTo(glass.x + glass.w * .09, back);
      ctx.lineTo(glass.x + glass.w * .055, B + 7 * u);
      ctx.lineTo(edgeX - glass.r, B + 5 * u);
      ctx.quadraticCurveTo(edgeX, B + 2 * u, edgeX, B - glass.r);
      ctx.closePath();
      ctx.fill();
      ctx.globalCompositeOperation = 'source-over';
    }

    if (front < h) {
      ctx.fillStyle = css(reflected, .33 * level + .20 * flash);
      ctx.fillRect(0, front, w, Math.min(1.1 * u, h - front));
    }
    // The housing casts a small amber reflection on the fixed panel below the display.
    const y = header.y + header.h + 2 * u;
    const spill = Math.min(12 * u, opening.y + 4 * u - y);
    if (spill > 1) {
      const glow = ctx.createLinearGradient(0, y, 0, y + spill);
      glow.addColorStop(0, css([244, 161, 73], .065 + .075 * gloom));
      glow.addColorStop(1, css([244, 161, 73], 0));
      ctx.fillStyle = glow;
      ctx.fillRect(header.x, y, header.w, spill);
    }
    ctx.restore();
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

  const mixRgb = (a, b, k) => [Math.round(lerp(a[0], b[0], k)), Math.round(lerp(a[1], b[1], k)), Math.round(lerp(a[2], b[2], k))];
  const radioDecks = new Map();
  const RADIO_PLASTIC = {top:[204,188,153], face:[181,162,129], shade:[145,128,103], edge:[101,85,67]};
  function radioStroke(g, color, width, points) {
    g.strokeStyle=color; g.lineWidth=width; g.beginPath(); g.moveTo(points[0],points[1]);
    for(let i=2;i<points.length;i+=2)g.lineTo(points[i],points[i+1]);
    g.stroke();
  }
  function radioPatch(g, color, points) {
    g.fillStyle=color; g.beginPath(); g.moveTo(points[0],points[1]);
    for(let i=2;i<points.length;i+=2)g.lineTo(points[i],points[i+1]);
    g.closePath(); g.fill();
  }
  function radioBox(g,color,x,y,w,h,r) {
    g.fillStyle=color; roundRect(g,x,y,w,h,r); g.fill();
  }
  function radioDisc(g,color,x,y,r) {
    g.fillStyle=color;g.beginPath();g.arc(x,y,r,0,Math.PI*2);g.fill();
  }
  function radioSpeaker(g, ink) {
    const x=43,y=37,r=28.4;
    radioDisc(g,ink([102,86,68]),x+1,y+1.3,r+1.6);
    radioDisc(g,ink([72,66,56]),x,y,r+1.2);
    const lip=g.createLinearGradient(x-r,y-r,x+r,y+r);
    lip.addColorStop(0,ink([224,211,180]));lip.addColorStop(.41,ink([173,163,139]));lip.addColorStop(.75,ink([86,81,70]));lip.addColorStop(1,ink([145,135,111]));
    radioDisc(g,lip,x,y,r+.5);radioDisc(g,ink([69,62,53]),x,y,r-1.3);
    const mesh=g.createLinearGradient(x-23,y-26,x+22,y+30);
    mesh.addColorStop(0,ink([155,145,120]));mesh.addColorStop(.46,ink([128,119,96]));mesh.addColorStop(1,ink([99,89,73]));
    radioDisc(g,mesh,x,y,r-2.1);
    // Staggered stamping reveals the shadow of the cone underneath the metal mesh.
    for(const rim of [false,true]){
      g.fillStyle=ink(rim?[77,70,55]:[45,42,35]);g.beginPath();
      for(let row=-9;row<=9;row++)for(let col=-9;col<=9;col++){
        const dx=(col+(Math.abs(row)%2)*.5)*3.25,dy=row*2.8,dist=dx*dx+dy*dy;
        if(dist>24.5*24.5 || (dist>20.7*20.7)!==rim)continue;
        const hr=(rim?.85:1.06)+(dx+dy)*.0018;
        g.moveTo(x+dx+hr,y+dy);g.arc(x+dx,y+dy,hr,0,2*Math.PI);
      }
      g.fill();
    }
    g.strokeStyle=ink([213,197,162]);g.lineWidth=.65;g.beginPath();g.arc(x-.2,y-.3,r,-2.92,-1.55);g.stroke();
    g.strokeStyle=ink([91,84,69]);g.lineWidth=.55;g.beginPath();g.arc(x,y,r-2.5,.15,1.52);g.stroke();
  }
  function radioKnob(g,x,y,r,angle,ink) {
    const ring=g.createLinearGradient(x-r,y-r,x+r,y+r);
    ring.addColorStop(0,ink([205,187,149]));ring.addColorStop(.4,ink([142,124,98]));ring.addColorStop(1,ink([208,192,153]));
    radioDisc(g,ring,x+.1,y+.3,r+2.2);
    radioDisc(g,'rgba(40,32,26,.52)',x+1.3,y+1.4,r+.8);
    radioDisc(g,ink([59,54,46]),x,y,r);
    for(let i=0;i<20;i++){
      const a=i*Math.PI/10,cs=Math.cos(a),sn=Math.sin(a);
      radioStroke(g,ink(cs+sn<0?[147,138,113]:[95,85,67]),.85,[x+cs*(r-2),y+sn*(r-2),x+cs*(r-.35),y+sn*(r-.35)]);
    }
    const cap=g.createLinearGradient(x-r*.6,y-r*.7,x+r*.7,y+r);
    cap.addColorStop(0,ink([207,195,164]));cap.addColorStop(.5,ink([170,157,131]));cap.addColorStop(1,ink([124,111,92]));
    radioDisc(g,cap,x-.35,y-.55,r*.75);
    radioStroke(g,ink([68,60,47]),1.4,[x+.9*Math.cos(angle),y+.9*Math.sin(angle),x+r*.61*Math.cos(angle),y+r*.61*Math.sin(angle)]);
  }
  function radioHandle(g,ink){
    const span=RADIO.width;
    const bail=(dy,color,weight)=>{
      g.strokeStyle=color;g.lineWidth=weight;g.beginPath();g.moveTo(6,10+dy);
      g.lineTo(9,1+dy);g.bezierCurveTo(13,-6+dy,29,-9.8+dy,46,-9.8+dy);
      g.lineTo(span-47,-9.8+dy);g.bezierCurveTo(span-25,-9.8+dy,span-13,-5+dy,span-9,1+dy);g.lineTo(span-6,10+dy);g.stroke();
    };
    bail(.6,ink([61,57,49]),3.6);bail(-.15,ink([167,168,154]),2.3);bail(-.85,ink([218,211,187]),.7);
    radioBox(g,ink([76,66,54]),209,-RADIO.handleRise,174,4.9,2.3);
    radioPatch(g,ink([124,108,85]),[212,-12,379,-12,382,-11,375,-10.6,213,-10.9]);
    for(const x of [210,378])radioBox(g,ink([177,170,149]),x,-12,2,4,1);
    for(const x of [6,span-6]){
      radioBox(g,ink([114,99,79]),x-3,3,6,13,2.5);
      radioDisc(g,ink([69,62,52]),x,10,3.05);radioDisc(g,ink([178,173,151]),x-.45,9.6,2);
      radioStroke(g,ink([96,86,70]),.65,[x-1,10.2,x+.9,9.1]);
    }
  }
  function radioAerial(g,ink){
    // Telescoping sections decrease in diameter towards the capped tip. The saddle grips the narrow end.
    radioStroke(g,'rgba(56,45,34,.33)',2.5,[158,4.6,535,6.5,552,5.8]);
    radioBox(g,ink([87,79,64]),537,1.15,17,5.2,2);radioDisc(g,ink([154,147,124]),541,3.1,2);
    for(const [a,b,gauge] of [[155,258,1.2],[257,386,1.75],[385,539,2.45]]){
      const y=2.1+(a-155)*.002;
      radioStroke(g,ink([82,79,68]),gauge+.55,[a,y+.5,b,y+.75]);
      radioStroke(g,ink([188,187,164]),gauge*.65,[a,y,b,y+.28]);
      radioStroke(g,ink([221,214,183]),.4,[a+1,y-.2,a+(b-a)*.62,y-.08]);
      radioBox(g,ink([111,104,87]),b-2,y-.7,2.1,gauge+.55,.5);
    }
    radioDisc(g,ink([199,191,165]),155,2.1,1.35);
    radioBox(g,ink([106,93,76]),177,1.8,4.1,3.1,1);
    radioStroke(g,ink([213,199,166]),.65,[177.2,2.1,178.2,.95,180.4,1.15,181,2.5]);
  }
  function radioScale(g,ink) {
    const x=RADIO.screenX, w=RADIO.screenWidth;
    radioBox(g,ink([140,123,95]),x-1,57.7,w+2,8.9,2.5);
    radioBox(g,ink([67,61,48]),x,58.4,w,6.5,1.7);
    radioStroke(g,ink([95,85,66]),.6,[x+4,63.2,x+w-4,63.2]);
    g.fillStyle=ink([195,181,146]);
    for(let i=0;i<81;i++){
      const h=i%5===0?3.4:i%2===0?2.1:1.25;
      g.fillRect(x+8+i*(w-16)/80,63.1-h,i%5===0?.9:.68,h);
    }
    radioPatch(g,ink([178,98,64]),[x+w*.61,58.6,x+w*.61+2.4,58.6,x+w*.61+1.6,64.7,x+w*.61+.55,64.7]);
    radioStroke(g,ink([190,170,132]),.55,[x+5,65.8,x+w-4,65.8]);
  }
  function paintRadio(g,light,gloom,woodEdge){
    const W=RADIO.width,H=RADIO.height,mode=light.mode;
    const tint={clear:[131,111,87],rain:[42,54,64],snow:[74,87,101],sand:[73,69,64]}[mode];
    const shade=(mode==='clear'?0:mode==='rain'?.48:mode==='snow'?.31:.37)+gloom*.16;
    const ink=c=>css(mixRgb(c,tint,shade));
    const cast=g.createLinearGradient(0,52,0,woodEdge);
    cast.addColorStop(0,'rgba(46,35,27,.23)');cast.addColorStop(.77,'rgba(40,30,23,.49)');cast.addColorStop(1,'rgba(50,40,31,0)');
    radioPatch(g,cast,[4,50,W-3,35,W+16,54,W+23,woodEdge-1,22,woodEdge,7,72]);
    for(const x of [26,W-66]){
      const contact=g.createLinearGradient(0,68,0,woodEdge);
      contact.addColorStop(0,'rgba(34,26,20,.83)');contact.addColorStop(.55,'rgba(43,32,24,.44)');contact.addColorStop(1,'rgba(49,37,28,0)');
      radioBox(g,contact,x-3,68,48,woodEdge-68,2.3);
      radioBox(g,ink([47,43,36]),x,H-2,39,2+RADIO.feetDrop,1.7);
      radioStroke(g,ink([109,98,77]),.8,[x+3,70.1,x+30,70.1]);
    }
    radioPatch(g,ink(RADIO_PLASTIC.edge),[0,9,5,1,10,0,W-10,0,W-6,1,W,8,W,62,W-3,67,W-8,H,7,H,2,66]);
    const top=g.createLinearGradient(0,0,W,8);
    top.addColorStop(0,ink(RADIO_PLASTIC.top));top.addColorStop(.57,ink([190,173,141]));top.addColorStop(1,ink(RADIO_PLASTIC.shade));
    radioPatch(g,top,[1,9,6,1,11,.5,W-11,.5,W-6,2,W-1,8,W-4,10,3,11]);
    const face=g.createLinearGradient(W*.19,9,W*.79,69);
    face.addColorStop(0,ink(RADIO_PLASTIC.face));face.addColorStop(.58,ink([170,149,117]));face.addColorStop(1,ink(RADIO_PLASTIC.shade));
    radioBox(g,face,1.3,6.6,W-3,60.8,5.3);
    g.save();roundRect(g,1.3,6.6,W-3,60.8,5.3);g.clip();
    // A broken diagonal of afternoon light, dry strokes and just a few scuffed corners.
    radioPatch(g,'rgba(255,233,186,.105)',[0,4,166,4,128,34,83,57,74,63,34,70,0,70]);
    radioPatch(g,'rgba(64,55,48,.095)',[W-87,6,W,6,W,70,W-143,70,W-129,47]);
    let seed=1857;
    const noise=()=>{seed=(Math.imul(seed,1664525)+1013904223)>>>0;return seed/4294967296;};
    for(let i=0;i<160;i++){
      const x=noise()*W,y=7+noise()*60,len=1+noise()*9;
      radioStroke(g,i%3?'rgba(255,236,194,.075)':'rgba(69,57,47,.10)',.45+noise()*.45,[x,y,x+len*.4,y-.22,x+len,y+.12]);
    }
    radioPatch(g,ink([147,127,97]),[1,60,3,62,7,64,5,65,1,64]);
    radioPatch(g,ink([201,183,147]),[2,60,7,63.7,4,63.4]);
    radioStroke(g,ink([142,122,97]),.55,[64,61,73,59.8,76,59.7]);
    radioStroke(g,ink([191,172,137]),.6,[W-16,13,W-13,10.5]);
    g.restore();
    radioStroke(g,ink([196,177,141]),1.15,[3,8.5,9,7.2,128,7.1,214,7.4]);
    radioStroke(g,ink([94,81,64]),.8,[9,4.7,134,4.6,336,5.1,W-9,5.35,W-4,11]);
    radioStroke(g,ink([119,101,77]),1,[6,65.8,25,67,W-10,67,W-5,65.8]);
    // The lowered bail casts a narrow broken shadow onto the back/top face.
    radioPatch(g,'rgba(62,51,38,.19)',[5,2,37,.65,W-33,.8,W-8,2.1,W-19,3.1,W-40,2.2,44,1.9,11,3.3]);
    radioHandle(g,ink);radioAerial(g,ink);
    radioBox(g,ink([115,98,76]),RADIO.screenX-4,RADIO.screenY-2.4,RADIO.screenWidth+8,RADIO.screenHeight+5,4.4);
    radioBox(g,ink([50,49,41]),RADIO.screenX-2.4,RADIO.screenY-1.5,RADIO.screenWidth+4.8,RADIO.screenHeight+3.4,3.3);
    radioScale(g,ink);radioSpeaker(g,ink);
    radioKnob(g,568,23.5,10.7,-2.07,ink);radioKnob(g,568,51.7,10.1,-.86,ink);
    const spill=g.createLinearGradient(0,H+.4,0,woodEdge);
    spill.addColorStop(0,'rgba(100,175,156,'+(mode==='clear'?.07:.115)+')');spill.addColorStop(1,'rgba(100,175,156,0)');
    g.fillStyle=spill;g.fillRect(RADIO.screenX,H+.4,RADIO.screenWidth,woodEdge-H-.4);
  }
  function drawVfdDeck(ctx,L,weather,dpr,sun){
    const deck=L.sillDeck,u=L.cabin.deckUnit;
    const light=cabinLight(weather,sun),gloom=Math.round(gloomOf(weather)*4)/4;
    const key=[deck.w,dpr,light.mode,gloom].join('|');
    let sprite=radioDecks.get(key);
    if(!sprite){
      const left=2,top=15,woodEdge=(L.cabin.shelf.front-deck.y)/u;
      const w=Math.ceil((RADIO.width+left+25)*u*dpr),h=Math.ceil((top+woodEdge)*u*dpr);
      const c=makeCanvas(w,h),g=c&&c.getContext('2d');
      if(!g)return;
      g.setTransform(u*dpr,0,0,u*dpr,left*u*dpr,top*u*dpr);
      paintRadio(g,light,gloom,woodEdge);
      sprite={c,dx:left*u,dy:top*u,w:w/dpr,h:h/dpr};
      if(radioDecks.size>=16)radioDecks.delete(radioDecks.keys().next().value);
      radioDecks.set(key,sprite);
    }
    ctx.drawImage(sprite.c,deck.x-sprite.dx,deck.y-sprite.dy,sprite.w,sprite.h);
  }

  // Deterministic 10-band musical VFD VU meter + section tag for instrumental / no-lyric standby mode.
  function vfdStandby(S, sections) {
    const src = S.src, t = S.time, duration = S.duration;
    const ids = src && src.ids ? src.ids : [];
    const stemLvl = id => clamp((src.stemDb(id, t, .28) + 48) / 34);
    const raw = ids.length ? ids.map(stemLvl) : [0];
    const mean = raw.reduce((a, b) => a + b, 0) / raw.length;
    // Brief deterministic percussive lift when a drum hit lands within 0.14 s before song time.
    let kick = 0;
    if (src && src.hitTimes && src.hitTimes.length) {
      const idx = firstAt(src.hitTimes, t + .01) - 1;
      if (idx >= 0) { const dt = t - src.hitTimes[idx]; if (dt >= 0 && dt < .16) kick = (1 - dt / .16) * .28; }
    }
    const bars = [];
    for (let i = 0; i < 10; i++) {
      const pos = raw.length > 1 ? i / 9 * (raw.length - 1) : 0;
      const lo = Math.floor(pos), hi = Math.min(raw.length - 1, lo + 1);
      const base = lerp(raw[lo], raw[hi], pos - lo);
      const motion = .76 + .24 * Math.sin(t * (3.1 + i * .83) + i * 1.67);
      const hitBoost = i < 3 ? kick : i > 6 ? kick * .65 : kick * .35;
      bars.push(clamp((base * .78 + mean * .22) * motion + (mean > .04 ? hitBoost : 0)));
    }
    let cur = '';
    for (const s of sections) if (t >= s[0] && t < s[1]) { cur = s[2]; break; }
    if (!cur && sections.length && t >= sections[sections.length - 1][0]) cur = sections[sections.length - 1][2];
    return {bars, tag: cur || 'INSTRUMENTAL', time: t, duration};
  }
  function refCurtainShapes(L) {
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
  const drapeCurve = (t, [a, b, c, d]) => {
    const v = 1 - t;
    return v * v * (v * a + 3 * t * b) + t * t * (3 * v * c + t * d);
  };
  function curtainShapes(L) {
    const {opening, glass, shelf} = L.cabin, {u} = L;
    const top = opening.y - 5 * u;
    const leftInset = glass.x / u;
    const rightInset = (L.w - glass.x - glass.w) / u;
    // Each outline is its own curve, measured from the side of the carriage.
    // The upper fabric pulls into the wrap; below it the loose folds open toward the sill.
    const side = (s, rise, gather, outer, inner) => {
      const wall = s > 0 ? 0 : L.w;
      const bot = lerp(shelf.back, shelf.front, rise), tie = lerp(top, bot, gather);
      const edge = (y, [upper, lower]) => wall + s * u * (y < tie
        ? drapeCurve(clamp((y - top) / (tie - top)), upper)
        : drapeCurve(clamp((y - tie) / (bot - tie)), lower));
      const xo = y => edge(y, outer), xi = y => edge(y, inner);
      const hem = p => {
        const shape = s > 0 ? 4.6 + 1.9 * Math.sin(17 * p + .5) - 1.2 * p : 3.2 + 2.7 * Math.sin(14 * p - .7) + 1.2 * p;
        return bot + u * Math.sin(Math.PI * p) * shape;
      };
      return {s, top, bot, tie, xo, xi, hem, w: y => s * (xi(y) - xo(y))};
    };
    return {top, sides: [
      side(1, .66, .605, [[5, 3, 16, 20], [20, 17, 4, 6]], [[leftInset - 2.5, leftInset - 7, 66, 51], [51, 52, 88, 97]]),
      side(-1, .73, .58, [[8, 6, 7, 18], [18, 22, 9, 8]], [[rightInset - 3.5, rightInset - 5, 56, 51], [51, 47, 70, 96]])
    ]};
  }
  function curtainSilhouette(g, S, u) {
    const {top, bot} = S;
    g.beginPath();
    g.moveTo(S.xi(top), top);
    for (let y = top + 5 * u; y < bot; y += 5 * u) g.lineTo(S.xi(y), y);
    for (let i = 32; i >= 0; i--) {
      const p = i / 32;
      g.lineTo(lerp(S.xo(bot), S.xi(bot), p), S.hem(p));
    }
    for (let y = bot - 5 * u; y > top; y -= 5 * u) g.lineTo(S.xo(y), y);
    g.lineTo(S.xo(top), top); g.closePath();
  }
  function makeCabinDrapes(L, dpr) {
    const {u} = L, drapes = [];
    for (const S of curtainShapes(L).sides) {
      let left = Math.min(S.xo(S.top), S.xo(S.bot)), right = Math.max(S.xo(S.top), S.xo(S.bot));
      for (let y = S.top; y <= S.bot + 4 * u; y += 4 * u) {
        left = Math.min(left, S.xo(y), S.xi(y));
        right = Math.max(right, S.xo(y), S.xi(y));
      }
      // Leave room for the offset wall shadow, its soft edge, and contact under the hem.
      const x = Math.floor(Math.max(0, left - 35 * u) * dpr) / dpr;
      const y = Math.floor(Math.max(0, S.top - 24 * u) * dpr) / dpr;
      const end = Math.min(L.w, right + 35 * u), bottom = Math.min(L.h, S.bot + 28 * u);
      const canvas = makeCanvas((end - x) * dpr, (bottom - y) * dpr);
      const g = canvas?.getContext('2d');
      if (!g) continue;
      g.setTransform(dpr, 0, 0, dpr, -x * dpr, -y * dpr);
      paintCabinDrape(g, L, S, dpr, x, y);
      drapes.push({canvas, x, y, w: canvas.width / dpr, h: canvas.height / dpr, side: S.s});
    }
    return drapes;
  }

  function paintCabinDrape(g, L, S, dpr, localX, localY) {
    const {glass, shelf} = L.cabin, {u} = L;
    g.save();
    roundRect(g, glass.x, glass.y, glass.w, glass.h, glass.r);
    g.rect(0, 0, L.w, L.h); g.clip('evenodd');
    g.save();
    const dx = (S.s > 0 ? 13 : 9) * u + S.top * .006 - localX;
    g.setTransform(dpr, 0, -.006 * dpr, dpr, dx * dpr, (7 * u - localY) * dpr);
    g.filter = 'blur(' + (6 * u * dpr).toFixed(2) + 'px)';
    g.fillStyle = 'rgba(15,12,12,.42)';
    curtainSilhouette(g, S, u); g.fill();
    g.restore();
    g.beginPath(); g.rect(0, shelf.back, L.w, shelf.front - shelf.back); g.clip();
    const contact = (p, rw, rh, lift, opacity) => {
      const x = lerp(S.xo(S.bot), S.xi(S.bot), p);
      g.save();
      g.translate(x + 5 * u, S.hem(p) + lift * u);
      g.scale(rw * S.w(S.bot), rh * u);
      const fade = g.createRadialGradient(0, 0, 0, 0, 0, 1);
      fade.addColorStop(0, css([15, 10, 8], opacity));
      fade.addColorStop(.57, css([15, 10, 8], opacity * .53));
      fade.addColorStop(1, 'rgba(15,10,8,0)');
      g.fillStyle = fade; g.fillRect(-1, -1, 2, 2);
      g.restore();
    };
    contact(.51, .68, 9, 2.6, .61);
    contact(S.s > 0 ? .42 : .59, .42, 4.1, 1, .66);
    g.restore();

    cloth(g, S, u, dpr);
    paintClothTie(g, S, u);
    const x0 = Math.min(S.xo(S.top), S.xi(S.top)) - 5 * u;
    const width = S.w(S.top) + 10 * u;
    const rail = pic('carriage/curtain-rail-a');
    if (rail) {
      const f = 5 * u / 44;
      tileX(g, rail, x0, x0 + width, S.top - 3 * u - 10 * f, f);
    } else {
      const rod = g.createLinearGradient(0, S.top - 3 * u, 0, S.top + 2 * u);
      rod.addColorStop(0, '#858781'); rod.addColorStop(.42, '#564f45'); rod.addColorStop(1, '#312c2a');
      roundRect(g, x0, S.top - 3 * u, width, 5 * u, 2.2 * u);
      g.fillStyle = rod; g.fill();
    }
    g.strokeStyle = 'rgba(155,150,132,.36)'; g.lineWidth = Math.max(.65, u);
    for (const p of S.s > 0 ? [.055, .25, .48, .71, .94] : [.06, .29, .55, .79, .945]) {
      const x = lerp(S.xo(S.top), S.xi(S.top), p);
      g.beginPath(); g.ellipse(x, S.top + .8 * u, 1.85 * u, 4.6 * u, .14 * S.s, 0, Math.PI * 2); g.stroke();
    }
  }

  function drawCabinDrapes(g, drapes, weather, sun) {
    const {mode, bounce, shadow, flash} = cabinLight(weather, sun);
    const flashStep = Math.round(flash * 12);
    const key = mode + ':' + flashStep;
    for (const D of drapes) {
      const {canvas, x, y, w, h} = D;
      let image = canvas;
      if (mode !== 'clear') {
        const tint = D.tint ?? (D.tint = makeCanvas(canvas.width, canvas.height));
        if (tint && D.tintKey !== key) {
          const c = tint.getContext('2d');
          c.globalCompositeOperation = 'copy';
          c.drawImage(canvas, 0, 0);
          c.globalCompositeOperation = 'source-atop';
          c.fillStyle = css(shadow, mode === 'rain' ? .42 : .27);
          c.fillRect(0, 0, tint.width, tint.height);
          const flashLight = flashStep / 12;
          const tone = flashStep ? mixRgb(bounce, [207, 233, 255], flashLight) : bounce;
          const glow = c.createLinearGradient(D.side > 0 ? 0 : tint.width, 0, D.side > 0 ? tint.width : 0, tint.height * .6);
          glow.addColorStop(0, css(tone, .01 + .08 * flashLight));
          glow.addColorStop(1, css(tone, (mode === 'rain' ? .10 : .16) + .23 * flashLight));
          c.fillStyle = glow; c.fillRect(0, 0, tint.width, tint.height);
          c.globalCompositeOperation = 'source-over';
          D.tintKey = key;
        }
        if (tint) image = tint;
      }
      g.drawImage(image, x, y, w, h);
    }
  }
  function cabinOverlay(w, h, dpr, includeDrapes = true) {
    ART = artNow();
    const R = rasters(layout(w, h), BASE, dpr);
    if (!R || !includeDrapes || !R.drapes.length) return R && R.overlay;
    if (!R.combinedOverlay) {
      const canvas = makeCanvas(R.overlay.width, R.overlay.height);
      const g = canvas.getContext('2d');
      g.drawImage(R.overlay, 0, 0);
      g.setTransform(dpr, 0, 0, dpr, 0, 0);
      drawCabinDrapes(g, R.drapes);
      R.combinedOverlay = canvas;
    }
    return R.combinedOverlay;
  }
  function paintClothTie(g, S, u) {
    const {s, tie} = S, x = S.xo(tie);
    g.save();
    g.translate(x, tie); g.scale(s, 1);
    const w = S.w(tie);
    const outside = (s > 0 ? -5 : -7) * u, inside = (s > 0 ? -7.5 : -3.5) * u;
    const upperEdge = offset => {
      g.beginPath(); g.moveTo(-.5 * u, outside + offset);
      g.bezierCurveTo(.21 * w, outside + offset + 3.4 * u,
        .72 * w, inside + offset + 4.8 * u, w - .4 * u, inside + offset);
    };
    // The dark roundover is the part of the wrap where it turns behind the bundle.
    upperEdge(8.4 * u);
    g.lineCap = 'round'; g.lineWidth = 8 * u; g.strokeStyle = 'rgba(11,13,16,.56)'; g.stroke();
    upperEdge(0);
    g.bezierCurveTo(w + 2.8 * u, inside + u, w + 2.4 * u, inside + 7.4 * u, w - .8 * u, inside + 9.1 * u);
    g.bezierCurveTo(.73 * w, inside + 15 * u, .2 * w, outside + 15.1 * u, -.75 * u, outside + 9.1 * u);
    g.bezierCurveTo(-3.6 * u, outside + 7 * u, -2.8 * u, outside + 2.1 * u, -.5 * u, outside);
    g.closePath();
    const band = g.createLinearGradient(-.08 * w, -7.5 * u, .12 * w, 9.5 * u);
    band.addColorStop(0, '#57584f'); band.addColorStop(.31, '#53554f');
    band.addColorStop(.58, '#424947'); band.addColorStop(.84, '#353c3f'); band.addColorStop(1, '#272e32');
    g.fillStyle = band; g.fill();
    upperEdge(.9 * u);
    g.lineWidth = 1.25 * u; g.strokeStyle = 'rgba(177,162,132,.48)'; g.stroke();
    // A short tucked end and an uneven fold where the two ends cross.
    g.save();
    g.translate((s > 0 ? 4.3 : 6.5) * u, s > 0 ? 1.5 * u : -.25 * u);
    g.rotate(s > 0 ? -.26 : .38);
    g.beginPath(); g.moveTo(-2.4 * u, -.4 * u);
    g.bezierCurveTo(2 * u, -.8 * u, 4.8 * u, 4.4 * u, 3.6 * u, 7.9 * u);
    g.bezierCurveTo(2.8 * u, 9.3 * u, .25 * u, 11.7 * u, -.9 * u, 10.1 * u);
    g.bezierCurveTo(.35 * u, 6.2 * u, -2.1 * u, 5.1 * u, -2.4 * u, -.4 * u);
    g.fillStyle = '#353a39'; g.fill();
    g.beginPath(); g.moveTo(-3.7 * u, -.7 * u);
    g.bezierCurveTo(-3.9 * u, -4.4 * u, 3.5 * u, -4.5 * u, 4.8 * u, -.3 * u);
    g.bezierCurveTo(5.1 * u, 3.2 * u, .4 * u, 5.2 * u, -2.5 * u, 3.5 * u);
    g.bezierCurveTo(-4.1 * u, 2.2 * u, -3.9 * u, .2 * u, -3.7 * u, -.7 * u);
    g.fillStyle = '#5d5c51'; g.fill();
    g.beginPath(); g.moveTo(-2.6 * u, -.7 * u);
    g.quadraticCurveTo(-.4 * u, -2.5 * u, 2.6 * u, -1.4 * u);
    g.lineWidth = u; g.strokeStyle = 'rgba(176,158,128,.48)'; g.stroke();
    g.restore();
    g.restore();
  }
  const drapeTextureBounds = new WeakMap();
  function paintDrapeTexture(g, S, art, u, dpr) {
    let bounds = drapeTextureBounds.get(art);
    if (!bounds) {
      const c = makeCanvas(art.w, art.h);
      const ctx = c?.getContext('2d', {willReadFrequently: true});
      if (typeof ctx?.getImageData !== 'function') return;
      ctx.drawImage(art.img, 0, 0);
      const rgba = ctx.getImageData(0, 0, art.w, art.h).data;
      bounds = Array.from({length: art.h}, (_, y) => {
        const start = y * art.w * 4 + 3;
        let left = 0, right = art.w - 1;
        while (left < right && rgba[start + left * 4] < 233) left++;
        while (right > left && rgba[start + right * 4] < 233) right--;
        return [left + 1, right - 1];
      });
      drapeTextureBounds.set(art, bounds);
    }
    const {top, tie, bot} = S;
    const [head, tieTop, tieBottom, hem] = DRAPE_ROWS[S.s > 0 ? 0 : 1];
    const headingEnd = top + 24 * u, clothBottom = bot + 6 * u;
    const scale = art.h / art.oh;
    const textureRow = y => scale * (y < headingEnd
      ? lerp(105, head, clamp((y - top) / (headingEnd - top)))
      : y < tie ? lerp(head, tieTop - 1, (y - headingEnd) / (tie - headingEnd))
        : lerp(tieBottom + 1, hem - 48, clamp((y - tie) / (bot - tie))));
    // Align the strips to raster pixels. Following both painted edges keeps the original broad lobes
    // and turns them with the new cut of the fabric. Skip the flat band painted into the source.
    const stride = Math.max(1, Math.round(1.35 * u * dpr));
    const end = Math.ceil(clothBottom * dpr);
    g.globalAlpha = .94;
    for (let i = Math.floor(top * dpr); i < end; i += stride) {
      const y = i / dpr, h = Math.min(stride, end - i) / dpr, mid = y + h / 2;
      const sample = textureRow(mid), [left, right] = bounds[Math.round(sample)];
      if (right <= left) continue;
      const rows = Math.max(1, h * scale * (mid < tie ? (tieTop - head) / (tie - headingEnd) : (hem - tieBottom) / (bot - tie)));
      const x = Math.min(S.xo(mid), S.xi(mid));
      g.drawImage(art.img, left, sample - rows / 2, right - left + 1, rows,
        x - 1.15 * u, y, S.w(mid) + 2.3 * u, h);
    }
    g.globalAlpha = 1;
  }
  const DRAPE_LIGHT = [130, 145, 151], DRAPE_SHADE = [11, 18, 29], DRAPE_WARMTH = [188, 153, 107];
  // Each stroke has a separate course and width, in fractions of the visible cloth from the wall in.
  // The lower paint is shaped independently because it hangs without the tension of the head.
  const DRAPE_WASHES = [
    [
      [
        [[.20, .09, .26, .38], [.11, .17, .13, .04], DRAPE_SHADE, .24],
        [[.50, .61, .38, .52], [.12, .21, .14, .055], DRAPE_LIGHT, .15],
        [[.73, .73, .66, .67], [.075, .17, .08, .025], DRAPE_SHADE, .28],
        [[.98, .99, .98, .94], [.08, .035, .065, .035], DRAPE_WARMTH, .19]
      ],
      [
        [[.18, .19, .31, .38], [.08, .18, .17, .09], DRAPE_SHADE, .34],
        [[.58, .40, .66, .67], [.10, .12, .20, .15], DRAPE_LIGHT, .19],
        [[.92, .73, .90, .95], [.06, .07, .12, .075], DRAPE_WARMTH, .13]
      ]
    ],
    [
      [
        [[.21, .23, .09, .24], [.10, .12, .23, .045], DRAPE_SHADE, .23],
        [[.54, .33, .62, .51], [.14, .20, .105, .05], DRAPE_LIGHT, .16],
        [[.82, .68, .83, .72], [.08, .14, .12, .06], DRAPE_SHADE, .25],
        [[1.02, .96, .99, .91], [.18, .12, .08, .075], DRAPE_WARMTH, .18]
      ],
      [
        [[.14, .25, .07, .19], [.10, .17, .15, .14], DRAPE_SHADE, .16],
        [[.46, .54, .37, .50], [.085, .12, .155, .16], DRAPE_SHADE, .32],
        [[.81, .76, .93, .79], [.13, .21, .18, .19], DRAPE_LIGHT, .175],
        [[.95, .89, .99, .96], [.075, .11, .09, .08], DRAPE_WARMTH, .22]
      ]
    ]
  ];
  function paintDrapeFolds(g, S, u, art) {
    const [upper, lower] = DRAPE_WASHES[S.s > 0 ? 0 : 1];
    const wash = (strokes, from, end) => {
      for (const [course, widths, rgb, opacity] of strokes) {
        const point = (i, sign) => {
          const p = i / 28, y = lerp(from, end, p);
          const width = drapeCurve(p, widths) * sign;
          g.lineTo(lerp(S.xo(y), S.xi(y), drapeCurve(p, course) + width), y);
        };
        g.beginPath();
        for (let i = 0; i <= 28; i++) point(i, -1);
        for (let i = 28; i >= 0; i--) point(i, 1);
        g.closePath();
        const alpha = opacity * (art ? .77 : 1.24);
        const wash = g.createLinearGradient(0, from, 0, end);
        wash.addColorStop(0, css(rgb, .05 * alpha));
        wash.addColorStop(.32, css(rgb, .85 * alpha));
        wash.addColorStop(.67, css(rgb, alpha));
        wash.addColorStop(1, css(rgb, .32 * alpha));
        g.fillStyle = wash; g.fill();
      }
    };
    wash(upper, S.top + 18 * u, S.tie);
    wash(lower, S.tie - 3 * u, S.bot + 6 * u);
  }
  function cloth(g, S, u, dpr) {
    const {top, bot, tie, s} = S;
    const x0 = Math.min(S.xo(top), S.xi(top)) - 20 * u;
    const x1 = Math.max(S.xo(top), S.xi(top)) + 20 * u;
    const base = g.createLinearGradient(x0, top, x1, bot);
    base.addColorStop(0, s > 0 ? '#48515a' : '#4a5159');
    base.addColorStop(.57, '#2d3847');
    base.addColorStop(1, '#49505a');
    g.save();
    curtainSilhouette(g, S, u); g.clip();
    g.fillStyle = base; g.fillRect(x0, top, x1 - x0, bot - top + 6 * u);
    const art = pic(s > 0 ? 'carriage/curtain-left-a' : 'carriage/curtain-right-a');
    if (art) paintDrapeTexture(g, S, art, u, dpr);
    paintDrapeFolds(g, S, u, art);

    const pinch = g.createLinearGradient(0, tie - 36 * u, 0, tie + 38 * u);
    pinch.addColorStop(0, 'rgba(13,17,23,0)');
    pinch.addColorStop(.47, 'rgba(13,17,23,.32)');
    pinch.addColorStop(.54, 'rgba(13,17,23,.29)');
    pinch.addColorStop(1, 'rgba(13,17,23,0)');
    g.fillStyle = pinch; g.fillRect(x0, tie - 36 * u, x1 - x0, 74 * u);
    const hemShade = g.createLinearGradient(0, bot - 19 * u, 0, bot + 5 * u);
    hemShade.addColorStop(0, 'rgba(24,23,23,0)'); hemShade.addColorStop(.71, 'rgba(28,26,26,.21)');
    hemShade.addColorStop(1, 'rgba(16,17,20,.73)');
    g.fillStyle = hemShade; g.fillRect(x0, bot - 19 * u, x1 - x0, 25 * u);
    g.beginPath();
    for (let i = 0; i <= 24; i++) {
      const p = i / 24;
      g.lineTo(lerp(S.xo(bot), S.xi(bot), p), S.hem(p) - (10 - 3 * p) * u);
    }
    g.lineWidth = Math.max(.55, 1.12 * u);
    g.strokeStyle = 'rgba(167,151,132,.22)'; g.stroke();
    if (!art && typeof g.createPattern === 'function') {
      const tile = grain();
      const pattern = tile && g.createPattern(tile, 'repeat');
      if (pattern) { g.fillStyle = pattern; g.fillRect(x0, top, x1 - x0, bot - top + 6 * u); }
    }
    g.restore();
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
  const SUPPORT_START = .16, SUPPORT_FULL = .36;
  const hasBody = (height, presence) => height >= .5 || presence > SUPPORT_START;
  function footDepth(height, presence) {
    // The slow stem envelope keeps the slope attached through short dips in the
    // ridge. Both the ridge and its support taper away in a sustained rest.
    return Math.max(smooth(0, 40, height), smooth(SUPPORT_START, SUPPORT_FULL, presence));
  }
  function footing(foot, ridge, presence) {
    const depth = footDepth(foot - ridge, presence);
    const bottom = lerp(foot, BASIN + 2, depth);
    return {bottom, soft:Math.min(Math.max(0, bottom - foot) * .92, 31 * (1 - depth))};
  }
  function traceBody(p, ys, env, foot, x0, a, b) {
    let run = -1;
    for (let k = a; k <= b + 1; k++) {
      const up = k <= b && hasBody(foot - ys[k], env[k]);
      if (up && run < 0) { run = k; p.moveTo(x0 + k * COL, ys[k]); }
      else if (up) p.lineTo(x0 + k * COL, ys[k]);
      if (!up && run >= 0) {
        for (let q = k - 1; q >= run; q--) {
          const {bottom, soft} = footing(foot, ys[q], env[q]);
          p.lineTo(x0 + q * COL, bottom - soft);
        }
        p.closePath();
        run = -1;
      }
    }
  }
  // the body (ridge down to the basin) over every run of columns where the range stands; built once a frame and used for
  // the fill, the clip of its faces and the clip of the haze over it (a Path2D where the canvas has one)
  function bodyPath(ctx, R) {
    if (R.body !== undefined) { if (R.body) return R.body; }
    const p = typeof Path2D === 'function' ? new Path2D() : (ctx.beginPath(), ctx);
    traceBody(p, R.ys, R.env, R.layer.foot, R.x0, R.ja, R.jb);
    R.body = p === ctx ? null : p;
    return R.body;
  }
  const fillPath = (ctx, R) => { const p = bodyPath(ctx, R); if (p) ctx.fill(p); else ctx.fill(); };
  const clipPath = (ctx, R) => { const p = bodyPath(ctx, R); if (p) ctx.clip(p); else ctx.clip(); };
  function paintFootFade(g, R) {
    const {ys, env, x0, ja, jb} = R, foot = R.layer.foot;
    const runs = [];
    let run = [];
    for (let k = ja; k <= jb; k++) {
      const {bottom, soft} = footing(foot, ys[k], env[k]);
      if (soft >= .25) run.push([x0 + k * COL, bottom - soft, soft]);
      else if (run.length) { runs.push(run); run = []; }
    }
    if (run.length) runs.push(run);
    if (!runs.length) return;
    const bands = [.93, .68, .32, .07];
    g.save();
    for (let i = 0; i < bands.length; i++) {
      g.globalAlpha = bands[i];
      g.beginPath();
      for (const samples of runs) {
        const [x, y, soft] = samples[0];
        g.moveTo(x, y + soft * i / bands.length);
        for (let k = 1; k < samples.length; k++) {
          const [x, y, soft] = samples[k];
          g.lineTo(x, y + soft * i / bands.length);
        }
        for (let k = samples.length - 1; k >= 0; k--) {
          const [x, y, soft] = samples[k];
          g.lineTo(x, y + soft * (i + 1) / bands.length);
        }
        g.closePath();
      }
      g.fill();
    }
    g.restore();
  }
  // The snowfield's back edge is the actual score ridge. Its cross sections
  // provide the local slope for light, exposed cliffs, and settled snow.
  const mountainNoise = (() => {
    const samples = new Float32Array(256 * 256);
    let state = 6197;
    for (let i = 0; i < samples.length; i++) {
      state = (Math.imul(1664525, state) + 1013904223) >>> 0;
      samples[i] = state / 2147483648 - 1;
    }
    return (x, y) => {
      const xx = Math.floor(x), yy = Math.floor(y);
      const dx = x - xx, dy = y - yy;
      const u = dx * dx * (3 - 2 * dx), v = dy * dy * (3 - 2 * dy);
      const a = (yy & 255) << 8, b = ((yy + 1) & 255) << 8;
      const p = xx & 255, q = (xx + 1) & 255;
      return lerp(lerp(samples[a + p], samples[a + q], u), lerp(samples[b + p], samples[b + q], u), v);
    };
  })();

  function snowMountainSurface(layer, LT, ys, k0, first, last) {
    const {foot, amp, seed, d} = layer;
    const rockCanvas = makeCanvas(1, 1), coverCanvas = rockCanvas && makeCanvas(1, 1);
    const rockCtx = rockCanvas?.getContext('2d'), coverCtx = coverCanvas?.getContext('2d');
    const bitmap = typeof rockCtx?.createImageData === 'function' && typeof coverCtx?.putImageData === 'function';
    const step = bitmap ? COL : COL * 3;
    const left = Math.floor(first * COL / step) * step, right = Math.ceil(last * COL / step) * step;
    const width = Math.max(1, Math.round((right - left) / step) + 1), stride = width + 2;
    const ridgeAt = x => {
      const pos = clamp(x / COL - k0, 0, ys.length - 1);
      const k = Math.floor(pos);
      return lerp(ys[k], ys[Math.min(k + 1, ys.length - 1)], pos - k);
    };
    let top = foot;
    for (let x = left - step; x <= right + step; x += step) top = Math.min(top, ridgeAt(x));
    const y0 = Math.floor((top - step) / step) * step;
    const height = Math.max(1, Math.ceil((foot - y0) / step) + 1);
    if (bitmap) {
      rockCanvas.width = coverCanvas.width = width;
      rockCanvas.height = coverCanvas.height = height;
    }
    const rockImage = bitmap && rockCtx.createImageData(width, height);
    const coverImage = bitmap && coverCtx.createImageData(width, height);
    const rock = bitmap ? rockImage.data : new Uint8ClampedArray(width * height * 4);
    const cover = bitmap ? coverImage.data : new Uint8ClampedArray(rock.length);
    // All sampling, including the row spacing and rock bedding, is in world units.
    // Adjacent tiles and two different camera sizes therefore meet on the same face.
    const rows = Math.max(12, Math.ceil(amp / (bitmap ? 3.5 : 8)));
    const dz = amp / rows, size = stride * (rows + 1);
    const section = new Float32Array(size), fissures = new Float32Array(size);
    const looseRock = new Float32Array(size), bedding = new Float32Array(size);
    for (let i = 0; i < stride; i++) {
      const x = left + (i - 1) * step, rim = ridgeAt(x), relief = foot - rim;
      const crestSlope = (ridgeAt(x + 13) - ridgeAt(x - 13)) / 26;
      const X = x + seed * 157, phase = seed * 3.31;
      const regional = mountainNoise(X / 155, phase);
      const sweep = .31 + .70 * regional + .47 * clamp(crestSlope, -1.1, 1.1);
      const beddingDip = (.095 + .05 * (layer.i % 3)) * x + 17 * mountainNoise(X / 137, phase + 4);
      const reliefDetail = .99 - .47 * d;
      for (let j = 0; j <= rows; j++) {
        const at = j * stride + i, v = j / rows, z = j * dz;
        const bend = mountainNoise(X / 89 + z * .005, phase + z / 74);
        const shift = z * (sweep + .31 * bend);
        const flankX = x - shift, spreadAtFoot = 2 + v * (12 + 12 * d);
        const crest = (.52 * ridgeAt(flankX) + .24 * (ridgeAt(flankX - spreadAtFoot) + ridgeAt(flankX + spreadAtFoot)));
        const u = X - (.65 + .43 * regional) * z + 38 * bend;
        const w = z + .22 * X;
        // Long spurs divide into smaller ribs. Warped scales turn and merge
        // down the mountain instead of repeating a shape at every summit.
        const shoulder = mountainNoise(u / 81 + w / 230, w / 101 - u / 298);
        const rib = mountainNoise((u + 18 * shoulder) / 31 - w / 112, w / 52 + u / 178);
        const flint = mountainNoise((u + 9 * rib) / 12 + w / 65, w / 22 - u / 113);
        const scree = mountainNoise(u / 4.8 - w / 23, w / 7.5 + u / 48);
        const fold = 52 * (.37 - Math.abs(shoulder)) + reliefDetail * (18 * (.39 - Math.abs(rib))
          + 5.7 * (.43 - Math.abs(flint)) + 1.25 * scree);
        const shoulderProfile = (1 - v) * (lerp(rim, crest, Math.min(1, v * 6)) - rim);
        const spread = Math.min(1, relief / 66) * (1 - Math.pow(Math.abs(2 * v - 1), 3));
        const y = rim + relief * v + shoulderProfile - fold * spread;
        fissures[at] = .65 * shoulder + .35 * rib;
        looseRock[at] = .62 * flint + .38 * scree;
        // A dipping bed continues across adjoining buttresses and can reappear on another face.
        const bed = (foot - y + z * .22 + beddingDip + 2.1 * flint + 6 * rib) / 16.3;
        const seam = Math.abs((bed - Math.floor(bed)) * 2 - 1);
        const shelf = smooth(.40, .94, seam) * (.65 + .46 * rib);
        bedding[at] = shelf - .21;
        section[at] = clamp(y + 3.5 * reliefDetail * spread * shelf, rim + .09 * relief * v, foot);
      }
    }
    const stem = rgb(STEM_COLOR[layer.id]);
    const stone = mix(stem, [65, 81, 96], .61);
    const veil = .035 + .55 * d;
    const shadow = mix(mix(stone, [20, 42, 59], .69), LT.haze, veil);
    const sun = mix(mix(stone, [148, 154, 153], .51), LT.haze, veil);
    const coverShade = mix([122, 153, 184], LT.haze, veil * .86);
    const coverLight = mix([252, 249, 238], LT.haze, veil * .82);
    const paint = (ctx, xFirst, coating, opacity = 1) => {
      if (opacity <= 0) return;
      const x = xFirst + left - first * COL - step / 2, y = y0 - step / 2;
      ctx.save(); ctx.globalAlpha *= opacity;
      if (bitmap) {
        ctx.drawImage(coating ? coverCanvas : rockCanvas, x, y, width * step, height * step);
      } else {
        const data = coating ? cover : rock;
        for (let row = 0; row < height; row++) for (let col = 0; col < width; col++) {
          const p = 4 * (row * width + col);
          if (!data[p + 3]) continue;
          ctx.fillStyle = 'rgba(' + data[p] + ',' + data[p + 1] + ',' + data[p + 2] + ',' + data[p + 3] / 255 + ')';
          ctx.fillRect(x + col * step, y + row * step, step, step);
        }
      }
      ctx.restore();
    };
    for (let i = 1; i <= width; i++) {
      const rim = section[i], relief = foot - rim;
      if (relief < 2) continue;
      let prevLight, prevSnow, prevCoverLight;
      for (let j = 0; j <= rows; j++) {
        const at = j * stride + i, v = j / rows;
        const next = Math.min(rows, j + 1) * stride + i, prior = Math.max(0, j - 1) * stride + i;
        const sx = (section[at + 1] - section[at - 1]) / (2 * step);
        const sz = (section[next] - section[prior]) / ((j === 0 || j === rows ? 1 : 2) * dz) - .22;
        const steep = Math.hypot(sx, sz), normal = 1 / Math.sqrt(1 + steep * steep);
        const diffuse = (.67 - .75 * sx + .29 * sz) * normal;
        const cuvette = clamp((section[at] - (section[at - 1] + section[at + 1]) * .5) / step, -.72, .72);
        const grit = looseRock[at], fault = fissures[at];
        const light = clamp(.19 + .77 * diffuse - .20 * cuvette + .13 * grit - .19 * bedding[at]);
        const coverLightness = clamp(.35 + .60 * diffuse - .12 * cuvette + .038 * grit);
        // Snow sticks to shelves and fans, slides from cliffs and collects in lee hollows.
        // The fine boundary is broken by the same outcrops that shade the exposed stone.
        const balance = .87 - .64 * v - .79 * steep + .29 * sx * normal
          + .37 * fault + .10 * grit + .25 * cuvette + .27 * bedding[at];
        const coverage = smooth(-.14, .10, balance);
        if (j > 0 && section[at] > section[prior]) {
          const y1 = section[prior], y2 = section[at];
          const from = Math.max(0, Math.ceil((y1 - y0) / step));
          const to = Math.min(height - 1, Math.floor((y2 - y0) / step));
          for (let row = from; row <= to; row++) {
            const y = y0 + row * step, f = (y - y1) / (y2 - y1);
            const value = lerp(prevLight, light, f);
            const cap = lerp(prevCoverLight, coverLightness, f);
            const p = 4 * (row * width + i - 1);
            const apron = 1 - smooth(.72, 1, (y - rim) / relief);
            for (let ch = 0; ch < 3; ch++) {
              rock[p + ch] = lerp(shadow[ch], sun[ch], value);
              cover[p + ch] = lerp(coverShade[ch], coverLight[ch], cap);
            }
            rock[p + 3] = 250 * apron;
            cover[p + 3] = 255 * apron * lerp(prevSnow, coverage, f);
          }
        }
        prevLight = light; prevSnow = coverage; prevCoverLight = coverLightness;
      }
    }
    if (bitmap) { rockCtx.putImageData(rockImage, 0, 0); coverCtx.putImageData(coverImage, 0, 0); }
    return {paint};
  }

  function paintRelief(g, ys, k0, x0, a, b, layer, LT, color, wash) {
    const detail = 1 - layer.d, {foot, seed} = layer;
    const brush = color => {
      const gr = g.createRadialGradient(0, -.43, 0, 0, 0, 1);
      gr.addColorStop(0, css(color));
      gr.addColorStop(.38, css(color, .74));
      gr.addColorStop(.7, css(color, .21));
      gr.addColorStop(1, css(color, 0));
      return gr;
    };
    const shade = brush(mix(color, LT.shade, .78)), light = brush(mix(color, LT.light, .7));
    const sa = lerp(.073, .42, detail) * (1 - wash * .6) * LT.shadeK;
    const la = lerp(.065, .3, detail) * (1 - wash * .5) * LT.litK;
    const step = 7, reach = 52;
    const lo = Math.max(reach, a - reach), hi = Math.min(ys.length - reach - 1, b + reach);
    const first = Math.ceil((k0 + lo) / step) * step - k0;
    const rim = boxBlur(ys, 4, 2);
    for (let k = first; k <= hi; k += step) {
      const height = foot - rim[k];
      if (height < 8) continue;
      const wide = (rim[k + 14] - rim[k - 14]) / (28 * COL);
      const local = (rim[k + 5] - rim[k - 5]) / (10 * COL);
      const slope = wide * .62 + local * .38;
      const weight = smooth(.06, .78, Math.abs(slope)) * smooth(8, 35, height);
      if (weight < .02) continue;
      const key = k0 + k;
      const rough = vnoise(key * .056, seed + 5);
      const ry = Math.min(height * .69, (35 + height * .3) * LT.faceLen * (.66 + rough * .33));
      const rx = lerp(22, 32, rough) * lerp(1.16, 1, detail);
      const drift = ry * (slope > 0 ? .18 + rough * .28 : -.17 - rough * .12);
      g.save();
      g.translate(x0 + k * COL, rim[k] + ry * .38);
      g.rotate(Math.atan2(-drift, ry));
      g.scale(rx, Math.hypot(ry, drift));
      g.fillStyle = slope > 0 ? shade : light;
      g.globalAlpha *= weight * (slope > 0 ? sa : la) * (.72 + rough * .28);
      g.fillRect(-1, -1, 2, 2);
      g.restore();
    }
  }
  function ridgeExposure(weather) {
    const deposit = clamp(weather?.surface || 0);
    if (weather?.snow) return .16 + .84 * deposit;
    if (weather?.sand) return .18 + .82 * deposit;
    if (weather?.rain) return .08 + .92 * deposit;
    return .84;
  }

  // Each mark belongs to a fixed outcrop. The same ridge samples drive the
  // outline and the material resting on it, including at a tile boundary.
  function paintRidgeMaterial(g, layer, LT, ys, k0, x0, first, last) {
    const {foot, seed, d} = layer;
    const far = .40 * d, bold = 1 - .40 * d;
    const tone = (color, alpha) => css(mix(color, LT.haze, far), alpha * bold);
    const sand = LT.weatherSand;
    if (LT.weatherOvercast && !sand) {
      const top = foot - layer.amp;
      const wet = g.createLinearGradient(0, top, 0, foot);
      wet.addColorStop(0, tone(LT.shade, 0));
      wet.addColorStop(.30, tone(LT.shade, .11));
      wet.addColorStop(.73, tone(LT.haze, .065));
      wet.addColorStop(1, tone(LT.haze, 0));
      g.fillStyle = wet;
      g.fillRect(x0, top, ys.length * COL, layer.amp);
      return;
    }
    const earth = tone([178, 122, 70], .68), light = tone([237, 192, 127], .82);
    const x = key => x0 + (key - k0) * COL, top = key => ys[key - k0];
    const face = (key, fraction) => lerp(top(key), foot, fraction);
    const cell = 24;
    const firstCell = Math.floor(Math.max(first, k0 + 32) / cell);
    const lastCell = Math.ceil(Math.min(last, k0 + ys.length - 34) / cell);
    for (let n = firstCell; n <= lastCell; n++) {
      const grain = hash(n, seed + 139);
      const k = n * cell + Math.floor(grain * 12);
      if (k - 19 < k0 || k + 20 >= k0 + ys.length) continue;
      const height = foot - top(k);
      if (height < 11) continue;
      const aspect = (top(k + 8) - top(k - 8)) / (16 * COL);
      const pocket = vnoise(k * .022, seed + 118);
      const width = 5 + Math.round(6 * pocket);
      if (sand) {
        // Wind lays long shallow ribbons across lee benches, following their fall.
        if (pocket < .34 || aspect < -.85 || grain < .21) continue;
        const a = k - 6 - Math.round(grain * 10), b = k + 10 + Math.round(pocket * 9);
        const depth = .53 + .22 * vnoise(k * .017, seed + 221);
        const y1 = face(a, depth), y2 = face(b, depth);
        const knee = x(k - 2), middle = lerp(y1, y2, (k - 2 - a) / (b - a));
        const lip = Math.min(7, height * .065) * (.43 + pocket * .57);
        const belly = Math.min(9, height * .08) * grain;
        g.beginPath(); g.moveTo(x(a), y1);
        g.quadraticCurveTo(knee - 8, middle - lip * .74, knee, middle - lip);
        g.quadraticCurveTo(knee + 13, middle, x(b), y2);
        g.quadraticCurveTo(knee + 3, middle + belly, x(a), y1);
        g.closePath(); g.fillStyle = earth; g.fill();
        g.beginPath(); g.moveTo(x(a), y1);
        g.quadraticCurveTo(knee - 8, middle - lip * .74, knee, middle - lip);
        g.quadraticCurveTo(knee + 9, middle - lip * .35, x(b - 3), lerp(y1, y2, .88));
        g.quadraticCurveTo(knee, middle - lip * .54, x(a), y1);
        g.closePath(); g.fillStyle = light; g.fill();
      } else {
        if (pocket < .35 || Math.abs(aspect) < .13) continue;
        const a = k - width, b = k + width, xx = x(k);
        const shelf = grain < .70 ? .018 : .19 + .14 * pocket;
        const y = face(k, shelf), run = Math.min(65, height * (.16 + .19 * pocket));
        const mineral = aspect < 0 ? [238, 197, 143] : [65, 66, 73];
        const glaze = g.createLinearGradient(0, y - 6, 0, y + run);
        glaze.addColorStop(0, tone(mineral, .31)); glaze.addColorStop(.43, tone(mineral, .16));
        glaze.addColorStop(1, tone(mineral, 0));
        g.beginPath(); g.moveTo(x(a), face(a, shelf));
        for (let j = a + 1; j <= b; j++) g.lineTo(x(j), face(j, shelf));
        const drift = clamp(-aspect * 12, -16, 16);
        g.quadraticCurveTo(xx + drift + 3, y + run * .58, xx + drift * 1.6, y + run);
        g.quadraticCurveTo(xx - width + drift, y + run * .46, x(a), face(a, shelf));
        g.closePath(); g.fillStyle = glaze; g.fill();
      }
    }
  }
  function paintRange(ctx, R, LT, view, exposure) {
    if (!fillBody(ctx, R, LT)) return false;
    const {ys, foot, x0, env} = R, a = R.ja, b = R.jb, detail = 1 - R.d, seed = R.layer.seed;
    const wash = lerp(.06, .62, Math.pow(R.d, .85));
    const color = rgb(STEM_COLOR[R.id]);
    const c = mix(color, LT.haze, clamp(wash * LT.washK));
    const first = Math.max(0, a - 12), last = Math.min(ys.length - 1, b + 12);
    const surface = LT.weatherSnow ? snowMountainSurface(R.layer, LT, ys, R.k0, R.k0 + first, R.k0 + last) : null;
    // Local ridge orientation lights the weathered flanks, then bedding crosses the nearer rock.
    ctx.save();
    clipPath(ctx, R);
    const X = k => x0 + k * COL, key = k => R.k0 + k; // hash keys follow the world sample, so a peak keeps its face as it moves
    if (surface) surface.paint(ctx, X(first), false);
    else paintRelief(ctx, ys, R.k0, x0, a, b, R.layer, LT, c, wash);
    if (!surface && detail > .45) { // faint horizontal bedding: sandstone, not forest
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
    if (!surface) {
      ctx.globalAlpha *= exposure;
      paintRidgeMaterial(ctx, R.layer, LT, ys, R.k0, x0, R.k0 + a - 32, R.k0 + b + 32);
    }
    ctx.restore();
    if (surface && exposure > 0) {
      ctx.save();
      clipPath(ctx, R);
      surface.paint(ctx, X(first), true, exposure);
      ctx.restore();
    }
    // where a range eases in or out, a low haze lies over its foot so it sinks into the plain instead of ending in a wall
    const m = view.matrix;
    if (m) {
      const hz = ctx.createLinearGradient(0, 0, 0, 1), hc = basinAt(LT, R.layer.foot);
      hz.addColorStop(0, css(hc, 0)); hz.addColorStop(1, css(hc, 1));
      ctx.save(); ctx.fillStyle = hz;
      for (let k = a - ((R.k0 + a) & 1); k <= b; k += 2) {
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

  // ---------- the ranges from cached tiles (batch 5, 2026-11-19) ----------
  // The cached face and snow textures follow the same world samples as the live range silhouette.
  const TILE = 256, TILE_REACH = 400, FEATURE_REACH = 200;
  const TILE_BUDGET = 64e6; // device px; total tile pixels kept
  const srcIds = new WeakMap(); let srcSerial = 0;
  const tileCache = new Map(); let tilePixels = 0, frameNo = 0;
  function gatesOf(src, L, layer) {
    const entry = ridgeEntry(L, layer), ahead = (L.right - entry) / layer.pps, behind = (entry - L.left) / layer.pps;
    return {gA: src.plainStart + ahead, gB: src.plainEnd - behind, rampT: GATE_PX / layer.pps};
  }
  // The flank cap can see past either edge of the request. Its smallest rise is 5.6 * .22 px per sample,
  // so 512 samples of padding cover any height between TOPMOST and BASE0.
  const SHAPE_PAD = 512;
  function worldShape(src, L, layer, k0, k1) {
    const {i, dt, amp, foot} = layer, n = k1 - k0 + 1, G = gatesOf(src, L, layer);
    const len = n + 2 * SHAPE_PAD, hg = new Float64Array(len), env = new Float64Array(len), cap = new Float64Array(len);
    const S = (i ? 1.5 + 1.3 * RUG : 6) * 2;
    for (let j = 0; j < len; j++) {
      const kk = k0 - SHAPE_PAD + j, tt = kk * dt;
      const gate = tt <= G.gA || tt >= G.gB ? 0 : smooth(G.gA, G.gA + G.rampT, tt) * (1 - smooth(G.gB - G.rampT, G.gB, tt));
      let pres = 0;
      if (gate > 0) {
        pres = sampleE(src, layer, kk);
        const e = pres * gate;
        env[j] = e;
        if (e > 0) {
          let rel = sampleR(src, layer, kk);
          if (gate < 1) rel = rel * gate + HILL * 4 * (1 - gate) * (.35 + .4 * vnoise(tt * .55 / layer.f + i * 3.1, 61 + i) + .25 * vnoise(tt * 1.7 / layer.f + i * 7.7, 71 + i));
          const y = foot - amp * e * rel;
          hg[j] = foot - (y < TOPMOST + 50 ? TOPMOST + 50 * Math.exp((y - TOPMOST - 50) / 50) : y);
        }
      }
      cap[j] = S * Math.min(.22 + .78 * gate * gate, .4 + .6 * smooth(.3, .9, pres));
    }
    for (let j = 1; j < len; j++) hg[j] = Math.min(hg[j], hg[j - 1] + Math.max(cap[j], cap[j - 1]));
    for (let j = len - 2; j >= 0; j--) hg[j] = Math.min(hg[j], hg[j + 1] + Math.max(cap[j], cap[j + 1]));
    return {k0, n, hg: hg.subarray(SHAPE_PAD, SHAPE_PAD + n), env: env.subarray(SHAPE_PAD, SHAPE_PAD + n)};
  }
  // one tile: the details of `layer` over world samples [c*TILE, (c+1)*TILE), and the haze band it lays on the range behind
  function makeTile(src, L, LT, dpr, layer, c) {
    const kS = c * TILE, W = worldShape(src, L, layer, kS - TILE_REACH, kS + TILE + TILE_REACH);
    const at = k => k - W.k0, ys = W.hg.map(h => layer.foot - h);
    const tile = {kS, detail: null, pixels: 0};
    const scale = L.s * dpr, x0 = -COL / 2 - 2, w = TILE * COL + 4;
    const X = k => (k - kS) * COL;
    let top = Infinity;
    for (let k = kS - FEATURE_REACH; k < kS + TILE + FEATURE_REACH; k++) {
      if (hasBody(W.hg[at(k)], W.env[at(k)])) top = Math.min(top, ys[at(k)]);
    }
    if (top < Infinity) {
      const y0 = top - 8, h = layer.foot + 10 - y0;
      const cv = makeCanvas(w * scale, h * scale);
      if (cv) {
        const g = cv.getContext('2d'), base = [scale, 0, 0, scale, -x0 * scale, -y0 * scale];
        const first = kS - 12, last = kS + TILE + 12;
        const surface = LT.weatherSnow ? snowMountainSurface(layer, LT, ys, W.k0, first, last) : null;
        const surfaceX = X(first);
        g.setTransform(...base);
        paintDetails(g, base, layer, LT, W, ys, kS, X, surface, surfaceX);
        tile.detail = {c: cv, x0, y0, h};
        tile.pixels += cv.width * cv.height;
        const materialScale = Math.min(.85, scale);
        const coating = makeCanvas(w * materialScale, h * materialScale);
        if (coating) {
          const mg = coating.getContext('2d');
          mg.setTransform(materialScale, 0, 0, materialScale, -x0 * materialScale, -y0 * materialScale);
          mg.beginPath();
          traceBody(mg, ys, W.env, layer.foot, X(W.k0), at(kS - 40), at(kS + TILE + 40));
          mg.clip();
          if (surface) surface.paint(mg, surfaceX, true);
          else paintRidgeMaterial(mg, layer, LT, ys, W.k0, X(W.k0), kS - 32, kS + TILE + 32);
          tile.material = {c: coating, scale: materialScale};
          tile.pixels += coating.width * coating.height;
        }
      }
    }
    return tile;
  }
  // faces, bedding, crest and foot haze of the world shape, as paintRange draws them, in tile coordinates
  function paintDetails(g, base, layer, LT, W, ys, kS, X, surface, surfaceX) {
    const at = k => k - W.k0, detail = 1 - layer.d, seed = layer.seed;
    const foot = layer.foot;
    const wash = lerp(.06, .62, Math.pow(layer.d, .85));
    const color = rgb(STEM_COLOR[layer.id]);
    const c = mix(color, LT.haze, clamp(wash * LT.washK));
    const a0 = kS - FEATURE_REACH, b0 = kS + TILE + FEATURE_REACH; // samples whose features can reach into the tile
    // the body of the world shape, for clipping the faces and the bedding (as paintRange clips them to the body)
    const body = typeof Path2D === 'function' ? new Path2D() : null;
    const P = body || g;
    if (!body) g.beginPath();
    traceBody(P, ys, W.env, foot, X(W.k0), at(a0), at(b0));
    g.save();
    if (body) g.clip(body); else g.clip();
    if (surface) surface.paint(g, surfaceX, false);
    else paintRelief(g, ys, W.k0, X(W.k0), at(kS), at(kS + TILE), layer, LT, c, wash);
    const tex = ART && ART.derived('soft:range-' + textureOf(layer.d));
    const strata = !surface && ART && ART.derived('soft:strata-' + (layer.i % 2 ? 'b' : 'a'));
    if (tex) { // batch 7: the brush texture over the whole body, anchored to the range's world x (+ a phase per range)
      const sc = TEX_TEXEL, P = tex.width * sc, ph = ((kS * COL + layer.i * 311) % P + P) % P;
      const pt = patternOf(g, tex, sc, -ph, layer.i * 97 % (tex.height * sc));
      if (pt) { g.globalAlpha = surface ? TEX_K * .16 : TEX_K; g.fillStyle = pt; g.fillRect(X(kS - 4), foot - layer.amp * 1.6, (TILE + 8) * COL, layer.amp * 1.6 + 20); g.globalAlpha = 1; }
    }
    if (strata && detail > .45) { // and instead of the code's five bedding lines, the strata (level, as sandstone lies)
      const band = layer.amp * .9, sc = band / strata.height, P = strata.width * sc, ph = ((kS * COL + layer.i * 523) % P + P) % P;
      const pt = patternOf(g, strata, sc, -ph, foot - band, 'repeat-x');
      if (pt) { g.globalAlpha = STRATA_K * (detail - .45) / .55; g.fillStyle = pt; g.fillRect(X(kS - 4), foot - band, (TILE + 8) * COL, band); g.globalAlpha = 1; }
    }
    if (detail > .45 && !surface && !strata) { // faint horizontal bedding on even world samples
      g.lineWidth = 1;
      for (let m = 0; m < 5; m++) {
        g.strokeStyle = m % 2 ? css(mix(c, LT.shade, .7), (detail - .45) * .2) : css(mix(c, LT.light, .6), (detail - .45) * .16);
        g.beginPath();
        for (let k = kS - 4 - (((kS - 4) % 2) + 2) % 2; k <= kS + TILE + 4; k += 2) {
          const hgt = W.hg[at(k)], y = foot - hgt * (.25 + m * .13) + (vnoise(k * .05 + m * 7, seed + 40 + m) - .5) * 3;
          if (hgt < 30) g.moveTo(X(k), y); else g.lineTo(X(k), y);
        }
        g.stroke();
      }
    }
    g.restore();
    // a low haze over the foot where the range eases in or out
    const hz = g.createLinearGradient(0, 0, 0, 1), hc = basinAt(LT, foot);
    hz.addColorStop(0, css(hc, 0)); hz.addColorStop(1, css(hc, 1));
    g.save(); g.fillStyle = hz;
    for (let k = kS - 4 - (((kS - 4) % 2) + 2) % 2; k <= kS + TILE + 4; k += 2) {
      const e = W.env[at(k)], al = 4 * e * (1 - e) * .75;
      if (al < .02) continue;
      const hgt = W.hg[at(k)], hh = Math.max(24, hgt * .9), y1 = foot + 4;
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
  function layTiles(g, R, src, L, LT, dpr, m, exposure = 0) {
    const layer = R.layer, scale = L.s * dpr;
    const snap = x => (Math.round(m.a * x + m.e) - m.e) / m.a;
    const k0 = R.k0 + R.ja - 1, k1 = R.k0 + R.jb + 1;
    for (let c = Math.floor(k0 / TILE); c <= Math.floor(k1 / TILE); c++) {
      const tile = tileOf(src, L, LT, dpr, layer, c), img = tile.detail;
      if (!img) continue;
      const x = R.x0 + (tile.kS - R.k0) * COL;
      // Edge cuts sit on device pixels. Sample at the original offset so the rock stays aligned to its ridge.
      const xa = snap(x - COL / 2), xb = snap(x + TILE * COL - COL / 2);
      const sx = (xa - x - img.x0) * scale, sw = (xb - xa) * scale;
      g.drawImage(img.c, sx, 0, sw, img.c.height, xa, img.y0, sw / scale, img.c.height / scale);
      if (tile.material && exposure > 0) {
        const mat = tile.material;
        const alpha = g.globalAlpha;
        g.globalAlpha = alpha * exposure;
        g.drawImage(mat.c, (xa - x - img.x0) * mat.scale, 0, (xb - xa) * mat.scale, mat.c.height,
          xa, img.y0, xb - xa, mat.c.height / mat.scale);
        g.globalAlpha = alpha;
      }
    }
  }
  const composites = new Map();
  // returns false when there is no offscreen canvas or no transform to work with (then draw() paints the old way)
  function paintTiled(ctx, S, LT, dpr, view, rainLayer, storm, weather) {
    const m = view.matrix, L = S.layout;
    if (!m || typeof ctx.getTransform !== 'function') return false;
    const cw = ctx.canvas && ctx.canvas.width > 0 ? ctx.canvas.width : Math.ceil(L.w * dpr), ch = ctx.canvas && ctx.canvas.height > 0 ? ctx.canvas.height : Math.ceil(L.h * dpr);
    // The main canvas clips to the window. Keep the same device pixel grid on
    // the intermediate canvas while leaving the carriage out of the composite.
    const axisAligned = !m.b && !m.c && m.a > 0 && m.d > 0;
    const x = axisAligned ? clamp(Math.floor(m.a * L.left + m.e), 0, cw) : 0;
    const y = axisAligned ? clamp(Math.floor(m.d * M_TOP + m.f), 0, ch) : 0;
    const w = (axisAligned ? clamp(Math.ceil(m.a * L.right + m.e), 0, cw) : cw) - x;
    const h = (axisAligned ? clamp(Math.ceil(m.d * M_BOTTOM + m.f), 0, ch) : ch) - y;
    if (w < 1 || h < 1) return false;
    const key = w + 'x' + h;
    let comp = composites.get(key);
    if (!comp) {
      const c = makeCanvas(w, h);
      if (!c) return false;
      if (composites.size >= 2) composites.delete(composites.keys().next().value);
      comp = {c, g: c.getContext('2d')};
      composites.set(key, comp);
    }
    frameNo++;
    const g = comp.g, {ranges, src} = S;
    g.setTransform(1, 0, 0, 1, 0, 0); g.globalCompositeOperation = 'source-over'; g.globalAlpha = 1;
    g.clearRect(0, 0, comp.c.width, comp.c.height);
    g.setTransform(m.a, 0, 0, m.d, m.e - x, m.f - y);
    for (let i = ranges.length - 1; i >= 0; i--) {
      const R = ranges[i];
      if (fillBody(g, R, LT)) layTiles(g, R, src, S.layout, LT, dpr, m, ridgeExposure(weather));
      if (rainLayer) rainLayer(g, i);
    }
    const isRain = Boolean(weather?.rain), isSnow = Boolean(weather?.snow), isSand = Boolean(weather?.sand);
    const overcast = isRain || isSnow || isSand ? 1 : 0;
    const tension = Number.isFinite(weather?.tension) ? weather.tension : .5;
    if (isSnow) {
      // Air between the ranges lifts distant values. The local snow keeps its own rock shadows.
      g.save();
      g.setTransform(1, 0, 0, 1, 0, 0);
      g.globalCompositeOperation = 'source-atop';
      g.fillStyle = 'rgba(198,216,234,' + (.045 + .10 * storm * (.85 + .30 * tension)).toFixed(4) + ')';
      g.fillRect(0, 0, comp.c.width, comp.c.height);
      g.restore();
    } else if (isSand) {
      // Steep desert ridges into warm amber-ochre dust haze (far peaks sink into dust while near ridges hold umber silhouettes).
      g.save();
      g.setTransform(1, 0, 0, 1, 0, 0);
      g.globalCompositeOperation = 'source-atop';
      g.fillStyle = 'rgba(188,134,76,' + (.12 + .20 * storm * (.82 + .36 * tension)).toFixed(4) + ')';
      g.fillRect(0, 0, comp.c.width, comp.c.height);
      g.restore();
    } else if (storm > .03) {
      // Unify near/mid warm ridges into the cool wet storm air without crushing their silhouette.
      g.save();
      g.setTransform(1, 0, 0, 1, 0, 0);
      g.globalCompositeOperation = 'source-atop';
      g.fillStyle = 'rgba(42,56,72,' + (.20 * storm * (.82 + .36 * tension)).toFixed(4) + ')';
      g.fillRect(0, 0, comp.c.width, comp.c.height);
      g.restore();
    }
    ctx.save(); ctx.setTransform(1, 0, 0, 1, 0, 0);
    if (isSnow) {
      const bright = 1.02 - .08 * storm;
      const sat = .77 - .13 * storm;
      const con = 1.035 - .035 * storm;
      ctx.filter = 'brightness(' + bright.toFixed(3) + ') saturate(' + sat.toFixed(3) + ') contrast(' + con.toFixed(3) + ')';
    } else if (isSand) {
      const sep = .36 + .24 * storm;
      const sat = Math.max(.85, 1.18 - .22 * storm);
      const bright = .96 - .20 * storm;
      const con = .96 - .12 * storm;
      ctx.filter = 'sepia(' + sep.toFixed(3) + ') saturate(' + sat.toFixed(3) + ') brightness(' + bright.toFixed(3) + ') contrast(' + con.toFixed(3) + ')';
    } else if (overcast || storm > .003) {
      const bright = 1 - .04 * overcast - .16 * storm;
      const sat = Math.max(.35, 1 - .10 * overcast - .38 * storm * (.82 + .36 * tension));
      const con = 1 - .03 * overcast - .10 * storm;
      ctx.filter = 'brightness(' + bright.toFixed(3) + ') saturate(' + sat.toFixed(3) + ') contrast(' + con.toFixed(3) + ')';
    }
    ctx.drawImage(comp.c, x, y);
    ctx.restore();
    // one tile ahead of the right edge for the nearest range that lacks it (cost spread over frames, pixels unchanged)
    for (const R of ranges) {
      const c = Math.floor((R.k0 + R.jb) / TILE) + 1;
      if (!tileCache.has(tileKey(src, L, LT, dpr, R.layer, c))) { tileOf(src, L, LT, dpr, R.layer, c); break; }
    }
    return true;
  }
  // the body from the frame's own ridge: lit at the ridge, into the haze toward the foot, the basin down to the plain.
  // The body light stays with the range when tall peaks come into view or leave the window.
  function fillBody(g, R, LT) {
    const {ys} = R, a = R.ja, b = R.jb;
    const fm = R.layer.foot;
    if (!ys.subarray(a, b + 1).some((y, k) => hasBody(fm - y, R.env[a + k]))) return false;
    const wash = lerp(.06, .62, Math.pow(R.d, .85));
    const color = rgb(STEM_COLOR[R.id]);
    const c = mix(color, LT.haze, clamp(wash * LT.washK)), lit = mix(c, LT.light, .10 * (1 - wash) * LT.litK);
    const top = fm - R.layer.amp;
    const bottom = BASIN + 2, fadeFrom = Math.max(fm + 1, HORIZON - 15);
    const gr = g.createLinearGradient(0, top, 0, bottom);
    const stop = (y, color, alpha) => gr.addColorStop((y - top) / (bottom - top), css(color, alpha));
    stop(top, lit, 1);
    stop(lerp(top, fm, .55), mix(c, LT.haze, .12), 1);
    stop(lerp(top, fm, .775), mix(c, LT.haze, .3), 1);
    stop(fm, mix(mix(c, LT.haze, .55), basinAt(LT, fm), .5), 1);
    stop(fadeFrom, basinAt(LT, fadeFrom), 1);
    for (const t of [.25, .5, .75, 1]) {
      const y = lerp(fadeFrom, bottom, t);
      stop(y, basinAt(LT, y), 1 - smooth(0, 1, t));
    }
    g.fillStyle = gr;
    R.body = undefined; fillPath(g, R);
    paintFootFade(g, R);
    return true;
  }

  const rainValleys = new WeakMap();
  const RAIN_CELL_SPACING = 16;

  // A cell is assigned a valley world sample once. Its cloud and rain are
  // projected with the same parallax as that ridge, even after a seek or resize.
  function valleyAnchor(src, layer, atTime) {
    if (!layer) return atTime;
    const radius = Math.ceil(2.3 / layer.dt), middle = Math.round(atTime / layer.dt);
    const first = middle - radius, last = middle + radius;
    const W = worldShape(src, layout(1440, 900), layer, first - 35, last + 35);
    const low = boxBlur(W.hg, 30, 1);
    let best = middle, score = Infinity;
    for (let k = first; k <= last; k += 4) {
      const cost = low[k - W.k0] + 16 * Math.abs(k - middle) / radius;
      if (cost < score) { best = k; score = cost; }
    }
    return best * layer.dt;
  }

  function valleyRain(S, weather) {
    const {src, layout: L, time, ranges} = S;
    let placements = rainValleys.get(src);
    if (!placements) rainValleys.set(src, placements = new Map());
    const cells = [];
    for (const band of weather.distantBands) {
      const event = band.frontAtSec === undefined ? weather.events[band.index] : band;
      const start = event.frontAtSec - 5.4;
      const count = Math.max(1, Math.ceil((event.backAtSec - start) / RAIN_CELL_SPACING));
      // The train is almost always passing one or two cells of a sustained rain
      // band. Restrict to nearby world samples before evaluating terrain.
      const reach = (L.Wm + M_W) / (M_W / SPAN_FAR);
      const first = Math.max(0, Math.floor((time - start - reach) / RAIN_CELL_SPACING));
      const last = Math.min(count - 1, Math.ceil((time - start + reach) / RAIN_CELL_SPACING));
      for (let group = first; group <= last; group++) {
        const variant = (band.index * 3 + group) % 7;
        const layerIndex = ranges.length > 1 ? Math.max(1, Math.round((ranges.length - 1) * (group % 2 ? .56 : .35))) : -1;
        const timeJitter = group ? 2 * (hash(group, band.index + 23) - .5) : 0;
        const nearbyTime = start + group * RAIN_CELL_SPACING + timeJitter;
        const strength = band.strength * (group ? .73 + .23 * hash(group, band.index + 77) : 1);
        const storm = weather.stormDrive;
        const addCell = (index, at, variant, strength, lee) => {
          const layer = src.layers[index];
          const placeKey = event.frontAtSec + ':' + group + ':' + index + ':' + lee;
          let anchor = placements.get(placeKey);
          if (anchor === undefined) {
            anchor = valleyAnchor(src, layer, at);
            placements.set(placeKey, anchor);
          }
          const entry = layer ? ranges[index].entryM : L.entryAt(HORIZON - 58);
          const pps = layer?.pps ?? M_W / SPAN_FAR;
          const x = pastEntry(entry, anchor, time, pps);
          cells.push({x, timeFromAnchor: time - anchor, layer: index, variant, floor: Math.min(BASIN, (layer?.foot ?? HORIZON) + 24),
            strength, storm, tension: weather.tension ?? .5, lee});
        };
        addCell(layerIndex, nearbyTime, variant, strength, false);
        // A deep front spills through a second valley closer to the train. It
        // stays behind the nearest range and appears smoothly as the rain builds.
        const spill = smooth(.43, .84, storm);
        if (ranges.length > 2 && spill > 0) {
          const middle = Math.max(1, layerIndex - 2);
          addCell(middle, nearbyTime + .54 * RAIN_CELL_SPACING, (variant + 2) % 7, .76 * strength * spill, true);
        }
      }
    }
    return cells;
  }
  // ---------- drawing ----------
  function draw(ctx, frame) {
    ART = artNow();
    const S = scene(frame);
    if (!S) return null;
    const {layout: L, ranges} = S, {projection: win, s, sy} = L;
    const t = S.time;
    const terrainWeather = frame.terrainWeather ?? frame.options?.terrainWeather;
    const isRainMode = terrainWeather === 'rain', isSnowMode = terrainWeather === 'snow', isSandMode = terrainWeather === 'sandstorm';
    const rain = (isRainMode || isSnowMode || isSandMode) ? globalThis.XinTerrainRain : null;
    if (isRainMode && rain && !rain.isReady() && ctx.canvas) rain.prepare(ctx.canvas);
    else if ((isSnowMode || isSandMode) && rain && !rain.isReady()) rain.ready?.();
    const terrainLightning = (frame.terrainLightning ?? frame.options?.terrainLightning) !== false;
    const terrainWeatherDriver = frame.terrainWeatherDriver ?? frame.options?.terrainWeatherDriver;
    const weather = (isSnowMode || isSandMode || rain?.isReady() || (terrainWeather === 'clear' && frame.song.moodCurve && terrainWeatherDriver !== 'original')) && globalThis.XinTerrainWeather?.sample(frame.song, t, {
      terrainWeather, terrainLightning, terrainWeatherDriver, plainStart: S.src.plainStart, plainEnd: S.src.plainEnd,
    });
    const baseLight = lightFor(frame.cover);
    const LT = weather?.sand && rain?.sandLight ? rain.sandLight(baseLight)
      : weather?.snow && rain?.snowLight ? rain.snowLight(baseLight)
        : weather?.rain && rain?.overcastLight ? rain.overcastLight(baseLight) : baseLight;
    const base = typeof ctx.getTransform === 'function' ? ctx.getTransform() : null;
    const dpr = clamp(Math.round((base ? base.a : 1) * 4) / 4, 1, 3);
    const R = rasters(L, LT, dpr);
    ctx.save();
    if (R) ctx.drawImage(R.back, 0, 0, L.w, L.h);
    else { ctx.fillStyle = css(LT.sky[1][1]); ctx.fillRect(0, 0, L.w, L.h); }
    ctx.save();
    roundRect(ctx, win.x, win.y, win.w, win.h, win.r); ctx.clip();
    ctx.save(); // Landscape in sketch coordinates, then airborne rain in window pixels under the same clip.
    ctx.translate(win.x - M_LEFT * s, win.y - M_TOP * sy); ctx.scale(s, sy);
    const mm = typeof ctx.getTransform === 'function' ? ctx.getTransform() : null;
    const view = {matrix: mm && Number.isFinite(mm.a) ? mm : null};
    const sun = weather?.rain || weather?.snow || weather?.sand ? null : clearSunState(S, t);
    if (weather?.sand && rain?.drawSandSky) rain.drawSandSky(ctx, L, t, weather);
    else if (weather?.snow && rain?.drawSnowSky) rain.drawSnowSky(ctx, L, t, weather);
    else if (weather?.rain && rain?.drawSky) rain.drawSky(ctx, L, t, weather);
    else {
      if (R && R.clouds) {
        const P = R.clouds.P, W = R.clouds.drawW, drift = t * 2.2, off = ((-drift % P) + P) % P - 380;
        const alpha = ctx.globalAlpha;
        if (weather?.cloudOpacity !== undefined) ctx.globalAlpha = alpha * weather.cloudOpacity;
        for (let x = off - P; x < L.right + 20; x += P) if (x + W > L.left - 20) ctx.drawImage(R.clouds.c, x, CLOUD_Y0, W, CLOUD_Y1 - CLOUD_Y0);
        if (weather?.cloudOpacity !== undefined) ctx.globalAlpha = alpha;
      }
      drawClearSkySun(ctx, L, t, sun);
    }
    // a strip that repeats every P sketch px (drawn drawW wide from x0), moving at `speed`
    const loop = (tile, speed) => {
      const P = tile.P, W = tile.drawW, x0 = tile.x0 || 0, off = ((-t * speed) % P + P) % P;
      for (let x = off - P; x < L.right + 10; x += P) if (x + x0 + W > L.left - 10) ctx.drawImage(tile.c, x + x0, tile.y0, W, tile.h);
    };
    const storm = weather?.stormDrive || 0;
    const groundStage = surfaceStage(weather);
    if (R?.plain) for (const band of R.plain) loop(band.tile, band.speed);
    if (R) paintPlainSurface(ctx, L, t, LT, groundStage, sun);
    const rainCells = (weather?.rain || weather?.snow || weather?.sand) && weather.farRain > 0 ? valleyRain(S, weather) : [];
    const rainLayer = rainCells.length && rain ? (g, index) => (
      weather.sand ? rain.drawSandValley?.(g, L, rainCells, index, t, weather)
        : weather.snow ? rain.drawSnowValley?.(g, L, rainCells, index, t, weather)
          : rain.drawDistantRain(g, L, rainCells, index, t, weather)
    ) : null;
    if (rainLayer) rainLayer(ctx, -1);
    if (!(R && paintTiled(ctx, S, LT, dpr, view, rainLayer, storm, weather))) { // no offscreen canvas (tests): every range painted in full each frame
      for (let i = ranges.length - 1; i >= 0; i--) {
        paintRange(ctx, ranges[i], LT, view, ridgeExposure(weather));
        if (rainLayer) rainLayer(ctx, i);
      }
    }
    const strip = (tile, speed) => {
      const off = ((-t * speed) % GROUND_P + GROUND_P) % GROUND_P;
      for (let x = off - GROUND_P; x < L.right + 10; x += GROUND_P) if (x + GROUND_P > L.left - 10) ctx.drawImage(tile.c, x, tile.y0, GROUND_P, tile.h);
    };
    if (R) for (const band of R.ground) strip(band.tile, band.speed);
    // a town passing in the middle ground (batch 6): before the air, so the haze over the plain lies on it as on the hills
    const stationList = stationsOf(S.src, frame.song);
    S.stations = R ? passTowns(ctx, stationList, L, t, LT, dpr, weather) : [];
    const air = ctx.createLinearGradient(0, HORIZON - 150, 0, HORIZON + 40);
    air.addColorStop(0, css(LT.air.c, 0)); air.addColorStop(.8, css(LT.air.c, LT.air.a)); air.addColorStop(1, css(LT.air.c, 0));
    ctx.fillStyle = air; ctx.fillRect(L.left - 10, HORIZON - 150, L.Wm + 20, 190);
    if (weather?.rain && storm > .003) rain.drawStormLight?.(ctx, L, storm, weather?.tension, weather?.lightning?.intensity || 0);
    if (weather?.snow) {
      // Mid-distance blizzard snow-mist veil so distant towns & mountain feet recede deeper into fog than foreground poles.
      const midMist = ctx.createLinearGradient(0, HORIZON - 120, 0, M_BOTTOM);
      const ma = .12 + .24 * storm;
      midMist.addColorStop(0, 'rgba(214,226,238,0)');
      midMist.addColorStop(.45, 'rgba(214,226,238,' + ma.toFixed(4) + ')');
      midMist.addColorStop(1, 'rgba(214,226,238,' + (ma * .45).toFixed(4) + ')');
      ctx.fillStyle = midMist;
      ctx.fillRect(L.left - 10, HORIZON - 120, L.Wm + 20, M_BOTTOM - HORIZON + 130);
    } else if (weather?.sand) {
      // Mid-distance ochre dust-haze veil so distant towns & mountain feet fade naturally into the approaching haboob.
      const midDust = ctx.createLinearGradient(0, HORIZON - 130, 0, M_BOTTOM);
      const da = .14 + .28 * storm;
      midDust.addColorStop(0, 'rgba(196,142,84,0)');
      midDust.addColorStop(.45, 'rgba(196,142,84,' + da.toFixed(4) + ')');
      midDust.addColorStop(1, 'rgba(176,120,64,' + (da * .52).toFixed(4) + ')');
      ctx.fillStyle = midDust;
      ctx.fillRect(L.left - 10, HORIZON - 130, L.Wm + 20, M_BOTTOM - HORIZON + 140);
    }
    const flowTrack = R?.flow?.ballast && R.flow.rail;
    const bedY = 820;
    const ballastTop = flowTrack ? FLOW.ballast.y0 : R?.bed ? bedY - 6 : M_BOTTOM;
    const groundY = (ballastTop - M_TOP) / M_H;
    const rainFront = weather?.rain && rain.drawRainFront?.(ctx,
      {x: L.left, y: M_TOP, w: L.Wm, h: M_H}, t, weather, groundY);
    // the roadside option arrives with the frame (XML's settings pass it once batch 4 wires it; default off)
    S.roadside = roadside(ctx, S.src, L, t, LT, dpr, frame.terrainRoadside || (frame.options && frame.options.terrainRoadside) || 'off', stationList, weather);
    if (flowTrack) {
      loop(R.flow.ballast, speedAtY(828));
      paintTrackShoulder(ctx, L, t, groundStage, ballastTop);
      loop(R.flow.rail, speedAtY(828));
      paintRailHeads(ctx, L, t, groundStage, sun, true);
    }
    else if (R && R.bed) {
      const y = bedY, g = ctx.createLinearGradient(0, y - 4, 0, M_BOTTOM);
      g.addColorStop(0, 'rgba(110,98,80,0)'); g.addColorStop(.35, 'rgba(110,98,80,.9)'); g.addColorStop(1, 'rgba(80,72,60,1)');
      ctx.fillStyle = g; ctx.fillRect(L.left - 10, y - 4, L.Wm + 20, M_BOTTOM - y + 8);
      strip(R.bed, speedAtY(828));
      paintTrackShoulder(ctx, L, t, groundStage, ballastTop);
      paintRailHeads(ctx, L, t, groundStage, sun, false);
    }
    if (R) S.stations.push(...passNear(ctx, stationList, L, t, LT, dpr, weather)); // crossing, then platform and signs
    if (sun) drawClearBeams(ctx, L, t, sun);
    ctx.restore();
    if (weather?.rain) rain.drawAirRain?.(ctx, win, t, weather, groundY, rainFront);
    ctx.restore();
    if (weather?.snow || weather?.sand) {
      const bar = transomOf(L);
      const paintWeather = weather.snow ? rain?.drawBlizzard : rain?.drawSandstorm;
      paintWeather?.(ctx, win, t, weather, dpr, (bar.y - win.y) / Math.max(1, win.h), groundY);
    }
    if (weather?.rain && base && base.b === 0 && base.c === 0) {
      // The exterior is complete. The transom, curtains, glass reflections and LED are painted afterwards.
      const bar = transomOf(L);
      const exterior = {x: base.e + win.x * base.a, y: base.f + win.y * base.d, w: win.w * base.a, h: win.h * base.d};
      ctx.save();
      roundRect(ctx, win.x, win.y, win.w, win.h, win.r); ctx.clip();
      rain.drawGlass(ctx, exterior, win, frame.song, t, weather,
        (frame.terrainGlassDrops ?? frame.options?.terrainGlassDrops) !== false, (bar.y - win.y) / Math.max(1, win.h));
      ctx.restore();
      if (R?.reflections) {
        ctx.save();
        ctx.globalAlpha *= 1 - smooth(.02, .25, weather.humidity || 0);
        ctx.drawImage(R.reflections, 0, 0, L.w, L.h);
        ctx.restore();
      }
    }
    if (R) {
      const strength = frame.terrainCabinReflection ?? frame.options?.terrainCabinReflection ?? CABIN_REFLECTION_STRENGTH;
      if (strength > 0) {
        const r = R.cabinReflection;
        ctx.save();
        ctx.globalAlpha *= clamp(strength) * (weather?.sand ? .60 : weather?.snow ? .78 : 1);
        ctx.drawImage(r.c, r.x, r.y, r.w, r.h);
        ctx.restore();
      }
      ctx.drawImage(R.overlay, 0, 0, L.w, L.h);
    }
    paintCarriageLighting(ctx, L, weather, sun);
    if (R) drawCabinDrapes(ctx, R.drapes, weather, sun);
    if (sun) drawCabinSunMotes(ctx, L, t, sun);
    const tile = grain();
    if (tile && typeof ctx.createPattern === 'function') {
      let p = patterns.get(ctx);
      if (!p) { p = ctx.createPattern(tile, 'repeat'); patterns.set(ctx, p); }
      if (p) { ctx.save(); ctx.setTransform(1, 0, 0, 1, 0, 0); ctx.fillStyle = p; ctx.fillRect(0, 0, ctx.canvas ? ctx.canvas.width : L.w * dpr, ctx.canvas ? ctx.canvas.height : L.h * dpr); ctx.restore(); }
    }
    S.carriage = carriage(ctx, frame, S, dpr, weather, sun);
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
    if (!LT.castA) return;
    len *= LT.castLen; a *= LT.castA;
    if (len > 2) groundShadow(c, x + len * .46, y + len * .023, len * .55, Math.max(1.4, w * .55), a, .05);
    const cw = Math.min(w * 1.1 + 1.5, 14);
    groundShadow(c, x + cw * .25, y + .5, cw, Math.max(1.2, cw * .2), Math.min(.6, a * 1.6), 0);
  }
  function groundShadow(g, x, y, rx, ry, alpha, tilt) {
    g.save();
    g.translate(x, y);
    g.rotate(Math.atan(tilt));
    g.scale(rx, ry);
    const fade = g.createRadialGradient(-.22, 0, 0, 0, 0, 1);
    fade.addColorStop(0, css(CAST, alpha));
    fade.addColorStop(.52, css(CAST, alpha * .43));
    fade.addColorStop(1, css(CAST, 0));
    g.fillStyle = fade;
    g.fillRect(-1, -1, 2, 2);
    g.restore();
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
    crash(c, LT, M, vel) { // windpump tower, fixed tail and stock tank
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
      const cx = -.2 * M, cy = top - .3 * M;
      c.fillStyle = css(col);
      c.beginPath(); c.moveTo(cx + .2 * M, cy - .1 * M); c.lineTo(cx + 2.4 * M, cy - .25 * M); c.lineTo(cx + 2.6 * M, cy - 1.0 * M); c.lineTo(cx + 3.4 * M, cy - .9 * M); c.lineTo(cx + 3.3 * M, cy + .5 * M); c.lineTo(cx + 2.5 * M, cy + .35 * M); c.lineTo(cx + .2 * M, cy + .15 * M); c.closePath(); c.fill();
    }
  };
  // sprite bounds in metres around the base point: [left, top, right, bottom]; the shadow runs right
  const BOUNDS = {pole: [-2, -11, 20, 1], stub: [-1, -3.2, 6, 1], fence: [-1, -2.4, 5, 1], tom: [-2.4, -2.4, 6, 1], post: [-1, -3, 6, 1], crash: [-2.5, -12.5, 18, 1.2]};
  // ---- batch 7: the roadside from GPT's pictures. Same lines, same heights as the code's things, the shadow on the ground
  // and the motion blur still the program's; which picture of a kind = a hash of "the how-many-th of its line in this
  // song" (artVariant). Painters work in sketch px around the base point; box() is the sprite's extent (shadow included).
  // The telegraph wires hang from each pole picture's insulator tops (measured on the originals, px, left to right).
  const POLE_TIPS = [[[100, 98], [178, 98], [256, 98]], [[50, 128], [105, 128], [232, 128], [285, 128]], [[128, 128], [291, 153]], [[94, 84], [147, 84], [266, 84], [319, 84]]];
  // Measured windpump hubs and wheel sizes (NOTES.md, tower px).
  const PUMP = [{hub: [191, 192], wheel: 392}, {hub: [203, 94], wheel: 413}, {hub: [205, 290], wheel: 348}], PUMP_TALL = 938;
  const WHEEL_PERIOD = 6, BIRD_FLAPS = 3.2;
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
  const wheelAngle = (t, i, windTravel = 0) => ((t + 2.3 * windTravel) / WHEEL_PERIOD + hash(i, 209)) % 1 * Math.PI * 2;
  function wheelPlace(a, M, vel, v) {
    const f = pumpF(M, vel), {hub, wheel} = PUMP[v];
    return {dx: (hub[0] - a.anchor[0]) * f, dy: (hub[1] - a.anchor[1]) * f, size: wheel * f};
  }
  function drawWheel(ctx, x, y, M, vel, variant, angle, LT, material) {
    let cx, cy, rx, ry;
    if (ART) {
      const rotor = pic('roadside/windpump-wheel-a'), tower = pic(artKey.crash(variant));
      if (!rotor || !tower) return;
      const {dx, dy, size} = wheelPlace(tower, M, vel, variant);
      cx = x + dx; cy = y + dy; rx = ry = size * .455;
      ctx.save(); ctx.translate(cx, cy); ctx.rotate(angle);
      put(ctx, rotor, 0, 0, size / rotor.ow);
      ctx.restore();
    } else {
      const s = .9 + .2 * vel / 127, R = 1.55 * M * s;
      cx = x - .2 * M; cy = y - 9 * M * s - .3 * M; rx = R * .55; ry = R;
      const col = css(mix(IRON, LT.haze, .16 + .18 * material.amount));
      ctx.save();
      ctx.strokeStyle = col; ctx.lineCap = 'round'; ctx.lineWidth = Math.max(.8, .1 * M);
      ctx.beginPath(); ctx.ellipse(cx, cy, rx, ry, 0, 0, Math.PI * 2); ctx.stroke();
      ctx.beginPath();
      for (let b = 0; b < 18; b++) {
        const a = angle + b / 18 * Math.PI * 2, co = Math.cos(a), si = Math.sin(a);
        ctx.moveTo(cx + co * R * .12, cy + si * R * .2); ctx.lineTo(cx + co * rx, cy + si * ry);
      }
      ctx.stroke();
      ctx.fillStyle = col; ctx.beginPath(); ctx.arc(cx, cy, .25 * M, 0, Math.PI * 2); ctx.fill();
      ctx.restore();
    }
    const {kind, amount} = material;
    if (kind !== 'clear' && amount <= 0) return;
    ctx.save();
    ctx.lineCap = 'round';
    ctx.lineWidth = .9 + 1.1 * amount;
    ctx.strokeStyle = kind === 'snow' ? css(ROAD_SNOW, .87 * amount)
      : kind === 'sand' ? css(ROAD_DUST, .7 * amount)
      : kind === 'rain' ? css(ROAD_WATER, .68 * amount) : css(LT.light, .62);
    ctx.beginPath();
    if (kind === 'rain') {
      for (const start of [3.8, 4.26]) {
        ctx.moveTo(cx + rx * Math.cos(start), cy + ry * Math.sin(start));
        ctx.ellipse(cx, cy, rx, ry, 0, start, start + .13);
      }
    } else {
      const arc = kind === 'snow' ? [4.05, 5.21] : kind === 'sand' ? [5.62, 6.52] : [3.44, 4.35];
      ctx.ellipse(cx, cy, rx, ry, 0, arc[0], arc[1]);
    }
    ctx.stroke();
    ctx.restore();
  }
  const ROAD_SNOW = rgb('#e6f0f9'), ROAD_DUST = rgb('#d6a06a'), ROAD_WATER = rgb('#bacbd1');
  const spriteCache = new Map();
  function roadMaterial(weather, LT) {
    const kind = weather?.snow || LT.weatherSnow ? 'snow' : weather?.sand || LT.weatherSand ? 'sand'
      : weather?.rain ? 'rain' : 'clear';
    const drive = clamp(weather?.stormDrive || 0);
    const amount = kind === 'clear' ? 0
      : clamp(weather?.surface ?? (kind === 'rain' ? drive : Math.max(.25, drive)));
    return {kind, amount, drive};
  }
  function roadFinish(g, shape, B, box, M, type, variant, LT, kind) {
    const {k, x0, y0, w, h} = box;
    const [left, top, right, bottom] = B;
    const wood = type === 'pole' || type === 'stub' || type === 'fence';
    const sage = type === 'tom' && variant < 4;
    const useShape = (dx = 0, dy = 0) => g.drawImage(shape, x0 + dx, y0 + dy, shape.width / k, shape.height / k);
    const paintBounds = () => g.fillRect(x0, y0, w + 1 / k, h + 1 / k);
    const edge = (dx, dy, color) => {
      useShape();
      g.globalCompositeOperation = 'destination-out';
      useShape(dx, dy);
      g.globalCompositeOperation = 'source-in';
      g.fillStyle = color; paintBounds();
      g.globalCompositeOperation = 'source-over';
    };
    if (kind === 'snow') {
      // Only surfaces with open sky above retain snow. Keep thin tower braces and individual branches visible.
      const depth = (sage ? .14 : type === 'tom' ? .19 : type === 'crash' ? .075 : .105) * M;
      const frost = g.createLinearGradient(0, top, 0, Math.max(top + 1, bottom));
      frost.addColorStop(0, css(ROAD_SNOW, .96));
      frost.addColorStop(.64, css(ROAD_SNOW, .77));
      frost.addColorStop(1, css(ROAD_SNOW, sage ? .46 : .31));
      edge(0, depth, frost);
      return;
    }
    if (kind === 'sand') {
      // The right edge is burnished. Heavier grains settle on the left at the feet of the object.
      edge(-.09 * M, 0, css(ROAD_DUST, sage ? .47 : .72));
      const spread = type === 'tom' ? .74 : type === 'crash' ? .57 : .3;
      const dust = g.createLinearGradient(0, -.15 * M, 0, .12 * M);
      dust.addColorStop(0, css(ROAD_DUST, 0));
      dust.addColorStop(.65, css(ROAD_DUST, .67));
      dust.addColorStop(1, css(ROAD_DUST, 0));
      g.fillStyle = dust;
      g.beginPath(); g.ellipse(-spread * M * .46, -.01 * M, spread * M, .13 * M, 0, 0, Math.PI * 2); g.fill();
      return;
    }
    if (kind === 'clear') {
      edge(.08 * M, .035 * M, css(LT.light, wood ? .48 : .36));
    } else {
      useShape();
      g.globalCompositeOperation = 'source-in';
      const film = g.createLinearGradient(left, top, Math.min(right, left + 2.1 * M), bottom);
      film.addColorStop(0, css(ROAD_WATER, .23));
      film.addColorStop(.34, css([28, 36, 39], sage ? .27 : wood ? .52 : .35));
      film.addColorStop(.8, css([27, 34, 39], wood ? .67 : .48));
      film.addColorStop(1, css([26, 29, 31], .56));
      g.fillStyle = film; paintBounds();
      g.globalCompositeOperation = 'source-over';
    }
    if (wood) {
      // Fine, broken vertical grain, clipped to the shaft; the crossarms catch light on their top edges.
      const cover = makeCanvas(shape.width, shape.height);
      const grain = cover && cover.getContext('2d');
      if (grain) {
        grain.setTransform(k, 0, 0, k, -x0 * k, -y0 * k);
        grain.lineWidth = Math.max(.48, .026 * M);
        for (let j = 0; j < 13; j++) {
          const key = variant * 17 + j, x = (hash(key, 227) - .5) * (type === 'pole' ? .36 : .26) * M;
          const y = lerp(top, bottom, hash(key, 228)), len = (.22 + .59 * hash(key, 229)) * M;
          grain.strokeStyle = kind === 'clear' ? css(j % 2 ? LT.light : DARKWOOD, .36)
            : css(j % 2 ? ROAD_WATER : DARKWOOD, j % 2 ? .35 : .49);
          grain.beginPath(); grain.moveTo(x, y); grain.quadraticCurveTo(x - .034 * M, y + len * .47, x + .02 * M, y + len); grain.stroke();
        }
        grain.globalCompositeOperation = 'destination-in';
        grain.drawImage(shape, x0, y0, shape.width / k, shape.height / k);
        g.drawImage(cover, x0, y0, cover.width / k, cover.height / k);
      }
    }
  }
  function sprite(L, LT, dpr, type, y, vel, variant, blurK = 1, kind = 'clear') {
    const rv = repVel(type, vel), key = [lightIds.get(LT), L.s, dpr, type, y, rv, variant, blurK, MODE(), kind].join('|');
    if (spriteCache.has(key)) return spriteCache.get(key);
    const M = mAtY(y), blur = speedAtY(y) * BLUR * blurK, P = ART ? artPlan(type, M, rv, variant) : null;
    if (ART && !P) return null;
    const fallback = BOUNDS[type].map(n => n * M);
    const B = P ? boxOf(P[0], P[1]) : [fallback[0], fallback[1], 1.7 * M, fallback[3]];
    const bounds = P ? unionBox(B, shadowBox(P[2], P[3])) : fallback;
    const e = 1 + .07 * M, k = L.s * dpr;
    const x0 = bounds[0] - blur - e, y0 = bounds[1] - e;
    const w = bounds[2] - bounds[0] + 2 * blur + 2 * e, h = bounds[3] - bounds[1] + 2 * e;
    const canvas = () => makeCanvas(w * k, h * k);
    const context = c => { const g = c.getContext('2d'); g.setTransform(k, 0, 0, k, -x0 * k, -y0 * k); return g; };
    const a = canvas();
    if (!a) return null;
    const g = context(a), shape = canvas(), shapeCtx = context(shape);
    if (P) {
      shadow(g, LT, 0, 0, P[2], P[3], P[4]);
      put(shapeCtx, P[0], 0, 0, P[1]);
    } else {
      PAINT[type](g, LT, M, rv, variant);
      PAINT[type](shapeCtx, {...LT, castA: 0}, M, rv, variant);
    }
    if (P) g.drawImage(shape, x0, y0, shape.width / k, shape.height / k);
    const finish = canvas();
    const skin = context(finish);
    roadFinish(skin, shape, B, {k, x0, y0, w, h}, M, type, variant, LT, kind);
    if (type === 'pole' && (kind === 'clear' || kind === 'rain')) {
      const py = -poleH(M, rv) + .31 * M;
      const tips = P ? POLE_TIPS[variant].map(([x, y]) => [(x - P[0].anchor[0]) * P[1], (y + 6 - P[0].anchor[1]) * P[1]])
        : [-1.1, -.45, .45, 1.1].map(x => [x * M, py]);
      skin.fillStyle = css(kind === 'rain' ? ROAD_WATER : LT.light, kind === 'rain' ? .77 : .82);
      for (const [x, y] of tips) {
        skin.beginPath(); skin.ellipse(x - .021 * M, y + .04 * M, .044 * M, .025 * M, -.3, 0, Math.PI * 2); skin.fill();
      }
    }
    if (kind === 'clear') g.drawImage(finish, x0, y0, finish.width / k, finish.height / k);
    const soften = src => {
      if (blur * k < 1.5) return src;
      const b = canvas(), bg = b.getContext('2d'), K = Math.max(5, Math.round(blur * k));
      bg.globalCompositeOperation = 'lighter'; bg.globalAlpha = 1 / K;
      for (let q = 0; q < K; q++) bg.drawImage(src, (q / (K - 1) - .5) * blur * k, 0);
      return b;
    };
    const out = {c: soften(a), finish: kind === 'clear' ? null : soften(finish), x0, y0, w, h};
    if (spriteCache.size >= 240) spriteCache.delete(spriteCache.keys().next().value);
    spriteCache.set(key, out);
    return out;
  }
  const stamp = (ctx, sp, x, y, scale = 1, coverage = 0) => {
    if (!sp) return;
    const dx = x + sp.x0 * scale, dy = y + sp.y0 * scale, w = sp.w * scale, h = sp.h * scale;
    ctx.drawImage(sp.c, dx, dy, w, h);
    if (sp.finish && coverage > 0) {
      ctx.save(); ctx.globalAlpha *= coverage;
      ctx.drawImage(sp.finish, dx, dy, w, h);
      ctx.restore();
    }
  };
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
  function warmRoad(src, road, L, LT, dpr, mode, kind) {
    const key = [lightIds.get(LT), L.s, dpr, mode, MODE(), kind].join('|');
    if (src.roadWarm === key) return;
    src.roadWarm = key;
    const has = list => ({lo: list.some(o => o.v < 64), hi: list.some(o => o.v >= 64)});
    const vels = list => { const h = has(list); return [h.lo ? 32 : null, h.hi ? 96 : null].filter(v => v !== null); };
    const warm = (type, y, vel, variant, blur) => sprite(L, LT, dpr, type, y, vel, variant, blur, kind);
    if (ART) { // every picture variant the lines can ask for
      for (const b of [0, 1, 2, 3]) if (road.pole.some(o => o.tall && vBucket(o.v) === b)) for (let k = 0; k < 4; k++) warm('pole', LINE.pole, vOf(b), k);
      for (const v of vels(road.pole.filter(o => !o.tall))) for (let k = 0; k < 2; k++) warm('stub', LINE.pole, v, k);
      for (const v of vels(road.post)) for (let k = 0; k < 5; k++) warm('post', LINE.post, v, k, .45);
      if (mode !== 'all') return;
      for (const v of vels(road.fence)) for (let k = 0; k < 6; k++) warm('fence', LINE.fence, v, k);
      for (const v of vels(road.tom)) for (let k = 0; k < 8; k++) warm('tom', LINE.tom, v, k);
      for (const v of vels(road.crash)) for (let k = 0; k < 3; k++) warm('crash', LINE.crash, v, k);
      return;
    }
    for (const b of [0, 1, 2, 3]) if (road.pole.some(o => o.tall && vBucket(o.v) === b)) warm('pole', LINE.pole, vOf(b), 0);
    for (const v of vels(road.pole.filter(o => !o.tall))) warm('stub', LINE.pole, v, 0);
    for (const v of vels(road.post)) for (const k of [0, 1]) warm('post', LINE.post, v, k, .45);
    if (mode !== 'all') return;
    for (const v of vels(road.fence)) for (let k = 0; k < 9; k++) warm('fence', LINE.fence, v, k);
    for (const v of vels(road.tom)) for (let k = 0; k < 8; k++) warm('tom', LINE.tom, v, k);
    for (const v of vels(road.crash)) warm('crash', LINE.crash, v, 0);
  }
  function poleEntry(L, hit) {
    const y = LINE.pole, m = mAtY(y);
    // The tall shaft reaches the tieback. A stub first clears the cloth near its own top.
    const vel = repVel('stub', hit.v);
    const shortHeight = ART ? stubH(m, vel) : (2 + .5 * vel / 127) * m;
    const bodyY = hit.tall ? M_TOP + .60 * M_H : y - .92 * shortHeight;
    return L.entryAt(bodyY);
  }
  function wetWire(ctx, xa, ya, xb, yb, sag, key) {
    const point = u => [lerp(xa, xb, u), lerp(ya, yb, u) + 4 * sag * u * (1 - u)];
    for (let j = 0; j < 3; j++) {
      const u = (j + .12 + .62 * hash(key + j, 231)) / 3;
      const du = Math.min(.045, 3.8 / Math.max(1, Math.abs(xb - xa)));
      ctx.moveTo(...point(u)); ctx.lineTo(...point(u + du));
    }
  }
  function roadside(ctx, src, L, t, LT, dpr, mode, stations, weather) {
    const yields = (line, T) => yieldsTo(stations, line, T);
    const crossesSign = (T0, T1) => signsBetween(stations, T0, T1);
    if (mode !== 'all' && mode !== 'kick-snare') return null;
    const material = roadMaterial(weather, LT), {kind, amount, drive} = material;
    const isSnow = kind === 'snow', isSand = kind === 'sand', isRain = kind === 'rain';
    const wireShine = isRain ? clamp(.73 * amount + .24 * (weather?.lightning?.intensity || 0) * amount) : 0;
    const flight = (o, x, y, M, key) => {
      if (!o.n) return;
      const launch = weather?.stormDriveAt?.(o.t) ?? drive;
      if ((isSnow && launch >= .40) || (isSand && launch >= .35) || (isRain && launch >= .56)) return;
      const n = isRain && launch >= .21 ? Math.min(o.n, 1) : o.n;
      birds(ctx, x, y, M, t - o.t, key, n);
    };
    const road = roadLines(src), counts = {}, poles = [];
    warmRoad(src, road, L, LT, dpr, mode, kind);
    const prop = (type, y, vel, variant, blur) => sprite(L, LT, dpr, type, y, vel, variant, blur, kind);
    const place = (sp, x, y, scale) => stamp(ctx, sp, x, y, scale, amount);
    // the plain stays bare: nothing that would be in the window before the plain ends or after it starts again
    const visible = (list, y, padL, padR) => {
      const sp = speedAtY(y), entry = L.entryAt(y);
      const lo = t + (L.left - padL - entry) / sp, hi = t + (L.right + padR - entry) / sp;
      const from = Math.max(src.plainStart + (L.right - entry) / sp, lo), to = Math.min(src.plainEnd - (entry - L.left) / sp, hi);
      const a = firstAt(list.times, from), b = firstAt(list.times, to);
      return {a, b, sp};
    };
    const X = (T, sp, entry) => pastEntry(entry, T, t, sp);
    const count = (k, n) => { counts[k] = (counts[k] || 0) + n; };
    const all = mode === 'all';
    if (all) { // windpumps and flocks on the far line
      const y = LINE.crash, M = mAtY(y);
      const entry = L.entryAt(y - 5.8 * M);
      let v = visible(road.crash, y, 20 * M + 70, 12 * M);
      ctx.save();
      if (isRain || isSnow || isSand) ctx.globalAlpha *= 1 - .27 * drive;
      for (let i = v.a; i < v.b; i++) { const o = road.crash[i]; if (yields('crash', o.t)) { count('yielded', 1); continue; } const x = X(o.t, v.sp, entry);
        const pv = ART ? artVariant('crash', i) : 0, tower = prop('crash', y, o.v, pv);
        if (!tower && !ART) continue;
        place(tower, x, y);
        drawWheel(ctx, x, y, M, repVel('crash', o.v), pv, wheelAngle(t, i, weather?.windTravel), LT, material);
      }
      ctx.restore();
      count('crash', v.b - v.a);
      v = visible(road.flock, y, 300, 300);
      for (let i = v.a; i < v.b; i++) { const o = road.flock[i], key = Math.round(o.t * 50); if (yields('crash', o.t)) { count('yielded', 1); continue; } flight(o, X(o.t, v.sp, L.entryAt(y - 65)), y, M * 1.6, key); }
      count('flock', v.b - v.a);
    }
    if (all) { // the fence: wires first, then the posts; birds lifting off it on a ride
      const y = LINE.fence, M = mAtY(y), list = road.fence, v = visible(list, y, 6 * M + 100, 300);
      const entry = L.entryAt(y - .8 * M);
      const drawFenceWires = (style, width, dy, spots = false) => {
        ctx.strokeStyle = style; ctx.lineWidth = width; ctx.beginPath();
        for (let i = Math.max(1, v.a); i <= Math.min(list.length - 1, v.b); i++) {
          const p = list[i - 1], q = list[i];
          if (q.t - p.t > 1.6 || p.t < src.plainStart || q.t > src.plainEnd || crossesSign(p.t, q.t)) continue;
          if (i - 1 < v.a - 1 || i > v.b) continue;
          const xa = X(p.t, v.sp, entry), xb = X(q.t, v.sp, entry), sag = Math.min(3, (xb - xa) * .006);
          for (const hh of [.4, .68, .95]) {
            const ya = y - hh * M * 1.3 + dy;
            if (spots) wetWire(ctx, xa, ya, xb, ya, sag, i * 11 + hh * 100);
            else { ctx.moveTo(xa, ya); ctx.quadraticCurveTo((xa + xb) / 2, ya + sag * 2, xb, ya); }
          }
        }
        ctx.stroke();
      };
      drawFenceWires(isSnow ? 'rgba(66,78,92,.44)' : isSand ? 'rgba(86,58,34,.46)' : 'rgba(52,46,40,.55)', 1, 0);
      if (isSnow && amount > 0) drawFenceWires(css(ROAD_SNOW, .54 * amount), .9, -.7);
      else if (wireShine > 0) drawFenceWires(css(ROAD_WATER, .66 * wireShine), .9, -.35, true);
      for (let i = v.a; i < v.b; i++) {
        const o = list[i], key = Math.round(o.t * 50), open = o.row === 3;
        if (crossesSign(o.t, o.t)) { count('yielded', 1); continue; }
        place(prop('fence', y, o.v, ART ? artVariant('fence', i, open) : open ? 6 + Math.floor(hash(key, 52) * 3) : Math.floor(hash(key, 51) * 6)), X(o.t, v.sp, entry), y);
      }
      count('fence', v.b - v.a);
      const r = visible(road.ride, y, 300, 300);
      for (let i = r.a; i < r.b; i++) { const o = road.ride[i], key = Math.round(o.t * 50); flight(o, X(o.t, r.sp, entry), y, M, key); }
      count('ride', r.b - r.a);
    }
    if (all) { // rock piles and sage, each at its own depth
      const y0 = LINE.tom, list = road.tom, v = visible(list, y0, 4 * mAtY(y0) + 100, 300);
      for (let i = v.a; i < v.b; i++) {
        const o = list[i], key = Math.round(o.t * 50), y = y0 + (hash(key, 81) - .5) * 14;
        if (yields('tom', o.t)) { count('yielded', 1); continue; } // inside a town's stretch (batch 7)
        const tv = Math.floor(hash(key, 71) * 8); // sage (0-3) or a rock pile (4-7); with pictures the picture by its place in the line
        place(prop('tom', y0, o.v, ART ? (tv < 4 ? 0 : 4) + Math.floor(hash(i, 205) * 4) : tv), X(o.t, speedAtY(y), L.entryAt(y - .7 * mAtY(y)) + .7 * mAtY(y)), y, mAtY(y) / mAtY(y0));
      }
      count('tom', v.b - v.a);
    }
    { // telegraph poles (kick): a kick right after a tall pole is a stub with a guy wire up to that pole
      const y = LINE.pole, M = mAtY(y), list = road.pole, v = visible(list, y, 20 * M, 400);
      const poleX = o => X(o.t, v.sp, poleEntry(L, o));
      const tops = (o, i) => {
        const x = poleX(o);
        if (ART) return poleTips(M, repVel('pole', o.v), artVariant('pole', i)).map(p => [x + p[0], y + p[1]]);
        const H = 9.5 * M * (.95 + .1 * repVel('pole', o.v) / 127), ay = y - (H - .55 * M) - .24 * M; return [-1.1, -.45, .45, 1.1].map(dx => [x + dx * M, ay]);
      };
      const drawTelegraphWires = (style, width, dy, spots = false) => {
        ctx.strokeStyle = style; ctx.lineWidth = width; ctx.beginPath();
        let prev = null, prevI = -1;
        for (let i = Math.max(0, v.a - 1); i <= Math.min(list.length - 1, v.b); i++) {
          const o = list[i]; if (!o.tall) continue;
          if (crossesSign(o.t, o.t)) { prev = null; continue; }
          if (prev && o.t - prev.t <= 3 && prev.t >= src.plainStart && o.t <= src.plainEnd && !crossesSign(prev.t, o.t)) {
            const a = tops(prev, prevI), b = tops(o, i), sag = Math.min(1.1 * M, Math.abs(b[0][0] - a[0][0]) * .045);
            for (let j = 0; j < 4; j++) {
              const [xa, ya] = a[j], [xb, yb] = b[j];
              if (spots) wetWire(ctx, xa, ya + dy, xb, yb + dy, sag, i * 41 + j * 5);
              else { ctx.moveTo(xa, ya + dy); ctx.quadraticCurveTo((xa + xb) / 2, (ya + yb) / 2 + sag * 2 + dy, xb, yb + dy); }
            }
          }
          prev = o; prevI = i;
        }
        ctx.stroke();
      };
      drawTelegraphWires(isSnow ? 'rgba(54,66,78,.56)' : isSand ? 'rgba(78,52,30,.54)' : 'rgba(34,32,30,.6)', 1.1, 0);
      if (isSnow && amount > 0) drawTelegraphWires(css(ROAD_SNOW, .68 * amount), 1.25, -1.15);
      else if (isSand && amount > 0) drawTelegraphWires(css(ROAD_DUST, .29 * amount), 1, -.75);
      else if (wireShine > 0) drawTelegraphWires(css(ROAD_WATER, wireShine), 1, -.42, true);
      let tall = null;
      for (let i = v.a - 1; i >= 0; i--) if (list[i].tall && !crossesSign(list[i].t, list[i].t)) { tall = list[i]; break; }
      ctx.strokeStyle = 'rgba(34,32,30,.55)'; ctx.lineWidth = 1; ctx.beginPath();
      for (let i = v.a; i < v.b; i++) {
        const o = list[i], x = poleX(o);
        if (crossesSign(o.t, o.t)) { count('yielded', 1); continue; }
        poles.push({t: o.t, x, tall: o.tall});
        if (o.tall) { place(prop('pole', y, o.v, ART ? artVariant('pole', i) : 0), x, y); tall = o; count('kick', 1); continue; }
        const sv = ART ? artVariant('stub', i) : 0;
        place(prop('stub', y, o.v, sv), x, y); count('kickstub', 1);
        const first = i === 0 || list[i - 1].tall;
        if (tall && first && !crossesSign(tall.t, o.t)) { const h = ART ? stubTop(M, repVel('stub', o.v), sv) : (2.0 + .5 * repVel('stub', o.v) / 127) * M; ctx.moveTo(x, y - h); ctx.lineTo(poleX(tall), y - 5.5 * M); }
      }
      ctx.stroke();
    }
    { // mile posts and whistle posts (snare), half the blur so they read
      const y = LINE.post, M = mAtY(y), list = road.post, v = visible(list, y, 2 * M + 100, 300);
      const entry = L.entryAt(y - 1.02 * M);
      for (let i = v.a; i < v.b; i++) { const o = list[i]; if (yields('post', o.t)) { count('yielded', 1); continue; } const mile = hash(Math.round(o.t * 50), 91) < .68; // a mile post or a whistle post; with pictures the picture by its place in the line
        place(prop('post', y, o.v, ART ? (mile ? Math.floor(hash(i, 206) * 3) : 3 + Math.floor(hash(i, 207) * 2)) : mile ? 0 : 1, .45), X(o.t, v.sp, entry), y); }
      count('snare', v.b - v.a);
    }
    return Object.assign(counts, {poles});
  }

  // ---------- passing stations (batch 6): the route board's stations, out of the window ----------
  // The LED route board calls every section a station and moves its lamp at the moment a section starts. Out of the
  // window a fixed sign passes the "now" line at exactly that moment. A major section adds a platform in front of the
  // town. A major section is a chorus, interlude, instrumental or solo, identified by kind first and then by name.
  //   None on the plains at either end, none at the first section's start or the last one's end, none in a song
  //   without sections. Two changes less than 8 s apart: the later is a sign; less than 3 s: the later has none (counted
  //   from the last station drawn). Stations belong to the line, not to the roadside: they show with the roadside off too.
  // Ground model as the roadside's: a ground row y has M = .316 (y - 664) sketch px a metre and moves 5 (y - 664) sketch px
  // a second, so the train runs at V = 5 / .316 m/s. Its visible objects pass the right curtain at their song times.
  // Each kind is a sprite painted once per light, size and dpr (motion blur baked in) and only moved each frame.
  // Drawn after the round-8 sketch (mock8: A for the sign, C for the town), with the brief's changes for the town: about
  // 5-6 s in the window, no road reaching into the near ground, no taller than half the nearest range standing behind it
  // and no brighter than the hills (folded into the haze), four kinds chosen in turn by which big section of the song it is.
  const STATION = {signY: 802, townY: 736, xingY: 852, sign: 8, none: 3, townLead: 3, xingAfter: 1};
  const V_MS = GROUND_K / PX_PER_M;
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
    const rows = (Array.isArray(song && song.sections) ? song.sections : [])
      .filter(r => Array.isArray(r) && Number.isFinite(r[0]) && r[0] >= 0 && r[0] < src.duration)
      .sort((a, b) => a[0] - b[0])
      .filter((row, i, sorted) => !sorted[i + 1] || sorted[i + 1][0] !== row[0]);
    const Led = globalThis.XinScoreTerrainLed;
    const list = [], table = [];
    list.route = Led?.prepareRoute?.(rows);
    list.sections = rows.map((r, i) => [r[0], r[1], Led && Led.stationName
      ? Led.stationName(r[2], r[4], i)
      : String(r[2] || r[4] || 'Section ' + (i + 1)).toUpperCase()]);
    let last = null, majors = 0;
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
      const st = {t: T, kind, i, name: list.sections[i][2]};
      if (kind === 'town') {
        st.variant = ord % 4;
        // no taller than half the nearest range standing behind it at the change (its own height at "now")
        let behind = 0;
        try {
          for (const R of geometry(src, L0, T, 200)) { const j = Math.round((R.entryM - R.x0) / COL), hgt = R.foot[j] - R.ys[j]; if (hgt >= 20) { behind = hgt; break; } }
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
    list.times = list.map(st => st.t);
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
  function stationSurface(LT, weather) {
    const kind = weather?.snow || LT.weatherSnow ? 'snow' : weather?.sand || LT.weatherSand ? 'sand'
      : weather?.rain || LT.weatherOvercast ? 'rain' : 'sun';
    const wetness = kind === 'sun' ? 0 : clamp(weather?.surface || 0);
    const surface = Math.round(wetness * 6) / 6;
    return {kind, surface, wetness, wind: clamp(weather?.wind || 0), storm: clamp(weather?.stormDrive || 0), key: kind + '/' + surface};
  }
  // Measure a low-resolution roofline once from each original transparent cutout.
  const stationRooflines = new WeakMap();
  function stationRoofline(a) {
    if (stationRooflines.has(a)) return stationRooflines.get(a);
    const c = makeCanvas(64, 64), g = c?.getContext('2d', {willReadFrequently: true});
    const top = [];
    if (g && typeof g.getImageData === 'function') {
      const [l, t, r, b] = a.bbox, sx = a.img.width / a.ow, sy = a.img.height / a.oh;
      g.drawImage(a.img, l * sx, t * sy, (r + 1 - l) * sx, (b + 1 - t) * sy, 0, 0, 64, 64);
      const {data} = g.getImageData(0, 0, 64, 64);
      for (let x = 0; x < 64; x++) {
        let y = 0;
        while (y < 62 && (data[4 * (y * 64 + x) + 3] < 160 || data[4 * ((y + 1) * 64 + x) + 3] < 160)) y++;
        top.push(y < 62 ? y / 64 : null);
      }
    }
    stationRooflines.set(a, top);
    return top;
  }
  function stationRoof(g, points, W, thickness) {
    if (W.kind === 'sand' || (W.kind !== 'sun' && !W.surface)) return;
    g.beginPath();
    for (let i = 0; i < points.length; i++) i ? g.lineTo(...points[i]) : g.moveTo(...points[i]);
    g.lineJoin = 'round';
    if (W.kind === 'rain') {
      g.save(); g.translate(0, thickness * .65);
      g.beginPath();
      for (let i = 0; i < points.length; i++) i ? g.lineTo(...points[i]) : g.moveTo(...points[i]);
      g.strokeStyle = css([24, 43, 60], W.surface * .49); g.lineWidth = thickness * 1.3; g.stroke();
      g.restore();
      g.beginPath();
      for (let i = 0; i < points.length; i++) i ? g.lineTo(...points[i]) : g.moveTo(...points[i]);
    }
    g.strokeStyle = W.kind === 'snow' ? css([222, 235, 246], .72 + W.surface * .2)
      : W.kind === 'rain' ? css([140, 179, 202], W.surface * .45) : css([255, 207, 135], .49);
    g.lineWidth = W.kind === 'snow' ? thickness * (.45 + W.surface * .8) : Math.max(.8, thickness * .37);
    g.stroke();
  }
  function stationDrift(g, x, y, w, W) {
    if (!W.surface || (W.kind !== 'sand' && W.kind !== 'snow')) return;
    const h = clamp(w * .08, 2, 8) * W.surface;
    const grad = g.createLinearGradient(0, y - h, 0, y + h * .45);
    grad.addColorStop(0, W.kind === 'sand' ? 'rgba(215,168,105,.86)' : 'rgba(227,239,248,.9)');
    grad.addColorStop(1, W.kind === 'sand' ? 'rgba(169,113,62,0)' : 'rgba(188,209,224,0)');
    g.fillStyle = grad;
    g.beginPath();
    g.moveTo(x - w * .38, y);
    g.quadraticCurveTo(x + w * .02, y - h * 1.8, x + w * .2, y - h);
    g.quadraticCurveTo(x + w * .45, y - h * .65, x + w * .72, y + h * .45);
    g.lineTo(x - w * .38, y + h * .3);
    g.fill();
  }
  function stationArtRoof(g, a, x, y, b, W, type) {
    if (W.kind === 'sand' || (W.kind !== 'sun' && !W.surface)) return;
    const top = stationRoofline(a), width = b[2] - b[0], height = b[3] - b[1];
    const depth = Number.isFinite(type) ? type : type === 't' || type === 'c' ? .52 : .45;
    let edge = [];
    for (let i = W.kind === 'sun' ? 32 : 1; i < top.length - 1; i++) {
      const v = top[i];
      if (v === null || v > depth || top[i - 1] === null || Math.abs(v - top[i - 1]) > .085) {
        if (edge.length > 2) stationRoof(g, edge, W, clamp(height * .07, 2, 5));
        edge = [];
      } else edge.push([x + b[0] + (i + .5) * width / 64, y + b[1] + (v + .012) * height]);
    }
    if (edge.length > 2) stationRoof(g, edge, W, clamp(height * .07, 2, 5));
  }
  // ---- painters, sketch px around the base point; the sun is to the left and ahead: lit left faces, shadows to the right
  const tint = (LT, hex, k) => mix(mix(rgb(hex), LT.haze, k), LT.shade, .22); // into the haze, then a little down: never paler than the hills
  function box(g, x0, x1, h0, h1, fill) { g.fillStyle = fill; g.fillRect(x0, -h1, x1 - x0, h1 - h0); }
  function poly(g, pts, fill) { g.fillStyle = fill; g.beginPath(); pts.forEach((p, i) => i ? g.lineTo(p[0], -p[1]) : g.moveTo(p[0], -p[1])); g.closePath(); g.fill(); }
  function castShadow(g, LT, x0, x1, h, a) { // on the ground, to the right and a little toward us
    const len = 1.1 * h * (LT.castLen / 1.8);
    const width = x1 - x0, x = (x0 + x1) / 2, alpha = a * LT.castA;
    groundShadow(g, x + len * .39, len * .0195, len * .6 + width * .5, Math.max(1.3, width * .11), alpha, .05);
    groundShadow(g, x, .25, width * .60, Math.max(1, width * .06), alpha, 0);
  }
  // a town's things fold into the haze: mixed half-way into it and a touch darker, so nothing is brighter than the hills
  const TOWN_HAZE = .3;
  function silo(g, LT, x, r, h, col) {
    const gr = g.createLinearGradient(x - r, 0, x + r, 0);
    gr.addColorStop(0, css(mix(col, LT.light, .18))); gr.addColorStop(.4, css(col)); gr.addColorStop(1, css(mix(col, LT.shade, .3)));
    g.fillStyle = gr; g.beginPath(); g.moveTo(x - r, 0); g.lineTo(x - r, -h); g.ellipse(x, -h, r, r * .18, 0, Math.PI, 0); g.lineTo(x + r, 0); g.closePath(); g.fill();
  }
  function elevator(g, LT, x, H, W) { // three silos, a head house on top, a low annex to the right
    const conc = mix(tint(LT, '#8d8679', TOWN_HAZE), LT.shade, .06), dark = tint(LT, '#4c463f', TOWN_HAZE * .8);
    castShadow(g, LT, x - 30, x + 30, H * .8, .2);
    box(g, x - 7, x + 7, H * .78, H, css(mix(conc, LT.shade, .08)));
    box(g, x - 7, x - 4.5, H * .78, H, css(mix(conc, LT.light, .18)));
    poly(g, [[x - 8.5, H], [x + 8.5, H], [x + 5, H + 4], [x - 5, H + 4]], css(dark));
    for (const dx of [-17, 0, 17]) silo(g, LT, x + dx, 8.4, H * .76, conc);
    box(g, x + 26, x + 50, 0, H * .26, css(tint(LT, '#7d7365', TOWN_HAZE)));
    poly(g, [[x + 25, H * .26], [x + 51, H * .26], [x + 51, H * .31], [x + 25, H * .38]], css(dark));
    g.strokeStyle = css(dark); g.lineWidth = 1.2; g.beginPath(); g.moveTo(x + 7, -H * .86); g.lineTo(x + 38, -H * .3); g.stroke();
    stationRoof(g, [[x - 5, -H - 4], [x + 5, -H - 4], [x + 8.5, -H]], W, 3);
    for (const dx of [-17, 0, 17]) stationRoof(g, [[x + dx - 8, -H * .76], [x + dx, -H * .76 - 1.5], [x + dx + 8, -H * .76]], W, 2);
    stationRoof(g, [[x + 25, -H * .38], [x + 51, -H * .31]], W, 3);
    stationDrift(g, x + 14, 0, 64, W);
  }
  function waterTower(g, LT, x, H, W) {
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
    stationRoof(g, W.kind === 'sun' ? [[x, yr], [xb, y1]] : [[xa, y1], [x, yr], [xb, y1]], W, 3.5);
    stationDrift(g, x + w * .65, 0, w, W);
  }
  function house(g, LT, x, w, h, wall, roof, W) {
    const col = mix(tint(LT, wall, TOWN_HAZE), LT.shade, .05), rc = tint(LT, roof, TOWN_HAZE * .8), hr = h * 1.6;
    castShadow(g, LT, x - w / 2, x + w / 2, hr, .22);
    box(g, x - w / 2, x + w / 2, 0, h, css(col));
    box(g, x - w / 2, x - w / 2 + 2, 0, h, css(mix(col, LT.light, .25)));
    poly(g, [[x - w / 2 - 2, h], [x + w / 2 + 2, h], [x + w / 2 - w * .2, hr], [x - w / 2 + w * .2, hr]], css(rc));
    poly(g, [[x - w / 2 - 2, h], [x - w / 2 + w * .2, hr], [x - w / 2 + w * .2 + 2, hr], [x - w / 2, h]], css(mix(rc, LT.light, .25)));
    for (const k of [.25, .62]) box(g, x - w / 2 + w * k, x - w / 2 + w * k + w * .14, h * .32, h * .7, css(mix(col, LT.shade, .45)));
    stationRoof(g, [[x - w * .3, -hr], [x + w * .3, -hr], [x + w * .5, -h]], W, 4);
    if (W.kind !== 'sun') stationRoof(g, [[x - w * .5, -h], [x + w * .5, -h]], W, 3);
    stationDrift(g, x + w * .08, 0, w, W);
  }
  function tree(g, LT, x, H, seed, W) {
    const col = tint(LT, '#47503a', TOWN_HAZE * .9);
    castShadow(g, LT, x - H * .2, x + H * .2, H * .7, .16);
    box(g, x - 1.5, x + 1.5, 0, H * .45, css(tint(LT, '#3f352b', TOWN_HAZE)));
    for (let j = 0; j < 6; j++) {
      const r = hash(seed * 13 + j, 87), cx = x + (r - .5) * H * .45, cy = -H * (.55 + .3 * ((j * .37 + r) % 1));
      g.fillStyle = css(j < 2 ? mix(col, LT.light, .14) : col); g.beginPath(); g.ellipse(cx, cy, H * .22, H * .17, 0, 0, Math.PI * 2); g.fill();
      if (j < 3) stationRoof(g, [[cx - H * .12, cy - H * .13], [cx, cy - H * .17], [cx + H * .11, cy - H * .14]], W, 3.2);
    }
    stationDrift(g, x + H * .06, 0, H * .65, W);
  }
  function ground(g, LT, x0, x1) { // the dusty lot the town stands on, and a haze band over its feet
    g.fillStyle = css(mix(tint(LT, '#b9a77f', .3), LT.light, .05), .35); g.beginPath(); g.ellipse((x0 + x1) / 2, 2, (x1 - x0) / 2 + 20, 6, 0, 0, Math.PI * 2); g.fill();
  }
  // tall = the silo's / water tower's height; houses 22 px to the eaves (35 to the ridge), trees 40-60 px
  // (batch 7: the places widen with the town, k = townK(H))
  const TOWNS = [
    (g, LT, H, k, W) => { ground(g, LT, -140 * k, 125 * k); house(g, LT, -105 * k, 58, 22, '#8f8574', '#4a453f', W); tree(g, LT, -52 * k, 40, 1, W); waterTower(g, LT, 0, H, W); house(g, LT, 92 * k, 54, 21, '#7d665a', '#47423c', W); },
    (g, LT, H, k, W) => { ground(g, LT, -35 * k, 190 * k); elevator(g, LT, 0, H, W); house(g, LT, 112 * k, 58, 22, '#868d82', '#45413b', W); tree(g, LT, 165 * k, 44, 2, W); },
    (g, LT, H, k, W) => { ground(g, LT, -120 * k, 135 * k); house(g, LT, -86 * k, 58, 22, '#8f8574', '#4a453f', W); tree(g, LT, -36 * k, 50, 4, W); tree(g, LT, 0, Math.min(62, Math.max(46, H)), 3, W); house(g, LT, 62 * k, 54, 21, '#7d665a', '#47423c', W); tree(g, LT, 108 * k, 46, 5, W); },
    (g, LT, H, k, W) => { ground(g, LT, -225 * k, 225 * k); house(g, LT, -192 * k, 56, 22, '#868d82', '#45413b', W); tree(g, LT, -148 * k, 44, 6, W); waterTower(g, LT, -98 * k, H * .92, W); elevator(g, LT, 0, H, W); house(g, LT, 98 * k, 56, 22, '#8f8574', '#4a453f', W); house(g, LT, 158 * k, 50, 20, '#7d665a', '#47423c', W); tree(g, LT, 202 * k, 48, 7, W); }
  ];
  // The towns from GPT's pictures (batch 7): the same four kinds, things at the same places (x k), the tower / silo at
  // H, houses 0.3 H (28-44 px), trees 0.42 H (36-60), a depot where the code had a house beside a silo. Each thing gets
  // the program's cast shadow; weather follows individual roofs and footings.
  const ART_TOWNS = [
    [['house-a', -105, 'h'], ['tree-a', -55, 't'], ['T', 0, 'H'], ['house-b', 92, 'h']],
    [['E', 0, 'H'], ['depot-a', 125, 'd'], ['tree-b', 200, 't']],
    [['house-c', -86, 'h'], ['tree-c', -36, 't'], ['tree-d', 0, 'c'], ['house-d', 62, 'h'], ['tree-b', 108, 't']],
    [['house-e', -192, 'h'], ['tree-a', -148, 't'], ['T', -98, 'H92'], ['E', 0, 'H'], ['house-f', 98, 'h'], ['depot-b', 175, 'd'], ['tree-d', 245, 't']]];
  function artTown(g, LT, st, W) {
    const H = st.tall, k = st.k, hh = clamp(.3 * H, 28, 44), th = clamp(.42 * H, 36, 60);
    const size = {H, H92: H * .92, h: hh, d: hh * .95, t: th, c: clamp(.55 * H, 46, 80)};
    const sp = TOWN_SPAN[st.variant];
    ground(g, LT, sp[0] * k + 10, sp[1] * k - 10);
    const buildings = [];
    for (const [name, x0, sz] of ART_TOWNS[st.variant]) {
      const key = 'station/' + (name === 'T' ? 'town-water-tower-' + ABC[st.tv] : name === 'E' ? 'town-grain-elevator-' + ABC[st.ev] : 'town-' + name);
      const a = pic(key);
      if (!a) continue;
      const x = x0 * k, hgt = size[sz], f = hgt / tallOf(a), b = boxOf(a, f);
      castShadow(g, LT, x + b[0] * .8, x + b[2] * .8, hgt * (name === 'T' || name === 'E' ? .85 : 1.2), .2);
      put(g, a, x, 0, f);
      buildings.push({a, x, b, sz, roof: name === 'T' ? .23 : sz});
    }
    g.save(); g.globalCompositeOperation = 'source-atop';
    g.fillStyle = css(LT.haze, TOWN_HAZE); g.fillRect(-1e4, -1e4, 2e4, 2e4);
    g.restore();
    for (const {a, x, b, sz, roof} of buildings) {
      stationArtRoof(g, a, x, 0, b, W, roof);
      const footing = (b[2] - b[0]) * (sz === 't' || sz === 'c' ? .42 : .72);
      stationDrift(g, x + footing * .14, 0, footing, W);
    }
  }
  function townSprite(L, LT, dpr, st, W) {
    const v = st.variant, H = st.tall, k = st.k, sp = TOWN_SPAN[v];
    return bakeSprite(L, dpr, spriteKey(L, LT, dpr, 'town' + v + '@' + H + (ART ? '/' + st.tv + st.ev : '') + W.key), [sp[0] * k - 20, -Math.max(H, 80) - 20, sp[1] * k + 90, 12], speedAtY(STATION.townY) * BLUR,
      g => ART ? artTown(g, LT, st, W) : TOWNS[v](g, LT, H, k, W));
  }
  const PLATFORM_HALF = 210;
  const PLATFORM_LAMP = -PLATFORM_HALF + 24;
  const signHalf = name => clamp(14 + Array.from(name).length * 9, 66, 152);
  const signBoardBottom = st => st.kind === 'town' ? 51 : 37;
  // The enamel board has a straight left edge starting just below its rounded corner.
  const signEntry = (L, st) => L.entryAt(STATION.signY - signBoardBottom(st) - 36) + signHalf(st.name);
  function signsBetween(stations, T0, T1) {
    const speed = speedAtY(STATION.signY), padding = 26;
    const farthest = (PLATFORM_HALF + padding) / speed;
    for (let i = firstAt(stations.times, T0 - farthest); i < stations.length && stations[i].t <= T1 + farthest; i++) {
      const st = stations[i], span = ((st.kind === 'town' ? PLATFORM_HALF : signHalf(st.name)) + padding) / speed;
      if (st.t + span >= T0 && st.t - span <= T1) return true;
    }
    return false;
  }
  // The posts, lettering and platform share one trackside anchor. Limit the blur so the enamel lettering stays legible.
  function signSprite(L, LT, dpr, st, W) {
    const platform = st.kind === 'town', half = signHalf(st.name), extent = platform ? PLATFORM_HALF + 18 : half + 12;
    const boardBottom = signBoardBottom(st), boardTop = boardBottom + 40;
    return bakeSprite(L, dpr, spriteKey(L, LT, dpr, st.kind + '/enamel/' + st.name + '/' + W.key), [-extent, platform ? -138 : -boardTop - 6, extent, 25], speedAtY(STATION.signY) * BLUR * .12, g => {
      const iron = tint(LT, '#34433f', .07), border = tint(LT, '#3d4f45', .03);
      if (platform) {
        castShadow(g, LT, -PLATFORM_HALF, PLATFORM_HALF, 18, .48);
        poly(g, [[-PLATFORM_HALF, -10], [PLATFORM_HALF, -10], [PLATFORM_HALF - 12, 16], [-PLATFORM_HALF + 13, 16]], css(tint(LT, '#aca18b', .12)));
        if (W.kind === 'rain' && W.surface) {
          const wet = g.createLinearGradient(0, -16, 0, 10);
          wet.addColorStop(0, css([44, 58, 69], W.surface * .61));
          wet.addColorStop(.8, css([40, 58, 75], W.surface * .37));
          wet.addColorStop(1, css([145, 174, 190], W.surface * .58));
          poly(g, [[-PLATFORM_HALF, -10], [PLATFORM_HALF, -10], [PLATFORM_HALF - 12, 16], [-PLATFORM_HALF + 13, 16]], wet);
        } else if (W.kind === 'snow' && W.surface) {
          const snow = css([224, 237, 248], W.surface * .88);
          poly(g, [[-PLATFORM_HALF + 2, -9], [12, -7], [PLATFORM_HALF - 4, -10], [PLATFORM_HALF - 13, 15], [56, 10], [-56, 14], [-PLATFORM_HALF + 15, 15]], snow);
          stationRoof(g, [[-PLATFORM_HALF + 5, 8], [-83, 9], [38, 7.5], [171, 8.5], [PLATFORM_HALF - 3, 9]], W, 3);
        }
        box(g, -PLATFORM_HALF, PLATFORM_HALF, -17, -10, css(tint(LT, '#60564c', .09)));
        box(g, -PLATFORM_HALF + 2, PLATFORM_HALF - 2, -10, -7, css(tint(LT, '#d1c1a2', .06)));
        for (let x = -PLATFORM_HALF + 28; x < PLATFORM_HALF - 12; x += 37) {
          poly(g, [[x, -9], [x + .8, -9], [x + 1.8, 9], [x + 1, 9]], css(tint(LT, '#786c5e', .12), .55));
        }
        const lampX = PLATFORM_LAMP;
        box(g, lampX - 2, lampX + 2, 3, 113, css(iron));
        box(g, lampX - 3.6, lampX + 3.6, 3, 16, css(iron));
        g.strokeStyle = css(iron); g.lineWidth = 3.5;
        g.beginPath(); g.moveTo(lampX, -111); g.quadraticCurveTo(lampX + 12, -131, lampX + 23, -113); g.stroke();
        poly(g, [[lampX + 17, 114], [lampX + 29, 114], [lampX + 33, 108], [lampX + 13, 108]], css(iron));
        box(g, lampX + 18, lampX + 28, 106, 108, '#f4dfb0');
        stationRoof(g, [[lampX + 17, -114], [lampX + 29, -114], [lampX + 32, -109]], W, 2.8);
        if (W.kind === 'sand') {
          stationDrift(g, PLATFORM_HALF - 34, 13, 48, W);
          stationDrift(g, lampX + 10, 0, 21, W);
        }
      }
      for (const x of [-half + 15, half - 15]) {
        box(g, x - 3, x + 3, platform ? 1 : 0, boardTop - 3, css(iron));
        box(g, x - 3, x - 1.5, platform ? 1 : 0, boardBottom, css(mix(iron, LT.light, .32)));
        if (W.kind === 'sun') box(g, x + 1, x + 2.8, 1, boardBottom, 'rgba(255,193,111,.34)');
        stationDrift(g, x + 6, platform ? -2 : 0, 22, W);
      }
      g.fillStyle = css(border);
      roundRect(g, -half, -boardTop, half * 2, 40, 4); g.fill();
      const enamel = g.createLinearGradient(-half, -boardBottom, half, -boardTop);
      enamel.addColorStop(0, W.kind === 'sun' ? '#ddc9a4' : css(mix([230, 218, 190], LT.haze, .25)));
      enamel.addColorStop(1, W.kind === 'sun' ? '#fff1cb' : css(mix([245, 234, 210], LT.light, .15)));
      g.fillStyle = enamel;
      roundRect(g, -half + 2, -boardTop + 2, half * 2 - 4, 36, 2.8); g.fill();
      g.strokeStyle = css(mix(border, rgb('#baab84'), .5)); g.lineWidth = 1;
      roundRect(g, -half + 6, -boardTop + 6, half * 2 - 12, 28, 2); g.stroke();
      g.fillStyle = css(border);
      for (const x of [-half + 9, half - 9]) { g.beginPath(); g.arc(x, -boardTop + 20, 1.4, 0, 2 * Math.PI); g.fill(); }
      g.font = 'bold 27px Georgia, serif'; g.textAlign = 'center'; g.textBaseline = 'middle';
      g.fillText(st.name, 0, -boardTop + 21, half * 2 - 26);
      stationRoof(g, [[W.kind === 'sun' ? 0 : -half + 4, -boardTop + .5], [half - 4, -boardTop], [half - 1, -boardTop + 4]], W, 4);
    });
  }
  function stationLampVisibility(W) {
    return W.kind === 'sand' ? 1 - .4 * W.wind - .26 * W.storm
      : W.kind === 'snow' ? 1 - .23 * W.storm : W.kind === 'sun' ? .76 : .94;
  }
  function stationLampGlow(g, x, y, wide, high, color, alpha) {
    g.save(); g.translate(x, y); g.scale(wide, high);
    const glow = g.createRadialGradient(0, 0, 0, 0, 0, 1);
    glow.addColorStop(0, css(color, alpha)); glow.addColorStop(1, css(color, 0));
    g.fillStyle = glow; g.fillRect(-1, -1, 2, 2); g.restore();
  }
  // batch 7: the crossing as GPT's signal (4.4 m) and gate (its pivot .35 m right of the post, 1.05 m up, 7.7 m long);
  // lit = 'l' / 'r': only that lamp's glow layer, drawn over the unlit signal
  function crossingSprite(L, LT, dpr, st, W, lit) {
    const y = STATION.xingY, M = mAtY(y), xv = ART && st ? st.xv : 0;
    return bakeSprite(L, dpr, spriteKey(L, LT, dpr, 'xing' + (ART ? xv + (lit || '') : '') + (lit ? '' : W.key)), [-2.6 * M, -4.6 * M, 9.5 * M, .27 * M], speedAtY(y) * BLUR, g => {
      if (ART) {
        const sig = pic('station/crossing-signal-' + (lit ? 'lit-' + lit + '-' : '') + ABC[xv]), base = pic('station/crossing-signal-' + ABC[xv]), gate = pic('station/crossing-gate-a');
        if (!sig || !base) return;
        const f = 4.4 * M / tallOf(base);
        if (!lit && gate) {
          const gf = 7.7 * M / (gate.bbox[2] + 1 - gate.anchor[0]), gb = boxOf(gate, gf);
          put(g, gate, .35 * M, -1.05 * M, gf);
          stationArtRoof(g, gate, .35 * M, -1.05 * M, gb, W, .77);
        }
        put(g, sig, 0, 0, f);
        if (!lit) {
          stationArtRoof(g, base, 0, 0, boxOf(base, f), W, .36);
          stationDrift(g, .23 * M, 0, 24, W);
        }
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
      g.scale(1 / M, 1 / M);
      stationRoof(g, [[a0 * M, -(ah + .12) * M], [a1 * M, -(ah + .12) * M]], W, 3.4);
      stationRoof(g, [[-.9 * M, -3.25 * M], [.9 * M, -3.25 * M]], W, 2.6);
      stationDrift(g, .23 * M, 0, 24, W);
    });
  }
  // the crossing's lamps: one of the pair lit, swapping twice a song second (drawn live, they are two dots)
  function crossingLamps(ctx, x, y, t, W) {
    const M = mAtY(y), on = Math.floor(t * 2) % 2;
    const vis = stationLampVisibility(W);
    for (const [k, dx] of [[0, -.55], [1, .55]]) {
      const lx = x + dx * M, ly = y - 3.05 * M, r = .26 * M;
      ctx.fillStyle = k === on ? css([232, 74, 52], vis) : 'rgba(92,40,34,1)'; ctx.beginPath(); ctx.arc(lx, ly, r, 0, Math.PI * 2); ctx.fill();
      if (k === on) stationLampGlow(ctx, lx, ly, r * 3.2, r * 3.2, [255, 120, 90], .45 * vis);
    }
  }
  function crossingPlanks(g, LT, W, at, r0, r1, t) {
    const y0 = 814, y1 = M_BOTTOM + 2;
    g.save();
    g.beginPath();
    g.moveTo(at(r0, y0), y0); g.lineTo(at(r1, y0), y0);
    g.lineTo(at(r1, y1), y1); g.lineTo(at(r0, y1), y1); g.closePath();
    g.fillStyle = css(mix(rgb('#6f665a'), LT.haze, .1), .92); g.fill(); g.clip();
    if (W.kind === 'rain' && W.wetness) {
      const wet = g.createLinearGradient(0, y0, 0, y1);
      wet.addColorStop(0, css([64, 84, 99], .52 * W.wetness));
      wet.addColorStop(.8, css([22, 35, 46], .53 * W.wetness));
      wet.addColorStop(1, css([126, 157, 171], .43 * W.wetness));
      g.fillStyle = wet; g.fill();
    }
    for (let n = 1; n < 12; n++) {
      const m = lerp(r0, r1, n / 12), y = lerp(y0, y1, hash(n, 676));
      g.strokeStyle = css(LT.shade, .46); g.lineWidth = 1.35; g.beginPath();
      g.moveTo(at(m, y0), y0); g.lineTo(at(m, y1), y1); g.stroke();
      if (W.kind === 'rain' && W.wetness) {
        const alpha = W.wetness * (.22 + .08 * Math.sin(t * 4 + n));
        stationLampGlow(g, at(m + .1, y), y, 5 + 11 * hash(n, 677), 1.1, [158, 185, 201], alpha);
      }
    }
    if (W.kind === 'snow' || W.kind === 'sand') {
      for (const [min, max] of [[r0, r0 + .4], [r1 - .52, r1]]) {
        const tone = W.kind === 'snow' ? [222, 235, 246] : [214, 166, 103];
        g.fillStyle = css(tone, .85 * W.wetness); g.beginPath();
        g.moveTo(at(min, y0), y0); g.lineTo(at(max, y0), y0);
        g.lineTo(at(max + .15, y0 + 19), y0 + 19);
        g.lineTo(at(max, y1), y1); g.lineTo(at(min - .16, y1), y1);
        g.lineTo(at(min, y0 + 32), y0 + 32); g.fill();
      }
    }
    g.restore();
  }
  const inView = (L, x, sp) => sp && x + sp.x0 + sp.w > L.left - 4 && x + sp.x0 < L.right + 4;
  function passTowns(ctx, stations, L, t, LT, dpr, weather) {
    const out = [];
    if (!stations.length) return out;
    const W = stationSurface(LT, weather);
    const y = STATION.townY, sp = speedAtY(y);
    for (const st of stations) {
      if (st.kind !== 'town' || Math.abs(st.t - t) > 30) continue;
      const x = pastEntry(L.entryAt(y - .7 * st.tall), st.t, t, sp);
      if (x < L.left - 500 || x > L.right + 500) continue;
      const s = townSprite(L, LT, dpr, st, W);
      if (!inView(L, x, s)) continue;
      ctx.drawImage(s.c, x + s.x0, y + s.y0, s.w, s.h);
      out.push({kind: 'town', variant: st.variant, t: st.t, x, tall: st.tall});
    }
    return out;
  }
  function passNear(ctx, stations, L, t, LT, dpr, weather) {
    const out = [];
    const W = stationSurface(LT, weather);
    for (const st of stations) {
      if (st.xing !== undefined && Math.abs(st.t - t) <= 30) {
        const y = STATION.xingY, T = st.t + (st.xing - ROAD_HALF - .9) / V_MS;
        const entry = L.entryAt(y - 3.8 * mAtY(y)), x = pastEntry(entry, T, t, speedAtY(y));
        // the road's planks over the track bed under the window (rows 814 down), each row at its own speed
        const r0 = st.xing - ROAD_HALF, r1 = st.xing + ROAD_HALF, at = (X, yy) => pastEntry(entry, X / V_MS + st.t, t, speedAtY(yy));
        if (at(r1, 814) > L.left - 40 && at(r0, M_BOTTOM + 2) < L.right + 40) {
          crossingPlanks(ctx, LT, W, at, r0, r1, t);
        }
        if (x + 11 * mAtY(y) < L.left - 4 || x - 4 * mAtY(y) > L.right + 4) continue;
        const s = crossingSprite(L, LT, dpr, st, W);
        if (!inView(L, x, s)) continue;
        ctx.drawImage(s.c, x + s.x0, y + s.y0, s.w, s.h);
        if (ART) {
          const l = crossingSprite(L, LT, dpr, st, W, Math.floor(t * 2) % 2 ? 'r' : 'l');
          if (l) {
            ctx.save(); ctx.globalAlpha *= stationLampVisibility(W);
            ctx.drawImage(l.c, x + l.x0, y + l.y0, l.w, l.h); ctx.restore();
          }
        } else crossingLamps(ctx, x, y, t, W);
        out.push({kind: 'crossing', t: T, x});
      }
    }
    const y = STATION.signY, speed = speedAtY(y);
    const entry = L.entryAt(y - 80);
    const from = t + (L.left - PLATFORM_HALF - 175 - entry) / speed;
    const to = t + (L.right + PLATFORM_HALF + 24 - entry) / speed;
    for (let i = firstAt(stations.times, from); i < stations.length && stations[i].t <= to; i++) {
      const st = stations[i], x = pastEntry(signEntry(L, st), st.t, t, speed), s = signSprite(L, LT, dpr, st, W);
      if (!inView(L, x, s)) continue;
      ctx.drawImage(s.c, x + s.x0, y + s.y0, s.w, s.h);
      if (st.kind === 'town') {
        const lx = x + PLATFORM_LAMP + 23;
        stationLampGlow(ctx, lx, y - 106, W.kind === 'sand' ? 24 : 17, 18, [255, 219, 163], .58 * stationLampVisibility(W));
        if (W.kind === 'rain' && W.wetness) {
          const alpha = W.wetness * (.72 + .13 * Math.sin(t * 4));
          stationLampGlow(ctx, lx + 3, y + 4, 28, 4.3, [248, 193, 113], alpha);
          stationLampGlow(ctx, lx - 6, y - 3, 15, 1.7, [255, 227, 163], alpha * .63);
        }
      }
      out.push({kind: 'sign', name: st.name, platform: st.kind === 'town', t: st.t, x});
    }
    return out;
  }
  const ROAD_HALF = 3.2; // metres each side of the crossing road's middle

  // ---------- the carriage: the LED displays (score-terrain-led.js, global XinScoreTerrainLed) ----------
  // Above the window: title, artist, distance, and the route. On the sill: the lyric line.
  // The route and trackside signs use the same section order, labels and start times.
  const warmed = new WeakSet();
  function carriage(ctx, frame, S, dpr, weather, sun) {
    const Led = globalThis.XinScoreTerrainLed;
    if (!Led) return null;
    const L = S.layout, song = frame.song, track = song.track || {}, opts = {dpr};
    const {sections, route} = stationsOf(S.src, song);
    if (!warmed.has(song) && Led.warm) { // the first frame of a song rasterises every name it will show, not later frames
      warmed.add(song);
      Led.warm([String(track.title || ''), String(track.artist || ''), ...sections.map(r => r[2]), '0123456789:/ .…MI', 'INSTRUMENTAL', '本站下一站终点'], opts);
    }
    Led.drawHeader(ctx, L.header, {title: track.title || '', artist: track.artist || '', sections, route, time: S.time, duration: S.duration, readout: 'miles', speedMps: V_MS}, opts);
    // a lyric line too long for the sill scrolls; its progress comes with the frame when the host knows the line's timing
    // (lyricProgress), otherwise it sweeps back and forth on song time (a whole character at a time, in the module)
    const line = typeof frame.lyric === 'string' ? frame.lyric : frame.lyric && frame.lyric.text || '';
    let progress = Number.isFinite(frame.lyricProgress) ? frame.lyricProgress : null;
    if (progress === null) { const period = Math.max(6, Array.from(line).length * .45), u = (S.time / period) % 2; progress = 1 - Math.abs(u - 1); }
    // Retro portable VFD lyric receiver sitting on the windowsill: chassis behind, cyan-mint VFD glass inside,
    // and subtle phosphor light spill onto the wooden sill. On instrumentals, shows live deterministic VFD standby VU + clock.
    drawVfdDeck(ctx, L, weather, dpr, sun);
    const standby = line ? null : vfdStandby(S, sections);
    Led.drawLyric(ctx, L.sill, {line, progress: line ? progress : 0}, Object.assign({}, opts, {idle: 'dim', theme: 'vfd', standby}));
    if (ART) { // GPT's bezel over the top train LED header rim; the sill now uses the bespoke VFD receiver chassis
      const hp = Math.min(L.header.h / ((Led.headerRows ? Led.headerRows(16, 12) : 50) + 2.6), L.header.w / 200);
      bezel(ctx, 'header', L.header, 1.7 * hp, dpr);
    }
    const {x, y, w, h} = L.header, u = L.u;
    const light = cabinLight(weather, sun);
    ctx.save();
    // The lip faces the window. Stay inside the housing rim and outside the LED matrix.
    ctx.fillStyle = cabinEdgeLight(ctx, x + 10 * u, x + w - 10 * u, light, .84);
    ctx.fillRect(x + 10 * u, y + h - 2.8 * u, w - 20 * u, 1.25 * u);
    ctx.restore();
    return {sections: sections.length, lyric: line};
  }

  function inspect(frame) {
    ART = artNow();
    const S = scene(frame);
    if (S) S.light = lightFor(frame.cover).name;
    return S;
  }

  // a click inside the window: the time under it at the nearest range's speed (the bass layer, 10 s across the sketch window)
  function timeAt(x, y, frame) {
    if (!Number.isFinite(x) || !Number.isFinite(y) || !frame || !(frame.w > 0) || !(frame.h > 0)) return null;
    const duration = durationOf(frame);
    if (!Number.isFinite(duration) || duration <= 0) return null;
    ART = artNow();
    const L = layout(frame.w, frame.h), pane = L.cabin.glass;
    const dx = Math.max(pane.x + pane.r - x, x - (pane.x + pane.w - pane.r), 0);
    const dy = Math.max(pane.y + pane.r - y, y - (pane.y + pane.h - pane.r), 0);
    if (dx * dx + dy * dy > pane.r * pane.r) return null;
    const time = clamp(Number.isFinite(frame.time) ? frame.time : 0, 0, duration) + (x - L.entryX) / (M_W / SPAN_NEAR * L.s);
    return time < -1e-9 || time > duration + 1e-9 ? null : clamp(time, 0, duration);
  }
  const noteAt = () => null; // notes are texture only in this look; nothing to pick

  const invalidate = song => { songCache.delete(song); };
  function weatherWindow(song) {
    const {plainStart, plainEnd} = songSource(song, song.track.duration);
    return {plainStart, plainEnd};
  }
  const api = Object.freeze({draw, timeAt, noteAt, inspect, invalidate, ready, weatherWindow,
    // for tests and measurements only
    _internal: Object.freeze({curtainSway, wheelAngle, wheelPlace,
      layout, analysePixels, cabinFaces, curtainShapes, transomOf, curtainPlace: refCurtainPlace, overlay: cabinOverlay, worldShape: (song, w, h, id, k0, k1) => { const src = songSource(song, song.track.duration), L = layout(w, h); return worldShape(src, L, src.layers.find(l => l.id === id), k0, k1); }, roadLines: song => roadLines(songSource(song, song.track.duration)), stations: song => stationsOf(songSource(song, song.track.duration), song), coverMild, BASE, NEAR_TO_FAR, STEM_COLOR, geometry: (frame, margin) => {
      ART = artNow();
      const duration = durationOf(frame), L = layout(frame.w, frame.h), src = songSource(frame.song, duration);
      return {L, src, ranges: geometry(src, L, clamp(frame.time, 0, duration), margin)};
    }})});
  globalThis.XinArt ??= {};
  globalThis.XinArt.terrain = api;
  if (typeof module === 'object' && module && module.exports) module.exports = api;
})();
