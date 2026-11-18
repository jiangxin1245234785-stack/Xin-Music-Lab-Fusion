'use strict';
// Stem audio in either of the two formats the analysis root holds (2026-11-15, audit fix 2):
//   - 32-bit float WAV, as every stem and refinement file was written before;
//   - 24-bit FLAC written at half level, marked inside the file with the Vorbis comment `comment=xld-gain=2`
//     (and in the manifests as `encoding: 'flac-24', gain: 2`): a float stem may go above full scale, 24-bit
//     integers cannot, so the samples are halved before writing and doubled again by every reader.
//
// Analysis and export ask `playable(file)` for a float WAV:
// the file itself when it already is one, otherwise a decoded copy (gain applied) in a size-capped cache in the
// system temp folder - never in the analysis root. The existing WAV readers (mix-audio, stem-envelope) are left as
// they were. Plain file:// links to marked FLACs also serve gain-restored WAVs.
// For XML listening, registered links serve the compressed recording and pass its gain to the output graph.
//
// The decoder is plain JavaScript (FLAC subset that libFLAC writes: fixed / LPC / constant / verbatim subframes,
// Rice residuals, the four stereo modes, wasted bits), frame CRC-16 checked; it runs in a worker thread so the main
// process stays responsive while a song is decoded.
const fs = require('node:fs');
const fsp = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const crypto = require('node:crypto');
const {Worker, isMainThread, parentPort, workerData} = require('node:worker_threads');
const {fileURLToPath} = require('node:url');

const GAIN_KEY = 'xld-gain';
const FLAC_GAIN = 2;
const ENCODING_FLAC = 'flac-24';
const DEFAULT_LIMIT = 3 * 1024 ** 3;
const RECENT_MS = 30 * 60 * 1000;

const isFlacPath = file => /\.flac$/i.test(String(file || ''));

// --- FLAC metadata ----------------------------------------------------------------------------------------------
function parseInfo(buffer) {
  if (buffer.length < 42 || buffer.toString('latin1', 0, 4) !== 'fLaC') throw new Error('flac-format');
  let pos = 4, info = null, gain = 1, last = false;
  const comments = {};
  while (!last) {
    if (pos + 4 > buffer.length) throw new Error('flac-truncated');
    const head = buffer[pos];
    last = Boolean(head & 0x80);
    const type = head & 0x7f, length = buffer.readUIntBE(pos + 1, 3);
    const body = pos + 4;
    if (body + length > buffer.length) throw new Error('flac-truncated');
    if (type === 0) {
      const b = buffer.subarray(body, body + length);
      const sampleRate = (b[10] << 12) | (b[11] << 4) | (b[12] >> 4);
      const channels = ((b[12] >> 1) & 7) + 1;
      const bits = (((b[12] & 1) << 4) | (b[13] >> 4)) + 1;
      const frames = (b[13] & 15) * 2 ** 32 + b.readUInt32BE(14);
      info = {sampleRate, channels, bits, frames, minBlock: b.readUInt16BE(0), maxBlock: b.readUInt16BE(2)};
    } else if (type === 4) {
      let at = body;
      const vendor = buffer.readUInt32LE(at); at += 4 + vendor;
      const count = buffer.readUInt32LE(at); at += 4;
      for (let i = 0; i < count && at + 4 <= body + length; i++) {
        const n = buffer.readUInt32LE(at); at += 4;
        const text = buffer.toString('utf8', at, at + n); at += n;
        const eq = text.indexOf('=');
        if (eq > 0) comments[text.slice(0, eq).toLowerCase()] = text.slice(eq + 1);
      }
    }
    pos = body + length;
  }
  if (!info) throw new Error('flac-format');
  const marked = /^xld-gain=(\d+(?:\.\d+)?)$/.exec(String(comments.comment || '').trim());
  if (marked) gain = Number(marked[1]);
  if (!(info.sampleRate >= 8000 && info.sampleRate <= 384000) || !(info.bits >= 8 && info.bits <= 32) || !(gain > 0 && gain <= 16))
    throw new Error('flac-format');
  return {...info, gain, marked: Boolean(marked), audioOffset: pos, comments};
}

