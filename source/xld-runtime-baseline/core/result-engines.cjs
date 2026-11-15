'use strict';
// The one definition of which analysis-result engines exist, and which of them are retired.
//
// These ids used to be three copy-pasted literals — app.js, core/analysis-service.cjs and desktop/main.cjs — and
// each copy silently served a different job: what can be run, what can be read, and what can be deleted. Deleting
// an id from one of them therefore did three different things depending on which one you edited, and removing it
// everywhere made existing results unreadable AND undeletable (isResultEngine would answer false).
//
// So retirement is a FLAG, never a removal. A retired engine keeps every id it ever wrote:
//   - its stored results stay readable and stay in music-lab.json,
//   - its results stay deletable (that is the whole point of retiring a bad one),
//   - it simply stops being offered for new analysis.
// Stopping the offer, uninstalling the environment and deleting past results are three separate decisions, and
// this file only expresses the first.
const AI_ENGINE_IDS = Object.freeze(['songformer']);
const HARMONY_ENGINE_IDS = Object.freeze(['chord-btc', 'chord-chordmini', 'chord-consonance']);
const SECTION_ENGINE_IDS = Object.freeze([...AI_ENGINE_IDS]);
const RESULT_ENGINE_IDS = Object.freeze([...SECTION_ENGINE_IDS, ...HARMONY_ENGINE_IDS]);
// No engine is retired at the moment; the flag stays for the next one.
const RETIRED_RESULT_ENGINES = Object.freeze({});
// 已移除的引擎 — removed from the code on 2026-11-14 at the owner's word (the four MSAF section engines, retired
// since 2026-09-19, and the three Librosa chord engines, far behind the AI chord models). Unlike a retired engine
// these are gone: nothing runs, reads or exports them, and music-lab.json no longer carries them. Their leftover
// files (`<id>.json`, `.error.json`, `.cancelled.json`) are still named here for one reason only, so the library
// sweep can list them under this name and move them to the Recycle Bin instead of leaving undeletable orphans.
// This is the one place these ids are written down.
const REMOVED_RESULT_ENGINES = Object.freeze({
  'msaf': 'section', 'msaf-sf': 'section', 'msaf-foote': 'section', 'msaf-cnmf': 'section',
  'chord-cqt': 'harmony', 'chord-cens': 'harmony', 'chord-hybrid': 'harmony'
});
const REMOVED_RESULT_ENGINE_IDS = Object.freeze(Object.keys(REMOVED_RESULT_ENGINES));
const isRemovedResultEngineId = engine => REMOVED_RESULT_ENGINE_IDS.includes(engine);
// What the sweep and deletion may name: the live engines and the removed ones' leftovers.
const isDeletableResultEngineId = engine => RESULT_ENGINE_IDS.includes(engine) || isRemovedResultEngineId(engine);
const isResultEngineId = engine => RESULT_ENGINE_IDS.includes(engine);
const retirementOf = engine => RETIRED_RESULT_ENGINES[engine] || null;
const isRetiredResultEngine = engine => Boolean(retirementOf(engine));
// What may still be started. Reading and deleting deliberately do NOT consult this.
const offeredResultEngines = () => RESULT_ENGINE_IDS.filter(engine => !isRetiredResultEngine(engine));
module.exports = {AI_ENGINE_IDS, HARMONY_ENGINE_IDS, SECTION_ENGINE_IDS, RESULT_ENGINE_IDS,
  RETIRED_RESULT_ENGINES, REMOVED_RESULT_ENGINES, REMOVED_RESULT_ENGINE_IDS, isRemovedResultEngineId, isDeletableResultEngineId,
  isResultEngineId, retirementOf, isRetiredResultEngine, offeredResultEngines};
