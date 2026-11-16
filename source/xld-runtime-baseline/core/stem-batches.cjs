'use strict';
// An earlier stem batch (stems/<runId>/) and the MIDI versions made from it (audit fix 1, items 4 and 5;
// work/audit-20261115/STORAGE-PLAN.md section 4).
//
// A MIDI version made from a batch is either one that follows it - a model's output that nothing else holds on to,
// useless once the batch is gone - or one that holds it: a hand-edited revision (never removed automatically), a
// pinned version (保留), or the version in use. A batch is retired only when nothing holds it and no refinement result
// is made from it: the batch folder and the payload folders of its followers go to the Recycle Bin (or are removed,
// when the caller has no bin), and their records stay, so the version list shows them as recycled and a restore from
// the bin brings them back - exactly what MIDI retention already does with surplus versions.
const fs = require('node:fs/promises');
const fsSync = require('node:fs');
const path = require('node:path');
const {guarded} = require('./storage.cjs');

const UUID = /^[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/;
const MANUAL_ENGINE = 'manual-revision';

// The marker a MIDI version leaves when its folder goes to the Recycle Bin with its stem batch.
async function markRecycled(directory, stem, runId, batch) {
  const folder = path.join(directory, 'midi', stem, 'recycled');
  await fs.mkdir(folder, {recursive: true});
  await fs.writeFile(path.join(folder, runId + '.json'), JSON.stringify({schemaVersion: 1, kind: 'midi-recycled', stem, runId, batch, to: 'recycle-bin', at: new Date().toISOString()}));
}

function createStemBatches({assets}) {
  const derived = require('./derived-assets.cjs');
  // {follow: [{stem, runId, folder}], hold: [{stem, runId, reason}]} for the MIDI versions made from batch `runId`.
  async function dependents(track, runId) {
    const directory = assets.directory(track), follow = [], hold = [];
    for (const stem of derived.STEMS) {
      if (stem === 'strings' || stem === 'winds') continue;   // strings and winds are made from refinement results, not from a stem batch
      const runs = await assets.midi.listRuns(track, stem);
      for (const run of runs) {
        if (run.sourceRunId !== runId) continue;
        const reason = run.engine === MANUAL_ENGINE ? 'manual' : run.kept ? 'kept' : run.active ? 'active' : null;
        if (reason) { hold.push({stem, runId: run.runId, reason}); continue; }
        const folder = path.join(directory, 'midi', stem, run.runId);
        if (fsSync.existsSync(folder)) follow.push({stem, runId: run.runId, folder});
      }
    }
    return {follow, hold};
  }
  // Refinement results made from the batch whose folders still exist.
  async function refinements(track, runId) {
    const folder = path.join(assets.directory(track), 'refinement');
    let names = [];
    try { names = await fs.readdir(folder); } catch (_) { return []; }
    const out = [];
    for (const name of names.filter(n => /^[a-f0-9]{64}\.json$/.test(n))) {
      try {
        const value = JSON.parse(await fs.readFile(path.join(folder, name), 'utf8'));
        if (value.parentRunId === runId && UUID.test(value.runId || '') && fsSync.existsSync(path.join(folder, value.runId))) out.push(value.runId);
      } catch (_) {}
    }
    return out;
  }
  // Retire batch `runId` of `track`: {ok: true, stems, midi: [runIds]} or {ok: false, kept: true, hold, refinement}.
  // `dispose(folder)` moves a folder to the bin (or removes it); `current` is the batch in use, never retired.
  // `recycled`: dispose moves to the Recycle Bin - each follower gets a marker so its version reads as recoverable.
  async function retire(track, runId, {dispose, current = null, recycled = false}) {
    if (!UUID.test(runId || '')) return {ok: false, error: 'stems-run-invalid'};
    if (runId === current) return {ok: false, kept: true, hold: [], reason: 'current'};
    const directory = assets.directory(track);
    const {follow, hold} = await dependents(track, runId);
    const refined = await refinements(track, runId);
    if (hold.length || refined.length) return {ok: false, kept: true, hold, refinement: refined};
    const batch = path.join(directory, 'stems', runId);
    if (fsSync.existsSync(batch)) await dispose(await guarded(directory, batch));
    const midi = [];
    for (const item of follow) {
      try {
        await dispose(await guarded(directory, item.folder));
        midi.push(item.runId);
        if (recycled) await markRecycled(directory, item.stem, item.runId, runId);
      } catch (_) {}
    }
    return {ok: true, stems: runId, midi};
  }
  return {dependents, refinements, retire};
}
// Plain words for a batch that was kept back.
function keptReason(result) {
  if (!result || result.ok) return '';
  if (result.reason === 'current') return '当前使用的分轨';
  const manual = result.hold?.filter(h => h.reason === 'manual').length || 0, kept = result.hold?.filter(h => h.reason === 'kept').length || 0;
  const active = result.hold?.filter(h => h.reason === 'active').length || 0, refined = result.refinement?.length || 0;
  return [manual && `${manual} 个人工修订的 MIDI 版本`, kept && `${kept} 个标了保留的 MIDI 版本`, active && `${active} 个正在使用的 MIDI 版本`, refined && `${refined} 项细分结果`]
    .filter(Boolean).join('、') + ' 还在用它';
}
module.exports = {createStemBatches, keptReason, markRecycled, MANUAL_ENGINE};
