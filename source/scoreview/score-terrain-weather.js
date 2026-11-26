// Window weather follows absolute song time. The song analysis is built once on demand.
// Three orthogonal mechanisms drive the rain timeline:
//   1. Unified rain potential P(t): loudness plateau + dual-envelope momentum + stem texture.
//   2. Three-state hysteresis + +/-2 s section boundary snap: overcast <-> drizzle <-> rain/storm.
//   3. Harmonic tension H(t): lightweight chord valence/dissonance & change-rate atmosphere modulation.
(function (root) {
  'use strict';
  const cache = new WeakMap();
  const curveReaders = new WeakMap();
  const moodTimelines = new WeakMap();
  const RAIN_START = .26, MODERATE = .52, HEAVY = .70, STORM = .90, LIGHTNING_SLOW = .92;
  const LEAD = 1.5, APPROACH = 12, WET_STEP = .1, MIN_SPAN = 6, SNAP_WINDOW = 2;
  const RISE_SECONDS = {surge: 6, entry: 8, crescendo: 12, gradual: 12};
  const clamp = value => Math.max(0, Math.min(1, value));
  const smooth = value => { const u = clamp(value); return u * u * (3 - 2 * u); };
  const finite = Number.isFinite;
  const validSeries = row => Array.isArray(row) && row.length > 0 && row.every(finite);
  const zero = () => 0;
  const half = () => .5;
  const empty = Object.freeze([]);
  // The three surfaces retain a storm for different lengths of song time.
  // Attack and release are seconds. Wind is integrated for rotating scenery.
  const surfaceResponse = {
    rain: {attack: 3, release: 16, windFromStorm: .62, windScale: .78},
    snow: {attack: 13, release: 92, windFromStorm: .75, windScale: .92},
    sandstorm: {attack: 7, release: 40, windFromStorm: .83, windScale: 1},
  };
  const NO_FLASH = Object.freeze({intensity: 0, primary: 0, xNorm: .5, index: -1});
  const LIGHTNING_COOLDOWN = 22;
  const LIGHTNING_MIN_STORM = .72;
  const LIGHTNING_MIN_TENSION = .45;
  const clear = Object.freeze({
    mode: 'clear', rain: false, snow: false, sand: false, state: 'clear', level: 0, potential: 0, tension: .5, farRain: 0,
    intensity: 0, humidity: 0, surface: 0, wind: 0, windTravel: 0, events: empty, distantBands: empty,
    rainAt: zero, wetAt: zero, glassDriveAt: zero, potentialAt: zero, tensionAt: half,
    stormDrive: 0, stormDriveAt: zero, lightning: NO_FLASH, flashes: empty,
    frontAtSec: null, backAtSec: null,
    firstDropAtSec: null, mergeAtSec: null, source: null,
  });

  function quantile(sorted, fraction) {
    if (!sorted.length) return -100;
    const at = fraction * (sorted.length - 1), below = Math.floor(at);
    return sorted[below] + (sorted[Math.ceil(at)] - sorted[below]) * (at - below);
  }

  function median(row) {
    return quantile(row.slice().sort((a, b) => a - b), .5);
  }

  function notePower(lanes, duration, hop) {
    const bins = new Float64Array(Math.ceil(duration / hop));
    let hasNotes = false;
    for (const lane of lanes) for (const note of Array.isArray(lane?.notes) ? lane.notes : []) {
      if (!Array.isArray(note)) continue;
      const [start, length, , velocity] = note;
      if (!finite(start) || !finite(length) || start >= duration) continue;
      const end = Math.min(duration, start + Math.max(length, .08));
      if (end <= 0) continue;
      hasNotes = true;
      const weight = Math.max(.05, clamp((finite(velocity) ? velocity : 90) / 127)) ** 2;
      const onset = Math.floor(start / hop);
      for (let bin = Math.max(0, onset); bin < bins.length && bin * hop < end; bin++) {
        bins[bin] += (Math.min(end, (bin + 1) * hop) - Math.max(start, bin * hop)) / hop * weight;
      }
      if (onset >= 0 && onset < bins.length) bins[onset] += .6 * weight;
    }
    return hasNotes ? Array.from(bins, power => power > 0 ? -30 + 10 * Math.log10(power) : -100) : [];
  }

  function loudness(song, duration) {
    const {energy, levels} = song;
    if (finite(energy?.hop) && energy.hop > 0 && validSeries(energy.db)) {
      return {...energy, source: 'energy'};
    }
    const groups = Object.values(levels?.groups || {}).filter(validSeries);
    if (finite(levels?.hop) && levels.hop > 0 && groups.length) {
      const db = Array.from({length: Math.max(...groups.map(row => row.length))}, (_, i) => {
        const power = groups.reduce((sum, row) => sum + (row[i] > -100 ? 10 ** (row[i] / 10) : 0), 0);
        return power > 0 ? 10 * Math.log10(power) : -100;
      });
      return {db, hop: levels.hop, source: 'sum-of-stem-power'};
    }
    const hop = .5, db = notePower(Array.isArray(song.lanes) ? song.lanes : [], duration, hop);
    return {db, hop, source: db.length ? 'note-power-proxy' : 'unavailable'};
  }

  function interpolate(values, position) {
    if (!values.length) return 0;
    const at = Math.max(0, Math.min(values.length - 1, position)), below = Math.floor(at);
    const first = values[below] ?? 0;
    return first + ((values[below + 1] ?? first) - first) * (at - below);
  }

  function averageAround(values, hop, seconds) {
    const sums = new Float64Array(values.length + 1);
    values.forEach((value, i) => { sums[i + 1] = sums[i] + value; });
    const radius = Math.max(1, Math.round(seconds / hop));
    return values.map((_, i) => {
      const a = Math.max(0, i - radius), b = Math.min(values.length, i + radius + 1);
      return (sums[b] - sums[a]) / (b - a);
    });
  }

  function stemProfile(levels, duration) {
    const hop = levels?.hop;
    if (!finite(hop) || hop <= 0) return null;
    const groups = Object.values(levels.groups || {}).filter(validSeries);
    if (groups.length < 2) return null;
    const frames = Math.min(Math.ceil(duration / hop), Math.max(...groups.map(row => row.length)));
    if (frames <= 0) return null;
    const gates = groups.map(row => {
      const audible = row.filter(v => v > -90).sort((a, b) => a - b);
      return Math.max(-65, quantile(audible, .75) - 20);
    });
    const activity = new Array(frames);
    const presence = new Array(frames);
    for (let i = 0; i < frames; i++) {
      const values = groups.map(row => row[i] ?? -100);
      const strongest = Math.max(...values);
      const active = values.reduce((sum, value) => sum + smooth((value - strongest + 18) / 14), 0);
      activity[i] = smooth((strongest + 72) / 18) * clamp((active - 1) / 2.7);
      let on = 0;
      for (let g = 0; g < groups.length; g++) on += smooth((values[g] - gates[g] + 3) / 6);
      presence[i] = on / groups.length;
    }
    const smoothAct = averageAround(activity, hop, 1.55);
    const smoothPres = averageAround(presence, hop, 1.5);
    return {
      count: groups.length,
      hop,
      activityAt: time => interpolate(smoothAct, time / hop),
      presenceAt: time => interpolate(smoothPres, time / hop),
    };
  }

  // Mechanism 3: lightweight Spiral-Array / Valence-Arousal harmonic tension H(t) in [0, 1].
  function chordTensionScore(label) {
    const raw = String(label || '').trim();
    if (!raw || /^(N|NC|none|—|-)$/i.test(raw)) return null;
    const slash = raw.includes('/');
    const main = raw.split('/')[0].trim();
    const rest = main.replace(/^[A-G](?:#|b|♯|♭)?/, '').replace(/^:/, '');
    let score;
    if (/dim|hdim|m7b5|ø|aug|\+|alt|b9|#9|#11|b13|mMaj|minmaj/i.test(rest)) score = .88;
    else if (/^(?:m|min)(?:7|9|11|13|6)/i.test(rest)) score = .68;
    else if (/^(?:m|min)(?:$|[^a])/i.test(rest)) score = .62;
    else if (/sus/i.test(rest)) score = .54;
    else if (/^(?:7|9|11|13)/i.test(rest)) score = .46;
    else if (/maj7|maj9|maj13|Δ|6|add/i.test(rest)) score = .26;
    else score = .15; // clean major triad
    return clamp(score + (slash ? .08 : 0));
  }

  function harmonicTensionCurve(song, duration) {
    const raw = Array.isArray(song?.chords) ? song.chords : [];
    const segs = [];
    for (const row of raw) {
      if (!Array.isArray(row) || !finite(row[0]) || !finite(row[1]) || row[1] <= row[0]) continue;
      const score = chordTensionScore(row[2]);
      if (score === null) continue;
      segs.push({start: row[0], end: row[1], score});
    }
    if (!segs.length) return {at: half, hasChords: false};
    segs.sort((a, b) => a.start - b.start);
    const hop = .5;
    const bins = Math.max(1, Math.ceil(duration / hop) + 1);
    const values = new Array(bins).fill(.5);
    let cursor = 0;
    for (let i = 0; i < bins; i++) {
      const t = i * hop;
      while (cursor < segs.length && segs[cursor].end <= t) cursor++;
      const cur = cursor < segs.length && segs[cursor].start <= t ? segs[cursor] : null;
      // Harmonic rhythm: chord changes within +/-4 s window add subtle atmospheric urgency.
      let changes = 0;
      for (let k = Math.max(0, cursor - 12); k < segs.length && segs[k].start <= t + 4; k++) {
        if (segs[k].start >= t - 4) changes++;
      }
      const motion = clamp((changes / 8 - .25) / 1.1) * .16;
      values[i] = cur ? clamp(cur.score + motion) : .5;
    }
    const smoothed = averageAround(values, hop, 2.5);
    return {
      hasChords: true,
      at: time => time < 0 || time > duration ? .5 : interpolate(smoothed, time / hop),
    };
  }

  function sectionStartsOf(song, start, end) {
    const raw = Array.isArray(song?.sections) ? song.sections : [];
    const times = [];
    for (const row of raw) {
      const t = Array.isArray(row) ? row[0] : row?.start;
      if (finite(t) && t > start && t < end) times.push(t);
    }
    times.sort((a, b) => a - b);
    return times;
  }

  function snapToSection(time, sectionStarts, minTime, maxTime) {
    let best = time, bestDist = SNAP_WINDOW;
    for (const s of sectionStarts) {
      const d = Math.abs(s - time);
      if (d < bestDist && s >= minTime && s <= maxTime) {
        best = s;
        bestDist = d;
      }
    }
    return best;
  }

  function halfSecondSeries(db, hop) {
    const edge = t => Math.ceil(t / hop - 1e-7);
    const seconds = Array.from({length: Math.floor(db.length * hop + 1e-7)}, (_, i) => {
      const samples = db.slice(edge(i), edge(i + 1));
      return samples.length ? median(samples) : db[Math.min(db.length - 1, Math.floor(i / hop))];
    });
    const halves = [];
    for (let i = 0; i < seconds.length; i++) {
      halves.push(seconds[i]);
      if (i + 1 < seconds.length) halves.push((seconds[i] + seconds[i + 1]) / 2);
    }
    return {seconds, halves};
  }

  // Mechanism 1A: Fast surge detector (Rule B, 2 s vs prior 8 s > 6 dB, 4 s hold >= -3 dB).
  function sustainedRises(halves) {
    const events = [];
    let prior = false;
    for (let i = 20; i <= halves.length - 8; i++) {
      const base = median(halves.slice(i - 20, i - 4));
      const recent = median(halves.slice(i - 4, i));
      const after = median(halves.slice(i, i + 8));
      const rising = recent - base > 6 && after - recent >= -3;
      if (rising && !prior) events.push({time: i / 2, strength: 1, kind: 'surge'});
      prior = rising;
    }
    return events;
  }

  // Mechanism 1B: Parallel 30 s sustained crescendo (runs alongside fast surges, never muted by them).
  function slowCrescendos(seconds, level, plainStart, plainEnd) {
    const events = [];
    if (seconds.length < 32) return events;
    const p50 = median(seconds.filter(v => v > -90));
    let cooldownUntil = plainStart;
    for (let s = Math.max(0, Math.floor(plainStart)); s <= Math.min(seconds.length - 30, Math.floor(plainEnd - 10)); s += 2) {
      if (s + 22 < cooldownUntil) continue;
      const a = median(seconds.slice(s, s + 10));
      const b = median(seconds.slice(s + 10, s + 20));
      const c = median(seconds.slice(s + 20, s + 30));
      const t = s + 22;
      if (a < p50 + 2 && b - a >= 1.6 && c - b >= 1.6 && c - a >= 5.5 && level(t) >= .62) {
        events.push({time: t, strength: .82, kind: 'crescendo'});
        cooldownUntil = t + 26;
      }
    }
    return events;
  }

  // Mechanism 1C: Stem-entry trigger for narrow-dynamic / heavily compressed tracks (e.g. Mirrors).
  function stemEntries(stems, level, plainStart, plainEnd) {
    const events = [];
    if (!stems || stems.count < 3) return events;
    const samples = [];
    for (let t = plainStart; t < plainEnd; t += 2) samples.push(stems.presenceAt(t));
    samples.sort((a, b) => a - b);
    const lowPres = quantile(samples, .25);
    let armed = true, cooldownUntil = plainStart;
    for (let t = plainStart + 4; t < plainEnd - 4; t += 1) {
      const before = (stems.presenceAt(t - 5) + stems.presenceAt(t - 2.5)) / 2;
      const now = stems.presenceAt(t);
      const after = (stems.presenceAt(t + 2) + stems.presenceAt(t + 4)) / 2;
      if (now <= Math.min(.52, lowPres + .18) || t >= cooldownUntil) armed = true;
      if (armed && now - before >= .20 && after >= now - .07 && level(t + 2) >= .44) {
        events.push({time: t, strength: .76, kind: 'entry'});
        armed = false;
        cooldownUntil = t + 24;
      }
    }
    return events;
  }

  // Mechanism 1D: Gentle fallback rise when a track climbs slowly without sharp jumps or 30 s spans.
  function gradualRises(level, plainStart, plainEnd) {
    const events = [];
    let high = 0, armed = true;
    for (let time = plainStart; time < plainEnd; time += .5) {
      const amount = level(time);
      if (amount < .32) armed = true;
      high = amount >= .68 ? high + .5 : 0;
      if (armed && high >= 4) {
        events.push({time: time - 3.5, strength: .63, kind: 'gradual'});
        armed = false;
      }
    }
    return events;
  }

  function levelCurve(db, hop, duration, plainStart, plainEnd) {
    const sorted = db.slice().sort((a, b) => a - b);
    const low = quantile(sorted, .1), high = quantile(sorted, .9);
    const flat = quantile(sorted, .95) - quantile(sorted, .05) < 1.5;
    const span = Math.max(MIN_SPAN, high - low);
    const sums = new Float64Array(db.length + 1);
    db.forEach((value, i) => { sums[i + 1] = sums[i] + clamp((value - low) / span); });
    const radius = Math.max(1, Math.round(3 / hop));
    const values = db.map((_, i) => {
      const a = Math.max(0, i - radius), b = Math.min(db.length, i + radius + 1);
      return (sums[b] - sums[a]) / (b - a);
    });
    const at = time => {
      if (flat || time < plainStart || time > plainEnd || time < 0 || time > duration) return 0;
      const opening = plainStart > 0 ? smooth((time - plainStart) / 2) : 1;
      const closing = plainEnd < duration ? smooth((plainEnd - time) / 2) : 1;
      return opening * closing * interpolate(values, time / hop);
    };
    return {at, sorted, low, high, flat};
  }

  function glassCurve(db, hop, duration, stems) {
    if (!db.length) return zero;
    const phrase = averageAround(db, hop, 1.15);
    const long = averageAround(db, hop, 4);
    const sorted = phrase.slice().sort((a, b) => a - b);
    const quiet = quantile(sorted, .15);
    const span = Math.max(9, quantile(sorted, .90) - quiet + 1);
    const drive = phrase.map((value, i) => {
      const body = smooth((value - quiet) / span);
      const lift = smooth((value - long[i] + .6) / 4);
      if (!stems) return .87 * body + .13 * lift;
      const activity = stems.activityAt(i * hop);
      return .50 * body + .37 * activity + .13 * lift;
    });
    return time => time < 0 || time > duration ? 0 : interpolate(drive, time / hop);
  }

  // Mechanism 1: Continuous rain potential P(t) combining plateau, dual-envelope momentum and stem texture.
  function potentialCurve(db, hop, duration, level, stems, flat, plainStart, plainEnd) {
    if (!db.length || flat) return zero;
    const shortDb = averageAround(db, hop, 1.5);
    const longDb = averageAround(db, hop, 6);
    const macroDb = averageAround(db, hop, 15);
    const raw = db.map((_, i) => {
      const t = i * hop;
      const body = level(t);
      const fastMom = smooth((shortDb[i] - longDb[i] - .5) / 6.5);
      const slowMom = smooth((longDb[i] - macroDb[i] - .5) / 5.5);
      const boost = .14 * fastMom + .08 * slowMom;
      if (!stems) return clamp(body + boost * (1 - .5 * body));
      const texture = .55 * stems.activityAt(t) + .45 * stems.presenceAt(t);
      const base = .72 * body + .28 * texture;
      return clamp(base + boost * (1 - .5 * base));
    });
    return time => {
      if (time < plainStart || time > plainEnd || time < 0 || time > duration) return 0;
      return interpolate(raw, time / hop);
    };
  }

  // Mechanism 2: Three-state hysteresis rain-band builder with +/-2 s section boundary snap.
  function rainBands(candidates, halves, level, potential, sectionStarts, plainStart, plainEnd) {
    const sorted = candidates
      .filter(c => c.time >= plainStart && c.time < plainEnd)
      .sort((a, b) => a.time - b.time || b.strength - a.strength);
    const events = [];
    const halfAt = sec => {
      const idx = Math.max(0, Math.min(halves.length - 1, Math.round(sec * 2)));
      return halves[idx] ?? -100;
    };
    const deepDropAt = sec => {
      const idx = Math.round(sec * 2);
      if (idx < 20 || idx > halves.length - 8) return false;
      const base = median(halves.slice(idx - 20, idx - 4));
      const recent = median(halves.slice(idx - 4, idx));
      const after = median(halves.slice(idx, idx + 6));
      return base - recent >= 6 && after <= recent + 2.5 && level(sec + 2) < .38;
    };

    for (const cand of sorted) {
      const snappedFront = snapToSection(cand.time, sectionStarts, plainStart, plainEnd - 2);
      const firstDropAtSec = Math.max(0, snappedFront - LEAD);
      const previous = events.at(-1);

      // Skip secondary non-surge triggers that fall inside or right beside an already active band.
      if (previous && snappedFront <= previous.backAtSec + 6) {
        if (cand.kind === 'surge' && previous.strength < cand.strength) {
          previous.strength = cand.strength;
        }
        continue;
      }

      // Reject transient <4 s false spikes (e.g. a brief intro hit followed immediately by silence).
      if (level(snappedFront + 3.5) < .30 && potential(snappedFront + 3.5) < .32 && cand.kind !== 'gradual') {
        continue;
      }

      let quiet = 0, backAtSec = plainEnd;
      for (let time = snappedFront + 3.5; time < plainEnd; time += .5) {
        if (deepDropAt(time)) {
          backAtSec = snapToSection(time, sectionStarts, snappedFront + 3, plainEnd);
          break;
        }
        const lowNow = potential(time) < .34 && level(time) < .36;
        quiet = lowNow ? quiet + .5 : 0;
        if (quiet >= 4) {
          backAtSec = snapToSection(time - 3.5, sectionStarts, snappedFront + 3, plainEnd);
          break;
        }
      }

      // Skip ultra-short bands under 4.5 s unless near end of song.
      if (backAtSec - snappedFront < 4.5) continue;

      if (previous && firstDropAtSec < previous.backAtSec + 6) {
        previous.backAtSec = Math.max(previous.backAtSec, backAtSec);
        previous.strength = Math.max(previous.strength, cand.strength);
        continue;
      }
      // Keep halfAt referenced cleanly so band metadata stays lean.
      void halfAt;
      events.push({
        index: events.length,
        frontAtSec: snappedFront,
        backAtSec,
        firstDropAtSec,
        mergeAtSec: snappedFront,
        // The slow-rise marker falls inside a phrase that is already building.
        // Let its first flakes or drops arrive with the glass cue.
        onsetAtSec: cand.kind === 'crescendo' || cand.kind === 'gradual'
          ? Math.max(plainStart, firstDropAtSec) : snappedFront,
        strength: cand.strength,
        kind: cand.kind,
      });
    }
    return Object.freeze(events.map((event, index) => Object.freeze({...event, index})));
  }

  function groundResponse(deposited, storm, mode, gusts) {
    const config = surfaceResponse[mode];
    const surface = new Float32Array(storm.length);
    const wind = new Float32Array(storm.length);
    const travel = new Float64Array(storm.length);
    const uptake = -Math.expm1(-WET_STEP / config.attack);
    const loss = -Math.expm1(-WET_STEP / config.release);
    const windIn = -Math.expm1(-WET_STEP / 1.4);
    const windOut = -Math.expm1(-WET_STEP / 4.2);
    for (let i = 1; i < storm.length; i++) {
      const airborne = deposited[i];
      const steady = airborne + (storm[i] - airborne) * config.windFromStorm;
      const force = (gusts ? clamp(steady + gusts[i]) : steady) * config.windScale;
      const target = mode === 'sandstorm' ? .70 * airborne + .30 * storm[i] : airborne;
      surface[i] = surface[i - 1] + (target - surface[i - 1]) * (target > surface[i - 1] ? uptake : loss);
      wind[i] = wind[i - 1] + (force - wind[i - 1]) * (force > wind[i - 1] ? windIn : windOut);
      travel[i] = travel[i - 1] + (wind[i - 1] + wind[i]) * .5 * WET_STEP;
    }
    return {surface, wind, travel};
  }

  function buildTimeline(song, duration, start, end) {
    const {db: full, hop, source} = loudness(song, duration);
    const db = full.slice(0, Math.ceil(duration / hop));
    const stems = stemProfile(song.levels, duration);
    const {at: level, sorted: sortedDb, flat} = levelCurve(db, hop, duration, start, end);
    const glassDriveAt = glassCurve(db, hop, duration, stems);
    const potentialAt = potentialCurve(db, hop, duration, level, stems, flat, start, end);
    const {at: tensionAt} = harmonicTensionCurve(song, duration);
    const sectionStarts = sectionStartsOf(song, start, end);
    const {seconds, halves} = halfSecondSeries(db, hop);

    // Parallel candidates: surges + slow crescendos + stem entries (+ gentle fallback if needed).
    let candidates = [];
    if (!flat && db.length) {
      const surges = sustainedRises(halves).filter(e => e.time >= start && e.time < end);
      const crescendos = slowCrescendos(seconds, level, start, end);
      const entries = stemEntries(stems, level, start, end);
      candidates = [...surges, ...crescendos, ...entries];
      if (!candidates.length) {
        candidates = gradualRises(level, start, end);
      }
    }

    const events = rainBands(candidates, halves, level, potentialAt, sectionStarts, start, end);

    // Mid-rain breather (drizzle state): smooth attenuation when energy dips noticeably inside a long band.
    const phraseDb = db.length ? averageAround(db, hop, 1.8) : [];
    const p60 = quantile(sortedDb, .60);
    const p98 = quantile(sortedDb, .98);
    const upperSpan = Math.max(4, p98 - p60);

    const bins = Math.ceil(duration / WET_STEP) + 1;
    const breatherBins = new Float32Array(bins).fill(1);
    const headroomBins = new Float32Array(bins);

    for (let i = 0; i < bins; i++) {
      const time = i * WET_STEP;
      const curDb = phraseDb.length ? interpolate(phraseDb, time / hop) : -100;
      headroomBins[i] = flat ? 0 : smooth((curDb - p60) / upperSpan);
    }

    // Track recent local peak inside each rain band so mid-band bridges breathe into lighter drizzle.
    for (const event of events) {
      const a = Math.max(0, Math.floor(event.frontAtSec / WET_STEP));
      const b = Math.min(bins - 1, Math.ceil((event.backAtSec + 3.5) / WET_STEP));
      let recentPeak = -100;
      for (let i = a; i <= b; i++) {
        const time = i * WET_STEP;
        const curDb = phraseDb.length ? interpolate(phraseDb, time / hop) : -100;
        recentPeak = Math.max(curDb, recentPeak - .04 * WET_STEP); // slow peak memory (~1.2 dB per 30 s)
        const dipDb = recentPeak - curDb;
        const pot = potentialAt(time);
        // Engage drizzle breather when inside a sustained band and clearly dipping below recent peak.
        const dipFactor = smooth((dipDb - 2.2) / 3.4) * (1 - smooth((pot - .68) / .20));
        const breather = 1 - .64 * dipFactor;
        breatherBins[i] = Math.min(breatherBins[i], breather);
      }
    }

    const rainAt = time => {
      if (time < 0 || time > duration || !events.length) return 0;
      let band = 0;
      for (const event of events) {
        band = Math.max(band, event.strength * smooth((time - event.onsetAtSec) / RISE_SECONDS[event.kind]) *
          (1 - smooth((time - event.backAtSec) / 3.5)));
      }
      if (band <= 0) return 0;
      const breather = interpolate(breatherBins, time / WET_STEP);
      return clamp(band * (.13 + .87 * level(time)) * breather);
    };

    // Convolve 18 seconds of deposition with the drying curve once for deterministic seek wetness.
    const airborne = new Float32Array(bins), onGlass = new Float32Array(bins), wet = new Float32Array(bins);
    const weights = Array.from({length: Math.round(18 / WET_STEP)}, (_, i) => Math.exp(-i * WET_STEP / 4.5) * WET_STEP / 4.5);
    for (let i = 0; i < bins; i++) {
      const time = i * WET_STEP;
      const r = rainAt(time);
      const drop = events.some(e => time >= e.firstDropAtSec && time < e.firstDropAtSec + .65);
      airborne[i] = r;
      // A single drop on the pane can wet the glass before a storm fills the air.
      onGlass[i] = clamp(r + (drop ? .14 : 0));
    }
    for (let i = 0; i < bins; i++) {
      let value = 0;
      for (let j = 0; j < weights.length && j <= i; j++) value += onGlass[i - j] * weights[j];
      wet[i] = clamp(value);
    }
    const wetAt = time => interpolate(wet, time / WET_STEP);

    // Storm pressure integrates rain deposition, upper-tail headroom, breather, and harmonic tension H(t).
    const storm = new Float32Array(bins);
    let previous = 0;
    for (let i = 0; i < bins; i++) {
      const time = i * WET_STEP;
      const amount = level(time);
      const pot = potentialAt(time);
      const headroom = headroomBins[i];
      const breather = breatherBins[i];
      const tension = tensionAt(time);
      const tensionScale = .80 + .42 * tension; // bright major ~0.90, neutral ~1.01, tense minor/dissonant ~1.12
      const pressure = .40 * glassDriveAt(time) + .36 * pot + .24 * headroom;
      const downpour = smooth((pressure - .46) / .38);
      const target = clamp(
        Math.sqrt(airborne[i]) * (.12 + .18 * amount + .54 * downpour + .20 * headroom) * (.36 + .64 * breather) * tensionScale
      );
      const response = target > previous ? 1.55 : 2.35;
      previous += (target - previous) * -Math.expm1(-WET_STEP / response);
      storm[i] = previous;
    }
    const stormDriveAt = time => time < 0 || time > duration ? 0 : interpolate(storm, time / WET_STEP);
    const flashes = planLightning(song, duration, start, end, halves, stormDriveAt, tensionAt);
    const groundAt = groundSampler(airborne, storm);
    return {duration, start, end, level, potentialAt, tensionAt, events, rainAt, wetAt, glassDriveAt, stormDriveAt, groundAt, flashes, source};
  }

  function groundSampler(airborne, storm, gusts) {
    const groundByMode = new Map();
    return function groundAt(mode, time) {
      let series = groundByMode.get(mode);
      if (!series) {
        series = groundResponse(airborne, storm, mode, gusts);
        groundByMode.set(mode, series);
      }
      const position = time / WET_STEP;
      const index = Math.min(Math.floor(position), storm.length - 1);
      const wind = interpolate(series.wind, position);
      const partialTravel = (position - index) * WET_STEP * (series.wind[index] + wind) * .5;
      return {surface: interpolate(series.surface, position), wind, windTravel: series.travel[index] + partialTravel};
    };
  }

  // Deterministic sheet-lightning planner: strictly rare & earned (only when stormDrive >= 0.72, tension >= 0.45,
  // strong musical accent, and >= 22 s cooldown between flashes; capped per track).
  function planLightning(song, duration, start, end, halves, stormDriveAt, tensionAt) {
    if (!(duration > 10)) return empty;
    const candidates = [];
    // 1. Strong drum accents (crash / kick / snare velocity >= 92) during peak storm.
    for (const lane of Array.isArray(song?.lanes) ? song.lanes : []) {
      if (!lane || lane.kind !== 'drums' || !Array.isArray(lane.hits)) continue;
      const rows = Array.isArray(lane.rows) ? lane.rows : [];
      for (const hit of lane.hits) {
        if (!Array.isArray(hit) || !finite(hit[0])) continue;
        const t = hit[0];
        if (t < start + 2 || t > end - 2) continue;
        const vel = finite(hit[2]) ? hit[2] : 100;
        if (vel < 92) continue;
        const name = String(rows[hit[1]] || '').toLowerCase();
        const kindBoost = name === 'crash' ? .34 : (name === 'kick' || name === 'snare') ? .20 : 0;
        if (kindBoost <= 0) continue;
        const sd = stormDriveAt(t), tens = tensionAt(t);
        if (sd < LIGHTNING_MIN_STORM || tens < LIGHTNING_MIN_TENSION) continue;
        const accent = kindBoost * clamp((vel - 80) / 47);
        candidates.push({time: t, sd, tens, score: sd * (.70 + .60 * tens) + accent});
      }
    }
    // 2. Sharp loudness surges or storm climax peaks (covers drumless / orchestral / ambient post-rock tracks).
    for (let i = 2; i < halves.length - 1; i++) {
      const t = i * .5;
      if (t < start + 2 || t > end - 2) continue;
      const sd = stormDriveAt(t), tens = tensionAt(t);
      if (sd < LIGHTNING_MIN_STORM || tens < LIGHTNING_MIN_TENSION) continue;
      const rise = halves[i] - Math.min(halves[i - 1], halves[i - 2]);
      const localPeak = halves[i] >= halves[i - 1] && halves[i] >= halves[i + 1];
      if (rise >= 1.8 || (localPeak && sd >= .78)) {
        const accent = rise >= 1.8 ? clamp(rise / 8) * .26 : .10;
        candidates.push({time: t, sd, tens, score: sd * (.70 + .60 * tens) + accent});
      }
    }
    if (!candidates.length) return empty;
    candidates.sort((a, b) => b.score - a.score || a.time - b.time);
    const maxFlashes = Math.max(1, Math.min(5, Math.floor(duration / 65)));
    const picked = [];
    for (const c of candidates) {
      if (picked.length >= maxFlashes) break;
      if (picked.some(p => Math.abs(p.time - c.time) < LIGHTNING_COOLDOWN)) continue;
      picked.push(c);
    }
    picked.sort((a, b) => a.time - b.time);
    return Object.freeze(picked.map((p, index) => {
      const hash = Math.abs(Math.sin(p.time * 12.9898 + (index + 1) * 78.233) * 43758.5453) % 1;
      return Object.freeze({
        time: p.time,
        strength: clamp(.68 + .32 * clamp((p.sd - LIGHTNING_MIN_STORM) / (1 - LIGHTNING_MIN_STORM))),
        xNorm: .20 + .60 * hash,
        index
      });
    }));
  }

  // Dual-pulse intra-cloud sheet-lightning envelope (primary strike + softer restrike flicker over 0.56 s).
  function sampleLightning(flashes, t) {
    if (!flashes || !flashes.length) return NO_FLASH;
    let best = NO_FLASH;
    for (const f of flashes) {
      const dt = t - f.time;
      if (dt < 0 || dt > .56) continue;
      const p1 = smooth(dt / .024) * Math.exp(-Math.max(0, dt - .02) / .055);
      const p2 = dt > .14 ? .58 * smooth((dt - .14) / .032) * Math.exp(-Math.max(0, dt - .20) / .115) : 0;
      const intensity = clamp(Math.max(p1, p2) * f.strength);
      if (intensity > best.intensity) {
        best = {intensity, primary: clamp(p1 * f.strength), xNorm: f.xNorm, index: f.index};
      }
    }
    return best;
  }

  function weatherState(intensity, stormDrive, mode = 'rain') {
    if (mode === 'sandstorm') {
      if (intensity <= .02) return 'haze';
      if (stormDrive >= .72) return 'sandstorm';
      if (intensity < .45) return 'blowing';
      return 'duststorm';
    }
    if (intensity <= .02) return 'overcast';
    if (mode === 'snow') {
      if (stormDrive >= .72) return 'blizzard';
      if (intensity < .45) return 'flurries';
      return 'snow';
    }
    if (stormDrive >= .72) return 'storm';
    if (intensity < .45) return 'drizzle';
    return 'rain';
  }

  // Validate once per file. The generic reader also supports future scales, which are
  // unsafe to interpret using this version's absolute weather thresholds.
  function moodReader(record) {
    if (!record || typeof record !== 'object') return null;
    if (curveReaders.has(record)) return curveReaders.get(record);
    const api = root.XinMoodCurve || (typeof module === 'object' && module.exports
      ? require('../shared-analysis/mood-curve.js') : null);
    if (!api) return null;
    const reader = record.engineVersion === 1 && record.formulaVersion === 'mood-direct-1' &&
      record.scaleVersion === 'mood-scale-1' && api.valid(record) && record.slow.every(finite) ? api : null;
    curveReaders.set(record, reader);
    return reader;
  }

  const precipitation = slow => smooth((slow - RAIN_START) / (1 - RAIN_START));

  function gustLevel(slow, fast) {
    if (slow <= RAIN_START || !finite(fast)) return slow;
    const lo = slow < MODERATE ? RAIN_START : slow < HEAVY ? MODERATE : slow < STORM ? HEAVY : STORM;
    const hi = slow < MODERATE ? MODERATE : slow < HEAVY ? HEAVY : slow < STORM ? STORM : 1;
    // Taper to zero on both sides of each interval, so fast alone cannot cross a boundary.
    return slow + .40 * (fast - slow) * (slow - lo) * (hi - slow) / (hi - lo);
  }

  function moodLightning(duration, read) {
    const flashes = [];
    const limit = Math.max(1, Math.min(5, Math.floor(duration / 65)));
    for (let i = 0; i * 6 + 2 < duration && flashes.length < limit; i++) {
      const hash = k => Math.abs(Math.sin(i * 12.9898 + k * 78.233) * 43758.5453) % 1;
      const time = i * 6 + 2 + 4 * hash(1);
      if (time + .56 > duration || (flashes.length && time - flashes.at(-1).time < LIGHTNING_COOLDOWN)) continue;
      const slow = read(time).slow;
      // The entire double pulse must fit inside an eligible stretch, including a
      // sampled local minimum between its ends. The official record has a 0.5 s step.
      if (slow < LIGHTNING_SLOW || read(time + .56).slow < LIGHTNING_SLOW) continue;
      const next = Math.ceil(time * 2) / 2;
      if (read(next).slow < LIGHTNING_SLOW || (next + .5 < time + .56 && read(next + .5).slow < LIGHTNING_SLOW)) continue;
      flashes.push({time, strength: .68 + .32 * (slow - LIGHTNING_SLOW) / (1 - LIGHTNING_SLOW),
        xNorm: .20 + .60 * hash(2), index: flashes.length});
    }
    return flashes;
  }

  function buildMoodTimeline(read, duration) {
    const stormDriveAt = t => precipitation(read(t).slow);
    const rainAt = t => {
      const {slow, fast} = read(t);
      return precipitation(gustLevel(slow, fast));
    };
    const n = Math.ceil(duration / WET_STEP) + 1;
    const steady = new Float32Array(n), gusts = new Float32Array(n), wet = new Float32Array(n);
    const uptake = -Math.expm1(-WET_STEP / 4.5);
    for (let i = 0; i < n; i++) {
      const {slow, fast} = read(Math.min(i * WET_STEP, duration));
      steady[i] = precipitation(slow);
      gusts[i] = precipitation(gustLevel(slow, fast)) - steady[i];
      if (i) wet[i] = wet[i-1] + (steady[i] - wet[i-1]) * uptake;
    }
    return {duration, rainAt, stormDriveAt, wetAt: t => interpolate(wet, t / WET_STEP),
      level: t => read(t).slow, groundAt: groundSampler(steady, steady, gusts), flashes: moodLightning(duration, read)};
  }

  function sampleMood(record, api, mode, t, duration, lightningEnabled) {
    let timeline = moodTimelines.get(record);
    const read = time => api.at(record, Math.min(record.duration, Math.max(0, time)));
    if (mode === 'clear') {
      const slow = read(t).slow;
      return {...clear, source: 'mood-curve', level: slow, cloudOpacity: .35 + .65 * smooth(slow)};
    }
    if (!timeline || timeline.duration !== duration) {
      timeline = buildMoodTimeline(read, duration);
      moodTimelines.set(record, timeline);
    }
    const {rainAt, stormDriveAt, wetAt, flashes, level} = timeline;
    const slow = level(t), intensity = rainAt(t), storm = precipitation(slow);
    const rain = mode === 'rain', snow = mode === 'snow', sand = mode === 'sandstorm';
    const state = slow <= RAIN_START ? (sand ? 'haze' : 'overcast') : slow < MODERATE ?
      (sand ? 'blowing' : snow ? 'flurries' : 'drizzle') : slow < STORM ? (sand ? 'duststorm' : snow ? 'snow' : 'rain') :
      (sand ? 'sandstorm' : snow ? 'blizzard' : 'storm');
    // Reuse the valley renderer's world placement. Rain strength follows the curve
    // continuously; the whole route is available without inventing onset events.
    const distantBands = intensity > 0 ? [{index: 0, strength: intensity, frontAtSec: 0, backAtSec: duration}] : empty;
    return {...clear, mode, rain, snow, sand, state, source: 'mood-curve', ...timeline.groundAt(mode, t),
      level: slow, potential: slow, potentialAt: level, farRain: smooth(slow), distantBands,
      intensity, rainAt, humidity: wetAt(t), wetAt, glassDriveAt: rainAt, stormDrive: storm, stormDriveAt,
      lightning: rain && lightningEnabled ? sampleLightning(flashes, t) : NO_FLASH, flashes: rain ? flashes : empty};
  }

  function sample(song, time, options) {
    const mode = options?.terrainWeather;
    if (!song || !(song.track?.duration > 0) || !finite(song.track.duration)) return clear;
    if (mode !== 'rain' && mode !== 'snow' && mode !== 'sandstorm' && mode !== 'clear') return clear;
    const isRain = mode === 'rain', isSnow = mode === 'snow', isSand = mode === 'sandstorm';
    const duration = song.track.duration;
    const t = finite(time) ? Math.min(duration, Math.max(0, time)) : 0;
    const reader = options.terrainWeatherDriver !== 'original' && moodReader(song.moodCurve);
    if (reader) return sampleMood(song.moodCurve, reader, mode, t, duration, options.terrainLightning !== false);
    if (mode === 'clear') return clear;
    const start = Math.min(duration, Math.max(0, finite(options.plainStart) ? options.plainStart : 0));
    const end = Math.min(duration, Math.max(start, finite(options.plainEnd) ? options.plainEnd : duration));
    let timeline = cache.get(song);
    if (!timeline || timeline.duration !== duration || timeline.start !== start || timeline.end !== end) {
      timeline = buildTimeline(song, duration, start, end);
      cache.set(song, timeline);
    }
    const {events, level, potentialAt, tensionAt, rainAt, wetAt, glassDriveAt, stormDriveAt, flashes, source} = timeline;
    const amount = level(t);
    const potential = potentialAt(t);
    const tension = tensionAt(t);
    const intensity = rainAt(t);
    const stormDrive = stormDriveAt(t);
    const lightning = !isRain || options?.terrainLightning === false ? NO_FLASH : sampleLightning(flashes, t);
    let farRain = 0, previous = null, upcoming = null;
    const distantBands = [];
    for (const event of events) {
      const depth = smooth((t - event.frontAtSec + APPROACH) / APPROACH) * (1 - smooth((t - event.backAtSec) / 6));
      const strength = event.strength * depth * (.40 + .60 * amount);
      if (strength > 0) distantBands.push({strength, age: t - event.frontAtSec, index: event.index});
      farRain = Math.max(farRain, strength);
      if (event.frontAtSec <= t) previous = event;
      else if (!upcoming && event.frontAtSec - t <= APPROACH) upcoming = event;
    }
    const anchor = upcoming || previous;
    return {
      mode, rain: isRain, snow: isSnow, sand: isSand, state: weatherState(intensity, stormDrive, mode),
      ...timeline.groundAt(mode, t),
      level: amount, potential, tension, farRain, distantBands, intensity, humidity: wetAt(t),
      events, rainAt, wetAt, glassDriveAt, potentialAt, tensionAt,
      stormDrive, stormDriveAt, lightning, flashes: isRain ? flashes : empty, source,
      frontAtSec: anchor?.frontAtSec ?? null, backAtSec: anchor?.backAtSec ?? null,
      firstDropAtSec: anchor?.firstDropAtSec ?? null, mergeAtSec: anchor?.mergeAtSec ?? null,
    };
  }

  // The inspector names the slow-curve intervals that gustLevel uses. Renderer states
  // are a separate signal (for instance both middle rain intervals draw as 'rain').
  const moodThresholds = Object.freeze({start: RAIN_START, moderate: MODERATE, heavy: HEAVY, storm: STORM, lightning: LIGHTNING_SLOW});
  function moodTier(slow) {
    if (!finite(slow)) return null;
    if (slow <= RAIN_START) return 'none';
    if (slow < MODERATE) return 'light';
    if (slow < HEAVY) return 'moderate';
    return slow < STORM ? 'heavy' : 'storm';
  }
  const api = Object.freeze({sample, previewSeconds: APPROACH, moodThresholds, moodTier});
  root.XinTerrainWeather = api;
  if (typeof module === 'object' && module.exports) module.exports = api;
})(globalThis);
