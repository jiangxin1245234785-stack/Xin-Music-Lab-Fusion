'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const path = require('node:path');
const os = require('node:os');
const crypto = require('node:crypto');
const {createService} = require('../core/analysis-service.cjs');
const {trackDirectory} = require('../core/derived-assets.cjs');
const {createMoodBackfill} = require('../core/mood-backfill.cjs');

function tone() {
  const rate = 24000, samples = rate * 2, bytes = Buffer.alloc(44 + samples * 2);
  bytes.write('RIFF'); bytes.writeUInt32LE(bytes.length - 8, 4); bytes.write('WAVEfmt ', 8); bytes.writeUInt32LE(16, 16);
  bytes.writeUInt16LE(1, 20); bytes.writeUInt16LE(1, 22); bytes.writeUInt32LE(rate, 24); bytes.writeUInt32LE(rate * 2, 28);
  bytes.writeUInt16LE(2, 32); bytes.writeUInt16LE(16, 34); bytes.write('data', 36); bytes.writeUInt32LE(samples * 2, 40);
  for (let i = 0; i < samples; i++) bytes.writeInt16LE(Math.round(9000 * Math.sin(i * 2 * Math.PI * 3000 / rate)), 44 + i * 2);
  return bytes;
}
const absent = file => fs.stat(file).then(() => false, error => { if (error.code === 'ENOENT') return true; throw error; });
const hash = bytes => crypto.createHash('sha256').update(bytes).digest('hex');
async function fingerprint(file) {
  return {sha256: hash(await fs.readFile(file)), mtimeNs: String((await fs.stat(file, {bigint: true})).mtimeNs)};
}
async function exerciseBatch(temp) {
  const root = path.join(temp, 'Analysis'), input = path.join(temp, 'Music'), wav = path.join(temp, 'original.wav');
  await fs.mkdir(input);
  await fs.writeFile(wav, tone());
  async function song(id, album, title, analyzed, offline = false) {
    const filePath = path.join(input, id + '.wav');
    if (!offline) await fs.copyFile(wav, filePath);
    const track = {id, album, title, artist: album, number: 1, filePath};
    if (analyzed) {
      const dir = trackDirectory(track, root);
      await fs.mkdir(dir, {recursive: true});
      await fs.writeFile(path.join(dir, 'track.json'), JSON.stringify({trackId:id, album, title, number:1, artist:album, source:filePath}));
    }
    return track;
  }
  const existing = await song('a-current', 'A', 'Current', true);
  const fresh = await song('a-fresh', 'A', 'Same Title', false);
  const stale = await song('b-stale', 'B', 'Same Title', true);
  const offline = await song('b-offline', 'B', 'Missing audio', true, true);
  const untouched = await song('b-new', 'B', 'New in library only', false);
  const staleDir = trackDirectory(stale, root), staleCurve = path.join(staleDir, 'mood-curve.json');
  await fs.writeFile(staleCurve, '{}');
  const midi = path.join(staleDir, 'midi', 'piano', 'preserved.mid');
  await fs.mkdir(path.dirname(midi), {recursive: true});
  await fs.writeFile(midi, Buffer.from('4d546864000000060000000101e04d54726b0000000400ff2f00','hex'));
  const bridge = path.join(staleDir, 'music-lab.json');
  await fs.writeFile(bridge, JSON.stringify({trackId:stale.id, midi:'midi/piano/preserved.mid'}));
  const beforeMidi = await fingerprint(midi), beforeBridge = await fingerprint(bridge);
  const real = createService({analysisRoot:root});
  const calls = [], events = [];
  const service = {...real, run: async (track, engine, options, onTask) => {
    calls.push(track.id);
    assert.equal(engine, 'mood-curve'); assert.deepEqual(options, {});
    return real.run(track, engine, options, onTask);
  }};
  const batch = createMoodBackfill({service, getRoot:() => root, isBusy:() => false,
    getAlbum:id => ({A:{title:'A',tracks:[existing,fresh]}, B:{title:'B',tracks:[stale,offline,untouched]}})[id],
    onChange:status => events.push(status), onTask:task => { if (task) assert.equal(task.engine, 'mood-curve'); }});
  assert.equal((await batch.run('invalid')).error, 'mood-backfill-scope');
  assert.equal((await batch.run('album', 'unknown')).error, 'mood-backfill-album');
  const python = process.env.XLD_MIDI_PYTHON || path.resolve(__dirname, '../../../runtime/0.5.0/envs/basic', process.platform === 'win32' ? 'python.exe' : 'bin/python');
  if (await absent(python)) { console.log('Mood backfill audio integration skipped: local mood runner unavailable'); return; }
  process.env.XLD_MIDI_PYTHON = python;
  const seed = await real.run(existing, 'mood-curve');
  assert.equal(seed.ok, true, seed.detail || seed.error);
  const existingCurve = path.join(trackDirectory(existing, root), 'mood-curve.json');
  const beforeCurrent = await fingerprint(existingCurve);
  const first = batch.run('album', 'A');
  assert.equal((await batch.run('library')).error, 'analysis-busy');
  const a = await first;
  assert.equal(a.ok, true, JSON.stringify(a));
  assert.deepEqual([a.status.total,a.status.computed,a.status.current,a.status.failed], [2,1,1,0]);
  assert.deepEqual(calls, [fresh.id]);
  assert.deepEqual(await fingerprint(existingCurve), beforeCurrent);
  assert.equal(await fs.readFile(staleCurve, 'utf8'), '{}');
  const library = await batch.run('library');
  assert.equal(library.ok, true, JSON.stringify(library));
  assert.deepEqual([library.status.total,library.status.computed,library.status.current,library.status.missing], [4,1,2,1]);
  assert.deepEqual(library.status.issues, [{title:offline.title,error:'track-missing'}]);
  assert.deepEqual(calls, [fresh.id, stale.id]);
  assert.equal(await real.readMoodStatus(stale), 'current');
  const afterComputed = await fingerprint(staleCurve);
  const again = await batch.run('library');
  assert.deepEqual([again.status.total,again.status.computed,again.status.current,again.status.missing], [4,0,3,1]);
  assert.deepEqual(calls, [fresh.id, stale.id]);
  assert.equal(await absent(trackDirectory(untouched, root)), true);
  assert.deepEqual(await fingerprint(staleCurve), afterComputed);
  assert.deepEqual(await fingerprint(midi), beforeMidi);
  assert.deepEqual(await fingerprint(bridge), beforeBridge);
  assert.deepEqual(events.map(value=>value.revision), Array.from({length:events.length}, (_,i)=>i+1));
  console.log('Mood backfill audio integration PASS: A (2 total, 1 computed, 1 current); library (4 total, 1 computed, 2 current, 1 missing audio); rerun (0 computed, 3 current, 1 missing audio). Same-title isolation, current curves and bridge fingerprints verified. Preserved MIDI SHA-256:', beforeMidi.sha256);
}

