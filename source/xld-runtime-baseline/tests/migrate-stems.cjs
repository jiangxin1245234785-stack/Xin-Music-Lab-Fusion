'use strict';
// Audit fix 2 (2026-11-15): scripts/migrate-stems.cjs on a made-up song in a temp analysis root.
// Needs a runtime Python with numpy + soundfile (XLD_MIDI_PYTHON, else runtime/0.5.0/envs/basic next to the source);
// says SKIP and exits 0 without one. Writes only to a temp folder.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const fsp = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const crypto = require('node:crypto');

const python = process.env.XLD_MIDI_PYTHON || path.resolve(__dirname, '..', '..', '..', 'runtime', '0.5.0', 'envs', 'basic', process.platform === 'win32' ? 'python.exe' : 'bin/python');
if (!fs.existsSync(python)) { console.log('migrate-stems: SKIP (no runtime Python with soundfile)'); process.exit(0); }
process.env.XLD_MIDI_PYTHON = python;
// The Python side first (analysis-midi/stem_audio.py), with the same interpreter.
{
  const run = require('node:child_process').spawnSync(python, ['-I', path.join(__dirname, 'stem-audio.py')], {encoding: 'utf8', windowsHide: true});
  if (run.status !== 0) { console.error(run.stdout, run.stderr); process.exit(1); }
  process.stdout.write(run.stdout);
}

const tool = require('../scripts/migrate-stems.cjs');
const derived = require('../core/derived-assets.cjs');
const HEADER = Buffer.from('4d546864000000060000000103c04d54726b0000000400ff2f00', 'hex');

function floatWav(file, frames, fill) {
  const data = Buffer.alloc(frames * 8);
  for (let i = 0; i < frames; i++) for (let c = 0; c < 2; c++) data.writeFloatLE(fill(i, c), (i * 2 + c) * 4);
  const h = Buffer.alloc(44);
  h.write('RIFF', 0, 'latin1'); h.writeUInt32LE(36 + data.length, 4); h.write('WAVE', 8, 'latin1'); h.write('fmt ', 12, 'latin1');
  h.writeUInt32LE(16, 16); h.writeUInt16LE(3, 20); h.writeUInt16LE(2, 22); h.writeUInt32LE(44100, 24); h.writeUInt32LE(44100 * 8, 28);
  h.writeUInt16LE(8, 32); h.writeUInt16LE(32, 34); h.write('data', 36, 'latin1'); h.writeUInt32LE(data.length, 40);
  fs.mkdirSync(path.dirname(file), {recursive: true});
  fs.writeFileSync(file, Buffer.concat([h, data]));
}
function tree(dir) {
  const out = {};
  (function walk(d) { for (const e of fs.readdirSync(d, {withFileTypes: true})) { const f = path.join(d, e.name); if (e.isDirectory()) walk(f); else out[path.relative(dir, f)] = crypto.createHash('sha256').update(fs.readFileSync(f)).digest('hex'); } })(dir);
  return out;
}

