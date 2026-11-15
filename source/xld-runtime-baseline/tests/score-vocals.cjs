'use strict';
// The vocal line as an XLD track (2026-11-14): current-or-not is decided by the vocal stem's run id, path, size and
// modification time plus the stored lead / backing; the analysis service answers a current one from disk and reruns
// a stale one; the vocals part (2026-11-14, task V) is a MIDI run converted from a current vocal line (vocals-rmvpe),
// made after the line itself when that is owed, through the same `score-vocals` task as the score-layer button; the
// timeline's vocals row is that run when there is one, else the line read-only, and plays the stored lead with the
// backing on its own row; a stem with no singing reads as "no singing", not as an error; a missing add-on is said.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const fsp = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const vm = require('node:vm');
const {createRequire} = require('node:module');
const {EventEmitter} = require('node:events');
const {randomUUID} = require('node:crypto');
const {pathToFileURL} = require('node:url');
const scoreVocals = require('../core/score-vocals.cjs');
const {createCatalog} = require('../core/mix-audio.cjs');

const FRAMES = 4410, RATE = 44100, CHANNELS = 2;
function floatWav(frames = FRAMES, channels = CHANNELS, rate = RATE) {
  const bytes = frames * channels * 4, b = Buffer.alloc(44 + bytes);
  b.write('RIFF', 0); b.writeUInt32LE(36 + bytes, 4); b.write('WAVE', 8); b.write('fmt ', 12); b.writeUInt32LE(16, 16);
  b.writeUInt16LE(3, 20); b.writeUInt16LE(channels, 22); b.writeUInt32LE(rate, 24); b.writeUInt32LE(rate * channels * 4, 28);
  b.writeUInt16LE(channels * 4, 32); b.writeUInt16LE(32, 34); b.write('data', 36); b.writeUInt32LE(bytes, 40);
  return b;
}

// What vocals_runner.py leaves behind: the split under refinement/ and the result beside the other results.
async function writeResult(directory, source, {lane = true, split = true, file = 'score-vocals.json'} = {}) {
  const result = {schemaVersion: 1, kind: 'score-vocals', engine: {id: 'score-vocals'}, duration: FRAMES / RATE, segments: [],
    source: {stemRunId: source.stemRunId, stem: 'vocals', path: source.path, size: source.size, mtimeMs: source.mtimeMs}, lane: null, why: null};
  if (split) {
    const runId = randomUUID(), key = require('node:crypto').randomBytes(32).toString('hex');
    await fsp.mkdir(path.join(directory, 'refinement', runId), {recursive: true});
    for (const name of ['target', 'residual']) await fsp.writeFile(path.join(directory, 'refinement', runId, name + '.wav'), floatWav());
    await fsp.writeFile(path.join(directory, 'refinement', key + '.json'), JSON.stringify({kind: 'refinement', engine: 'karaoke-lead', splitVersion: 1, runId,
      files: {target: runId + '/target.wav', residual: runId + '/residual.wav'},
      originalSource: {kind: 'stem', runId: source.stemRunId, stem: 'vocals', startFrame: 0, frames: FRAMES, size: source.size, mtimeMs: source.mtimeMs}}));
    result.provenance = {split: {engine: 'karaoke-lead', runId, manifest: `refinement/${key}.json`, lead: `refinement/${runId}/target.wav`, backing: `refinement/${runId}/residual.wav`}};
  }
  if (lane) result.lane = {id: 'vocals', notes: [[0.01, 0.05, 64, 100], [0.06, 0.02, 66, 80]], contour: {hop: 0.01, start: 0, midi: [null, 64, 64.2, null, 66]}};
  else result.why = '人声分轨几乎是空的，当作没有人声';
  await fsp.writeFile(path.join(directory, file), JSON.stringify(result));
  return result;
}

