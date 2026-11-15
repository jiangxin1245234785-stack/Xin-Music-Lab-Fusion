'use strict';
// The loudness envelope of one stem WAV for the lane page's strip under the notes: one RMS value every 10 ms,
// quantised to 0–255 on a dB scale (−60 dBFS and below = 0, 0 dBFS = 255), so where the stem sounds and where it is
// silent can be seen without listening.
//
// Read only. The file is streamed once (never held whole in memory), the result is cached in this process by path,
// size and modification time, and nothing is written anywhere — least of all into the analysis root.
const fs = require('node:fs');
const fsp = require('node:fs/promises');

const HOP_SECONDS = 0.01;
const FLOOR_DB = -60;
const CACHE_LIMIT = 24;

// RIFF / WAVE header: PCM 16 / 24 / 32-bit integer or 32-bit float, mono or stereo (WAVE_FORMAT_EXTENSIBLE too).
async function readHeader(handle, size) {
  const head = Buffer.alloc(12);
  await handle.read(head, 0, 12, 0);
  if (head.toString('ascii', 0, 4) !== 'RIFF' || head.toString('ascii', 8, 12) !== 'WAVE') throw new Error('wav-format');
  let fmt = null, data = null;
  for (let pos = 12; pos + 8 <= size;) {
    const chunk = Buffer.alloc(8);
    await handle.read(chunk, 0, 8, pos);
    const tag = chunk.toString('ascii', 0, 4), length = chunk.readUInt32LE(4);
    if (tag === 'fmt ') {
      if (length < 16 || length > 4096) throw new Error('wav-format');
      const body = Buffer.alloc(length);
      await handle.read(body, 0, length, pos + 8);
      let code = body.readUInt16LE(0);
      if (code === 65534 && length >= 40) code = body.readUInt16LE(24);
      fmt = {code, channels: body.readUInt16LE(2), sampleRate: body.readUInt32LE(4), align: body.readUInt16LE(12), bits: body.readUInt16LE(14)};
    }
    // A data chunk written with a placeholder length (streaming writers) runs to the end of the file.
    if (tag === 'data') data = {offset: pos + 8, bytes: Math.min(length, size - pos - 8)};
    if (fmt && data) break;
    pos += 8 + length + (length % 2);
  }
  if (!fmt || !data || !(fmt.channels >= 1 && fmt.channels <= 8) || !(fmt.sampleRate >= 8000 && fmt.sampleRate <= 384000)
    || !((fmt.code === 3 && fmt.bits === 32) || (fmt.code === 1 && [16, 24, 32].includes(fmt.bits))) || fmt.align !== fmt.channels * fmt.bits / 8)
    throw new Error('wav-format');
  return {...fmt, ...data, frames: Math.floor(data.bytes / fmt.align)};
}

const toByte = meanSquare => {
  if (!(meanSquare > 0)) return 0;
  const db = 10 * Math.log10(meanSquare);
  return Math.max(0, Math.min(255, Math.round((db - FLOOR_DB) / -FLOOR_DB * 255)));
};