async function makeSong(root, {loud = false} = {}) {
  const audio = path.join(root, '..', 'song-' + crypto.randomUUID() + '.wav');
  fs.writeFileSync(audio, 'source');
  const stat = fs.statSync(audio);
  const track = {id: crypto.randomBytes(20).toString('hex'), title: 'Song', artist: 'Artist', album: 'Album', number: 1, filePath: audio};
  const dir = derived.trackDirectory(track, root), runId = crypto.randomUUID(), frames = 44100;
  const stems = {schemaVersion: 1, kind: 'stems', trackId: track.id, runId, model: 'htdemucs_6s', options: {shifts: 1, overlap: 0.25},
    source: {path: audio, size: stat.size, mtimeMs: stat.mtimeMs}, stems: []};
  ['bass', 'piano', 'guitar', 'drums', 'vocals', 'other'].forEach((name, k) => {
    const file = `stems/${runId}/${name}.wav`;
    floatWav(path.join(dir, file), frames, (i, c) => {
      const v = Math.sin(i * (0.01 + k * 0.003) + c) * 0.5 + (Math.sin(i * 7.1) * 0.05);
      return name === 'drums' && i % 5000 < 20 ? (loud ? 2.5 : 1.4) * Math.sign(v || 1) : v;
    });
    stems.stems.push({name, file, sampleRate: 44100, channels: 2, frames});
  });
  fs.writeFileSync(path.join(dir, 'stems.json'), JSON.stringify(stems, null, 2));
  fs.mkdirSync(path.join(dir, 'stems'), {recursive: true});
  fs.writeFileSync(path.join(dir, 'stems', 'demucs-6s.json'), JSON.stringify(stems, null, 2));
  fs.writeFileSync(path.join(dir, 'track.json'), JSON.stringify({schemaVersion: 1, trackId: track.id, number: 1, title: 'Song', artist: 'Artist', album: 'Album', source: audio}));
  const assets = derived.createDerivedAssets({analysisRoot: root});
  let clock = 0;
  for (const [stem, engine] of [['bass', 'bass-highres'], ['guitar', 'basic-pitch'], ['drums', 'drums-adtof']]) {
    const profile = derived.profileFor(engine);
    if (!profile) continue;
    const id = crypto.randomUUID(), prefix = `midi/${stem}/${id}/`;
    fs.mkdirSync(path.join(dir, prefix), {recursive: true});
    fs.writeFileSync(path.join(dir, prefix + stem + '.mid'), HEADER);
    fs.writeFileSync(path.join(dir, prefix + 'notes.json'), JSON.stringify({schemaVersion: 1, kind: 'notes', trackId: track.id, stem, sourceRunId: runId, runId: id, engine, model: profile.model, timeOrigin: 0, duration: 1, notes: [{start: 0, end: 0.1, pitch: 40, velocity: 90}]}));
    const wav = fs.statSync(path.join(dir, `stems/${runId}/${stem}.wav`));
    const record = {schemaVersion: 1, kind: 'midi', trackId: track.id, stem, runId: id, sourceRunId: runId,
      source: {path: path.join(dir, `stems/${runId}/${stem}.wav`), size: wav.size, mtimeMs: wav.mtimeMs},
      engine, model: profile.model, options: profile.options, backend: {checkpointSha256: profile.checkpoint?.sha256},
      timeOrigin: 0, duration: 1, noteCount: 1, tempoMode: 'fixed-timebase', quantized: false,
      file: prefix + stem + '.mid', notesFile: prefix + 'notes.json', createdAt: new Date(Date.UTC(2026, 8, 20, 0, 0, clock++)).toISOString()};
    fs.mkdirSync(path.join(dir, 'midi', stem, 'runs'), {recursive: true});
    fs.writeFileSync(path.join(dir, 'midi', stem, 'runs', id + '.json'), JSON.stringify(record));
    await assets.midi.activate(track, record);
  }
  return {dir, track, runId};
}

