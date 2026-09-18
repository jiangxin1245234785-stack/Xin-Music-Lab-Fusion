import assert from 'node:assert/strict';
import test from 'node:test';

import {
  createNextMapping,
  deleteMapping,
  duplicateMapping,
  filterMappingsForRuntime,
  toggleMappingBypass
} from '../dist/index.js';

const mappings = [
  {
    id: 'a',
    sourceId: 'audio.bass',
    targetId: 'feedback.zoom',
    range: [0.9, 1.2],
    curve: 1.4,
    enabled: true
  },
  {
    id: 'b',
    sourceId: 'audio.mid',
    targetId: 'rgbSplit.distance',
    amount: 0.8,
    enabled: true
  }
];

test('Solo isolates exactly one mapping without mutating source cards', () => {
  const isolated = filterMappingsForRuntime(mappings, {
    rackEnabled: true,
    soloMappingId: 'b'
  });

  assert.equal(isolated[0].enabled, false);
  assert.equal(isolated[1].enabled, true);
  assert.equal(mappings[0].enabled, true);
  assert.equal(mappings[1].enabled, true);
});

test('Bypass preserves every setting and toggles only enabled', () => {
  const bypassed = toggleMappingBypass(mappings, 'a');
  assert.equal(bypassed[0].enabled, false);
  assert.equal(bypassed[0].sourceId, mappings[0].sourceId);
  assert.equal(bypassed[0].targetId, mappings[0].targetId);
  assert.deepEqual(bypassed[0].range, mappings[0].range);
  assert.equal(bypassed[0].curve, mappings[0].curve);

  const restored = toggleMappingBypass(bypassed, 'a');
  assert.equal(restored[0].enabled, true);
});

test('Duplicate and Delete use stable ids and preserve deterministic order', () => {
  const first = duplicateMapping(mappings, 'a');
  assert.equal(first.duplicateId, 'a-copy');
  assert.equal(first.mappings.length, 3);
  assert.equal(first.mappings[2].sourceId, 'audio.bass');

  const second = duplicateMapping(first.mappings, 'a');
  assert.equal(second.duplicateId, 'a-copy-2');

  const deleted = deleteMapping(second.mappings, 'a-copy');
  assert.deepEqual(deleted.map(mapping => mapping.id), ['a', 'b', 'a-copy-2']);
});

test('Add creates a stable unused mapping id', () => {
  const created = createNextMapping(mappings, {
    sourceId: 'audio.treble',
    targetId: 'scanlineGrain.grainDensity'
  });
  assert.equal(created.id, 'mapping-3');
  assert.equal(created.sourceId, 'audio.treble');
});
