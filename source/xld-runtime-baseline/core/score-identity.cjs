'use strict';
// Which model made a score layer / vocal line result (audit fix 1, item 8). analysis-score/models.json says, per
// engine, its version and the SHA-256 of every weight file it loads; the runners record what they actually loaded as
//   identity: {version, weights: {<name>: <sha256 or null>}}
// A result is made by the current model when its version and every recorded weight digest match the registry.
//
// Results written before this existed have no `identity`; they are "made by an unknown version" and stay valid -
// otherwise every stored score layer (19) and vocal line (5) in the library would have to be made again. The same goes
// for a weight the runner could not hash (null): unknown, not different.
const REGISTRY = require('../analysis-score/models.json');

function expected(engine) {
  const entry = REGISTRY[engine];
  if (!entry) return null;
  return {version: entry.version, weights: Object.fromEntries(Object.entries(entry.weights || {}).map(([name, w]) => [name, w.sha256]))};
}
// 'current' | 'unknown' (no identity recorded: valid) | 'stale' (another version or other weights)
function identityState(record, engine) {
  const want = expected(engine);
  const have = record && record.identity;
  if (!want || !have || typeof have !== 'object') return 'unknown';
  if (have.version !== undefined && have.version !== want.version) return 'stale';
  for (const [name, sha] of Object.entries(have.weights || {})) {
    if (sha && want.weights[name] && sha !== want.weights[name]) return 'stale';
  }
  return 'current';
}
const isCurrent = (record, engine) => identityState(record, engine) !== 'stale';
// A result without an identity is still owed a layer the current version always writes when the earlier one lacks it:
// score layers with stem levels but no left/right difference (version 1; version 2 always writes `levels.pan`, null
// parts when there was nothing to measure, so this can never ask twice). A result without levels is left alone.
const panOwed = record => Boolean(record && record.levels && typeof record.levels === 'object' && record.levels.groups && !('pan' in record.levels));
// Good enough to be answered from disk instead of run again: made by the current model (or an unknown one) and
// carrying what this version writes. The one rule for XLD's service cache check (core/analysis-service.cjs) and
// XML's score-layer state (fusion-runtime-baseline/desktop/score-layers-state.cjs).
const isUsable = (record, engine) => isCurrent(record, engine) && !(engine === 'score-layers' && panOwed(record));
module.exports = {REGISTRY, expected, identityState, isCurrent, panOwed, isUsable};
