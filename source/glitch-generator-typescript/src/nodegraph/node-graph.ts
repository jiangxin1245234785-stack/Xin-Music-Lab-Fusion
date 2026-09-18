import type { EngineClockFrame } from '../clock/engine-clock.js';
import {
  createNodeGraph,
  createNodeGraphEdge,
  createNodeGraphNode
} from '../schema/defaults.js';
import type {
  NodeGraph,
  NodeGraphEdge,
  NodeGraphNode,
  NodeKind,
  ResolvedNodeGraph,
  ResolvedNodeGraphEdge,
  ResolvedNodeGraphNode
} from '../schema/types.js';

export type NodeSourceValues = Readonly<Record<string, number>>;
export type NodeRandomSource = () => number;

export type NodeConnectionRejection =
  | 'INVALID_SOURCE'
  | 'INVALID_TARGET'
  | 'DUPLICATE_EDGE'
  | 'CYCLE_DETECTED';

export interface NodeConnectionResult {
  readonly accepted: boolean;
  readonly graph: ResolvedNodeGraph;
  readonly edge: ResolvedNodeGraphEdge;
  readonly rejection?: NodeConnectionRejection;
  readonly cyclePath?: readonly string[];
}

export interface NodeGraphFrame {
  readonly outputs: Readonly<Record<string, number>>;
  readonly evaluationOrder: readonly string[];
}

interface SampleHoldState {
  lastTrigger: number;
  held: number;
}

const finiteOr = (value: unknown, fallback = 0): number =>
  typeof value === 'number' && Number.isFinite(value) ? value : fallback;

const clamp = (value: number, minimum: number, maximum: number): number =>
  Math.max(
    Math.min(minimum, maximum),
    Math.min(Math.max(minimum, maximum), finiteOr(value))
  );

function sourceNodeId(
  sourceId: string,
  nodeIds: ReadonlySet<string>
): string | null {
  if (nodeIds.has(sourceId)) return sourceId;
  if (sourceId.startsWith('node:')) {
    const id = sourceId.slice('node:'.length);
    if (nodeIds.has(id)) return id;
  }
  return null;
}

function stableEdgeId(
  graph: ResolvedNodeGraph,
  edge: ResolvedNodeGraphEdge
): string {
  const base = edge.id.trim() || [
    'edge',
    edge.sourceId,
    edge.targetNodeId,
    edge.targetPort
  ].join(':');
  if (!graph.edges.some(candidate => candidate.id === base)) return base;
  let suffix = 2;
  while (graph.edges.some(candidate => candidate.id === `${base}-${suffix}`)) {
    suffix += 1;
  }
  return `${base}-${suffix}`;
}

function nodeDependencies(
  graph: ResolvedNodeGraph
): ReadonlyMap<string, readonly string[]> {
  const nodeIds = new Set(graph.nodes.map(node => node.id));
  const dependencies = new Map<string, string[]>(
    graph.nodes.map(node => [node.id, []])
  );
  for (const edge of graph.edges) {
    const source = sourceNodeId(edge.sourceId, nodeIds);
    if (!source || !nodeIds.has(edge.targetNodeId)) continue;
    dependencies.get(edge.targetNodeId)?.push(source);
  }
  for (const values of dependencies.values()) values.sort();
  return dependencies;
}

export function findNodeGraphCycle(
  input: NodeGraph
): readonly string[] | null {
  const graph = createNodeGraph(input);
  const dependencies = nodeDependencies(graph);
  const state = new Map<string, 0 | 1 | 2>();
  const stack: string[] = [];

  const visit = (id: string): readonly string[] | null => {
    const current = state.get(id) ?? 0;
    if (current === 2) return null;
    if (current === 1) {
      const start = stack.indexOf(id);
      return [...stack.slice(Math.max(0, start)), id];
    }
    state.set(id, 1);
    stack.push(id);
    for (const dependency of dependencies.get(id) ?? []) {
      const cycle = visit(dependency);
      if (cycle) return cycle;
    }
    stack.pop();
    state.set(id, 2);
    return null;
  };

  for (const id of [...dependencies.keys()].sort()) {
    const cycle = visit(id);
    if (cycle) return cycle;
  }
  return null;
}

