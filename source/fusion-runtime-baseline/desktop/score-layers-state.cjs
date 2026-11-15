'use strict';
// Whether a track's score layers (score-layers.json: bar lines, loudness, stem levels) are there and
// current, and the names of the engines its notes come from. Read-only; XML never writes analysis.
//
// "Current" is XLD's own rule (core/analysis-service.cjs, the score engines' cache check): the result
// was made from the stems that are active now, i.e. its source.stemRunId equals the stem run's runId.
// XLD skips the work when that holds, so asking it to run a current track costs nothing either.

// XLD's model registry: the names XLD shows for each engine (read, never changed).
const MODELS = require('../../xld-runtime-baseline/analysis-midi/models.json');
const MANUAL_ENGINE = 'manual-revision';
const VOCALS_ENGINE = 'score-vocals';
// Words XLD uses for the two that are not in the registry (XLD i18n/runtime-messages.js:
// runtime.assets.runStatus.manual and runtime.timeline.vocalsEngine).
const OWN_NAMES = Object.freeze({
  [MANUAL_ENGINE]: {zh: '人工修订', en: 'Manual revision'},
  [VOCALS_ENGINE]: {zh: '人声曲线', en: 'vocal line'}
});

// What XLD's readStems(track) answered, in three words: 'ready' (stems are there), 'missing' (XLD has
// not separated this song: its own 'stems-missing') or 'unreadable' (anything else: a damaged or
// unreadable stems.json, a read that threw). `stems` is that answer, or null when the read threw.
function stemsStatus(stems) {
  if (stems && stems.ok) return 'ready';
  if (stems && stems.error === 'stems-missing') return 'missing';
  return 'unreadable';
}

// 'missing' | 'stale' | 'current'. `layers` is the body of score-layers.json (or null), `stems` what the
// analysis service's readStems(track) answered.
function layersState(layers, stems) {
  if (!layers || layers.kind !== 'score-layers') return 'missing';
  const made = layers.source && layers.source.stemRunId !== undefined ? layers.source.stemRunId : null;
  const now = stems && stems.ok ? (stems.runId ?? null) : null;
  // Also made by the current model (XLD core/score-identity.cjs); a result without a recorded identity stays valid.
  if (made === now && !require('../../xld-runtime-baseline/core/score-identity.cjs').isCurrent(layers, 'score-layers')) return 'stale';
  return made === now ? 'current' : 'stale';
}

// What a track still needs before the score can have its layers, in the order a host acts on it:
// 'no-stems' (analyse it in XLD first), 'stems-unreadable' (its stems could not be read: say so, run
// nothing), 'layers' (run score-layers), or null (nothing).
function owed(state, status) {
  if (status === 'missing' || status === false) return 'no-stems';
  if (status === 'unreadable') return 'stems-unreadable';
  return state === 'current' ? null : 'layers';
}

function engineName(engine, lang) {
  const id = String(engine || '');
  if (!id) return null;
  const language = String(lang || '').toLowerCase().startsWith('en') ? 'en' : 'zh';
  if (OWN_NAMES[id]) return OWN_NAMES[id][language];
  const model = MODELS.find(item => item.id === id);
  return model && model.name ? model.name : id;
}

module.exports = {stemsStatus, layersState, owed, engineName, MANUAL_ENGINE, VOCALS_ENGINE};
