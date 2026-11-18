// The radar look as an echo post (work/score-depth-20261118/SPEC-RADAR.md, 0.32.0): one 1440 x 900 instrument panel,
// scaled whole into the stage and centred (black around, never re-laid out). Every needle, lamp, readout and trace is
// a function of song time on the song's own data, so a pause, a seek or an export frame is the frame playing reaches.
// Screws, plates, grilles and tick rings are hardware and carry no data.
(function (root) {
  'use strict';
  const DESIGN = Object.freeze({width: 1440, height: 900});
  const GRID = .05;                       // seconds per step of the precomputed series
  const CATS = Object.freeze([
    {id: 'vocals', ring: 'VOX', strip: 'VOX', members: ['vocals']},
    {id: 'guitar', ring: 'GTR', strip: 'GUITAR', members: ['guitar']},
    {id: 'piano', ring: 'PNO', strip: 'PIANO', members: ['piano', 'keys', 'synth']},
    {id: 'strings', ring: 'STR', strip: 'STRINGS', members: ['strings', 'violin']},
    {id: 'winds', ring: 'WND', strip: 'WINDS', members: ['winds', 'brass', 'woodwinds']},
    {id: 'bass', ring: 'BAS', strip: 'BASS', members: ['bass']},
    {id: 'drums', ring: null, strip: 'DRUMS', members: ['drums']}
  ]);
  const CAT_OF = new Map(CATS.flatMap((cat, i) => cat.members.map(group => [group, i])));
  const RINGS = 6;                        // the disc: the first six categories, outside in
  const SECTION_LAMPS = Object.freeze(['INTRO', 'VERSE', 'PRE', 'CHORUS', 'INST', 'BRIDGE', 'OUTRO']);
  const SECTION_MARK = Object.freeze({INTRO: 'IN', VERSE: 'V', PRE: 'PR', CHORUS: 'CH', INST: 'IS', BRIDGE: 'BR', OUTRO: 'OUT'});
  const QUALITY = Object.freeze(['MAJ', 'MIN', '6', '7', 'M7', 'SUS2', 'SUS4', 'DIM', 'AUG', 'INV']);
  const FIFTHS = Object.freeze(['C', 'G', 'D', 'A', 'E', 'B', 'F#', 'Db', 'Ab', 'Eb', 'Bb', 'F']);
  const FIFTH_PC = Object.freeze([0, 7, 2, 9, 4, 11, 6, 1, 8, 3, 10, 5]);
  const DRUM_ROWS = Object.freeze([
    {label: 'CYM', names: ['crash', 'ride']}, {label: 'HAT', names: ['hihat', 'openhat']},
    {label: 'TOM', names: ['tom']}, {label: 'SNR', names: ['snare']}, {label: 'KICK', names: ['kick']}]);
  const CAUTION = Object.freeze(['TUTTI', 'SOLO', 'SILENCE', 'PEAK', 'DROP', 'FILL', 'HOLD', 'SPARE']);
  // Thresholds of the caution lamps (reported in REPORT-RADAR.md).
  const RULES = Object.freeze({
    drumRing: .25,          // a drum hit keeps its channel "sounding" this long
    noteRing: .35,          // so does a pitched note after it ends (the gap between two notes is not silence)
    silenceHold: 1,         // SILENCE: every channel quiet at least this long, between the first and the last note
    peakSmooth: 2, peakQuantile: .95,
    dropShort: .5, dropLook: 1.5, dropDb: 9, dropFrom: .3, dropHold: 1,
    fillRatio: 1.6, fillMore: 4, fillLeast: 6,
    hold: 4,
    glow: .3                // every lamp rises and falls over this many seconds
  });
  const FREE_TURN = 8;      // seconds a turn of the disc takes when the song has no beats
  const C = Object.freeze({
    void: '#0b0c0a', panel: '#33362d', panelHi: '#40433a', panelLo: '#25271f', seam: '#1a1b16', screw: '#5b5d52',
    stamp: '#d8d3bd', stampDim: '#8e8b7a', stampFaint: '#5f5e53',
    dial: '#e7dfc4', dialEdge: '#b9b195', dialInk: '#2b2a23', red: '#b5412d', tape: '#efe6c8', tapeInk: '#2a2722',
    screen: '#0c2117', screenHi: '#123323', screenRim: '#060f0a', phos: '#82f2a6', phosDim: '#3c9c66', phosFaint: '#1f5a3b',
    amber: '#ffb24c', amberHot: '#ffe0a0', amberLow: '#5a3a1c', lampOff: '#2d241b',
    tube: '#ff8a2a', tubeHot: '#ffc27a', tubeOff: '#3b2015', tubeGlass: '#170d08',
    paper: '#e4dcc3', paperInk: '#38362e', paperFaint: '#b9b199', pen: '#b3362b', green: '#6ee08c', greenOff: '#1d3324'
  });
  const FONTS = Object.freeze({
    stamp: '"Saira Stencil One", "Bahnschrift", "DIN Alternate", "Arial Narrow", sans-serif',
    mono: '"Consolas", "Cascadia Mono", "Courier New", monospace',
    marker: '"Permanent Marker", "Ink Free", "Segoe Print", "Comic Sans MS", cursive',
    hanzi: '"FangSong", "仿宋", "STFangsong", "KaiTi", "楷体", "SimSun", serif'
  });
  const clamp = (n, a, b) => Math.max(a, Math.min(b, n));
  // The bundled faces (assets/fonts, with their licences): Saira Stencil One (SIL OFL 1.1) for the stamped names,
  // Permanent Marker (Apache 2.0) for the tape labels. Loaded once; the fallbacks above draw until they are in.
  const FACES = Object.freeze([['Saira Stencil One', 'SairaStencilOne-Regular.ttf'], ['Permanent Marker', 'PermanentMarker-Regular.ttf']]);
  const fontBase = (() => { try { return new URL('./assets/fonts/', root.document.currentScript.src).href; } catch (_) { return null; } })();
  let fontsLoading = null;
  function loadFonts() {
    if (fontsLoading) return fontsLoading;
    const doc = root.document;
    if (!fontBase || typeof root.FontFace !== 'function' || !doc || !doc.fonts) return (fontsLoading = Promise.resolve([]));
    fontsLoading = Promise.all(FACES.map(([family, file]) => {
      const face = new root.FontFace(family, `url("${fontBase}${file}")`);
      return face.load().then(loaded => { doc.fonts.add(loaded); return family; }, () => null);
    })).then(list => list.filter(Boolean));
    return fontsLoading;
  }
  const smooth = x => x * x * (3 - 2 * x);
  const lower = (array, value, key = x => x) => {
    let lo = 0, hi = array.length;
    while (lo < hi) { const mid = (lo + hi) >>> 1; if (key(array[mid]) < value) lo = mid + 1; else hi = mid; }
    return lo;
  };
  const isHan = ch => /\p{Script=Han}/u.test(ch);
  const clean = value => /^(unknown artist|未知艺术家|—|single|单曲|local library|本地曲库)$/i.test(value || '') ? '' : value || '';

  // The kind of a section row ([start, end, label, engine, kind]) as one of the seven lamps, or null (silence).
  function sectionKind(row) {
    const raw = String(row && (row[4] || row[2]) || '').toLowerCase().replace(/\s*\d+$/, '').trim();
    if (/^(intro|引子|前奏)/.test(raw)) return 'INTRO';
    if (/^(pre[- ]?chorus|导歌|前副歌)/.test(raw)) return 'PRE';
    if (/^(chorus|副歌)/.test(raw)) return 'CHORUS';
    if (/^(verse|主歌)/.test(raw)) return 'VERSE';
    if (/^(inst|instrumental|interlude|间奏|solo|break|过门)/.test(raw)) return 'INST';
    if (/^(bridge|桥段)/.test(raw)) return 'BRIDGE';
    if (/^(outro|尾奏|尾声|ending)/.test(raw)) return 'OUTRO';
    return null;
  }
  // A chord label as a root pitch class and the quality lamps it lights. 'N' or nothing: null.
  function chordParts(label) {
    const m = /^([A-G])([#b♯♭]?)([^/]*)(?:\/(.+))?$/.exec(String(label || '').trim());
    if (!m) return null;
    const pc = ({C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11})[m[1]] + (/[#♯]/.test(m[2]) ? 1 : /[b♭]/.test(m[2]) ? -1 : 0);
    const s = m[3].trim(), lamps = new Set();
    if (/^(m7b5|ø|hdim7?|min7b5)/i.test(s)) { lamps.add('MIN'); lamps.add('7'); lamps.add('DIM'); }
    else if (/^dim7/i.test(s)) { lamps.add('DIM'); lamps.add('7'); }
    else if (/^(dim|°)/i.test(s)) lamps.add('DIM');
    else if (/^(aug|\+)/i.test(s)) lamps.add('AUG');
    else if (/^sus2/i.test(s)) lamps.add('SUS2');
    else if (/^sus/i.test(s)) lamps.add('SUS4');
    else {
      const minor = /^(m(?!aj)|min|-)/.test(s);
      lamps.add(minor ? 'MIN' : 'MAJ');
      const rest = s.replace(/^(min|m(?!aj)|-)/, '');
      if (/^(maj7|M7|Δ)/.test(rest)) lamps.add('M7');
      else if (/^(7|9|11|13)/.test(rest)) lamps.add('7');
      else if (/^6/.test(rest)) lamps.add('6');
    }
    if (m[4]) lamps.add('INV');
    return {pc: ((pc % 12) + 12) % 12, lamps, label: m[0]};
  }

  // Everything that depends only on the model, made once per model.
  function prepare(model, events) {
    const duration = Number(model.track && model.track.duration) || 0;
    const steps = Math.max(2, Math.ceil(duration / GRID) + 2);
    const present = new Array(CATS.length).fill(false);
    const sounding = CATS.map(() => new Uint8Array(steps));
    const pitchSum = new Float32Array(steps), pitchCount = new Uint16Array(steps);
    const range = CATS.map(() => [Infinity, -Infinity]);
    const notes = [], drums = [];
    let longest = 0, firstNote = Infinity, lastNote = -Infinity;
    for (const e of events) {
      const cat = CAT_OF.get(e.group);
      if (cat === undefined) continue;
      present[cat] = true;
      firstNote = Math.min(firstNote, e.start); lastNote = Math.max(lastNote, e.end);
      if (CATS[cat].id === 'drums') {
        const row = DRUM_ROWS.findIndex(r => r.names.includes(e.drumName));
        drums.push({time: e.start, row: row < 0 ? 3 : row});
        for (let i = Math.floor(e.start / GRID); i <= Math.min(steps - 1, Math.ceil((e.start + RULES.drumRing) / GRID)); i++) sounding[cat][i] = 1;
        continue;
      }
      notes.push({start: e.start, end: e.end, pitch: e.pitch, cat, velocity: e.velocity || 80});
      longest = Math.max(longest, e.end - e.start);
      range[cat][0] = Math.min(range[cat][0], e.pitch); range[cat][1] = Math.max(range[cat][1], e.pitch);
      for (let i = Math.max(0, Math.floor(e.start / GRID)); i <= Math.min(steps - 1, Math.floor(e.end / GRID)); i++) {
        sounding[cat][i] = 1; pitchSum[i] += e.pitch; pitchCount[i]++;
      }
      for (let i = Math.floor(e.end / GRID) + 1; i <= Math.min(steps - 1, Math.floor((e.end + RULES.noteRing) / GRID)); i++) sounding[cat][i] = 1;
    }
    notes.sort((a, b) => a.start - b.start);
    drums.sort((a, b) => a.time - b.time);
    // Channel levels: the loudest member stem's dB on the grid; null when the song has no level for that channel.
    const levels = model.levels && model.levels.groups && model.levels.hop > 0 ? model.levels : null;
    const meter = CATS.map(cat => {
      if (!levels) return null;
      const rows = cat.members.map(g => levels.groups[g]).filter(Array.isArray);
      if (!rows.length) return null;
      const out = new Float32Array(steps);
      for (let i = 0; i < steps; i++) {
        const at = i * GRID / levels.hop - .5;
        let best = -120;
        for (const row of rows) {
          const k = clamp(Math.floor(at), 0, row.length - 1), k2 = Math.min(k + 1, row.length - 1), f = clamp(at - k, 0, 1);
          const db = (row[k] ?? -120) + ((row[k2] ?? -120) - (row[k] ?? -120)) * smooth(f);
          best = Math.max(best, db);
        }
        out[i] = clamp((best + 45) / 40, 0, 1);
      }
      return out;
    });
    // Loudness: the song's energy (dBFS, every hop) for the recorder, PEAK and DROP.
    const energy = model.energy && Array.isArray(model.energy.db) && model.energy.hop > 0 ? model.energy : null;
    const caution = CAUTION.map(() => new Uint8Array(steps));
    const presentCount = present.filter(Boolean).length;
    let silentRun = 0;
    for (let i = 0; i < steps; i++) {
      let on = 0;
      for (let c = 0; c < CATS.length; c++) on += sounding[c][i];
      const t = i * GRID;
      caution[0][i] = presentCount >= 3 && on === presentCount ? 1 : 0;
      caution[1][i] = presentCount >= 2 && on === 1 ? 1 : 0;
      silentRun = on ? 0 : silentRun + GRID;
      caution[2][i] = !on && t > firstNote && t < lastNote && silentRun >= RULES.silenceHold ? 1 : 0;
    }
    if (energy) {
      const at = (t, span) => {
        const a = Math.max(0, Math.floor((t - span) / energy.hop)), b = Math.min(energy.db.length, Math.ceil(t / energy.hop));
        let sum = 0, n = 0;
        for (let k = a; k < b; k++) { sum += 10 ** (energy.db[k] / 10); n++; }
        return n ? 10 * Math.log10(sum / n) : -120;
      };
      const long = new Float32Array(steps), short = new Float32Array(steps);
      for (let i = 0; i < steps; i++) { long[i] = at(i * GRID, RULES.peakSmooth); short[i] = at(i * GRID, RULES.dropShort); }
      const loud = Array.from(long).filter(v => v > -60).sort((a, b) => a - b);
      const peak = loud.length ? loud[Math.floor(loud.length * RULES.peakQuantile)] : Infinity;
      const middle = loud.length ? loud[Math.floor(loud.length * RULES.dropFrom)] : Infinity;
      const look = Math.round(RULES.dropLook / GRID), hold = Math.round(RULES.dropHold / GRID);
      for (let i = 0; i < steps; i++) {
        caution[3][i] = long[i] >= peak ? 1 : 0;
        let before = -120;
        for (let k = Math.max(0, i - look); k <= i - 5; k++) before = Math.max(before, short[k]);
        if (before >= middle && short[i] <= before - RULES.dropDb) for (let k = i; k < Math.min(steps, i + hold); k++) caution[4][k] = 1;
      }
    }
    // HOLD: a note held four seconds or more, from its fourth second to its end.
    for (const n of notes) {
      if (n.end - n.start < RULES.hold) continue;
      for (let i = Math.ceil((n.start + RULES.hold) / GRID); i <= Math.min(steps - 1, Math.floor(n.end / GRID)); i++) caution[6][i] = 1;
    }
    // Register: the mean pitch of what sounds, held where nothing does.
    const register = new Float32Array(steps).fill(NaN);
    for (let i = 0; i < steps; i++) if (pitchCount[i]) register[i] = pitchSum[i] / pitchCount[i];
    // The vocal line for the scope.
    const vocalLane = (model.lanes || []).find(l => l.group === 'vocals' && l.contour && Array.isArray(l.contour.midi) && l.contour.hop > 0);
    const contour = vocalLane ? vocalLane.contour : null;
    let vocalRange = null;
    if (contour) {
      const v = contour.midi.filter(Number.isFinite).sort((a, b) => a - b);
      if (v.length) vocalRange = [v[Math.floor(v.length * .02)] - 2, v[Math.floor(v.length * .98)] + 2];
    } else if (present[0] && range[0][0] <= range[0][1]) vocalRange = [range[0][0] - 2, range[0][1] + 2];
    const sections = (model.sections || []).map(row => ({start: row[0], end: row[1], kind: sectionKind(row)})).filter(s => s.kind);
    const kinds = new Set(sections.map(s => s.kind));
    const chords = (model.chords || []).map(row => ({start: row[0], end: row[1], label: row[2], parts: chordParts(row[2])}))
      .sort((a, b) => a.start - b.start);
    const pan = model.levels && model.levels.pan && Array.isArray(model.levels.pan.mix) && model.levels.pan.hop > 0 ? model.levels.pan : null;
    return {duration, steps, present, sounding, meter, caution, register, contour, vocalRange, range, notes, drums, longest,
      sections, kinds, chords, energy, pan, firstNote, lastNote};
  }

  function create() {
    let prep = null, prepKey = null;
    function ensure(env) {
      if (prepKey !== env.events) { prep = prepare(env.model, env.events); prepKey = env.events; addFill(env); }
      return prep;
    }
    // FILL needs the bar grid; it is added once the grid is known.
    function addFill(env) {
      const bars = barGrid(env);
      if (!bars || !prep.drums.length) return;
      const counts = bars.starts.map((s, i) => {
        const e = bars.starts[i + 1] ?? s + bars.length;
        return lower(prep.drums, e, d => d.time) - lower(prep.drums, s, d => d.time);
      });
      for (let b = 2; b < counts.length; b++) {
        const mean = (counts[b - 1] + counts[b - 2]) / 2;
        if (counts[b] < RULES.fillLeast || counts[b] < mean * RULES.fillRatio || counts[b] < mean + RULES.fillMore) continue;
        const s = bars.starts[b], e = bars.starts[b + 1] ?? s + bars.length;
        for (let i = Math.floor(s / GRID); i <= Math.min(prep.steps - 1, Math.floor(e / GRID)); i++) prep.caution[5][i] = 1;
      }
    }
    // Bars: the model's downbeats, else groups of four beats from the first beat; null without beats.
    function barGrid(env) {
      if (env.downbeats.length >= 2) {
        const d = env.downbeats;
        return {starts: d, length: d[d.length - 1] - d[d.length - 2], perBar: env.beatsPerBar, source: 'downbeats'};
      }
      if (env.beats.length >= 2) {
        const starts = env.beats.filter((_, i) => i % 4 === 0);
        return {starts, length: (env.beats[1] - env.beats[0]) * 4, perBar: 4, source: 'beats'};
      }
      return null;
    }
    // Where a moment is in bars (fractional), or null without a grid.
    function barAt(env, bars, t) {
      const s = bars.starts;
      if (s.length < 2) return null;
      let i = lower(s, t + 1e-6) - 1;
      if (i < 0) return (t - s[0]) / (s[1] - s[0]);
      if (i >= s.length - 1) return s.length - 1 + (t - s[s.length - 1]) / bars.length;
      return i + (t - s[i]) / (s[i + 1] - s[i]);
    }
    // The disc's turn position: one turn = four bars, 12 o'clock on every fourth bar line.
    function turnAt(env, bars, t) {
      if (bars) { const b = barAt(env, bars, t); if (b !== null) return b / 4; }
      return t / FREE_TURN;
    }
    const sample = (series, t) => {
      if (!series) return 0;
      const i = clamp(Math.floor(t / GRID), 0, series.length - 1);
      return series[i];
    };
    // A lamp's light: the share of the last RULES.glow seconds its rule held (rises and falls, never flickers).
    function glow(series, t) {
      if (t <= 0) return 0;
      const n = Math.round(RULES.glow / GRID);
      let on = 0;
      for (let k = 0; k < n; k++) on += sample(series, t - k * GRID) ? 1 : 0;
      return on / n;
    }
    // A needle with inertia as a function of song time: rises at once, falls at `fall` of full scale a second.
    function needle(series, t, fall) {
      if (!series || t <= 0) return 0;
      let v = 0;
      const n = Math.ceil(1 / fall / GRID);
      for (let k = 0; k <= n; k++) {
        const at = t - k * GRID;
        if (at < 0) break;
        v = Math.max(v, sample(series, at) - fall * k * GRID);
      }
      return clamp(v, 0, 1);
    }

    // ---------- drawing ----------
    let p = null;
    function font(kind, size, weight = '') {
      const display = kind === 'stamp' || kind === 'marker';
      p.font = `${!display && weight ? weight + ' ' : ''}${size}px ${FONTS[kind]}`;
    }
    function write(value, x, y, size, color, kind = 'stamp', align = 'left', maxWidth = 0, weight = '') {
      font(kind, size, weight);
      p.fillStyle = color; p.textAlign = align; p.textBaseline = 'middle';
      let shown = String(value ?? '');
      if (maxWidth > 0) while (shown.length > 1 && p.measureText(shown).width > maxWidth) shown = shown.slice(0, -2) + '…';
      p.fillText(shown, x, y);
      return shown;
    }
    function rect(x, y, w, h, fill, edge, width = 1) {
      p.fillStyle = fill; p.fillRect(x, y, w, h);
      if (edge) { p.strokeStyle = edge; p.lineWidth = width; p.strokeRect(x + width / 2, y + width / 2, w - width, h - width); }
    }
    function rounded(x, y, w, h, r, fill, edge, width = 1) {
      p.beginPath(); p.roundRect(x, y, w, h, r);
      if (fill) { p.fillStyle = fill; p.fill(); }
      if (edge) { p.strokeStyle = edge; p.lineWidth = width; p.stroke(); }
    }
    function circle(x, y, r, fill, edge, width = 1) {
      p.beginPath(); p.arc(x, y, r, 0, Math.PI * 2);
      if (fill) { p.fillStyle = fill; p.fill(); }
      if (edge) { p.strokeStyle = edge; p.lineWidth = width; p.stroke(); }
    }
    function screw(x, y) {
      circle(x, y, 4.2, C.screw, C.seam, 1);
      p.beginPath(); p.moveTo(x - 2.8, y - 1.2); p.lineTo(x + 2.8, y + 1.2); p.strokeStyle = C.seam; p.lineWidth = 1.2; p.stroke();
    }
    function panel(x, y, w, h) {
      rect(x, y, w, h, C.panel);
      rect(x, y, w, 2, C.panelHi); rect(x, y, 2, h, C.panelHi);
      rect(x, y + h - 2, w, 2, C.panelLo); rect(x + w - 2, y, 2, h, C.panelLo);
      p.strokeStyle = C.seam; p.lineWidth = 1; p.strokeRect(x + .5, y + .5, w - 1, h - 1);
      screw(x + 9, y + 9); screw(x + w - 9, y + 9); screw(x + 9, y + h - 9); screw(x + w - 9, y + h - 9);
    }
    function lamp(x, y, r, light, hot = C.amberHot, warm = C.amber) {
      circle(x, y, r + 2.5, '#1b1a15');
      if (light > .01) {
        const g = p.createRadialGradient(x, y, 0, x, y, r * 2.4);
        g.addColorStop(0, `rgba(255,178,76,${.45 * light})`); g.addColorStop(1, 'rgba(255,178,76,0)');
        p.fillStyle = g; p.fillRect(x - r * 2.4, y - r * 2.4, r * 4.8, r * 4.8);
      }
      circle(x, y, r, light > .01 ? mixHex(C.lampOff, warm, light) : C.lampOff);
      if (light > .3) circle(x - r * .25, y - r * .25, r * .45, mixHex(warm, hot, light));
    }
    function mixHex(a, b, k) {
      const pa = parseInt(a.slice(1), 16), pb = parseInt(b.slice(1), 16), t = clamp(k, 0, 1);
      const ch = s => Math.round(((pa >> s) & 255) + (((pb >> s) & 255) - ((pa >> s) & 255)) * t);
      return `rgb(${ch(16)},${ch(8)},${ch(0)})`;
    }
    function tube(x, y, w, h, value, label) {
      rect(x, y, w, h, C.tubeGlass, '#4b3a2c', 2);
      font('mono', 30, 'bold');
      p.textAlign = 'center'; p.textBaseline = 'middle';
      p.fillStyle = C.tubeOff; p.fillText(value.replace(/[0-9]/g, '8').replace(/-/g, '8'), x + w / 2, y + h / 2 + 1);
      p.shadowColor = 'rgba(255,138,42,.8)'; p.shadowBlur = 8;
      p.fillStyle = C.tube; p.fillText(value, x + w / 2, y + h / 2 + 1);
      p.shadowBlur = 0;
      write(label, x + w / 2, y + h + 12, 12, C.stampDim, 'stamp', 'center');
    }

    function paint(ctx, env) {
      p = ctx;
      const data = ensure(env);
      const {now, W, H} = env;
      const scale = Math.min(W / DESIGN.width, H / DESIGN.height);
      const ox = (W - DESIGN.width * scale) / 2, oy = (H - DESIGN.height * scale) / 2;
      p.setTransform(1, 0, 0, 1, 0, 0); p.fillStyle = C.void; p.fillRect(0, 0, W, H);
      p.setTransform(scale, 0, 0, scale, ox, oy);
      rect(0, 0, DESIGN.width, DESIGN.height, '#1f211b');
      const bars = barGrid(env);
      const fall = Number.isFinite(env.options.radarFall) ? env.options.radarFall : .6;
      const echo = Number.isFinite(env.options.radarEcho) ? env.options.radarEcho : 1;
      const solo = env.options.focusGroup ? CAT_OF.get(env.options.focusGroup) : undefined;
      const muted = c => solo !== undefined && c !== solo;
      const out = {kind: 'radar-echo-post', scale, origin: [ox, oy], levers: [], solo: solo === undefined ? null : CATS[solo].id};
      top(data, env, bars, now, out);
      strips(data, env, now, fall, muted, out);
      disc(data, env, bars, now, echo, muted, out);
      harmony(data, now, out);
      drumGrid(data, env, bars, now, out);
      recorder(data, now, out);
      keys(data, now, out);
      teleprinter(env, now, out);
      p.setTransform(1, 0, 0, 1, 0, 0);
      return out;
    }

    function top(data, env, bars, now, out) {
      panel(18, 16, 1404, 82);
      rect(44, 26, 232, 62, '#2a2c25', '#55574b', 1.5);
      write('ECHO POST · MK II', 60, 48, 22, C.stamp, 'stamp', 'left', 206, 'bold');
      const track = env.model.track || {};
      const line = [track.title, clean(track.artist)].filter(Boolean).join(' · ');
      out.plate = write(line || '— NO SIGNAL —', 60, 73, 12, C.stampDim, 'mono', 'left', 206);
      lamp(303, 50, 8, 1, '#c8ffd0', C.green);
      write('PWR', 303, 72, 10, C.stampFaint, 'stamp', 'center');
      rect(333, 38, 60, 38, null || '#2c2e27', '#55574b', 1);
      write('SER 0417', 340, 50, 10, C.stampFaint, 'mono');
      write('24V DC', 340, 65, 10, C.stampFaint, 'mono');
      // Section lamps: the current kind lit, the previous one fading out over .35 s.
      const fade = .35, light = SECTION_LAMPS.map(() => 0);
      const i = lower(data.sections, now + 1e-6, s => s.start) - 1;
      for (const k of [i, i - 1]) {
        const s = data.sections[k];
        if (!s) continue;
        const into = clamp((now - s.start) / fade, 0, 1), left = now < s.end ? 1 : clamp(1 - (now - s.end) / fade, 0, 1);
        const at = SECTION_LAMPS.indexOf(s.kind);
        light[at] = Math.max(light[at], Math.min(into, left));
      }
      SECTION_LAMPS.forEach((name, k) => {
        const x = 438 + k * 88, y = 40, w = 82, h = 36, v = light[k], has = data.kinds.has(name);
        rect(x, y, w, h, '#1a1712', '#4a3d2c', 1.5);
        if (v > .01) {
          const g = p.createLinearGradient(x, y, x, y + h);
          g.addColorStop(0, mixHex('#3a2a18', '#ffcf7a', v)); g.addColorStop(1, mixHex('#2a1d10', '#ff9a30', v));
          p.fillStyle = g; p.fillRect(x + 2, y + 2, w - 4, h - 4);
        }
        write(name, x + w / 2, y + h / 2 + 1, 13, v > .4 ? '#2a1a08' : has ? '#c9a77a' : '#5e5040', 'stamp', 'center', w - 6);
      });
      out.section = {lamps: Object.fromEntries(SECTION_LAMPS.map((n, k) => [n, +light[k].toFixed(3)])), kinds: [...data.kinds]};
      // TEMPO / BAR · BEAT / TIME.
      let tempo = '---';
      if (env.beats.length >= 2) {
        const b = env.beats, j = clamp(lower(b, now) - 1, 0, b.length - 2), a = Math.max(0, j - 3), z = Math.min(b.length - 1, j + 4);
        const gaps = []; for (let k = a; k < z; k++) gaps.push(b[k + 1] - b[k]);
        gaps.sort((x, y) => x - y);
        const bpm = 60 / gaps[Math.floor(gaps.length / 2)];
        if (bpm > 20 && bpm < 400) tempo = String(Math.round(bpm)).padStart(3, '0');
      }
      let barBeat = '---·-';
      if (bars && bars.source === 'downbeats' && env.beats.length >= 2) {
        const at = barAt(env, bars, now), idx = Math.floor(at);
        if (idx < 0) barBeat = '000·' + clamp(Math.floor(env.beatAt(now) - env.beatAt(bars.starts[0])) + bars.perBar + 1, 1, bars.perBar);
        else {
          const beat = clamp(Math.floor(env.beatAt(now) - env.beatAt(bars.starts[Math.min(idx, bars.starts.length - 1)]) + 1e-6) + 1, 1, bars.perBar);
          barBeat = String(idx + 1).padStart(3, '0') + '·' + beat;
        }
      }
      const time = Math.floor(now / 60).toString().padStart(2, '0') + ':' + Math.floor(now % 60).toString().padStart(2, '0');
      tube(1094, 28, 72, 42, tempo, 'TEMPO');
      tube(1176, 28, 106, 42, barBeat, 'BAR · BEAT');
      tube(1292, 28, 104, 42, time, 'TIME');
      Object.assign(out, {tempo, barBeat, time});
    }

    function strips(data, env, now, fall, muted, out) {
      panel(18, 112, 296, 772);
      write('CHANNEL STRIPS', 32, 140, 17, C.stamp, 'stamp', 'left', 200, 'bold');
      write('MOD. LVL-7', 300, 141, 10, C.stampFaint, 'stamp', 'right');
      out.meters = {};
      CATS.forEach((cat, i) => {
        const y = 163 + i * 85, has = data.present[i], off = !has || muted(i);
        const value = off ? 0 : needle(data.meter[i], now, fall);
        out.meters[cat.id] = +value.toFixed(3);
        // The meter: a beige face filling its box, a red zone at the top of the scale, a needle on a pivot below.
        const x = 34, w = 164, h = 74;
        rect(x - 2, y - 2, w + 4, h + 4, '#1c1d18');
        rect(x, y, w, h, C.dial, C.dialEdge, 1);
        // The pivot sits inside the face and the needle ends on the scale: at rest it lies on the first tick.
        const cx = x + w / 2, cy = y + h - 9, r = 54, a0 = -Math.PI / 2 - .9, a1 = -Math.PI / 2 + .9;
        p.save(); p.beginPath(); p.rect(x, y, w, h); p.clip();
        p.beginPath(); p.arc(cx, cy, r, a0, a1); p.strokeStyle = C.dialInk; p.lineWidth = 1.2; p.stroke();
        p.beginPath(); p.arc(cx, cy, r, a0 + 1.8 * .78, a1); p.strokeStyle = C.red; p.lineWidth = 4; p.stroke();
        for (let k = 0; k <= 10; k++) {
          const a = a0 + (a1 - a0) * k / 10, long = k % 5 === 0;
          p.beginPath(); p.moveTo(cx + Math.cos(a) * r, cy + Math.sin(a) * r);
          p.lineTo(cx + Math.cos(a) * (r - (long ? 10 : 6)), cy + Math.sin(a) * (r - (long ? 10 : 6)));
          p.strokeStyle = k >= 8 ? C.red : C.dialInk; p.lineWidth = long ? 1.6 : 1; p.stroke();
        }
        const a = a0 + (a1 - a0) * value;
        p.beginPath(); p.moveTo(cx, cy); p.lineTo(cx + Math.cos(a) * (r - 1), cy + Math.sin(a) * (r - 1));
        p.strokeStyle = '#1b1a16'; p.lineWidth = 2; p.stroke();
        circle(cx, cy, 5, '#1b1a16');
        p.restore();
        // The name on tape, stuck on the face's top-left corner.
        p.save(); p.translate(x + 4, y + 4); p.rotate(-.04);
        font('marker', 14, 'bold');
        const tw = p.measureText(cat.strip).width + 10;
        rect(0, 0, tw, 17, C.tape);
        p.fillStyle = 'rgba(0,0,0,.08)'; p.fillRect(0, 15, tw, 2);
        write(cat.strip, 5, 9, 14, C.tapeInk, 'marker', 'left', 0, 'bold');
        p.restore();
        // Lamp and lever.
        lamp(224, y + 27, 9, off ? 0 : 1);
        write('CH' + (i + 1), 224, y + 52, 10, C.stampFaint, 'stamp', 'center');
        const lx = 246, ly = y + 12, lw = 24, lh = 50, up = !off;
        rounded(lx, ly, lw, lh, 12, '#16170f', '#4c4e44', 1.5);
        const knob = up ? ly + 13 : ly + lh - 13;
        p.beginPath(); p.moveTo(lx + lw / 2, ly + lh / 2); p.lineTo(lx + lw / 2, knob);
        p.strokeStyle = '#9a9a8e'; p.lineWidth = 5; p.lineCap = 'round'; p.stroke(); p.lineCap = 'butt';
        circle(lx + lw / 2, knob, 8, has ? '#d6d4c8' : '#6c6b62', '#3a3a33', 1);
        write('IN', 286, y + 20, 12, up ? C.stamp : C.stampFaint, 'stamp');
        write('OUT', 286, y + 54, 12, up ? C.stampFaint : C.stamp, 'stamp');
        out.levers.push({channel: cat.id, x: lx - 4, y: ly - 4, width: lw + 8, height: lh + 8, up, clickable: has && cat.id !== 'other'});
      });
      // Caution lamps.
      write('CAUTION', 32, 770, 15, C.stamp, 'stamp', 'left', 160, 'bold');
      write('MOD. ANN-8', 300, 771, 10, C.stampFaint, 'stamp', 'right');
      rect(32, 785, 268, 64, '#16170f');
      out.caution = {};
      CAUTION.forEach((name, k) => {
        const x = 36 + (k % 4) * 66, y = 789 + Math.floor(k / 4) * 30, w = 62, h = 26;
        const v = name === 'SPARE' ? 0 : glow(data.caution[k], now);
        out.caution[name] = +v.toFixed(3);
        rect(x, y, w, h, mixHex('#3a2a1a', '#ffb24c', v), '#14120d', 1);
        write(name, x + w / 2, y + h / 2 + 1, 12, v > .45 ? '#2a1a08' : name === 'SPARE' ? '#5c5244' : '#c9a77a', 'stamp', 'center', w - 4);
      });
    }

    function disc(data, env, bars, now, echo, muted, out) {
      panel(334, 112, 656, 624);
      const cx = 661, cy = 423, bezel = 300, screen = 270;
      // Bezel with a tick per beat (sixteen to a turn of four 4/4 bars) and finer ones between.
      circle(cx, cy, bezel, '#1d1e19', '#4a4c42', 2);
      const perTurn = bars ? bars.perBar * 4 : 16;
      // Four ticks to a beat: long on the beat, medium on the eighth, short on the sixteenth.
      for (let k = 0; k < perTurn * 4; k++) {
        const a = -Math.PI / 2 + k / (perTurn * 4) * Math.PI * 2, long = k % 4 === 0, mid = k % 2 === 0, first = k === 0;
        const r0 = bezel - 4, r1 = bezel - (first ? 30 : long ? 24 : mid ? 17 : 11);
        p.beginPath(); p.moveTo(cx + Math.cos(a) * r0, cy + Math.sin(a) * r0); p.lineTo(cx + Math.cos(a) * r1, cy + Math.sin(a) * r1);
        p.strokeStyle = first ? '#f0ead2' : long ? '#d8d2bb' : mid ? '#bdb7a0' : '#9a957f'; p.lineWidth = first ? 4 : long ? 3 : mid ? 2.2 : 1.6; p.stroke();
      }
      const g = p.createRadialGradient(cx, cy, 0, cx, cy, screen);
      g.addColorStop(0, C.screenHi); g.addColorStop(1, C.screen);
      circle(cx, cy, screen, null); p.fillStyle = g; p.fill();
      circle(cx, cy, screen, null, C.screenRim, 3);
      p.save(); circle(cx, cy, screen - 1, null); p.clip();
      // Grid: crosshair and the six rings, each a band from its inner to its outer edge.
      p.strokeStyle = C.phosFaint; p.lineWidth = 1;
      p.beginPath(); p.moveTo(cx - screen, cy); p.lineTo(cx + screen, cy); p.moveTo(cx, cy - screen); p.lineTo(cx, cy + screen); p.stroke();
      const outer = screen - 14, inner = 42, band = (outer - inner) / RINGS;
      for (let r = 0; r <= RINGS; r++) { circle(cx, cy, inner + r * band, null, r === RINGS ? C.phosDim : C.phosFaint, 1); }
      const turn = turnAt(env, bars, now), phase = ((turn % 1) + 1) % 1, sweep = -Math.PI / 2 + phase * Math.PI * 2;
      // The phosphor wake behind the sweep.
      for (let k = 0; k < 24; k++) {
        const a = sweep - k * .045;
        p.beginPath(); p.moveTo(cx, cy); p.arc(cx, cy, screen, a - .046, a); p.closePath();
        p.fillStyle = `rgba(110,240,160,${.10 * (1 - k / 24) ** 2})`; p.fill();
      }
      // Echoes: notes from the last `echo` turns, brightest where the sweep just passed, gone after it.
      let echoes = 0;
      const from = data.notes, startFrom = lower(from, now - Math.max(data.longest, 1) - 60, n => n.start);
      const turnLen = Math.max(.5, now - turnTime(env, bars, turn - 1));
      for (let i = startFrom; i < from.length && from[i].start <= now; i++) {
        const n = from[i];
        if (n.cat >= RINGS) continue;
        const end = Math.min(n.end, now);
        const ageEnd = turn - turnAt(env, bars, end);
        if (ageEnd >= echo) continue;
        if (now - n.start > turnLen * echo + data.longest + 1) continue;
        const [lo, hi] = data.range[n.cat];
        const k = hi > lo ? (n.pitch - lo) / (hi - lo) : .5;
        const ring = n.cat, r = outer - (ring + 1) * band + band * (.18 + .64 * k);
        const dim = muted(n.cat) ? .18 : 1;
        const u0 = Math.max(turnAt(env, bars, n.start), turn - echo), u1 = turnAt(env, bars, end);
        const pieces = Math.max(1, Math.ceil((u1 - u0) * 64));
        for (let s = 0; s < pieces; s++) {
          const a0 = u0 + (u1 - u0) * s / pieces, a1 = u0 + (u1 - u0) * (s + 1) / pieces;
          const age = clamp((turn - a1) / echo, 0, 1), alpha = (1 - age) ** 1.6 * dim;
          if (alpha < .02) continue;
          const A0 = -Math.PI / 2 + a0 * Math.PI * 2, A1 = -Math.PI / 2 + a1 * Math.PI * 2;
          p.strokeStyle = `rgba(130,242,166,${alpha})`;
          if (u1 - u0 < .004) {
            circle(cx + Math.cos(A0) * r, cy + Math.sin(A0) * r, 2.6, `rgba(130,242,166,${alpha})`);
          } else {
            p.beginPath(); p.arc(cx, cy, r, A0, Math.max(A1, A0 + .01)); p.lineWidth = 3; p.lineCap = 'round'; p.stroke(); p.lineCap = 'butt';
          }
        }
        echoes++;
      }
      // The sweep line.
      p.beginPath(); p.moveTo(cx, cy); p.lineTo(cx + Math.cos(sweep) * screen, cy + Math.sin(sweep) * screen);
      p.strokeStyle = 'rgba(170,255,200,.85)'; p.lineWidth = 2; p.stroke();
      circle(cx, cy, 4, '#c8ffd8');
      // Ring names at 12 o'clock.
      CATS.slice(0, RINGS).forEach((cat, k) => {
        const r = outer - k * band - band / 2;
        rect(cx - 40, cy - r - 8, 30, 16, 'rgba(6,18,12,.85)');
        write(cat.ring, cx - 12, cy - r, 12, muted(k) || !data.present[k] ? '#2f7a52' : '#8ef5b0', 'mono', 'right', 0, 'bold');
      });
      p.restore();
      // Bar numbers of the turn at the quarters: only on the song's own bar lines.
      if (bars && bars.source === 'downbeats') {
        const first = Math.floor(turn) * 4;
        [[0, -1], [1, 0], [2, 1], [3, 0]].forEach(([q]) => {
          const a = -Math.PI / 2 + q / 4 * Math.PI * 2, r = screen - 26;
          write(String(first + q + 1), cx + Math.cos(a) * r + (q === 0 ? 12 : 0), cy + Math.sin(a) * r, 12, C.phosDim, 'mono', 'center');
        });
      }
      Object.assign(out, {turn: +turn.toFixed(4), angle: +(phase * 360).toFixed(2), echoes});
      // Corner instruments.
      voxScope(data, now, out);
      registerDial(data, now, out);
      panDial(data, now, out);
      // Stamped name and the one sticker.
      write('PPI', 968, 132, 14, C.stamp, 'stamp', 'right', 0, 'bold');
      write('1 REV', 968, 149, 14, C.stamp, 'stamp', 'right', 0, 'bold');
      write(!bars ? FREE_TURN + ' SEC' : bars.source === 'downbeats' ? '4 BARS' : '16 BEATS', 968, 166, 14, C.stamp, 'stamp', 'right', 0, 'bold');
      font('marker', 13);
      const stickerW = Math.ceil(Math.max(p.measureText('OUTER = VOX').width, p.measureText('INNER = BASS').width)) + 12;
      p.save(); p.translate(980 - stickerW, 186); p.rotate(-.05);
      rect(0, 0, stickerW, 34, '#f1ead2'); p.fillStyle = 'rgba(0,0,0,.08)'; p.fillRect(0, 32, stickerW, 2);
      write('OUTER = VOX', 6, 10, 13, C.tapeInk, 'marker', 'left', 0, 'bold');
      write('INNER = BASS', 6, 25, 13, C.tapeInk, 'marker', 'left', 0, 'bold');
      p.restore();
    }
    // The time at which the disc stood at turn position u (inverse of turnAt, by bisection).
    function turnTime(env, bars, u) {
      let lo = -60, hi = (Number(env.model.track.duration) || 600) + 60;
      for (let k = 0; k < 40; k++) { const mid = (lo + hi) / 2; if (turnAt(env, bars, mid) < u) lo = mid; else hi = mid; }
      return lo;
    }

    function voxScope(data, now, out) {
      const cx = 398, cy = 177, r = 55;
      circle(cx, cy, r + 6, '#1b1c17', '#4a4c42', 2);
      circle(cx, cy, r, C.screen, C.screenRim, 2);
      p.save(); circle(cx, cy, r - 1, null); p.clip();
      p.strokeStyle = C.phosFaint; p.lineWidth = 1;
      for (let k = -2; k <= 2; k++) { p.beginPath(); p.moveTo(cx - r, cy + k * 18); p.lineTo(cx + r, cy + k * 18); p.stroke(); }
      for (let k = -2; k <= 2; k++) { p.beginPath(); p.moveTo(cx + k * 22, cy - r); p.lineTo(cx + k * 22, cy + r); p.stroke(); }
      const span = 4, left = cx - r + 4, width = 2 * r - 8, range = data.vocalRange;
      const y = m => range ? cy + 34 - (m - range[0]) / Math.max(1, range[1] - range[0]) * 68 : cy;
      p.beginPath();
      let drawn = 0, pen = false;
      if (data.contour && range) {
        const {hop, midi} = data.contour;
        for (let x = 0; x <= width; x += 1.5) {
          const t = now - span + x / width * span, m = midi[Math.round(t / hop)];
          if (t < 0 || !Number.isFinite(m)) { pen = false; continue; }
          if (pen) p.lineTo(left + x, y(m)); else p.moveTo(left + x, y(m));
          pen = true; drawn++;
        }
      } else if (range) {
        for (const n of data.notes) {
          if (n.cat !== 0 || n.end < now - span || n.start > now) continue;
          const a = left + (Math.max(n.start, now - span) - (now - span)) / span * width, b = left + (Math.min(n.end, now) - (now - span)) / span * width;
          p.moveTo(a, y(n.pitch)); p.lineTo(b, y(n.pitch)); drawn++;
        }
      }
      if (!drawn) { p.moveTo(left, cy); p.lineTo(left + width, cy); }
      p.strokeStyle = C.phos; p.lineWidth = 2; p.shadowColor = 'rgba(130,242,166,.7)'; p.shadowBlur = 4; p.stroke(); p.shadowBlur = 0;
      p.restore();
      write('VOX PITCH', 344, 246, 13, C.stamp, 'stamp', 'left', 0, 'bold');
      out.vox = drawn > 0;
    }
    function registerDial(data, now, out) {
      const cx = 398, cy = 668, r = 50;
      write('REGISTER', 344, 599, 13, C.stamp, 'stamp', 'left', 0, 'bold');
      circle(cx, cy, r + 6, '#1b1c17', '#4a4c42', 2);
      circle(cx, cy, r, C.dial, C.dialEdge, 1);
      // C2..C6 over 240 degrees; the mean pitch of what sounds, held when nothing does, eased over .4 s.
      let value = null, n = 0, sum = 0;
      for (let k = 0; k < 8; k++) { const v = sample(data.register, now - k * GRID); if (Number.isFinite(v) && now - k * GRID >= 0) { sum += v; n++; } }
      if (n) value = sum / n;
      else for (let t = now; t >= 0 && t > now - 600; t -= GRID) { const v = sample(data.register, t); if (Number.isFinite(v)) { value = v; break; } }
      const a0 = Math.PI * .75, a1 = Math.PI * 2.25, at = m => a0 + clamp((m - 36) / 48, 0, 1) * (a1 - a0);
      for (let m = 36; m <= 84; m += 3) {
        const a = at(m), long = m % 12 === 0;
        p.beginPath(); p.moveTo(cx + Math.cos(a) * (r - 3), cy + Math.sin(a) * (r - 3)); p.lineTo(cx + Math.cos(a) * (r - (long ? 11 : 6)), cy + Math.sin(a) * (r - (long ? 11 : 6)));
        p.strokeStyle = C.dialInk; p.lineWidth = long ? 1.6 : 1; p.stroke();
        if (long) write('C' + (m / 12 - 1), cx + Math.cos(a) * (r - 21), cy + Math.sin(a) * (r - 21), 12, C.dialInk, 'mono', 'center');
      }
      const a = at(value ?? 36);
      p.beginPath(); p.moveTo(cx, cy); p.lineTo(cx + Math.cos(a) * (r - 8), cy + Math.sin(a) * (r - 8));
      p.strokeStyle = '#1b1a16'; p.lineWidth = 2.2; p.stroke();
      circle(cx, cy, 4, '#1b1a16');
      out.register = value === null ? null : +value.toFixed(2);
    }
    function panDial(data, now, out) {
      const cx = 926, cy = 670, r = 50;
      write('PAN L / R', 979, 599, 13, C.stamp, 'stamp', 'right', 0, 'bold');
      circle(cx, cy, r + 6, '#1b1c17', '#4a4c42', 2);
      let db = 0;
      if (data.pan) {
        const {hop, mix} = data.pan;
        let sum = 0, n = 0;
        for (let t = now - 1; t <= now; t += .1) {
          if (t < 0) continue;
          const at = t / hop - .5, k = clamp(Math.floor(at), 0, mix.length - 1), k2 = Math.min(k + 1, mix.length - 1);
          sum += mix[k] + (mix[k2] - mix[k]) * clamp(at - k, 0, 1); n++;
        }
        db = n ? sum / n : 0;
      }
      // Left louder tips the horizon down on the left, as a weight would; 6 dB is the full 30 degrees (mixes rarely
      // lean more than a few dB, so a wider scale would hardly move).
      const tilt = -clamp(db / 6, -1, 1) * Math.PI / 6;
      p.save(); circle(cx, cy, r, null); p.clip();
      p.translate(cx, cy); p.rotate(tilt);
      rect(-r - 10, -r - 10, 2 * r + 20, r + 10, '#3d4c5a');
      rect(-r - 10, 0, 2 * r + 20, r + 10, '#4a3f31');
      p.beginPath(); p.moveTo(-r - 10, 0); p.lineTo(r + 10, 0); p.strokeStyle = '#e8e2cc'; p.lineWidth = 1.5; p.stroke();
      p.restore();
      p.beginPath(); p.moveTo(cx - 26, cy); p.lineTo(cx - 8, cy); p.moveTo(cx + 8, cy); p.lineTo(cx + 26, cy);
      p.strokeStyle = C.amber; p.lineWidth = 3; p.stroke(); circle(cx, cy, 3, C.amber);
      write('L', cx - r + 10, cy - 16, 12, C.stamp, 'stamp', 'center', 0, 'bold');
      write('R', cx + r - 10, cy - 16, 12, C.stamp, 'stamp', 'center', 0, 'bold');
      circle(cx, cy, r, null, '#1b1c17', 2);
      out.pan = data.pan ? +db.toFixed(2) : null;
    }

    function harmony(data, now, out) {
      panel(1010, 112, 412, 624);
      write('HARMONY · SIGNAL', 1028, 140, 17, C.stamp, 'stamp', 'left', 260, 'bold');
      write('MOD. HS-4', 1404, 141, 10, C.stampFaint, 'stamp', 'right');
      write('CHORD · FIFTHS', 1028, 170, 12, C.stampDim, 'stamp', 'left', 0, 'bold');
      write('QUALITY', 1246, 170, 12, C.stampDim, 'stamp', 'left', 0, 'bold');
      const cx = 1130, cy = 285, R = 103;
      circle(cx, cy, R, '#1d1e19', '#4a4c42', 2);
      // The current chord and the ones just before it: lit by how long ago they ended.
      const chords = data.chords, i = lower(chords, now + 1e-6, c => c.start) - 1;
      const light = new Array(12).fill(0);
      let current = null;
      for (let k = i, seen = 0; k >= 0 && seen < 6; k--) {
        const c = chords[k];
        if (!c.parts) continue;
        if (c.end > now && c.start <= now) { current = c; light[FIFTH_PC.indexOf(c.parts.pc)] = 1; seen++; continue; }
        const age = now - c.end;
        if (age > 6) break;
        const at = FIFTH_PC.indexOf(c.parts.pc);
        light[at] = Math.max(light[at], .7 * Math.exp(-age / 1.6));
        seen++;
      }
      FIFTHS.forEach((name, k) => {
        const a = -Math.PI / 2 + k / 12 * Math.PI * 2, x = cx + Math.cos(a) * (R - 22), y = cy + Math.sin(a) * (R - 22);
        const v = light[k];
        circle(x, y, 14, mixHex('#2b2620', '#ffb24c', v), '#14120d', 1.5);
        if (v > .6) circle(x, y, 14, null, '#ffe0a0', 2);
        write(name, x, y + 1, 12, v > .45 ? '#2a1a08' : '#b9b2a0', 'mono', 'center', 0, 'bold');
      });
      rect(cx - 40, cy - 28, 80, 56, '#151612', '#5a5c50', 2);
      p.beginPath(); p.moveTo(cx - 38, cy); p.lineTo(cx + 38, cy); p.strokeStyle = '#000'; p.lineWidth = 1; p.stroke();
      const name = current ? current.label : '--';
      write(name, cx, cy + 1, name.length > 5 ? 20 : 27, '#ece6d0', 'mono', 'center', 74, 'bold');
      // Quality lamps, two columns of five.
      rect(1246, 183, 158, 204, '#24261f', '#4a4c42', 1);
      const lit = current ? current.parts.lamps : new Set();
      QUALITY.forEach((q, k) => {
        const x = 1266 + (k % 2) * 70, y = 205 + Math.floor(k / 2) * 39;
        lamp(x, y, 6, lit.has(q) ? 1 : 0);
        write(q, x + 14, y + 1, 13, lit.has(q) ? C.amberHot : C.stampDim, 'mono', 'left', 0, 'bold');
      });
      out.chord = {name: current ? current.label : null, quality: [...lit], fifths: light.map(v => +v.toFixed(3))};
    }

    function drumGrid(data, env, bars, now, out) {
      // The step grid stands on the song's own bar lines only: downbeats (the analysis gives them only for a steady
      // grid that 90 % of the model's bars agree on) and 2-4 beats a bar, four steps to a beat. Without them the
      // grid would invent bars (every four beats from the first), so only the five lamps are shown.
      const per = bars && bars.source === 'downbeats' && env.beats.length >= 2 && [2, 3, 4].includes(bars.perBar) ? bars.perBar : 0;
      const steps = per * 4;
      write('DRUMS · THIS BAR', 1028, 407, 12, C.stampDim, 'stamp', 'left', 0, 'bold');
      write(steps ? steps + ' STEPS' : 'NO BAR LINES · LAMPS ONLY', 1404, 407, 10, C.stampFaint, 'stamp', 'right');
      rect(1028, 420, 376, 122, '#1f201b', '#4a4c42', 1);
      let barStart = null, barEnd = null, step = -1;
      const cells = DRUM_ROWS.map(() => new Array(steps).fill(0));
      if (steps) {
        const b = Math.floor(barAt(env, bars, now));
        if (b >= 0 && b < bars.starts.length) {
          barStart = bars.starts[b]; barEnd = bars.starts[b + 1] ?? barStart + bars.length;
          const b0 = env.beatAt(barStart);
          const stepOf = t => Math.floor(((env.beatAt(t) - b0) / per) * steps + .5);
          step = clamp(Math.floor(((env.beatAt(now) - b0) / per) * steps), 0, steps - 1);
          for (let k = lower(data.drums, barStart - .03, d => d.time); k < data.drums.length && data.drums[k].time < barEnd - .03; k++) {
            const d = data.drums[k], s = stepOf(d.time);
            if (s < 0 || s > steps - 1) continue;
            cells[d.row][s] = d.time <= now + 1e-6 ? 2 : 1;
          }
        }
      }
      // The cells fill the row's width whatever their number (16 for four beats, 12 for three, 8 for two).
      const cellPitch = steps ? Math.min(24, 286 / steps) : 0, cellSize = Math.max(8, cellPitch - 3);
      DRUM_ROWS.forEach((row, r) => {
        const y = 432 + r * 21;
        write(row.label, 1040, y + 7, 12, C.stamp, 'mono', 'left', 0, 'bold');
        // The row lamp: lit at the hit, dark again .15 s later.
        const j = lower(data.drums, now + 1e-6, d => d.time) - 1;
        let v = 0;
        for (let k = j; k >= 0 && now - data.drums[k].time < .15; k--) if (data.drums[k].row === r) { v = 1 - (now - data.drums[k].time) / .15; break; }
        lamp(1094, y + 7, 6, v);
        for (let s = 0; s < steps; s++) {
          const x = 1112 + s * cellPitch + Math.floor(s / 4) * 2, state = cells[r][s];
          const fill = state === 2 ? (s === step ? '#ffd27a' : '#c8742f') : state === 1 ? '#4a3524' : '#2c2d26';
          rect(x, y, cellSize, 15, fill);
          if (s === step) { p.strokeStyle = '#f0ead2'; p.lineWidth = 1.5; p.strokeRect(x - .5, y - .5, cellSize + 1, 16); }
        }
      });
      out.drums = {steps, step, bar: barStart, hits: cells.map(row => row.join(''))};
    }

    function recorder(data, now, out) {
      write('RECORDER · LOUDNESS', 1028, 562, 12, C.stampDim, 'stamp', 'left', 0, 'bold');
      write('WHOLE SONG · 1 SHEET', 1404, 562, 10, C.stampFaint, 'stamp', 'right');
      const x = 1066, y = 576, w = 338, h = 116, lo = -42, hi = 0;
      [0, -12, -24, -36].forEach(db => write(String(db), 1030, y + 6 + (hi - db) / (hi - lo) * (h - 12), 12, C.stampDim, 'mono'));
      rect(x, y, w, h, C.paper, '#8d8670', 1);
      for (let k = 0; k < w; k += 11) { circle(x + 5 + k, y + 4, 1.6, '#5a564a'); circle(x + 5 + k, y + h - 4, 1.6, '#5a564a'); }
      const dur = data.duration || 1, xAt = t => x + 4 + clamp(t / dur, 0, 1) * (w - 8);
      for (let db = -12; db > lo; db -= 12) { const yy = y + 6 + (hi - db) / (hi - lo) * (h - 12); p.beginPath(); p.moveTo(x, yy); p.lineTo(x + w, yy); p.strokeStyle = '#d0c8ae'; p.lineWidth = 1; p.stroke(); }
      // Section starts: dashed marks with their short names.
      p.setLineDash([3, 3]);
      for (const s of data.sections) {
        const sx = xAt(s.start);
        p.beginPath(); p.moveTo(sx, y + 10); p.lineTo(sx, y + h - 8); p.strokeStyle = '#8a8370'; p.lineWidth = 1; p.stroke();
      }
      p.setLineDash([]);
      let lastLabel = -99;
      for (const s of data.sections) {
        const sx = xAt(s.start);
        if (sx - lastLabel < 22) continue;
        write(SECTION_MARK[s.kind], sx + 3, y + 15, 12, C.paperInk, 'mono'); lastLabel = sx;
      }
      const pen = xAt(now);
      if (data.energy) {
        const {hop, db} = data.energy, path = [];
        for (let k = 0; k <= w - 8; k++) {
          const a = Math.floor(k / (w - 8) * dur / hop), b = Math.max(a + 1, Math.floor((k + 1) / (w - 8) * dur / hop));
          let m = -120; for (let i = a; i < Math.min(db.length, b); i++) m = Math.max(m, db[i]);
          path.push([x + 4 + k, y + 6 + (hi - clamp(m, lo, hi)) / (hi - lo) * (h - 12)]);
        }
        const stroke = (clipFrom, clipTo, color, width) => {
          p.save(); p.beginPath(); p.rect(clipFrom, y, clipTo - clipFrom, h); p.clip();
          p.beginPath(); path.forEach(([px, py], i) => i ? p.lineTo(px, py) : p.moveTo(px, py));
          p.strokeStyle = color; p.lineWidth = width; p.stroke(); p.restore();
        };
        stroke(x, x + w, C.paperFaint, 1.2);
        stroke(x, pen, C.paperInk, 1.6);
      }
      p.beginPath(); p.moveTo(pen, y + 2); p.lineTo(pen, y + h - 2); p.strokeStyle = C.pen; p.lineWidth = 2; p.stroke();
      out.recorder = {pen: +((pen - x - 4) / (w - 8)).toFixed(4), trace: Boolean(data.energy)};
      out.recorderBox = {x, y, width: w, height: h, duration: dur};
    }

    function keys(data, now, out) {
      panel(334, 754, 596, 130);
      write('KEYS', 354, 777, 15, C.stamp, 'stamp', 'left', 0, 'bold');
      write('88 · ALL CHANNELS SOUNDING NOW', 910, 777, 11, C.stampFaint, 'mono', 'right');
      const x = 354, y = 795, w = 556, h = 63;
      rect(x, y, w, h, '#16170f', '#4a4c42', 1);
      // Which keys sound now (afterglow .12 s after a note ends).
      const lit = new Float32Array(128);
      const notes = data.notes;
      for (let i = lower(notes, now - data.longest - .2, n => n.start); i < notes.length && notes[i].start <= now; i++) {
        const n = notes[i];
        if (n.end + .12 < now) continue;
        const v = n.end >= now ? 1 : 1 - (now - n.end) / .12;
        lit[n.pitch] = Math.max(lit[n.pitch] || 0, v);
      }
      const whites = [];
      for (let m = 21; m <= 108; m++) if (![1, 3, 6, 8, 10].includes(m % 12)) whites.push(m);
      const ww = (w - 8) / whites.length;
      whites.forEach((m, k) => {
        const kx = x + 4 + k * ww, v = lit[m];
        rect(kx, y + 4, ww - 1, h - 8, v > .01 ? mixHex('#d8d2bf', '#ffb24c', v) : '#d8d2bf');
      });
      for (let m = 21; m <= 108; m++) {
        if (![1, 3, 6, 8, 10].includes(m % 12)) continue;
        const left = whites.indexOf(m - 1), kx = x + 4 + (left + 1) * ww - ww * .32, v = lit[m];
        rect(kx, y + 4, ww * .64, (h - 8) * .6, v > .01 ? mixHex('#1c1b17', '#ff9a30', v) : '#1c1b17');
      }
      for (let o = 1; o <= 8; o++) {
        const k = whites.indexOf(12 * (o + 1));
        if (k >= 0) write('C' + o, x + 4 + k * ww + ww / 2, y + h + 12, 12, C.stampDim, 'mono', 'center');
      }
      out.keys = Array.from(lit).map((v, m) => v > .5 ? m : -1).filter(m => m >= 0);
    }

    // The lyric tape: one line moving left past a fixed print head; each character prints its telegraph code first
    // and its character half a step later. Its position is a function of song time.
    function teleprinter(env, now, out) {
      panel(950, 754, 472, 130);
      write('TELEPRINTER', 970, 777, 15, C.stamp, 'stamp', 'left', 0, 'bold');
      write('UPPER = CODE · LOWER = CLEAR', 1404, 777, 11, C.stampFaint, 'mono', 'right');
      const x = 970, y = 796, w = 316, h = 74, head = x + w - 6;
      rect(x, y, w, h, C.paper, '#8d8670', 1);
      rect(x + w, y - 2, 30, h + 4, '#1f201b', '#4a4c42', 1);
      circle(1378, 832, 22, '#1b1c17', '#8d8a7c', 3); circle(1378, 832, 10, null, '#8d8a7c', 3);
      const tape = tapeOf(env);
      const telegraph = root.XinScoreTelegraph;
      let printing = false;
      const glyphs = [];
      if (tape) {
        // Characters printed by now, the newest at the head.
        const cell = 34;
        let printed = 0, newest = null;
        for (const item of tape.cells) {
          if (item.time > now) break;
          printed++; newest = item;
        }
        // The tape moves one cell per character, gliding over the character's own time.
        let glide = 0;
        if (newest && newest.next > newest.time) glide = clamp((now - newest.time) / Math.min(.12, newest.next - newest.time), 0, 1);
        printing = Boolean(newest && now < newest.lineEnd);
        p.save(); p.beginPath(); p.rect(x + 1, y + 1, w - 2, h - 2); p.clip();
        for (let k = printed - 1, slot = 0; k >= 0; k--, slot++) {
          const item = tape.cells[k], cx = head - cell / 2 - (slot - 1 + glide) * cell - cell;
          if (cx < x - cell) break;
          if (item.dot) { circle(cx, y + h / 2 + 8, 2.5, C.paperInk); continue; }
          const code = item.han ? (telegraph && telegraph.code(item.ch)) || '----' : '';
          if (code) write(code, cx, y + 17, 12, C.paperInk, 'mono', 'center');
          const clear = !item.han || now >= item.time + item.half;
          if (clear) write(item.ch, cx, y + 49, item.han ? 28 : 24, C.paperInk, item.han ? 'hanzi' : 'mono', 'center', 0, 'bold');
          glyphs.push({ch: item.ch, code: code || null, clear});
        }
        p.restore();
      }
      lamp(x + w + 15, y + 12, 5, printing ? 1 : 0);
      out.teleprinter = {printing, newest: glyphs.slice(0, 6), lines: tape ? tape.lines : 0};
    }
    // The lyric lines as print cells: each line's characters spread evenly over its time, a dot between lines.
    let tapeCache = null, tapeKey = null;
    function tapeOf(env) {
      const lyrics = env.lyrics;
      if (!lyrics || !(lyrics.enabled || lyrics.alignment) || !Array.isArray(lyrics.lines) || !lyrics.lines.length) return null;
      const key = [lyrics.lines.length, lyrics.offset, lyrics.enabled, lyrics.alignment, lyrics.lines[0].time, lyrics.lines[lyrics.lines.length - 1].text].join('|');
      if (tapeKey === key) return tapeCache;
      const offset = lyrics.offset || 0, rows = lyrics.lines.filter(l => typeof l.text === 'string' && l.text.trim());
      const cells = [];
      rows.forEach((row, i) => {
        const chars = Array.from(row.text.replace(/\s+/g, ' ').trim());
        const start = row.time + offset, next = rows[i + 1] ? rows[i + 1].time + offset : start + chars.length * .5 + 1;
        const end = Math.min(next - .05, start + Math.max(1.2, chars.length * .5));
        const step = (end - start) / Math.max(1, chars.length);
        chars.forEach((ch, k) => {
          if (ch === ' ') return;
          cells.push({ch, han: isHan(ch), time: start + k * step, half: step / 2, lineEnd: end, next: start + (k + 1) * step});
        });
        if (rows[i + 1]) cells.push({dot: true, time: end, half: 0, lineEnd: end, next: next});
      });
      tapeCache = {cells, lines: rows.length}; tapeKey = key;
      return tapeCache;
    }

    // What a click on the panel means: a lever is that channel's solo, the disc a moment in the turn, the recorder a
    // moment in the song. Coordinates are stage pixels.
    function hit(x, y, frame, env) {
      if (!frame) return null;
      const [ox, oy] = frame.origin, s = frame.scale, dx = (x - ox) / s, dy = (y - oy) / s;
      for (const lever of frame.levers) {
        if (dx >= lever.x && dx <= lever.x + lever.width && dy >= lever.y && dy <= lever.y + lever.height) {
          return lever.clickable ? {kind: 'lane', group: lever.channel, label: CATS.find(c => c.id === lever.channel).strip} : null;
        }
      }
      const box = frame.recorderBox;
      if (box && dx >= box.x && dx <= box.x + box.width && dy >= box.y && dy <= box.y + box.height) {
        return {kind: 'time', time: clamp((dx - box.x - 4) / (box.width - 8), 0, 1) * box.duration};
      }
      const r = Math.hypot(dx - 661, dy - 423);
      if (r <= 270) {
        const bars = barGrid(env), turn = turnAt(env, bars, env.now);
        let phase = (Math.atan2(dy - 423, dx - 661) + Math.PI / 2) / (Math.PI * 2);
        phase = ((phase % 1) + 1) % 1;
        let delta = phase - ((turn % 1) + 1) % 1;
        if (delta > .5) delta -= 1; if (delta < -.5) delta += 1;
        return {kind: 'time', time: Math.max(0, turnTime(env, bars, turn + delta))};
      }
      return null;
    }
    loadFonts();
    return {paint, hit};
  }
  root.XinScoreRadar = Object.freeze({create, ready: loadFonts, chordParts, sectionKind, CATS, QUALITY, SECTION_LAMPS, CAUTION, RULES, DESIGN, FONTS});
  if (typeof module === 'object' && module.exports) module.exports = root.XinScoreRadar;
})(typeof globalThis !== 'undefined' ? globalThis : this);
