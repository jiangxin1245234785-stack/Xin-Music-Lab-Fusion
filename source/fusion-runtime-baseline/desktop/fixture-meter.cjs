'use strict';
const catalog = require('./local-bars-catalog.json');
const {isDeepStrictEqual} = require('node:util');

// The score analyzer owns score-layers.json. Attach matching audition data only to the read result.
function withLocalRuns(trackId, layers) {
  const bars = layers?.bars;
  const record = catalog[trackId];
  if (!record || bars?.steady !== false || bars.checkpointSha256 !== record.checkpoint ||
      !isDeepStrictEqual(bars.barLengthsInBeats, record.histogram)) return layers;
  return {...layers, bars:{...bars, localRuns:record.runs, candidateMeasures:record.candidateMeasures}};
}
module.exports = {withLocalRuns};
