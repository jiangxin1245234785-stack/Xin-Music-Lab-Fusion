'use strict';
// The MP4 writer and the export's plain rules, without Electron.
//   node --test source/scoreview/export/tests/
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const Mp4 = require('../mp4-writer.js');
const {readMp4} = require('./mp4-read.cjs');

// A fake stream: sizes and contents are arbitrary bytes; the writer never looks inside samples.
function fakeStreams({frames = 95, fps = 30, audioFrames = 140, sampleRate = 44100, priming = 0, keyEvery = 30} = {}) {
  const video = {
    width: 1920, height: 1080, timescale: fps * 1000, frameDuration: 1000,
    description: Uint8Array.of(1, 0x64, 0, 0x28, 0xff, 0xe1, 0, 4, 0x67, 0x64, 0, 0x28, 1, 0, 4, 0x68, 0xee, 0x3c, 0x80),
    colorSpace: {primaries: 'bt709', transfer: 'iec61966-2-1', matrix: 'smpte170m', fullRange: false},
    samples: Array.from({length: frames}, (_, k) => ({data: new Uint8Array(10 + (k % 7)).fill(k & 0xff), key: k % keyEvery === 0, timestamp: Math.round(k * 1e6 / fps)}))
  };
  const audio = {
    sampleRate, channels: 2, bitrate: 128000, description: Uint8Array.of(0x12, 0x10), priming,
    samples: Array.from({length: audioFrames}, (_, k) => ({data: new Uint8Array(300 + (k % 5)).fill(0xa0), frames: 1024}))
  };
  return {video, audio};
}

function written(streams) {
  const file = Mp4.build(streams);
  const out = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'xin-mp4-')), 'a.mp4');
  fs.writeFileSync(out, Buffer.concat(file.parts.map(part => Buffer.from(part))));
  return {file, info: readMp4(out), out};
}

test('index first, every sample inside mdat once, sizes add up', () => {
  const {file, info} = written(fakeStreams());
  assert.deepEqual(info.order, ['ftyp', 'moov', 'mdat']);
  assert.equal(info.layoutProblems, 0);
  assert.equal(info.bytes, file.size);
  const [video, audio] = info.tracks;
  assert.equal(video.handler, 'vide');
  assert.equal(audio.handler, 'soun');
  assert.equal(video.samples, 95);
  assert.equal(video.mappedSamples, 95);
  assert.equal(audio.samples, 140);
  assert.equal(audio.mappedSamples, 140);
  assert.equal(video.bytes + audio.bytes, info.mdat.end - info.mdat.start);
});

test('codecs, sizes and colour are what the encoder said', () => {
  const {info} = written(fakeStreams());
  const [video, audio] = info.tracks;
  assert.equal(video.entry, 'avc1');
  assert.equal(video.codec, 'avc1.640028');
  assert.equal(video.width, 1920);
  assert.equal(video.height, 1080);
  assert.deepEqual(video.colr, {type: 'nclx', primaries: 1, transfer: 13, matrix: 6, fullRange: false});
  assert.equal(audio.entry, 'mp4a');
  assert.equal(audio.codec, 'mp4a.40.2');
  assert.equal(audio.objectType, 0x40);
  assert.equal(audio.sampleRate, 44100);
  assert.equal(audio.channels, 2);
});

test('durations: frames × step, audio frames × 1024, movie = longest', () => {
  const {info} = written(fakeStreams({frames: 95, audioFrames: 140}));
  const [video, audio] = info.tracks;
  assert.deepEqual(video.deltas, [1000]);
  assert.equal(video.timescale, 30000);
  assert.equal(video.sttsDuration, 95000);
  assert.equal(video.tkhdDuration, Math.round(95 / 30 * 1000));
  assert.equal(audio.sttsDuration, 140 * 1024);
  assert.equal(audio.timescale, 44100);
  assert.equal(info.movieDuration, Math.max(video.tkhdDuration, audio.tkhdDuration));
});