async function core(root) {
  const directory = path.join(root, 'core');
  const stemRunId = randomUUID(), stemFile = path.join(directory, 'stems', stemRunId, 'vocals.wav');
  await fsp.mkdir(path.dirname(stemFile), {recursive: true});
  await fsp.writeFile(stemFile, floatWav());
  let stems = {ok: true, runId: stemRunId, stems: [{name: 'vocals', audioUrl: pathToFileURL(stemFile).href, frames: FRAMES, sampleRate: RATE, channels: CHANNELS}]};
  const assets = {readStems: async () => stems};
  const track = {id: 't'};
  const read = () => scoreVocals.read(assets, track, directory);

  assert.deepEqual(await read().then(s => [s.state, s.due]), ['missing', true], 'a vocal stem without a vocal line is owed one');
  const source = await scoreVocals.stemSource(assets, track);
  const made = await writeResult(directory, source);
  let state = await read();
  assert.equal(state.state, 'current');
  assert.equal(state.due, false, 'made from this stem: nothing is owed');
  assert.ok(state.split.lead.endsWith('target.wav') && state.split.backing.endsWith('residual.wav'));
  const line = scoreVocals.laneOf(state);
  assert.deepEqual(line.notes[0], [0.01, 0.060000000000000005, 64, 100, null, 0], 'notes become [start, end, pitch, velocity, instrument, index]');
  assert.equal(line.contour.midi.length, 5);

  // The source moves on: a touched stem, a re-separation, a result from before the full source was recorded.
  const later = new Date(Date.now() + 5000);
  await fsp.utimes(stemFile, later, later);
  assert.deepEqual(await read().then(s => [s.state, s.due]), ['stale', true], 'a changed modification time makes it stale');
  await writeResult(directory, await scoreVocals.stemSource(assets, track));
  assert.equal((await read()).state, 'current');
  stems = {...stems, runId: randomUUID()};
  assert.equal((await read()).state, 'stale', 'another stem run makes it stale');
  stems = {...stems, runId: stemRunId};
  const old = JSON.parse(await fsp.readFile(path.join(directory, 'score-vocals.json'), 'utf8'));
  await fsp.writeFile(path.join(directory, 'score-vocals.json'), JSON.stringify({...old, source: {stemRunId, stem: 'vocals'}}));
  assert.equal((await read()).state, 'stale', 'the pre-2026-11-14 record (run id only) is not current');

  // The stored lead / backing are part of it.
  const fresh = await writeResult(directory, await scoreVocals.stemSource(assets, track));
  await fsp.rm(path.join(directory, fresh.provenance.split.backing));
  assert.deepEqual(await read().then(s => [s.state, s.due]), ['split-missing', true], 'a deleted backing is owed again');
  await fsp.writeFile(path.join(directory, fresh.provenance.split.backing), floatWav(FRAMES - 1));
  assert.equal((await read()).state, 'split-missing', 'a backing of the wrong length does not count');
  await fsp.writeFile(path.join(directory, 'score-vocals.json'), JSON.stringify({...fresh, provenance: {split: {...fresh.provenance.split, lead: 'refinement/../../elsewhere.wav'}}}));
  assert.equal((await read()).state, 'split-missing', 'a path outside refinement/ is refused');

  // No singing: no split, lane null, and that is a finished answer.
  await writeResult(directory, await scoreVocals.stemSource(assets, track), {lane: false, split: false});
  state = await read();
  assert.deepEqual([state.state, state.due, scoreVocals.laneOf(state)], ['current', false, null], 'an instrumental is current with no line');
  stems = {ok: false, stems: []};
  assert.deepEqual(await read().then(s => [s.state, s.due]), ['no-stem', false], 'no stems: nothing to do yet');
  void made;
}

