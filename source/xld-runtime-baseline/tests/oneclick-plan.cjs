'use strict';
// One-click analysis: presets / custom / storage, the step plan (both presets, unavailable steps marked up front),
// the serial runner (existing results skipped, failure handling per step kind, cancel), and the seam through which
// the MIDI part runs the 转谱 panel's own batch (derived-controls.js runBatch / setModels) with injected fakes.
const fs = require('node:fs'), path = require('node:path'), vm = require('node:vm'), assert = require('node:assert/strict');
const P = require('../oneclick-plan.js');

// --- presets, custom, storage ------------------------------------------------------------------------------
{
  const eff = P.applyPreset('efficiency'), q = P.applyPreset('quality');
  assert.equal(eff.preset, 'efficiency'); assert.equal(q.preset, 'quality');
  assert.deepEqual(eff.choices, {separation: 'bs-roformer-sw', refine: false, piano: 'piano-muscriptor-medium', bass: 'bass-muscriptor-medium', guitar: 'muscriptor-medium', strings: 'strings-muscriptor-medium', winds: 'winds-muscriptor-medium', drums: 'drums-adtof', vocals: true});
  assert.deepEqual(q.choices, {separation: 'bs-roformer-sw', refine: true, piano: 'piano-muscriptor-large', bass: 'bass-muscriptor-large', guitar: 'muscriptor-large', strings: 'strings-muscriptor-large', winds: 'winds-muscriptor-large', drums: 'drums-adtof-stems', vocals: true});
  assert.equal(P.choose(eff, 'piano', 'piano-transkun'), eff, 'Transkun is a manual alternative, not a one-click choice');
  assert.equal(P.choose(eff, 'bass', 'bass-muscriptor-large').preset, 'custom');
  // A choice stored before piano / bass were choices takes the stored preset's piano / bass.
  {const s = new Map([['xld.oneclick', JSON.stringify({preset: 'quality', choices: {separation: 'bs-roformer-sw', refine: true, guitar: 'muscriptor-large', strings: 'strings-muscriptor-large', drums: 'drums-adtof-stems', vocals: true}})]]);
   assert.deepEqual(P.load({getItem: k => s.get(k) ?? null}), q, 'an old stored quality choice stays quality');}
  const custom = P.choose(eff, 'guitar', 'muscriptor-large');
  assert.equal(custom.preset, 'custom', 'changing one item makes it custom');
  assert.equal(P.choose(custom, 'guitar', 'muscriptor-medium').preset, 'efficiency', 'changing it back returns to the preset');
  assert.equal(P.choose(eff, 'guitar', 'basic-pitch'), eff, 'a value outside the options is refused');
  assert.equal(P.choose(eff, 'separation', 'demucs-6s').preset, 'custom', 'Demucs is only a choice, never a preset');
  const store = new Map(), storage = {getItem: key => store.get(key) ?? null, setItem: (key, value) => store.set(key, value)};
  assert.deepEqual(P.load(storage), eff, 'nothing stored = efficiency');
  P.save(storage, custom); assert.deepEqual(JSON.parse(store.get('xld.oneclick')).choices, custom.choices);
  assert.deepEqual(P.load(storage), custom);
  store.set('xld.oneclick', '{broken'); assert.deepEqual(P.load(storage), eff, 'broken storage falls back');
  store.set('xld.oneclick', JSON.stringify({preset: 'quality', choices: {guitar: 'nonsense'}})); assert.deepEqual(P.load(storage), q, 'unknown values take the preset');
  assert.deepEqual(P.midiPicks(q.choices), {bass: 'bass-muscriptor-large', piano: 'piano-muscriptor-large', guitar: 'muscriptor-large', drums: 'drums-adtof-stems', strings: 'strings-muscriptor-large', winds: 'winds-muscriptor-large'});
  assert.deepEqual(P.midiPicks(eff.choices), {bass: 'bass-muscriptor-medium', piano: 'piano-muscriptor-medium', guitar: 'muscriptor-medium', drums: 'drums-adtof', strings: 'strings-muscriptor-medium', winds: 'winds-muscriptor-medium'});
}

