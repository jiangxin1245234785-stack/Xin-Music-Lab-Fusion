/* XML scene palettes (copied unchanged from work/xml-palette-20261114/palette-core.js for B5, 2026-11-15; app.js uses
   coverPalette for 跟封面). Round 1 (2026-11-14): colour maths shared by the candidate page and the report script.
   Everything is chosen in OKLCH and measured in OKLab (distance = Euclidean ΔE in OKLab, 0..~0.4 for real colours).
   A palette keeps the three roles XML already uses: main, hot (highlight) and dark (the scene's ground). */
(function (root) {
  'use strict';
  // --- colour spaces -------------------------------------------------------------------------
  const lin = c => (c /= 255) <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  const gam = c => c <= 0.0031308 ? 12.92 * c : 1.055 * c ** (1 / 2.4) - 0.055;
  function rgbToLab(r, g, b) {
    r = lin(r); g = lin(g); b = lin(b);
    const l = Math.cbrt(0.4122214708 * r + 0.5363325363 * g + 0.0514459929 * b);
    const m = Math.cbrt(0.2119034982 * r + 0.6806995451 * g + 0.1073969566 * b);
    const s = Math.cbrt(0.0883024619 * r + 0.2817188376 * g + 0.6299787005 * b);
    return [0.2104542553 * l + 0.7936177850 * m - 0.0040720468 * s, 1.9779984951 * l - 2.4285922050 * m + 0.4505937099 * s, 0.0259040371 * l + 0.7827717662 * m - 0.8086757660 * s];
  }
  function labToRgbRaw(L, a, b) {
    const l = (L + 0.3963377774 * a + 0.2158037573 * b) ** 3, m = (L - 0.1055613458 * a - 0.0638541728 * b) ** 3, s = (L - 0.0894841775 * a - 1.2914855480 * b) ** 3;
    return [4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s, -1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s, -0.0041960863 * l - 0.7034186147 * m + 1.7076147010 * s];
  }
  const inGamut = rgb => rgb.every(v => v >= -0.0005 && v <= 1.0005);
  // OKLCH -> hex; out-of-gamut colours keep L and h and lose chroma until they fit
  function oklchToHex(L, C, h) {
    let c = C, rgb;
    for (let i = 0; i < 40; i++) {
      rgb = labToRgbRaw(L, c * Math.cos(h * Math.PI / 180), c * Math.sin(h * Math.PI / 180));
      if (inGamut(rgb)) break;
      c *= 0.94;
    }
    return '#' + rgb.map(v => Math.round(Math.min(1, Math.max(0, gam(v))) * 255).toString(16).padStart(2, '0')).join('');
  }
  const hexToRgb = hex => [1, 3, 5].map(i => parseInt(hex.slice(i, i + 2), 16));
  const hexToLab = hex => rgbToLab(...hexToRgb(hex));
  function labToLch([L, a, b]) { return {L, C: Math.hypot(a, b), h: (Math.atan2(b, a) * 180 / Math.PI + 360) % 360}; }
  const hexToLch = hex => labToLch(hexToLab(hex));
  const deltaE = (x, y) => { const p = hexToLab(x), q = hexToLab(y); return Math.hypot(p[0] - q[0], p[1] - q[1], p[2] - q[2]); };
  const hueGap = (a, b) => { const d = Math.abs(a - b) % 360; return d > 180 ? 360 - d : d; };

  // --- the shell's fixed colours ------------------------------------------------------------
  const AMBER = '#f0a830';
  const TRACKS = {drums: '#e8663a', bass: '#4d7fd0', guitar: '#2fb89a', piano: '#7cc4f2', vocals: '#d78ab5', other: '#9aa1a9', strings: '#d9cd6a', violin: '#e9e09a'};
  const TRACK_NAMES = {drums: '鼓', bass: '贝斯', guitar: '吉他', piano: '钢琴', vocals: '人声', other: '其它', strings: '弦乐', violin: '小提琴'};
  // Rules every candidate has to pass
  const RULES = Object.freeze({
    amberHueGap: 30,      // a coloured main / hot stays this many degrees of hue away from amber ...
    amberChromaFree: 0.05,// ... unless it is this grey (chroma below), when hue no longer reads as amber
    amberMinDE: 0.12,     // and in any case this far from amber in OKLab
    trackMinDE: 0.10,     // hand-tuned mains this far from every track colour
    darkL: [0.18, 0.24],  // the ground: a dark grey with a tint, never black
    darkC: [0.008, 0.03],
    mainL: [0.64, 0.80], mainC: [0.06, 0.14],
    hotL: [0.80, 0.92], hotC: [0.04, 0.12],
  });
  const AMBER_LCH = hexToLch(AMBER);

  function report(p) {
    const out = {};
    for (const role of ['main', 'hot']) {
      const c = hexToLch(p[role]);
      const tracks = Object.entries(TRACKS).map(([k, v]) => [k, deltaE(p[role], v)]).sort((a, b) => a[1] - b[1]);
      out[role] = {lch: c, amberDE: deltaE(p[role], AMBER), amberHueGap: hueGap(c.h, AMBER_LCH.h), nearestTrack: tracks[0][0], nearestTrackDE: tracks[0][1], tracks};
    }
    out.dark = {lch: hexToLch(p.dark)};
    out.passAmber = ['main', 'hot'].every(r => out[r].amberDE >= RULES.amberMinDE && (out[r].amberHueGap >= RULES.amberHueGap || out[r].lch.C < RULES.amberChromaFree));
    out.passTracks = out.main.nearestTrackDE >= RULES.trackMinDE;
    return out;
  }

  // Keep a colour clear of amber: turn the hue away to the nearer edge of the forbidden band; if it is still too close
  // in OKLab, move lightness (the smallest step inside `range`, the role's allowed lightness) and only when that is not
  // enough take chroma out. Returns {L,C,h,moved} with moved a list of the steps taken.
  function awayFromAmber(L, C, h, range) {
    const moved = [];
    if (C >= RULES.amberChromaFree && hueGap(h, AMBER_LCH.h) < RULES.amberHueGap) {
      const signed = ((h - AMBER_LCH.h + 540) % 360) - 180;          // <0: redder side, >0: yellower side
      h = (AMBER_LCH.h + (signed < 0 ? -1 : 1) * RULES.amberHueGap + 360) % 360;
      moved.push('turned');
    }
    const far = (l, c) => deltaE(oklchToHex(l, c, h), AMBER) >= RULES.amberMinDE;
    if (!far(L, C) && range) {
      for (let k = 1; k <= 12; k++) {
        const tries = [L - 0.01 * k, L + 0.01 * k].filter(l => l >= range[0] - 1e-9 && l <= range[1] + 1e-9);
        const hit = tries.find(l => far(l, C));
        if (hit !== undefined) { moved.push(hit < L ? 'darker' : 'lighter'); L = hit; break; }
      }
    }
    for (let i = 0; i < 20 && !far(L, C); i++) { C *= 0.85; if (!moved.includes('greyed')) moved.push('greyed'); }
    return {L, C, h, moved};
  }
  const clamp = (v, [lo, hi]) => Math.min(hi, Math.max(lo, v));

  // --- the cover palette ---------------------------------------------------------------------
  // rgba: Uint8 RGBA of a small copy of the cover (48 x 48 is plenty). Steps:
  //  1. drop transparent pixels; a pixel is "coloured" when C >= 0.045 and 0.12 <= L <= 0.96.
  //  2. under 6 % coloured pixels -> the cover is black-and-white or grey: use the 黑白 set.
  //  3. hue histogram of the coloured pixels in 10° bins, each pixel weighted by its chroma (area x vividness),
  //     smoothed over neighbouring bins; the peak is the main hue.
  //  4. the second peak at least 45° away and at least 15 % of the first is the highlight hue; if there is none,
  //     the highlight is the main hue turned 35° (to the side farther from amber) and lighter.
  //  5. each hue's colour = the chroma-weighted mean (OKLab) of its pixels within ±25° of the peak.
  //  6. pull into the usable range (main L .64–.80 / C .06–.14, hot L .80–.92 / C .04–.12), keep both clear of amber
  //     (turn the hue out of amber's ±30°, then move lightness inside the range, then lower chroma),
  //     ground = main hue at L .21, C a quarter of main's (between .008 and .03).
  function coverPalette(rgba, fallback) {
    const px = [];
    for (let i = 0; i < rgba.length; i += 4) {
      if (rgba[i + 3] < 128) continue;
      const lab = rgbToLab(rgba[i], rgba[i + 1], rgba[i + 2]), lch = labToLch(lab);
      px.push({lab, lch});
    }
    const coloured = px.filter(p => p.lch.C >= 0.045 && p.lch.L >= 0.12 && p.lch.L <= 0.96);
    const share = coloured.length / Math.max(1, px.length);
    const notes = [];
    if (share < 0.06) return {...fallback, source: 'fallback', share, notes: ['封面几乎没有颜色（彩色像素 ' + Math.round(share * 100) + '%），用「' + fallback.name + '」']};
    const bins = new Array(36).fill(0);
    for (const p of coloured) bins[Math.floor(p.lch.h / 10) % 36] += p.lch.C;
    const smooth = bins.map((_, i) => [-2, -1, 0, 1, 2].reduce((s, d, k) => s + bins[(i + d + 36) % 36] * [1, 2, 3, 2, 1][k], 0));
    const order = smooth.map((w, i) => [w, i]).sort((a, b) => b[0] - a[0]);
    const peak1 = order[0][1] * 10 + 5;
    const second = order.find(([w, i]) => hueGap(i * 10 + 5, peak1) >= 45 && w >= order[0][0] * 0.15);
    const mean = hue => {
      let a = 0, b = 0, L = 0, w = 0;
      for (const p of coloured) if (hueGap(p.lch.h, hue) <= 25) { a += p.lab[1] * p.lch.C; b += p.lab[2] * p.lch.C; L += p.lab[0] * p.lch.C; w += p.lch.C; }
      return labToLch([L / w, a / w, b / w]);
    };
    const m = mean(peak1);
    let hRaw;
    if (second) hRaw = mean(second[1] * 10 + 5);
    else {
      // one hue only: the highlight is the main hue turned 35°, towards whichever side is farther from amber
      const up = (m.h + 35) % 360, down = (m.h + 325) % 360;
      const h = hueGap(up, AMBER_LCH.h) >= hueGap(down, AMBER_LCH.h) ? up : down;
      hRaw = {L: m.L + 0.12, C: m.C * 0.8, h};
      notes.push('封面只有一种主要色相，高光由主色转 35° 得到（转向离琥珀远的一边）');
    }
    const mainL = clamp(m.L, RULES.mainL), mainC = clamp(m.C, RULES.mainC);
    const hotL = clamp(hRaw.L, RULES.hotL), hotC = clamp(hRaw.C, RULES.hotC);
    if (Math.abs(mainL - m.L) > 0.02 || Math.abs(hotL - hRaw.L) > 0.02) notes.push('明度拉回可用范围（主色 ' + m.L.toFixed(2) + '→' + mainL.toFixed(2) + '，高光 ' + hRaw.L.toFixed(2) + '→' + hotL.toFixed(2) + '）');
    if (m.C > RULES.mainC[1] + 0.01) notes.push('主色太艳，彩度 ' + m.C.toFixed(3) + '→' + mainC.toFixed(3));
    const main = awayFromAmber(mainL, mainC, m.h, RULES.mainL), hot = awayFromAmber(hotL, hotC, hRaw.h, RULES.hotL);
    const said = (a, L0, C0) => a.moved.map(s => ({turned: '色相转开到 ' + Math.round(a.h) + '°', darker: '明度 ' + L0.toFixed(2) + '→' + a.L.toFixed(2), lighter: '明度 ' + L0.toFixed(2) + '→' + a.L.toFixed(2), greyed: '彩度 ' + C0.toFixed(3) + '→' + a.C.toFixed(3)})[s]).join('，');
    if (main.moved.length) notes.push('主色离琥珀太近，' + said(main, mainL, mainC));
    if (hot.moved.length) notes.push('高光离琥珀太近，' + said(hot, hotL, hotC));
    const darkC = clamp(main.C * 0.25, RULES.darkC);
    return {name: '跟封面', source: 'cover', share,
      main: oklchToHex(main.L, main.C, main.h), hot: oklchToHex(hot.L, hot.C, hot.h), dark: oklchToHex(0.21, darkC, main.h),
      raw: {main: m, hot: hRaw}, notes};
  }

  // --- chords: a small turn of the current palette, by the root's place on the circle of fifths -----------------
  // Roots spelled as XML's chord read-out spells them (fusion.js rootPalettes). The root's place on the circle of
  // fifths is an angle; the palette's main and hot turn by CHORD.hue·sin(angle) degrees of hue and CHORD.light·cos(angle)
  // of lightness, so every root differs, roots a fifth apart differ by a small step, and twelve fifths come back round.
  // The ground (chroma under .03) and grey sets do not move. Amber is avoided as everywhere else.
  const ROOTS = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];
  const FIFTHS = ['C', 'G', 'D', 'A', 'E', 'B', 'F#', 'C#', 'G#', 'D#', 'A#', 'F'];
  const CHORD = Object.freeze({hue: 15, light: 0.03});
  function chordShift(p, root, amount = CHORD) {
    const i = ROOTS.indexOf(root);
    if (i < 0 || !amount) return p;
    const angle = 2 * Math.PI * ((i * 7) % 12) / 12;
    const turn = amount.hue * Math.sin(angle), dL = amount.light * Math.cos(angle);
    const one = hex => { const c = hexToLch(hex); if (c.C < 0.03) return hex; const a = awayFromAmber(c.L + dL, c.C, (c.h + turn + 360) % 360); return oklchToHex(a.L, a.C, a.h); };
    return {...p, main: one(p.main), hot: one(p.hot), dark: one(p.dark), turn, dL};
  }

  const api = {rgbToLab, labToLch, hexToLab, hexToLch, oklchToHex, deltaE, hueGap, AMBER, TRACKS, TRACK_NAMES, RULES, report, awayFromAmber, coverPalette, chordShift, ROOTS, FIFTHS, CHORD};
  if (typeof module !== 'undefined' && module.exports) module.exports = api; else root.PaletteCore = api;
})(typeof self !== 'undefined' ? self : this);
