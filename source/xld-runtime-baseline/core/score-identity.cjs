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
module.exports = {REGISTRY, expected, identityState, isCurrent};