// --- the plan ----------------------------------------------------------------------------------------------
const midiModels = ['bass-muscriptor-medium', 'bass-muscriptor-large', 'piano-muscriptor-medium', 'piano-muscriptor-large', 'muscriptor-medium', 'muscriptor-large', 'strings-muscriptor-medium', 'strings-muscriptor-large', 'winds-muscriptor-medium', 'winds-muscriptor-large', 'drums-adtof', 'drums-adtof-stems', 'vocals-rmvpe']
  .map(id => ({id, available: true}));
const fullEnv = (over = {}) => ({analysis: [{id: 'songformer', available: true}, {id: 'chord-chordmini', available: true}, {id: 'chord-btc', available: true}],
  separation: [{id: 'bs-roformer-sw', available: true}, {id: 'demucs-6s', available: true}], refinement: [{id: 'mega-53', available: true}],
  midi: midiModels, derived: null, has: () => false, ...over});
const ids = steps => steps.map(step => step.id);
const states = steps => Object.fromEntries(steps.map(step => [step.id, step.state + (step.reason ? ':' + step.reason.code : '')]));
{
  const eff = P.plan(P.PRESETS.efficiency, fullEnv());
  assert.deepEqual(ids(eff), ['sections', 'chords', 'stems', 'midi:bass', 'midi:piano', 'midi:guitar', 'midi:drums', 'midi:vocals', 'merge'], 'efficiency: no fine split, no strings');
  assert.deepEqual(eff.filter(s => s.kind === 'midi').map(s => s.engine), ['bass-muscriptor-medium', 'piano-muscriptor-medium', 'muscriptor-medium', 'drums-adtof', 'vocals-rmvpe']);
  assert.equal(eff.find(s => s.id === 'chords').engine, 'chord-chordmini');
  assert(eff.every(s => s.state === 'pending'));
  const q = P.plan(P.PRESETS.quality, fullEnv());
  assert.deepEqual(ids(q), ['sections', 'chords', 'stems', 'refine', 'refine-winds', 'midi:bass', 'midi:piano', 'midi:guitar', 'midi:drums', 'midi:strings', 'midi:winds', 'midi:vocals', 'merge'], 'quality: fine split, strings, then the winds from what the strings left');
  assert.deepEqual(q.filter(s => s.kind === 'midi').map(s => s.engine), ['bass-muscriptor-large', 'piano-muscriptor-large', 'muscriptor-large', 'drums-adtof-stems', 'strings-muscriptor-large', 'winds-muscriptor-large', 'vocals-rmvpe']);
  // W1: a song with a winds source needs no winds fine split; a song found to have no winds has no winds steps at all.
  assert.ok(!ids(P.plan(P.PRESETS.quality, fullEnv({derived: {winds: {active: {runId: 'w'}}}}))).includes('refine-winds'));
  assert.ok(ids(P.plan(P.PRESETS.quality, fullEnv({derived: {winds: {active: {runId: 'w'}}}}))).includes('midi:winds'));
  const none = ids(P.plan(P.PRESETS.quality, fullEnv({derived: {winds: {none: {level: {}}}}})));
  assert.ok(!none.includes('refine-winds') && !none.includes('midi:winds'), 'no winds: no winds steps');
  // A strings source already chosen: strings is a part even without the fine split (as in 一键生成 MIDI).
  assert(ids(P.plan(P.PRESETS.efficiency, fullEnv({derived: {strings: {active: {runId: 'x'}}}}))).includes('midi:strings'));
  // Vocals off.
  assert(!ids(P.plan({...P.PRESETS.efficiency, vocals: false}, fullEnv())).includes('midi:vocals'));
}
{
  // Missing environments, marked before anything runs.
  const noChordMini = P.plan(P.PRESETS.efficiency, fullEnv({analysis: [{id: 'songformer', available: true}, {id: 'chord-chordmini', available: false}, {id: 'chord-btc', available: true}]}));
  assert.equal(noChordMini.find(s => s.id === 'chords').engine, 'chord-btc', 'ChordMini missing -> BTC');
  const noAnalysis = states(P.plan(P.PRESETS.efficiency, fullEnv({analysis: []})));
  assert.equal(noAnalysis.sections, 'unavailable:engine-missing'); assert.equal(noAnalysis.chords, 'unavailable:engine-missing');
  assert.equal(states(P.plan(P.PRESETS.efficiency, fullEnv({analysis: [], has: id => id === 'songformer'}))).sections, 'pending', 'an existing result is still answered without the runtime');
  const noStems = states(P.plan(P.PRESETS.quality, fullEnv({separation: [{id: 'bs-roformer-sw', available: false}]})));
  assert.equal(noStems.stems, 'unavailable:engine-missing');
  for (const id of ['refine', 'refine-winds', 'midi:bass', 'midi:vocals', 'merge']) assert.equal(noStems[id], 'unavailable:needs-stems', id);
  const keptStems = states(P.plan(P.PRESETS.efficiency, fullEnv({separation: [{id: 'bs-roformer-sw', available: false}], derived: {stemVariants: {'bs-roformer-sw': {ok: true}}}})));
  assert.equal(keptStems.stems, 'pending', 'stems on disk are answered without the separation runtime');
  const noMega = states(P.plan(P.PRESETS.quality, fullEnv({refinement: [{id: 'mega-53', available: false}]})));
  assert.equal(noMega.refine, 'unavailable:engine-missing'); assert.equal(noMega['midi:strings'], 'unavailable:needs-strings');
  const noLarge = states(P.plan(P.PRESETS.quality, fullEnv({midi: midiModels.map(m => m.id === 'muscriptor-large' ? {...m, available: false} : m)})));
  assert.equal(noLarge['midi:guitar'], 'unavailable:engine-missing'); assert.equal(noLarge['midi:bass'], 'pending');
  const keptLarge = states(P.plan(P.PRESETS.quality, fullEnv({midi: midiModels.map(m => m.id === 'muscriptor-large' ? {...m, available: false} : m),
    derived: {variants: {guitar: {'muscriptor-large': {ok: true, matches: true}}}}})));
  assert.equal(keptLarge['midi:guitar'], 'pending', 'a current run on disk needs no runtime');
  const addons = P.plan(P.PRESETS.efficiency, fullEnv({derived: {vocals: {state: 'missing', due: true, missing: ['karaoke-v1 (主唱分离模型)']}}}));
  assert.equal(states(addons)['midi:vocals'], 'unavailable:addons'); assert.match(addons.find(s => s.id === 'midi:vocals').reason.list, /karaoke-v1/);
  assert.equal(states(P.plan(P.PRESETS.efficiency, fullEnv({derived: {vocals: {state: 'current', due: false, missing: ['x']}}})))['midi:vocals'], 'pending', 'a current vocal line needs no add-on');
}

