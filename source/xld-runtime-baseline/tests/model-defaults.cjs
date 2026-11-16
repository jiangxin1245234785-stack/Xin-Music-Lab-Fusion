'use strict';
// MODELS-2 (2026-11-15): which model a part uses lives in two places - models.json defaultFor (the 转谱 panel's
// default, and what a run without an engine uses) and oneclick-plan.js PRESETS (效率 / 质量). They must agree:
//  - every part transcribed with MuScriptor (piano, bass, guitar, strings) is Medium in 效率 and Large in 质量;
//  - the manual default of piano, bass and guitar is the 效率 choice (Medium); strings keeps Large (an earlier
//    listening verdict, 2026-09) and drums the DrumSep engine, both the 质量 choice; no part defaults outside its presets;
//  - every preset model exists in models.json for that part.
// And a change of default touches no stored result: a song transcribed with the old piano / bass defaults keeps
// showing those versions as current (not superseded, not re-run).
const fs = require('node:fs/promises'), path = require('node:path'), os = require('node:os'), crypto = require('node:crypto'), assert = require('node:assert/strict');
const PROFILES = require('../analysis-midi/models.json');
const P = require('../oneclick-plan.js');
const {createDerivedAssets, trackDirectory, profileFor, defaultEngine} = require('../core/derived-assets.cjs');

const byId = id => PROFILES.find(p => p.id === id);
const defaults = Object.fromEntries(PROFILES.filter(p => p.defaultFor).map(p => [p.defaultFor, p.id]));
assert.equal(PROFILES.filter(p => p.defaultFor).length, Object.keys(defaults).length, 'one default per part');
const size = id => byId(id)?.backend === 'muscriptor' ? (byId(id).checkpoint.repository.endsWith('-large') ? 'large' : 'medium') : null;

for (const preset of ['efficiency', 'quality']) for (const stem of ['piano', 'bass', 'guitar', 'strings', 'drums']) {
  const id = P.PRESETS[preset][stem];
  assert(byId(id), `${preset}.${stem}: ${id} is in models.json`);
  assert(byId(id).stems.includes(stem) && !(byId(id).retiredFor || []).includes(stem), `${preset}.${stem}: ${id} serves ${stem}`);
  assert.deepEqual(P.OPTIONS[stem], [P.PRESETS.efficiency[stem], P.PRESETS.quality[stem]], `${stem}: the one-click options are exactly the two presets`);
}
for (const stem of ['piano', 'bass', 'guitar', 'strings']) {
  assert.equal(size(P.PRESETS.efficiency[stem]), 'medium', `${stem}: 效率 = MuScriptor Medium`);
  assert.equal(size(P.PRESETS.quality[stem]), 'large', `${stem}: 质量 = MuScriptor Large`);
}
for (const stem of ['piano', 'bass', 'guitar']) assert.equal(defaults[stem], P.PRESETS.efficiency[stem], `${stem}: the manual default is the 效率 choice`);
for (const stem of ['strings', 'drums']) assert.equal(defaults[stem], P.PRESETS.quality[stem], `${stem}: the manual default is the 质量 choice`);
for (const stem of ['piano', 'bass', 'guitar', 'strings', 'drums']) assert.equal(defaultEngine(stem), defaults[stem], `${stem}: the core reads the same default`);
// The old defaults stay as alternatives.
for (const [id, stem] of [['piano-transkun', 'piano'], ['piano-highres', 'piano'], ['bass-highres', 'bass']]) assert(byId(id).stems.includes(stem) && !byId(id).defaultFor && !(byId(id).retiredFor || []).includes(stem), `${id} stays a ${stem} alternative`);
// The Medium entries are the guitar Medium model with the Large entries' instrument lists and post-pass.
for (const stem of ['piano', 'bass']) {
  const medium = byId(`${stem}-muscriptor-medium`), large = byId(`${stem}-muscriptor-large`), guitar = byId('muscriptor-medium');
  assert.deepEqual(medium.checkpoint, guitar.checkpoint);
  assert.equal(medium.options.instruments, large.options.instruments);
  assert.deepEqual(medium.options.velocityFromStem, large.options.velocityFromStem);
  assert.deepEqual({...medium.options, instruments: 0, velocityFromStem: 0}, {...guitar.options, instruments: 0, velocityFromStem: 0});
}