test('key frames listed 1-based', () => {
  const {info} = written(fakeStreams({frames: 95, keyEvery: 30}));
  assert.deepEqual(info.tracks[0].syncSamples, [1, 31, 61, 91]);
});

test('priming becomes an edit list that skips it; none without priming', () => {
  assert.equal(written(fakeStreams()).info.tracks[1].edit, undefined);
  const {info} = written(fakeStreams({priming: 2048, audioFrames: 140}));
  assert.deepEqual(info.tracks[1].edit, {segmentDuration: Math.round((140 * 1024 - 2048) / 44100 * 1000), mediaTime: 2048});
});

test('chunks interleave about a second at a time', () => {
  const {file} = written(fakeStreams({frames: 300, audioFrames: 430}));
  assert.ok(file.parts.length > 700);
  // 10 s of each: the payload alternates, so neither track's data is all at one end.
  const info = written(fakeStreams({frames: 300, audioFrames: 430})).info;
  assert.equal(info.layoutProblems, 0);
});

test('refuses streams it would write wrong', () => {
  const late = fakeStreams();
  late.video.samples[0].key = false;
  assert.throws(() => Mp4.build(late), /key frame/);
  const reordered = fakeStreams();
  reordered.video.samples[5].timestamp = reordered.video.samples[3].timestamp;
  assert.throws(() => Mp4.build(reordered), /out of order/);
  const empty = fakeStreams();
  empty.video.samples = [];
  assert.throws(() => Mp4.build(empty), /no video/);
  const noDescription = fakeStreams();
  noDescription.audio.description = null;
  assert.throws(() => Mp4.build(noDescription), /AudioSpecificConfig/);
});

// export-main.cjs needs Electron only inside exportVideo; its plain rules load in Node.
const exporter = require('../export-main.cjs');

test('file name: artist - title, characters Windows refuses replaced', () => {
  assert.equal(exporter.fileNameFor({track: {artist: '周杰伦', title: '七里香'}}), '周杰伦 - 七里香.mp4');
  assert.equal(exporter.fileNameFor({track: {artist: 'AC/DC', title: 'What? "Now": <1|2>*'}}), 'AC_DC - What_ _Now__ _1_2__.mp4');
  assert.equal(exporter.fileNameFor({track: {artist: '', title: 'MEGURI'}}), 'MEGURI.mp4');
  assert.equal(exporter.fileNameFor({track: {artist: 'Unknown Artist', title: '周杰伦 - 七里香'}}), '周杰伦 - 七里香.mp4');
  assert.equal(exporter.fileNameFor({track: {artist: 'unknown artist', title: 'x'}}), 'x.mp4');
  assert.equal(exporter.fileNameFor({track: {artist: '', title: ''}}), 'score.mp4');
  assert.equal(exporter.fileNameFor({track: {title: 'CON'}}), '_CON.mp4');
  assert.equal(exporter.fileNameFor({track: {title: 'end. . '}}), 'end.mp4');
  assert.ok(exporter.fileNameFor({track: {title: 'x'.repeat(400)}}).length <= 154);
});

test('a forbidden folder and everything under it is refused; neighbours are not', () => {
  const root = "D:\\Caches\\Xin's Local Deck\\Analysis";
  assert.ok(exporter.inside("D:\\Caches\\Xin's Local Deck\\Analysis\\a\\b.mp4", root));
  assert.ok(exporter.inside("d:\\caches\\xin's local deck\\analysis\\b.mp4", root));
  assert.ok(!exporter.inside("D:\\Caches\\Xin's Local Deck\\Analysis2\\b.mp4", root));
  assert.ok(!exporter.inside('C:\\Users\\x\\Videos\\b.mp4', root));
});

