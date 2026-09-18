import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

import {
  addNodeGraphNode,
  createMappingCard,
  createNodeGraph,
  deleteMapping,
  projectGraphView,
  serializePreset,
  toggleMappingBypass,
  updateMappingABParameters
} from '../dist/index.js';

const fixtureMappings = () => [
  createMappingCard({
    id: 'bass-damage',
    sourceId: 'audio.bass',
    targetId: 'blockDamage.displacementX',
    amount: 0.6,
    range: [0.1, 0.9]
  }),
  createMappingCard({
    id: 'flux-split',
    sourceId: 'audio.flux',
    targetId: 'rgbSplit.distance',
    amount: 0.35,
    range: [0, 0.7]
  })
];

test('Graph View is a deterministic projection without duplicate state', () => {
  const mappings = fixtureMappings();
  const graph = addNodeGraphNode(createNodeGraph(), {
    id: 'slow-motion',
    kind: 'lfo'
  });
  const first = projectGraphView(mappings, graph);
  const second = projectGraphView(mappings, graph);

  assert.deepEqual(second, first);
  assert.equal(first.mappingNodes.length, mappings.length);
  assert.equal(first.coreNodes.length, graph.nodes.length);
  assert.deepEqual(first.sources, ['audio.bass', 'audio.flux']);
  assert.deepEqual(
    first.mappingNodes.map(mapping => mapping.id),
    ['bass-damage', 'flux-split']
  );
  assert.deepEqual(mappings, fixtureMappings());
});

test('Card edits are reflected by the next Graph View projection', () => {
  const mappings = fixtureMappings();
  mappings[0] = updateMappingABParameters(mappings[0], {
    amount: 0.82,
    range: [0.2, 0.95]
  });
  const projection = projectGraphView(mappings, createNodeGraph());
  const node = projection.mappingNodes.find(
    mapping => mapping.id === 'bass-damage'
  );

  assert.equal(node?.amount, 0.82);
  assert.deepEqual(node?.range, [0.2, 0.95]);
});

test('Graph actions update the same MappingCard collection used by Card View', () => {
  let mappings = fixtureMappings();
  mappings = [...toggleMappingBypass(mappings, 'flux-split')];
  let card = createMappingCard(
    mappings.find(mapping => mapping.id === 'flux-split')
  );
  assert.equal(card.enabled, false);
  assert.equal(
    projectGraphView(mappings, createNodeGraph())
      .mappingNodes.find(mapping => mapping.id === 'flux-split')?.enabled,
    false
  );

  mappings = [...deleteMapping(mappings, 'bass-damage')];
  card = createMappingCard(mappings[0]);
  assert.equal(card.id, 'flux-split');
  assert.deepEqual(
    projectGraphView(mappings, createNodeGraph())
      .mappingNodes.map(mapping => mapping.id),
    ['flux-split']
  );
});

test('Projecting and switching views does not alter persisted preset data', () => {
  const mappings = fixtureMappings();
  const nodeGraph = addNodeGraphNode(createNodeGraph(), {
    id: 'shape-control',
    kind: 'shaper'
  });
  const preset = {
    id: 'view-switch-fixture',
    name: 'View switch fixture',
    mappings,
    nodeGraph
  };
  const before = serializePreset(preset);

  projectGraphView(mappings, nodeGraph);
  projectGraphView(mappings, nodeGraph);

  assert.equal(serializePreset(preset), before);
});

test('Map page exposes Card and Graph views on the same runtime state', () => {
  const html = readFileSync(
    new URL('../demo/index.html', import.meta.url),
    'utf8'
  );
  const runtime = readFileSync(
    new URL('../src/ui-debug/phase1-demo.ts', import.meta.url),
    'utf8'
  );

  for (const id of [
    'mapCardViewButton',
    'mapGraphViewButton',
    'mapCardView',
    'mapGraphView',
    'graphViewSources',
    'graphViewCoreNodes',
    'graphViewMappings',
    'graphViewTargets'
  ]) {
    assert.match(html, new RegExp(`id="${id}"`));
  }
  assert.match(runtime, /projectGraphView\(mappings,\s*nodeGraph\)/);
  assert.match(
    runtime,
    /toggleMappingBypass\(mappings,\s*mapping\.id\)/
  );
  assert.match(runtime, /deleteMapping\(mappings,\s*mapping\.id\)/);
  assert.match(runtime, /setMapView\('card'\)/);
  assert.match(runtime, /setMapView\('graph'\)/);
  assert.doesNotMatch(runtime, /\bgraphMappings\s*=/);
});

test('Step 4.2 projection stays single-source after Step 4.3 node sources', () => {
  const html = readFileSync(
    new URL('../demo/index.html', import.meta.url),
    'utf8'
  );
  const runtime = readFileSync(
    new URL('../src/ui-debug/phase1-demo.ts', import.meta.url),
    'utf8'
  );

  assert.match(html, /LIVE NODE PROBES/);
  assert.match(runtime, /mergeNodeOutputSources/);
  assert.doesNotMatch(runtime, /\bgraphMappings\s*=/);
  assert.doesNotMatch(runtime, /\bsecondOrderModulation\b/i);
});
