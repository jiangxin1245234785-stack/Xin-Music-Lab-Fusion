'use strict';
// Audit fix 2 (2026-11-15): stems as 24-bit FLAC at half level (core/stem-audio.cjs). Fixtures in
// tests/fixtures/stem-audio (made by its make.py through analysis-midi/stem_audio.py, the writer the runners use):
// source.wav (float stereo with samples up to 1.9) and marked.flac (it, written as a stem), plain.flac (an ordinary
// FLAC, no mark). Everything written here goes to a temp folder.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const fsp = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const crypto = require('node:crypto');
const audio = require('../core/stem-audio.cjs');
const {header} = require('../core/mix-audio.cjs');

const FIX = path.join(__dirname, 'fixtures', 'stem-audio');
const marked = path.join(FIX, 'marked.flac'), plain = path.join(FIX, 'plain.flac'), source = path.join(FIX, 'source.wav');
const LIMIT = 2 ** -23;

async function wavSamples(file) {
  const handle = await fsp.open(file, 'r');
  try {
    const h = await header(handle, (await handle.stat()).size);
    const b = Buffer.alloc(h.bytes);
    await handle.read(b, 0, b.length, h.offset);
    return {h, b};
  } finally { await handle.close(); }
}

(async () => {
  const scratch = await fsp.mkdtemp(path.join(os.tmpdir(), 'xld-stem-audio-'));
  try {
    // --- the mark and the shape ------------------------------------------------------------------------------
    const info = await audio.readFlacInfo(marked);
    assert.equal(info.marked, true, 'the writer marks its FLACs');
    assert.equal(info.gain, 2);
    assert.equal(info.bits, 24);
    assert.equal(info.channels, 2);
    assert.equal(info.sampleRate, 44100);
    assert.equal(info.frames, 22050);
    const other = await audio.readFlacInfo(plain);
    assert.equal(other.marked, false, 'an ordinary FLAC carries no mark');
    assert.equal(other.gain, 1);

    // --- decoding: every sample within 2^-23 of the float WAV it was written from, samples above 1 included ------
    const {h, b} = await wavSamples(source);
    const decoded = audio.decodeFlacSync(marked);
    assert.equal(decoded.frames, h.frames);
    let max = 0, peak = 0;
    for (let i = 0; i < h.frames; i++) for (let c = 0; c < 2; c++) {
      const want = b.readFloatLE((i * 2 + c) * 4);
      peak = Math.max(peak, Math.abs(want));
      max = Math.max(max, Math.abs(want - decoded.data[c][i]));
    }
    assert(peak > 1.5, 'the fixture goes above full scale');
    assert(max <= LIMIT, 'decoded within 2^-23: ' + max);
    // A damaged frame is refused, not decoded into noise (CRC-16).
    const broken = Buffer.from(fs.readFileSync(marked));
    broken[broken.length - 600] ^= 0x55;
    const brokenFile = path.join(scratch, 'broken.flac');
    fs.writeFileSync(brokenFile, broken);
    assert.throws(() => audio.decodeFlacSync(brokenFile), /flac-(crc|sync|format|truncated)/, 'a damaged frame is refused');

    // --- decoded float WAV, readable by the existing WAV readers -------------------------------------------------
    const out = path.join(scratch, 'out.wav');
    audio.decodeToWavSync(marked, out);
    const w = await wavSamples(out);
    assert.equal(w.h.code, 3); assert.equal(w.h.bits, 32); assert.equal(w.h.frames, h.frames);
    let maxWav = 0;
    for (let i = 0; i < h.frames * 2; i++) maxWav = Math.max(maxWav, Math.abs(w.b.readFloatLE(i * 4) - b.readFloatLE(i * 4)));
    assert(maxWav <= LIMIT);

    // --- what a file is ----------------------------------------------------------------------------------------
    const p1 = await audio.probe(marked), p2 = await audio.probe(source), p3 = await audio.probe(plain);
    assert.deepEqual([p1.format, p1.frames, audio.isStemFormat(p1)], ['flac', 22050, true]);
    assert.deepEqual([p2.format, p2.float, audio.isStemFormat(p2)], ['wav', true, true]);
    assert.equal(audio.isStemFormat(p3), false, 'an unmarked 16-bit FLAC is not a stem');

    // --- the decode cache ----------------------------------------------------------------------------------------
    const dir = path.join(scratch, 'cache');
    let decodes = 0;
    const cache = audio.createStemCache({dir, limitBytes: 1, decode: async (a, b) => { decodes++; audio.decodeToWavSync(a, b); }});
    assert.equal(await cache.playable(source), source, 'a WAV is read as it is');
    const stem = path.join(scratch, 'stem.flac');
    fs.copyFileSync(marked, stem);
    const [x, y] = await Promise.all([cache.playable(stem), cache.playable(stem)]);
    assert.equal(x, y); assert.equal(decodes, 1, 'two requests at once share one decode');
    assert(x.startsWith(dir) && !x.startsWith(scratch + path.sep + 'stem'), 'the decoded copy lives in the cache folder');
    assert.equal(await cache.playable(stem), x); assert.equal(decodes, 1, 'and is reused');
    // A recently used copy is kept even over the size limit (a song being played must not lose its file).
    assert(fs.existsSync(x));
    fs.utimesSync(stem, new Date(Date.now() + 5000), new Date(Date.now() + 5000));
    const z = await cache.playable(stem);
    assert.notEqual(z, x, 'a changed stem gets a new copy');
    assert.equal(decodes, 2);
    // Old copies over the limit go - but not one this process handed out recently (it may be playing).
    const old = new Date(Date.now() - 3 * 3600 * 1000);
    fs.utimesSync(x, old, old);
    await cache.evict(z);
    assert(fs.existsSync(x), 'a copy this process used recently stays, whatever its file time');
    await audio.createStemCache({dir, limitBytes: 1}).evict(z);
    assert(!fs.existsSync(x) && fs.existsSync(z), 'another process removes the old copy over the limit; a fresh one stays');

    // --- byte ranges for audio elements ------------------------------------------------------------------------
    const size = fs.statSync(z).size;
    let r = await audio.rangeResponse(z, 'bytes=10-19');
    assert.equal(r.status, 206); assert.equal(r.headers.get('content-range'), `bytes 10-19/${size}`);
    assert.deepEqual(Buffer.from(await r.arrayBuffer()), fs.readFileSync(z).subarray(10, 20));
    r = await audio.rangeResponse(z, 'bytes=-8');
    assert.equal(r.status, 206); assert.equal(Buffer.from(await r.arrayBuffer()).length, 8);
    r = await audio.rangeResponse(z, null);
    assert.equal(r.status, 200); assert.equal(r.headers.get('content-type'), 'audio/wav');
    assert.equal(Buffer.from(await r.arrayBuffer()).length, size);
    r = await audio.rangeResponse(z, `bytes=${size + 5}-`);
    assert.equal(r.status, 416);

    // --- file:// in the renderers: a marked FLAC is answered decoded; everything else passes through -------------
    let handler = null;
    const passed = [];
    const protocol = {handle: (scheme, fn) => { assert.equal(scheme, 'file'); handler = fn; }};
    const net = {fetch: async (request, options) => { assert.equal(options.bypassCustomProtocolHandlers, true); passed.push(request.url); return new Response('passed'); }};
    audio.registerFileProtocol({protocol, net, cache});
    const ask = (file, range) => handler(new Request(require('node:url').pathToFileURL(file).href, {headers: range ? {range} : {}}));
    assert.equal(await (await ask(path.join(__dirname, '..', 'index.html'))).text(), 'passed', 'the app\'s own page passes through');
    assert.equal(await (await ask(path.join(__dirname, '..', 'app.js'))).text(), 'passed', 'and its scripts');
    // Audio is answered here, with byte ranges (Chromium refuses a WAV through the pass-through: it ignores ranges).
    r = await ask(plain, 'bytes=0-3');
    assert.equal(r.status, 206); assert.equal(r.headers.get('content-type'), 'audio/flac');
    assert.equal(Buffer.from(await r.arrayBuffer()).toString('latin1'), 'fLaC', 'an ordinary FLAC (an original song) as it is');
    r = await ask(source, 'bytes=0-3');
    assert.equal(r.status, 206); assert.equal(r.headers.get('content-type'), 'audio/wav');
    assert.deepEqual(Buffer.from(await r.arrayBuffer()), fs.readFileSync(source).subarray(0, 4), 'a WAV stem as it is');
    r = await ask(stem, 'bytes=0-11');
    assert.equal(r.status, 206);
    assert.equal(Buffer.from(await r.arrayBuffer()).toString('latin1', 0, 4), 'RIFF', 'a marked FLAC is served as its decoded WAV');
    assert.equal((await ask(path.join(scratch, 'gone.wav'))).status, 404, 'a missing file is a 404');
    assert.equal(passed.length, 2);

    const registry = audio.createXmlStemPlayback();
    const asStem = (file,name='guitar') => ({name,audioUrl:require('node:url').pathToFileURL(file).href});
    const readUrl = url => handler(new Request(url,{headers:{range:'bytes=0-3'}}));
    const registeredFile = path.join(scratch,'extracted-strings.flac');
    fs.copyFileSync(marked,registeredFile);
    const strings = asStem(registeredFile,'strings');
    const [first,second] = await Promise.all([registry.describe(strings),registry.describe(strings)]);
    assert.equal(first.playbackUrl,second.playbackUrl);
    assert.equal(first.audioUrl,strings.audioUrl);
    assert.equal(first.playbackGain,2);
    assert.deepEqual(await registry.describe(asStem(plain)),asStem(plain));
    assert.deepEqual(await registry.describe(asStem(source)),asStem(source));
    audio.registerFileProtocol({protocol,net,xmlPlayback:registry,cache:{playable(){throw Error('unexpected whole-file decode');}}});
    r=await readUrl(first.playbackUrl);
    assert.equal(r.status,206);
    assert.equal(r.headers.get('content-type'),'audio/flac');
    assert.equal(await r.text(),'fLaC');
    assert.equal((await readUrl(first.playbackUrl.replace('extracted-strings','unregistered'))).status,410);
    fs.utimesSync(registeredFile,new Date(0),new Date(0));
    assert.equal((await readUrl(first.playbackUrl)).status,410);
    assert.notEqual((await registry.describe(strings)).playbackUrl,first.playbackUrl);

    // --- the existing readers through the cache --------------------------------------------------------------
    const reader = require('../core/mix-audio.cjs').createAudioReader({audioCache: cache});
    const registered = await reader.register(stem, 'track-1');
    assert.equal(registered.channels, 2); assert(Math.abs(registered.duration - 0.5) < 1e-9);
    const chunk = await reader.chunk({trackId: 'track-1', key: registered.key, index: 0});
    let maxChunk = 0;
    for (let i = 0; i < chunk.frames; i++) for (let c = 0; c < 2; c++) maxChunk = Math.max(maxChunk, Math.abs(chunk.channels[c][i] - b.readFloatLE((i * 2 + c) * 4)));
    assert(maxChunk <= LIMIT, 'mixing reads the stem at its own level (gain restored)');
    const envelope = await require('../core/stem-envelope.cjs').computeEnvelope(stem, {playable: file => cache.playable(file)});
    const plainEnvelope = await require('../core/stem-envelope.cjs').computeEnvelope(source, {playable: async file => file});
    assert.equal(envelope.size, fs.statSync(stem).size, 'the envelope reports the stem itself');
    assert.equal(envelope.values.length, plainEnvelope.values.length);
    assert(envelope.values.every((v, i) => Math.abs(v - plainEnvelope.values[i]) <= 1), 'and has the same loudness as the WAV it came from');

    // --- the readers that check stem files accept both formats --------------------------------------------------
    const derived = require('../core/derived-assets.cjs');
    const root = path.join(scratch, 'analysis'), song = path.join(scratch, 'song.wav');
    fs.writeFileSync(song, 'x');
    const st = fs.statSync(song);
    const track = {id: 'flac-track-1234567890', title: 'T', artist: 'A', album: 'B', number: 1, filePath: song};
    const dirTrack = derived.trackDirectory(track, root), runId = crypto.randomUUID();
    fs.mkdirSync(path.join(dirTrack, 'stems', runId), {recursive: true});
    const manifest = {schemaVersion: 1, kind: 'stems', trackId: track.id, runId, model: 'htdemucs_6s', options: {shifts: 1, overlap: 0.25},
      source: {path: song, size: st.size, mtimeMs: st.mtimeMs}, stems: []};
    for (const name of ['bass', 'piano', 'guitar', 'drums', 'vocals', 'other']) {
      const flac = name !== 'other';
      const file = `stems/${runId}/${name}.${flac ? 'flac' : 'wav'}`;
      fs.copyFileSync(flac ? marked : source, path.join(dirTrack, file));
      manifest.stems.push({name, file, sampleRate: 44100, channels: 2, frames: 22050, ...(flac ? {encoding: 'flac-24', gain: 2} : {})});
    }
    fs.writeFileSync(path.join(dirTrack, 'stems.json'), JSON.stringify(manifest));
    const assets = derived.createDerivedAssets({analysisRoot: root});
    const read = await assets.readStems(track);
    assert(read.ok, 'a separation with FLAC and WAV stems reads: ' + read.error);
    for (const bad of [{encoding: undefined}, {gain: 1}, {encoding: 'flac-16'}]) {
      const broken = {...manifest, stems: manifest.stems.map((s, i) => i === 0 ? {...s, ...bad} : s)};
      fs.writeFileSync(path.join(dirTrack, 'stems.json'), JSON.stringify(broken));
      assert.equal((await assets.readStems(track)).error, 'stems-invalid', 'a FLAC stem must say what it is: ' + JSON.stringify(bad));
    }
    const wrongName = {...manifest, stems: manifest.stems.map((s, i) => i === 0 ? {...s, file: s.file.replace('bass.flac', 'bass.mp3')} : s)};
    fs.writeFileSync(path.join(dirTrack, 'stems.json'), JSON.stringify(wrongName));
    assert.equal((await assets.readStems(track)).error, 'stems-invalid', 'only .wav and .flac');
    fs.writeFileSync(path.join(dirTrack, 'stems.json'), JSON.stringify(manifest));

    // Storage page: FLAC stems are known files (a run folder of FLACs is not "unknown files") and count as stem audio.
    const storage = require('../core/storage.cjs').createStorage({getRoot: () => root});
    const scan = await storage.scan();
    const row = scan.rows.find(r => r.runId === runId);
    assert(row && row.blocked === '', 'a FLAC stem folder is not blocked: ' + (row && row.blocked));
    assert(scan.wavBytes >= fs.statSync(marked).size * 5, 'FLAC stems count as stem audio');

    // The vocal line's split files may be FLAC.
    const vocals = require('../core/score-vocals.cjs');
    const splitRun = crypto.randomUUID();
    fs.mkdirSync(path.join(dirTrack, 'refinement', splitRun), {recursive: true});
    fs.copyFileSync(marked, path.join(dirTrack, 'refinement', splitRun, 'target.flac'));
    fs.copyFileSync(marked, path.join(dirTrack, 'refinement', splitRun, 'residual.flac'));
    const vocalStem = fs.statSync(path.join(dirTrack, 'stems', runId, 'vocals.flac'));
    fs.writeFileSync(path.join(dirTrack, 'refinement', 'k.json'), JSON.stringify({kind: 'refinement', engine: 'karaoke-lead', runId: splitRun,
      originalSource: {kind: 'stem', runId, stem: 'vocals', size: vocalStem.size, mtimeMs: vocalStem.mtimeMs}}));
    const split = await vocals.readSplit(dirTrack, {runId: splitRun, lead: `refinement/${splitRun}/target.flac`, backing: `refinement/${splitRun}/residual.flac`, manifest: 'refinement/k.json'},
      {stemRunId: runId, size: vocalStem.size, mtimeMs: vocalStem.mtimeMs, frames: 22050, channels: 2, sampleRate: 44100});
    assert(split.ok, 'a FLAC lead / backing reads: ' + split.error);
    fs.copyFileSync(plain, path.join(dirTrack, 'refinement', splitRun, 'residual.flac'));
    const wrong = await vocals.readSplit(dirTrack, {runId: splitRun, lead: `refinement/${splitRun}/target.flac`, backing: `refinement/${splitRun}/residual.flac`, manifest: 'refinement/k.json'},
      {stemRunId: runId, size: vocalStem.size, mtimeMs: vocalStem.mtimeMs, frames: 22050, channels: 2, sampleRate: 44100});
    assert.equal(wrong.error, 'split-audio-invalid', 'an unmarked FLAC is not accepted as a split file');

    console.log('stem audio: ok (FLAC decoder within 2^-23 incl. samples above 1, damaged frame refused, decode cache with sharing / reuse / eviction, byte ranges, file:// answers only marked FLACs, mixing + envelope read FLAC at its own level, stems / storage / vocal split accept FLAC)');
  } finally {
    await fsp.rm(scratch, {recursive: true, force: true});
  }
})().catch(error => { console.error(error); process.exitCode = 1; });
