'use strict';
// core/stem-envelope.cjs on synthetic WAVs: silence reads 0, a known sine reads its dB, 16 / 24-bit integer and
// 32-bit float agree, the hop is 10 ms, a placeholder data length is tolerated, the cache keys on size + mtime, a
// missing file is a quiet failure, and an 8-minute stereo stem is done in about a second without being held whole.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const {computeEnvelope, createStemEnvelopes, toByte, HOP_SECONDS} = require('../core/stem-envelope.cjs');

const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'xld-envelope-test-'));
function wav(name, {rate = 44100, channels = 2, bits = 16, float = false, seconds, signal, placeholder = false}) {
  const frames = Math.round(rate * seconds), align = channels * bits / 8;
  const data = Buffer.alloc(frames * align);
  for (let i = 0; i < frames; i += 1) {
    const v = signal(i / rate);
    for (let c = 0; c < channels; c += 1) {
      const at = i * align + c * bits / 8;
      if (float) data.writeFloatLE(v, at);
      else if (bits === 16) data.writeInt16LE(Math.max(-32768, Math.min(32767, Math.round(v * 32767))), at);
      else if (bits === 24) data.writeIntLE(Math.max(-8388608, Math.min(8388607, Math.round(v * 8388607))), at, 3);
      else data.writeInt32LE(Math.round(v * 2147483647), at);
    }
  }
  const head = Buffer.alloc(44);
  head.write('RIFF', 0); head.writeUInt32LE(36 + data.length, 4); head.write('WAVE', 8);
  head.write('fmt ', 12); head.writeUInt32LE(16, 16); head.writeUInt16LE(float ? 3 : 1, 20); head.writeUInt16LE(channels, 22);
  head.writeUInt32LE(rate, 24); head.writeUInt32LE(rate * align, 28); head.writeUInt16LE(align, 32); head.writeUInt16LE(bits, 34);
  head.write('data', 36); head.writeUInt32LE(placeholder ? 0xffffffff : data.length, 40);
  const file = path.join(dir, name);
  fs.writeFileSync(file, Buffer.concat([head, data]));
  return file;
}
// one second of silence, one second of a 0.5-amplitude 440 Hz sine, half a second of silence
const shape = t => (t >= 1 && t < 2 ? 0.5 * Math.sin(2 * Math.PI * 440 * t) : 0);
const sineByte = toByte(0.125);   // mean square of a 0.5 sine = 0.125, about −9 dBFS

(async () => {
  try {
    assert.equal(toByte(0), 0); assert.equal(toByte(1), 255); assert.equal(toByte(1e-7), 0, '−70 dB is below the floor');
    for (const [name, options] of [['s16.wav', {bits: 16}], ['s24.wav', {bits: 24, channels: 1}], ['f32.wav', {bits: 32, float: true}], ['s32.wav', {bits: 32, rate: 48000}]]) {
      const file = wav(name, {seconds: 2.5, signal: shape, ...options});
      const e = await computeEnvelope(file);
      const rate = options.rate || 44100;
      assert.equal(Math.abs(e.hop - Math.round(rate * HOP_SECONDS) / rate) < 1e-9, true, name + ': 10 ms hop');
      assert.equal(e.values.length, 250, name + ': 2.5 s = 250 values');
      assert.equal(Math.max(...e.values.slice(0, 99)), 0, name + ': silence is 0');
      assert.equal(Math.max(...e.values.slice(201)), 0, name + ': silence after the tone is 0');
      const tone = e.values.slice(102, 198);
      assert(tone.every(v => Math.abs(v - sineByte) <= 2), name + ': the tone reads its level: ' + Math.min(...tone) + '..' + Math.max(...tone) + ' vs ' + sineByte);
      assert(e.values[100] > 150 && e.values[100] <= sineByte + 2, name + ': the onset lands in the right 10 ms');
    }
    // a streaming writer's placeholder data length runs to the end of the file
    const open = wav('open.wav', {seconds: 2.5, signal: shape, placeholder: true});
    assert.equal((await computeEnvelope(open)).values.length, 250, 'placeholder data length');

    // cache: memory only, keyed by path + size + mtime; concurrent calls share one read; a missing file is quiet
    let computed = 0;
    const store = createStemEnvelopes({compute: async file => { computed += 1; return computeEnvelope(file); }});
    const file = path.join(dir, 's16.wav');
    const [a, b] = await Promise.all([store.envelope(file), store.envelope(file)]);
    assert(a.ok && b.ok && computed === 1, 'two requests at once read the file once');
    assert.equal((await store.envelope(file)).cached, true, 'then it comes from memory');
    const later = new Date(Date.now() + 5000);
    fs.utimesSync(file, later, later);
    assert.equal((await store.envelope(file)).cached, false, 'a changed modification time reads it again');
    assert.equal(computed, 2);
    const before = fs.readdirSync(dir).sort().join();
    assert.deepEqual(await store.envelope(path.join(dir, 'nope.wav')), {ok: false, error: 'envelope-missing'}, 'no file: a quiet failure');
    fs.writeFileSync(path.join(dir, 'bad.wav'), 'not a wav');
    assert.deepEqual(await store.envelope(path.join(dir, 'bad.wav')), {ok: false, error: 'wav-format'});
    assert.equal(fs.readdirSync(dir).filter(name => name !== 'bad.wav').sort().join(), before, 'nothing is written next to the WAV');

    // an 8-minute stereo 16-bit stem (about 85 MB)
    const long = wav('long.wav', {seconds: 480, signal: t => 0.3 * Math.sin(2 * Math.PI * 110 * t)});
    const heap = process.memoryUsage().arrayBuffers;
    const started = process.hrtime.bigint();
    const e = await computeEnvelope(long);
    const ms = Number(process.hrtime.bigint() - started) / 1e6;
    assert.equal(e.values.length, 48000, '8 minutes = 48000 values');
    assert(ms < 2500, 'an 8-minute stem in about a second (measured ' + Math.round(ms) + ' ms)');
    assert(process.memoryUsage().arrayBuffers - heap < 40 * 1024 * 1024, 'streamed, not read whole');
    console.log(`stem-envelope: ok (silence 0, a −9 dB sine at ${sineByte}, 16/24/32-bit and float agree, 10 ms hop, placeholder length, memory cache on size + mtime, quiet failures, 8 min stereo in ${Math.round(ms)} ms)`);
  } finally {
    fs.rmSync(dir, {recursive: true, force: true});
  }
})().catch(error => { console.error(error); process.exitCode = 1; });
