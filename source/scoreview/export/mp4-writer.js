// A small MP4 writer for the score video: one H.264 track and one AAC track, nothing else.
//
// It takes what WebCodecs hands out (length-prefixed H.264 samples with their avcC record,
// raw AAC frames with their AudioSpecificConfig) and lays out a plain, non-fragmented
// ISO BMFF file with the index (moov) in front of the data, so a phone or a browser can
// start playing before the whole file has arrived. Samples are interleaved about one
// second at a time.
//
// No B-frames: the samples must come in presentation order with constant frame duration.
// The writer checks this and refuses otherwise rather than writing a file that plays wrong.
//
// Works in a browser page (global XinMp4Writer) and in Node (require).
(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.XinMp4Writer = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';

  const MOVIE_TIMESCALE = 1000;
  const MATRIX = [0x00010000, 0, 0, 0, 0x00010000, 0, 0, 0, 0x40000000];

  const ascii = text => Uint8Array.from(text, ch => ch.charCodeAt(0));
  const u8 = value => Uint8Array.of(value & 0xff);
  const u16 = value => Uint8Array.of((value >>> 8) & 0xff, value & 0xff);
  const u24 = value => Uint8Array.of((value >>> 16) & 0xff, (value >>> 8) & 0xff, value & 0xff);
  const u32 = value => {
    if (!(value >= 0 && value <= 0xffffffff)) throw new Error(`mp4: value out of 32-bit range: ${value}`);
    return Uint8Array.of((value >>> 24) & 0xff, (value >>> 16) & 0xff, (value >>> 8) & 0xff, value & 0xff);
  };
  const u64 = value => concat([u32(Math.floor(value / 0x100000000)), u32(value % 0x100000000)]);
  const sampleSize = sample => sample.size ?? bytesOf(sample.data).byteLength;
  const zeros = count => new Uint8Array(count);
  const bytesOf = data => {
    if (data instanceof Uint8Array) return data;
    if (data instanceof ArrayBuffer) return new Uint8Array(data);
    if (ArrayBuffer.isView(data)) return new Uint8Array(data.buffer, data.byteOffset, data.byteLength);
    throw new Error('mp4: expected bytes');
  };

  function concat(parts) {
    const flat = [];
    const walk = item => { if (Array.isArray(item)) item.forEach(walk); else if (item) flat.push(bytesOf(item)); };
    walk(parts);
    const total = flat.reduce((sum, part) => sum + part.byteLength, 0);
    const out = new Uint8Array(total);
    let at = 0;
    for (const part of flat) { out.set(part, at); at += part.byteLength; }
    return out;
  }

  const box = (type, ...payload) => {
    const body = concat(payload);
    return concat([u32(body.byteLength + 8), ascii(type), body]);
  };
  const fullBox = (type, version, flags, ...payload) => box(type, u8(version), u24(flags), ...payload);
  const matrix = () => concat(MATRIX.map(u32));

  // Equal neighbours folded into [count, value] runs.
  function runs(values) {
    const out = [];
    for (const value of values) {
      const lastRun = out[out.length - 1];
      if (lastRun && lastRun[1] === value) lastRun[0]++;
      else out.push([1, value]);
    }
    return out;
  }

  // An MPEG-4 descriptor (esds): tag, length (one byte is enough for what is written here), body.
  function descriptor(tag, ...payload) {
    const body = concat(payload);
    if (body.byteLength > 127) throw new Error('mp4: descriptor too long');
    return concat([u8(tag), u8(body.byteLength), body]);
  }

  // ---- checks -------------------------------------------------------------------------------

  function checkVideo(video) {
    if (!video || !Array.isArray(video.samples) || !video.samples.length) throw new Error('mp4: no video samples');
    if (!video.description) throw new Error('mp4: video has no avcC description');
    if (!(video.width > 0 && video.height > 0)) throw new Error('mp4: video size missing');
    if (!(video.timescale > 0 && video.frameDuration > 0)) throw new Error('mp4: video timescale missing');
    if (!video.samples[0].key) throw new Error('mp4: first video sample is not a key frame');
  }

  function checkAudio(audio) {
    if (!audio) return;
    if (!Array.isArray(audio.samples) || !audio.samples.length) throw new Error('mp4: no audio samples');
    if (!audio.description) throw new Error('mp4: audio has no AudioSpecificConfig');
    if (!(audio.sampleRate > 0 && audio.channels > 0)) throw new Error('mp4: audio format missing');
  }

  // ---- boxes --------------------------------------------------------------------------------

  const mvhd = durationMs => fullBox('mvhd', 0, 0, u32(0), u32(0), u32(MOVIE_TIMESCALE), u32(durationMs),
    u32(0x00010000), u16(0x0100), zeros(10), matrix(), zeros(24), u32(3));

  const tkhd = (id, durationMs, isAudio, width, height) => fullBox('tkhd', 0, 3, u32(0), u32(0), u32(id), u32(0), u32(durationMs),
    zeros(8), u16(0), u16(isAudio ? 1 : 0), u16(isAudio ? 0x0100 : 0), u16(0), matrix(),
    u32(isAudio ? 0 : width * 65536), u32(isAudio ? 0 : height * 65536));

  // 'und' packed as three 5-bit letters.
  const mdhd = (timescale, duration) => fullBox('mdhd', 0, 0, u32(0), u32(0), u32(timescale), u32(duration), u16(0x55c4), u16(0));

  const hdlr = (handler, name) => fullBox('hdlr', 0, 0, u32(0), ascii(handler), zeros(12), ascii(name), u8(0));

  const dinf = () => box('dinf', fullBox('dref', 0, 0, u32(1), fullBox('url ', 0, 1)));

  // Colour as the encoder reports it (WebCodecs VideoColorSpace names → ISO/IEC 23091-2 codes).
  const PRIMARIES = {bt709: 1, bt470bg: 5, smpte170m: 6, bt2020: 9, smpte432: 12};
  const TRANSFER = {bt709: 1, smpte170m: 6, 'iec61966-2-1': 13, linear: 8, pq: 16, hlg: 18};
  const MATRICES = {rgb: 0, bt709: 1, bt470bg: 5, smpte170m: 6, 'bt2020-ncl': 9};
  function colr(space) {
    if (!space) return null;
    const primaries = PRIMARIES[space.primaries], transfer = TRANSFER[space.transfer], matrixCode = MATRICES[space.matrix];
    if (primaries === undefined || transfer === undefined || matrixCode === undefined) return null;
    return box('colr', ascii('nclx'), u16(primaries), u16(transfer), u16(matrixCode), u8(space.fullRange ? 0x80 : 0));
  }

  function avc1(video) {
    const name = zeros(32);
    return box('avc1', zeros(6), u16(1), u16(0), u16(0), zeros(12), u16(video.width), u16(video.height),
      u32(0x00480000), u32(0x00480000), u32(0), u16(1), name, u16(0x0018), u16(0xffff),
      box('avcC', bytesOf(video.description)), colr(video.colorSpace), box('pasp', u32(1), u32(1)));
  }

  function mp4a(audio) {
    const bitrate = Math.round(audio.bitrate || 128000);
    const largest = audio.samples.reduce((most, sample) => Math.max(most, bytesOf(sample.data).byteLength), 0);
    const esds = fullBox('esds', 0, 0,
      descriptor(0x03, u16(0), u8(0),
        descriptor(0x04, u8(0x40), u8(0x15), u24(largest), u32(bitrate), u32(bitrate),
          descriptor(0x05, bytesOf(audio.description))),
        descriptor(0x06, u8(0x02))));
    return box('mp4a', zeros(6), u16(1), zeros(8), u16(audio.channels), u16(16), u16(0), u16(0),
      u32(audio.sampleRate * 65536), esds);
  }

  function stbl(entry, track, offsets) {
    const sizes = track.samples.map(sampleSize);
    const parts = [
      fullBox('stsd', 0, 0, u32(1), entry),
      fullBox('stts', 0, 0, (() => { const r = runs(track.durations); return [u32(r.length), r.map(([n, d]) => concat([u32(n), u32(d)]))]; })())
    ];
    if (track.keys) parts.push(fullBox('stss', 0, 0, u32(track.keys.length), track.keys.map(index => u32(index + 1))));
    // Chunks: the samples per chunk, folded into runs (first chunk numbers are 1-based).
    const perChunk = runs(track.chunks.map(chunk => chunk.count));
    let first = 1;
    const stscRows = perChunk.map(([n, count]) => { const row = concat([u32(first), u32(count), u32(1)]); first += n; return row; });
    parts.push(fullBox('stsc', 0, 0, u32(stscRows.length), stscRows));
    parts.push(fullBox('stsz', 0, 0, u32(0), u32(sizes.length), sizes.map(u32)));
    const wide = offsets.some(offset => offset > 0xffffffff);
    parts.push(fullBox(wide ? 'co64' : 'stco', 0, 0, u32(offsets.length), offsets.map(wide ? u64 : u32)));
    return box('stbl', ...parts);
  }

  function trak(track, offsets) {
    const isAudio = track.kind === 'audio';
    const media = box('mdia',
      mdhd(track.timescale, track.mediaDuration),
      hdlr(isAudio ? 'soun' : 'vide', isAudio ? 'SoundHandler' : 'VideoHandler'),
      box('minf',
        isAudio ? fullBox('smhd', 0, 0, u16(0), u16(0)) : fullBox('vmhd', 0, 1, u16(0), u16(0), u16(0), u16(0)),
        dinf(),
        stbl(isAudio ? mp4a(track.source) : avc1(track.source), track, offsets)));
    // An edit list only when the first samples are encoder priming to be skipped.
    const edits = track.skip > 0
      ? box('edts', fullBox('elst', 0, 0, u32(1), u32(track.presentedMs), u32(track.skip), u16(1), u16(0)))
      : null;
    return box('trak', tkhd(track.id, track.presentedMs, isAudio, track.source.width, track.source.height), edits, media);
  }

  // ---- layout -------------------------------------------------------------------------------

  // Each track's samples with their durations (in the track's timescale), and how they group
  // into chunks of about `chunkSeconds`.
  function prepareVideo(video, chunkSeconds) {
    const samples = video.samples;
    const durations = samples.map(() => video.frameDuration);
    // Presentation order with a constant step: timestamps (microseconds) must not go back.
    for (let i = 1; i < samples.length; i++) {
      if (Number.isFinite(samples[i].timestamp) && Number.isFinite(samples[i - 1].timestamp) && samples[i].timestamp <= samples[i - 1].timestamp) {
        throw new Error(`mp4: video sample ${i} is out of order (B-frames are not supported)`);
      }
    }
    const keys = [];
    samples.forEach((sample, index) => { if (sample.key) keys.push(index); });
    const mediaDuration = durations.reduce((sum, value) => sum + value, 0);
    return {kind: 'video', id: 1, source: video, samples, durations, keys, timescale: video.timescale, mediaDuration, skip: 0,
            presentedMs: Math.round(mediaDuration / video.timescale * MOVIE_TIMESCALE),
            perChunk: Math.max(1, Math.round(chunkSeconds * video.timescale / video.frameDuration))};
  }

  function prepareAudio(audio, chunkSeconds) {
    const samples = audio.samples;
    const frame = audio.frameSize || 1024;
    const durations = samples.map(sample => sample.frames || frame);
    const mediaDuration = durations.reduce((sum, value) => sum + value, 0);
    const skip = Math.max(0, Math.round(audio.priming || 0));
    const shown = Number.isFinite(audio.presentedFrames) ? audio.presentedFrames : mediaDuration - skip;
    if (shown + skip > mediaDuration) throw new Error('mp4: audio edit runs past the encoded samples');
    return {kind: 'audio', id: 2, source: audio, samples, durations, keys: null, timescale: audio.sampleRate, mediaDuration, skip,
            presentedMs: Math.round(shown / audio.sampleRate * MOVIE_TIMESCALE),
            perChunk: Math.max(1, Math.round(chunkSeconds * audio.sampleRate / frame))};
  }

  // Interleave: chunks in order of their start time, video first on a tie.
  function interleave(tracks) {
    const queue = [];
    for (const track of tracks) {
      track.chunks = [];
      let start = 0;
      for (let first = 0; first < track.samples.length; first += track.perChunk) {
        const count = Math.min(track.perChunk, track.samples.length - first);
        const chunk = {track, first, count, start: start / track.timescale};
        track.chunks.push(chunk);
        queue.push(chunk);
        for (let i = first; i < first + count; i++) start += track.durations[i];
      }
    }
    queue.sort((a, b) => a.start - b.start || (a.track.kind === 'video' ? -1 : 1));
    return queue;
  }

  // The finished file as a list of byte arrays (header, then the sample data in file order),
  // and its total size. Writing the parts one after the other gives the file.
  function build({video, audio, chunkSeconds = 1}) {
    checkVideo(video);
    checkAudio(audio);
    const tracks = [prepareVideo(video, chunkSeconds)];
    if (audio) tracks.push(prepareAudio(audio, chunkSeconds));
    const order = interleave(tracks);

    // Chunk offsets relative to the start of the mdat payload.
    let cursor = 0;
    for (const chunk of order) {
      chunk.relative = cursor;
      for (let i = chunk.first; i < chunk.first + chunk.count; i++) cursor += bytesOf(chunk.track.samples[i].data).byteLength;
    }
    const payload = cursor;
    const ftyp = box('ftyp', ascii('isom'), u32(0x200), ascii('isom'), ascii('iso2'), ascii('avc1'), ascii('mp41'));
    const movieMs = Math.max(...tracks.map(track => track.presentedMs));
    const moovWith = base => box('moov', mvhd(movieMs), ...tracks.map(track => trak(track, track.chunks.map(chunk => chunk.relative + base))));
    // stco sizes do not depend on the values, so one dry run gives the moov size.
    const moovSize = moovWith(0).byteLength;
    const base = ftyp.byteLength + moovSize + 8;
    if (base + payload > 0xffffffff) throw new Error('mp4: file larger than 4 GB');
    const moov = moovWith(base);
    if (moov.byteLength !== moovSize) throw new Error('mp4: index size changed between passes');
    const parts = [ftyp, moov, concat([u32(payload + 8), ascii('mdat')])];
    for (const chunk of order) {
      for (let i = chunk.first; i < chunk.first + chunk.count; i++) parts.push(bytesOf(chunk.track.samples[i].data));
    }
    const size = parts.reduce((sum, part) => sum + part.byteLength, 0);
    return {parts, size, header: ftyp.byteLength + moov.byteLength + 8, payload,
            videoMs: tracks[0].presentedMs, audioMs: audio ? tracks[1].presentedMs : 0};
  }

  // Keep long UHD recordings out of renderer memory. Reserve the front index, write
  // one second of video and matching audio at a time, then fill in the index.
  async function openStream({audio, fps, frames, write}) {
    const sound = prepareAudio(audio, 1);
    interleave([sound]);
    const videoChunks = [], samples = [];
    // Sample sizes, durations, keyframe and chunk tables fit in 32 bytes per sample.
    const header = 8192 + 32 * (audio.samples.length + frames);
    await write(zeros(header));
    let position = header, nextAudio = 0;
    async function put(data) {
      await write(data);
      position += data.byteLength;
    }
    async function audioBefore(end) {
      while (nextAudio < sound.chunks.length && sound.chunks[nextAudio].start < end) {
        const chunk = sound.chunks[nextAudio++];
        chunk.offset = position;
        await put(concat(sound.samples.slice(chunk.first, chunk.first + chunk.count).map(s => s.data)));
      }
    }
    async function append(group) {
      const first = samples.length;
      await audioBefore(first / fps);
      videoChunks.push({count: group.length, offset: position});
      await put(concat(group.map(sample => sample.data)));
      for (const sample of group) samples.push({timestamp: sample.timestamp, key: sample.key, size: sample.data.byteLength});
    }
    async function finish(video) {
      if (samples.length !== frames) throw new Error('mp4: incomplete video');
      await audioBefore(Infinity);
      const picture = prepareVideo({...video, samples}, 1);
      picture.chunks = videoChunks;
      const movieMs = Math.max(picture.presentedMs, sound.presentedMs);
      const ftyp = box('ftyp', ascii('isom'), u32(0x200), ascii('isom'), ascii('iso2'), ascii('avc1'), ascii('mp41'));
      const moov = box('moov', mvhd(movieMs), [picture, sound].map(track => trak(track, track.chunks.map(chunk => chunk.offset))));
      const free = header - ftyp.byteLength - moov.byteLength - 16;
      if (free < 8) throw new Error('mp4: reserved index too small');
      const payload = position - header;
      await write(concat([ftyp, moov, u32(free), ascii('free'), zeros(free - 8), u32(1), ascii('mdat'), u64(payload + 16)]), 0);
      return {size: position, header, payload, videoMs: picture.presentedMs, audioMs: sound.presentedMs,
              videoBytes: samples.reduce((total, s) => total + s.size, 0), keyFrames: picture.keys.length};
    }
    return {append, finish};
  }

  return Object.freeze({build, openStream, concat, MOVIE_TIMESCALE});
});