// Streams the data chunk and folds every hop of frames into one mean square (all channels together).
// A FLAC stem is read through its decoded float WAV in the temp cache (core/stem-audio.cjs); the size and time
// reported stay the stem's own.
async function computeEnvelope(source, {hopSeconds = HOP_SECONDS, playable = file => require('./stem-audio.cjs').sharedCache().playable(file)} = {}) {
  const stat = await fsp.stat(source);
  const file = await playable(source);
  const handle = await fsp.open(file, 'r');
  let h;
  try { h = await readHeader(handle, file === source ? stat.size : (await handle.stat()).size); } finally { await handle.close(); }
  const hop = Math.max(1, Math.round(h.sampleRate * hopSeconds));
  const values = new Uint8Array(Math.ceil(h.frames / hop));
  const bytesPerSample = h.bits / 8, perHop = hop * h.channels;
  let sum = 0, inHop = 0, out = 0, carry = null;
  const end = h.offset + h.frames * h.align - 1;
  await new Promise((resolve, reject) => {
    const stream = fs.createReadStream(file, {start: h.offset, end, highWaterMark: 1 << 20});
    stream.on('error', reject);
    stream.on('end', resolve);
    stream.on('data', piece => {
      let buffer = piece;
      if (carry) { buffer = Buffer.concat([carry, piece]); carry = null; }
      const usable = buffer.length - (buffer.length % bytesPerSample);
      if (usable < buffer.length) carry = Buffer.from(buffer.subarray(usable));
      const count = usable / bytesPerSample;
      // Samples as numbers in their file scale (the scale is applied once per hop): a typed view where the
      // alignment allows it, decoded by hand otherwise; 24-bit is always by hand.
      let samples = null, scale = 1;
      if (h.code === 3) { samples = buffer.byteOffset % 4 === 0 ? new Float32Array(buffer.buffer, buffer.byteOffset, count) : new Float32Array(Uint8Array.from(buffer.subarray(0, usable)).buffer); }
      else if (h.bits === 16) { scale = 32768; samples = buffer.byteOffset % 2 === 0 ? new Int16Array(buffer.buffer, buffer.byteOffset, count) : new Int16Array(Uint8Array.from(buffer.subarray(0, usable)).buffer); }
      else if (h.bits === 32) { scale = 2147483648; samples = buffer.byteOffset % 4 === 0 ? new Int32Array(buffer.buffer, buffer.byteOffset, count) : new Int32Array(Uint8Array.from(buffer.subarray(0, usable)).buffer); }
      const norm = 1 / (scale * scale);
      if (samples) {
        for (let i = 0; i < count; i += 1) {
          const v = samples[i];
          if (v === v) sum += v * v;   // NaN-safe for float files
          if (++inHop === perHop) { values[out++] = toByte(sum * norm / perHop); sum = 0; inHop = 0; }
        }
      } else {
        const n24 = 1 / (8388608 * 8388608);
        for (let i = 0, at = 0; i < count; i += 1, at += 3) {
          let v = buffer[at] | (buffer[at + 1] << 8) | (buffer[at + 2] << 16);
          if (v & 0x800000) v -= 0x1000000;
          sum += v * v;
          if (++inHop === perHop) { values[out++] = toByte(sum * n24 / perHop); sum = 0; inHop = 0; }
        }
      }
    });
  });
  const fullScale = h.code === 3 ? 1 : 2 ** (h.bits - 1);
  if (inHop > 0 && out < values.length) values[out++] = toByte(sum / (fullScale * fullScale) / inHop);
  return {hop: hop / h.sampleRate, sampleRate: h.sampleRate, duration: h.frames / h.sampleRate, values: out === values.length ? values : values.subarray(0, out),
    floorDb: FLOOR_DB, size: stat.size, mtimeMs: stat.mtimeMs};
}

// Memory-only cache keyed by path + size + mtime; concurrent requests for one file share one read.
function createStemEnvelopes({compute = computeEnvelope} = {}) {
  const cache = new Map(), pending = new Map();
  async function envelope(file) {
    if (typeof file !== 'string' || !file) return {ok: false, error: 'envelope-no-file'};
    let stat;
    try { stat = await fsp.stat(file); } catch (_) { return {ok: false, error: 'envelope-missing'}; }
    if (!stat.isFile()) return {ok: false, error: 'envelope-missing'};
    const key = JSON.stringify([file, stat.size, stat.mtimeMs]);
    if (cache.has(key)) { const hit = cache.get(key); cache.delete(key); cache.set(key, hit); return {ok: true, cached: true, ...hit}; }
    if (!pending.has(key)) pending.set(key, compute(file).finally(() => pending.delete(key)));
    try {
      const value = await pending.get(key);
      cache.set(key, value);
      while (cache.size > CACHE_LIMIT) cache.delete(cache.keys().next().value);
      return {ok: true, cached: false, ...value};
    } catch (error) {
      return {ok: false, error: /^wav-/.test(error?.message || '') ? error.message : 'envelope-failed'};
    }
  }
  return {envelope, size: () => cache.size};
}

module.exports = {HOP_SECONDS, FLOOR_DB, readHeader, computeEnvelope, createStemEnvelopes, toByte};
