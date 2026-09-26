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
const MSAF_ENGINE_IDS = Object.freeze(['msaf', 'msaf-sf', 'msaf-foote', 'msaf-cnmf']);
const AI_ENGINE_IDS = Object.freeze(['songformer']);
const HARMONY_ENGINE_IDS = Object.freeze(['chord-cqt', 'chord-cens', 'chord-hybrid', 'chord-btc', 'chord-chordmini', 'chord-consonance']);
const SECTION_ENGINE_IDS = Object.freeze([...MSAF_ENGINE_IDS, ...AI_ENGINE_IDS]);
const RESULT_ENGINE_IDS = Object.freeze([...SECTION_ENGINE_IDS, ...HARMONY_ENGINE_IDS]);
const RETIRED_RESULT_ENGINES = Object.freeze({
  // No listening comparison against SongFormer was ever recorded; the owner retired these knowing that, on the
  // evidence that SongFormer is already the displayed source for 19 of the 22 tracks that have sections at all.
  // Their 79 stored results stay readable and stay deletable — that is what a flag buys over a removal.
  'msaf': {since: '2026-09-19', reason: 'SongFormer 成为唯一段落引擎；MSAF 四变体退出新建入口，既有结果照读照删'},
  'msaf-sf': {since: '2026-09-19', reason: 'SongFormer 成为唯一段落引擎；MSAF 四变体退出新建入口，既有结果照读照删'},
  'msaf-foote': {since: '2026-09-19', reason: 'SongFormer 成为唯一段落引擎；MSAF 四变体退出新建入口，既有结果照读照删'},
  'msaf-cnmf': {since: '2026-09-19', reason: 'SongFormer 成为唯一段落引擎；MSAF 四变体退出新建入口，既有结果照读照删'}
});
const isResultEngineId = engine => RESULT_ENGINE_IDS.includes(engine);
const retirementOf = engine => RETIRED_RESULT_ENGINES[engine] || null;
const isRetiredResultEngine = engine => Boolean(retirementOf(engine));
// What may still be started. Reading and deleting deliberately do NOT consult this.
const offeredResultEngines = () => RESULT_ENGINE_IDS.filter(engine => !isRetiredResultEngine(engine));
module.exports = {MSAF_ENGINE_IDS, AI_ENGINE_IDS, HARMONY_ENGINE_IDS, SECTION_ENGINE_IDS, RESULT_ENGINE_IDS,
  RETIRED_RESULT_ENGINES, isResultEngineId, retirementOf, isRetiredResultEngine, offeredResultEngines};
