// The score video, rendered offline: frame k shows the score at k / fps seconds, drawn by the
// same core (score-view.js) with the same options the app uses; the song's own audio is
// decoded once and encoded beside it. Nothing here waits on a real clock, so the result is
// the same on a fast machine and a slow one, and faster than real time.
//
// Runs in a page (export-page.html) with WebCodecs. `XinScoreExport.run(job, io)`:
//   job: {model, look, tier: {width, height, ratio, videoBitrate, audioBitrate, keySeconds, codec},
//         fps, audioBytes (ArrayBuffer of the audio file), sampleRate, coverUrl}
//   io:  {write(Uint8Array) → Promise (in file order), progress({stage, done, total}), cancelled() → bool}
// Returns a summary; throws Error with `code` on failure.
(function (root) {
  'use strict';
  const Core = root.XinScoreView, Mp4 = root.XinMp4Writer;

  const fail = (code, message) => Object.assign(new Error(message || code), {code});

  // The core reads the device pixel ratio from the page; the video's is fixed per tier so the
  // picture does not depend on the screen of the machine that renders it.
  function fixRatio(ratio) {
    Object.defineProperty(root, 'devicePixelRatio', {get: () => ratio, configurable: true});
  }

  async function loadCover(url) {
    if (!url) return null;
    try {
      const image = new root.Image();
      image.src = url;
      await image.decode();
      return image;
    } catch (_) { return null; }
  }

  // A canvas of the tier's pixel size with the core drawing on it.
  async function makeView(job) {
    fixRatio(job.tier.ratio);
    const canvas = root.document.createElement('canvas');
    canvas.width = job.tier.width;
    canvas.height = job.tier.height;
    const view = (root.XinScorePresentation || Core).create(canvas, job.model, () => 0, {...job.look, meteorMotion: true, presentationLayout: true, offsetSeconds: job.look?.offsetSeconds || 0});
    await view.ready?.();
    view.setLyrics?.(job.lyrics);
    view.resize();
    if (canvas.width !== job.tier.width || canvas.height !== job.tier.height) throw fail('size', `canvas ${canvas.width}x${canvas.height}`);
    const cover = await loadCover(job.coverUrl || (job.model.cover && job.model.cover.src));
    const coverTaken = cover ? view.setCover(cover) : false;
    return {canvas, view, coverTaken: Boolean(coverTaken)};
  }

  async function decodeAudio(bytes, sampleRate) {
    if (!bytes || !bytes.byteLength) throw fail('audio-missing', 'no audio bytes');
    const context = new root.OfflineAudioContext(2, 1, sampleRate);
    try { return await context.decodeAudioData(bytes.slice(0)); }
    catch (error) { throw fail('audio-decode', String(error && error.message || error)); }
  }

  const copyChunk = chunk => { const data = new Uint8Array(chunk.byteLength); chunk.copyTo(data); return data; };

  async function encodeAudio(buffer, tier, io) {
    const samples = [];
    let config = null, failure = null;
    const encoder = new root.AudioEncoder({
      output: (chunk, meta) => {
        samples.push({data: copyChunk(chunk), timestamp: chunk.timestamp, frames: Math.round(chunk.duration * buffer.sampleRate / 1e6)});
        if (meta && meta.decoderConfig) config = meta.decoderConfig;
      },
      error: error => { failure = error; }
    });
    const channels = 2;
    encoder.configure({codec: 'mp4a.40.2', sampleRate: buffer.sampleRate, numberOfChannels: channels, bitrate: tier.audioBitrate});
    const left = buffer.getChannelData(0), right = buffer.numberOfChannels > 1 ? buffer.getChannelData(1) : left;
    const step = buffer.sampleRate; // one second per AudioData
    for (let start = 0; start < buffer.length; start += step) {
      if (io.cancelled()) throw fail('cancelled');
      const count = Math.min(step, buffer.length - start);
      const planar = new Float32Array(count * 2);
      planar.set(left.subarray(start, start + count), 0);
      planar.set(right.subarray(start, start + count), count);
      const data = new root.AudioData({format: 'f32-planar', sampleRate: buffer.sampleRate, numberOfFrames: count, numberOfChannels: channels,
                                       timestamp: Math.round(start * 1e6 / buffer.sampleRate), data: planar});
      encoder.encode(data);
      data.close();
      if (encoder.encodeQueueSize > 8) await new Promise(resolve => encoder.addEventListener('dequeue', resolve, {once: true}));
      if (failure) throw fail('audio-encode', String(failure.message || failure));
    }
    await encoder.flush();
    encoder.close();
    if (failure) throw fail('audio-encode', String(failure.message || failure));
    if (!config || !config.description) throw fail('audio-encode', 'encoder gave no AudioSpecificConfig');
    const description = new Uint8Array(config.description instanceof ArrayBuffer ? config.description : config.description.buffer.slice(0));
    return {samples, description, sampleRate: buffer.sampleRate, channels, bitrate: tier.audioBitrate};
  }

  async function run(job, io) {
    if (!Core || !Mp4) throw fail('page', 'core or writer missing');
    if (typeof root.VideoEncoder !== 'function' || typeof root.AudioEncoder !== 'function') throw fail('webcodecs', 'WebCodecs is not available');
    const started = root.performance.now();
    const fps = job.fps, tier = job.tier;
    const timing = {};

    io.progress({stage: 'audio', done: 0, total: 1});
    let t0 = root.performance.now();
    const buffer = await decodeAudio(job.audioBytes, job.sampleRate);
    job.audioBytes = null;
    const audioSeconds = buffer.length / buffer.sampleRate;
    const audio = await encodeAudio(buffer, tier, io);
    // Encoder priming (the encoder's own delay at the start) is skipped by an edit list,
    // and the track shows exactly the decoded length of the song.
    audio.priming = Math.max(0, Math.round(job.audioPriming || 0));
    audio.presentedFrames = buffer.length;
    const encodedFrames = audio.samples.reduce((sum, sample) => sum + sample.frames, 0);
    if (encodedFrames < audio.priming + buffer.length) audio.presentedFrames = Math.max(0, encodedFrames - audio.priming);
    timing.audio = root.performance.now() - t0;

    const {canvas, view, coverTaken} = await makeView(job);
    const frames = Math.max(1, Math.round(audioSeconds * fps));
    const frameUs = 1e6 / fps;
    const keyEvery = Math.max(1, Math.round((tier.keySeconds || 4) * fps));
    const videoSamples = [];
    let config = null, failure = null;
    const encoder = new root.VideoEncoder({
      output: (chunk, meta) => {
        videoSamples.push({data: copyChunk(chunk), key: chunk.type === 'key', timestamp: chunk.timestamp});
        if (meta && meta.decoderConfig) config = meta.decoderConfig;
      },
      error: error => { failure = error; }
    });
    const videoConfig = {codec: tier.codec, width: tier.width, height: tier.height, bitrate: tier.videoBitrate, framerate: fps,
                         bitrateMode: 'variable', latencyMode: 'quality', avc: {format: 'avc'}};
    // The GPU's encoder when there is one (it keeps to the bit rate), else the software one.
    let acceleration = job.acceleration || 'auto';
    if (acceleration === 'auto') {
      let hardware = false;
      try { hardware = (await root.VideoEncoder.isConfigSupported({...videoConfig, hardwareAcceleration: 'prefer-hardware'})).supported === true; } catch (_) {}
      acceleration = hardware ? 'prefer-hardware' : 'prefer-software';
    }
    encoder.configure({...videoConfig, hardwareAcceleration: acceleration});
    t0 = root.performance.now();
    let drawMs = 0, worstDraw = 0;
    const marks = [];
    for (let k = 0; k < frames; k++) {
      if (io.cancelled()) { encoder.close(); throw fail('cancelled'); }
      const time = k / fps;
      const d0 = root.performance.now();
      const stats = view.draw(time);
      const spent = root.performance.now() - d0;
      drawMs += spent; worstDraw = Math.max(worstDraw, spent);
      if (stats && stats.mark && (!marks.length || marks[marks.length - 1].text !== stats.mark.text)) marks.push({time, text: stats.mark.text, state: stats.mark.state});
      const frame = new root.VideoFrame(canvas, {timestamp: Math.round(k * frameUs), duration: Math.round(frameUs), alpha: 'discard'});
      encoder.encode(frame, {keyFrame: k % keyEvery === 0});
      frame.close();
      while (encoder.encodeQueueSize > 6) await new Promise(resolve => encoder.addEventListener('dequeue', resolve, {once: true}));
      if (failure) throw fail('video-encode', String(failure.message || failure));
      if (k % 30 === 0) io.progress({stage: 'video', done: k, total: frames});
    }
    await encoder.flush();
    encoder.close();
    if (failure) throw fail('video-encode', String(failure.message || failure));
    if (!config || !config.description) throw fail('video-encode', 'encoder gave no avcC');
    if (videoSamples.length !== frames) throw fail('video-encode', `encoder gave ${videoSamples.length} frames for ${frames}`);
    timing.video = root.performance.now() - t0;

    io.progress({stage: 'write', done: 0, total: 1});
    t0 = root.performance.now();
    const description = new Uint8Array(config.description instanceof ArrayBuffer ? config.description : config.description.buffer.slice(0));
    const file = Mp4.build({
      video: {samples: videoSamples, description, width: tier.width, height: tier.height, timescale: fps * 1000, frameDuration: 1000,
              colorSpace: config.colorSpace || null},
      audio
    });
    // Larger blocks, fewer round trips to whoever writes the file.
    let block = [], blockSize = 0;
    for (const part of file.parts) {
      block.push(part); blockSize += part.byteLength;
      if (blockSize >= 4 << 20) { await io.write(Mp4.concat(block)); block = []; blockSize = 0; if (io.cancelled()) throw fail('cancelled'); }
    }
    if (blockSize) await io.write(Mp4.concat(block));
    timing.write = root.performance.now() - t0;

    const videoBytes = videoSamples.reduce((sum, sample) => sum + sample.data.byteLength, 0);
    const audioBytes = audio.samples.reduce((sum, sample) => sum + sample.data.byteLength, 0);
    return {
      bytes: file.size, frames, fps, width: tier.width, height: tier.height, ratio: tier.ratio,
      audioSeconds, audioSampleRate: buffer.sampleRate, audioChannelsInFile: buffer.numberOfChannels,
      videoSeconds: frames / fps, videoMs: file.videoMs, audioMs: file.audioMs,
      videoBytes, audioBytes, headerBytes: file.header,
      keyFrames: videoSamples.filter(sample => sample.key).length,
      codec: config.codec, colorSpace: config.colorSpace || null, encoder: acceleration === 'prefer-hardware' ? 'hardware' : 'software', audioCodec: 'mp4a.40.2', audioPriming: audio.priming,
      coverTaken, marks: marks.length, drawMsMean: drawMs / frames, drawMsWorst: worstDraw,
      ms: {...timing, total: root.performance.now() - started}
    };
  }

  root.XinScoreExport = Object.freeze({run, makeView, decodeAudio, fixRatio});

  // In the export window, the main process hands the job over and takes the bytes.
  const host = root.xinExportHost;
  if (host && typeof host.job === 'function') {
    (async () => {
      let job;
      try { job = await host.job(); } catch (error) { host.fail({code: 'job', message: String(error && error.message || error)}); return; }
      if (!job || job.mode !== 'export') return;
      let stop = false;
      host.onCancel(() => { stop = true; });
      try {
        const summary = await run(job, {write: bytes => host.write(bytes), progress: step => host.progress(step), cancelled: () => stop});
        host.done(summary);
      } catch (error) {
        host.fail({code: error && error.code || 'failed', message: String(error && error.message || error)});
      }
    })();
  }
})(globalThis);
