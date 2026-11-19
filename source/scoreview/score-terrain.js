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
    const notes = {};
    for (const lane of Array.isArray(song.lanes) ? song.lanes : []) {
      if (!lane || lane.kind === 'drums' || lane.group === 'drums' || !Array.isArray(lane.notes)) continue;
      const list = notes[groupOf(lane.group)] || (notes[groupOf(lane.group)] = []);
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
        const id = groupOf(k), v = raw[k], p = power[id] || (power[id] = new Float64Array(v.length));
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
      return {id, i, d, span, f: span / 16, dt: span * COL / M_W, pps: M_W / span, amp: lerp(150, 250, Math.pow(d, 1.1)), rw: lerp(1, .6, d), seed: 100 + i * 9,
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
    return {id: R.id, name: STEM_NAME[R.id], span: +R.layer.span.toFixed(2), pxPerSecond: R.layer.pps * s,
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
    const key = lightIds.get(LT) + '|' + L.w + 'x' + L.h + '@' + dpr;
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
      roundRect(g, win.x, win.y, win.w, win.h, win.r); g.clip();
      toSketch(g);
      const x0 = L.left - 10, x1 = L.right + 10;
      const sky = g.createLinearGradient(0, M_TOP, 0, HORIZON);
      for (const [k, c] of LT.sky) sky.addColorStop(k, css(c));
      g.fillStyle = sky; g.fillRect(x0, M_TOP - 10, x1 - x0, HORIZON + 2 - M_TOP + 10);
      const G = LT.glow, glow = g.createRadialGradient(G.x, G.y, 10, G.x, G.y, G.r);
      glow.addColorStop(0, css(G.c, G.a)); glow.addColorStop(.5, css(G.c, G.a * .3)); glow.addColorStop(1, css(G.c, 0));
      g.fillStyle = glow; g.fillRect(x0, M_TOP - 10, x1 - x0, HORIZON + 2 - M_TOP + 10);
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
    // clouds: one wrapped strip that drifts
    const clouds = sketchCanvas(L, dpr, 0, CLOUD_Y0, CLOUD_P, CLOUD_Y1 - CLOUD_Y0);
    if (clouds) {
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
      const GL = LT.glass;
      g.fillStyle = css(GL.streak, GL.streakA);
      g.beginPath(); g.moveTo(fx(980), win.y); g.lineTo(fx(1100), win.y); g.lineTo(fx(840), B); g.lineTo(fx(720), B); g.closePath(); g.fill();
      g.beginPath(); g.moveTo(fx(1130), win.y); g.lineTo(fx(1160), win.y); g.lineTo(fx(900), B); g.lineTo(fx(870), B); g.closePath(); g.fill();
      g.filter = 'blur(' + (10 * u * dpr).toFixed(1) + 'px)'; g.fillStyle = css(GL.smear, GL.smearA); g.fillRect(fx(214), win.y + 16 * u, 520 / M_W * win.w, 7 * u);
      g.filter = 'none';
      const v = g.createLinearGradient(0, win.y, 0, win.y + 70 * u); v.addColorStop(0, 'rgba(8,12,18,.34)'); v.addColorStop(1, 'rgba(8,12,18,0)');
      g.fillStyle = v; g.fillRect(win.x, win.y, win.w, 70 * u);
      const v2 = g.createLinearGradient(0, B - 50 * u, 0, B); v2.addColorStop(0, 'rgba(8,12,18,0)'); v2.addColorStop(1, 'rgba(8,12,18,.3)');
      g.fillStyle = v2; g.fillRect(win.x, B - 50 * u, win.w, 50 * u);
      g.restore();
      // the carriage wall around the window (the LED displays go in the room above and below)
      g.save();
      roundRect(g, win.x, win.y, win.w, win.h, win.r); g.rect(0, 0, L.w, L.h);
      const wall = g.createLinearGradient(0, 0, 0, L.h); wall.addColorStop(0, '#1c1e21'); wall.addColorStop(.5, '#141618'); wall.addColorStop(1, '#1f2124');
      g.fillStyle = wall; g.fill('evenodd');
      g.restore();
      g.lineWidth = 7 * u; g.strokeStyle = '#08090a'; roundRect(g, win.x, win.y, win.w, win.h, win.r); g.stroke();
      g.lineWidth = Math.max(.6, 1.2 * u); g.strokeStyle = 'rgba(160,168,176,.28)'; roundRect(g, win.x - 9 * u, win.y - 9 * u, win.w + 18 * u, win.h + 18 * u, win.r + 9 * u); g.stroke();
      const sillY = B + 22 * u, sill = g.createLinearGradient(0, sillY, 0, L.h); sill.addColorStop(0, '#34373b'); sill.addColorStop(.12, '#26292c'); sill.addColorStop(1, '#17191b');
      g.fillStyle = sill; g.fillRect(0, sillY, L.w, L.h - sillY);
      g.fillStyle = 'rgba(210,216,222,.22)'; g.fillRect(0, sillY, L.w, Math.max(.6, 1.2 * u));
    }
    return {back, clouds, ground, bed, overlay};
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

  // ---------- drawing ----------
  function draw(ctx, frame) {
    const S = scene(frame);
    if (!S) return null;
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
      const drift = t * 2.2, off = ((-drift % CLOUD_P) + CLOUD_P) % CLOUD_P - 380;
      for (let x = off - CLOUD_P; x < L.right + 20; x += CLOUD_P) if (x + CLOUD_P > L.left - 20) ctx.drawImage(R.clouds.c, x, CLOUD_Y0, CLOUD_P, CLOUD_Y1 - CLOUD_Y0);
    }
    for (let i = ranges.length - 1; i >= 0; i--) {
      paintRange(ctx, ranges[i], LT, view);
      if (i > 0) mist(ctx, ranges[i], ranges[i - 1], lerp(.5, .62, ranges[i].d) * LT.mistK, LT);
    }
    const strip = (tile, speed) => {
      const off = ((-t * speed) % GROUND_P + GROUND_P) % GROUND_P;
      for (let x = off - GROUND_P; x < L.right + 10; x += GROUND_P) if (x + GROUND_P > L.left - 10) ctx.drawImage(tile.c, x, tile.y0, GROUND_P, tile.h);
    };
    if (R) for (const band of R.ground) strip(band.tile, band.speed);
    const air = ctx.createLinearGradient(0, HORIZON - 150, 0, HORIZON + 40);
    air.addColorStop(0, css(LT.air.c, 0)); air.addColorStop(.8, css(LT.air.c, LT.air.a)); air.addColorStop(1, css(LT.air.c, 0));
    ctx.fillStyle = air; ctx.fillRect(L.left - 10, HORIZON - 150, L.Wm + 20, 190);
    // the roadside option arrives with the frame (XML's settings pass it once batch 4 wires it; default off)
    S.roadside = roadside(ctx, S.src, L, t, LT, dpr, frame.terrainRoadside || (frame.options && frame.options.terrainRoadside) || 'off');
    if (R && R.bed) {
      const y = 820, g = ctx.createLinearGradient(0, y - 4, 0, M_BOTTOM);
      g.addColorStop(0, 'rgba(110,98,80,0)'); g.addColorStop(.35, 'rgba(110,98,80,.9)'); g.addColorStop(1, 'rgba(80,72,60,1)');
      ctx.fillStyle = g; ctx.fillRect(L.left - 10, y - 4, L.Wm + 20, M_BOTTOM - y + 8);
      strip(R.bed, speedAtY(828));
    }
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
    return S;
  }

  // ---------- the roadside: one drum hit = one object passing "now" at the moment of the hit (option terrainRoadside) ----------
  // off (default) / all / kick-snare. Lines and objects as in the sketch (mock6, round 3 + 6 fixes): kick = telegraph pole
  // (a kick within 0.38 s of the last tall pole = a short stub with a guy wire), snare = mile post or whistle post,
  // hi-hat = fence post (open = taller, braced), tom = rock pile or sage, crash = windpump (or a flock), ride = birds
  // lifting off the fence. Each line moves at its ground depth's speed; motion blur is baked into per-variant sprites.
  const LINE = {crash: 712, fence: 742, tom: 760, pole: 790, post: 812};
  const PX_PER_M = .316, BLUR = .6 / 60, STUB_GAP = .38;
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
    src.road = {crash: collapse(by([5]), .6), flock: collapse(by([7]), .6), fence: collapse(by([2, 3]), .04), ride: collapse(by([6]), .25),
      tom: collapse(by([4]), .08), pole, post: collapse(by([1]), .06)};
    for (const k of Object.keys(src.road)) src.road[k].times = src.road[k].map(o => o.t);
    return src.road;
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
  const spriteCache = new Map();
  function sprite(L, LT, dpr, type, y, vel, variant, blurK = 1) {
    const rv = repVel(type, vel), key = [lightIds.get(LT), L.s, dpr, type, y, rv, variant].join('|');
    if (spriteCache.has(key)) return spriteCache.get(key);
    const M = mAtY(y), blur = speedAtY(y) * BLUR * blurK, B = BOUNDS[type];
    const x0 = B[0] * M - blur, y0 = B[1] * M, w = (B[2] - B[0]) * M + 2 * blur, h = (B[3] - B[1]) * M, k = L.s * dpr;
    const a = makeCanvas(w * k, h * k);
    let out = null;
    if (a) {
      const g = a.getContext('2d');
      g.setTransform(k, 0, 0, k, -x0 * k, -y0 * k);
      PAINT[type](g, LT, M, rv, variant);
      let c = a;
      if (blur * k >= 1.5) { // horizontal motion blur: the average of shifted copies
        const b = makeCanvas(a.width, a.height), bg = b.getContext('2d'), K = Math.max(5, Math.round(blur * k));
        bg.globalCompositeOperation = 'lighter'; bg.globalAlpha = 1 / K;
        for (let q = 0; q < K; q++) bg.drawImage(a, (q / (K - 1) - .5) * blur * k, 0);
        c = b;
      }
      out = {c, x0, y0, w, h};
    }
    if (spriteCache.size > 160) spriteCache.delete(spriteCache.keys().next().value);
    spriteCache.set(key, out);
    return out;
  }
  const stamp = (ctx, sp, x, y, scale = 1) => { if (sp) ctx.drawImage(sp.c, x + sp.x0 * scale, y + sp.y0 * scale, sp.w * scale, sp.h * scale); };
  function birds(ctx, x, y, M, dt, key, n) {
    if (dt < 0) return; // not drawn before the hit (birds sitting on the ground read as debris)
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
    const key = [lightIds.get(LT), L.s, dpr, mode].join('|');
    if (src.roadWarm === key) return;
    src.roadWarm = key;
    const has = list => ({lo: list.some(o => o.v < 64), hi: list.some(o => o.v >= 64)});
    const vels = list => { const h = has(list); return [h.lo ? 32 : null, h.hi ? 96 : null].filter(v => v !== null); };
    for (const b of [0, 1, 2, 3]) if (road.pole.some(o => o.tall && vBucket(o.v) === b)) sprite(L, LT, dpr, 'pole', LINE.pole, vOf(b), 0);
    for (const v of vels(road.pole.filter(o => !o.tall))) sprite(L, LT, dpr, 'stub', LINE.pole, v, 0);
    for (const v of vels(road.post)) for (const k of [0, 1]) sprite(L, LT, dpr, 'post', LINE.post, v, k, .45);
    if (mode !== 'all') return;
    for (const v of vels(road.fence)) for (let k = 0; k < 9; k++) sprite(L, LT, dpr, 'fence', LINE.fence, v, k);
    for (const v of vels(road.tom)) for (let k = 0; k < 8; k++) sprite(L, LT, dpr, 'tom', LINE.tom, v, k);
    for (const v of vels(road.crash)) for (let k = 0; k < 3; k++) sprite(L, LT, dpr, 'crash', LINE.crash, v, k);
  }
  function roadside(ctx, src, L, t, LT, dpr, mode) {
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
      for (let i = v.a; i < v.b; i++) { const o = road.crash[i]; stamp(ctx, sprite(L, LT, dpr, 'crash', y, o.v, Math.floor(hash(Math.round(o.t * 50), 3) * 3)), X(o.t, v.sp), y); }
      count('crash', v.b - v.a);
      v = visible(road.flock, y, 300, 300);
      for (let i = v.a; i < v.b; i++) { const o = road.flock[i], key = Math.round(o.t * 50); birds(ctx, X(o.t, v.sp), y, M * 1.6, t - o.t, key, 5 + Math.floor(hash(key, 60) * 4)); }
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
        stamp(ctx, sprite(L, LT, dpr, 'fence', y, o.v, open ? 6 + Math.floor(hash(key, 52) * 3) : Math.floor(hash(key, 51) * 6)), X(o.t, v.sp), y);
      }
      count('fence', v.b - v.a);
      const r = visible(road.ride, y, 300, 300);
      for (let i = r.a; i < r.b; i++) { const o = road.ride[i], key = Math.round(o.t * 50); birds(ctx, X(o.t, r.sp), y, M, t - o.t, key, 3 + Math.floor(hash(key, 60) * 5)); }
      count('ride', r.b - r.a);
    }
    if (all) { // rock piles and sage, each at its own depth
      const y0 = LINE.tom, list = road.tom, v = visible(list, y0, 4 * mAtY(y0), 300);
      for (let i = v.a; i < v.b; i++) {
        const o = list[i], key = Math.round(o.t * 50), y = y0 + (hash(key, 81) - .5) * 14;
        stamp(ctx, sprite(L, LT, dpr, 'tom', y0, o.v, Math.floor(hash(key, 71) * 8)), L.nowM + (o.t - t) * speedAtY(y), y, mAtY(y) / mAtY(y0));
      }
      count('tom', v.b - v.a);
    }
    { // telegraph poles (kick): a kick right after a tall pole is a stub with a guy wire up to that pole
      const y = LINE.pole, M = mAtY(y), list = road.pole, v = visible(list, y, 20 * M, 400);
      const tops = o => { const H = 9.5 * M * (.95 + .1 * repVel('pole', o.v) / 127), ay = y - (H - .55 * M) - .24 * M, x = X(o.t, v.sp); return [-1.1, -.45, .45, 1.1].map(dx => [x + dx * M, ay]); };
      ctx.strokeStyle = 'rgba(34,32,30,.6)'; ctx.lineWidth = 1.1; ctx.beginPath();
      let prev = null;
      for (let i = Math.max(0, v.a - 1); i <= Math.min(list.length - 1, v.b); i++) {
        const o = list[i]; if (!o.tall) continue;
        if (prev && o.t - prev.t <= 3 && prev.t >= src.plainStart && o.t <= src.plainEnd && (i >= v.a || prev === null)) {
          const a = tops(prev), b = tops(o), sag = Math.min(1.1 * M, Math.abs(b[0][0] - a[0][0]) * .045);
          for (let j = 0; j < 4; j++) { ctx.moveTo(a[j][0], a[j][1]); ctx.quadraticCurveTo((a[j][0] + b[j][0]) / 2, (a[j][1] + b[j][1]) / 2 + sag * 2, b[j][0], b[j][1]); }
        }
        prev = o;
      }
      ctx.stroke();
      let tall = null;
      for (let i = v.a - 1; i >= 0; i--) if (list[i].tall) { tall = list[i]; break; }
      ctx.strokeStyle = 'rgba(34,32,30,.55)'; ctx.lineWidth = 1; ctx.beginPath();
      for (let i = v.a; i < v.b; i++) {
        const o = list[i], x = X(o.t, v.sp);
        poles.push({t: o.t, x, tall: o.tall});
        if (o.tall) { stamp(ctx, sprite(L, LT, dpr, 'pole', y, o.v, 0), x, y); tall = o; count('kick', 1); continue; }
        stamp(ctx, sprite(L, LT, dpr, 'stub', y, o.v, 0), x, y); count('kickstub', 1);
        const first = i === 0 || list[i - 1].tall;
        if (tall && first) { const h = (2.0 + .5 * repVel('stub', o.v) / 127) * M; ctx.moveTo(x, y - h); ctx.lineTo(X(tall.t, v.sp), y - 5.5 * M); }
      }
      ctx.stroke();
    }
    { // mile posts and whistle posts (snare), half the blur so they read
      const y = LINE.post, M = mAtY(y), list = road.post, v = visible(list, y, 2 * M, 300);
      for (let i = v.a; i < v.b; i++) { const o = list[i]; stamp(ctx, sprite(L, LT, dpr, 'post', y, o.v, hash(Math.round(o.t * 50), 91) < .68 ? 0 : 1, .45), X(o.t, v.sp), y); }
      count('snare', v.b - v.a);
    }
    return Object.assign(counts, {poles});
  }

  // ---------- the carriage: the LED displays (score-terrain-led.js, global XinScoreTerrainLed) ----------
  // Above the window: title, artist, this station / next, time, the route of all sections. On the sill: the lyric line
  // (nothing lit when there is none). On the frame: the two "now" arrows. Section names come from the song's own rows
  // (Chinese in the bundles; English labels go through the module's fallback).
  const warmed = new WeakSet();
  function carriage(ctx, frame, S, dpr) {
    const Led = globalThis.XinScoreTerrainLed;
    if (!Led) return null;
    const L = S.layout, song = frame.song, track = song.track || {}, opts = {dpr};
    const sections = (Array.isArray(song.sections) ? song.sections : [])
      .filter(r => Array.isArray(r) && Number.isFinite(r[0]))
      .map(r => [r[0], r[1], Led.localizeSection(String(r[2] == null ? '' : r[2]))]);
    if (!warmed.has(song) && Led.warm) { // the first frame of a song rasterises every name it will show, not later frames
      warmed.add(song);
      Led.warm([String(track.title || ''), String(track.artist || ''), ...sections.map(r => r[2]), '0123456789:/ …', '本站下一站终点'], opts);
    }
    Led.drawHeader(ctx, L.header, {title: track.title || '', artist: track.artist || '', sections, time: S.time, duration: S.duration}, opts);
    // a lyric line too long for the sill scrolls; its progress comes with the frame when the host knows the line's timing
    // (lyricProgress), otherwise it sweeps back and forth on song time (a whole character at a time, in the module)
    const line = typeof frame.lyric === 'string' ? frame.lyric : frame.lyric && frame.lyric.text || '';
    let progress = Number.isFinite(frame.lyricProgress) ? frame.lyricProgress : null;
    if (progress === null) { const period = Math.max(6, Array.from(line).length * .45), u = (S.time / period) % 2; progress = 1 - Math.abs(u - 1); }
    if (line) Led.drawLyric(ctx, L.sill, {line, progress}, opts);
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
  const api = Object.freeze({draw, timeAt, noteAt, inspect, invalidate,
    // for tests and measurements only
    _internal: Object.freeze({layout, analysePixels, roadLines: song => roadLines(songSource(song, song.track.duration)), coverMild, BASE, NEAR_TO_FAR, STEM_COLOR, geometry: (frame, margin) => {
      const duration = durationOf(frame), L = layout(frame.w, frame.h), src = songSource(frame.song, duration);
      return {L, src, ranges: geometry(src, L, clamp(frame.time, 0, duration), margin)};
    }})});
  globalThis.XinArt ??= {};
  globalThis.XinArt.terrain = api;
  if (typeof module === 'object' && module && module.exports) module.exports = api;
})();
