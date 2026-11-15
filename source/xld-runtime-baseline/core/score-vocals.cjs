'use strict';
// The vocal line as XLD keeps it (engine `score-vocals`, analysis-score/vocals_runner.py): notes and pitch curve in
// `<track>/score-vocals.json`, the lead and backing it was cut from in `<track>/refinement/<runId>/target.wav` and
// `residual.wav`, described by `<track>/refinement/<cacheKey>.json` (kind 'refinement', engine 'karaoke-lead').
//
// A result is current when the vocal stem it records (run id, path, size, modification time) is the vocal stem the
// track has now, and the split files it names are there and fit that stem. That is the one question every caller
// asks: the analysis service before running (answer from disk or run), the one-click transcription before
// planning (is the vocal step owed), the timeline before drawing. Nothing here writes.
const fs = require('node:fs/promises');
const path = require('node:path');
const {fileURLToPath} = require('node:url');
const audio = require('./stem-audio.cjs');

const ENGINE = 'score-vocals';
const SPLIT_ENGINE = 'karaoke-lead';
const MTIME_SLACK_MS = 1;

const samePath = (a, b) => process.platform === 'win32'
  ? path.resolve(a).toLowerCase() === path.resolve(b).toLowerCase() : path.resolve(a) === path.resolve(b);

// {stemRunId, stem, path, size, mtimeMs, frames, sampleRate, channels} of the track's current vocal stem, or null.
async function stemSource(assets, track) {
  let stems = null;
  try { stems = await assets.readStems(track); } catch (_) { stems = null; }
  if (!stems?.ok) return null;
  const stem = stems.stems.find(item => item.name === 'vocals');
  if (!stem?.audioUrl) return null;
  const file = fileURLToPath(stem.audioUrl);
  let stat;
  try { stat = await fs.stat(file); } catch (_) { return null; }
  return {stemRunId: stems.runId, stem: 'vocals', path: file, size: stat.size, mtimeMs: stat.mtimeMs,
    frames: stem.frames, sampleRate: stem.sampleRate, channels: stem.channels};
}

function sameSource(recorded, current) {
  if (!recorded || !current) return false;
  return recorded.stemRunId === current.stemRunId && typeof recorded.path === 'string' && samePath(recorded.path, current.path)
    && recorded.size === current.size && Number.isFinite(recorded.mtimeMs) && Math.abs(recorded.mtimeMs - current.mtimeMs) <= MTIME_SLACK_MS;
}

// The two split files named in a result, checked against the stem: present, float WAV or marked 24-bit FLAC
// (core/stem-audio.cjs), same frames, rate, channels.
async function readSplit(directory, split, current) {
  if (!split || typeof split !== 'object') return {ok: false, error: 'split-missing'};
  const inside = relative => {
    if (typeof relative !== 'string' || !relative.startsWith('refinement/')) return null;
    const file = path.resolve(directory, ...relative.split('/'));
    return path.dirname(path.dirname(file)) === path.resolve(directory, 'refinement') || path.dirname(file) === path.resolve(directory, 'refinement') ? file : null;
  };
  const files = {lead: inside(split.lead), backing: inside(split.backing), manifest: inside(split.manifest)};
  if (!files.lead || !files.backing || !files.manifest) return {ok: false, error: 'split-path-invalid'};
  try {
    const saved = JSON.parse(await fs.readFile(files.manifest, 'utf8'));
    const ref = saved?.originalSource || {};
    if (saved?.kind !== 'refinement' || saved.engine !== SPLIT_ENGINE || saved.runId !== split.runId || ref.runId !== current.stemRunId
      || ref.size !== current.size || !(Math.abs(ref.mtimeMs - current.mtimeMs) <= MTIME_SLACK_MS)) return {ok: false, error: 'split-stale'};
    for (const name of ['lead', 'backing']) {
      const h = await audio.probe(files[name]);
      if (!audio.isStemFormat(h) || h.frames !== current.frames || h.channels !== current.channels || h.sampleRate !== current.sampleRate)
        return {ok: false, error: 'split-audio-invalid'};
    }
  } catch (error) { return {ok: false, error: error.code === 'ENOENT' ? 'split-missing' : 'split-invalid'}; }
  return {ok: true, ...files, runId: split.runId, model: split.model || null};
}

// {state, due, result?, split?, source}
//   state  'no-stem'  no vocal stem (nothing to do until the track is separated)
//          'missing'  no score-vocals.json
//          'stale'    made from another vocal stem, or from before the source was recorded in full
//          'split-missing'  current notes, but the lead / backing files it names are gone or do not fit
//          'current'  answered from disk
//   due    true when a run would make something new (a vocal stem exists and the result is not current)
async function read(assets, track, directory) {
  const source = await stemSource(assets, track);
  if (!source) return {state: 'no-stem', due: false, source: null};
  let result = null;
  try { result = JSON.parse(await fs.readFile(path.join(directory, ENGINE + '.json'), 'utf8')); } catch (_) { result = null; }
  if (result?.kind !== ENGINE) return {state: 'missing', due: true, source};
  if (!sameSource(result.source, source)) return {state: 'stale', due: true, source, result};
  // Made by another model version (core/score-identity.cjs). No recorded identity = an earlier result, still valid.
  if (!require('./score-identity.cjs').isCurrent(result, ENGINE)) return {state: 'stale', due: true, source, result, why: 'model-changed'};
  const named = result.provenance?.split;
  if (named) {
    const split = await readSplit(directory, named, source);
    if (!split.ok) return {state: 'split-missing', due: true, source, result, why: split.error};
    return {state: 'current', due: false, source, result, split};
  }
  // Only a stem with no singing in it is allowed to have no split: the runner never splits it.
  if (result.lane) return {state: 'split-missing', due: true, source, result, why: 'split-missing'};
  return {state: 'current', due: false, source, result, split: null};
}

