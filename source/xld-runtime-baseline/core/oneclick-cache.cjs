'use strict';
// A read-only view of the inputs the serial one-click run will select. A cached separation or MIDI
// can be inactive today and become active in the middle of the run. Never activate it to preview it.
const fs = require('node:fs/promises');
const path = require('node:path');
const {createMidiAssets, midiCacheHit, keepsManualRevision, separationForResult, engineOf} = require('./derived-assets.cjs');
const {legacyIdentity} = require('./onetrack-upgrade.cjs');
const {createPartSource, isNone} = require('./string-source.cjs');
const {createRefinement} = require('./refinement.cjs');
const {createMidiMerge} = require('./midi-merge.cjs');
const mood = require('./mood-curve.cjs');

const absent = error => error.code === 'ENOENT';
async function entries(directory) {
  try { return await fs.readdir(directory); }
  catch (error) { if (!absent(error)) throw error; return []; }
}
async function json(file) {
  try { return JSON.parse(await fs.readFile(file, 'utf8')); }
  catch (error) { if (!absent(error) && !(error instanceof SyntaxError)) throw error; return null; }
}
const row = (state, code) => ({state, reason: code ? {code} : null});
const existing = code => row('existing', code);
const due = (previous, reason) => previous ? row('rerun', reason) : row('pending');