async function readFlacInfo(file) {
  const handle = await fsp.open(file, 'r');
  try {
    const size = (await handle.stat()).size;
    let length = Math.min(size, 65536);
    for (;;) {
      const buffer = Buffer.alloc(length);
      await handle.read(buffer, 0, length, 0);
      try { return parseInfo(buffer); }
      catch (error) { if (error.message !== 'flac-truncated' || length >= size) throw error; length = Math.min(size, length * 4); }
    }
  } finally { await handle.close(); }
}

// --- FLAC frames ------------------------------------------------------------------------------------------------
const CRC16 = new Uint16Array(256);
for (let i = 0; i < 256; i++) { let c = i << 8; for (let k = 0; k < 8; k++) c = c & 0x8000 ? ((c << 1) ^ 0x8005) & 0xffff : (c << 1) & 0xffff; CRC16[i] = c; }
const SAMPLE_BITS = [0, 8, 12, 0, 16, 20, 24, 32];

// Calls onBlock(channels: Int32Array[], length) for every frame, in order. Returns the number of frames decoded.
function decodeFrames(buffer, info, onBlock) {
  const d = buffer;
  const end = d.length;
  let p = info.audioOffset * 8;
  const peek = () => {
    const b = p >>> 3, o = p & 7;
    const w = ((d[b] << 24) | (d[b + 1] << 16) | (d[b + 2] << 8) | d[b + 3]) >>> 0;
    return o ? ((w << o) | (d[b + 4] >>> (8 - o))) >>> 0 : w;
  };
  const read = n => { if (n === 0) return 0; const v = peek() >>> (32 - n); p += n; return v; };
  const signed = n => { if (n === 0) return 0; const v = read(n); return n === 32 ? v | 0 : (v << (32 - n)) >> (32 - n); };
  const unary = () => { let q = 0; for (;;) { const w = peek(); if (w) { const z = Math.clz32(w); p += z + 1; return q + z; } q += 32; p += 32; if ((p >>> 3) > end) throw new Error('flac-truncated'); } };
  const maxBlock = Math.max(info.maxBlock || 0, 65536);
  const channels = Array.from({length: Math.max(2, info.channels)}, () => new Int32Array(maxBlock));
  const coef = new Float64Array(32);

  function residual(n, order, s) {
    const method = read(2);
    if (method > 1) throw new Error('flac-format');
    const paramBits = method === 0 ? 4 : 5, escape = method === 0 ? 15 : 31;
    const partitionOrder = read(4), partitions = 1 << partitionOrder, per = n >>> partitionOrder;
    let i = order;
    for (let part = 0; part < partitions; part++) {
      const count = part === 0 ? per - order : per;
      const k = read(paramBits);
      if (k === escape) {
        const width = read(5);
        for (let j = 0; j < count; j++) s[i++] = width ? signed(width) : 0;
        continue;
      }
      const scale = 2 ** k;
      for (let j = 0; j < count; j++) {
        let q = 0, w = peek();
        while (w === 0) { q += 32; p += 32; w = peek(); if ((p >>> 3) > end) throw new Error('flac-truncated'); }
        const z = Math.clz32(w); q += z; p += z + 1;
        let u = q;
        if (k) { u = q * scale + (peek() >>> (32 - k)); p += k; }
        s[i++] = u % 2 ? -(u + 1) / 2 : u / 2;
      }
    }
  }

  function subframe(bits, n, s) {
    if (read(1)) throw new Error('flac-format');
    const type = read(6);
    let wasted = 0;
    if (read(1)) wasted = unary() + 1;
    bits -= wasted;
    if (type === 0) { const v = signed(bits); for (let i = 0; i < n; i++) s[i] = v; }
    else if (type === 1) { for (let i = 0; i < n; i++) s[i] = signed(bits); }
    else if (type >= 8 && type <= 12) {
      const order = type - 8;
      for (let i = 0; i < order; i++) s[i] = signed(bits);
      residual(n, order, s);
      if (order === 1) for (let i = 1; i < n; i++) s[i] += s[i - 1];
      else if (order === 2) for (let i = 2; i < n; i++) s[i] += 2 * s[i - 1] - s[i - 2];
      else if (order === 3) for (let i = 3; i < n; i++) s[i] += 3 * s[i - 1] - 3 * s[i - 2] + s[i - 3];
      else if (order === 4) for (let i = 4; i < n; i++) s[i] += 4 * s[i - 1] - 6 * s[i - 2] + 4 * s[i - 3] - s[i - 4];
    } else if (type >= 32) {
      const order = (type & 31) + 1;
      for (let i = 0; i < order; i++) s[i] = signed(bits);
      const precision = read(4) + 1;
      if (precision === 16) throw new Error('flac-format');
      const shift = signed(5);
      for (let j = 0; j < order; j++) coef[j] = signed(precision);
      residual(n, order, s);
      const div = 2 ** shift;
      for (let i = order; i < n; i++) {
        let sum = 0;
        for (let j = 0; j < order; j++) sum += coef[j] * s[i - 1 - j];
        s[i] += shift >= 0 ? Math.floor(sum / div) : sum * 2 ** -shift;
      }
    } else throw new Error('flac-format');
    if (wasted) for (let i = 0; i < n; i++) s[i] <<= wasted;
  }

  let total = 0;
  while (p + 16 <= end * 8 && total < info.frames) {
    p = (p + 7) & ~7;
    const start = p >>> 3;
    if (read(14) !== 0x3ffe) throw new Error('flac-sync');
    read(2);
    const blockCode = read(4), rateCode = read(4), assignment = read(4), sizeCode = read(3);
    read(1);
    const first = read(8);
    let extra = 0;
    if (first & 0x80) { extra = Math.clz32((~(first << 24)) >>> 0) - 1; if (extra < 1 || extra > 6) throw new Error('flac-format'); }
    for (let i = 0; i < extra; i++) read(8);
    let n;
    if (blockCode === 1) n = 192;
    else if (blockCode >= 2 && blockCode <= 5) n = 576 << (blockCode - 2);
    else if (blockCode === 6) n = read(8) + 1;
    else if (blockCode === 7) n = read(16) + 1;
    else if (blockCode >= 8) n = 256 << (blockCode - 8);
    else throw new Error('flac-format');
    if (rateCode === 12) read(8); else if (rateCode === 13 || rateCode === 14) read(16); else if (rateCode === 15) throw new Error('flac-format');
    read(8);
    const bits = sizeCode === 0 ? info.bits : SAMPLE_BITS[sizeCode];
    if (!bits || n > maxBlock) throw new Error('flac-format');
    const count = assignment < 8 ? assignment + 1 : 2;
    if (assignment > 10 || count !== info.channels) throw new Error('flac-format');
    for (let c = 0; c < count; c++) {
      const side = (assignment === 8 && c === 1) || (assignment === 9 && c === 0) || (assignment === 10 && c === 1);
      subframe(bits + (side ? 1 : 0), n, channels[c]);
    }
    const a = channels[0], b = channels[1];
    if (assignment === 8) for (let i = 0; i < n; i++) b[i] = a[i] - b[i];
    else if (assignment === 9) for (let i = 0; i < n; i++) a[i] += b[i];
    else if (assignment === 10) for (let i = 0; i < n; i++) { const side = b[i], mid = a[i] * 2 + (side & 1); a[i] = (mid + side) >> 1; b[i] = (mid - side) >> 1; }
    p = (p + 7) & ~7;
    const crcEnd = p >>> 3;
    let crc = 0;
    for (let i = start; i < crcEnd; i++) crc = ((crc << 8) & 0xffff) ^ CRC16[(crc >> 8) ^ d[i]];
    if (read(16) !== crc) throw new Error('flac-crc');
    const take = Math.min(n, info.frames - total);
    onBlock(channels, take);
    total += take;
  }
  if (total !== info.frames) throw new Error('flac-truncated');
  return total;
}

