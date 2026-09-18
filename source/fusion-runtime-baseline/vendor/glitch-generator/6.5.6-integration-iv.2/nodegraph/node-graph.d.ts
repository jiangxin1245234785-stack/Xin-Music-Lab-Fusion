import type { EngineClockFrame } from '../clock/engine-clock.js';
import type { NodeGraph, NodeGraphEdge, NodeGraphNode, NodeKind, ResolvedNodeGraph, ResolvedNodeGraphEdge } from '../schema/types.js';
export type NodeSourceValues = Readonly<Record<string, number>>;
export type NodeRandomSource = () => number;
export type NodeConnectionRejection = 'INVALID_SOURCE' | 'INVALID_TARGET' | 'DUPLICATE_EDGE' | 'CYCLE_DETECTED';
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
export declare function findNodeGraphCycle(input: NodeGraph): readonly string[] | null;
export declare function topologicalNodeOrder(input: NodeGraph): readonly string[];
export declare function nextNodeGraphNodeId(input: NodeGraph, kind: NodeKind): string;
export declare function addNodeGraphNode(input: NodeGraph, nodeInput: NodeGraphNode): ResolvedNodeGraph;
export declare function removeNodeGraphNode(input: NodeGraph, nodeId: string): ResolvedNodeGraph;
export declare function connectNodeGraph(input: NodeGraph, edgeInput: NodeGraphEdge): NodeConnectionResult;
export declare function disconnectNodeGraphEdge(input: NodeGraph, edgeId: string): ResolvedNodeGraph;
export declare class NodeGraphRuntime {
    private readonly sampleHoldStates;
    reset(): void;
    evaluate(input: NodeGraph, sourceValues: NodeSourceValues, clock: EngineClockFrame, randomFloat?: NodeRandomSource): NodeGraphFrame;
}
//# sourceMappingURL=node-graph.d.ts.map