// The analysis service, its child process replaced by a stand-in that writes what vocals_runner.py writes.
async function service(root) {
  const source = require.resolve('../core/analysis-service.cjs');
  const realRequire = createRequire(source), children = [];
  let behaviour = 'write';
  // The stand-in reads the stem the way the service does.
  const stubAssets = {readStems: () => service.readStems(track)};
  const python = path.join(root, 'python.exe'); await fsp.writeFile(python, 'fixture');
  const sandbox = {module: {exports: {}}, __dirname: path.dirname(source), console, setTimeout, clearTimeout, setImmediate, Buffer, URL,
    process: {...process, env: {...process.env, XLD_ROFORMER_PYTHON: python, XLD_HIGHRES_PYTHON: python}}, require(name) {
      if (name !== 'child_process') return realRequire(name);
      return {spawn(_python, args) {
        const child = new EventEmitter(); child.args = args; children.push(child);
        child.stdout = new EventEmitter(); child.stderr = new EventEmitter();
        child.stdout.setEncoding = child.stderr.setEncoding = () => {}; child.kill = () => true;
        setImmediate(async () => {
          // The MIDI runner (vocals-rmvpe): only its arguments are checked here; the conversion itself runs for real on
          // a copied track (work/xld-flow-20261114/scripts-V/probe.cjs).
          if (path.basename(args[0]) === 'runner.py') { child.stderr.emit('data', 'runner stand-in'); child.emit('close', 1); return; }
          if (behaviour === 'missing-addon') { child.stderr.emit('data', '人声曲线需要的扩展没有装：karaoke-v1 (主唱分离模型)'); child.emit('close', 1); return; }
          const output = args[args.indexOf('--output') + 1], directory = path.dirname(output);
          const now = await scoreVocals.stemSource(stubAssets, track);
          await writeResult(directory, behaviour === 'wrong-source' ? {...now, size: now.size + 1} : now,
            behaviour === 'silent' ? {file: path.basename(output), lane: false, split: false} : {file: path.basename(output)});
          child.emit('close', 0);
        });
        return child;
      }};
    }};
  vm.runInNewContext(await fsp.readFile(source, 'utf8'), sandbox);
  const service = sandbox.module.exports.createService({analysisRoot: root});
  const audio = path.join(root, 'song.wav'); await fsp.writeFile(audio, 'source');
  const track = {id: 'track', title: 'Song', filePath: audio, bridgePath: path.join(root, 'music-lab.json')};
  const stat = await fsp.stat(audio), stemRunId = randomUUID();
  const {MODEL, OPTIONS} = require('../core/derived-assets.cjs');
  const manifest = {schemaVersion: 1, kind: 'stems', trackId: track.id, runId: stemRunId, model: 'htdemucs_6s', options: {shifts: 1, overlap: 0.25},
    source: {path: audio, size: stat.size, mtimeMs: stat.mtimeMs}, stems: []};
  void MODEL; void OPTIONS;
  for (const name of ['bass', 'piano', 'guitar', 'drums', 'vocals', 'other']) {
    const relative = `stems/${stemRunId}/${name}.wav`;
    await fsp.mkdir(path.dirname(path.join(root, relative)), {recursive: true});
    await fsp.writeFile(path.join(root, relative), name === 'vocals' ? floatWav() : Buffer.alloc(FRAMES * 8));
    manifest.stems.push({name, file: relative, sampleRate: RATE, channels: CHANNELS, frames: FRAMES});
  }
  await fsp.writeFile(path.join(root, 'stems.json'), JSON.stringify(manifest));

  assert.deepEqual(await service.readScoreVocals(track).then(s => [s.state, s.due]), ['missing', true]);
  // The vocals part (vocals-rmvpe) is a conversion of the vocal line and is refused without a current one.
  const early = await service.run(track, 'vocals-rmvpe', {stem: 'vocals'});
  assert.deepEqual([early.ok, early.detail, children.length], [false, 'vocals-line-not-current', 0], 'no vocal line: refused, nothing started');
  assert.equal((await service.readVocalLine(track)).ok, false);
  const first = await service.run(track, 'score-vocals');
  assert.equal(first.ok, true, JSON.stringify(first));
  assert.ok(!first.cached);
  assert.equal(children.length, 1);
  assert.equal(path.basename(children[0].args[0]), 'vocals_runner.py');
  assert.equal((await service.readScoreVocals(track)).state, 'current', 'the run leaves a current result');
  const again = await service.run(track, 'score-vocals');
  assert.deepEqual([again.ok, again.cached, children.length], [true, true, 1], 'same stem, split on disk: answered from disk, no process');

  // A current vocal line: the MIDI runner gets that file and the digest of the bytes that were judged current.
  const line = await service.readVocalLine(track);
  assert.deepEqual([line.ok, line.sung], [true, true]);
  const lineFile = path.join(root, 'score-vocals.json');
  assert.equal(line.sha256, require('node:crypto').createHash('sha256').update(fs.readFileSync(lineFile)).digest('hex'));
  const convert = await service.run(track, 'vocals-rmvpe', {stem: 'vocals'});
  const midiChild = children[children.length - 1];
  assert.equal(path.basename(midiChild.args[0]), 'runner.py');
  assert.equal(midiChild.args[midiChild.args.indexOf('--score-vocals') + 1], lineFile, 'the runner converts the judged file');
  assert.equal(midiChild.args[midiChild.args.indexOf('--score-vocals-sha256') + 1], line.sha256, 'and only those bytes');
  assert.equal(midiChild.args[midiChild.args.indexOf('--stem') + 1], 'vocals');
  assert.equal(convert.ok, false, 'the stand-in runner fails; the failure is reported, not swallowed');
  assert.ok(!fs.existsSync(path.join(root, 'midi', 'vocals', 'vocals-rmvpe.json')), 'a failed conversion leaves no pointer');
  children.pop();

  const later = new Date(Date.now() + 5000);
  await fsp.utimes(path.join(root, `stems/${stemRunId}/vocals.wav`), later, later);
  const refused = await service.run(track, 'vocals-rmvpe', {stem: 'vocals'});
  assert.deepEqual([refused.ok, refused.detail], [false, 'vocals-line-not-current'], 'a vocal line made from the stem before it changed is refused');
  const rerun = await service.run(track, 'score-vocals');
  assert.deepEqual([rerun.ok, Boolean(rerun.cached), children.length], [true, false, 2], 'a changed stem is run again');

  behaviour = 'wrong-source';
  const wrong = await service.run(track, 'score-vocals', {force: true});
  assert.equal(wrong.ok, false);
  assert.match(wrong.detail, /人声分轨发生变化/, 'a result naming another stem is not promoted');
  assert.equal((await service.readScoreVocals(track)).state, 'current', 'and the previous result stays');

  // No singing: the vocals part is done with no MIDI run and no process.
  behaviour = 'silent';
  assert.equal((await service.run(track, 'score-vocals', {force: true})).ok, true);
  const spawned = children.length;
  const silent = await service.run(track, 'vocals-rmvpe', {stem: 'vocals'});
  assert.deepEqual([silent.ok, silent.noSinging, silent.result, children.length], [true, true, null, spawned], 'an instrumental is answered with no run');
  assert.ok(silent.why.includes('没有人声'));
  assert.ok(!fs.existsSync(path.join(root, 'midi', 'vocals.json')) && !fs.readdirSync(path.join(root, 'midi', 'vocals', 'runs')).length, 'and no vocals run or pointer is written');

  behaviour = 'missing-addon';
  const missing = await service.run(track, 'score-vocals', {force: true});
  assert.equal(missing.ok, false);
  assert.match(missing.detail, /人声曲线需要的扩展没有装：karaoke-v1/, 'a missing add-on is one plain sentence, not a silent skip');
}

