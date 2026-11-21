'use strict';
// W1 (2026-11-15): winds as a part of their own. Checked here without a GPU:
//  - a full Mega 53 run can take "what the strings step left" (sourceStem 'strings-residual') as its input: the
//    residual of the strings result the song uses now, with that run as parent; a preview cannot; no strings source = no
//    input; the refinement runner accepts the same name;
//  - the winds source is a pointer of its own (midi/winds-source.json) and can say "this song has no winds";
//  - the "no winds" rule against the numbers measured on the test song and on songs without winds;
//  - models.json: two winds tiers on the shared MuScriptor code with MuScriptor's own wind vocabulary, Medium the
//    manual default; the MIDI runner knows the part and keeps one track per wind instrument.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const crypto = require('node:crypto');
const root = path.resolve(__dirname, '..');
const read = file => fs.readFileSync(path.join(root, file), 'utf8');
const source = require('../core/string-source.cjs');

function floatWav(file, frames, channels = 2, rate = 44100) {
  const data = Buffer.alloc(frames * channels * 4);
  const h = Buffer.alloc(44);
  h.write('RIFF', 0, 'latin1'); h.writeUInt32LE(36 + data.length, 4); h.write('WAVE', 8, 'latin1'); h.write('fmt ', 12, 'latin1');
  h.writeUInt32LE(16, 16); h.writeUInt16LE(3, 20); h.writeUInt16LE(channels, 22); h.writeUInt32LE(rate, 24); h.writeUInt32LE(rate * channels * 4, 28);
  h.writeUInt16LE(channels * 4, 32); h.writeUInt16LE(32, 34); h.write('data', 36, 'latin1'); h.writeUInt32LE(data.length, 40);
  fs.mkdirSync(path.dirname(file), {recursive: true});
  fs.writeFileSync(file, Buffer.concat([h, data]));
}

