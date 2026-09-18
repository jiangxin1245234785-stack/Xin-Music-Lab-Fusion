import {
  createMappingCard,
  createNodeGraph
} from '../schema/defaults.js';
import type {
  MappingCard,
  NodeGraph,
  NodeKind,
  MappingABVariant,
  MappingKind,
  MappingRange,
  MappingReplaceMode
} from '../schema/types.js';

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

export function projectGraphView(
  mappings: readonly MappingCard[],
  nodeGraph: NodeGraph
): GraphViewModel {
  const graph = createNodeGraph(nodeGraph);
  const mappingNodes = mappings.map((mapping, index) => {
    const resolved = createMappingCard(mapping);
    return Object.freeze({
      id: resolved.id || `mapping-${String(index + 1).padStart(3, '0')}`,
      sourceId: resolved.sourceId,
      targetId: resolved.targetId,
      kind: resolved.kind,
      replaceMode: resolved.replaceMode,
      enabled: resolved.enabled,
      activeVariant: resolved.ab.active,
      amount: resolved.amount,
      range: Object.freeze(
        [resolved.range[0], resolved.range[1]] as [number, number]
      ),
      modulationCount: resolved.modulations.length
    });
  });
  const mappingLinks: GraphViewMappingLink[] = mappingNodes.flatMap(
    (mapping, index) => {
      const resolved = createMappingCard(mappings[index]);
      return [
        {
          id: `${mapping.id}:main`,
          kind: 'main',
          sourceId: mapping.sourceId,
          mappingId: mapping.id,
          targetId: mapping.targetId,
          targetParameter: 'signal'
        },
        ...resolved.modulations.map(modulation => ({
          id: `${mapping.id}:${modulation.id}`,
          kind: 'modulation' as const,
          sourceId: modulation.sourceId,
          mappingId: mapping.id,
          targetId: mapping.targetId,
          targetParameter: modulation.targetParameter
        }))
      ];
    }
  );
  return Object.freeze({
    sources: Object.freeze([
      ...new Set(mappingLinks.map(link => link.sourceId).filter(Boolean))
    ].sort()),
    targets: Object.freeze([
      ...new Set(mappingNodes.map(mapping => mapping.targetId).filter(Boolean))
    ].sort()),
    coreNodes: Object.freeze(graph.nodes.map(node => Object.freeze({
      id: node.id,
      kind: node.kind,
      label: node.label,
      enabled: node.enabled
    }))),
    mappingNodes: Object.freeze(mappingNodes),
    edges: Object.freeze(graph.edges.map(edge => Object.freeze({
      id: edge.id,
      sourceId: edge.sourceId,
      targetNodeId: edge.targetNodeId,
      targetPort: edge.targetPort
    }))),
    mappingLinks: Object.freeze(
      mappingLinks.map(link => Object.freeze(link))
    )
  });
}
