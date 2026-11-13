/* Diff the JS port against pretty_midi and memesynth on real data.
 *
 * Two checks, because a renderer can be right about every sample and still be fed the
 * wrong notes: first the parser's note table against pretty_midi's for all 31 exports,
 * then one full render sample by sample against memesynth's own output. */
'use strict';
const fs = require('fs');
const path = require('path');
const Engine = require('../engine.js');

// `node verify_engine.js [<目录>]`: the folder dump_reference.py wrote into (default tests/, i.e. tests/ref/).
const refDir = process.argv[2] ? path.resolve(process.argv[2]) : path.join(__dirname, 'ref');
const repo = path.resolve(__dirname, '../../../..');

function readWavFloat(file) {
  const buffer = fs.readFileSync(file);
  let at = 12, fmt = null, data = null;
  while (at + 8 <= buffer.length) {
    const id = buffer.toString('ascii', at, at + 4);
    const size = buffer.readUInt32LE(at + 4);
    if (id === 'fmt ') fmt = { format: buffer.readUInt16LE(at + 8), channels: buffer.readUInt16LE(at + 10),
                               rate: buffer.readUInt32LE(at + 12), bits: buffer.readUInt16LE(at + 22) };
    if (id === 'data') data = buffer.subarray(at + 8, at + 8 + size);
    at += 8 + size + (size % 2);
  }
  if (!fmt || !data) throw new Error('bad wav: ' + file);
  if (fmt.bits === 32 && fmt.format === 3) {
    const out = new Float32Array(data.byteLength / 4);
    for (let i = 0; i < out.length; i++) out[i] = data.readFloatLE(i * 4);
    return { audio: out, ...fmt };
  }
  if (fmt.bits === 16) {
    const out = new Float32Array(data.byteLength / 2);
    for (let i = 0; i < out.length; i++) out[i] = data.readInt16LE(i * 2) / 32768;
    return { audio: out, ...fmt };
  }
  if (fmt.bits === 24) {
    const out = new Float32Array(Math.floor(data.byteLength / 3));
    for (let i = 0; i < out.length; i++) {
      const value = data.readUIntLE(i * 3, 3);
      out[i] = (value & 0x800000 ? value - 0x1000000 : value) / 8388608;
    }
    return { audio: out, ...fmt };
  }
  throw new Error(`unsupported wav ${fmt.bits}bit format ${fmt.format}`);
}

/* --- 1. parser vs pretty_midi ---------------------------------------------- */
const reference = JSON.parse(fs.readFileSync(path.join(refDir, 'notes_reference.json'), 'utf8'));
let files = 0, notes = 0, bad = 0, worstNoteTime = 0;
for (const [relative, expected] of Object.entries(reference)) {
  const buffer = fs.readFileSync(path.isAbsolute(relative) ? relative : path.join(repo, relative));
  const midi = Engine.parseMidi(buffer.buffer.slice(buffer.byteOffset, buffer.byteOffset + buffer.byteLength));
  const rows = [];
  for (const track of midi.tracks) {
    for (const note of track.notes) {
      rows.push([track.name || '', track.isDrum ? 1 : 0, Number(note.start.toFixed(6)),
                 Number(note.end.toFixed(6)), note.pitch, note.velocity]);
    }
  }
  // Identity on (name, drum, pitch, velocity) and on time to within a tenth of a
  // millisecond. Exact decimal equality would fail on 1 us of float rounding in the
  // tick-to-seconds accumulation, which is a fiftieth of one sample at 48 kHz.
  const key = r => `${r[0]}|${r[1]}|${r[4]}|${r[5]}`;
  const order = (a, b) => (key(a) < key(b) ? -1 : key(a) > key(b) ? 1 : a[2] - b[2]);
  rows.sort(order);
  const want = expected.slice().sort(order);
  files++; notes += want.length;
  let worstTime = 0, mismatched = want.length !== rows.length;
  if (!mismatched) {
    for (let i = 0; i < want.length; i++) {
      if (key(want[i]) !== key(rows[i])) { mismatched = true; break; }
      worstTime = Math.max(worstTime, Math.abs(want[i][2] - rows[i][2]), Math.abs(want[i][3] - rows[i][3]));
    }
  }
  if (mismatched || worstTime > 1e-4) {
    bad++;
    if (bad <= 3) console.log(`  MISMATCH ${relative}\n    counts ${want.length} vs ${rows.length}, ` +
                              `worst time diff ${worstTime.toExponential(2)}s`);
  }
  worstNoteTime = Math.max(worstNoteTime, worstTime);
}
console.log(`parser: ${files - bad}/${files} files match pretty_midi (${notes} notes, ` +
            `worst time difference ${(worstNoteTime * 1e6).toFixed(1)} us = ` +
            `${(worstNoteTime * 48000).toFixed(3)} samples @48k)`);