// --- float WAV ----------------------------------------------------------------------------------------------------
function wavHeader(frames, channels, sampleRate) {
  const bytes = frames * channels * 4;
  const h = Buffer.alloc(58);
  h.write('RIFF', 0, 'latin1'); h.writeUInt32LE(50 + bytes, 4); h.write('WAVE', 8, 'latin1');
  h.write('fmt ', 12, 'latin1'); h.writeUInt32LE(18, 16); h.writeUInt16LE(3, 20); h.writeUInt16LE(channels, 22);
  h.writeUInt32LE(sampleRate, 24); h.writeUInt32LE(sampleRate * channels * 4, 28); h.writeUInt16LE(channels * 4, 32);
  h.writeUInt16LE(32, 34); h.writeUInt16LE(0, 36);
  h.write('fact', 38, 'latin1'); h.writeUInt32LE(4, 42); h.writeUInt32LE(frames, 46);
  h.write('data', 50, 'latin1'); h.writeUInt32LE(bytes, 54);
  return h;
}

// Decodes a FLAC into a float WAV at `target` (written next to it, then renamed), gain applied. Synchronous: it is
// what the worker runs. Returns {frames, channels, sampleRate, gain}.
function decodeToWavSync(source, target) {
  const buffer = fs.readFileSync(source);
  const info = parseInfo(buffer);
  const temporary = target + '.' + crypto.randomUUID() + '.partial';
  const fd = fs.openSync(temporary, 'w');
  try {
    fs.writeSync(fd, wavHeader(info.frames, info.channels, info.sampleRate));
    const scale = info.gain / 2 ** (info.bits - 1);
    const chunk = new Float32Array(65536 * info.channels);
    const out = Buffer.from(chunk.buffer);
    decodeFrames(buffer, info, (channels, n) => {
      for (let start = 0; start < n; start += 65536) {
        const m = Math.min(65536, n - start);
        for (let i = 0; i < m; i++) for (let c = 0; c < info.channels; c++) chunk[i * info.channels + c] = channels[c][start + i] * scale;
        fs.writeSync(fd, out, 0, m * info.channels * 4);
      }
    });
  } catch (error) {
    fs.closeSync(fd); fs.rmSync(temporary, {force: true});
    throw error;
  }
  fs.closeSync(fd);
  fs.renameSync(temporary, target);
  return {frames: info.frames, channels: info.channels, sampleRate: info.sampleRate, gain: info.gain};
}

