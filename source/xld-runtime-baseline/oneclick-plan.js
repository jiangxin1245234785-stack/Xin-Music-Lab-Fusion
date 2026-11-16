// One-click analysis, the part that needs no window: the two presets and what counts as "custom", the step list for
// one track (sections -> chords -> stems -> optional fine split -> every part's MIDI -> merge), which steps are
// unavailable before anything starts, and the serial runner that walks the list through injected operations.
// oneclick-controls.js owns the DOM and supplies the real operations; tests/oneclick-plan.cjs supplies fakes.
(function(root){
  'use strict';
  const STORAGE_KEY = 'xld.oneclick';
  const PRESETS = Object.freeze({
    efficiency: Object.freeze({separation:'bs-roformer-sw', refine:false, piano:'piano-muscriptor-medium', bass:'bass-muscriptor-medium', guitar:'muscriptor-medium', strings:'strings-muscriptor-medium', drums:'drums-adtof', vocals:true}),
    quality: Object.freeze({separation:'bs-roformer-sw', refine:true, piano:'piano-muscriptor-large', bass:'bass-muscriptor-large', guitar:'muscriptor-large', strings:'strings-muscriptor-large', drums:'drums-adtof-stems', vocals:true})
  });
  // MODELS-2: every part transcribed with MuScriptor (piano, bass, guitar, strings) is Medium in 效率 and Large in
  // 质量; the manual default of each part (models.json defaultFor) must agree (tests/model-defaults.cjs).
  const OPTIONS = Object.freeze({
    separation: ['bs-roformer-sw', 'demucs-6s'], refine: [false, true],
    piano: ['piano-muscriptor-medium', 'piano-muscriptor-large'], bass: ['bass-muscriptor-medium', 'bass-muscriptor-large'],
    guitar: ['muscriptor-medium', 'muscriptor-large'], strings: ['strings-muscriptor-medium', 'strings-muscriptor-large'],
    drums: ['drums-adtof', 'drums-adtof-stems'], vocals: [true, false]
  });
  const KEYS = Object.keys(OPTIONS);
  const PARTS = ['bass', 'piano', 'guitar', 'drums', 'strings', 'vocals'];
  // Measured on this machine (GPU), read from the real analysis root on 2026-11-14: logs/analysis.jsonl and
  // analysis.dev-root-20261113.jsonl "finish" events that were not cache reads (elapsedSeconds), divided by the
  // track length from its stems manifest; fine split from refinement/<key>.json backend.elapsedSeconds and the size of
  // its run folder; stems from stems/<engine>.json elapsedSeconds and the size of its run folder. Medians, seconds of
  // work per minute of audio. Strings with MuScriptor Medium has no run on record, so it has no figure.
  const MEASURED = Object.freeze({
    roformer: {secPerMin: 7.9, runs: 22, mbPerMin: 121}, demucs: {secPerMin: 2.0, runs: 4},
    refine: {secPerMin: 7.3, runs: 14, mbPerMin: 40},
    guitarMedium: {secPerMin: 6.5, runs: 9}, guitarLarge: {secPerMin: 42, runs: 12},
    stringsLarge: {secPerMin: 9.8, runs: 9},
    drums: {secPerMin: 1.0, runs: 17}, drumSep: {secPerMin: 3.9, runs: 8},
    vocals: {secPerMin: 8.3, runs: 1}
  });

  function presetOf(choices) {
    for (const name of Object.keys(PRESETS)) if (KEYS.every(key => choices?.[key] === PRESETS[name][key])) return name;
    return 'custom';
  }
  function normalize(value) {
    const base = PRESETS[value?.preset] || PRESETS.efficiency, choices = {};
    for (const key of KEYS) choices[key] = OPTIONS[key].includes(value?.choices?.[key]) ? value.choices[key] : base[key];
    return {preset: presetOf(choices), choices};
  }
  function load(storage) {
    try { return normalize(JSON.parse(storage?.getItem(STORAGE_KEY) || 'null')); } catch (_) { return normalize(null); }
  }
  function save(storage, state) {
    try { storage?.setItem(STORAGE_KEY, JSON.stringify({preset: presetOf(state.choices), choices: state.choices})); } catch (_) {}
  }
  function applyPreset(name) { return normalize({preset: name}); }
  function choose(state, key, value) {
    if (!OPTIONS[key]?.includes(value)) return state;
    const choices = {...state.choices, [key]: value};
    return {preset: presetOf(choices), choices};
  }
  // The models the 转谱 panel is told to use (and then remembers): one per part.
  const midiPicks = choices => ({bass: choices.bass, piano: choices.piano, guitar: choices.guitar, drums: choices.drums, strings: choices.strings});

  // env: {analysis:[{id,available}], separation:[{id,available}], refinement:[{id,available}], midi:[{id,stems,available}],
  //       derived: the track's readDerived answer (may be null), has: engine -> boolean (a section / chord result exists)}
  function plan(choices, env = {}) {
    const find = (list, id) => (list || []).find(item => item.id === id);
    const usable = (list, id) => Boolean(find(list, id)?.available);
    const has = env.has || (() => false);
    const derived = env.derived || null;
    const steps = [];
    const add = step => { steps.push({state: 'pending', reason: null, ...step}); return steps[steps.length - 1]; };
    const off = (step, code, extra = {}) => { step.state = 'unavailable'; step.reason = {code, ...extra}; };

    const sections = add({id: 'sections', kind: 'analysis', engine: 'songformer', auto: true});
    if (!usable(env.analysis, 'songformer') && !has('songformer')) off(sections, 'engine-missing');
    const chordEngine = usable(env.analysis, 'chord-chordmini') ? 'chord-chordmini' : usable(env.analysis, 'chord-btc') ? 'chord-btc'
      : has('chord-chordmini') ? 'chord-chordmini' : has('chord-btc') ? 'chord-btc' : 'chord-chordmini';
    const chords = add({id: 'chords', kind: 'analysis', engine: chordEngine});
    if (!usable(env.analysis, chordEngine) && !has(chordEngine)) off(chords, 'engine-missing');

    const stems = add({id: 'stems', kind: 'stems', engine: choices.separation});
    const stemsKept = Boolean(derived?.stemVariants?.[choices.separation]?.ok);
    if (!usable(env.separation, choices.separation) && !stemsKept) off(stems, 'engine-missing');
    const noStems = stems.state === 'unavailable';

    const stringsSource = Boolean(derived?.strings?.active);
    let refine = null;
    if (choices.refine) {
      refine = add({id: 'refine', kind: 'refine', engine: 'mega-53'});
      if (noStems) off(refine, 'needs-stems');
      else if (!stringsSource && !usable(env.refinement, 'mega-53') && !derived?.strings?.choices?.length) off(refine, 'engine-missing');
    }

    const picks = midiPicks(choices);
    for (const stem of PARTS) {
      if (stem === 'strings' && !choices.refine && !stringsSource) continue;
      if (stem === 'vocals' && !choices.vocals) continue;
      const engine = stem === 'vocals' ? 'vocals-rmvpe' : picks[stem];
      const step = add({id: 'midi:' + stem, kind: 'midi', stem, engine});
      const model = find(env.midi, engine);
      const kept = derived?.variants?.[stem]?.[engine];
      if (noStems) off(step, 'needs-stems');
      else if (!model) off(step, 'engine-missing');
      else if (!model.available && !(kept?.ok && kept.matches !== false)) off(step, 'engine-missing');
      else if (stem === 'strings' && !stringsSource && refine?.state === 'unavailable') off(step, 'needs-strings');
      else if (stem === 'vocals' && derived?.vocals?.state !== 'current' && derived?.vocals?.missing?.length) off(step, 'addons', {list: derived.vocals.missing.join('、')});
    }
    const merge = add({id: 'merge', kind: 'merge', engine: 'midi-merge'});
    if (noStems) off(merge, 'needs-stems');
    return steps;
  }

  const lastLine = value => String(value || '').trim().split(/\r?\n/).pop().slice(0, 200);

  // Walks the steps strictly one after another. ops: {has(engine), analysis(step), stems(step), refine(step),
  // midi({exclude, onStep(step), onResult(step, response)})}; every op answers like the bridge ({ok, cached, error, detail}).
  // Section / chord failures are noted and the chain goes on; a stems failure ends this track; MIDI failures follow
  // 一键生成 MIDI (its runner stops at the first failing part). Cancel keeps what is done and marks the rest 未运行.
  async function run({steps, ops, cancelled = () => false, onUpdate = () => {}}) {
    const set = (step, state, reason = null) => { step.state = state; step.reason = reason; onUpdate(step); };
    const skipRest = code => { for (const step of steps) if (step.state === 'pending' || step.state === 'running') set(step, 'skipped', {code}); };
    const why = response => response?.error === 'analysis-cancelled' ? null : {code: 'failed', text: lastLine(response?.detail || response?.error || 'request-failed')};
    const isCancel = response => response?.error === 'analysis-cancelled';
    let midiDone = false;
    for (const step of steps) {
      if (cancelled()) { skipRest('cancelled'); return {ok: false, cancelled: true, steps}; }
      if (step.state !== 'pending') continue;
      if (step.kind === 'analysis') {
        if (await ops.has(step.engine)) { set(step, 'existing'); continue; }
        set(step, 'running');
        let response; try { response = await ops.analysis(step); } catch (error) { response = {ok: false, error: 'request-failed', detail: String(error)}; }
        if (isCancel(response)) { skipRest('cancelled'); return {ok: false, cancelled: true, steps}; }
        if (response?.ok) set(step, 'done'); else set(step, 'failed', response ? why(response) : {code: 'busy'});
        continue;
      }
      if (step.kind === 'stems' || step.kind === 'refine') {
        set(step, 'running');
        let response; try { response = await ops[step.kind](step); } catch (error) { response = {ok: false, error: 'request-failed', detail: String(error)}; }
        if (isCancel(response)) { skipRest('cancelled'); return {ok: false, cancelled: true, steps}; }
        if (response?.ok) { set(step, response.cached ? 'existing' : 'done'); continue; }
        set(step, 'failed', why(response));
        if (step.kind === 'stems') { skipRest('needs-stems'); return {ok: false, cancelled: false, steps}; }
        continue;
      }
      if ((step.kind === 'midi' || step.kind === 'merge') && !midiDone) {
        midiDone = true;
        const rows = steps.filter(item => item.kind === 'midi' || item.kind === 'merge');
        const exclude = rows.filter(item => item.kind === 'midi' && item.state === 'unavailable').map(item => item.stem);
        const rowOf = batchStep => rows.find(item => batchStep.kind === 'merge' ? item.kind === 'merge' : item.stem === batchStep.stem);
        let outcome;
        try {
          outcome = await ops.midi({exclude,
            onStep: batchStep => { const row = rowOf(batchStep); if (row) set(row, 'running'); },
            onResult: (batchStep, response) => {
              const row = rowOf(batchStep); if (!row) return;
              if (!response?.ok) { if (!isCancel(response)) set(row, 'failed', why(response)); return; }
              if (response.skipped && response.why) set(row, 'failed', {code: 'failed', text: lastLine(response.why)});
              else if (response.skipped) set(row, 'done', {code: 'merge-skipped'});
              else if (response.noSinging) set(row, 'done', {code: 'no-singing'});
              else set(row, response.cached ? 'existing' : 'done');
            }});
        } catch (error) { outcome = {ok: false, error: 'request-failed', detail: String(error)}; }
        if (isCancel(outcome)) { skipRest('cancelled'); return {ok: false, cancelled: true, steps}; }
        if (!outcome?.ok) {
          const running = rows.filter(row => row.state === 'running');
          for (const row of running) set(row, 'failed', why(outcome));
          // Stopped between steps (the WAV source changed): the next row carries the reason.
          if (!running.length && !rows.some(row => row.state === 'failed')) { const next = rows.find(row => row.state === 'pending'); if (next) set(next, 'failed', why(outcome)); }
        }
        // Parts the batch did not include (no strings source after a failed fine split) or never reached.
        for (const row of rows) if (row.state === 'pending') set(row, 'skipped', {code: outcome?.ok ? 'no-source' : 'stopped'});
      }
    }
    return {ok: !steps.some(step => step.state === 'failed'), cancelled: false, steps};
  }

  const api = {STORAGE_KEY, PRESETS, OPTIONS, KEYS, MEASURED, presetOf, normalize, load, save, applyPreset, choose, midiPicks, plan, run};
  if (typeof module === 'object' && module.exports) module.exports = api;
  root.XldOneClickPlan = api;
})(globalThis);