(async () => {
  const base = await fsp.mkdtemp(path.join(os.tmpdir(), 'xld-migrate-'));
  const root = path.join(base, 'analysis');
  fs.mkdirSync(root);
  try {
    const m = tool.modules(root);
    const {dir, track, runId} = await makeSong(root);
    const before = tree(dir);
    const jsonBefore = Object.fromEntries(Object.keys(before).filter(f => f.endsWith('.json')).map(f => [f, fs.readFileSync(path.join(dir, f), 'utf8')]));
    // A record bound to a WAV made again by libsndfile (with its fact / PEAK chunks) is bound to that WAV's size and
    // time; this test's WAVs have a bare header, so those two numbers may differ, nothing else may.
    const unbound = text => JSON.stringify(JSON.parse(text), (key, value) => key === 'size' || key === 'mtimeMs' ? undefined : value);
    const state0 = await tool.snapshot(m, dir, track);
    assert.equal(state0.stems.ok, true);
    assert(Object.values(state0.midi).some(s => s.read[0] === 'ok'), 'the made-up song has MIDI that reads');

    // --- the plan -------------------------------------------------------------------------------------------------
    const p = await tool.plan(m, root, dir);
    assert.equal(p.skip, null);
    assert.equal(p.files.length, 6, 'six stems (named by two manifests, counted once)');

    // --- convert, WAVs kept ----------------------------------------------------------------------------------
    const r1 = await tool.migrateSong(m, root, dir, {deleteWav: false});
    assert.equal(r1.result, 'converted', JSON.stringify(r1));
    assert(r1.maxError <= 2 ** -23 && r1.jsMaxError <= 2 ** -23 && r1.peak > 1.3, 'read back within 2^-23 by both decoders, above-full-scale samples included');
    const stems = JSON.parse(fs.readFileSync(path.join(dir, 'stems.json'), 'utf8'));
    assert(stems.stems.every(s => s.file.endsWith('.flac') && s.encoding === 'flac-24' && s.gain === 2));
    const kept = JSON.parse(fs.readFileSync(path.join(dir, 'stems', 'demucs-6s.json'), 'utf8'));
    assert(kept.stems.every(s => s.file.endsWith('.flac')), 'the engine manifest too');
    const bassRecord = JSON.parse(fs.readFileSync(path.join(dir, 'midi', 'bass.json'), 'utf8'));
    assert(bassRecord.source.path.endsWith('bass.flac') && bassRecord.source.migratedFrom.path.endsWith('bass.wav'), 'MIDI is bound to the FLAC, the old binding kept');
    assert(fs.existsSync(path.join(dir, `stems/${runId}/bass.wav`)), 'WAVs are kept without --delete-wav');
    assert.deepEqual(await tool.snapshot(m, dir, track), state0, 'the app reads the song the same way');
    for (const [file, sha] of Object.entries(before)) if (/\.(mid|wav)$|notes\.json$/.test(file)) assert.equal(tree(dir)[file], sha, 'untouched: ' + file);
    assert.equal(JSON.parse(fs.readFileSync(path.join(dir, '.flac-migration.json'), 'utf8')).state, 'switched');
    assert.equal((await tool.migrateSong(m, root, dir, {deleteWav: false})).result, 'converted, WAVs kept', 'a second run leaves it');

    // --- delete the WAVs ------------------------------------------------------------------------------------------
    const r2 = await tool.migrateSong(m, root, dir, {deleteWav: true});
    assert.equal(r2.wavDeleted, 6, JSON.stringify(r2));
    assert(!fs.existsSync(path.join(dir, `stems/${runId}/bass.wav`)));
    assert.deepEqual(await tool.snapshot(m, dir, track), state0, 'and still reads the same with only FLACs');
    assert.equal((await tool.migrateSong(m, root, dir, {deleteWav: true})).result, 'already converted');

    // --- roll back: WAVs made again from the FLACs, every record as it was ------------------------------------------
    const r3 = await tool.rollbackSong(m, dir);
    assert.equal(r3.result, 'rolled back'); assert.equal(r3.restoredWavs, 6); assert.equal(r3.sameAsBefore, true, JSON.stringify(r3));
    const after = tree(dir);
    for (const [file, sha] of Object.entries(before)) {
      if (file.endsWith('.wav')) continue;
      if (file.endsWith('.json') && after[file] !== sha) assert.equal(unbound(fs.readFileSync(path.join(dir, file), 'utf8')), unbound(jsonBefore[file]), 'restored apart from the WAV size / time: ' + file);
      else assert.equal(after[file], sha, 'restored byte for byte: ' + file);
    }
    assert(Object.keys(after).every(file => !file.endsWith('.flac') && !file.endsWith('.flac-migration.json')), 'no FLAC and no log left');
    assert.equal(fs.statSync(path.join(dir, `stems/${runId}/bass.wav`)).size, fs.statSync(path.join(dir, `stems/${runId}/piano.wav`)).size, 'WAVs back');

    // --- a record naming a WAV in a way the tool does not know: the song is left exactly as it was --------------------
    const odd = path.join(dir, 'midi', 'odd.json');
    fs.writeFileSync(odd, JSON.stringify({kind: 'something', audio: path.join(dir, `stems/${runId}/bass.wav`)}));
    const snapshotOdd = tree(dir);
    const r4 = await tool.migrateSong(m, root, dir, {deleteWav: true});
    assert.equal(r4.result, 'left as it was'); assert(/still naming a WAV/.test(r4.why), r4.why);
    assert.deepEqual(tree(dir), snapshotOdd, 'nothing changed');
    fs.rmSync(odd);

    // --- a stem too loud for half level: refused at encode, nothing changed ------------------------------------------
    const loud = await makeSong(root, {loud: true});
    const loudBefore = tree(loud.dir);
    const r5 = await tool.migrateSong(m, root, loud.dir, {deleteWav: true});
    assert.equal(r5.result, 'left as it was'); assert(/encode/.test(r5.why), r5.why);
    assert.deepEqual(tree(loud.dir), loudBefore);

    // --- dry run lists what it would do ---------------------------------------------------------------------------
    const p2 = await tool.plan(m, root, dir);
    assert.equal(p2.files.length, 6); assert(p2.estimate > 0 && p2.estimate < p2.bytes);
    console.log('migrate-stems: ok (plan, convert with both read-backs within 2^-23, records rebound with the old binding kept, app reading unchanged, WAV deletion, rollback to byte-identical records, unknown reference and a 2.5 peak leave the song untouched)');
  } finally {
    await fsp.rm(base, {recursive: true, force: true});
  }
})().catch(error => { console.error(error); process.exitCode = 1; });