// --- the runner --------------------------------------------------------------------------------------------
function fakeOps(script = {}) {
  const calls = [];
  const ops = {
    has: async engine => Boolean(script.has?.[engine]),
    analysis: async step => { calls.push(step.id); return step.id in script ? script[step.id] : {ok: true}; },
    stems: async step => { calls.push('stems'); return script.stems || {ok: true}; },
    refine: async () => { calls.push('refine'); return script.refine || {ok: true}; },
    midi: async ({exclude, onStep, onResult}) => {
      calls.push('midi:' + exclude.join(','));
      const plan = (script.batch || ['bass', 'piano', 'guitar', 'drums', 'vocals']).filter(stem => !exclude.includes(stem)).map(stem => ({kind: 'midi', stem})).concat([{kind: 'merge'}]);
      const completed = [];
      for (const step of plan) {
        if (script.cancelAt === (step.stem || 'merge')) return {ok: false, error: 'analysis-cancelled', completed};
        onStep(step);
        const response = script.parts?.[step.stem || 'merge'] || {ok: true, cached: step.stem === 'bass'};
        onResult(step, response);
        if (!response.ok) return {...response, ok: false, completed, step};
        completed.push(step);
      }
      return {ok: true, completed};
    }
  };
  return {ops, calls};
}
(async () => {
  {
    const steps = P.plan(P.PRESETS.efficiency, fullEnv());
    const {ops, calls} = fakeOps({has: {songformer: true}, stems: {ok: true, cached: true}, parts: {vocals: {ok: true, noSinging: true}, merge: {ok: true, cached: true}}});
    const updates = [];
    const out = await P.run({steps, ops, onUpdate: step => updates.push(step.id + '=' + step.state)});
    assert.equal(out.ok, true);
    assert.deepEqual(calls, ['chords', 'stems', 'midi:'], 'existing sections are not run again; one batch for all parts');
    const s = states(steps);
    assert.equal(s.sections, 'existing'); assert.equal(s.chords, 'done'); assert.equal(s.stems, 'existing');
    assert.equal(s['midi:bass'], 'existing'); assert.equal(s['midi:piano'], 'done'); assert.equal(s['midi:vocals'], 'done:no-singing'); assert.equal(s.merge, 'existing');
    assert(updates.includes('midi:guitar=running'), 'each part shows as running while it runs');
  }
  {
    // Sections / chords failing: noted, the chain goes on.
    const steps = P.plan(P.PRESETS.efficiency, fullEnv());
    const {ops, calls} = fakeOps({sections: {ok: false, error: 'analysis-failed', detail: 'Traceback\nSongFormer died'}, chords: null});
    const out = await P.run({steps, ops});
    const s = states(steps);
    assert.equal(s.sections, 'failed:failed'); assert.equal(steps[0].reason.text, 'SongFormer died', 'the last line of the reason');
    assert.equal(s.chords, 'failed:busy', 'a refused start (null) reads as busy');
    assert.equal(s.stems, 'done'); assert(calls.includes('midi:'));
    assert.equal(out.ok, false);
  }
  {
    // Stems failing: this track stops there.
    const steps = P.plan(P.PRESETS.quality, fullEnv());
    const {ops, calls} = fakeOps({stems: {ok: false, error: 'analysis-failed', detail: 'CUDA out of memory'}});
    const out = await P.run({steps, ops});
    const s = states(steps);
    assert.equal(s.stems, 'failed:failed');
    for (const id of ['refine', 'midi:bass', 'midi:strings', 'merge']) assert.equal(s[id], 'skipped:needs-stems', id);
    assert(!calls.includes('refine') && !calls.some(c => c.startsWith('midi')));
    assert.equal(out.ok, false); assert.equal(out.cancelled, false);
  }
  {
    // Fine split failing: noted; strings never reaches the batch (no source) and says so.
    const steps = P.plan(P.PRESETS.quality, fullEnv());
    const {ops} = fakeOps({refine: {ok: false, error: 'analysis-failed', detail: '细分模型尚未安装'}, batch: ['bass', 'piano', 'guitar', 'drums', 'vocals']});
    await P.run({steps, ops});
    const s = states(steps);
    assert.equal(s.refine, 'failed:failed'); assert.equal(s['midi:strings'], 'skipped:no-source'); assert.equal(s.merge, 'done');
  }
  {
    // A part failing: as 一键生成 MIDI does, the batch stops there; later parts are not run.
    const steps = P.plan(P.PRESETS.efficiency, fullEnv());
    const {ops} = fakeOps({parts: {guitar: {ok: false, error: 'analysis-failed', detail: 'MuScriptor crashed'}}});
    const out = await P.run({steps, ops});
    const s = states(steps);
    assert.equal(s['midi:guitar'], 'failed:failed'); assert.equal(s['midi:drums'], 'skipped:stopped'); assert.equal(s.merge, 'skipped:stopped');
    assert.equal(out.ok, false);
    // Vocals could not be made: a soft failure, said on its own row, merge still runs.
    const soft = P.plan(P.PRESETS.efficiency, fullEnv());
    await P.run({steps: soft, ops: fakeOps({parts: {vocals: {ok: true, skipped: true, why: '人声曲线需要的扩展没有装：karaoke-v1'}}}).ops});
    assert.equal(states(soft)['midi:vocals'], 'failed:failed'); assert.equal(states(soft).merge, 'done');
    // Unavailable parts are left out of the batch, the rest run.
    const partial = P.plan(P.PRESETS.efficiency, fullEnv({derived: {vocals: {state: 'missing', due: true, missing: ['seedvc-v1 (RMVPE)']}}}));
    const faked = fakeOps();
    await P.run({steps: partial, ops: faked.ops});
    assert(faked.calls.includes('midi:vocals'), 'the unavailable vocals part is excluded');
    assert.equal(states(partial)['midi:vocals'], 'unavailable:addons'); assert.equal(states(partial).merge, 'done');
    // The source changed between steps: the next row carries the reason.
    const moved = P.plan(P.PRESETS.efficiency, fullEnv());
    await P.run({steps: moved, ops: {...fakeOps().ops, midi: async () => ({ok: false, error: 'midi-batch-source-changed', completed: []})}});
    assert.equal(states(moved)['midi:bass'], 'failed:failed'); assert.equal(moved.find(s => s.id === 'midi:bass').reason.text, 'midi-batch-source-changed');
  }
  {
    // Cancel: before a step, from inside an analysis step, and inside the batch. Finished steps stay finished.
    let stop = false;
    const steps = P.plan(P.PRESETS.efficiency, fullEnv());
    const {ops, calls} = fakeOps();
    const wrapped = {...ops, analysis: async step => { const r = await ops.analysis(step); if (step.id === 'chords') stop = true; return r; }};
    const out = await P.run({steps, ops: wrapped, cancelled: () => stop});
    assert.equal(out.cancelled, true);
    assert.deepEqual(calls, ['sections', 'chords']);
    assert.equal(states(steps).chords, 'done'); assert.equal(states(steps).stems, 'skipped:cancelled');
    const inside = P.plan(P.PRESETS.efficiency, fullEnv());
    const cancelOut = await P.run({steps: inside, ops: fakeOps({stems: {ok: false, error: 'analysis-cancelled'}}).ops});
    assert.equal(cancelOut.cancelled, true); assert.equal(states(inside).stems, 'skipped:cancelled');
    const batch = P.plan(P.PRESETS.efficiency, fullEnv());
    const batchOut = await P.run({steps: batch, ops: fakeOps({cancelAt: 'guitar'}).ops});
    assert.equal(batchOut.cancelled, true);
    assert.equal(states(batch)['midi:piano'], 'done'); assert.equal(states(batch)['midi:guitar'], 'skipped:cancelled');
  }

  // --- the seam: derived-controls.js runBatch / setModels, driven from outside ------------------------------
  class Element {
    constructor(tag = 'div') { this.tagName = tag; this.children = []; this.handlers = {}; this.dataset = {}; this.attrs = {}; this.disabled = false; this.checked = false; this._value = ''; this.textContent = ''; }
    get options() { return this.children; }
    get value() { return this._value; } set value(v) { this._value = v; }
    append(...items) { this.children.push(...items); }
    add(item) { this.children.push(item); if (this.children.length === 1) this._value = item.value; }
    replaceChildren(...items) { this.children = items; if (this.tagName === 'select') this._value = items[0]?.value || ''; }
    setAttribute(k, v) { this.attrs[k] = v; }
    addEventListener(name, fn) { this.handlers[name] = fn; }
  }
  const elements = new Map();
  const get = id => { if (!elements.has(id)) { const e = new Element(id.endsWith('Select') ? 'select' : 'div'); e.id = id; elements.set(id, e); } return elements.get(id); };
  const stored = new Map();
  const context = {document: {getElementById: get, createElement: tag => new Element(tag)}, localStorage: {getItem: k => stored.get(k) ?? null, setItem: (k, v) => stored.set(k, v)},
    addEventListener: () => {}, Option: function (text, value) { const e = new Element('option'); e.textContent = text; e.value = value; return e; }};
  vm.createContext(context);
  for (const name of ['midi-batch.js', 'derived-controls.js']) vm.runInContext(fs.readFileSync(path.join(__dirname, '..', name), 'utf8'), context);
  const messages = require('../i18n/runtime-messages.js');
  const rt = (key, params) => messages.translateRuntime('zh-CN', key, params);
  const models = [{id: 'bass-highres', name: 'HiRes Bass', stems: ['bass'], defaultFor: 'bass', available: true},
    {id: 'piano-transkun', name: 'Transkun', stems: ['piano'], defaultFor: 'piano', available: true},
    {id: 'muscriptor-medium', name: 'MuScriptor Medium', stems: ['guitar'], defaultFor: 'guitar', available: true},
    {id: 'muscriptor-large', name: 'MuScriptor Large', stems: ['guitar'], available: true},
    {id: 'drums-adtof', name: 'ADTOF', stems: ['drums'], available: true},
    {id: 'drums-adtof-stems', name: 'ADTOF · DrumSep', stems: ['drums'], defaultFor: 'drums', available: true},
    {id: 'vocals-rmvpe', name: 'RMVPE', stems: ['vocals'], defaultFor: 'vocals', available: true}];
  // Another track than the selected one: the batch must read and plan from that track's own state.
  const other = {id: 'song-b', title: 'Song B'};
  const derivedB = {ok: true, runId: 'stems-b', midiSourceKey: 'key-b', stems: ['bass', 'piano', 'guitar', 'drums', 'other', 'vocals'].map(name => ({name, audioUrl: name + '.wav'})),
    midi: {}, variants: {}, stemVariants: {}, merged: {ok: false}, vocals: {state: 'current', due: false, sung: true, sha256: 'v'}};
  const calls = [];
  const bridge = {midiEngines: async () => models, separationEngines: async () => [],
    readDerived: async id => id === 'song-b' ? structuredClone(derivedB) : {ok: false, stems: []},
    runDerived: async (trackId, kind, stem, force, engine) => { calls.push([trackId, stem, engine]); derivedB.midi[stem] = {ok: true, noteCount: 5, runId: stem, engine}; return {ok: true, cached: stem === 'bass'}; },
    mergeMidi: async trackId => { calls.push([trackId, 'merge']); return {ok: true}; }};
  let cancel = false;
  const controls = context.XldDerivedControls.create({bridge, audio: {currentTime: 0, paused: true}, getSelected: () => ({id: 'song-a', title: 'Song A'}), getCurrent: () => null,
    queueFor: () => [], playTrack: async () => {}, rt, getBusy: () => true, onTask: () => {}, onBatchState: () => {}, isBatchCancelled: () => cancel, beforeMerge: () => ({ok: true})});
  await controls.setModels({guitar: 'muscriptor-large', drums: 'drums-adtof', bass: 'bass-highres', piano: 'piano-transkun', strings: 'strings-muscriptor-large'});
  assert.deepEqual(JSON.parse(stored.get('xld.midi.models')), {guitar: 'muscriptor-large', drums: 'drums-adtof', bass: 'bass-highres', piano: 'piano-transkun'},
    'the chosen models are remembered by the 转谱 panel; an id it does not offer is not');
  const seen = [], results = [];
  const outcome = await controls.runBatch(other, {exclude: ['vocals'], onStep: (index, total, step) => seen.push(index + '/' + total + ' ' + (step.stem || 'merge')), onResult: (step, response) => results.push((step.stem || 'merge') + ':' + Boolean(response.cached))});
  assert.equal(outcome.ok, true, JSON.stringify(outcome));
  assert.deepEqual(calls, [['song-b', 'bass', 'bass-highres'], ['song-b', 'piano', 'piano-transkun'], ['song-b', 'guitar', 'muscriptor-large'], ['song-b', 'drums', 'drums-adtof'], ['song-b', 'merge']],
    'the non-selected track, with the models just set, vocals left out');
  assert.deepEqual(seen, ['1/5 bass', '2/5 piano', '3/5 guitar', '4/5 drums', '5/5 merge']);
  assert.deepEqual(results, ['bass:true', 'piano:false', 'guitar:false', 'drums:false', 'merge:false']);
  cancel = true; calls.length = 0;
  const stopped = await controls.runBatch(other, {});
  assert.equal(stopped.error, 'analysis-cancelled'); assert.equal(calls.length, 0, 'the shared cancel flag stops it before the first part');

  // The vocal add-on check the plan relies on mirrors vocals_runner.py addons(): same variables, same files.
  {
    const os = require('node:os'), {addonsMissing} = require('../core/score-vocals.cjs');
    const base = fs.mkdtempSync(path.join(os.tmpdir(), 'xld-oneclick-'));
    try {
      const env = {XLD_MUSCRIPTOR_ROOT: path.join(base, 'muscriptor-v1')};
      assert.deepEqual(addonsMissing(env), ['karaoke-v1 (主唱分离模型)', 'seedvc-v1 (RMVPE)']);
      assert.deepEqual(addonsMissing({}), ['karaoke-v1 (主唱分离模型)', 'seedvc-v1 (RMVPE)'], 'nothing configured = both missing');
      fs.mkdirSync(path.join(base, 'karaoke-v1', 'becruily'), {recursive: true});
      for (const name of ['model.ckpt', 'config.yaml']) fs.writeFileSync(path.join(base, 'karaoke-v1', 'becruily', name), 'x');
      assert.deepEqual(addonsMissing(env), ['seedvc-v1 (RMVPE)']);
      fs.mkdirSync(path.join(base, 'seedvc-v1', 'upstream', 'checkpoints', 'deep'), {recursive: true});
      fs.mkdirSync(path.join(base, 'seedvc-v1', 'upstream', 'modules'), {recursive: true});
      fs.writeFileSync(path.join(base, 'seedvc-v1', 'upstream', 'checkpoints', 'deep', 'rmvpe.pt'), 'w');
      fs.writeFileSync(path.join(base, 'seedvc-v1', 'upstream', 'modules', 'rmvpe.py'), '');
      assert.deepEqual(addonsMissing(env), [], 'weights found anywhere under checkpoints, as rglob does');
      assert.deepEqual(addonsMissing({XLD_KARAOKE_ROOT: path.join(base, 'karaoke-v1'), XLD_SEEDVC_ROOT: path.join(base, 'seedvc-v1')}), [], 'explicit roots win');
    } finally { fs.rmSync(base, {recursive: true, force: true}); }
  }

  // The pieces are wired: the overview block, the scripts, the album button delegating to the same chain.
  const root = path.join(__dirname, '..');
  const html = fs.readFileSync(path.join(root, 'index.html'), 'utf8'), app = fs.readFileSync(path.join(root, 'app.js'), 'utf8');
  for (const id of ['oneclickPanel', 'oneclickPreset', 'oneclickChoices', 'oneclickChoiceList', 'oneclickTrack', 'oneclickAlbum', 'oneclickSteps', 'oneclickStatus']) assert(html.includes('id="' + id + '"'), id);
  assert(html.indexOf('oneclick-plan.js') < html.indexOf('oneclick-controls.js') && html.indexOf('oneclick-controls.js') < html.indexOf('src="app.js"'));
  assert(!/BTC/.test(html.match(/<button id="batchAlbumButton"[^>]*>/)[0]), 'the album button no longer promises BTC');
  assert(/async function runAlbumBatch\(\)[\s\S]{0,200}oneclickControls\?\.runAlbum\(\)/.test(app), 'the album button runs the one-click chain');
  for (const locale of ['zh-CN', 'en-US']) for (const key of ['title', 'preset.efficiency', 'preset.quality', 'preset.custom', 'state.existing', 'state.unavailable', 'reason.addons', 'advice.refine', 'advice.guitar', 'advice.drums'])
    assert(!messages.translateRuntime(locale, 'runtime.oneclick.' + key).startsWith('runtime.'), locale + ' ' + key);
  console.log('One-click plan: PASS (presets / custom / storage, plans for both presets, unavailable up front, skip existing, failure paths, cancel, runBatch seam on another track, wiring)');
})().catch(error => { console.error(error); process.exitCode = 1; });
