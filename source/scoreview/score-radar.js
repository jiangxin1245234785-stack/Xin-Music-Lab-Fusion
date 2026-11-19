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
  const FREE_TURN = 8;
  const ROLL_BEATS = 16;    // the drum strip of a song without bar lines: this many beats back from now      // seconds a turn of the disc takes when the song has no beats
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
  const assetBase = (() => { try { return new URL('./assets/', root.document.currentScript.src).href; } catch (_) { return null; } })();
  const fontBase = assetBase && assetBase + 'fonts/';
  // Every font or material that arrives bumps this, so the cached hardware layers are drawn again with it.
  let assetGen = 0;
  let fontsLoading = null;
  function loadFonts() {
    if (fontsLoading) return fontsLoading;
    const doc = root.document;
    if (!fontBase || typeof root.FontFace !== 'function' || !doc || !doc.fonts) return (fontsLoading = Promise.resolve([]));
    fontsLoading = Promise.all(FACES.map(([family, file]) => {
      const face = new root.FontFace(family, `url("${fontBase}${file}")`);
      return face.load().then(loaded => { doc.fonts.add(loaded); assetGen++; return family; }, () => null);
    })).then(list => list.filter(Boolean));
    return fontsLoading;
  }
  // The weathering (work/score-depth-20261118/SPEC-WEATHER.md, materials by the asset pack the user accepted): each of
  // the six panels has its own plate with its wear already in place, the dial faces are cut from one sheet of paper,
  // the recorder and the tape from a paper strip, three kinds of screw, a faint glass smudge. All of it is hardware: it
  // never changes with the song, so it is drawn into the cached layers once. A file that is not in (yet, or at all)
  // leaves its part to the flat drawing of 0.32.
  const MATERIAL_FILES = Object.freeze({
    plateTop: 'plate-top.png', plateLeft: 'plate-left.png', plateRadar: 'plate-radar.png', plateRight: 'plate-right.png',
    plateKeys: 'plate-keys.png', plateTele: 'plate-teleprinter.png', paperDial: 'paper-dial.png', paperTape: 'paper-tape.png',
    screwSlot: 'screw-slot.png', screwCross: 'screw-cross.png', screwBrass: 'screw-brass.png', glass: 'glass-smudge.png'});
  const MATERIALS = {};
  let materialsLoading = null;
  function loadMaterials() {
    if (materialsLoading) return materialsLoading;
    if (!assetBase || typeof root.Image !== 'function') return (materialsLoading = Promise.resolve([]));
    materialsLoading = Promise.all(Object.entries(MATERIAL_FILES).map(([key, file]) => {
      const image = new root.Image();
      image.src = assetBase + 'radar/' + file;
      return Promise.resolve(image.decode ? image.decode() : null).then(() => { MATERIALS[key] = image; assetGen++; return key; }, () => null);
    })).then(list => list.filter(Boolean));
    return materialsLoading;
  }
  // The fonts and the materials; resolves with the fonts that loaded (as 0.32 did), the materials are listed by
  // materials().
  const ready = () => Promise.all([loadFonts(), loadMaterials()]).then(([fonts]) => fonts);
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
    let prep = null, prepKey = null, prepGen = 0;
    function ensure(env) {
      if (prepKey !== env.events) { prep = prepare(env.model, env.events); prepKey = env.events; prepGen++; addFill(env); }
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
    // Three kinds of screw: slotted old steel, blued cross-heads on the later modules, and a brass one where a lost
    // screw was replaced. Each sits at its own turn (from where it is, not from chance).
    const SCREW = {slot: 'screwSlot', cross: 'screwCross', brass: 'screwBrass'};
    function screw(x, y, kind = 'slot') {
      const image = MATERIALS[SCREW[kind] || 'screwSlot'];
      if (!image) {
        circle(x, y, 4.2, C.screw, C.seam, 1);
        p.beginPath(); p.moveTo(x - 2.8, y - 1.2); p.lineTo(x + 2.8, y + 1.2); p.strokeStyle = C.seam; p.lineWidth = 1.2; p.stroke();
        return;
      }
      p.save(); p.translate(x, y); p.rotate(((x * 7.31 + y * 3.17) % 360) * Math.PI / 180);
      p.drawImage(image, -5, -5, 10, 10);
      p.restore();
    }
    // A panel: its own plate (or the flat paint), the edges and the seam, a screw in each corner (top-left, top-right,
    // bottom-left, bottom-right).
    function panel(x, y, w, h, plate, screws = ['slot', 'slot', 'slot', 'slot']) {
      const image = MATERIALS[plate];
      if (image) p.drawImage(image, x, y, w, h); else rect(x, y, w, h, C.panel);
      rect(x, y, w, 2, C.panelHi); rect(x, y, 2, h, C.panelHi);
      rect(x, y + h - 2, w, 2, C.panelLo); rect(x + w - 2, y, 2, h, C.panelLo);
      p.strokeStyle = C.seam; p.lineWidth = 1; p.strokeRect(x + .5, y + .5, w - 1, h - 1);
      screw(x + 9, y + 9, screws[0]); screw(x + w - 9, y + 9, screws[1]); screw(x + 9, y + h - 9, screws[2]); screw(x + w - 9, y + h - 9, screws[3]);
    }
    // A dial face cut from the one sheet of dial paper (crops of 328 x 148 at two source pixels a design pixel; each
    // face its own part of the sheet), over the flat face colour, with a faint warm margin.
    const DIAL_CROPS = [[38, 48], [620, 81], [321, 250], [104, 434], [653, 502], [422, 699], [58, 844]];
    function dialFace(index, x, y, w, h) {
      rect(x, y, w, h, C.dial);
      const sheet = MATERIALS.paperDial;
      if (!sheet) return;
      const [sx, sy] = DIAL_CROPS[index % DIAL_CROPS.length];
      p.save(); p.globalAlpha = .83;
      p.drawImage(sheet, sx, sy, 2 * w, 2 * h, x, y, w, h);
      p.globalAlpha = 1;
      for (const [x0, y0, x1, y1, rx, ry, rw, rh] of [
        [x, y, x, y + 2, x, y, w, 2], [x, y + h, x, y + h - 2, x, y + h - 2, w, 2],
        [x, y, x + 2, y, x, y + 2, 2, h - 4], [x + w, y, x + w - 2, y, x + w - 2, y + 2, 2, h - 4]]) {
        const age = p.createLinearGradient(x0, y0, x1, y1);
        age.addColorStop(0, 'rgba(140,98,36,.10)'); age.addColorStop(1, 'rgba(140,98,36,0)');
        p.fillStyle = age; p.fillRect(rx, ry, rw, rh);
      }
      p.restore();
    }
    // A round face (REGISTER) from its own part of the dial sheet.
    function roundFace(cx, cy, r, sx, sy) {
      circle(cx, cy, r, C.dial);
      const sheet = MATERIALS.paperDial;
      if (!sheet) return;
      p.save(); circle(cx, cy, r, null); p.clip(); p.globalAlpha = .83;
      p.drawImage(sheet, sx, sy, 4 * r, 4 * r, cx - r, cy - r, 2 * r, 2 * r);
      p.restore();
    }
    // Recording paper (the recorder sheet, the teleprinter tape) from the paper strip, over the flat paper colour.
    function recordPaper(kind, x, y, w, h) {
      const sheet = MATERIALS.paperTape;
      if (!sheet) return;
      p.save(); p.globalAlpha = kind === 'recorder' ? .2 : .28;
      p.drawImage(sheet, 53, kind === 'recorder' ? 12 : 43, 2 * (w - 2), 2 * (h - 2), x + 1, y + 1, w - 2, h - 2);
      p.restore();
    }
    // The glass over a face: a few old finger marks, nearly invisible (the file's strongest pixel is 27 / 255).
    // `k` is source pixels to a design pixel (2 for the small faces; under 1 stretches the sheet over the big screen).
    function glass(x, y, w, h, sx, sy, round = false, k = 2) {
      const smudge = MATERIALS.glass;
      if (!smudge) return;
      p.save();
      if (round) { p.beginPath(); p.ellipse(x + w / 2, y + h / 2, w / 2, h / 2, 0, 0, Math.PI * 2); p.clip(); }
      const cw = Math.min(512 - sx, k * w), ch = Math.min(512 - sy, k * h);
      p.drawImage(smudge, sx, sy, cw, ch, x, y, cw / k, ch / k);
      p.restore();
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
    // A tube readout: the glass, the unlit cathodes and the label are hardware; the lit digits move.
    function tubeBase(x, y, w, h, pattern, label) {
      rect(x, y, w, h, C.tubeGlass, '#4b3a2c', 2);
      font('mono', 30, 'bold');
      p.textAlign = 'center'; p.textBaseline = 'middle';
      p.fillStyle = C.tubeOff; p.fillText(pattern, x + w / 2, y + h / 2 + 1);
      write(label, x + w / 2, y + h + 12, 12, C.stampDim, 'stamp', 'center');
    }
    function tube(x, y, w, h, value) {
      font('mono', 30, 'bold');
      p.textAlign = 'center'; p.textBaseline = 'middle';
      p.shadowColor = 'rgba(255,138,42,.8)'; p.shadowBlur = 8;
      p.fillStyle = C.tube; p.fillText(value, x + w / 2, y + h / 2 + 1);
      p.shadowBlur = 0;
    }

    // Three passes over the same modules: 'base' is the hardware under everything (plates, faces, scales, stamped
    // names, empty beds), 'live' is what moves with the song, 'over' is the hardware on top of what moves (tape on the
    // dial faces, needle caps, the glass). 'base' and 'over' never depend on song time, so they are drawn once into
    // two cached layers and each frame lays them down with one copy each; where no canvas can be made for them (the
    // tests), all three are drawn every frame, in the same order.
    let pass = 'live', layers = null, layerKey = null;
    function every(which, s, out) {
      pass = which;
      try {
        if (which === 'base') rect(0, 0, DESIGN.width, DESIGN.height, '#1f211b');
        top(s.data, s.env, s.bars, s.now, out);
        strips(s.data, s.env, s.now, s.fall, s.muted, out);
        disc(s.data, s.env, s.bars, s.now, s.echo, s.muted, out);
        harmony(s.data, s.now, out);
        drumGrid(s.data, s.env, s.bars, s.now, out);
        recorder(s.data, s.now, out);
        keys(s.data, s.now, out);
        teleprinter(s.env, s.now, out);
      } finally { pass = 'live'; }
    }
    function layerCanvas(ctx, W, H, old) {
      if (old && old.width === W && old.height === H) return old;
      const doc = ctx.canvas && ctx.canvas.ownerDocument;
      const made = doc && typeof doc.createElement === 'function' ? doc.createElement('canvas')
        : typeof root.OffscreenCanvas === 'function' ? new root.OffscreenCanvas(W, H) : null;
      if (!made || typeof made.getContext !== 'function') return null;
      made.width = W; made.height = H;
      return made;
    }
    // The cached layers for this stage size, song, bar grid, tape kind and loaded assets (and nothing that moves).
    function cachedLayers(ctx, s) {
      const {env, bars, scale, ox, oy} = s, t = env.model.track || {};
      const key = [env.W, env.H, prepGen, bars ? bars.source + bars.perBar : '-', env.beats.length >= 2, tapeOf(env) ? 'lyrics' : 'sheet',
        t.title, t.artist, assetGen].join('|');
      if (layers && layerKey === key) return layers;
      const base = layerCanvas(ctx, env.W, env.H, layers && layers.base), over = base && layerCanvas(ctx, env.W, env.H, layers && layers.over);
      if (!base || !over) return null;
      // Setting a canvas's size empties it, also when it is the size it was.
      base.width = env.W; over.width = env.W;
      const keep = p, out = {};
      try {
        p = base.getContext('2d');
        p.setTransform(1, 0, 0, 1, 0, 0); p.fillStyle = C.void; p.fillRect(0, 0, env.W, env.H);
        p.setTransform(scale, 0, 0, scale, ox, oy); every('base', s, out);
        p = over.getContext('2d');
        p.setTransform(scale, 0, 0, scale, ox, oy); every('over', s, out);
      } finally { p = keep; }
      layers = {base, over, out}; layerKey = key; layerDraws++;
      return layers;
    }
    let layerDraws = 0;

    function paint(ctx, env) {
      p = ctx;
      const data = ensure(env);
      const {now, W, H} = env;
      const scale = Math.min(W / DESIGN.width, H / DESIGN.height);
      const ox = (W - DESIGN.width * scale) / 2, oy = (H - DESIGN.height * scale) / 2;
      const bars = barGrid(env);
      const fall = Number.isFinite(env.options.radarFall) ? env.options.radarFall : .6;
      const echo = Number.isFinite(env.options.radarEcho) ? env.options.radarEcho : 1;
      const solo = env.options.focusGroup ? CAT_OF.get(env.options.focusGroup) : undefined;
      const muted = c => solo !== undefined && c !== solo;
      const out = {kind: 'radar-echo-post', scale, origin: [ox, oy], levers: [], solo: solo === undefined ? null : CATS[solo].id};
      const s = {data, env, bars, now, fall, echo, muted, scale, ox, oy};
      const cached = cachedLayers(ctx, s);
      p = ctx;
      p.setTransform(1, 0, 0, 1, 0, 0);
      if (cached) { p.drawImage(cached.base, 0, 0); Object.assign(out, cached.out); }
      else { p.fillStyle = C.void; p.fillRect(0, 0, W, H); p.setTransform(scale, 0, 0, scale, ox, oy); every('base', s, out); }
      p.setTransform(scale, 0, 0, scale, ox, oy);
      every('live', s, out);
      if (cached) { p.setTransform(1, 0, 0, 1, 0, 0); p.drawImage(cached.over, 0, 0); }
      else { p.setTransform(scale, 0, 0, scale, ox, oy); every('over', s, out); }
      p.setTransform(1, 0, 0, 1, 0, 0);
      out.layers = {cached: Boolean(cached), draws: layerDraws, materials: Object.keys(MATERIALS).length};
      return out;
    }

    function top(data, env, bars, now, out) {
      if (pass === 'base') {
        panel(18, 16, 1404, 82, 'plateTop', ['slot', 'slot', 'slot', 'slot']);
        // The rating plate (the user's, SPEC-RADAR.md 铭牌): the two numbers are the telegraph codes of 蒋 and 鑫 from
        // the bundled table, read here, not copied.
        const T = root.XinScoreTelegraph, ohms = [T && T.code('蒋') || '----', T && T.code('鑫') || '----'];
        rect(30, 24, 300, 66, '#2a2c25', '#55574b', 1.5);
        screw(37, 31); screw(323, 31); screw(37, 83); screw(323, 83);
        write('RATING', 46, 33, 8, C.stampFaint, 'mono', 'left');
        const line1 = 'RESISTANCE ' + ohms[0] + '–' + ohms[1] + ' OHMS', line2 = 'MFD. BY & THE BLESSING INSTR. CO.';
        const fit = (text, size, least, width) => { let k = size; for (; k > least; k -= .5) { font('stamp', k); if (p.measureText(text).width <= width) break; } return k; };
        const size1 = fit(line1, 20, 12, 268), size2 = fit(line2, Math.min(size1, 17), 12, 268);
        write(line1, 46, 51, size1, C.stamp, 'stamp', 'left', 270);
        write(line2, 46, 73, size2, C.stamp, 'stamp', 'left', 270);
        out.plate = {line1, line2, size1, size2};
        lamp(350, 50, 8, 1, '#c8ffd0', C.green);
        write('PWR', 350, 72, 10, C.stampFaint, 'stamp', 'center');
        // The small plate: owner cell scratched out, type, date code, inspection stamp.
        rect(370, 26, 114, 62, '#2c2e27', '#55574b', 1);
        write('PROP. OF', 376, 36, 9, C.stampFaint, 'mono', 'left');
        p.save(); p.beginPath(); p.rect(420, 30, 58, 12); p.clip();
        for (let k = 0; k < 14; k++) { p.beginPath(); p.moveTo(418 + k * 5, 43); p.lineTo(426 + k * 5, 29); p.strokeStyle = 'rgba(200,196,176,.45)'; p.lineWidth = 1.1; p.stroke(); }
        p.restore();
        write('TYPE 6R-7C/88', 376, 54, 10, C.stampDim, 'mono', 'left');
        write('5947', 376, 74, 11, C.stampDim, 'mono', 'left');
        circle(462, 72, 12, null, '#8f8b78', 1.2);
        write('INSP.', 462, 68, 7, C.stampDim, 'mono', 'center');
        write('08', 462, 77, 8, C.stampDim, 'mono', 'center');
        SECTION_LAMPS.forEach((name, k) => rect(496 + k * 82, 40, 77, 36, '#1a1712', '#4a3d2c', 1.5));
        tubeBase(1094, 28, 72, 42, '888', 'TEMPO');
        tubeBase(1176, 28, 106, 42, '888·8', 'BAR · BEAT');
        tubeBase(1292, 28, 104, 42, '88:88', 'TIME');
        return;
      }
      if (pass !== 'live') return;
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
        const x = 496 + k * 82, y = 40, w = 77, h = 36, v = light[k], has = data.kinds.has(name);
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
      tube(1094, 28, 72, 42, tempo);
      tube(1176, 28, 106, 42, barBeat);
      tube(1292, 28, 104, 42, time);
      Object.assign(out, {tempo, barBeat, time});
    }

    // Parts of the glass sheet over the seven dial faces (each face its own finger marks).
    const GLASS_CROPS = [[0, 0], [180, 30], [40, 190], [150, 300], [10, 360], [170, 120], [90, 60]];
    function strips(data, env, now, fall, muted, out) {
      const x = 34, w = 164, h = 74;
      // The meter geometry: the pivot sits inside the face and the needle ends on the scale; at rest it lies on the
      // first tick.
      const dial = y => ({cx: x + w / 2, cy: y + h - 9, r: 54, a0: -Math.PI / 2 - .9, a1: -Math.PI / 2 + .9});
      if (pass === 'base') {
        panel(18, 112, 296, 772, 'plateLeft', ['slot', 'slot', 'slot', 'brass']);
        write('CHANNEL STRIPS', 32, 140, 17, C.stamp, 'stamp', 'left', 200, 'bold');
        write('MOD. LVL-7', 300, 141, 10, C.stampFaint, 'stamp', 'right');
        CATS.forEach((cat, i) => {
          const y = 163 + i * 85, {cx, cy, r, a0, a1} = dial(y);
          // The meter: a paper face filling its box, a red zone at the top of the scale.
          rect(x - 2, y - 2, w + 4, h + 4, '#1c1d18');
          dialFace(i, x, y, w, h);
          p.strokeStyle = C.dialEdge; p.lineWidth = 1; p.strokeRect(x + .5, y + .5, w - 1, h - 1);
          p.save(); p.beginPath(); p.rect(x, y, w, h); p.clip();
          p.beginPath(); p.arc(cx, cy, r, a0, a1); p.strokeStyle = C.dialInk; p.lineWidth = 1.2; p.stroke();
          p.beginPath(); p.arc(cx, cy, r, a0 + 1.8 * .78, a1); p.strokeStyle = C.red; p.lineWidth = 4; p.stroke();
          for (let k = 0; k <= 10; k++) {
            const a = a0 + (a1 - a0) * k / 10, long = k % 5 === 0;
            p.beginPath(); p.moveTo(cx + Math.cos(a) * r, cy + Math.sin(a) * r);
            p.lineTo(cx + Math.cos(a) * (r - (long ? 10 : 6)), cy + Math.sin(a) * (r - (long ? 10 : 6)));
            p.strokeStyle = k >= 8 ? C.red : C.dialInk; p.lineWidth = long ? 1.6 : 1; p.stroke();
          }
          p.restore();
          write('CH' + (i + 1), 224, y + 52, 10, C.stampFaint, 'stamp', 'center');
          rounded(246, y + 12, 24, 50, 12, '#16170f', '#4c4e44', 1.5);
        });
        write('CAUTION', 32, 770, 15, C.stamp, 'stamp', 'left', 160, 'bold');
        write('MOD. ANN-8', 300, 771, 10, C.stampFaint, 'stamp', 'right');
        rect(32, 785, 268, 64, '#16170f');
        return;
      }
      if (pass === 'over') {
        CATS.forEach((cat, i) => {
          const y = 163 + i * 85, {cx, cy} = dial(y);
          circle(cx, cy, 5, '#1b1a16');
          glass(x, y, w, h, GLASS_CROPS[i][0], GLASS_CROPS[i][1]);
          // The name on tape, stuck on the face's top-left corner.
          p.save(); p.translate(x + 4, y + 4); p.rotate(-.04);
          font('marker', 14, 'bold');
          const tw = p.measureText(cat.strip).width + 10;
          rect(0, 0, tw, 17, C.tape);
          p.fillStyle = 'rgba(0,0,0,.08)'; p.fillRect(0, 15, tw, 2);
          write(cat.strip, 5, 9, 14, C.tapeInk, 'marker', 'left', 0, 'bold');
          p.restore();
        });
        return;
      }
      out.meters = {};
      CATS.forEach((cat, i) => {
        const y = 163 + i * 85, has = data.present[i], off = !has || muted(i);
        const value = off ? 0 : needle(data.meter[i], now, fall);
        out.meters[cat.id] = +value.toFixed(3);
        const {cx, cy, r, a0, a1} = dial(y);
        p.save(); p.beginPath(); p.rect(x, y, w, h); p.clip();
        const a = a0 + (a1 - a0) * value;
        p.beginPath(); p.moveTo(cx, cy); p.lineTo(cx + Math.cos(a) * (r - 1), cy + Math.sin(a) * (r - 1));
        p.strokeStyle = '#1b1a16'; p.lineWidth = 2; p.stroke();
        p.restore();
        // Lamp and lever.
        lamp(224, y + 27, 9, off ? 0 : 1);
        const lx = 246, ly = y + 12, lw = 24, lh = 50, up = !off;
        const knob = up ? ly + 13 : ly + lh - 13;
        p.beginPath(); p.moveTo(lx + lw / 2, ly + lh / 2); p.lineTo(lx + lw / 2, knob);
        p.strokeStyle = '#9a9a8e'; p.lineWidth = 5; p.lineCap = 'round'; p.stroke(); p.lineCap = 'butt';
        circle(lx + lw / 2, knob, 8, has ? '#d6d4c8' : '#6c6b62', '#3a3a33', 1);
        write('IN', 286, y + 20, 12, up ? C.stamp : C.stampFaint, 'stamp');
        write('OUT', 286, y + 54, 12, up ? C.stampFaint : C.stamp, 'stamp');
        out.levers.push({channel: cat.id, x: lx - 4, y: ly - 4, width: lw + 8, height: lh + 8, up, clickable: has && cat.id !== 'other'});
      });
      // Caution lamps.
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
      const cx = 661, cy = 423, bezel = 300, screen = 270;
      const outer = screen - 14, inner = 42, band = (outer - inner) / RINGS;
      if (pass === 'base') {
        panel(334, 112, 656, 624, 'plateRadar', ['cross', 'cross', 'brass', 'cross']);
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
        for (let r = 0; r <= RINGS; r++) { circle(cx, cy, inner + r * band, null, r === RINGS ? C.phosDim : C.phosFaint, 1); }
        p.restore();
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
      } else if (pass === 'over') {
        glass(cx - screen, cy - screen, 2 * screen, 2 * screen, 0, 0, true, 512 / (2 * screen));
      } else {
        p.save(); circle(cx, cy, screen - 1, null); p.clip();
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
      }
      // Corner instruments.
      voxScope(data, now, out);
      registerDial(data, now, out);
      panDial(data, now, out);
    }
    // The time at which the disc stood at turn position u (inverse of turnAt, by bisection).
    function turnTime(env, bars, u) {
      let lo = -60, hi = (Number(env.model.track.duration) || 600) + 60;
      for (let k = 0; k < 40; k++) { const mid = (lo + hi) / 2; if (turnAt(env, bars, mid) < u) lo = mid; else hi = mid; }
      return lo;
    }

    function voxScope(data, now, out) {
      const cx = 398, cy = 177, r = 55;
      if (pass === 'base') {
        circle(cx, cy, r + 6, '#1b1c17', '#4a4c42', 2);
        circle(cx, cy, r, C.screen, C.screenRim, 2);
        p.save(); circle(cx, cy, r - 1, null); p.clip();
        p.strokeStyle = C.phosFaint; p.lineWidth = 1;
        for (let k = -2; k <= 2; k++) { p.beginPath(); p.moveTo(cx - r, cy + k * 18); p.lineTo(cx + r, cy + k * 18); p.stroke(); }
        for (let k = -2; k <= 2; k++) { p.beginPath(); p.moveTo(cx + k * 22, cy - r); p.lineTo(cx + k * 22, cy + r); p.stroke(); }
        p.restore();
        write('VOX PITCH', 344, 246, 13, C.stamp, 'stamp', 'left', 0, 'bold');
        return;
      }
      if (pass === 'over') { glass(cx - r, cy - r, 2 * r, 2 * r, 300, 40, true); return; }
      p.save(); circle(cx, cy, r - 1, null); p.clip();
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
      out.vox = drawn > 0;
    }
    function registerDial(data, now, out) {
      const cx = 398, cy = 668, r = 50;
      const a0 = Math.PI * .75, a1 = Math.PI * 2.25, at = m => a0 + clamp((m - 36) / 48, 0, 1) * (a1 - a0);
      if (pass === 'base') {
        write('REGISTER', 344, 599, 13, C.stamp, 'stamp', 'left', 0, 'bold');
        circle(cx, cy, r + 6, '#1b1c17', '#4a4c42', 2);
        roundFace(cx, cy, r, 760, 780);
        circle(cx, cy, r, null, C.dialEdge, 1);
        // C2..C6 over 240 degrees.
        for (let m = 36; m <= 84; m += 3) {
          const a = at(m), long = m % 12 === 0;
          p.beginPath(); p.moveTo(cx + Math.cos(a) * (r - 3), cy + Math.sin(a) * (r - 3)); p.lineTo(cx + Math.cos(a) * (r - (long ? 11 : 6)), cy + Math.sin(a) * (r - (long ? 11 : 6)));
          p.strokeStyle = C.dialInk; p.lineWidth = long ? 1.6 : 1; p.stroke();
          if (long) write('C' + (m / 12 - 1), cx + Math.cos(a) * (r - 21), cy + Math.sin(a) * (r - 21), 12, C.dialInk, 'mono', 'center');
        }
        return;
      }
      if (pass === 'over') { circle(cx, cy, 4, '#1b1a16'); glass(cx - r, cy - r, 2 * r, 2 * r, 120, 380, true); return; }
      // The mean pitch of what sounds, held when nothing does, eased over .4 s.
      let value = null, n = 0, sum = 0;
      for (let k = 0; k < 8; k++) { const v = sample(data.register, now - k * GRID); if (Number.isFinite(v) && now - k * GRID >= 0) { sum += v; n++; } }
      if (n) value = sum / n;
      else for (let t = now; t >= 0 && t > now - 600; t -= GRID) { const v = sample(data.register, t); if (Number.isFinite(v)) { value = v; break; } }
      const a = at(value ?? 36);
      p.beginPath(); p.moveTo(cx, cy); p.lineTo(cx + Math.cos(a) * (r - 8), cy + Math.sin(a) * (r - 8));
      p.strokeStyle = '#1b1a16'; p.lineWidth = 2.2; p.stroke();
      out.register = value === null ? null : +value.toFixed(2);
    }
    function panDial(data, now, out) {
      const cx = 926, cy = 670, r = 50;
      if (pass === 'base') {
        write('PAN L / R', 979, 599, 13, C.stamp, 'stamp', 'right', 0, 'bold');
        circle(cx, cy, r + 6, '#1b1c17', '#4a4c42', 2);
        return;
      }
      if (pass === 'over') { glass(cx - r, cy - r, 2 * r, 2 * r, 380, 200, true); return; }
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
      const cx = 1130, cy = 285, R = 103;
      if (pass === 'base') {
        panel(1010, 112, 412, 624, 'plateRight', ['cross', 'cross', 'cross', 'cross']);
        write('HARMONY · SIGNAL', 1028, 140, 17, C.stamp, 'stamp', 'left', 260, 'bold');
        write('MOD. HS-4', 1404, 141, 10, C.stampFaint, 'stamp', 'right');
        write('CHORD · FIFTHS', 1028, 170, 12, C.stampDim, 'stamp', 'left', 0, 'bold');
        write('QUALITY', 1246, 170, 12, C.stampDim, 'stamp', 'left', 0, 'bold');
        circle(cx, cy, R, '#1d1e19', '#4a4c42', 2);
        rect(cx - 40, cy - 28, 80, 56, '#151612', '#5a5c50', 2);
        rect(1246, 183, 158, 204, '#24261f', '#4a4c42', 1);
        return;
      }
      if (pass !== 'live') return;
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
      p.beginPath(); p.moveTo(cx - 38, cy); p.lineTo(cx + 38, cy); p.strokeStyle = '#000'; p.lineWidth = 1; p.stroke();
      const name = current ? current.label : '--';
      write(name, cx, cy + 1, name.length > 5 ? 20 : 27, '#ece6d0', 'mono', 'center', 74, 'bold');
      // Quality lamps, two columns of five.
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
      // Without bar lines but with beats: the last ROLL_BEATS beats roll right to left, beats marked, no bars.
      const roll = !steps && env.beats.length >= 2;
      if (pass === 'base') {
        write(steps ? 'DRUMS · THIS BAR' : roll ? 'DRUMS · LAST ' + ROLL_BEATS + ' BEATS' : 'DRUMS', 1028, 407, 12, C.stampDim, 'stamp', 'left', 0, 'bold');
        write(steps ? steps + ' STEPS' : roll ? 'NO BAR LINES · BEATS ONLY' : 'NO BEATS · LAMPS ONLY', 1404, 407, 10, C.stampFaint, 'stamp', 'right');
        rect(1028, 420, 376, 122, '#1f201b', '#4a4c42', 1);
        DRUM_ROWS.forEach((row, r) => write(row.label, 1040, 432 + r * 21 + 7, 12, C.stamp, 'mono', 'left', 0, 'bold'));
        return;
      }
      if (pass !== 'live') return;
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
      // The rolling strip: x from the beat position, the newest beat at the right edge; a faint line on every beat
      // (none heavier: no bars), each hit a short bar, brighter the more recent.
      const rolled = DRUM_ROWS.map(() => []);
      const left = 1112, width = 286, nowBeat = roll ? env.beatAt(now) : 0, perBeat = width / ROLL_BEATS;
      const xOf = beat => left + width - (nowBeat - beat) * perBeat;
      if (roll) {
        for (let k = Math.ceil(nowBeat - ROLL_BEATS); k <= Math.floor(nowBeat); k++) {
          const x = xOf(k);
          p.beginPath(); p.moveTo(x, 428); p.lineTo(x, 536); p.strokeStyle = '#34352d'; p.lineWidth = 1; p.stroke();
        }
        p.beginPath(); p.moveTo(left + width, 426); p.lineTo(left + width, 538); p.strokeStyle = '#f0ead2'; p.lineWidth = 1.5; p.stroke();
      }
      function rollRow(r, y) {
        const shown = [];
        rect(left, y, width, 15, '#24251f');
        const from = env.timeAtBeat ? env.timeAtBeat(nowBeat - ROLL_BEATS) : now - 8;
        for (let k = lower(data.drums, from - .01, d => d.time); k < data.drums.length && data.drums[k].time <= now + 1e-6; k++) {
          const d = data.drums[k];
          if (d.row !== r) continue;
          const beat = env.beatAt(d.time), age = nowBeat - beat;
          if (age < 0 || age > ROLL_BEATS) continue;
          const x = xOf(beat);
          rect(x - 2, y + 1, 4, 13, mixHex('#6a4426', '#ffc06a', clamp(1 - age / ROLL_BEATS, 0, 1) * .8 + .2));
          shown.push(+beat.toFixed(2));
        }
        return shown;
      }
      DRUM_ROWS.forEach((row, r) => {
        const y = 432 + r * 21;
        // The row lamp: lit at the hit, dark again .15 s later.
        const j = lower(data.drums, now + 1e-6, d => d.time) - 1;
        let v = 0;
        for (let k = j; k >= 0 && now - data.drums[k].time < .15; k--) if (data.drums[k].row === r) { v = 1 - (now - data.drums[k].time) / .15; break; }
        lamp(1094, y + 7, 6, v);
        if (roll) rolled[r] = rollRow(r, y);
        for (let s = 0; s < steps; s++) {
          const x = 1112 + s * cellPitch + Math.floor(s / 4) * 2, state = cells[r][s];
          const fill = state === 2 ? (s === step ? '#ffd27a' : '#c8742f') : state === 1 ? '#4a3524' : '#2c2d26';
          rect(x, y, cellSize, 15, fill);
          if (s === step) { p.strokeStyle = '#f0ead2'; p.lineWidth = 1.5; p.strokeRect(x - .5, y - .5, cellSize + 1, 16); }
        }
      });
      out.drums = {mode: steps ? 'bar' : roll ? 'roll' : 'lamps', steps, step, bar: barStart, hits: cells.map(row => row.join('')),
        ...(roll ? {nowBeat: +nowBeat.toFixed(3), rolled} : {})};
    }

    function recorder(data, now, out) {
      const x = 1066, y = 576, w = 338, h = 116, lo = -42, hi = 0;
      const dur = data.duration || 1, xAt = t => x + 4 + clamp(t / dur, 0, 1) * (w - 8);
      // The whole song's trace, one point a pixel column (the loudest hop in it); made once per song.
      const path = () => {
        if (data.recorderPath) return data.recorderPath;
        const {hop, db} = data.energy, out = [];
        for (let k = 0; k <= w - 8; k++) {
          const a = Math.floor(k / (w - 8) * dur / hop), b = Math.max(a + 1, Math.floor((k + 1) / (w - 8) * dur / hop));
          let m = -120; for (let i = a; i < Math.min(db.length, b); i++) m = Math.max(m, db[i]);
          out.push([x + 4 + k, y + 6 + (hi - clamp(m, lo, hi)) / (hi - lo) * (h - 12)]);
        }
        return (data.recorderPath = out);
      };
      const stroke = (clipFrom, clipTo, color, width) => {
        p.save(); p.beginPath(); p.rect(clipFrom, y, clipTo - clipFrom, h); p.clip();
        p.beginPath(); path().forEach(([px, py], i) => i ? p.lineTo(px, py) : p.moveTo(px, py));
        p.strokeStyle = color; p.lineWidth = width; p.stroke(); p.restore();
      };
      if (pass === 'base') {
        write('RECORDER · LOUDNESS', 1028, 562, 12, C.stampDim, 'stamp', 'left', 0, 'bold');
        write('WHOLE SONG · 1 SHEET', 1404, 562, 10, C.stampFaint, 'stamp', 'right');
        [0, -12, -24, -36].forEach(db => write(String(db), 1030, y + 6 + (hi - db) / (hi - lo) * (h - 12), 12, C.stampDim, 'mono'));
        rect(x, y, w, h, C.paper);
        recordPaper('recorder', x, y, w, h);
        p.strokeStyle = '#8d8670'; p.lineWidth = 1; p.strokeRect(x + .5, y + .5, w - 1, h - 1);
        for (let k = 0; k < w; k += 11) { circle(x + 5 + k, y + 4, 1.6, '#5a564a'); circle(x + 5 + k, y + h - 4, 1.6, '#5a564a'); }
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
        // The faint whole-song trace is on the sheet from the start.
        if (data.energy) stroke(x, x + w, C.paperFaint, 1.2);
        out.recorderBox = {x, y, width: w, height: h, duration: dur};
        return;
      }
      if (pass !== 'live') return;
      const pen = xAt(now);
      if (data.energy) stroke(x, pen, C.paperInk, 1.6);
      p.beginPath(); p.moveTo(pen, y + 2); p.lineTo(pen, y + h - 2); p.strokeStyle = C.pen; p.lineWidth = 2; p.stroke();
      out.recorder = {pen: +((pen - x - 4) / (w - 8)).toFixed(4), trace: Boolean(data.energy)};
    }

    function keys(data, now, out) {
      if (pass === 'base') {
        panel(334, 754, 596, 130, 'plateKeys', ['cross', 'cross', 'cross', 'cross']);
        write('KEYS', 354, 777, 15, C.stamp, 'stamp', 'left', 0, 'bold');
        write('88 · ALL CHANNELS SOUNDING NOW', 910, 777, 11, C.stampFaint, 'mono', 'right');
      }
      const x = 354, y = 795, w = 556, h = 63;
      const whites = [];
      for (let m = 21; m <= 108; m++) if (![1, 3, 6, 8, 10].includes(m % 12)) whites.push(m);
      const ww = (w - 8) / whites.length;
      if (pass === 'base') {
        rect(x, y, w, h, '#16170f', '#4a4c42', 1);
        for (let o = 1; o <= 8; o++) {
          const k = whites.indexOf(12 * (o + 1));
          if (k >= 0) write('C' + o, x + 4 + k * ww + ww / 2, y + h + 12, 12, C.stampDim, 'mono', 'center');
        }
        return;
      }
      if (pass !== 'live') return;
      // Which keys sound now (afterglow .12 s after a note ends).
      const lit = new Float32Array(128);
      const notes = data.notes;
      for (let i = lower(notes, now - data.longest - .2, n => n.start); i < notes.length && notes[i].start <= now; i++) {
        const n = notes[i];
        if (n.end + .12 < now) continue;
        const v = n.end >= now ? 1 : 1 - (now - n.end) / .12;
        lit[n.pitch] = Math.max(lit[n.pitch] || 0, v);
      }
      whites.forEach((m, k) => {
        const kx = x + 4 + k * ww, v = lit[m];
        rect(kx, y + 4, ww - 1, h - 8, v > .01 ? mixHex('#d8d2bf', '#ffb24c', v) : '#d8d2bf');
      });
      for (let m = 21; m <= 108; m++) {
        if (![1, 3, 6, 8, 10].includes(m % 12)) continue;
        const left = whites.indexOf(m - 1), kx = x + 4 + (left + 1) * ww - ww * .32, v = lit[m];
        rect(kx, y + 4, ww * .64, (h - 8) * .6, v > .01 ? mixHex('#1c1b17', '#ff9a30', v) : '#1c1b17');
      }
      out.keys = Array.from(lit).map((v, m) => v > .5 ? m : -1).filter(m => m >= 0);
    }

    // The lyric tape: one line moving left past a fixed print head; each character prints its telegraph code first
    // and its character half a step later. Its position is a function of song time.
    // The teleprinter's title row: the song being taken down, in its own language, cut to fit; the key under the paper.
    function teleTitle(env, key, out) {
      const t = env.model.track || {}, song = [t.title, clean(t.artist)].filter(Boolean).join(' · ');
      write('TELEPRINTER', 970, 777, 15, C.stamp, 'stamp', 'left', 0, 'bold');
      font('stamp', 15);
      const left = 970 + p.measureText('TELEPRINTER').width + 12;
      const han = /\p{Script=Han}/u.test(song);
      out.teleTitle = write(song || '— NO SIGNAL —', left, 778, 13, C.stamp, han ? 'hanzi' : 'mono', 'left', 1404 - left, 'bold');
      write(key, 970, 877, 10, C.stampFaint, 'mono', 'left');
    }
    function teleprinter(env, now, out) {
      const x = 970, y = 796, w = 316, h = 74, head = x + w - 6;
      const tape = tapeOf(env);
      if (pass === 'base') {
        panel(950, 754, 472, 130, 'plateTele', ['slot', 'slot', 'slot', 'slot']);
        // The key under the paper says what the tape holds: lyrics, or the track sheet when there are none.
        teleTitle(env, tape ? 'UPPER = CODE · LOWER = CLEAR' : 'TRACK SHEET · UPPER = FIELD · LOWER = VALUE', out);
        rect(x, y, w, h, C.paper);
        recordPaper('tape', x, y, w, h);
        p.strokeStyle = '#8d8670'; p.lineWidth = 1; p.strokeRect(x + .5, y + .5, w - 1, h - 1);
        rect(x + w, y - 2, 30, h + 4, '#1f201b', '#4a4c42', 1);
        circle(1378, 832, 22, '#1b1c17', '#8d8a7c', 3); circle(1378, 832, 10, null, '#8d8a7c', 3);
        return;
      }
      if (pass !== 'live') return;
      if (!tape) { trackSheet(env, now, out, {x, y, w, h, head}); return; }
      const telegraph = root.XinScoreTelegraph;
      let printing = false;
      const glyphs = [];
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
      lamp(x + w + 15, y + 12, 5, printing ? 1 : 0);
      out.teleprinter = {mode: 'lyrics', printing, newest: glyphs.slice(0, 6), lines: tape.lines, lead: tape.lead};
    }
    // The track sheet: the fields of model.track that are there, in this order. Values as the tags give them.
    const SHEET = Object.freeze([
      ['TITLE', t => t.title], ['ARTIST', t => clean(t.artist)], ['ALBUM', t => clean(t.album)], ['ALBUM ARTIST', t => clean(t.albumArtist)],
      ['DATE', t => t.date || t.year], ['TRACK', t => t.number ? (t.trackTotal ? t.number + ' / ' + t.trackTotal : String(t.number)) : ''],
      ['DISC', t => t.disc ? (t.discTotal ? t.disc + ' / ' + t.discTotal : String(t.disc)) : ''], ['GENRE', t => t.genre],
      ['COMPOSER', t => t.composer], ['LYRICS BY', t => t.lyricist], ['ARRANGER', t => t.arranger], ['LABEL', t => t.label],
      ['LENGTH', t => Number(t.duration) > 0 ? Math.floor(t.duration / 60) + ':' + String(Math.floor(t.duration % 60)).padStart(2, '0') : '']]);
    const SHEET_CHAR = .08;   // seconds a character takes to print
    let sheetCache = null, sheetKey = null;
    function sheetOf(env) {
      const t = env.model.track || {}, key = JSON.stringify(t);
      if (sheetKey === key) return sheetCache;
      // A host's ordered list (model.track.facts: [{name, value}]) is printed as it is, in its order; without one, the
      // tag fields above.
      const given = Array.isArray(t.facts) ? t.facts.filter(f => f && typeof f.name === 'string' && f.name.trim() && f.value != null && String(f.value).trim()) : [];
      const fields = given.length ? given.map(f => [f.name.trim().toUpperCase(), String(f.value).trim()])
        : SHEET.map(([name, get]) => [name, String(get(t) ?? '').trim()]).filter(([, value]) => value);
      // Title and artist print at once; the others start evenly over the song after them.
      const duration = Math.max(1, Number(t.duration) || 1), items = [];
      let at = .5;
      fields.forEach(([name, value], i) => {
        const chars = Array.from(value);
        if (i >= 2) at = Math.max(at, 2 + (duration - 8) * (i - 1) / Math.max(1, fields.length - 1));
        items.push({name, value, chars, start: at, end: at + chars.length * SHEET_CHAR, han: chars.some(isHan)});
        at += chars.length * SHEET_CHAR + .4;
      });
      sheetCache = items; sheetKey = key;
      return items;
    }
    function trackSheet(env, now, out, {x, y, w, h, head}) {
      // The title row (the song) and the key under the paper are hardware, in teleprinter()'s base pass.
      const items = sheetOf(env), shown = [];
      // What has printed by now, as pieces laid right to left from the head: each a field, then a dot.
      const pieces = [];
      for (const item of items) {
        if (item.start > now) break;
        const count = clamp(Math.floor((now - item.start) / SHEET_CHAR) + 1, 0, item.chars.length);
        const value = item.chars.slice(0, count).join('');
        font(item.han ? 'hanzi' : 'mono', item.han ? 24 : 20, 'bold');
        const valueW = p.measureText(value).width;
        font('mono', 12);
        const nameW = p.measureText(item.name).width;
        pieces.push({item, value, width: Math.max(valueW, count === item.chars.length ? nameW : 0) + 4});
        if (count === item.chars.length && now >= item.end + .2) pieces.push({dot: true, width: 18});
        shown.push({field: item.name, value, done: count === item.chars.length});
      }
      p.save(); p.beginPath(); p.rect(x + 1, y + 1, w - 2, h - 2); p.clip();
      let right = head - 4;
      for (let k = pieces.length - 1; k >= 0 && right > x - 400; k--) {
        const piece = pieces[k], left = right - piece.width;
        if (piece.dot) circle(left + piece.width / 2, y + h / 2 + 8, 2.5, C.paperInk);
        else {
          write(piece.item.name, left, y + 17, 12, C.paperFaint === undefined ? C.paperInk : '#6b6656', 'mono', 'left');
          write(piece.value, left, y + 49, piece.item.han ? 24 : 20, C.paperInk, piece.item.han ? 'hanzi' : 'mono', 'left', 0, 'bold');
        }
        right = left - 6;
      }
      p.restore();
      const printing = items.some(item => now >= item.start && now < item.end);
      lamp(x + w + 15, y + 12, 5, printing ? 1 : 0);
      out.teleprinter = {mode: 'sheet', printing, fields: items.map(item => [item.name, item.value]), shown, lines: 0};
    }
    // The lyric lines as print cells, a dot between lines. A character is sung at its even share of its line's time
    // (as before); the tape prints ahead of the singing (SPEC-WEATHER, the user: printing is slow, so align it early):
    // each line starts `radarLead` seconds early (never before the previous line's dot) and is printed by 70 % of its
    // sung time, so every character is on the tape before it is sung; the clear character follows its code after a
    // short beat (a quarter of its print step, at most .1 s), not half a step. The lyrics' own timing is not changed.
    const LEAD = .4, PRINT_BY = .7;   // the three settings are LEADS: .2 / .4 / .7 s
    let tapeCache = null, tapeKey = null;
    function tapeOf(env) {
      const lyrics = env.lyrics;
      if (!lyrics || !(lyrics.enabled || lyrics.alignment) || !Array.isArray(lyrics.lines) || !lyrics.lines.length) return null;
      const lead = Number.isFinite(env.options && env.options.radarLead) ? clamp(env.options.radarLead, 0, 1.5) : LEAD;
      const key = [lyrics.lines.length, lyrics.offset, lyrics.enabled, lyrics.alignment, lyrics.lines[0].time, lyrics.lines[lyrics.lines.length - 1].text, lead].join('|');
      if (tapeKey === key) return tapeCache;
      const offset = lyrics.offset || 0, rows = lyrics.lines.filter(l => typeof l.text === 'string' && l.text.trim());
      const cells = [];
      let lastDot = -Infinity;
      rows.forEach((row, i) => {
        const chars = Array.from(row.text.replace(/\s+/g, ' ').trim());
        const start = row.time + offset, next = rows[i + 1] ? rows[i + 1].time + offset : start + chars.length * .5 + 1;
        const end = Math.min(next - .05, start + Math.max(1.2, chars.length * .5));
        const n = Math.max(1, chars.length), sungStep = (end - start) / n;
        const from = Math.min(start, Math.max(start - lead, lastDot + .05)), until = start + PRINT_BY * (end - start);
        const step = (until - from) / n, half = Math.min(.1, step / 4);
        chars.forEach((ch, k) => {
          if (ch === ' ') return;
          cells.push({ch, han: isHan(ch), time: from + k * step, sung: start + k * sungStep, half, lineEnd: until, next: from + (k + 1) * step});
        });
        if (rows[i + 1]) { cells.push({dot: true, time: until, half: 0, lineEnd: until, next: next}); lastDot = until; }
      });
      tapeCache = {cells, lines: rows.length, lead}; tapeKey = key;
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
    ready();
    return {paint, hit, tape: env => tapeOf(env)};
  }
  const LEADS = Object.freeze([.2, .4, .7]);
  const materials = () => Object.keys(MATERIALS).filter(key => MATERIALS[key]);
  root.XinScoreRadar = Object.freeze({create, ready, materials, MATERIAL_FILES, LEADS, chordParts, sectionKind, CATS, QUALITY, SECTION_LAMPS, CAUTION, RULES, DESIGN, FONTS});
  if (typeof module === 'object' && module.exports) module.exports = root.XinScoreRadar;
})(typeof globalThis !== 'undefined' ? globalThis : this);
