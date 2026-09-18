import { createNodeGraph } from '../schema/defaults.js';
export function nodeOutputSourceId(nodeId) {
    return `node:${nodeId}`;
}
export function nodeOutputSourceIds(input) {
    const graph = createNodeGraph(input);
    return Object.freeze(graph.nodes
        .map(node => nodeOutputSourceId(node.id))
        .sort((left, right) => left.localeCompare(right)));
}
export function mergeNodeOutputSources(primarySources, nodeFrame) {
    return Object.freeze({
        ...primarySources,
        ...nodeFrame.outputs
    });
}
//# sourceMappingURL=node-sources.js.map