// The 转谱 panel: vocals is a part like the others (selectable, one row in the one-click plan, counted when done).
// Generating it makes the vocal line first when owed — runAnalysis(track, 'score-vocals'), the 谱面层 button's call —
// then converts it (runDerived 'midi' 'vocals'). It runs after the other parts and before the merge; a failure there
// does not stop the batch, and a song with no singing is done with no run.
async function batch() {
  class Element {
    constructor(tag = 'div') { this.tagName = tag; this.children = []; this.handlers = {}; this.dataset = {}; this.attrs = {}; this.disabled = false; this.checked = false; this._value = ''; this.textContent = ''; }
    get options() { return this.children; } get value() { return this._value; } set value(v) { this._value = v; }
    append(...items) { this.children.push(...items); } add(item) { this.children.push(item); if (this.children.length === 1) this._value = item.value; }
    replaceChildren(...items) { this.children = items; if (this.tagName === 'select') this._value = items[0]?.value || ''; }
    setAttribute(k, v) { this.attrs[k] = v; } addEventListener(name, fn) { this.handlers[name] = fn; }
    async emit(name) { if (name === 'click' && this.disabled) throw Error('Disabled: ' + this.id); return this.handlers[name]?.({target: this, type: name}); }
  }
  const elements = new Map();
  const get = id => { if (!elements.has(id)) { const e = new Element(id.endsWith('Select') ? 'select' : 'div'); e.id = id; elements.set(id, e); } return elements.get(id); };
  const context = {document: {getElementById: get, createElement: tag => new Element(tag)}, localStorage: {getItem: () => null, setItem: () => {}}, addEventListener: () => {},
    Option: function (text, value) { const e = new Element('option'); e.textContent = text; e.value = value; return e; }};
  vm.createContext(context);
  for (const name of ['midi-batch.js', 'derived-controls.js']) vm.runInContext(fs.readFileSync(path.join(__dirname, '..', name), 'utf8'), context);
  const messages = require('../i18n/runtime-messages.js');
  const rt = (key, params) => messages.translateRuntime('zh-CN', key, params);
  const models = [...['bass', 'piano'].map(stem => ({id: stem + '-model', name: stem + ' model', stems: [stem], defaultFor: stem, available: true})),
    {id: 'vocals-rmvpe', name: 'RMVPE 主唱', stems: ['vocals'], defaultFor: 'vocals', available: true}];
  const midi = stem => ({ok: true, runId: stem + '-run', engine: stem + '-model', model: stem + '-model', noteCount: 10});
  let result, vocalsAnswer = {ok: true}, sung = true;
  const make = (vocals, names = ['bass', 'piano', 'guitar', 'drums', 'other', 'vocals']) => ({ok: true, runId: 'source-a', engine: 'roformer', stems: names.map(name => ({name, audioUrl: name + '.wav'})),
    midi: {bass: midi('bass'), piano: midi('piano')}, variants: {bass: {'bass-model': midi('bass')}, piano: {'piano-model': midi('piano')}}, stemVariants: {roformer: {ok: true, runId: 'source-a'}}, merged: {ok: false}, vocals});
  const calls = [];
  // The analysis service as far as the panel can tell: the conversion is refused without a current line, answers
  // "no singing" for an instrumental, and otherwise leaves a vocals-rmvpe run converted from the current line.
  const bridge = {midiEngines: async () => models, separationEngines: async () => [{id: 'roformer', name: 'RoFormer', available: true, default: true}],
    readDerived: async () => structuredClone(result), revealDerived: async () => ({ok: true}), openMergedMidi: async () => ({ok: true}),
    async runDerived(trackId, kind, stem, force, engine) {
      calls.push(stem);
      if (stem !== 'vocals') return {ok: true, cached: true};
      assert.equal(engine, 'vocals-rmvpe');
      if (result.vocals.state !== 'current') return {ok: false, error: 'analysis-failed', detail: 'vocals-line-not-current'};
      if (!result.vocals.sung) return {ok: true, kind: 'midi', noSinging: true, result: null};
      const run = {ok: true, runId: 'vocals-run', engine: 'vocals-rmvpe', model: 'score-vocals-rmvpe-v1', noteCount: 7, backend: {scoreVocals: {sha256: result.vocals.sha256}}};
      result.midi.vocals = run; result.variants.vocals = {'vocals-rmvpe': run};
      return {ok: true, kind: 'midi', result: run};
    },
    async mergeMidi() { calls.push('merge'); return {ok: true}; },
    async runAnalysis(trackId, engine) { calls.push(engine); if (vocalsAnswer.ok) result.vocals = {state: 'current', due: false, sung, sha256: 'line-' + calls.length}; return vocalsAnswer; }};
  let task = null;
  const controls = context.XldDerivedControls.create({bridge, audio: {currentTime: 0, paused: true}, getSelected: () => ({id: 'song', title: 'Song'}), getCurrent: () => null,
    queueFor: () => [], playTrack: async () => {}, rt, getBusy: () => false, onTask: v => { task = v; }, onBatchState: () => {}, isBatchCancelled: () => false, beforeMerge: () => ({ok: true})});

  result = make({state: 'missing', due: true});
  await controls.refresh(); controls.setView('midi');
  const planItems = () => get('midiBatchPlan').children.map(e => e.textContent);
  const vocalItem = () => get('midiBatchPlan').children.find(e => e.textContent.startsWith('vocals'));
  assert.ok(get('derivedMidiSelect').options.some(o => o.value === 'vocals'), 'vocals can be chosen in the 转谱 panel');
  assert.equal(planItems().filter(t => t.startsWith('vocals')).length, 1, 'vocals is one row of the plan: ' + planItems());
  assert.ok(vocalItem().textContent.includes('RMVPE 主唱') && vocalItem().textContent.includes('待生成'), 'listed like any part: ' + vocalItem().textContent);
  await get('midiBatchRun').emit('click');
  assert.deepEqual(calls, ['bass', 'piano', 'score-vocals', 'vocals', 'merge'], 'the vocal line, then its conversion, then the merge (which now includes it)');
  assert.equal(task.status, 'complete');
  assert.ok(vocalItem().textContent.includes('复用'), 'afterwards it reads as reusable: ' + vocalItem().textContent);
  assert.ok(get('midiBatchStatus').textContent.includes('3 个声部'), 'the completion line counts vocals as a part: ' + get('midiBatchStatus').textContent);

  calls.length = 0;
  await get('midiBatchRun').emit('click');
  assert.deepEqual(calls, ['bass', 'piano', 'vocals', 'merge'], 'a current vocal line is not made again (the conversion answers from its cache)');

  // The vocal line was remade elsewhere (谱面层 button): the run from the old line is not "reuse" any more.
  result.vocals = {...result.vocals, sha256: 'another-line'}; await controls.refresh();
  assert.ok(vocalItem().textContent.includes('待生成'), 'a run converted from an earlier line is owed again: ' + vocalItem().textContent);

  result = make({state: 'no-stem', due: false}, ['bass', 'piano', 'guitar', 'drums', 'other']); await controls.refresh(); calls.length = 0;
  assert.equal(vocalItem(), undefined, 'no vocal stem: no vocal step');
  await get('midiBatchRun').emit('click');
  assert.deepEqual(calls, ['bass', 'piano', 'merge']);

  result = make({state: 'stale', due: true}); await controls.refresh(); calls.length = 0;
  vocalsAnswer = {ok: false, error: 'analysis-failed', detail: '人声曲线需要的扩展没有装：seedvc-v1 (RMVPE)'};
  await get('midiBatchRun').emit('click');
  assert.deepEqual(calls, ['bass', 'piano', 'score-vocals', 'merge'], 'no vocal line: no conversion, the merge still runs');
  const status = get('midiBatchStatus').textContent;
  assert.equal(task.status, 'complete', 'the MIDI parts that were made still count: the batch is not stopped');
  assert.ok(status.includes('人声没有转出来') && status.includes('seedvc-v1'), 'the vocal step says why on its own, not skipped: ' + status);
  assert.ok(status.includes('2 个声部'), 'and vocals is not counted: ' + status);
  assert.ok(!status.includes('已停止'), 'and the batch does not read as stopped: ' + status);

  result = make({state: 'missing', due: true}); await controls.refresh(); calls.length = 0;
  vocalsAnswer = {ok: true}; sung = false;
  await get('midiBatchRun').emit('click');
  assert.deepEqual(calls, ['bass', 'piano', 'score-vocals', 'vocals', 'merge']);
  assert.ok(get('midiBatchStatus').textContent.includes('没有人声'), 'an instrumental says no singing: ' + get('midiBatchStatus').textContent);
  assert.ok(vocalItem().textContent.includes('没有人声') && vocalItem().className === 'ready', 'and its plan row reads as done: ' + vocalItem().textContent);

  // 生成 MIDI on the vocals part alone: the same two steps.
  result = make({state: 'missing', due: true}); sung = true; await controls.refresh(); calls.length = 0;
  get('derivedMidiSelect').value = 'vocals'; await get('derivedMidiSelect').emit('change');
  assert.ok(get('derivedMidiHint').textContent.includes('人声曲线'), 'the vocals hint says where the notes come from: ' + get('derivedMidiHint').textContent);
  await get('derivedTranscribe').emit('click');
  assert.deepEqual(calls, ['score-vocals', 'vocals'], 'the vocal line first, then the conversion');
  calls.length = 0; result.vocals = {state: 'current', due: false, sung: false};
  await get('derivedTranscribe').emit('click');
  assert.deepEqual(calls, ['vocals']);
  assert.ok(get('derivedStatus').textContent.includes('没有人声'), 'a single run on an instrumental says so: ' + get('derivedStatus').textContent);
}