async function interlocks(temp) {
  const filePath = path.join(temp, 'lock-test.wav'); await fs.writeFile(filePath, 'stub');
  const tracks = ['first','second'].map(id=>({id, title:id, filePath}));
  let ready, finish, occupied = true, error = null;
  const started = new Promise(resolve => { ready = resolve; });
  const seen = [];
  const service = {
    setAnalysisRoot: () => {}, readMoodStatus:() => 'missing',
    run(track) {
      seen.push(track.id);
      if (error) return Promise.resolve({ok:false, error});
      if (!occupied) return Promise.resolve({ok:true, cached:true});
      ready(); return new Promise(resolve => { finish = resolve; });
    },
    cancel() { finish({ok:false, error:'analysis-cancelled'}); }
  };
  const make = isBusy => createMoodBackfill({service,getRoot:() => temp,getAlbum:() => ({title:'A',tracks}),isBusy});
  assert.equal((await make(() => true).run('album','A')).error, 'analysis-busy');
  const batch = make(() => false);
  const run = batch.run('album','A'); await started;
  assert.equal((await batch.run('album','A')).error, 'analysis-busy');
  assert.equal(batch.stop().ok, true);
  assert.equal((await run).status.cancelled, true); assert.deepEqual(seen, ['first']); assert.equal(batch.busy(), false);
  occupied = false; error = 'analysis-locked';
  assert.equal((await batch.run('album','A')).status.error, error); assert.deepEqual(seen, ['first','first']);
  error = 'analysis-failed';
  const failed = (await batch.run('album','A')).status;
  assert.equal(failed.failed, 2); assert.equal(failed.issues.length, 2);
  error = null;
  const retry = await batch.run('album','A'); assert.equal(retry.ok, true); assert.equal(retry.status.current, 2);
  console.log('Mood backfill interlocks PASS: simultaneous starts, cancel, shared lock, per-track failure, retry and cache race');
}
async function main() {
  const temp = await fs.mkdtemp(path.join(os.tmpdir(), 'xld-backfill-'));
  try { await interlocks(temp); await exerciseBatch(temp); }
  finally {
    assert.equal(path.dirname(await fs.realpath(temp)), await fs.realpath(os.tmpdir()));
    assert(path.basename(temp).startsWith('xld-backfill-'));
    await fs.rm(temp, {recursive:true, force:true});
  }
}
if (require.main === module) main().catch(error => { console.error(error); process.exitCode = 1; });
module.exports = {tone};
