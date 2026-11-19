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
  const SECTION_MARK = Object.freeze({INTRO: 'INT', VERSE: 'VRS', PRE: 'PRE', CHORUS: 'CHO', INST: 'INS', BRIDGE: 'BRG', OUTRO: 'OUTR'});
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
    stamp: '#dcd6bf', stampDim: '#b3ad96', stampFaint: '#928d78',
    dial: '#e7dfc4', dialEdge: '#b9b195', dialInk: '#2b2a23', red: '#b5412d', amberInk: '#d08a2a', tape: '#efe6c8', tapeInk: '#2a2722',
    screen: '#0c2117', screenHi: '#123323', screenRim: '#060f0a', phos: '#82f2a6', phosDim: '#3c9c66', phosFaint: '#1f5a3b',
    amber: '#ffb24c', amberHot: '#ffe0a0', amberLow: '#5a3a1c', lampOff: '#2d241b',
    tube: '#ff8a2a', tubeHot: '#ffc27a', tubeOff: '#3b2015', tubeGlass: '#170d08',
    paper: '#e4dcc3', paperInk: '#38362e', paperFaint: '#b9b199', pen: '#b3362b', green: '#6ee08c', greenOff: '#1d3324'
  });
  const FONTS = Object.freeze({
    stamp: '"National Park", "Bahnschrift", "Arial Narrow", sans-serif',
    plate: '"Barlow Condensed", "Bahnschrift Condensed", "Arial Narrow", sans-serif',
    plateBold: '"Barlow Condensed SemiBold", "Barlow Condensed", "Bahnschrift Condensed", "Arial Narrow", sans-serif',
    mono: '"Courier Prime", "Courier New", monospace',
    marker: '"Permanent Marker", "Ink Free", "Segoe Print", "Comic Sans MS", cursive',
    hanzi: '"FangSong", "仿宋", "STFangsong", "KaiTi", "楷体", "SimSun", serif'
  });
  const clamp = (n, a, b) => Math.max(a, Math.min(b, n));
  // The channel lamps (score-radar-lamps.js: three jewel lamps a strip, red / amber / green, lit by how loud the
  // channel is against itself). Loaded before this file in the page; in Node, beside it.
  const lampsApi = () => root.XinScoreRadarLamps || (typeof require === 'function' ? (() => { try { return require('./score-radar-lamps.js'); } catch (_) { return null; } })() : null);
  const LAMP_SIZE = 12, LAMP_GAP = 14;
  // The channel meters' scale: the needle rests at METER_ZERO_DB and reaches full scale METER_SPAN_DB above it. The
  // lamps' "sounding" gate is the same zero.
  const METER_ZERO_DB = -45, METER_SPAN_DB = 40;
  // radar.5 feedback (SPEC-WEATHER): each meter is calibrated for its own channel, as the operators did (the tag and
  // the crayon marks): the needle rests at METER_ZERO_DB, enters the amber arc at the channel's yellow line, the red
  // arc at its red line (score-radar-lamps.js thresholds()), and reaches full scale at the channel's loudest second.
  // The zones sit at the same place on every dial; the lamps light from the zone the needle shows.
  const METER_AMBER = .6, METER_RED = .8, LAMP_AFTERGLOW = .25;
  // Tube cathodes: one stroked wire per digit (SVG-like commands M L Q C, absolute, in a 20 x 28 box at 30 px), after
  // the "self-drawn cathode" design the user accepted (work/score-depth-20261118/fonts-gpt, specimens.js).
  const CATHODES = (() => {
    const src = {
      0: 'M10 2 C4 2 3 7 3 14 C3 21 4 26 10 26 C16 26 17 21 17 14 C17 7 16 2 10 2',
      1: 'M5 8 Q8 6 11 2 L11 26', 2: 'M3 8 Q4 2 10 2 C17 2 19 9 14 14 L4 24 Q3 26 5 26 L17 26',
      3: 'M3 4 Q10 0 15 3 Q20 9 11 13 C21 13 19 26 10 26 Q5 26 2 23', 4: 'M15 26 L15 3 Q15 1 14 3 L2.5 18.5 L18 18.5',
      5: 'M17 2.5 L5 2.5 L4 12 Q7 10 11 10 C20 10 20 26 10 26 Q5 26 2.5 23', 6: 'M15 3 C8 3 3 10 3 18 C3 29 18 29 17 18 C16 10 7 10 4 16',
      7: 'M2.5 3 L17 3 Q18 3 16 6 L7 26', 8: 'M10 13 C2 10 3 2 10 2 C18 2 18 10 10 13 C0 16 2 26 10 26 C19 26 21 16 10 13',
      9: 'M5 25 C12 24 17 17 17 9 C17 0 3 0 3 9 C3 18 14 19 17 11', '-': 'M5 15 L15 15'};
    const out = {};
    for (const [ch, d] of Object.entries(src)) {
      const path = [];
      for (const m of d.matchAll(/([MLQC])([^MLQC]*)/g)) path.push([m[1], ...m[2].trim().split(/[\s,]+/).map(Number)]);
      const xs = path.flatMap(([, ...v]) => v.filter((_, i) => i % 2 === 0));
      out[ch] = {path, mid: (Math.min(...xs) + Math.max(...xs)) / 2};
    }
    return Object.freeze(out);
  })();
  // The bundled faces (assets/fonts, each with its licence; SPEC-WEATHER batch 3): National Park SemiBold for what is
  // engraved on the panels, Barlow Condensed Medium for the plates and the dial and scale numerals, Courier Prime for
  // the tape and paper text (all SIL OFL 1.1), Permanent Marker (Apache 2.0) for the hand-written tape. Loaded once;
  // the fallbacks above draw until they are in. The tube digits are drawn (tubeDigits), not set in a face.
  // Barlow Condensed SemiBold (same licence file as the Medium) stamps the rating plate's two lines.
  const FACES = Object.freeze([['National Park', 'NationalPark-SemiBold.ttf'], ['Barlow Condensed', 'BarlowCondensed-Medium.ttf'],
    ['Barlow Condensed SemiBold', 'BarlowCondensed-SemiBold.ttf'],
    ['Courier Prime', 'CourierPrime-Regular.ttf'], ['Permanent Marker', 'PermanentMarker-Regular.ttf']]);
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
    screwSlot: 'screw-slot.png', screwCross: 'screw-cross.png', screwBrass: 'screw-brass.png', glass: 'glass-smudge.png',
    // Batch 4: tape stock for the hand-written names, the calibration tag, the cover plate over a removed dial.
    stickerA: 'sticker-a.png', stickerB: 'sticker-b.png', stickerC: 'sticker-c.png', tagCal: 'tag-cal.png', coverPlate: 'cover-plate.png'});
  const MATERIALS = {};
  // The layout audit's record (null when off) and the frame's placement, see write().
  let auditSink = null, auditView = null, auditClip = null;
  const audit = on => (auditSink = on ? [] : null);
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

  // A channel's level (dB) as the needle's place on its dial (0..1): zero to amber, amber to red, red to the top, each
  // stretch straight; without a calibration the plain scale.
  function meterScale(db, cal) {
    if (!cal) return clamp((db - METER_ZERO_DB) / METER_SPAN_DB, 0, 1);
    if (db <= METER_ZERO_DB) return 0;
    if (db < cal.yellow) return METER_AMBER * (db - METER_ZERO_DB) / Math.max(.5, cal.yellow - METER_ZERO_DB);
    if (db < cal.red) return METER_AMBER + (METER_RED - METER_AMBER) * (db - cal.yellow) / Math.max(.5, cal.red - cal.yellow);
    return clamp(METER_RED + (1 - METER_RED) * (db - cal.red) / Math.max(.5, cal.top - cal.red), METER_RED, 1);
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
    const Lm = lampsApi(), calibration = levels && Lm ? Lm.thresholds(levels, {gateDb: METER_ZERO_DB}) : null, calibrated = CATS.map(() => null);
    const meter = CATS.map(cat => {
      if (!levels) return null;
      const rows = cat.members.map(g => levels.groups[g]).filter(Array.isArray);
      if (!rows.length) return null;
      const out = new Float32Array(steps), series = new Float32Array(steps);
      for (let i = 0; i < steps; i++) {
        const at = i * GRID / levels.hop - .5;
        let best = -120;
        for (const row of rows) {
          const k = clamp(Math.floor(at), 0, row.length - 1), k2 = Math.min(k + 1, row.length - 1), f = clamp(at - k, 0, 1);
          const db = (row[k] ?? -120) + ((row[k2] ?? -120) - (row[k] ?? -120)) * smooth(f);
          best = Math.max(best, db);
        }
        series[i] = best;
      }
      // Calibrated for this channel when the lamp module gives its lines, else the plain scale (zero to zero + span).
      const limits = calibration && calibration.channels[cat.id];
      let top = -Infinity;
      for (const row of rows) for (const v of row) if (Number.isFinite(v)) top = Math.max(top, v);
      const cal = limits && Number.isFinite(limits.yellow) && Number.isFinite(limits.red)
        ? {yellow: limits.yellow, red: Math.max(limits.red, limits.yellow), top: Math.max(top, Math.max(limits.red, limits.yellow) + .5)} : null;
      calibrated[CATS.indexOf(cat)] = cal ? {channel: cat.id, ...cal} : null;
      for (let i = 0; i < steps; i++) out[i] = meterScale(series[i], cal);
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
    // Crayon marks (batch 4): an operator marked "normal" on the three meters that move most, at where each sits on
    // average while its channel sounds. Real data: the meter series, not a guess.
    const usage = meter.map((series, c) => {
      if (!series || !present[c]) return null;
      let n = 0, sum = 0;
      for (let i = 0; i < steps; i++) if (series[i] > .02) { n++; sum += series[i]; }
      return n ? {channel: c, seconds: n * GRID, mean: sum / n} : null;
    }).filter(Boolean).sort((a, b) => b.seconds - a.seconds || a.channel - b.channel).slice(0, 3);
    return {duration, steps, present, sounding, meter, calibrated, lampCut: calibration, caution, register, contour, vocalRange, range, notes, drums, longest, usage,
      sections, kinds, chords, energy, pan, firstNote, lastNote};
  }

  function create() {
    let prep = null, prepKey = null, prepGen = 0;
    function ensure(env) {
      if (prepKey !== env.events) {
        prep = prepare(env.model, env.events); prepKey = env.events; prepGen++; addFill(env);
      }
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
    // Whether a moment is inside the song's measured bars: from the first bar line to one bar after the last.
    const inBars = (bars, t) => bars.starts.length >= 2 && t >= bars.starts[0] - 1e-6 && t < bars.starts[bars.starts.length - 1] + bars.length - 1e-6;
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
    // The three lamps from the needle (radar.5 feedback): green while it is off zero, amber while it is in the amber
    // arc or beyond, red while in the red arc; each lamp fades over LAMP_AFTERGLOW once the needle has left its zone
    // (a lamp may go out a little after the needle, never light before it).
    function needleLamps(series, t, fall, overshoot) {
      const out = {green: 0, yellow: 0, red: 0};
      for (let k = 0; k * GRID <= LAMP_AFTERGLOW + 1e-9; k++) {
        const at = t - k * GRID;
        if (at <= 0) break;
        const v = needle(series, at, fall, overshoot), glow = 1 - k * GRID / LAMP_AFTERGLOW;
        if (v > .005) out.green = Math.max(out.green, glow);
        if (v >= METER_AMBER) out.yellow = Math.max(out.yellow, glow);
        if (v >= METER_RED) out.red = Math.max(out.red, glow);
      }
      return out;
    }
    // A needle with inertia as a function of song time: rises at once, falls at `fall` of full scale a second.
    function needle(series, t, fall, overshoot = false) {
      if (!series || t <= 0) return 0;
      let v = 0;
      const n = Math.ceil(1 / fall / GRID);
      for (let k = 0; k <= n; k++) {
        const at = t - k * GRID;
        if (at < 0) break;
        v = Math.max(v, sample(series, at) - fall * k * GRID);
      }
      // A needle that arrives with a little too much (batch 4): each rise of the level swings it past by a damped
      // half-wave and back, over about .4 s. Read from the series behind the moment, so any frame is the same.
      if (overshoot) {
        const step = Math.floor(t / GRID);
        for (let k = 0; k < 9; k++) {
          const i = step - k;
          if (i < 1) break;
          const rise = sample(series, i * GRID) - sample(series, (i - 1) * GRID);
          if (rise <= .01) continue;
          const age = t - i * GRID;
          v += rise * .22 * Math.exp(-age / .11) * Math.sin(Math.PI * age / .17);
        }
      }
      return clamp(v, 0, 1);
    }

    // ---------- drawing ----------
    let p = null;
    function font(kind, size, weight = '') {
      const own = kind !== 'hanzi';   // the bundled faces have one weight each; no synthetic bold
      p.font = `${!own && weight ? weight + ' ' : ''}${size}px ${FONTS[kind]}`;
    }
    // The rule for colour (radar.5 feedback): what is engraved, printed or stuck on the panel keeps one brightness and
    // colour whatever the data does. Only these change with the song: lamps and the legends lit from behind by them
    // (section lamps, caution cells, the fifths lamps' letters), needles, what the screens draw (the echoes, the
    // scope's beam, the bar numbers), the tube digits, the tape as it prints, and the positions of levers.
    // `baseline` 'middle' (y is the text's middle) or 'alphabetic' (y is its baseline: rows of two sizes).
    function write(value, x, y, size, color, kind = 'stamp', align = 'left', maxWidth = 0, weight = '', baseline = 'middle') {
      font(kind, size, weight);
      p.fillStyle = color; p.textAlign = align; p.textBaseline = baseline;
      let shown = String(value ?? '');
      if (maxWidth > 0 && p.measureText(shown).width > maxWidth) {
        const chars = Array.from(shown);
        do { chars.pop(); shown = chars.join('') + '…'; } while (chars.length > 1 && p.measureText(shown).width > maxWidth);
      }
      if ((kind === 'stamp' || kind === 'plate') && depth > 0 && (color === C.stamp || color === C.stampDim || color === C.stampFaint)) {
        p.fillStyle = `rgba(0,0,0,${Math.min(.75, .55 * depth)})`; p.fillText(shown, x - .6, y - .6);
        p.fillStyle = `rgba(255,248,230,${Math.min(.3, .14 * depth)})`; p.fillText(shown, x + .5, y + .55);
        p.fillStyle = color;
      }
      p.fillText(shown, x, y);
      if (auditSink) auditText(shown, x, y, size, kind, align, color);
      return shown;
    }
    // The layout audit (SPEC-WEATHER 基础校对): with XinScoreRadar.audit(true) every text, frame, screw and dial is
    // recorded with its box in design pixels, for tools/radar-layout.cjs to check. Off, it costs one test a call.
    function toDesign(px, py) {
      const m = typeof p.getTransform === 'function' ? p.getTransform() : null;
      if (!m || !auditView) return [px, py];
      const sx = m.a * px + m.c * py + m.e, sy = m.b * px + m.d * py + m.f;
      return [(sx - auditView.ox) / auditView.scale, (sy - auditView.oy) / auditView.scale];
    }
    function auditBox(x0, y0, x1, y1) {
      const pts = [toDesign(x0, y0), toDesign(x1, y0), toDesign(x0, y1), toDesign(x1, y1)];
      const xs = pts.map(q => q[0]), ys = pts.map(q => q[1]);
      return {x: Math.min(...xs), y: Math.min(...ys), w: Math.max(...xs) - Math.min(...xs), h: Math.max(...ys) - Math.min(...ys)};
    }
    function auditText(text, x, y, size, kind, align, color) {
      const m = p.measureText(text), w = m.width;
      const left = align === 'center' ? x - w / 2 : align === 'right' ? x - w : x;
      const alpha = p.textBaseline === 'alphabetic';
      const up = Number.isFinite(m.actualBoundingBoxAscent) ? m.actualBoundingBoxAscent : size * (alpha ? .75 : .5);
      const down = Number.isFinite(m.actualBoundingBoxDescent) ? m.actualBoundingBoxDescent : size * (alpha ? .25 : .5);
      let box = auditBox(left, y - up, left + w, y + down);
      if (auditClip) {
        const c = auditClip, x0 = Math.max(box.x, c.x), y0 = Math.max(box.y, c.y), x1 = Math.min(box.x + box.w, c.x + c.w), y1 = Math.min(box.y + box.h, c.y + c.h);
        if (x1 <= x0 || y1 <= y0) return;
        box = {x: x0, y: y0, w: x1 - x0, h: y1 - y0};
      }
      const [ax, ay] = toDesign(x, y);
      auditSink.push({type: 'text', text, size, kind, color, pass, clipped: Boolean(auditClip), align, ax, ay, ...box});
    }
    function auditShape(type, box, extra) { if (auditSink) auditSink.push({type, pass, ...box, ...extra}); }
    function rect(x, y, w, h, fill, edge, width = 1) {
      p.fillStyle = fill; p.fillRect(x, y, w, h);
      if (edge) { p.strokeStyle = edge; p.lineWidth = width; p.strokeRect(x + width / 2, y + width / 2, w - width, h - width); }
      if (edge && auditSink) auditShape('frame', auditBox(x, y, x + w, y + h));
    }
    function rounded(x, y, w, h, r, fill, edge, width = 1) {
      p.beginPath(); p.roundRect(x, y, w, h, r);
      if (fill) { p.fillStyle = fill; p.fill(); }
      if (edge) { p.strokeStyle = edge; p.lineWidth = width; p.stroke(); }
      if (edge && auditSink) auditShape('frame', auditBox(x, y, x + w, y + h));
    }
    function circle(x, y, r, fill, edge, width = 1) {
      p.beginPath(); p.arc(x, y, r, 0, Math.PI * 2);
      if (fill) { p.fillStyle = fill; p.fill(); }
      if (edge) { p.strokeStyle = edge; p.lineWidth = width; p.stroke(); }
      if (edge && auditSink && r >= 8) { const [cx, cy] = toDesign(x, y); auditShape('ring', {cx, cy, r: r * (auditView ? 1 : 1)}); }
    }
    // Thickness (SPEC-WEATHER batch 2): one light from the top left over the whole panel. `depth` is the strength
    // (options.radarDepth: 1 light, 1.6 heavier; 0 flat), `unit` stage pixels to a design pixel (canvas shadows are not
    // scaled by the transform). A part is traced by a function that adds its outline to the current path.
    let depth = 1, corner = 'cut', unit = 1;
    const box = (x, y, w, h, r) => () => p.roundRect(x, y, w, h, r);
    const disk = (cx, cy, r) => () => { p.moveTo(cx + r, cy); p.arc(cx, cy, r, 0, Math.PI * 2); };
    const cut = (x, y, w, h, r) => () => {
      p.moveTo(x + r, y); p.lineTo(x + w - r, y); p.lineTo(x + w, y + r); p.lineTo(x + w, y + h - r);
      p.lineTo(x + w - r, y + h); p.lineTo(x + r, y + h); p.lineTo(x, y + h - r); p.lineTo(x, y + r); p.closePath();
    };
    // The shadow a raised part throws on the surface under it (down and to the right).
    function cast(trace, size = 1) {
      if (depth <= 0) return;
      p.save();
      p.shadowColor = `rgba(0,0,0,${Math.min(.8, .5 * depth)})`;
      p.shadowBlur = 4 * size * depth * unit; p.shadowOffsetX = 1.2 * size * depth * unit; p.shadowOffsetY = 1.8 * size * depth * unit;
      p.beginPath(); trace(); p.fillStyle = '#000'; p.fill();
      p.restore();
    }
    // An edge in the light: on a raised part the top and left edges catch it and the bottom and right fall dark; in a
    // recess the other way round. (x, y, w, h) is the part's box, split along the 45° lines from its corners.
    function edge(trace, x, y, w, h, raised = true, width = 1.5, amount = 1) {
      if (depth <= 0) return;
      const m = Math.min(w, h) / 2, hi = Math.min(.9, .16 * depth * amount), lo = Math.min(.9, .34 * depth * amount);
      [[[x - 9, y + h + 9], [x - 9, y - 9], [x + w + 9, y - 9], [x + w - m, y + m], [x + m, y + h - m]],
        [[x - 9, y + h + 9], [x + w + 9, y + h + 9], [x + w + 9, y - 9], [x + w - m, y + m], [x + m, y + h - m]]].forEach((poly, k) => {
        const light = (k === 0) === raised;
        p.save(); p.beginPath(); poly.forEach(([px, py], i) => i ? p.lineTo(px, py) : p.moveTo(px, py)); p.closePath(); p.clip();
        p.beginPath(); trace(); p.strokeStyle = light ? `rgba(255,246,222,${hi})` : `rgba(0,0,0,${lo})`; p.lineWidth = width; p.stroke();
        p.restore();
      });
    }
    // The shadow inside a recess, thrown by its top-left lip.
    function inset(trace, size = 1) {
      if (depth <= 0) return;
      p.save(); p.beginPath(); trace(); p.clip();
      p.shadowColor = `rgba(0,0,0,${Math.min(.85, .55 * depth)})`; p.shadowBlur = 4 * size * depth * unit;
      p.shadowOffsetX = 1.2 * size * depth * unit; p.shadowOffsetY = 1.7 * size * depth * unit;
      p.beginPath(); p.rect(-3000, -3000, 9000, 9000); trace(); p.fillStyle = '#000'; p.fill('evenodd');
      p.restore();
    }
    // A recessed window or bed: rounded, filled, framed, with its inner shadow and lit lower lip.
    function bed(x, y, w, h, r, fill, rim, size = 1) {
      rounded(x, y, w, h, r, fill, rim, 1);
      inset(box(x, y, w, h, r), size);
      edge(box(x + .5, y + .5, w - 1, h - 1, r), x, y, w, h, false, 1, .8);
    }
    // A raised plate: its shadow, body, frame and lit edges.
    function raisedPlate(x, y, w, h, r, fill, rim, size = 1) {
      cast(box(x, y, w, h, r), size);
      rounded(x, y, w, h, r, fill, rim, 1.2);
      edge(box(x + .75, y + .75, w - 1.5, h - 1.5, r), x, y, w, h, true, 1.5);
    }
    // Three kinds of screw: slotted old steel, blued cross-heads on the later modules, and a brass one where a lost
    // screw was replaced. Each sits at its own turn (from where it is, not from chance).
    const SCREW = {slot: 'screwSlot', cross: 'screwCross', brass: 'screwBrass'};
    function screw(x, y, kind = 'slot') {
      if (auditSink) { const [cx, cy] = toDesign(x, y); auditShape('screw', {cx, cy, r: 5}); }
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
      if (auditSink) auditShape('panel', {x, y, w, h});
      const image = MATERIALS[plate], R = 8;
      const outline = corner === 'cut' ? cut(x, y, w, h, R) : box(x, y, w, h, R);
      cast(outline, 2.2);
      p.save(); p.beginPath(); outline(); p.clip();
      if (image) p.drawImage(image, x, y, w, h); else rect(x, y, w, h, C.panel);
      p.restore();
      const inner = corner === 'cut' ? cut(x + 1.25, y + 1.25, w - 2.5, h - 2.5, R - .5) : box(x + 1.25, y + 1.25, w - 2.5, h - 2.5, R - 1);
      if (depth > 0) edge(inner, x, y, w, h, true, 2.5, 1.2);
      else { rect(x, y, w, 2, C.panelHi); rect(x, y, 2, h, C.panelHi); rect(x, y + h - 2, w, 2, C.panelLo); rect(x + w - 2, y, 2, h, C.panelLo); }
      p.beginPath(); outline(); p.strokeStyle = C.seam; p.lineWidth = 1; p.stroke();
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
    // The tape's left end: the paper again over its last `fw` px, opaque at the edge and gone by fw, so what scrolls out
    // fades into the machine instead of being cut. Made once per asset generation (a small canvas), laid every frame.
    const fades = {};
    function paperFade(kind, x, y, h, fw = 30) {
      const key = kind + '|' + h + '|' + assetGen;
      if (!(key in fades)) {
        let made = null;
        const doc = p.canvas && p.canvas.ownerDocument;
        if (doc && typeof doc.createElement === 'function') {
          made = doc.createElement('canvas');
          made.width = fw * 2; made.height = (h - 2) * 2;
          const keep = p;
          p = made.getContext('2d');
          try {
            p.setTransform(2, 0, 0, 2, 0, 0);
            rect(0, 0, fw, h - 2, C.paper);
            recordPaper(kind, -1, -1, fw + 2, h);
            p.globalCompositeOperation = 'destination-in';
            const ramp = p.createLinearGradient(0, 0, fw, 0);
            ramp.addColorStop(0, 'rgba(0,0,0,1)'); ramp.addColorStop(.25, 'rgba(0,0,0,.9)'); ramp.addColorStop(1, 'rgba(0,0,0,0)');
            p.fillStyle = ramp; p.fillRect(0, 0, fw, h - 2);
            p.globalCompositeOperation = 'source-over';
          } finally { p = keep; }
        }
        fades[key] = made;
      }
      if (fades[key]) { p.drawImage(fades[key], x + 1, y + 1, fw, h - 2); return; }
      const ramp = p.createLinearGradient(x + 1, 0, x + 1 + fw, 0);
      ramp.addColorStop(0, C.paper); ramp.addColorStop(1, 'rgba(228,220,195,0)');
      p.fillStyle = ramp; p.fillRect(x + 1, y + 1, fw, h - 2);
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
      // The housing throws a small shadow, its rim catches the light; the lens is dark glass when off.
      if (depth > 0) circle(x + .9 * depth, y + 1.3 * depth, r + 2.6, `rgba(0,0,0,${Math.min(.6, .35 * depth)})`);
      circle(x, y, r + 2.5, '#1b1a15');
      if (depth > 0) {
        const rim = p.createLinearGradient(x - r, y - r, x + r, y + r);
        rim.addColorStop(0, `rgba(255,246,222,${Math.min(.6, .28 * depth)})`); rim.addColorStop(1, `rgba(0,0,0,${Math.min(.7, .4 * depth)})`);
        circle(x, y, r + 1.8, null, rim, 1.2);
      }
      if (light > .01) {
        const g = p.createRadialGradient(x, y, 0, x, y, r * 2.4);
        g.addColorStop(0, `rgba(255,178,76,${.45 * light})`); g.addColorStop(1, 'rgba(255,178,76,0)');
        p.fillStyle = g; p.fillRect(x - r * 2.4, y - r * 2.4, r * 4.8, r * 4.8);
      }
      circle(x, y, r, light > .01 ? mixHex(C.lampOff, warm, light) : C.lampOff);
      if (light > .3) circle(x - r * .25, y - r * .25, r * .45, mixHex(warm, hot, light));
      // The lens's own highlight (top left), stronger on the dark glass than over the lit filament.
      if (depth > 0) circle(x - r * .38, y - r * .4, r * .26, `rgba(255,250,236,${(light > .3 ? .35 : .22) * Math.min(1, depth)})`);
    }
    function mixHex(a, b, k) {
      const pa = parseInt(a.slice(1), 16), pb = parseInt(b.slice(1), 16), t = clamp(k, 0, 1);
      const ch = s => Math.round(((pa >> s) & 255) + (((pb >> s) & 255) - ((pa >> s) & 255)) * t);
      return `rgb(${ch(16)},${ch(8)},${ch(0)})`;
    }
    // A tube readout: the glass, the unlit cathode stacks and the label are hardware; the lit cathodes move.
    const TUBE_PX = 28;
    function tubeBase(x, y, w, h, pattern, label) {
      bed(x, y, w, h, 4, C.tubeGlass, '#4b3a2c', 1.2);
      tubeDigits(x + w / 2, y + h / 2, pattern, 'off');
      write(label, x + w / 2, y + h + 12, 12, C.stampDim, 'stamp', 'center');
    }
    function tube(x, y, w, h, value) { tubeDigits(x + w / 2, y + h / 2, value, 'on'); }
    // The digits of a reading centred at (cx, cy). 'off': every digit position shows its whole stack of unlit
    // cathodes (0-9), separators their dots; 'on': the lit cathode, a thin bright core with a narrow glow around it.
    function tubeDigits(cx, cy, value, state) {
      const k = TUBE_PX / 30, cell = 21 * k, dotCell = 6 * k, chars = Array.from(value);
      const width = chars.reduce((n, ch) => n + (ch === '·' || ch === ':' ? dotCell : cell), 0);
      let left = cx - width / 2;
      p.save();
      p.lineJoin = 'round'; p.lineCap = 'round';
      for (const ch of chars) {
        const w = ch === '·' || ch === ':' ? dotCell : cell;
        if (ch === '·' || ch === ':') {
          const dots = ch === '·' ? [14] : [9, 20];
          for (const dy of dots) {
            const yy = cy - 14 * k + dy * k;
            if (state === 'off') circle(left + w / 2, yy, 1.1 * k, C.tubeOff);
            else { p.shadowColor = 'rgba(255,128,36,.85)'; p.shadowBlur = 5 * unit; circle(left + w / 2, yy, 1.3 * k, C.tube); p.shadowBlur = 0; }
          }
        } else if (state === 'off') {
          for (const d of '0123456789') cathode(d, left, cy, k, C.tubeOff, 1);
        } else if (CATHODES[ch]) {
          const sprite = litSprite(ch, k);
          if (sprite) p.drawImage(sprite, left - SPRITE_PAD, cy - 14 * k - SPRITE_PAD, cell + 2 * SPRITE_PAD, 28 * k + 2 * SPRITE_PAD);
          else litCathode(ch, left, cy, k);
        }
        left += w;
      }
      p.restore();
    }
    function litCathode(ch, left, cy, k) {
      p.shadowColor = 'rgba(255,128,36,.85)'; p.shadowBlur = 5 * unit;
      cathode(ch, left, cy, k, C.tube, 1.7);
      p.shadowBlur = 0;
      cathode(ch, left, cy, k, C.tubeHot, .7);
    }
    // One lit digit with its glow, drawn once per stage scale into a small canvas (design box: the cell plus a pad
    // for the glow), so a frame lays each lit digit with one copy instead of stroking glowing curves.
    const SPRITE_PAD = 6, sprites = new Map();
    function litSprite(ch, k) {
      const key = ch + '|' + unit.toFixed(4);
      if (sprites.has(key)) return sprites.get(key);
      const doc = p.canvas && p.canvas.ownerDocument;
      let made = null;
      if (doc && typeof doc.createElement === 'function') {
        const wd = 21 * k + 2 * SPRITE_PAD, ht = 28 * k + 2 * SPRITE_PAD;
        made = doc.createElement('canvas');
        made.width = Math.ceil(wd * unit); made.height = Math.ceil(ht * unit);
        const keep = p;
        p = made.getContext('2d');
        try {
          p.setTransform(unit, 0, 0, unit, 0, 0);
          p.lineJoin = 'round'; p.lineCap = 'round';
          litCathode(ch, SPRITE_PAD, SPRITE_PAD + 14 * k, k);
        } finally { p = keep; }
      }
      sprites.set(key, made);
      return made;
    }
    function cathode(ch, left, cy, k, color, width) {
      const glyph = CATHODES[ch];
      if (!glyph) return;
      const ox = left + (10.5 - glyph.mid) * k, oy = cy - 14 * k;
      p.beginPath();
      for (const [op, ...v] of glyph.path) {
        const q = v.map((n, i) => (i % 2 ? oy + n * k : ox + n * k));
        if (op === 'M') p.moveTo(q[0], q[1]); else if (op === 'L') p.lineTo(q[0], q[1]);
        else if (op === 'Q') p.quadraticCurveTo(q[0], q[1], q[2], q[3]); else p.bezierCurveTo(q[0], q[1], q[2], q[3], q[4], q[5]);
      }
      p.strokeStyle = color; p.lineWidth = width * k; p.stroke();
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
        if (which === 'base') rect(0, 0, DESIGN.width, DESIGN.height, '#171813');
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
        t.title, t.artist, assetGen, depth, corner].join('|');
      if (auditSink) return null;   // the audit sees every pass drawn
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
      depth = Number.isFinite(env.options.radarDepth) ? clamp(env.options.radarDepth, 0, 2) : 1;
      corner = env.options.radarCorner === 'round' ? 'round' : 'cut';
      unit = scale;
      auditView = {scale, ox, oy};
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
        panel(18, 16, 1404, 80, 'plateTop', ['slot', 'slot', 'slot', 'slot']);
        // The rating plate (the user's, SPEC-RADAR.md 铭牌): the two numbers are the telegraph codes of 蒋 and 鑫 from
        // the bundled table, read here, not copied.
        const T = root.XinScoreTelegraph, ohms = [T && T.code('蒋') || '----', T && T.code('鑫') || '----'];
        raisedPlate(37, 24, 314, 64, 4, '#2a2c25', '#55574b', .9);
        screw(46, 33); screw(342, 33); screw(46, 79); screw(342, 79);
        write('RATING', 57, 34, 9, C.stampFaint, 'plate', 'left');
        const line1 = 'RESISTANCE ' + ohms[0] + '–' + ohms[1] + ' OHMS', line2 = 'MFD. BY & THE BLESSING INSTR. CO.';
        // The first line is the heaviest type on the top bar: SemiBold, as large as fits the plate.
        const fit = (text, size, least, width) => { let k = size; for (; k > least; k -= .5) { font('plateBold', k); if (p.measureText(text).width <= width) break; } return k; };
        const size1 = fit(line1, 26, 14, 274), size2 = fit(line2, Math.min(size1 - 4, 20), 13, 274);
        write(line1, 57, 51, size1, C.stamp, 'plateBold', 'left', 276);
        write(line2, 57, 74, size2, C.stamp, 'plateBold', 'left', 276);
        out.plate = {line1, line2, size1, size2};
        const Lp = lampsApi();
        if (Lp) Lp.drawLamp(p, 370, 50, 18, 'green', 1); else lamp(370, 50, 8, 1, '#c8ffd0', C.green);
        write('PWR', 370, 74, 12, C.stampDim, 'stamp', 'center');
        // The small plate: owner cell scratched out, type, date code, inspection stamp.
        raisedPlate(390, 24, 114, 64, 4, '#2c2e27', '#55574b', .8);
        write('PROP. OF', 397, 34, 10, C.stampFaint, 'plate', 'left');
        p.save(); p.beginPath(); p.rect(440, 30, 58, 12); p.clip();
        for (let k = 0; k < 14; k++) { p.beginPath(); p.moveTo(438 + k * 5, 43); p.lineTo(446 + k * 5, 29); p.strokeStyle = 'rgba(200,196,176,.45)'; p.lineWidth = 1.1; p.stroke(); }
        p.restore();
        write('TYPE 6R-7C/88', 397, 51, 12, C.stampDim, 'plate', 'left');
        write('5947', 397, 74, 13, C.stampDim, 'plate', 'left');
        circle(481, 68, 13, null, '#8f8b78', 1.2);
        write('INSP.', 481, 64, 8, C.stampDim, 'plate', 'center');
        write('08', 481, 73, 10, C.stampDim, 'plate', 'center');
        SECTION_LAMPS.forEach((name, k) => bed(516 + k * 82, 40, 77, 36, 2, '#1a1712', '#4a3d2c'));
        tubeBase(1101, 28, 72, 42, '888', 'TEMPO');
        tubeBase(1183, 28, 106, 42, '888·8', 'BAR · BEAT');
        tubeBase(1299, 28, 104, 42, '88:88', 'TIME');
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
        const x = 516 + k * 82, y = 40, w = 77, h = 36, v = light[k], has = data.kinds.has(name);
        if (v > .01) {
          const g = p.createLinearGradient(x, y, x, y + h);
          g.addColorStop(0, mixHex('#3a2a18', '#ffcf7a', v)); g.addColorStop(1, mixHex('#2a1d10', '#ff9a30', v));
          p.fillStyle = g; p.fillRect(x + 2, y + 2, w - 4, h - 4);
        }
        write(name, x + w / 2, y + h / 2 + 1, 16, v > .4 ? '#2a1a08' : '#b9a27c', 'plate', 'center', w - 6);
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
      if (bars && bars.source === 'downbeats' && env.beats.length >= 2 && inBars(bars, now)) {
        const idx = Math.floor(barAt(env, bars, now));
        const beat = clamp(Math.floor(env.beatAt(now) - env.beatAt(bars.starts[Math.min(idx, bars.starts.length - 1)]) + 1e-6) + 1, 1, bars.perBar);
        barBeat = String(idx + 1).padStart(3, '0') + '·' + beat;
      }
      const time = Math.floor(now / 60).toString().padStart(2, '0') + ':' + Math.floor(now % 60).toString().padStart(2, '0');
      tube(1101, 28, 72, 42, tempo);
      tube(1183, 28, 106, 42, barBeat);
      tube(1299, 28, 104, 42, time);
      Object.assign(out, {tempo, barBeat, time});
    }

    // The hand-written tapes (batch 4): each strip's name on its own piece of tape stock, stuck at its own angle.
    const TAPE_ANGLES = [-.03, .015, -.035, .01, -.02, .02, -.025], STOCK = ['stickerA', 'stickerB', 'stickerC'];
    function tapeStock(k, x, y, w, h) {
      const image = MATERIALS[STOCK[k % STOCK.length]];
      if (!image) return false;
      // The stock is 400 x 120: take as much of its length as the tape needs at this height, stretch if longer.
      const srcW = Math.min(400, (w + 4) / (h + 4) * 120);
      p.drawImage(image, 0, 0, srcW, 120, x - 2, y - 2, w + 4, h + 4);
      return true;
    }
    function calTag(env, x, y) {
      const card = MATERIALS.tagCal, w = 46, h = 19, date = '';
      p.save(); p.translate(x, y); p.rotate(.07);
      cast(box(0, 0, w, h, 2), .5);
      if (card) p.drawImage(card, 0, 0, 300, 120, 0, 0, w, h); else rounded(0, 0, w, h, 2, '#e6dcc0');
      write(date ? date + ' ok' : 'ok', w / 2 + 4, h / 2 + 1, 12, '#2a3a6a', 'marker', 'center');
      p.restore();
      // The string from the card's hole to a pin in the panel.
      p.beginPath(); p.moveTo(x + 3, y + 3); p.lineTo(x - 1, y - 4); p.strokeStyle = 'rgba(30,26,20,.8)'; p.lineWidth = .8; p.stroke();
      circle(x - 1, y - 4, 1.4, '#8a8470');
    }
    const inkOf = k => {
      const h = Math.sin((k + 1) * 12.9898) * 43758.5453, f = h - Math.floor(h), g = (h * 7.13) - Math.floor(h * 7.13);
      return {alpha: .74 + .26 * f, dy: (g - .5) * 2.2};
    };
    // Jumper cables (batch 4, a switch: options.radarJumpers): two patch leads someone ran across panel seams, one
    // from under PAN to the teleprinter, one from the recorder's corner down to the teleprinter's spool.
    function jumpers() {
      const lead = (pts, plugs) => {
        const path = () => { p.beginPath(); p.moveTo(pts[0], pts[1]); p.bezierCurveTo(pts[2], pts[3], pts[4], pts[5], pts[6], pts[7]); };
        p.save(); p.lineCap = 'round';
        p.shadowColor = 'rgba(0,0,0,.55)'; p.shadowBlur = 4 * unit; p.shadowOffsetX = 1.5 * unit; p.shadowOffsetY = 2.5 * unit;
        path(); p.strokeStyle = '#26221d'; p.lineWidth = 4.2; p.stroke();
        p.shadowColor = 'transparent';
        path(); p.strokeStyle = 'rgba(160,150,128,.35)'; p.lineWidth = 1; p.stroke();
        p.restore();
        for (const [px, py] of plugs) { if (auditSink) auditShape('mark', auditBox(px - 5, py - 5, px + 5, py + 5), {what: 'jumper plug'}); cast(disk(px, py, 5), .5); circle(px, py, 5, '#8c8268', '#3a352a', 1); circle(px - 1.4, py - 1.6, 1.6, 'rgba(255,248,226,.5)'); }
      };
      lead([947, 726, 950, 750, 966, 742, 976, 760], [[947, 726], [976, 760]]);
      lead([1401, 726, 1428, 752, 1420, 786, 1411, 806], [[1401, 726], [1411, 806]]);
    }
    // A small neon bulb (the counters of the period): a glass bead with its electrode, dull orange-grey when dark, lit
    // orange with a small glow.
    function neonBulb(x, y, lit) {
      if (lit) {
        const g = p.createRadialGradient(x, y, 0, x, y, 7);
        g.addColorStop(0, 'rgba(255,110,40,.55)'); g.addColorStop(1, 'rgba(255,110,40,0)');
        p.fillStyle = g; p.fillRect(x - 7, y - 7, 14, 14);
      }
      circle(x, y, 2.7, lit ? '#ff7a3a' : '#3b2c22', '#17120d', .8);
      if (lit) circle(x, y, 1.1, '#ffd2a0');
      else circle(x - .8, y - .9, .8, 'rgba(255,240,220,.25)');
    }
    // A brass pointer, a small triangle pointing down (dir 1) or up (-1) at (x, y), with its shadow.
    function brassPointer(x, y, dir) {
      const tri = dx => { p.beginPath(); p.moveTo(x - 4 + dx, y - 3.5 * dir + dx); p.lineTo(x + 4 + dx, y - 3.5 * dir + dx); p.lineTo(x + dx, y + 3.5 * dir + dx); p.closePath(); };
      tri(.8); p.fillStyle = 'rgba(0,0,0,.4)'; p.fill();
      tri(0); p.fillStyle = '#b39a5c'; p.fill(); p.strokeStyle = '#4a3e22'; p.lineWidth = .8; p.stroke();
    }
    // A rename tape: the new name in marker on tape stock; x is its left end, or its right end when `right` is 1.
    function renameTape(name, x, y, angle, right) {
      font('marker', 12);
      const w = p.measureText(name).width + 10, left = right ? x - w : x;
      p.save(); p.translate(left, y); p.rotate(angle);
      if (auditSink) auditShape('tape', auditBox(0, 0, w, 14));
      cast(box(0, 0, w, 14, 1), .35);
      if (!tapeStock(name.length, 0, 0, w, 14)) rect(0, 0, w, 14, C.tape);
      write(name, 5, 7.5, 12, C.tapeInk, 'marker', 'left', 0, 'bold');
      p.restore();
    }
    // Crayon (batch 4): a short red wax stroke on the glass, rough-edged, at angle a on a meter's scale.
    function crayon(cx, cy, r, a) {
      p.save(); p.lineCap = 'round';
      [[0, 0, 2.6, .62], [.6, -.4, 1.6, .5], [-.5, .5, 1.2, .45]].forEach(([dx, dy, wd, al]) => {
        p.beginPath();
        p.moveTo(cx + Math.cos(a) * (r + 2) + dx, cy + Math.sin(a) * (r + 2) + dy);
        p.lineTo(cx + Math.cos(a) * (r + 9) + dx, cy + Math.sin(a) * (r + 9) + dy);
        p.strokeStyle = `rgba(178,38,28,${al})`; p.lineWidth = wd; p.stroke();
      });
      p.restore();
    }
    // Parts of the glass sheet over the seven dial faces (each face its own finger marks).
    const GLASS_CROPS = [[0, 0], [180, 30], [40, 190], [150, 300], [10, 360], [170, 120], [90, 60]];
    function strips(data, env, now, fall, muted, out) {
      const x = 34, w = 164, h = 74;
      // The meter geometry: the pivot sits inside the face and the needle ends on the scale; at rest it lies on the
      // first tick.
      const dial = y => ({cx: x + w / 2, cy: y + h - 3, r: 52, a0: -Math.PI / 2 - .9, a1: -Math.PI / 2 + .9});
      if (pass === 'base') {
        panel(18, 116, 296, 768, 'plateLeft', ['slot', 'slot', 'slot', 'brass']);
        write('CHANNEL STRIPS', 32, 146, 17, C.stamp, 'stamp', 'left', 200, 'bold', 'alphabetic');
        // The calibration tag (batch 4): a blank card hung by the title, the date the song was analysed when the
        // model has one (it has none so far), else only the inspector's hand-written ok.
        calTag(env, 176, 129);
        write('MOD. LVL-7', 300, 146, 12, C.stampFaint, 'stamp', 'right', 0, '', 'alphabetic');
        CATS.forEach((cat, i) => {
          const y = 163 + i * 85, {cx, cy, r, a0, a1} = dial(y);
          // The meter: a paper face filling its box, a red zone at the top of the scale.
          cast(box(x - 2, y - 2, w + 4, h + 4, 4), .9);
          rounded(x - 2, y - 2, w + 4, h + 4, 4, '#1c1d18');
          edge(box(x - 1.4, y - 1.4, w + 2.8, h + 2.8, 4), x - 2, y - 2, w + 4, h + 4, true, 1.2);
          p.save(); p.beginPath(); p.roundRect(x, y, w, h, 2); p.clip(); dialFace(i, x, y, w, h); p.restore();
          rounded(x + .5, y + .5, w - 1, h - 1, 2, null, C.dialEdge, 1);
          inset(box(x, y, w, h, 2), 1);
          p.save(); p.beginPath(); p.rect(x, y, w, h); p.clip();
          p.beginPath(); p.arc(cx, cy, r, a0, a1); p.strokeStyle = C.dialInk; p.lineWidth = 1.2; p.stroke();
          p.beginPath(); p.arc(cx, cy, r, a0 + (a1 - a0) * METER_AMBER, a0 + (a1 - a0) * METER_RED); p.strokeStyle = C.amberInk; p.lineWidth = 4; p.stroke();
          p.beginPath(); p.arc(cx, cy, r, a0 + (a1 - a0) * METER_RED, a1); p.strokeStyle = C.red; p.lineWidth = 4; p.stroke();
          for (let k = 0; k <= 10; k++) {
            const a = a0 + (a1 - a0) * k / 10, long = k % 5 === 0;
            p.beginPath(); p.moveTo(cx + Math.cos(a) * r, cy + Math.sin(a) * r);
            p.lineTo(cx + Math.cos(a) * (r - (long ? 10 : 6)), cy + Math.sin(a) * (r - (long ? 10 : 6)));
            p.strokeStyle = k >= 10 * METER_RED ? C.red : k >= 10 * METER_AMBER ? C.amberInk : C.dialInk; p.lineWidth = long ? 1.6 : 1; p.stroke();
          }
          p.restore();
          if (auditSink) {   // the scale band, which the name tape must not cover
            const pts = [];
            for (let k = 0; k <= 20; k++) { const a = a0 + (a1 - a0) * k / 20; for (const rr of [r + 1, r - 11]) pts.push([cx + Math.cos(a) * rr, cy + Math.sin(a) * rr]); }
            const xs = pts.map(q => q[0]), ys = pts.map(q => q[1]);
            auditShape('keep', auditBox(Math.min(...xs), Math.min(...ys), Math.max(...xs), Math.max(...ys)), {what: cat.strip + ' scale'});
          }
          write('CH' + (i + 1), 224, y + 54, 12, C.stampDim, 'stamp', 'center');
          const Lb = lampsApi();
          if (Lb) Lb.draw(p, 224, y + 25, LAMP_SIZE, undefined, {enabled: false, spacing: LAMP_GAP});
          if (auditSink) for (const k of [-1, 0, 1]) { const [lx, ly] = toDesign(224, y + 25 + k * LAMP_GAP); auditShape('ring', {cx: lx, cy: ly, r: LAMP_SIZE / 2}); }
          rounded(246, y + 12, 24, 50, 12, '#16170f', '#4c4e44', 1.5);
          // IN / OUT are engraved: one brightness, whatever the lever does (the lever's position says which).
          write('IN', 300, y + 20, 13, C.stamp, 'stamp', 'right');
          write('OUT', 300, y + 54, 13, C.stamp, 'stamp', 'right');
          inset(box(246, y + 12, 24, 50, 12), .9);
          edge(box(246.75, y + 12.75, 22.5, 48.5, 11.5), 246, y + 12, 24, 50, false, 1.2, .8);
        });
        write('CAUTION', 32, 799, 15, C.stamp, 'stamp', 'left', 160, 'bold', 'alphabetic');
        write('MOD. ANN-8', 300, 799, 12, C.stampFaint, 'stamp', 'right', 0, '', 'alphabetic');
        bed(32, 809, 268, 64, 5, '#16170f', null);
        return;
      }
      if (pass === 'over') {
        CATS.forEach((cat, i) => {
          const y = 163 + i * 85, {cx, cy} = dial(y);
          p.save(); p.beginPath(); p.rect(x, y, w, h); p.clip(); circle(cx, cy, 5, '#1b1a16'); p.restore();
          const mark = data.usage.find(u => u.channel === i);
          if (mark) {
            const {r, a0, a1} = dial(y);
            p.save(); p.beginPath(); p.rect(x, y, w, h); p.clip(); crayon(cx, cy, r, a0 + (a1 - a0) * mark.mean); p.restore();
            out.crayon = (out.crayon || []).concat({channel: cat.id, at: +mark.mean.toFixed(3)});
          }
          glass(x, y, w, h, GLASS_CROPS[i][0], GLASS_CROPS[i][1]);
          // The name on tape, stuck on the face's top-left corner.
          p.save(); p.translate(x + 4, y + 3); p.rotate(TAPE_ANGLES[i % TAPE_ANGLES.length]);
          font('marker', 12, 'bold');
          const tw = p.measureText(cat.strip).width + 10;
          if (!tapeStock(i, 0, 0, tw, 14)) { rect(0, 0, tw, 14, C.tape); p.fillStyle = 'rgba(0,0,0,.08)'; p.fillRect(0, 12, tw, 2); }
          write(cat.strip, 5, 7.5, 12, C.tapeInk, 'marker', 'left', 0, 'bold');
          if (auditSink) auditShape('tape', auditBox(0, 0, tw, 14));
          p.restore();
        });
        return;
      }
      out.meters = {};
      CATS.forEach((cat, i) => {
        const y = 163 + i * 85, has = data.present[i], off = !has || muted(i);
        const value = off ? 0 : needle(data.meter[i], now, fall, env.options.radarOvershoot !== false);
        out.meters[cat.id] = +value.toFixed(3);
        const {cx, cy, r, a0, a1} = dial(y);
        p.save(); p.beginPath(); p.rect(x, y, w, h); p.clip();
        const a = a0 + (a1 - a0) * value;
        p.beginPath(); p.moveTo(cx, cy); p.lineTo(cx + Math.cos(a) * (r - 1), cy + Math.sin(a) * (r - 1));
        p.strokeStyle = '#1b1a16'; p.lineWidth = 2; p.stroke();
        p.restore();
        // Lamp and lever.
        // Three lamps: lit by the channel's level against its own (off, muted or absent: dark, as the base drew them).
        const L = lampsApi();
        if (L) {   // without level data the three stay dark; on / off reads from the lever
          const g = off || !data.calibrated[i] ? {green: 0, yellow: 0, red: 0} : needleLamps(data.meter[i], now, fall, env.options.radarOvershoot !== false);
          out.lamps = out.lamps || {};
          out.lamps[cat.id] = {green: +g.green.toFixed(3), yellow: +g.yellow.toFixed(3), red: +g.red.toFixed(3)};
          [['red', -1], ['yellow', 0], ['green', 1]].forEach(([c, k]) => {
            if (g[c] > .005) L.drawLamp(p, 224, y + 25 + k * LAMP_GAP, LAMP_SIZE, c, g[c]);
          });
        } else lamp(224, y + 27, 9, off ? 0 : 1);
        const lx = 246, ly = y + 12, lw = 24, lh = 50, up = !off;
        const knob = up ? ly + 13 : ly + lh - 13;
        p.beginPath(); p.moveTo(lx + lw / 2, ly + lh / 2); p.lineTo(lx + lw / 2, knob);
        p.strokeStyle = '#9a9a8e'; p.lineWidth = 5; p.lineCap = 'round'; p.stroke(); p.lineCap = 'butt';
        if (depth > 0) circle(lx + lw / 2 + 1.3 * depth, knob + 2 * depth, 8.2, `rgba(0,0,0,${Math.min(.6, .35 * depth)})`);
        circle(lx + lw / 2, knob, 8, '#d6d4c8', '#3a3a33', 1);
        if (depth > 0) circle(lx + lw / 2 - 2.6, knob - 2.8, 2.8, `rgba(255,255,255,${.55 * Math.min(1, depth)})`);

        out.levers.push({channel: cat.id, x: lx - 4, y: ly - 4, width: lw + 8, height: lh + 8, up, clickable: has && cat.id !== 'other'});
      });
      // Caution lamps.
      out.caution = {};
      CAUTION.forEach((name, k) => {
        const x = 36 + (k % 4) * 66, y = 813 + Math.floor(k / 4) * 30, w = 62, h = 26;
        const v = name === 'SPARE' ? 0 : glow(data.caution[k], now);
        out.caution[name] = +v.toFixed(3);
        rounded(x, y, w, h, 2, mixHex('#3a2a1a', '#ffb24c', v), '#14120d', 1);
        write(name, x + w / 2, y + h / 2 + 1, 15, v > .45 ? '#2a1a08' : name === 'SPARE' ? '#7a6a56' : '#d2b48a', 'plate', 'center', w - 4);
      });
    }

    function disc(data, env, bars, now, echo, muted, out) {
      const cx = 661, cy = 425, bezel = 300, screen = 270;
      const outer = screen - 14, inner = 42, band = (outer - inner) / RINGS;
      if (pass === 'base') {
        panel(334, 116, 656, 618, 'plateRadar', ['cross', 'cross', 'brass', 'cross']);
        // Bezel with a tick per beat (sixteen to a turn of four 4/4 bars) and finer ones between.
        cast(disk(cx, cy, bezel), 2.4);
        circle(cx, cy, bezel, '#1d1e19', '#4a4c42', 2);
        edge(disk(cx, cy, bezel - 1.5), cx - bezel, cy - bezel, 2 * bezel, 2 * bezel, true, 3, 1.1);
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
        edge(disk(cx, cy, screen + 2), cx - screen, cy - screen, 2 * screen, 2 * screen, false, 2.5, 1);
        p.save(); circle(cx, cy, screen - 1, null); p.clip();
        // Grid: crosshair and the six rings, each a band from its inner to its outer edge.
        p.strokeStyle = C.phosFaint; p.lineWidth = 1;
        p.beginPath(); p.moveTo(cx - screen, cy); p.lineTo(cx + screen, cy); p.moveTo(cx, cy - screen); p.lineTo(cx, cy + screen); p.stroke();
        for (let r = 0; r <= RINGS; r++) { circle(cx, cy, inner + r * band, null, r === RINGS ? C.phosDim : C.phosFaint, 1); }
        p.restore();
        // Stamped name and the one sticker.
        // A dial that was taken out of this corner: its hole closed by a round cover plate on two screws; the
        // operators' sticker went on the plate. The PPI legend is stamped under it.
        const pcx = 932, pcy = 172, pr = 48;
        cast(disk(pcx, pcy, pr), 1.3);
        if (MATERIALS.coverPlate) p.drawImage(MATERIALS.coverPlate, pcx - pr * 512 / 500, pcy - pr * 512 / 500, pr * 2 * 512 / 500, pr * 2 * 512 / 500);
        else circle(pcx, pcy, pr, '#3a3e34');
        p.beginPath(); p.arc(pcx, pcy, pr, 0, Math.PI * 2); p.strokeStyle = '#23251f'; p.lineWidth = 1.2; p.stroke();
        edge(disk(pcx, pcy, pr - .8), pcx - pr, pcy - pr, 2 * pr, 2 * pr, true, 1.6);
        if (auditSink) auditShape('ring', {cx: pcx, cy: pcy, r: pr, plate: true});
        screw(pcx, pcy - pr + 8, 'slot'); screw(pcx, pcy + pr - 8, 'slot');
        write('PPI', 979, 229, 14, C.stamp, 'stamp', 'right', 0, 'bold');
        write('1 REV', 979, 243, 14, C.stamp, 'stamp', 'right', 0, 'bold');
        write(!bars ? FREE_TURN + ' SEC' : bars.source === 'downbeats' ? '4 BARS' : '16 BEATS', 979, 257, 14, C.stamp, 'stamp', 'right', 0, 'bold');
        font('marker', 12);
        const stickerW = Math.ceil(Math.max(p.measureText('OUTER = VOX').width, p.measureText('INNER = BASS').width)) + 12;
        p.save(); p.translate(pcx, pcy); p.rotate(-.06); p.translate(-stickerW / 2, -20);
        if (auditSink) auditShape('tape', auditBox(0, 0, stickerW, 40));
        cast(box(0, 0, stickerW, 40, 1), .4);
        if (!tapeStock(2, 0, 0, stickerW, 40)) { rect(0, 0, stickerW, 40, '#f1ead2'); p.fillStyle = 'rgba(0,0,0,.08)'; p.fillRect(0, 38, stickerW, 2); }
        write('OUTER = VOX', 6, 10, 12, C.tapeInk, 'marker', 'left', 0, 'bold');
        write('INNER = BASS', 6, 30, 12, C.tapeInk, 'marker', 'left', 0, 'bold');
        p.restore();
      } else if (pass === 'over') {
        glass(cx - screen, cy - screen, 2 * screen, 2 * screen, 0, 0, true, 512 / (2 * screen));
        inset(disk(cx, cy, screen - 1.5), 2.6);
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
        const bloom = env.options.radarBloom !== false;
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
            // Phosphor bloom (batch 4): the trace spreads a little as it fades.
            const spread = bloom ? 1 + .6 * age : 1;
            if (u1 - u0 < .004) {
              circle(cx + Math.cos(A0) * r, cy + Math.sin(A0) * r, 2.6 * spread, `rgba(130,242,166,${alpha})`);
            } else {
              p.beginPath(); p.arc(cx, cy, r, A0, Math.max(A1, A0 + .01)); p.lineWidth = 3 * spread; p.lineCap = 'round'; p.stroke(); p.lineCap = 'butt';
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
          write(cat.ring, cx - 12, cy - r, 15, '#79d79c', 'plate', 'right');   // printed on the graticule overlay: one colour
        });
        p.restore();
        // Bar numbers of the turn at the quarters: only on the song's own bar lines.
        if (bars && bars.source === 'downbeats') {
          const first = Math.floor(turn) * 4;
          out.barNumbers = [];
          [[0, -1], [1, 0], [2, 1], [3, 0]].forEach(([q]) => {
            // Only bars the song has (none before the first bar line, none after the last).
            if (first + q < 0 || first + q >= bars.starts.length) return;
            out.barNumbers.push(first + q + 1);
            const a = -Math.PI / 2 + q / 4 * Math.PI * 2 + .14, r = screen - 28, bx = cx + Math.cos(a) * r, by = cy + Math.sin(a) * r;
            font('plate', 15);
            const bw = p.measureText(String(first + q + 1)).width + 6;
            rect(bx - bw / 2, by - 8, bw, 16, 'rgba(6,18,12,.85)');
            write(String(first + q + 1), bx, by, 15, '#8ef5b0', 'plate', 'center');
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
      const cx = 396, cy = 178, r = 45;
      if (pass === 'base') {
        cast(disk(cx, cy, r + 6), 1.2);
        circle(cx, cy, r + 6, '#1b1c17', '#4a4c42', 2);
        edge(disk(cx, cy, r + 5), cx - r - 6, cy - r - 6, 2 * r + 12, 2 * r + 12, true, 2);
        edge(disk(cx, cy, r + 1), cx - r, cy - r, 2 * r, 2 * r, false, 1.5, .8);
        circle(cx, cy, r, C.screen, C.screenRim, 2);
        p.save(); circle(cx, cy, r - 1, null); p.clip();
        p.strokeStyle = C.phosFaint; p.lineWidth = 1;
        for (let k = -2; k <= 2; k++) { p.beginPath(); p.moveTo(cx - r, cy + k * 18); p.lineTo(cx + r, cy + k * 18); p.stroke(); }
        for (let k = -2; k <= 2; k++) { p.beginPath(); p.moveTo(cx + k * 22, cy - r); p.lineTo(cx + k * 22, cy + r); p.stroke(); }
        p.restore();
        write('VOX PITCH', 344, 244, 13, C.stamp, 'stamp', 'left', 0, 'bold');
        return;
      }
      if (pass === 'over') { glass(cx - r, cy - r, 2 * r, 2 * r, 300, 40, true); inset(disk(cx, cy, r - .5), 1.2); return; }
      p.save(); circle(cx, cy, r - 1, null); p.clip();
      // One beam, never broken (radar.5 feedback): the last `span` seconds left to right, now at the right edge; where
      // the voice sings the beam rides its pitch, where it does not the beam lies on the baseline. The phosphor keeps
      // the trace and lets it fade with age (bright at now, dim at the left), so when a phrase ends its curve dims
      // away to the left while the baseline brightens in from the right; nothing vanishes from one frame to the next.
      const span = 4, left = cx - r + 4, width = 2 * r - 8, range = data.vocalRange, glowFor = 1.3;
      const y = m => range ? cy + 34 - (m - range[0]) / Math.max(1, range[1] - range[0]) * 68 : cy;
      const vocalNotes = !data.contour && range ? data.notes.filter(n => n.cat === 0 && n.end >= now - span && n.start <= now) : [];
      const pitchAt = t => {
        if (t < 0 || !range) return null;
        if (data.contour) { const m = data.contour.midi[Math.round(t / data.contour.hop)]; return Number.isFinite(m) ? m : null; }
        const n = vocalNotes.find(v => v.start <= t && v.end >= t);
        return n ? n.pitch : null;
      };
      // The beam in pieces of ~12 px, each stroked at the brightness of its age (a few strokes a frame, not one per
      // point, so the glow stays cheap).
      const step = 1.5, piece = 8, samples = [];
      for (let x = 0; x <= width + 1e-9; x += step) {
        const t = now - span + x / width * span, m = pitchAt(t);
        samples.push({x, y: m === null ? cy : y(m), sung: m !== null});
      }
      const sung = samples.filter(q => q.sung).length;
      for (let i0 = 0; i0 < samples.length - 1; i0 += piece) {
        const part = samples.slice(i0, i0 + piece + 1);
        p.beginPath();
        part.forEach((q, k) => k ? p.lineTo(left + q.x, q.y) : p.moveTo(left + q.x, q.y));
        const mid = part[Math.floor(part.length / 2)].x, age = span * (1 - mid / width), alpha = Math.max(.08, Math.exp(-age / glowFor));
        p.strokeStyle = `rgba(130,242,166,${alpha.toFixed(3)})`; p.lineWidth = 2;
        p.shadowColor = `rgba(130,242,166,${(.7 * alpha).toFixed(3)})`; p.shadowBlur = 4 * unit; p.stroke();
      }
      p.shadowBlur = 0;
      p.restore();
      out.vox = sung > 0;
      out.voxShare = +(sung / samples.length).toFixed(3);   // the share of the beam on a sung pitch
    }
    function registerDial(data, now, out) {
      const cx = 396, cy = 672, r = 44;
      const a0 = Math.PI * .75, a1 = Math.PI * 2.25, at = m => a0 + clamp((m - 36) / 48, 0, 1) * (a1 - a0);
      if (pass === 'base') {
        // Salvaged from an aircraft (batch 4): its own engraving still on the plate, in its maker's narrow letters;
        // the station's name on a piece of tape over the lower part of it (more than half of the old name shows).
        write('ALTIMETER·FT', 344, 598, 12, C.stampDim, 'plate', 'left');
        renameTape('REGISTER', 342, 600, .045, 0);
        cast(disk(cx, cy, r + 6), 1.2);
        circle(cx, cy, r + 6, '#1b1c17', '#4a4c42', 2);
        edge(disk(cx, cy, r + 5), cx - r - 6, cy - r - 6, 2 * r + 12, 2 * r + 12, true, 2);
        edge(disk(cx, cy, r + 1), cx - r, cy - r, 2 * r, 2 * r, false, 1.5, .8);
        roundFace(cx, cy, r, 770, 790);
        circle(cx, cy, r, null, C.dialEdge, 1);
        // C2..C6 over 240 degrees.
        for (let m = 36; m <= 84; m += 3) {
          const a = at(m), long = m % 12 === 0;
          p.beginPath(); p.moveTo(cx + Math.cos(a) * (r - 3), cy + Math.sin(a) * (r - 3)); p.lineTo(cx + Math.cos(a) * (r - (long ? 11 : 6)), cy + Math.sin(a) * (r - (long ? 11 : 6)));
          p.strokeStyle = C.dialInk; p.lineWidth = long ? 1.6 : 1; p.stroke();
          void long;
        }
        return;
      }
      if (pass === 'over') {
        for (let m = 36; m <= 84; m += 12) {
          const a = at(m), lx = cx + Math.cos(a) * (r - 21), ly = cy + Math.sin(a) * (r - 21);
          font('plate', 15); p.textAlign = 'center'; p.textBaseline = 'middle';
          p.strokeStyle = C.dial; p.lineWidth = 3; p.lineJoin = 'round'; p.strokeText('C' + (m / 12 - 1), lx, ly); p.lineJoin = 'miter';
          write('C' + (m / 12 - 1), lx, ly, 15, C.dialInk, 'plate', 'center');
        }
        circle(cx, cy, 4, '#1b1a16'); glass(cx - r, cy - r, 2 * r, 2 * r, 120, 380, true); inset(disk(cx, cy, r), 1); return;
      }
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
      const cx = 928, cy = 672, r = 44;
      if (pass === 'base') {
        write('ATTITUDE IND.', 980, 598, 12, C.stampDim, 'plate', 'right');
        renameTape('PAN L / R', 982, 600, -.04, 1);
        cast(disk(cx, cy, r + 6), 1.2);
        circle(cx, cy, r + 6, '#1b1c17', '#4a4c42', 2);
        edge(disk(cx, cy, r + 5), cx - r - 6, cy - r - 6, 2 * r + 12, 2 * r + 12, true, 2);
        edge(disk(cx, cy, r + 1), cx - r, cy - r, 2 * r, 2 * r, false, 1.5, .8);
        return;
      }
      if (pass === 'over') { glass(cx - r, cy - r, 2 * r, 2 * r, 380, 200, true); inset(disk(cx, cy, r), 1.2); return; }
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
      write('L', cx - r + 13, cy - 15, 12, C.stamp, 'stamp', 'center', 0, 'bold');
      write('R', cx + r - 13, cy - 15, 12, C.stamp, 'stamp', 'center', 0, 'bold');
      circle(cx, cy, r, null, '#1b1c17', 2);
      out.pan = data.pan ? +db.toFixed(2) : null;
    }

    function harmony(data, now, out) {
      const cx = 1130, cy = 285, R = 103;
      if (pass === 'base') {
        panel(1010, 116, 412, 618, 'plateRight', ['cross', 'cross', 'cross', 'cross']);
        write('HARMONY · SIGNAL', 1028, 146, 17, C.stamp, 'stamp', 'left', 260, 'bold', 'alphabetic');
        write('MOD. HS-4', 1404, 146, 12, C.stampFaint, 'stamp', 'right', 0, '', 'alphabetic');
        write('CHORD · FIFTHS', 1028, 174, 12, C.stampDim, 'stamp', 'left', 0, 'bold', 'alphabetic');
        write('QUALITY', 1246, 174, 12, C.stampDim, 'stamp', 'left', 0, 'bold', 'alphabetic');
        cast(disk(cx, cy, R), 1.4);
        circle(cx, cy, R, '#1d1e19', '#4a4c42', 2);
        edge(disk(cx, cy, R - 1), cx - R, cy - R, 2 * R, 2 * R, true, 2);
        bed(cx - 40, cy - 28, 80, 56, 3, '#151612', '#5a5c50');
        bed(1246, 183, 158, 204, 5, '#24261f', '#4a4c42');
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
        write(name, x, y + 1, 15, v > .45 ? '#2a1a08' : '#cbc4ae', 'plate', 'center');
      });
      p.beginPath(); p.moveTo(cx - 38, cy); p.lineTo(cx + 38, cy); p.strokeStyle = '#000'; p.lineWidth = 1; p.stroke();
      const name = current ? current.label : '--';
      let cardSize = 27;
      for (; cardSize > 14; cardSize -= 1) { font('plate', cardSize); if (p.measureText(name).width <= 72) break; }
      const cardShown = write(name, cx, cy + 1, cardSize, '#ece6d0', 'plate', 'center', 72);
      // Quality lamps, two columns of five.
      const lit = current ? current.parts.lamps : new Set();
      QUALITY.forEach((q, k) => {
        const x = 1266 + (k % 2) * 70, y = 205 + Math.floor(k / 2) * 39;
        lamp(x, y, 6, lit.has(q) ? 1 : 0);
        write(q, x + 14, y + 1, 15, C.stampDim, 'stamp', 'left');   // engraved: the lamp beside it lights, not the name
      });
      out.chord = {name: current ? current.label : null, shown: cardShown, size: cardSize, quality: [...lit], fifths: light.map(v => +v.toFixed(3))};
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
        write(steps ? 'DRUMS · THIS BAR' : roll ? 'DRUMS · LAST ' + ROLL_BEATS + ' BEATS' : 'DRUMS', 1028, 411, 12, C.stampDim, 'stamp', 'left', 0, 'bold', 'alphabetic');
        const barred = bars && bars.source === 'downbeats' && bars.perBar > 0;
        write(steps ? steps + ' STEPS' : roll ? (barred ? bars.perBar + ' BEATS / BAR' : 'NO BAR LINES · BEATS ONLY') : 'NO BEATS · LAMPS ONLY', 1404, 411, 12, C.stampFaint, 'stamp', 'right', 0, '', 'alphabetic');
        bed(1028, 420, 376, 122, 5, '#1f201b', '#4a4c42');
        DRUM_ROWS.forEach((row, r) => write(row.label, 1038, 432 + r * 21 + 7, 15, C.stamp, 'stamp', 'left'));
        if (roll) DRUM_ROWS.forEach((row, r) => rounded(1112, 432 + r * 21, 286, 15, 1.5, '#24251f'));
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
      // The cells share what is left of the row (1112 .. 1394, 10 px inside the bed) after the 2 px gaps between beats.
      const gaps = steps ? (steps / 4 - 1) * 2 : 0, cellPitch = steps ? (282 + 3 - gaps) / steps : 0, cellSize = Math.max(8, cellPitch - 3);
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
        // "Now" is an index line on the bed, with a brass pointer above and below it (no bright screen line).
        p.beginPath(); p.moveTo(left + width, 427); p.lineTo(left + width, 537); p.strokeStyle = '#6b6350'; p.lineWidth = 1; p.stroke();
        brassPointer(left + width, 422, 1); brassPointer(left + width, 540, -1);
      }
      function rollRow(r, y) {
        const shown = [];
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
      // The current step's indicator (radar.5 feedback; options.radarStep): a row of small neon bulbs over the columns,
      // the one over the current step lit, as a counter of the period would show it; or a brass cursor on the bed's top
      // edge over the current column; or the current column backlit (in the cells above).
      const stepLook = ['neon', 'cursor', 'backlight'].includes(env.options.radarStep) ? env.options.radarStep : 'neon';
      if (steps) {
        for (let s = 0; s < steps; s++) {
          const cx = 1112 + s * cellPitch + Math.floor(s / 4) * 2 + cellSize / 2, lit = s === step;
          if (stepLook === 'neon') neonBulb(cx, 425.5, lit);
          else if (stepLook === 'cursor' && lit) brassPointer(cx, 421.5, 1);
        }
      }
      out.stepLook = stepLook;
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
          // The current column: its hits brightest; with 'backlight' its empty cells glow faintly from behind too.
          const now = s === step, backlit = now && stepLook === 'backlight';
          const fill = state === 2 ? (now ? '#ffd27a' : '#c8742f') : state === 1 ? '#4a3524' : backlit ? '#4a4334' : '#2c2d26';
          rounded(x, y, cellSize, 15, 1.5, fill);
        }
      });
      out.drums = {mode: steps ? 'bar' : roll ? 'roll' : 'lamps', steps, step, bar: barStart, hits: cells.map(row => row.join('')),
        right: steps ? +(1112 + (steps - 1) * cellPitch + (steps / 4 - 1) * 2 + cellSize).toFixed(2) : null,
        ...(roll ? {nowBeat: +nowBeat.toFixed(3), rolled} : {})};
    }

    function recorder(data, now, out) {
      const x = 1066, y = 576, w = 338, h = 140, lo = -42, hi = 0;
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
        write('RECORDER · LOUDNESS', 1028, 566, 12, C.stampDim, 'stamp', 'left', 0, 'bold', 'alphabetic');
        write('WHOLE SONG · 1 SHEET', 1404, 566, 12, C.stampFaint, 'stamp', 'right', 0, '', 'alphabetic');
        [0, -12, -24, -36].forEach(db => write(String(db), 1057, y + 6 + (hi - db) / (hi - lo) * (h - 12), 15, C.stampDim, 'plate', 'right'));
        raisedPlate(x - 3, y - 3, w + 6, h + 6, 4, '#1c1d18', '#3d3e36', .6);
        rect(x, y, w, h, C.paper);
        recordPaper('recorder', x, y, w, h);
        if (auditSink) auditShape('frame', auditBox(x, y, x + w, y + h));
        p.strokeStyle = '#8d8670'; p.lineWidth = 1; p.strokeRect(x + .5, y + .5, w - 1, h - 1);
        inset(box(x, y, w, h, 0), .7);
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
          if (sx - lastLabel < 30) continue;
          font('mono', 15);
          const lx = Math.min(sx + 3, x + w - 5 - p.measureText(SECTION_MARK[s.kind]).width);
          if (lx - lastLabel < 44) continue;
          write(SECTION_MARK[s.kind], lx, y + 18, 15, C.paperInk, 'mono'); lastLabel = lx;
        }
        // The faint whole-song trace is on the sheet from the start.
        if (data.energy) stroke(x, x + w, C.paperFaint, 1.2);
        out.recorderBox = {x, y, width: w, height: h, duration: dur};
        return;
      }
      if (pass !== 'live') return;
      const pen = xAt(now);
      if (data.energy) stroke(x, pen, C.paperInk, 1.6);
      p.beginPath(); p.moveTo(pen, y + 26); p.lineTo(pen, y + h - 9); p.strokeStyle = C.pen; p.lineWidth = 2; p.stroke();
      if (auditSink) auditShape('mark', auditBox(pen - 1, y + 26, pen + 1, y + h - 9), {what: 'recorder pen'});
      out.recorder = {pen: +((pen - x - 4) / (w - 8)).toFixed(4), trace: Boolean(data.energy)};
    }

    function keys(data, now, out) {
      if (pass === 'base') {
        panel(334, 754, 596, 130, 'plateKeys', ['cross', 'cross', 'cross', 'cross']);
        write('KEYS', 354, 782, 15, C.stamp, 'stamp', 'left', 0, 'bold', 'alphabetic');
        write('88 · ALL CHANNELS SOUNDING NOW', 910, 782, 12, C.stampFaint, 'stamp', 'right', 0, '', 'alphabetic');
      }
      const x = 354, y = 795, w = 556, h = 63;
      const whites = [];
      for (let m = 21; m <= 108; m++) if (![1, 3, 6, 8, 10].includes(m % 12)) whites.push(m);
      const ww = (w - 8) / whites.length;
      if (pass === 'base') {
        bed(x, y, w, h, 5, '#16170f', '#4a4c42');
        for (let o = 1; o <= 8; o++) {
          const k = whites.indexOf(12 * (o + 1));
          if (k >= 0) write('C' + o, x + 4 + k * ww + ww / 2, y + h + 12, 15, C.stampDim, 'plate', 'center');
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
      write('TELEPRINTER', 970, 782, 15, C.stamp, 'stamp', 'left', 0, 'bold', 'alphabetic');
      font('stamp', 15);
      const left = 970 + p.measureText('TELEPRINTER').width + 12;
      const han = /\p{Script=Han}/u.test(song);
      out.teleTitle = write(song || '— NO SIGNAL —', left, 782, 15, C.stamp, han ? 'hanzi' : 'mono', 'left', 1290 - left, 'bold', 'alphabetic');
      write(key[0], 1404, 770, 12, C.stampFaint, 'stamp', 'right');
      write(key[1], 1404, 785, 12, C.stampFaint, 'stamp', 'right');
    }
    function teleprinter(env, now, out) {
      const x = 970, y = 796, w = 316, h = 74, head = x + w - 6;
      const tape = tapeOf(env);
      if (pass === 'base') {
        panel(950, 754, 472, 130, 'plateTele', ['slot', 'slot', 'slot', 'slot']);
        // The key under the paper says what the tape holds: lyrics, or the track sheet when there are none.
        teleTitle(env, tape ? ['UPPER = CODE', 'LOWER = CLEAR'] : ['UPPER = FIELD', 'LOWER = VALUE'], out);
        raisedPlate(x - 3, y - 3, w + 3, h + 6, 4, '#1c1d18', '#3d3e36', .6);
        rect(x, y, w, h, C.paper);
        recordPaper('tape', x, y, w, h);
        if (auditSink) auditShape('frame', auditBox(x, y, x + w, y + h));
        p.strokeStyle = '#8d8670'; p.lineWidth = 1; p.strokeRect(x + .5, y + .5, w - 1, h - 1);
        inset(box(x, y, w, h, 0), .7);
        raisedPlate(x + w, y - 2, 30, h + 4, 2, '#1f201b', '#4a4c42', .7);
        cast(disk(1378, 832, 23), 1.2);
        circle(1378, 832, 22, '#1b1c17', '#8d8a7c', 3); circle(1378, 832, 10, null, '#8d8a7c', 3);
        edge(disk(1378, 832, 23), 1355, 809, 46, 46, true, 1.5);
        return;
      }
      if (pass === 'over') {
        if (env.options.radarJumpers === true) jumpers();
        const shade = p.createLinearGradient(x + 1, 0, x + 9, 0);
        shade.addColorStop(0, 'rgba(30,26,18,.30)'); shade.addColorStop(1, 'rgba(30,26,18,0)');
        p.fillStyle = shade; p.fillRect(x + 1, y + 1, 8, h - 2);
        return;
      }
      if (pass !== 'live') return;
      if (!tape) { trackSheet(env, now, out, {x, y, w, h, head}); return; }
      const telegraph = root.XinScoreTelegraph;
      let printing = false;
      const glyphs = [];
      // Characters printed by now, the newest at the head.
      const cell = 40;
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
      auditClip = {x: x + 1, y: y + 1, w: w - 2, h: h - 2};
      for (let k = printed - 1, slot = 0; k >= 0; k--, slot++) {
        const item = tape.cells[k], cx = head - cell / 2 - (slot - 1 + glide) * cell - cell;
        if (cx < x - cell) break;
        if (item.dot) { circle(cx, y + h / 2 + 8, 2.5, C.paperInk); continue; }
        if (item.blank) { glyphs.push({ch: ' ', code: null, clear: true}); continue; }
        const code = item.han ? (telegraph && telegraph.code(item.ch)) || '----' : '';
        // Uneven ink (batch 4): each character struck a little lighter or heavier and a little high or low, fixed
        // by its place on the tape (a hash of its index), never by chance.
        const ink = env.options.radarInk === false ? null : inkOf(k);
        if (ink) { p.save(); p.globalAlpha = ink.alpha; }
        const dy = ink ? ink.dy : 0;
        if (code) write(code, cx, y + 17 + dy, 15, C.paperInk, 'mono', 'center');
        const clear = !item.han || now >= item.time + item.half;
        if (clear) write(item.ch, cx, y + 49 + dy, item.han ? 28 : 24, C.paperInk, item.han ? 'hanzi' : 'mono', 'center', 0, 'bold');
        if (ink) p.restore();
        glyphs.push({ch: item.ch, code: code || null, clear});
      }
      auditClip = null;
      paperFade('tape', x, y, h);
      p.restore();
      lamp(x + w + 15, y + 12, 5, printing ? 1 : 0);
      out.teleprinter = {mode: 'lyrics', printing, newest: glyphs.slice(0, 6), lines: tape.lines, lead: tape.lead};
    }
    // The track sheet: the fields of model.track that are there, in this order. Values as the tags give them.
    const SHEET = Object.freeze([
      ['TITLE', t => t.title], ['ARTIST', t => clean(t.artist)], ['ALBUM', t => clean(t.album)], ['ALBUM ARTIST', t => clean(t.albumArtist)],
      ['RELEASED', t => t.date || t.year], ['TRACK', t => t.number ? (t.trackTotal ? t.number + '/' + t.trackTotal : String(t.number)) : ''],
      ['DISC', t => t.disc ? (t.discTotal ? t.disc + '/' + t.discTotal : String(t.disc)) : ''], ['GENRE', t => t.genre],
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
        font('mono', 13);
        const nameW = p.measureText(item.name).width;
        pieces.push({item, value, width: Math.max(valueW, count === item.chars.length ? nameW : 0) + 4});
        if (count === item.chars.length && now >= item.end + .2) pieces.push({dot: true, width: 18});
        shown.push({field: item.name, value, done: count === item.chars.length});
      }
      p.save(); p.beginPath(); p.rect(x + 1, y + 1, w - 2, h - 2); p.clip();
      auditClip = {x: x + 1, y: y + 1, w: w - 2, h: h - 2};
      let right = head - 4;
      for (let k = pieces.length - 1; k >= 0 && right > x - 400; k--) {
        const piece = pieces[k], left = right - piece.width;
        if (piece.dot) circle(left + piece.width / 2, y + h / 2 + 8, 2.5, C.paperInk);
        else {
          write(piece.item.name, left, y + 17, 13, '#5f5a4b', 'mono', 'left');
          write(piece.value, left, y + 49, piece.item.han ? 24 : 20, C.paperInk, piece.item.han ? 'hanzi' : 'mono', 'left', 0, 'bold');
        }
        right = left - 6;
      }
      auditClip = null;
      paperFade('tape', x, y, h);
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
          if (ch === ' ') { cells.push({ch, blank: true, han: false, time: from + k * step, sung: start + k * sungStep, half, lineEnd: until, next: from + (k + 1) * step}); return; }
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
      const r = Math.hypot(dx - 661, dy - 425);
      if (r <= 270) {
        const bars = barGrid(env), turn = turnAt(env, bars, env.now);
        let phase = (Math.atan2(dy - 425, dx - 661) + Math.PI / 2) / (Math.PI * 2);
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
  root.XinScoreRadar = Object.freeze({create, ready, materials, MATERIAL_FILES, LEADS, audit, audited: () => auditSink, chordParts, sectionKind, CATS, QUALITY, SECTION_LAMPS, CAUTION, RULES, DESIGN, FONTS});
  if (typeof module === 'object' && module.exports) module.exports = root.XinScoreRadar;
})(typeof globalThis !== 'undefined' ? globalThis : this);
