import type { MappingCard, NodeGraph, NodeKind, MappingABVariant, MappingKind, MappingRange, MappingReplaceMode } from '../schema/types.js';
export interface GraphViewCoreNode {
    readonly id: string;
    readonly kind: NodeKind;
    readonly label: string;
    readonly enabled: boolean;
}
export interface GraphViewMappingNode {
    readonly id: string;
    readonly sourceId: string;
    readonly targetId: string;
    readonly kind: MappingKind;
    readonly replaceMode: MappingReplaceMode;
    readonly enabled: boolean;
    readonly activeVariant: MappingABVariant;
    readonly amount: number;
    readonly range: MappingRange;
    readonly modulationCount: number;
}
export interface GraphViewEdge {
    readonly id: string;
    readonly sourceId: string;
    readonly targetNodeId: string;
    readonly targetPort: string;
}
export interface GraphViewMappingLink {
    readonly id: string;
    readonly kind: 'main' | 'modulation';
    readonly sourceId: string;
    readonly mappingId: string;
    readonly targetId: string;
    readonly targetParameter: string;
}
export interface GraphViewModel {
    readonly sources: readonly string[];
    readonly targets: readonly string[];
    readonly coreNodes: readonly GraphViewCoreNode[];
    readonly mappingNodes: readonly GraphViewMappingNode[];
    readonly edges: readonly GraphViewEdge[];
    readonly mappingLinks: readonly GraphViewMappingLink[];
}
export declare function projectGraphView(mappings: readonly MappingCard[], nodeGraph: NodeGraph): GraphViewModel;
//# sourceMappingURL=graph-view-model.d.ts.map