import { createNodeGraph } from '../schema/defaults.js';
import type { NodeGraph } from '../schema/types.js';
import type {
  NodeGraphFrame,
  NodeSourceValues
} from './node-graph.js';

export function nodeOutputSourceId(nodeId: string): string {
  return `node:${nodeId}`;
}

export function nodeOutputSourceIds(
  input: NodeGraph
): readonly string[] {
  const graph = createNodeGraph(input);
  return Object.freeze(
    graph.nodes
      .map(node => nodeOutputSourceId(node.id))
      .sort((left, right) => left.localeCompare(right))
  );
}

export function mergeNodeOutputSources(
  primarySources: NodeSourceValues,
  nodeFrame: NodeGraphFrame
): NodeSourceValues {
  return Object.freeze({
    ...primarySources,
    ...nodeFrame.outputs
  });
}