// The timeline's vocals row: the lead carries the notes, the backing is a WAV row, the two replace the stem.
async function timeline(root) {
  const directory = path.join(root, 'timeline'), runId = randomUUID();
  await fsp.mkdir(path.join(directory, 'stems', runId), {recursive: true});
  const stemFile = name => path.join(directory, 'stems', runId, name + '.wav');
  const base = {ok: true, runId, engine: 'roformer', stems: ['bass', 'vocals'].map(name => ({name, audioUrl: pathToFileURL(stemFile(name)).href, frames: FRAMES, sampleRate: RATE}))};
  for (const name of ['bass', 'vocals', 'lead', 'backing']) await fsp.writeFile(stemFile(name), floatWav());
  const registered = [];
  const reader = {register: async file => { registered.push(path.basename(file)); return {key: file, url: pathToFileURL(file).href, duration: FRAMES / RATE, sampleRate: RATE}; }};
  const catalog = createCatalog({assets: {readStems: async () => base, directory: () => directory, stringSources: {current: async () => null}}, refinement: {}, reader});
  const vocalLane = {stem: 'vocals', engine: 'score-vocals', sourceRunId: runId, runId: null, editable: false, sourceAudio: null, notes: [[0.01, 0.06, 64, 100, null, 0]], noteCount: 1, instruments: [], duration: FRAMES / RATE, contour: {hop: 0.01, start: 0, midi: [64]}};
  // Which lane is the vocals row (core/score-vocals.cjs vocalsRow, called by desktop/main.cjs).
  const lineState = {state: 'current', source: {stemRunId: runId}, result: {duration: FRAMES / RATE,
    lane: {notes: [[0.01, 0.05, 64, 100]], contour: {hop: 0.01, start: 0, midi: [64]}}}};
  const silentState = {state: 'current', source: {stemRunId: runId}, result: {duration: FRAMES / RATE, lane: null}};
  const bass = {stem: 'bass', engine: 'bass-highres', runId: 'bass-run', editable: true, notes: [], noteCount: 0};
  const pyin = {stem: 'vocals', engine: 'vocals-pyin', sourceRunId: runId, runId: 'pyin-run', editable: true, sourceAudio: null, notes: [[0, 1, 60, 90, 0, 0], [1, 2, 62, 90, 0, 1]], noteCount: 2, instruments: [], duration: FRAMES / RATE};
  const part = {stem: 'vocals', engine: 'vocals-rmvpe', sourceRunId: runId, runId: 'rmvpe-run', editable: true, sourceAudio: {url: 'x', key: 'stem-key'}, notes: [[0.01, 0.06, 64, 100, 0, 0]], noteCount: 1, instruments: [{index: 0}], duration: FRAMES / RATE};
  const row = (lanes, state) => scoreVocals.vocalsRow(lanes, state).filter(l => l.stem === 'vocals');
  let rows = row([bass, part], lineState);
  assert.deepEqual([rows.length, rows[0].engine, rows[0].runId, rows[0].editable], [1, 'vocals-rmvpe', 'rmvpe-run', true], 'a vocals MIDI run is the row, editable, with its runId');
  assert.deepEqual(rows[0].contour, lineState.result.lane.contour, 'and carries the vocal line\'s pitch curve');
  assert.equal(part.contour, undefined, 'the input lane is not modified');
  rows = row([bass, {...part, engine: 'manual-revision', runId: 'edit-run'}], lineState);
  assert.deepEqual([rows.length, rows[0].runId], [1, 'edit-run'], 'so is a hand-edited revision of it');
  rows = row([bass], lineState);
  assert.deepEqual([rows.length, rows[0].engine, rows[0].runId, rows[0].editable, rows[0].noteCount], [1, 'score-vocals', null, false, 1], 'no vocals run yet: the vocal line read-only, as before');
  rows = row([bass, pyin], lineState);
  assert.deepEqual([rows.length, rows[0].engine], [1, 'score-vocals'], 'the old pYIN run gives way to a current vocal line');
  rows = row([bass, pyin], {state: 'stale'});
  assert.deepEqual([rows.length, rows[0].engine], [1, 'vocals-pyin'], 'but not to a stale one');
  rows = row([bass], silentState);
  assert.deepEqual([rows.length, rows[0].status, rows[0].noteCount], [1, 'none', 0], 'no singing: a "no singing" row');
  assert.deepEqual(row([bass], {state: 'missing'}), [], 'no vocal line, no run: nothing added');
  assert.equal(scoreVocals.vocalsRow([bass, part], lineState).length, 2, 'other lanes are left alone');
  // The vocals run plays the stored lead like the read-only row did, and keeps its own source identity for the editor.
  const withSplit = await catalog.read({id: 't'}, scoreVocals.vocalsRow([part], lineState), null, {vocalSplit: {lead: stemFile('lead'), backing: stemFile('backing'), stemRunId: runId}});
  const partRow = withSplit.lanes.find(l => l.stem === 'vocals');
  assert.deepEqual([partRow.runId, partRow.editable, partRow.sourceAudio.key], ['rmvpe-run', true, 'stem-key']);
  assert.ok(partRow.sourceAudio.url.endsWith('lead.wav') && withSplit.lanes.some(l => l.stem === 'vocals / backing'), 'lead as its audio, backing as its own row');
  registered.length = 0;
  const plain = await catalog.read({id: 't'}, [vocalLane]);
  const vocals = plain.lanes.find(l => l.stem === 'vocals');
  assert.equal(vocals.noteCount, 1, 'the vocals row carries the vocal line');
  assert.ok(vocals.contour, 'and its curve');
  assert.ok(vocals.sourceAudio.url.endsWith('vocals.wav'), 'without a stored split it plays the vocal stem');
  assert.ok(!plain.lanes.some(l => l.stem === 'vocals / backing'));
  const split = await catalog.read({id: 't'}, [vocalLane], null, {vocalSplit: {lead: stemFile('lead'), backing: stemFile('backing'), stemRunId: runId}});
  const lead = split.lanes.find(l => l.stem === 'vocals'), backing = split.lanes.find(l => l.stem === 'vocals / backing');
  assert.ok(lead.sourceAudio.url.endsWith('lead.wav'), 'with a stored split the row plays the lead');
  assert.equal(lead.noteCount, 1);
  assert.ok(backing && backing.wavOnly && backing.sourceAudio.url.endsWith('backing.wav'), 'the backing has its own WAV row');
  assert.ok(!registered.slice(-3).includes('vocals.wav'), 'and the stem itself is not also played (lead + backing = stem)');
  const otherRun = await catalog.read({id: 't'}, [vocalLane], null, {vocalSplit: {lead: stemFile('lead'), backing: stemFile('backing'), stemRunId: randomUUID()}});
  assert.ok(otherRun.lanes.find(l => l.stem === 'vocals').sourceAudio.url.endsWith('vocals.wav'), 'a split of another stem run is not used');
}