// What the analysis service accepts from the runner: a score-vocals result made from the stem the track has now.
async function validate(assets, track, directory, value) {
  if (value?.kind !== ENGINE || value.engine?.id !== ENGINE || !Array.isArray(value.segments)) throw new Error('score-vocals-invalid');
  const source = await stemSource(assets, track);
  if (!source) {
    if ((value.source?.stemRunId ?? null) !== null) throw new Error('处理期间人声分轨发生变化');
    return value;
  }
  if (!sameSource(value.source, source)) throw new Error('处理期间人声分轨发生变化');
  if (value.provenance?.split) {
    const split = await readSplit(directory, value.provenance.split, source);
    if (!split.ok) throw new Error('主唱 / 和声文件核对不符：' + split.error);
  } else if (value.lane) throw new Error('score-vocals-invalid');
  return value;
}

// The timeline's row: notes as [start, end, pitch, velocity, instrument, index], the curve as stored.
function laneOf(state) {
  const lane = state?.result?.lane;
  if (state?.state !== 'current' || !lane || !Array.isArray(lane.notes)) return null;
  const notes = lane.notes.filter(note => Array.isArray(note) && note.length >= 3)
    .map((note, index) => [Number(note[0]) || 0, (Number(note[0]) || 0) + (Number(note[1]) || 0), Number(note[2]) || 0, Number(note[3]) || 90, null, index]);
  const contour = lane.contour && Array.isArray(lane.contour.midi) && Number(lane.contour.hop) > 0
    ? {hop: Number(lane.contour.hop), start: Number(lane.contour.start) || 0, midi: lane.contour.midi} : null;
  return {notes, contour};
}

// The timeline's vocals row, given the MIDI lanes already read and the vocal line's state (read()).
// A vocals MIDI run (vocals-rmvpe, converted from this result, or a revision of one) is the row like any other part:
// it has a runId and can be edited, checked and exported; the pitch curve still comes from score-vocals.json. Only
// the old pYIN run (no longer offered) gives way to a current vocal line. With no vocals run, a current vocal line is
// drawn read-only (as before vocals became a part, so a library not yet regenerated looks as it did); a current
// result with no singing is a "no singing" row; otherwise the lanes are returned as they were.
function vocalsRow(lanes, state) {
  const line = laneOf(state);
  const kept = state?.state === 'current' ? lanes.filter(lane => !(lane.stem === 'vocals' && lane.engine === 'vocals-pyin')) : lanes.slice();
  const part = kept.find(lane => lane.stem === 'vocals');
  if (part) return line?.contour ? kept.map(lane => lane === part ? {...lane, contour: line.contour} : lane) : kept;
  if (line) return [...kept, {stem: 'vocals', engine: ENGINE, engineName: null,
    sourceRunId: state.source.stemRunId, runId: null, matches: true, duration: Number(state.result.duration) || 0,
    noteCount: line.notes.length, editable: false, minNoteDuration: .01, sourceAudio: null, instruments: [], notes: line.notes, contour: line.contour}];
  if (state?.state === 'current' && !state.result?.lane) return [...kept, {stem: 'vocals', engine: ENGINE, engineName: null,
    sourceRunId: state.source.stemRunId, runId: null, matches: true, duration: Number(state.result?.duration) || 0, noteCount: 0, editable: false,
    sourceAudio: null, instruments: [], notes: [], status: 'none'}];
  return kept;
}

// The add-ons a score-vocals run needs, checked the way analysis-score/vocals_runner.py addons() checks them (same
// environment variables, same files), so the one-click analysis can say "unavailable" before it starts instead of
// failing on the vocals step. Returns the runner's own names of what is missing ([] when both are there). The runner
// skips the karaoke model when a stored split for the stem exists; this does not know that and names it anyway.
function addonsMissing(env = process.env) {
  const fsSync = require('node:fs');
  const base = env.XLD_MUSCRIPTOR_ROOT ? path.dirname(path.resolve(env.XLD_MUSCRIPTOR_ROOT)) : null;
  const karaoke = env.XLD_KARAOKE_ROOT || (base ? path.join(base, 'karaoke-v1') : null);
  const seedvc = env.XLD_SEEDVC_ROOT || (base ? path.join(base, 'seedvc-v1') : null);
  const isFile = file => { try { return fsSync.statSync(file).isFile(); } catch (_) { return false; } };
  let weights = false;
  if (seedvc) {
    try { weights = fsSync.readdirSync(path.join(seedvc, 'upstream', 'checkpoints'), {recursive: true}).some(name => path.basename(String(name)) === 'rmvpe.pt'); } catch (_) { weights = false; }
  }
  const missing = [];
  if (!karaoke || !isFile(path.join(karaoke, 'becruily', 'model.ckpt')) || !isFile(path.join(karaoke, 'becruily', 'config.yaml'))) missing.push('karaoke-v1 (主唱分离模型)');
  if (!seedvc || !weights || !isFile(path.join(seedvc, 'upstream', 'modules', 'rmvpe.py'))) missing.push('seedvc-v1 (RMVPE)');
  return missing;
}

module.exports = {ENGINE, SPLIT_ENGINE, stemSource, sameSource, readSplit, read, validate, laneOf, vocalsRow, addonsMissing};