// The whole file as Float32Array per channel, gain applied (tests and small files; a stem is ~200 MB this way).
function decodeFlacSync(source) {
  const buffer = fs.readFileSync(source);
  const info = parseInfo(buffer);
  const scale = info.gain / 2 ** (info.bits - 1);
  const data = Array.from({length: info.channels}, () => new Float32Array(info.frames));
  let at = 0;
  decodeFrames(buffer, info, (channels, n) => { for (let c = 0; c < info.channels; c++) for (let i = 0; i < n; i++) data[c][at + i] = channels[c][i] * scale; at += n; });
  return {...info, data};
}

if (!isMainThread && workerData?.stemAudioTask === 'decode') {
  try { parentPort.postMessage({ok: true, ...decodeToWavSync(workerData.source, workerData.target)}); }
  catch (error) { parentPort.postMessage({ok: false, error: error.message}); }
}

const decodeInWorker = (source, target) => new Promise((resolve, reject) => {
  const worker = new Worker(__filename, {workerData: {stemAudioTask: 'decode', source, target}});
  worker.once('message', message => message.ok ? resolve(message) : reject(new Error(message.error)));
  worker.once('error', reject);
  worker.once('exit', code => { if (code !== 0) reject(new Error('stem-decode-exited')); });
});

// --- what a file is -------------------------------------------------------------------------------------------
// {format: 'wav'|'flac', frames, channels, sampleRate, bits, float (wav only), gain, marked (flac only)}
async function probe(file) {
  if (isFlacPath(file)) {
    const info = await readFlacInfo(file);
    return {format: 'flac', frames: info.frames, channels: info.channels, sampleRate: info.sampleRate, bits: info.bits, gain: info.gain, marked: info.marked, float: false};
  }
  const handle = await fsp.open(file, 'r');
  try {
    const h = await require('./mix-audio.cjs').header(handle, (await handle.stat()).size);
    return {format: 'wav', frames: h.frames, channels: h.channels, sampleRate: h.sampleRate, bits: h.bits, gain: 1, float: h.code === 3 && h.bits === 32};
  } finally { await handle.close(); }
}
// A stem or refinement file in one of the two formats the analysis root holds.
const isStemFormat = info => Boolean(info && ((info.format === 'wav' && info.float) || (info.format === 'flac' && info.bits === 24 && info.marked && info.gain === FLAC_GAIN)));