export function topologicalNodeOrder(input: NodeGraph): readonly string[] {
  const graph = createNodeGraph(input);
  const dependencies = nodeDependencies(graph);
  const cycle = findNodeGraphCycle(graph);
  if (cycle) {
    throw new Error(`NodeGraph cycle detected: ${cycle.join(' -> ')}`);
  }
  const remaining = new Map(
    [...dependencies].map(([id, values]) => [id, new Set(values)])
  );
  const order: string[] = [];
  while (remaining.size > 0) {
    const ready = [...remaining]
      .filter(([, values]) => values.size === 0)
      .map(([id]) => id)
      .sort();
    if (ready.length === 0) {
      throw new Error('NodeGraph contains an unresolved dependency cycle.');
    }
    for (const id of ready) {
      order.push(id);
      remaining.delete(id);
      for (const values of remaining.values()) values.delete(id);
    }
  }
  return order;
}

export function nextNodeGraphNodeId(
  input: NodeGraph,
  kind: NodeKind
): string {
  const graph = createNodeGraph(input);
  const ids = new Set(graph.nodes.map(node => node.id));
  let suffix = 1;
  while (ids.has(`${kind}-${suffix}`)) suffix += 1;
  return `${kind}-${suffix}`;
}

export function addNodeGraphNode(
  input: NodeGraph,
  nodeInput: NodeGraphNode
): ResolvedNodeGraph {
  const graph = createNodeGraph(input);
  const kind = createNodeGraphNode(nodeInput).kind;
  const node = createNodeGraphNode({
    ...nodeInput,
    id: nodeInput.id?.trim() || nextNodeGraphNodeId(graph, kind)
  });
  if (graph.nodes.some(candidate => candidate.id === node.id)) {
    throw new Error(`Duplicate NodeGraph node id: ${node.id}`);
  }
  return createNodeGraph({
    nodes: [...graph.nodes, node],
    edges: graph.edges
  });
}

export function removeNodeGraphNode(
  input: NodeGraph,
  nodeId: string
): ResolvedNodeGraph {
  const graph = createNodeGraph(input);
  return createNodeGraph({
    nodes: graph.nodes.filter(node => node.id !== nodeId),
    edges: graph.edges.filter(edge =>
      edge.targetNodeId !== nodeId &&
      edge.sourceId !== nodeId &&
      edge.sourceId !== `node:${nodeId}`
    )
  });
}

export function connectNodeGraph(
  input: NodeGraph,
  edgeInput: NodeGraphEdge
): NodeConnectionResult {
  const graph = createNodeGraph(input);
  const initialEdge = createNodeGraphEdge(edgeInput);
  const edge = createNodeGraphEdge({
    ...initialEdge,
    id: stableEdgeId(graph, initialEdge)
  });
  const nodeIds = new Set(graph.nodes.map(node => node.id));
  if (!edge.sourceId.trim()) {
    return {
      accepted: false,
      graph,
      edge,
      rejection: 'INVALID_SOURCE'
    };
  }
  if (!nodeIds.has(edge.targetNodeId)) {
    return {
      accepted: false,
      graph,
      edge,
      rejection: 'INVALID_TARGET'
    };
  }
  if (graph.edges.some(candidate =>
    candidate.sourceId === edge.sourceId &&
    candidate.targetNodeId === edge.targetNodeId &&
    candidate.targetPort === edge.targetPort
  )) {
    return {
      accepted: false,
      graph,
      edge,
      rejection: 'DUPLICATE_EDGE'
    };
  }
  const candidate = createNodeGraph({
    nodes: graph.nodes,
    edges: [...graph.edges, edge]
  });
  const cycle = findNodeGraphCycle(candidate);
  if (cycle) {
    return {
      accepted: false,
      graph,
      edge,
      rejection: 'CYCLE_DETECTED',
      cyclePath: cycle
    };
  }
  return {
    accepted: true,
    graph: candidate,
    edge
  };
}

export function disconnectNodeGraphEdge(
  input: NodeGraph,
  edgeId: string
): ResolvedNodeGraph {
  const graph = createNodeGraph(input);
  return createNodeGraph({
    nodes: graph.nodes,
    edges: graph.edges.filter(edge => edge.id !== edgeId)
  });
}

function lfoWave(node: ResolvedNodeGraphNode, nowMs: number): number {
  const cycle =
    finiteOr(nowMs) / 1000 * Math.max(0, node.frequencyHz) +
    node.phaseOffset;
  const phase = ((cycle % 1) + 1) % 1;
  switch (node.lfoWaveform) {
    case 'triangle':
      return 1 - 4 * Math.abs(phase - 0.5);
    case 'square':
      return phase < 0.5 ? 1 : -1;
    case 'saw':
      return phase * 2 - 1;
    case 'sine':
    default:
      return Math.sin(phase * Math.PI * 2);
  }
}