test('two tiers only, same page layout, the chosen look', () => {
  assert.deepEqual(Object.keys(exporter.TIERS), ['1080p', '720p']);
  for (const tier of Object.values(exporter.TIERS)) {
    assert.equal(tier.width / tier.ratio, 1280);
    assert.equal(tier.height / tier.ratio, 720);
  }
  assert.deepEqual({...exporter.LOOK}, {fxPreset: 'clear', laneLabels: 'icon', sectionStyle: 'line', captionStyle: 'mark', mergeTimbres: true, simplify: true, backdropLevel: 'steady'});
  assert.equal(exporter.FPS, 30);
  // Sound: AAC 128k in the sharp size, 96k in the small one (2026-11-14: 128k alone is about 1 MB a minute).
  assert.deepEqual([exporter.TIERS['1080p'].audioBitrate, exporter.TIERS['720p'].audioBitrate], [128000, 96000]);
  assert.equal(exporter.TIERS['1080p'].videoBitrate, 1650000);
  assert.equal(exporter.TIERS['720p'].videoBitrate, 200000);
});

test('custom video bps are integer values in range; old callers can omit the override', async () => {
  const model = {track:{duration:1}, lanes:[{}]};
  for (const name of ['720p', '1080p']) {
    for (const videoBitrate of ['4000000', {}, false, 0, 49999, 50000.1, 16000001, NaN, Infinity]) {
      const rejected = await exporter.exportVideo({tier:name, model, videoBitrate, lang:'en'});
      assert.equal(rejected.error, 'invalid-video-bitrate');
      assert.match(rejected.message, /0\.05 to 16 Mbps/);
    }
    for (const videoBitrate of [50000, 2738291, 16000000, undefined, null]) {
      const valid = await exporter.exportVideo({tier:name, model, videoBitrate});
      assert.equal(valid.error, 'write-failed', 'valid bitrate proceeds to output-file validation');
    }
  }
  assert.equal(exporter.TIERS['1080p'].videoBitrate, 1650000);
  assert.equal(exporter.TIERS['720p'].videoBitrate, 200000);
});

test('a packaged XML carries what the export and the marks need', () => {
  const build = fs.readFileSync(path.join(__dirname, '..', '..', '..', 'release-tools', 'build-local.cjs'), 'utf8');
  const listed = JSON.parse(`[${/const scoreFiles=\[([\s\S]*?)\];/.exec(build)[1].replace(/'/g, '"')}]`);
  for (const file of ['adapter/cues.cjs', 'export/export-main.cjs', 'export/export-page.html', 'export/export-preload.cjs', 'export/export-render.js', 'export/mp4-writer.js']) {
    assert.ok(listed.includes(file), `打包清单里没有 ${file}`);
  }
  // Every file the export page loads is listed (paths relative to the scoreview folder).
  const page = fs.readFileSync(path.join(__dirname, '..', 'export-page.html'), 'utf8');
  for (const [, src] of page.matchAll(/<script src="([^"]+)"/g)) assert.ok(listed.includes(path.posix.normalize(`export/${src}`)), `导出页加载的 ${src} 不在打包清单里`);
  const mood = fs.readFileSync(path.join(__dirname, '..', '..', 'score-mood.js'), 'utf8');
  for (const [, file] of mood.matchAll(/\['[^']+','([^']+\.png)'\]/g)) {
    assert.ok(listed.includes(`assets/mood/${file}`), `舞台实际引用的 ${file} 不在打包清单里`);
  }
  const ipc = fs.readFileSync(path.join(__dirname, '..', '..', '..', 'fusion-runtime-baseline', 'desktop', 'score-export-ipc.cjs'), 'utf8');
  for (const [, file] of ipc.matchAll(/require\(['"]\.\.\/\.\.\/scoreview\/([^'"]+)['"]\)/g)) {
    assert.ok(listed.includes(file), `导出通道实际加载的 ${file} 不在打包清单里`);
  }
  for (const file of listed) assert.ok(fs.existsSync(path.join(__dirname, '..', '..', file)), `清单里的 ${file} 不存在`);
});

test('plain-language messages exist in both languages for every outcome', () => {
  const zh = Object.keys(exporter.MESSAGES.zh), en = Object.keys(exporter.MESSAGES.en);
  assert.deepEqual(zh, en);
  for (const key of ['no-model', 'audio-missing', 'disk-full', 'cancelled', 'forbidden-folder', 'window-gone']) assert.ok(zh.includes(key));
});