// --- decode cache -------------------------------------------------------------------------------------------------
function createStemCache({dir = path.join(os.tmpdir(), 'xin-stem-cache'), limitBytes = DEFAULT_LIMIT, decode = decodeInWorker, now = Date.now} = {}) {
  const pending = new Map(), lastUsed = new Map();
  const blockedSources = new Map();
  const blockedKey = file => path.resolve(file).toLowerCase();
  function suspend(files) {
    const keys=[...new Set(files.map(blockedKey))];
    for(const key of keys)blockedSources.set(key,(blockedSources.get(key)||0)+1);
    let resumed=false;return ()=>{if(resumed)return;resumed=true;for(const key of keys){const count=(blockedSources.get(key)||0)-1;if(count>0)blockedSources.set(key,count);else blockedSources.delete(key);}};
  }
  const keyFor = (file, stat) => crypto.createHash('sha256').update(JSON.stringify([path.resolve(file).toLowerCase(), stat.size, Math.round(stat.mtimeMs)])).digest('hex');
  async function evict(keep) {
    let entries = [];
    try {
      for (const name of await fsp.readdir(dir)) {
        if (!/^[a-f0-9]{64}\.wav$/.test(name)) continue;
        const file = path.join(dir, name);
        // Last use: when this process last handed the copy out, else when it was made (files are never touched, so a
        // reader's size + time check on the copy stays valid).
        try { const stat = await fsp.stat(file); entries.push({file, size: stat.size, used: Math.max(stat.mtimeMs, lastUsed.get(file) || 0)}); } catch (_) {}
      }
    } catch (_) { return; }
    let total = entries.reduce((sum, e) => sum + e.size, 0);
    entries.sort((a, b) => a.used - b.used);
    for (const e of entries) {
      if (total <= limitBytes) break;
      if (e.file === keep || now() - e.used < RECENT_MS) continue;
      try { await fsp.rm(e.file); total -= e.size; } catch (_) {}
    }
  }
  // The float WAV to read for `file`: the file itself for a WAV, a decoded copy for a FLAC.
  async function playable(file) {
    if (!isFlacPath(file)) return file;
    if(blockedSources.has(blockedKey(file)))throw Error('stem-source-removing');
    const stat = await fsp.stat(file);
    if(blockedSources.has(blockedKey(file)))throw Error('stem-source-removing');
    const target = path.join(dir, keyFor(file, stat) + '.wav');
    try { await fsp.access(target); lastUsed.set(target, now()); return target; } catch (_) {}
    if (!pending.has(target)) {
      pending.set(target, (async () => {
        await fsp.mkdir(dir, {recursive: true});
        await decode(path.resolve(file), target);
        lastUsed.set(target, now());
        await evict(target);
        return target;
      })().finally(() => pending.delete(target)));
    }
    return pending.get(target);
  }
  return {playable, dir, evict, busy: () => pending.size > 0, suspend};
}
let shared = null;
const sharedCache = options => shared || (shared = createStemCache(options));

// --- file:// for the renderers --------------------------------------------------------------------------------------
const AUDIO_TYPES = {'.wav': 'audio/wav', '.flac': 'audio/flac', '.mp3': 'audio/mpeg', '.m4a': 'audio/mp4', '.aac': 'audio/aac', '.ogg': 'audio/ogg', '.opus': 'audio/ogg'};
const XML_STEM_QUERY = 'xin-xml-stem';