function evaluateNode(
  node: ResolvedNodeGraphNode,
  inputs: ReadonlyMap<string, readonly number[]>,
  clock: EngineClockFrame,
  randomFloat: NodeRandomSource,
  sampleHoldState: SampleHoldState
): number {
  const all = [...inputs.values()].flat();
  const input = inputs.get('input')?.[0] ?? all[0] ?? node.value;
  const a = inputs.get('a')?.[0] ?? all[0] ?? node.value;
  const b = inputs.get('b')?.[0] ?? all[1] ?? node.value;
  if (!node.enabled) return finiteOr(node.value);

  switch (node.kind) {
    case 'bus': {
      const values = all.length > 0 ? all : [node.value];
      if (node.busMode === 'average') {
        return values.reduce((sum, value) => sum + value, 0) / values.length;
      }
      if (node.busMode === 'max') return Math.max(...values);
      if (node.busMode === 'min') return Math.min(...values);
      return values.reduce((sum, value) => sum + value, 0);
    }
    case 'math':
      if (node.mathOperation === 'subtract') return a - b;
      if (node.mathOperation === 'multiply') return a * b;
      if (node.mathOperation === 'divide') {
        return Math.abs(b) < 1e-12 ? 0 : a / b;
      }
      return a + b;
    case 'shaper':
      if (node.shaperMode === 'power') {
        return Math.sign(input) * Math.pow(
          Math.abs(input),
          Math.max(0.000001, node.curve)
        );
      }
      if (node.shaperMode === 'smoothstep') {
        const normalized = clamp(
          (input - node.minimum) /
          Math.max(1e-12, node.maximum - node.minimum),
          0,
          1
        );
        return normalized * normalized * (3 - 2 * normalized);
      }
      return clamp(input, node.minimum, node.maximum);
    case 'logic':
      if (node.logicOperation === 'less') return a < b ? 1 : 0;
      if (node.logicOperation === 'and') return a > 0 && b > 0 ? 1 : 0;
      if (node.logicOperation === 'or') return a > 0 || b > 0 ? 1 : 0;
      if (node.logicOperation === 'not') return a > 0 ? 0 : 1;
      return a > (inputs.get('b')?.[0] ?? node.threshold) ? 1 : 0;
    case 'lfo':
      return node.offset + node.amplitude * lfoWave(node, clock.nowMs);
    case 'sample-hold': {
      const trigger = inputs.get('trigger')?.[0] ?? all[0] ?? 0;
      const rising =
        trigger >= node.threshold &&
        sampleHoldState.lastTrigger < node.threshold;
      if (rising) {
        sampleHoldState.held = node.sampleMode === 'input'
          ? finiteOr(input)
          : clamp(finiteOr(randomFloat()), 0, 1);
      }
      sampleHoldState.lastTrigger = trigger;
      return sampleHoldState.held;
    }
    default:
      return finiteOr(node.value);
  }
}

export class NodeGraphRuntime {
  private readonly sampleHoldStates = new Map<string, SampleHoldState>();

  reset(): void {
    this.sampleHoldStates.clear();
  }

  evaluate(
    input: NodeGraph,
    sourceValues: NodeSourceValues,
    clock: EngineClockFrame,
    randomFloat: NodeRandomSource = () => 0
  ): NodeGraphFrame {
    const graph = createNodeGraph(input);
    const order = topologicalNodeOrder(graph);
    const nodes = new Map(graph.nodes.map(node => [node.id, node]));
    const outputs: Record<string, number> = {};
    const nodeIds = new Set(nodes.keys());

    for (const id of this.sampleHoldStates.keys()) {
      if (!nodeIds.has(id)) this.sampleHoldStates.delete(id);
    }
    for (const id of order) {
      const node = nodes.get(id);
      if (!node) continue;
      const inputs = new Map<string, number[]>();
      const incoming = graph.edges
        .filter(edge => edge.targetNodeId === id)
        .sort((left, right) => left.id.localeCompare(right.id));
      for (const edge of incoming) {
        const sourceNode = sourceNodeId(edge.sourceId, nodeIds);
        const value = sourceNode
          ? outputs[`node:${sourceNode}`] ?? 0
          : finiteOr(sourceValues[edge.sourceId]);
        const values = inputs.get(edge.targetPort) ?? [];
        values.push(value);
        inputs.set(edge.targetPort, values);
      }
      const state = this.sampleHoldStates.get(id) ?? {
        lastTrigger: 0,
        held: node.value
      };
      this.sampleHoldStates.set(id, state);
      outputs[`node:${id}`] = finiteOr(evaluateNode(
        node,
        inputs,
        clock,
        randomFloat,
        state
      ));
    }
    return Object.freeze({
      outputs: Object.freeze(outputs),
      evaluationOrder: Object.freeze([...order])
    });
  }
}

