'use strict';

const assert = require('assert');
const { createService, safeName } = require('../desktop/xld-analysis-service.cjs');

assert.strictEqual(safeName('A:B/C*D?'), 'A B C D', 'cache folder names must be Windows-safe');

const service = createService({
  xldRoot: 'D:\\Program Files\\xin-local-deck-beta',
  stableXldRoot: 'D:\\Program Files\\xin-local-deck',
  analysisRoot: 'D:\\Caches\\Xin Test Analysis'
});

assert(service.constants.MSAF_ENGINE_IDS.includes('msaf-foote'), 'Foote engine must remain available');
assert(service.constants.AI_ENGINE_IDS.includes('songformer'), 'SongFormer must remain available');
assert(service.constants.HARMONY_ENGINE_IDS.includes('chord-btc'), 'BTC harmony engine must remain available');
assert.strictEqual(service.task(), null, 'service must start without a phantom task');
assert.strictEqual(service.cancel().error, 'no-active-task', 'idle cancellation must be harmless');

console.log('xld-analysis-service-contract: ok');
