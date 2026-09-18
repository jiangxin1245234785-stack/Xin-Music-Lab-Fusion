import { type OperationDescriptorDomain } from './operation-descriptors.js';
export interface SemanticCoverageSection {
    readonly expected: readonly string[];
    readonly actual: readonly string[];
    readonly missing: readonly string[];
    readonly unexpected: readonly string[];
    readonly duplicates: readonly string[];
    readonly complete: boolean;
}
export interface SemanticCoverageReport {
    readonly sourceRegistry: SemanticCoverageSection;
    readonly sourceSetConsistency: SemanticCoverageSection;
    readonly formalTargets: SemanticCoverageSection;
    readonly formalUniformBindings: SemanticCoverageSection;
    readonly formalUniformNames: SemanticCoverageSection;
    readonly staticTargetPartition: SemanticCoverageSection;
    readonly operationDomains: Readonly<Record<OperationDescriptorDomain, SemanticCoverageSection>>;
    readonly missingEnglishKeys: readonly string[];
    readonly missingChineseKeys: readonly string[];
    readonly forbiddenDescriptorFields: readonly string[];
    readonly forbiddenTargetRelations: readonly string[];
    readonly complete: boolean;
}
export declare function buildSemanticCoverageReport(): SemanticCoverageReport;
//# sourceMappingURL=coverage.d.ts.map