(async () => {
  // --- the "no winds" rule, against what was measured (work/winds-20261115/levels.json) ----------------------------
  const measured = {
    'Satan Veludo Children (winds, chained)': {rmsVsInputDb: -0.4, within30dB: 0.376, winds: true},
    'Ceremony': {rmsVsInputDb: -19.3, within30dB: 0.027, winds: false},
    'グッドバイ': {rmsVsInputDb: -45.2, within30dB: 0.004, winds: false},
    'Xtal': {rmsVsInputDb: -21.7, within30dB: 0.057, winds: false},
    'Mirrors': {rmsVsInputDb: -14.3, within30dB: 0.05, winds: false}
  };
  for (const [song, level] of Object.entries(measured)) assert.equal(source.isNone(level), !level.winds, song);
  assert.equal(source.isNone(null), false, 'a result made before (no level) is never judged');
  assert.equal(source.isNone({}), false);
  assert.ok(source.NONE.within30dB >= 2 * 0.057 && source.NONE.within30dB <= 0.376 / 3, 'the threshold sits well between the two groups');

  // --- models.json: the winds tiers ----------------------------------------------------------------------------------
  const models = JSON.parse(read('analysis-midi/models.json'));
  const winds = models.filter(p => p.stems.includes('winds'));
  assert.deepEqual(winds.map(p => p.id), ['winds-muscriptor-medium', 'winds-muscriptor-large']);
  const VOCAB = ['trumpet', 'trombone', 'tuba', 'french_horn', 'brass_section', 'soprano_and_alto_sax', 'tenor_sax', 'baritone_sax', 'oboe', 'english_horn', 'bassoon', 'clarinet', 'flutes'];
  for (const p of winds) {
    assert.deepEqual(p.options.instruments.split(','), VOCAB, p.id + ': MuScriptor\'s own wind names, all 13');
    assert.equal(p.options.codeRevision, models.find(m => m.id === 'muscriptor-medium').options.codeRevision, 'the shared code');
    assert.equal(p.options.velocityFromStem.windowPostSeconds, 0.15, 'sustained notes: the strings\' window');
  }
  assert.equal(winds[0].defaultFor, 'winds', 'Medium is the manual default');
  assert.equal(new Set(models.map(p => p.model)).size, models.length, 'model strings stay unique');
  const runner = read('analysis-midi/runner.py');
  assert.match(runner, /^STEMS = \{[^\r\n]*"winds": 56(?:,|\})/m, 'the MIDI runner knows the part');
  assert.match(runner, /stem in \('strings', 'winds'\)/, 'overlapping wind notes are kept, one track per instrument');
  assert.match(read('analysis-refine/runner.py'), /'strings-residual'\] or \(engine!='mega-53'/, 'the refinement runner takes the chained source');

  // --- the chained input -----------------------------------------------------------------------------------------------
  const base = fs.mkdtempSync(path.join(os.tmpdir(), 'xld-winds-'));
  try {
    const dir = path.join(base, 'song');
    const models53 = path.join(base, 'models'); fs.mkdirSync(models53); fs.writeFileSync(path.join(models53, 'manifest.json'), '{"m":1}');
    process.env.XLD_REFINE_ROFORMER_MODELS = models53;
    const assets = {directory: () => dir, readStems: async () => ({ok: false, error: 'not-needed'})};
    const {createRefinement} = require('../core/refinement.cjs');
    const refinement = createRefinement({assets, probeAudio: async () => ({frames: 100, sampleRate: 44100, channels: 2})});
    const track = {id: 'winds-track', filePath: path.join(base, 'x.flac')};
    const options = {engine: 'mega-53', scope: 'full', sourceStem: 'strings-residual', target: 'wind', device: 'auto'};
    await assert.rejects(refinement.context(track, options), /refinement-chain-missing/, 'no strings source: nothing to dig in');
    const stringsRun = crypto.randomUUID(), key = crypto.createHash('sha256').update('strings').digest('hex');
    floatWav(path.join(dir, 'refinement', stringsRun, 'residual.wav'), 100);
    fs.writeFileSync(path.join(dir, 'refinement', key + '.json'), JSON.stringify({kind: 'refinement', schemaVersion: 3, engine: 'mega-53', scope: 'full', runId: stringsRun, target: 'strings-all', files: {target: stringsRun + '/target.wav', residual: stringsRun + '/residual.wav'}}));
    fs.mkdirSync(path.join(dir, 'midi'), {recursive: true});
    fs.writeFileSync(path.join(dir, 'midi', 'strings-source.json'), JSON.stringify({schemaVersion: 1, kind: 'midi-string-source', runId: stringsRun, cacheKey: key}));
    const ctx = await refinement.context(track, options);
    assert.equal(ctx.input, path.join(dir, 'refinement', stringsRun, 'residual.wav'), 'the input is the strings result\'s residual');
    assert.equal(ctx.parentRunId, stringsRun, 'and its parent the strings run: new strings make it a new result');
    assert.equal(ctx.sourceStem, 'strings-residual');
    const other = await refinement.context(track, {...options, sourceStem: 'other'}).catch(e => e);
    assert.ok(other instanceof Error, 'the plain path is unchanged (it needs stems, which this fixture has not)');
    await assert.rejects(refinement.context(track, {...options, scope: 'preview'}), /refinement-source-invalid/, 'a preview cannot chain');
    // Another strings result: another key.
    const stringsRun2 = crypto.randomUUID(), key2 = crypto.createHash('sha256').update('strings2').digest('hex');
    floatWav(path.join(dir, 'refinement', stringsRun2, 'residual.wav'), 100);
    fs.writeFileSync(path.join(dir, 'refinement', key2 + '.json'), JSON.stringify({kind: 'refinement', schemaVersion: 3, engine: 'mega-53', scope: 'full', runId: stringsRun2, target: 'strings', files: {target: stringsRun2 + '/target.wav', residual: stringsRun2 + '/residual.wav'}}));
    fs.writeFileSync(path.join(dir, 'midi', 'strings-source.json'), JSON.stringify({schemaVersion: 1, kind: 'midi-string-source', runId: stringsRun2, cacheKey: key2}));
    assert.notEqual((await refinement.context(track, options)).cacheKey, ctx.cacheKey, 'new strings, new winds key');

    // --- the winds pointer ---------------------------------------------------------------------------------------------
    const windSources = source.createPartSource({assets, part: 'winds'});
    assert.equal(await windSources.current(track), null);
    await windSources.markNone(track, {fromRunId: stringsRun, level: {rmsVsInputDb: -30, within30dB: 0.01, method: 1}});
    const listed = await windSources.list(track);
    assert.ok(listed.none && listed.none.level.within30dB === 0.01 && !listed.active, 'no winds is remembered, with what was measured');
    const pointer = JSON.parse(fs.readFileSync(path.join(dir, 'midi', 'winds-source.json'), 'utf8'));
    assert.equal(pointer.kind, 'midi-winds-source'); assert.equal(pointer.none, true);
    assert.ok(!fs.readFileSync(path.join(dir, 'midi', 'strings-source.json'), 'utf8').includes('"none"'), 'the strings pointer is not touched');
    assert.throws(() => source.createPartSource({assets, part: 'brass'}), /part-source-invalid/);
    assert.deepEqual(Object.keys(source.WIND_TARGETS), ['wind', 'woodwind', 'brass', 'flute', 'saxophone']);
  } finally { fs.rmSync(base, {recursive: true, force: true}); delete process.env.XLD_REFINE_ROFORMER_MODELS; }
  console.log('winds part: ok (chained input from the strings residual, full songs only, new strings = new key; winds pointer with "no winds"; the rule against measured songs; two MuScriptor tiers with the wind vocabulary; runners wired)');
})().catch(error => { console.error(error); process.exitCode = 1; });