/* --- 2. renderer vs memesynth ----------------------------------------------- */
const meta = JSON.parse(fs.readFileSync(path.join(refDir, 'render_reference.json'), 'utf8'));
const kitJson = JSON.parse(fs.readFileSync(meta.kit, 'utf8'));
const kitDir = path.dirname(meta.kit);
const samples = {};
for (const [name, entry] of Object.entries(kitJson.samples)) {
  samples[name] = readWavFloat(path.join(kitDir, entry.file)).audio;
}
const voices = {};
for (const [route, voice] of Object.entries(kitJson.voices)) {
  voices[Engine.normaliseRoute(route)] = { ...voice, rootHz: kitJson.samples[voice.sample].rootHz };
}
const midiBuffer = fs.readFileSync(meta.midi);
const midi = Engine.parseMidi(midiBuffer.buffer.slice(midiBuffer.byteOffset, midiBuffer.byteOffset + midiBuffer.byteLength));
const score = Engine.buildScore(midi);
const result = Engine.renderScore(score, { voices }, samples, 48000);
const mix = Engine.mixDown(result);
// memesynth measures the ceiling over the mix AND every panned stem, because a stem can
// peak higher than the sum when panning or cancellation pulls the mix down.
const stereoStems = Object.keys(result.stems).map(route => Engine.toStereo(result.stems[route], result.pans[route]));
const factor = Engine.peakFactor([mix, ...stereoStems], -1);
for (let i = 0; i < mix.length; i++) mix[i] *= factor;

const expectedWav = readWavFloat(path.join(refDir, 'render_reference.wav'));
const n = Math.min(mix.length, expectedWav.audio.length);
let worst = 0, sumSq = 0, refSq = 0;
for (let i = 0; i < n; i++) {
  const diff = Math.abs(mix[i] - expectedWav.audio[i]);
  if (diff > worst) worst = diff;
  sumSq += diff * diff; refSq += expectedWav.audio[i] * expectedWav.audio[i];
}
const db = v => 20 * Math.log10(Math.max(v, 1e-12));
console.log(`renderer: notes ${result.rendered} vs ${meta.rendered}, truncated ${result.truncated} vs ${meta.truncated}`);
console.log(`          factor ${factor.toFixed(6)} vs ${meta.factor.toFixed(6)}`);
console.log(`          frames ${mix.length / 2} vs ${meta.frames}  (compared ${n / 2})`);
console.log(`          worst sample diff ${worst.toExponential(2)} (${db(worst).toFixed(1)} dBFS), ` +
            `error ${db(Math.sqrt(sumSq / n)).toFixed(1)} dBFS vs signal ${db(Math.sqrt(refSq / n)).toFixed(1)} dBFS`);

// Not bit-exact, and cannot be: numpy scales each grain in float32 before accumulating,
// while JS multiplies in float64 and rounds once on the store. What matters is that the
// two agree far below audibility, with the same notes placed and the same ones truncated.
const signalToError = db(Math.sqrt(refSq / n)) - db(Math.sqrt(sumSq / n));
console.log(`          signal-to-error ${signalToError.toFixed(1)} dB`);
const ok = bad === 0 && result.rendered === meta.rendered
  && result.truncated === meta.truncated && signalToError > 55
  && Math.abs(factor - meta.factor) / meta.factor < 1e-4;
console.log(ok ? '\nOK: the JS port matches the Python pipeline below audibility.' : '\nFAIL: the port diverges.');
process.exit(ok ? 0 : 1);