(async () => {
  const HEADER = Buffer.from('4d546864000000060000000103c04d54726b0000000400ff2f00', 'hex');
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'xld-model-defaults-'));
  try {
    const audio = path.join(root, 'song.wav'); await fs.writeFile(audio, 'source'); const stat = await fs.stat(audio);
    const track = {id: 'defaults-track-1234567890', title: 'Song', artist: 'Artist', album: 'Album', number: 1, filePath: audio};
    const dir = trackDirectory(track, root), stemRunId = crypto.randomUUID();
    const stems = {schemaVersion: 1, kind: 'stems', trackId: track.id, runId: stemRunId, model: 'htdemucs_6s', options: {shifts: 1, overlap: 0.25}, source: {path: audio, size: stat.size, mtimeMs: stat.mtimeMs}, stems: []};
    for (const name of ['bass', 'piano', 'guitar', 'drums', 'vocals', 'other']) { const file = `stems/${stemRunId}/${name}.wav`; await fs.mkdir(path.dirname(path.join(dir, file)), {recursive: true}); await fs.writeFile(path.join(dir, file), Buffer.alloc(44100 * 8)); stems.stems.push({name, file, sampleRate: 44100, channels: 2, frames: 44100}); }
    await fs.writeFile(path.join(dir, 'stems.json'), JSON.stringify(stems));
    const write = async (relative, value) => { await fs.mkdir(path.dirname(path.join(dir, relative)), {recursive: true}); await fs.writeFile(path.join(dir, relative), typeof value === 'string' || Buffer.isBuffer(value) ? value : JSON.stringify(value)); };
    // A song transcribed before MODELS-2: piano with Transkun, bass with HiRes Bass, both the versions in use.
    const stored = {};
    for (const [stem, engine] of [['piano', 'piano-transkun'], ['bass', 'bass-highres']]) {
      const profile = profileFor(engine), runId = crypto.randomUUID(), prefix = `midi/${stem}/${runId}/`, wav = await fs.stat(path.join(dir, `stems/${stemRunId}/${stem}.wav`));
      const notesText = JSON.stringify({schemaVersion: 1, kind: 'notes', trackId: track.id, stem, sourceRunId: stemRunId, runId, engine, model: profile.model, timeOrigin: 0, duration: 1, notes: [{start: 0, end: .5, pitch: 40, velocity: 90}]});
      await write(prefix + stem + '.mid', HEADER); await write(prefix + 'notes.json', notesText);
      const record = {schemaVersion: 1, kind: 'midi', trackId: track.id, stem, runId, sourceRunId: stemRunId, source: {path: path.join(dir, `stems/${stemRunId}/${stem}.wav`), size: wav.size, mtimeMs: wav.mtimeMs}, engine, model: profile.model, options: profile.options, backend: {checkpointSha256: profile.checkpoint?.sha256}, timeOrigin: 0, duration: 1, noteCount: 1, tempoMode: 'fixed-timebase', quantized: false, file: prefix + stem + '.mid', notesFile: prefix + 'notes.json'};
      await write(`midi/${stem}/runs/${runId}.json`, record); await write(`midi/${stem}/${engine}.json`, record); await write(`midi/${stem}.json`, record);
      stored[stem] = {runId, engine};
    }
    const assets = createDerivedAssets({analysisRoot: root});
    for (const stem of ['piano', 'bass']) {
      const shown = await assets.readMidi(track, stem);
      assert(shown.ok, stem + ' still reads');
      assert.equal(shown.runId, stored[stem].runId, `${stem}: the version in use is still the one made with ${stored[stem].engine}`);
      assert.notEqual(shown.matches, false, `${stem}: not marked out of date by the new default`);
      const runs = await assets.listMidiRuns(track, stem);
      const mine = runs.find(r => r.runId === stored[stem].runId);
      assert(mine && mine.active && mine.status === 'current', `${stem}: listed as current and in use`);
      assert.equal(runs.length, 1, `${stem}: nothing new was made`);
      // The new default has no result of its own yet; nothing is run for it.
      assert.equal((await assets.readMidi(track, stem, defaultEngine(stem))).ok, false);
    }
    console.log('model defaults: ok (efficiency = Medium, quality = Large on piano / bass / guitar / strings; manual defaults agree with the presets; old piano / bass results stay in use)');
  } finally { await fs.rm(root, {recursive: true, force: true}); }
})().catch(error => { console.error(error); process.exitCode = 1; });
