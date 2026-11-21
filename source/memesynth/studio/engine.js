/* A port of memesynth's score and render layers, so the page plays exactly what the CLI
 * would write. Every step below mirrors source/memesynth/memesynth/{score,render}.py:
 * the drum map, the 20 ms floor, route resolution, linear-interpolation resampling with
 * no anti-aliasing (SPEC §8 — the chipmunk effect is the point), the fade at both ends,
 * velocity as linear amplitude, and constant-power panning.
 *
 * Verified against the Python renderer on real exports; see verify_engine.js.
 * No DOM here, so Node can run it. */
(function (root) {
'use strict';

/* --- MIDI ------------------------------------------------------------------ */

/* General MIDI percussion folded onto the seven classes a kit voices, copied from
 * score.py. 35 and 36 are both kicks: XLD's drumMap writes 36 but its ADTOF path writes
 * 35, and across the corpus 35 outnumbers 36 roughly three to one. */
const DRUM_CLASSES = {
  35: 'kick', 36: 'kick',
  37: 'snare', 38: 'snare', 39: 'snare', 40: 'snare',
  42: 'hihat', 44: 'hihat',
  46: 'openhat',
  41: 'tom', 43: 'tom', 45: 'tom', 47: 'tom', 48: 'tom', 50: 'tom',
  49: 'crash', 52: 'crash', 55: 'crash', 57: 'crash',
  51: 'ride', 53: 'ride', 59: 'ride',
};
const STEMS = new Set(['bass', 'piano', 'guitar', 'strings', 'winds', 'drums', 'vocals', 'other']);
const MIN_DURATION = 0.02;

function parseMidi(buffer) {
  const view = new DataView(buffer);
  let at = 0;
  const u32 = () => { const v = view.getUint32(at); at += 4; return v; };
  const u16 = () => { const v = view.getUint16(at); at += 2; return v; };
  const u8 = () => view.getUint8(at++);
  const tag = () => String.fromCharCode(u8(), u8(), u8(), u8());

  if (tag() !== 'MThd') throw new Error('不是 MIDI 文件（缺 MThd）');
  const headerLength = u32();
  const format = u16(), trackCount = u16(), division = u16();
  at += headerLength - 6;
  if (division & 0x8000) throw new Error('暂不支持 SMPTE 时基的 MIDI');

  const tracks = [];
  const tempos = [{ tick: 0, usPerQuarter: 500000 }];
  for (let t = 0; t < trackCount; t++) {
    if (tag() !== 'MTrk') throw new Error(`第 ${t + 1} 条音轨缺 MTrk`);
    const chunkLength = u32();          // read first: `at + u32()` would use the pre-read `at`
    const end = at + chunkLength;
    let tick = 0, status = 0, name = '';
    const open = new Map(), notes = [];
    while (at < end) {
      let shift = 0, delta = 0, byte;
      do { byte = u8(); delta = (delta << 7) | (byte & 0x7f); shift++; } while (byte & 0x80 && shift < 5);
      tick += delta;
      let head = u8();
      if (head < 0x80) { at--; head = status; } else if (head < 0xf0) { status = head; }
      const type = head & 0xf0, channel = head & 0x0f;
      if (head === 0xff) {
        const meta = u8();
        let length = 0, lb;
        do { lb = u8(); length = (length << 7) | (lb & 0x7f); } while (lb & 0x80);
        if (meta === 0x03) {
          const bytes = new Uint8Array(buffer, at, length);
          at += length;
          name = new TextDecoder('utf-8').decode(bytes);   // track names can be non-ASCII
        } else if (meta === 0x51 && length === 3) {
          const a = u8(), b = u8(), c = u8();
          tempos.push({ tick, usPerQuarter: (a << 16) | (b << 8) | c });
        } else at += length;
      } else if (head === 0xf0 || head === 0xf7) {
        let length = 0, lb;
        do { lb = u8(); length = (length << 7) | (lb & 0x7f); } while (lb & 0x80);
        at += length;
      } else if (type === 0x90 || type === 0x80) {
        const pitch = u8(), velocity = u8();
        const key = channel * 128 + pitch;
        if (type === 0x90 && velocity > 0) {
          if (!open.has(key)) open.set(key, []);
          open.get(key).push({ tick, velocity });
        } else {
          const queue = open.get(key);
          if (queue && queue.length) {
            const started = queue.shift();
            notes.push({ startTick: started.tick, endTick: tick, pitch, velocity: started.velocity, channel });
          }
        }
      } else if (type === 0xc0 || type === 0xd0) at += 1;
      else at += 2;
    }
    at = end;
    tracks.push({ name, notes, isDrum: notes.some(n => n.channel === 9) });
  }

  // Tick -> seconds through the tempo map, the way pretty_midi does it. XLD writes one
  // placeholder tempo, but a file from anywhere else may change tempo mid-piece.
  tempos.sort((a, b) => a.tick - b.tick);
  const marks = [{ tick: 0, seconds: 0, usPerQuarter: tempos[0].usPerQuarter }];
  for (const tempo of tempos) {
    if (tempo.tick === 0) { marks[0].usPerQuarter = tempo.usPerQuarter; continue; }
    const last = marks[marks.length - 1];
    marks.push({
      tick: tempo.tick,
      seconds: last.seconds + (tempo.tick - last.tick) * last.usPerQuarter / 1e6 / division,
      usPerQuarter: tempo.usPerQuarter,
    });
  }
  const toSeconds = tick => {
    let mark = marks[0];
    for (const candidate of marks) { if (candidate.tick <= tick) mark = candidate; else break; }
    return mark.seconds + (tick - mark.tick) * mark.usPerQuarter / 1e6 / division;
  };
  for (const track of tracks) {
    for (const note of track.notes) {
      note.start = toSeconds(note.startTick);
      note.end = toSeconds(note.endTick);
    }
    track.notes.sort((a, b) => a.start - b.start || a.pitch - b.pitch);
  }
  return { format, division, tracks: tracks.filter(t => t.notes.length) };
}

/* --- score ------------------------------------------------------------------ */

const normaliseRoute = name =>
  String(name || '').split('/').map(part => part.trim().toLowerCase()).filter(Boolean).join('/');

function buildScore(midi, minDuration) {
  const floor = minDuration === undefined ? MIN_DURATION : minDuration;
  const notes = [], routes = {}, dropped = {}, warnings = [];
  let duration = 0;
  for (const track of midi.tracks) {
    const label = normaliseRoute(track.name);
    if (!track.isDrum && !label) {
      dropped['轨道无名称，无法路由'] = (dropped['轨道无名称，无法路由'] || 0) + track.notes.length;
      continue;
    }
    if (!track.isDrum && !STEMS.has(label.split('/')[0])) {
      warnings.push(`轨名 "${track.name}" 的 stem 段不是已知 stem —— 这可能是单 stem 导出而非 merged.mid`);
    }
    for (const note of track.notes) {
      duration = Math.max(duration, note.end);
      let route, noteDuration;
      if (track.isDrum) {
        const drumClass = DRUM_CLASSES[note.pitch];
        if (!drumClass) {
          const key = `未知鼓 pitch ${note.pitch}`;
          dropped[key] = (dropped[key] || 0) + 1;
          continue;
        }
        route = `drums/${drumClass}`;
        noteDuration = 0;
      } else {
        route = label;
        noteDuration = note.end - note.start;
        if (noteDuration < floor) {
          const key = `短于 ${(floor * 1000).toFixed(0)} ms`;
          dropped[key] = (dropped[key] || 0) + 1;
          continue;
        }
      }
      notes.push({ start: note.start, duration: noteDuration, pitch: note.pitch,
                   velocity: note.velocity, route, isDrum: track.isDrum });
      routes[route] = (routes[route] || 0) + 1;
    }
  }
  notes.sort((a, b) => a.start - b.start || (a.route < b.route ? -1 : a.route > b.route ? 1 : 0) || a.pitch - b.pitch);
  return { notes, duration, routes, dropped, warnings: [...new Set(warnings)] };
}

/* --- render ----------------------------------------------------------------- */

const TAIL_SECONDS = 2.0;
const pitchToHz = (pitch, transpose) => 440 * Math.pow(2, (pitch + (transpose || 0) - 69) / 12);

const STEM_VOICE_FALLBACKS = new Map([['winds', 'vocals'], ['other', 'strings']]);

function resolveVoice(kit, route) {
  const family = route.split('/')[0];
  return kit.voices[route] || kit.voices[family] || kit.voices[STEM_VOICE_FALLBACKS.get(family)] || null;
}

function resample(audio, ratio) {
  if (audio.length === 0 || Math.abs(ratio - 1) < 1e-9) return audio;
  const count = Math.round(audio.length / ratio);
  if (count <= 1) return audio.slice(0, 1);
  const limit = audio.length - 1;
  let size = count;
  while (size > 0 && (size - 1) * ratio > limit) size--;
  const out = new Float32Array(size);
  for (let i = 0; i < size; i++) {
    const position = i * ratio;
    const left = Math.floor(position), frac = position - left;
    const a = audio[left], b = left + 1 <= limit ? audio[left + 1] : a;
    out[i] = a + (b - a) * frac;
  }
  return out;
}

function envelope(audio, fadeSamples) {
  const fade = Math.min(Math.floor(fadeSamples), Math.floor(audio.length / 2));
  if (fade <= 0) return audio;
  for (let i = 0; i < fade; i++) {
    const gain = i / fade;                       // linspace(0,1,fade,endpoint=False)
    audio[i] *= gain;
    audio[audio.length - fade + i] *= 1 - (i + 1) / fade;
  }
  return audio;
}

function renderScore(score, kit, samples, rate, options) {
  const settings = options || {};
  const from = settings.from || 0;
  const to = settings.to === undefined ? score.duration : settings.to;
  const span = Math.max(0, to - from);
  let longest = 0;
  for (const name in samples) longest = Math.max(longest, samples[name].length / rate);
  const total = Math.ceil((span + (settings.trim ? 0 : longest + TAIL_SECONDS)) * rate) + 1;

  const stems = {}, pans = {}, unresolved = {}, cache = new Map();
  let rendered = 0, truncated = 0;
  for (const note of score.notes) {
    if (note.start < from || note.start >= to) continue;
    const voice = resolveVoice(kit, note.route);
    if (!voice) { unresolved[note.route] = (unresolved[note.route] || 0) + 1; continue; }
    const sample = samples[voice.sample];
    if (!sample) { unresolved[note.route] = (unresolved[note.route] || 0) + 1; continue; }
    const pitched = voice.pitched === undefined ? true : !!voice.pitched;
    const ratio = pitched
      ? pitchToHz(note.pitch, voice.transpose) / voice.rootHz
      : Math.pow(2, (voice.transpose || 0) / 12);
    const key = voice.sample + ':' + ratio.toFixed(6);
    // Keyed by the rounded ratio as render.py is, but resampled at the exact one as render.py does: the rounded ratio
    // drifts in phase over a long note, which on a bright sample cost up to −57 dB against the export (SPEC v26).
    if (!cache.has(key)) cache.set(key, resample(sample, ratio));
    const source = cache.get(key);
    if (source.length === 0) continue;

    const follow = (voice.follow && voice.follow !== 'auto') ? voice.follow : (note.isDrum ? 'sample' : 'note');
    let length = follow === 'sample' ? source.length : Math.round(note.duration * rate);
    const maxDuration = voice.maxDur || 0;
    if (maxDuration > 0) length = Math.min(length, Math.round(maxDuration * rate));
    if (length > source.length) truncated++;
    length = Math.max(1, Math.min(length, source.length));

    const grain = envelope(source.slice(0, length), (voice.fade === undefined ? 0.005 : voice.fade) * rate);
    const amplitude = (voice.gain === undefined ? 1 : voice.gain) * (note.velocity / 127);
    if (!stems[note.route]) {
      stems[note.route] = new Float32Array(total);
      pans[note.route] = Math.max(-1, Math.min(1, voice.pan || 0));
    }
    const buffer = stems[note.route];
    const start = Math.round((note.start - from) * rate);
    const end = Math.min(start + grain.length, total);
    if (end > start) {
      for (let i = start < 0 ? -start : 0; i < end - start; i++) buffer[start + i] += grain[i] * amplitude;
      rendered++;
    }
  }
  return { stems, pans, rate, rendered, truncated, unresolved, length: total };
}

function toStereo(mono, pan) {
  const angle = (Math.max(-1, Math.min(1, pan || 0)) + 1) * Math.PI / 4;
  const left = Math.cos(angle), right = Math.sin(angle);
  const out = new Float32Array(mono.length * 2);
  for (let i = 0; i < mono.length; i++) { out[i * 2] = mono[i] * left; out[i * 2 + 1] = mono[i] * right; }
  return out;
}

function mixDown(result, routeFilter) {
  const out = new Float32Array(result.length * 2);
  for (const route in result.stems) {
    if (routeFilter && !routeFilter(route)) continue;
    const mono = result.stems[route];
    const angle = (result.pans[route] + 1) * Math.PI / 4;
    const left = Math.cos(angle), right = Math.sin(angle);
    for (let i = 0; i < mono.length; i++) { out[i * 2] += mono[i] * left; out[i * 2 + 1] += mono[i] * right; }
  }
  return out;
}

function peakFactor(buffers, ceilingDb) {
  let peak = 0;
  for (const buffer of buffers) for (let i = 0; i < buffer.length; i++) {
    const value = Math.abs(buffer[i]);
    if (value > peak) peak = value;
  }
  const ceiling = Math.pow(10, (ceilingDb === undefined ? -1 : ceilingDb) / 20);
  return (peak <= ceiling || peak === 0) ? 1 : ceiling / peak;
}

const api = { DRUM_CLASSES, STEMS, MIN_DURATION, parseMidi, normaliseRoute, buildScore,
              resolveVoice, resample, envelope, renderScore, toStereo, mixDown, peakFactor, pitchToHz };
if (typeof module !== 'undefined' && module.exports) module.exports = api;
else root.Engine = api;
})(typeof globalThis !== 'undefined' ? globalThis : this);