async function preview(track, steps, {otherRoute, device}, {assets, analysisDirectory, currentVocalLine, findUpgrade}) {
  const result = {};
  const directory = assets.directory(track);
  const separation = steps.find(step => step.kind === 'stems');
  const selected = await assets.readStems(track, separation.engine);
  const active = await assets.readStems(track);
  const changing = separation.state !== 'unavailable' && (!selected.ok || selected.runId !== active.runId);
  // If separation is unavailable, mood still runs against the active manifest.
  const stems = separation.state === 'unavailable' ? active : selected;
  const projected = {directory: assets.directory, readStems: async () => stems};
  const sources = {strings: createPartSource({assets: projected, part:'strings'}), winds: createPartSource({assets: projected, part:'winds'})};
  let strings = await sources.strings.current(track), winds = await sources.winds.current(track);
  projected.readStringsSelection = async () => strings;
  // A wind source may itself depend on the strings residual. Re-resolve it after a strings adoption.
  const midi = createMidiAssets({analysisDirectory: assets.directory, readStems: projected.readStems,
    readStringSource: async () => strings, readWindsSource: async () => winds});
  const adopted = new Map();
  let newMidi = false, newStrings = false, newWinds = false, silentWinds = false;
  const refinement = createRefinement({assets: projected});
  async function priorRefinement(target) {
    const folder = path.join(directory,'refinement');
    for (const name of await entries(folder)) {
      if (!/^[0-9a-f]{64}\.json$/.test(name)) continue;
      const prior = await json(path.join(folder,name));
      if (prior?.engine === 'mega-53' && prior.scope === 'full' && prior.target === target) return true;
    }
    return false;
  }
  async function priorMerge() {
    const folder = path.join(directory,'midi','merged');
    for (const name of await entries(folder)) {
      if (!/^(?:[0-9a-f]{16}|[0-9a-f]{64})$/.test(name)) continue;
      if ((await json(path.join(folder,name,'merge.json')))?.kind === 'midi-merge') return true;
    }
    return false;
  }
  for (const step of steps) {
    const modelUnavailable = step.kind === 'midi' && step.state === 'unavailable' && step.reason?.code === 'engine-missing';
    if ((step.state === 'unavailable' && !modelUnavailable) || step.kind === 'analysis') continue;
    if (step.kind === 'stems') {
      const before = selected.ok ? null : await json(assets.stemsManifestPath(track, separation.engine)) || await json(assets.stemsManifestPath(track));
      result[step.id] = selected.ok ? existing() : due(before, before && separationForResult(before)?.id !== separation.engine ? 'model-changed' : 'input-changed');
    } else if (step.kind === 'mood') {
      const sharesStems = path.resolve(directory) === path.resolve(analysisDirectory);
      const manifest = changing && sharesStems ? (selected.ok ? selected : null) : undefined;
      const state = await mood.status(track,analysisDirectory,manifest);
      const nextStems = changing && sharesStems && !selected.ok;
      result[step.id] = state === 'current' && !nextStems ? existing() : due(state !== 'missing', 'mood-changed');
    } else if (step.kind === 'refine') {
      const wind = step.id === 'refine-winds';
      if (!wind && strings) { result[step.id] = existing(); continue; }
      const part = wind ? 'winds' : 'strings';
      const target = wind ? 'wind' : 'strings';
      const cached = await refinement.read(track,{engine:step.engine,target,sourceStem:wind?'strings-residual':'other',scope:'full',device});
      if (cached.ok) {
        const source = await sources[part].resolve(track,cached);
        if (wind) { silentWinds = isNone(source.level); winds = silentWinds ? null : source; }
        else { strings = source; winds = await sources.winds.current(track); }
        result[step.id] = existing();
      } else {
        if (wind) { winds = null; newWinds = true; }
        else { strings = null; newStrings = true; }
        result[step.id] = due(await priorRefinement(target), 'split-changed');
      }
    } else if (step.kind === 'midi') {
      const {stem, engine} = step;
      if (stem === 'winds' && silentWinds) { result[step.id] = row('skipped','no-winds'); continue; }
      if ((stem === 'strings' && !strings && !newStrings) || (stem === 'winds' && !winds && !newWinds)) {
        result[step.id] = step.onlyIfSource ? {omitted:true} : row('skipped','no-source'); continue;
      }
      const vocal = stem === 'vocals' ? await currentVocalLine(track, projected).catch(() => ({sung:null})) : null;
      if (vocal?.sung === false) { result[step.id] = existing('no-singing'); continue; }
      const cached = await midi.read(track, stem, engine);
      if (!midiCacheHit(cached,vocal)) {
        const upgrade = await findUpgrade(track,midi,stem,engine,directory,cached.runId);
        if (upgrade) {
          newMidi = true; result[step.id] = row('upgrade','onetrack-upgrade'); continue;
        }
      }
      if (modelUnavailable) continue;
      if (midiCacheHit(cached, vocal)) {
        const activePart = await midi.read(track, stem);
        adopted.set(stem, keepsManualRevision(activePart,cached) ? activePart : cached);
        result[step.id] = existing();
      } else {
        const {runs} = await midi.collectRuns(track, stem);
        const sameModel = [...runs.values()].some(({raw}) => engineOf(raw) === engine);
        let reason = 'input-changed';
        if (cached.ok && legacyIdentity(cached,engine)) reason = 'onetrack-unavailable';
        else if ((cached.ok && !cached.matches) || !sameModel) reason = 'model-changed';
        else if (vocal && cached.ok) reason = 'vocal-changed';
        result[step.id] = due(runs.size, reason);
        newMidi = true;
      }
    } else if (step.kind === 'merge') {
      // A new model run has no run ID or notes yet. Only when every participating run is known
      // can we check the real fingerprint, including inactive cached runs and manual revisions.
      if (newMidi) {
        result[step.id] = (await priorMerge()) ? row('rerun','parts-changed') : row('pending','after-midi');
        continue;
      }
      const readMidi = (song,stem) => adopted.get(stem) || midi.read(song,stem);
      const merge = createMidiMerge({assets:{...projected, midi, readMidi, readOtherRoute:async () => otherRoute}});
      const cached = await merge.read(track);
      if (cached.ok) result[step.id] = existing();
      else if (cached.error === 'merge-needs-parts') result[step.id] = row('skipped','merge-skipped');
      else if (cached.error.startsWith('merge-draft-')) result[step.id] = row('unavailable','merge-draft');
      else result[step.id] = due(await priorMerge(),'parts-changed');
    }
  }
  return result;
}
module.exports = {preview};
