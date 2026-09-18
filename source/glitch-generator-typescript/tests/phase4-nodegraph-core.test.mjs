import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

import {
  FixedStepEngineClock,
  NodeGraphRuntime,
  UndoHistory,
  addNodeGraphNode,
  connectNodeGraph,
  createNodeGraph,
  createSeededPrng,
  deserializePreset,
  findNodeGraphCycle,
  serializePreset
} from '../dist/index.js';

const addKinds = kinds => kinds.reduce(
  (graph, kind) => addNodeGraphNode(graph, { kind }),
  createNodeGraph()
);

test('Step 4.1 creates all six node kinds with stable ids', () => {
  const graph = addKinds([
    'bus',
    'math',
    'shaper',
    'logic',
    'lfo',
    'sample-hold'
  ]);

  assert.deepEqual(
    graph.nodes.map(node => [node.id, node.kind]),
    [
      ['bus-1', 'bus'],
      ['math-1', 'math'],
      ['shaper-1', 'shaper'],
      ['logic-1', 'logic'],
      ['lfo-1', 'lfo'],
      ['sample-hold-1', 'sample-hold']
    ]
  );
});

test('DAG accepts valid links and rejects a cycle without mutating live graph', () => {
  let graph = addKinds(['bus', 'math', 'shaper']);
  const first = connectNodeGraph(graph, {
    sourceId: 'bus-1',
    targetNodeId: 'math-1',
    targetPort: 'a'
  });
  assert.equal(first.accepted, true);
  graph = first.graph;
  const second = connectNodeGraph(graph, {
    sourceId: 'math-1',
    targetNodeId: 'shaper-1',
    targetPort: 'input'
  });
  assert.equal(second.accepted, true);
  graph = second.graph;
  const beforeRejected = structuredClone(graph);

  const rejected = connectNodeGraph(graph, {
    sourceId: 'shaper-1',
    targetNodeId: 'bus-1',
    targetPort: 'input'
  });
  assert.equal(rejected.accepted, false);
  assert.equal(rejected.rejection, 'CYCLE_DETECTED');
  assert.deepEqual(rejected.graph, beforeRejected);
  assert.equal(rejected.graph.edges.length, 2);
  assert.ok(rejected.cyclePath.includes('bus-1'));
  assert.ok(rejected.cyclePath.includes('math-1'));
  assert.ok(rejected.cyclePath.includes('shaper-1'));
  assert.equal(findNodeGraphCycle(rejected.graph), null);
});

test('Bus and LFO evaluate from editable graph data on unified engine time', () => {
  let graph = addNodeGraphNode(createNodeGraph(), {
    id: 'damage-energy',
    kind: 'bus',
    busMode: 'sum'
  });
  graph = addNodeGraphNode(graph, {
    id: 'motion-lfo',
    kind: 'lfo',
    lfoWaveform: 'sine',
    frequencyHz: 1,
    amplitude: 0.5,
    offset: 0.5
  });
  graph = connectNodeGraph(graph, {
    sourceId: 'audio.bass',
    targetNodeId: 'damage-energy',
    targetPort: 'input'
  }).graph;
  graph = connectNodeGraph(graph, {
    sourceId: 'audio.flux',
    targetNodeId: 'damage-energy',
    targetPort: 'input'
  }).graph;

  const runtime = new NodeGraphRuntime();
  const result = runtime.evaluate(
    graph,
    { 'audio.bass': 0.4, 'audio.flux': 0.3 },
    { frameIndex: 15, nowMs: 250, deltaMs: 1000 / 60 },
    () => 0.9
  );
  assert.ok(Math.abs(result.outputs['node:damage-energy'] - 0.7) < 1e-12);
  assert.ok(Math.abs(result.outputs['node:motion-lfo'] - 1) < 1e-12);
});

test('Sample-and-Hold latches only on a rising trigger using seeded PRNG', () => {
  let graph = addNodeGraphNode(createNodeGraph(), {
    id: 'seeded-hold',
    kind: 'sample-hold',
    sampleMode: 'random',
    threshold: 0.5
  });
  graph = connectNodeGraph(graph, {
    sourceId: 'event.bassPeak',
    targetNodeId: 'seeded-hold',
    targetPort: 'trigger'
  }).graph;
  const runtime = new NodeGraphRuntime();
  const random = createSeededPrng(4101, 7);
  const expected = createSeededPrng(4101, 7).nextFloat();

  runtime.evaluate(
    graph,
    { 'event.bassPeak': 0 },
    { frameIndex: 0, nowMs: 0, deltaMs: 0 },
    () => random.nextFloat()
  );
  const triggered = runtime.evaluate(
    graph,
    { 'event.bassPeak': 1 },
    { frameIndex: 1, nowMs: 20, deltaMs: 20 },
    () => random.nextFloat()
  );
  const held = runtime.evaluate(
    graph,
    { 'event.bassPeak': 1 },
    { frameIndex: 2, nowMs: 40, deltaMs: 20 },
    () => random.nextFloat()
  );

  assert.equal(triggered.outputs['node:seeded-hold'], expected);
  assert.equal(held.outputs['node:seeded-hold'], expected);
});

test('NodeGraph survives preset persistence and one operation is one undo item', () => {
  const before = createNodeGraph();
  const after = addNodeGraphNode(before, { kind: 'lfo' });
  const history = new UndoHistory({
    clone: createNodeGraph
  });
  history.recordDiscrete('Create NodeGraph node', before, after, 120);
  assert.equal(history.undoLabel, 'Create NodeGraph node');
  assert.deepEqual(history.undo().state, before);

  const preset = {
    name: 'NodeGraph persistence fixture',
    nodeGraph: after
  };
  const restored = deserializePreset(serializePreset(preset));
  assert.deepEqual(restored.nodeGraph, after);
});

test('Map UI keeps the red rejected-edge state after Graph View is added', () => {
  const html = readFileSync(
    new URL('../demo/index.html', import.meta.url),
    'utf8'
  );
  const css = readFileSync(
    new URL('../demo/styles.css', import.meta.url),
    'utf8'
  );
  const runtime = readFileSync(
    new URL('../src/ui-debug/phase1-demo.ts', import.meta.url),
    'utf8'
  );
  const core = readFileSync(
    new URL('../src/nodegraph/node-graph.ts', import.meta.url),
    'utf8'
  );

  for (const id of [
    'nodeGraphKind',
    'nodeGraphAddNode',
    'nodeGraphNode',
    'nodeGraphDeleteNode',
    'nodeGraphEdgeSource',
    'nodeGraphEdgeTarget',
    'nodeGraphEdgePort',
    'nodeGraphConnect',
    'nodeGraphRejectedEdge'
  ]) {
    assert.match(html, new RegExp(`id="${id}"`));
  }
  assert.match(css, /\.node-edge-preview\[data-state="rejected"\]/);
  assert.match(runtime, /CYCLE_DETECTED|result\.rejection/);
  assert.match(runtime, /runDiscrete\(\s*'Connect NodeGraph edge'/);
  assert.match(html, /Card View/);
  assert.match(html, /Graph View/);
  assert.doesNotMatch(core, /Math\.random/);
});