// The drawing itself is checked on screen (work/xld-vocals-20261114/shots); here only that the rules are in place:
// the curve is drawn only on an opened row, the backing row has a name and its own words, the storage page names
// the split in words, and the backing row wears the vocals' icon and colour bar.
function wording() {
  const read = file => fs.readFileSync(path.join(__dirname, '..', file), 'utf8');
  const timelineSource = read('timeline-controls.js');
  assert.match(timelineSource, /if \(detailed && lane\.contour && layout\.kind === 'pitch'\) drawContour\(/, 'the curve waits for an opened row');
  assert.match(timelineSource, /lane\.stem === 'vocals \/ backing'\) return rt\('runtime\.timeline\.backing'\)/, 'the backing row is called 和声 / Backing');
  assert.match(timelineSource, /lane\.stem === 'vocals \/ backing' \? rt\('runtime\.timeline\.splitEngine'\)/, 'and its engine is said in words');
  const css = read('xld-studio.css');
  assert.ok(css.includes('.tl-notes-row[data-stem="vocals / backing"] { --lamp: var(--t-vocals); }'), 'the backing row has the vocals colour bar');
  assert.ok(css.includes('.tl-notes-row[data-stem="vocals / backing"] .tl-row-toggle strong::before'), 'and the vocals icon');
  const messages = require('../i18n/runtime-messages.js');
  for (const locale of ['zh-CN', 'en-US']) for (const key of ['runtime.timeline.backing', 'runtime.timeline.splitEngine', 'runtime.midiBatch.vocalsDone', 'runtime.midiBatch.vocalsNone', 'runtime.midiBatch.vocalsFailed'])
    assert.ok(!messages.translateRuntime(locale, key, {why: 'x'}).startsWith('runtime.'), `${key} in ${locale}`);
  assert.equal(messages.translateRuntime('zh-CN', 'runtime.timeline.backing'), '和声');
  assert.ok(read('storage-controls.js').includes("row.engine==='karaoke-lead'?t('主唱 / 和声分离','Lead / backing split')"), 'the storage page names the split in words');
}

(async () => {
  wording();
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'xld-score-vocals-'));
  try {
    await core(root);
    const serviceRoot = path.join(root, 'service'); fs.mkdirSync(serviceRoot);
    await service(serviceRoot);
    await batch();
    await timeline(root);
    console.log('score vocals: PASS (current by stem identity and stored split, stale on stem change, service cache / rerun / refusal, missing add-on said, vocals-rmvpe refused without a current line and fed the judged bytes, no singing = no run, vocals a part in the 转谱 panel and the one-click plan, vocals row = MIDI run else read-only line, lead + backing rows)');
  } finally { fs.rmSync(root, {recursive: true, force: true}); }
})().catch(error => { console.error(error); process.exit(1); });
