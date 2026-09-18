import { createNodeGraph, createNodeGraphEdge, createNodeGraphNode } from '../schema/defaults.js';
const finiteOr = (value, fallback = 0) => typeof value === 'number' && Number.isFinite(value) ? value : fallback;
const clamp = (value, minimum, maximum) => Math.max(Math.min(minimum, maximum), Math.min(Math.max(minimum, maximum), finiteOr(value)));
function sourceNodeId(sourceId, nodeIds) {
    if (nodeIds.has(sourceId))
        return sourceId;
    if (sourceId.startsWith('node:')) {
        const id = sourceId.slice('node:'.length);
        if (nodeIds.has(id))
            return id;
    }
    return null;
}
function stableEdgeId(graph, edge) {
    const base = edge.id.trim() || [
        'edge',
        edge.sourceId,
        edge.targetNodeId,
        edge.targetPort
    ].join(':');
    if (!graph.edges.some(candidate => candidate.id === base))
        return base;
    let suffix = 2;
    while (graph.edges.some(candidate => candidate.id === `${base}-${suffix}`)) {
        suffix += 1;
    }
    return `${base}-${suffix}`;
}
function nodeDependencies(graph) {
    const nodeIds = new Set(graph.nodes.map(node => node.id));
    const dependencies = new Map(graph.nodes.map(node => [node.id, []]));
    for (const edge of graph.edges) {
        const source = sourceNodeId(edge.sourceId, nodeIds);
        if (!source || !nodeIds.has(edge.targetNodeId))
            continue;
        dependencies.get(edge.targetNodeId)?.push(source);
    }
    for (const values of dependencies.values())
        values.sort();
    return dependencies;
}
export function findNodeGraphCycle(input) {
    const graph = createNodeGraph(input);
    const dependencies = nodeDependencies(graph);
    const state = new Map();
    const stack = [];
    const visit = (id) => {
        const current = state.get(id) ?? 0;
        if (current === 2)
            return null;
        if (current === 1) {
            const start = stack.indexOf(id);
            return [...stack.slice(Math.max(0, start)), id];
        }
        state.set(id, 1);
        stack.push(id);
        for (const dependency of dependencies.get(id) ?? []) {
            const cycle = visit(dependency);
            if (cycle)
                return cycle;
        }
        stack.pop();
        state.set(id, 2);
        return null;
    };
    for (const id of [...dependencies.keys()].sort()) {
        const cycle = visit(id);
        if (cycle)
            return cycle;
    }
    return null;
}
export function topologicalNodeOrder(input) {
    const graph = createNodeGraph(input);
    const dependencies = nodeDependencies(graph);
    const cycle = findNodeGraphCycle(graph);
    if (cycle) {
        throw new Error(`NodeGraph cycle detected: ${cycle.join(' -> ')}`);
    }
    const remaining = new Map([...dependencies].map(([id, values]) => [id, new Set(values)]));
    const order = [];
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
            for (const values of remaining.values())
                values.delete(id);
        }
    }
    return order;
}
export function nextNodeGraphNodeId(input, kind) {
    const graph = createNodeGraph(input);
    const ids = new Set(graph.nodes.map(node => node.id));
    let suffix = 1;
    while (ids.has(`${kind}-${suffix}`))
        suffix += 1;
    return `${kind}-${suffix}`;
}
export function addNodeGraphNode(input, nodeInput) {
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
export function removeNodeGraphNode(input, nodeId) {
    const graph = createNodeGraph(input);
    return createNodeGraph({
        nodes: graph.nodes.filter(node => node.id !== nodeId),
        edges: graph.edges.filter(edge => edge.targetNodeId !== nodeId &&
            edge.sourceId !== nodeId &&
            edge.sourceId !== `node:${nodeId}`)
    });
}
export function connectNodeGraph(input, edgeInput) {
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
    if (graph.edges.some(candidate => candidate.sourceId === edge.sourceId &&
        candidate.targetNodeId === edge.targetNodeId &&
        candidate.targetPort === edge.targetPort)) {
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
export function disconnectNodeGraphEdge(input, edgeId) {
    const graph = createNodeGraph(input);
    return createNodeGraph({
        nodes: graph.nodes,
        edges: graph.edges.filter(edge => edge.id !== edgeId)
    });
}
function lfoWave(node, nowMs) {
    const cycle = finiteOr(nowMs) / 1000 * Math.max(0, node.frequencyHz) +
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
function evaluateNode(node, inputs, clock, randomFloat, sampleHoldState) {
    const all = [...inputs.values()].flat();
    const input = inputs.get('input')?.[0] ?? all[0] ?? node.value;
    const a = inputs.get('a')?.[0] ?? all[0] ?? node.value;
    const b = inputs.get('b')?.[0] ?? all[1] ?? node.value;
    if (!node.enabled)
        return finiteOr(node.value);
    switch (node.kind) {
        case 'bus': {
            const values = all.length > 0 ? all : [node.value];
            if (node.busMode === 'average') {
                return values.reduce((sum, value) => sum + value, 0) / values.length;
            }
            if (node.busMode === 'max')
                return Math.max(...values);
            if (node.busMode === 'min')
                return Math.min(...values);
            return values.reduce((sum, value) => sum + value, 0);
        }
        case 'math':
            if (node.mathOperation === 'subtract')
                return a - b;
            if (node.mathOperation === 'multiply')
                return a * b;
            if (node.mathOperation === 'divide') {
                return Math.abs(b) < 1e-12 ? 0 : a / b;
            }
            return a + b;
        case 'shaper':
            if (node.shaperMode === 'power') {
                return Math.sign(input) * Math.pow(Math.abs(input), Math.max(0.000001, node.curve));
            }
            if (node.shaperMode === 'smoothstep') {
                const normalized = clamp((input - node.minimum) /
                    Math.max(1e-12, node.maximum - node.minimum), 0, 1);
                return normalized * normalized * (3 - 2 * normalized);
            }
            return clamp(input, node.minimum, node.maximum);
        case 'logic':
            if (node.logicOperation === 'less')
                return a < b ? 1 : 0;
            if (node.logicOperation === 'and')
                return a > 0 && b > 0 ? 1 : 0;
            if (node.logicOperation === 'or')
                return a > 0 || b > 0 ? 1 : 0;
            if (node.logicOperation === 'not')
                return a > 0 ? 0 : 1;
            return a > (inputs.get('b')?.[0] ?? node.threshold) ? 1 : 0;
        case 'lfo':
            return node.offset + node.amplitude * lfoWave(node, clock.nowMs);
        case 'sample-hold': {
            const trigger = inputs.get('trigger')?.[0] ?? all[0] ?? 0;
            const rising = trigger >= node.threshold &&
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
    sampleHoldStates = new Map();
    reset() {
        this.sampleHoldStates.clear();
    }
    evaluate(input, sourceValues, clock, randomFloat = () => 0) {
        const graph = createNodeGraph(input);
        const order = topologicalNodeOrder(graph);
        const nodes = new Map(graph.nodes.map(node => [node.id, node]));
        const outputs = {};
        const nodeIds = new Set(nodes.keys());
        for (const id of this.sampleHoldStates.keys()) {
            if (!nodeIds.has(id))
                this.sampleHoldStates.delete(id);
        }
        for (const id of order) {
            const node = nodes.get(id);
            if (!node)
                continue;
            const inputs = new Map();
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
            outputs[`node:${id}`] = finiteOr(evaluateNode(node, inputs, clock, randomFloat, state));
        }
        return Object.freeze({
            outputs: Object.freeze(outputs),
            evaluationOrder: Object.freeze([...order])
        });
    }
}
//# sourceMappingURL=node-graph.js.map