function createXmlStemPlayback() {
  const files = new Map();
  const signature = stat => stat.size + ':' + stat.mtimeMs;
  async function describe(stem) {
    try {
      const url = new URL(stem.audioUrl);
      if (url.protocol !== 'file:' || url.search || url.hash) return stem;
      const file = fileURLToPath(url);
      if (!isFlacPath(file)) return stem;
      const stamp = signature(await fsp.stat(file));
      let entry = files.get(file);
      if (entry?.stamp !== stamp) {
        const info = await readFlacInfo(file);
        // A migrated file carries its scale in the FLAC itself, including extracted strings and winds.
        // Other encodings keep their existing file handler and gain.
        if (!info.marked || info.gain !== FLAC_GAIN || info.bits !== 24) return stem;
        entry = files.get(file);
        if (entry?.stamp !== stamp) {
          entry = {stamp, key: crypto.randomUUID()};
          files.set(file, entry);
        }
      }
      url.searchParams.set(XML_STEM_QUERY, entry.key);
      return {...stem, playbackUrl:url.href, playbackGain:FLAC_GAIN};
    } catch (_) { return stem; }
  }
  async function matches(file, key) {
    const entry = files.get(file);
    return Boolean(entry && entry.key === key && entry.stamp === signature(await fsp.stat(file)));
  }
  return {describe, matches};
}
async function rangeResponse(file, range, type = 'audio/wav') {
  const {Readable} = require('node:stream');
  const size = (await fsp.stat(file)).size;
  let start = 0, end = size - 1, status = 200;
  const m = /^bytes=(\d*)-(\d*)$/.exec(String(range || '').trim());
  if (m && (m[1] || m[2])) {
    if (m[1]) { start = Number(m[1]); if (m[2]) end = Math.min(size - 1, Number(m[2])); }
    else { start = Math.max(0, size - Number(m[2])); }
    if (start > end || start >= size) return new Response(null, {status: 416, headers: {'Content-Range': `bytes */${size}`}});
    status = 206;
  }
  const headers = {'Content-Type': type, 'Accept-Ranges': 'bytes', 'Content-Length': String(end - start + 1)};
  if (status === 206) headers['Content-Range'] = `bytes ${start}-${end}/${size}`;
  return new Response(Readable.toWeb(fs.createReadStream(file, {start, end})), {status, headers});
}
// Every file:// request goes through here once registered. Audio files are answered here with byte ranges (a media
// element seeks with them; the pass-through below does not honour ranges and Chromium then refuses a WAV): a marked
// FLAC as its decoded WAV, any other audio file (WAV stems, original songs) as it is. Everything else - the app's own
// pages, scripts, images - goes to the normal file handler.
function registerFileProtocol({protocol, net, cache = sharedCache(), xmlPlayback}) {
  protocol.handle('file', async request => {
    const pass = () => net.fetch(request, {bypassCustomProtocolHandlers: true});
    let file, url;
    try { url = new URL(request.url); file = fileURLToPath(url); } catch (_) { return pass(); }
    const type = AUDIO_TYPES[path.extname(file).toLowerCase()];
    if (!type) return pass();
    const range = request.headers.get('range');
    try {
      if (xmlPlayback && url.searchParams.has(XML_STEM_QUERY)) {
        if (!await xmlPlayback.matches(file, url.searchParams.get(XML_STEM_QUERY))) return new Response(null, {status: 410});
        return await rangeResponse(file, range, 'audio/flac');
      }
      if (isFlacPath(file)) {
        const info = await readFlacInfo(file).catch(() => null);
        if (info && info.marked && info.gain !== 1) return await rangeResponse(await cache.playable(file), range);
      }
      return await rangeResponse(file, range, type);
    } catch (error) {
      return new Response(String(error.message || error), {status: error.code === 'ENOENT' ? 404 : 500});
    }
  });
}

module.exports = {GAIN_KEY, FLAC_GAIN, ENCODING_FLAC, isFlacPath, parseInfo, readFlacInfo, decodeFrames, decodeFlacSync, decodeToWavSync, createXmlStemPlayback,
  probe, isStemFormat, createStemCache, sharedCache, registerFileProtocol, rangeResponse};
