import type { NodeGraph } from '../schema/types.js';
import type { NodeGraphFrame, NodeSourceValues } from './node-graph.js';
export declare function nodeOutputSourceId(nodeId: string): string;
export declare function nodeOutputSourceIds(input: NodeGraph): readonly string[];
export declare function mergeNodeOutputSources(primarySources: NodeSourceValues, nodeFrame: NodeGraphFrame): NodeSourceValues;
//# sourceMappingURL=node-sources.d.ts.map