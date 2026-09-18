import { type MappingContributionBreakdown } from '../../debug/mapping-breakdown.js';
import type { ContinuousMappingContribution, MappingSourceValues } from '../../mapping/index.js';
import type { GateDecision, TargetMixerFrame, TargetMixerStep } from '../../mixer/index.js';
import type { MappingCard, ResolvedVisualTargetState } from '../../schema/types.js';
import type { VisualTargetDefinition } from '../../render/visual-targets.js';
import type { SupportedLocale } from '../i18n/index.js';
import { type ResolvedUiSemanticDescriptor, type UiSemanticTranslator } from '../semantics/index.js';
export interface MappingRuntimeSourceMeta {
    readonly sourceId?: string;
    readonly sourceProvider: string;
    readonly confidence: number | null;
    readonly ageMs: number;
    readonly available: boolean;
    readonly providerDetail?: Readonly<Record<string, string>>;
    readonly fallbackReason?: string | null;
}
export interface MappingRuntimePresenterInput {
    readonly mapping?: MappingCard | undefined;
    readonly mixerFrame?: TargetMixerFrame | undefined;
    readonly finalState?: ResolvedVisualTargetState | undefined;
    readonly sourceValues?: MappingSourceValues;
    readonly translator: UiSemanticTranslator;
    readonly rackEnabled?: boolean;
    readonly soloMappingId?: string | null;
    readonly targetDefinitions?: readonly VisualTargetDefinition[];
    readonly sourceMeta?: MappingRuntimeSourceMeta | null;
    readonly locale?: SupportedLocale;
    readonly frameIndex?: number;
    readonly engineTimeMs?: number;
}
export interface MappingRuntimePipelineStage {
    readonly id: TargetMixerStep | 'energy-budget' | 'absolute-clamp' | 'physical-safety-final';
    readonly label: string;
    readonly value: number;
    readonly changedFromPrevious: boolean;
}
export interface MappingRuntimeViewModel {
    readonly available: boolean;
    readonly summary: string;
    readonly mappingId: string;
    readonly sourceId: string;
    readonly targetId: string;
    readonly source: ResolvedUiSemanticDescriptor | null;
    readonly target: ResolvedUiSemanticDescriptor | null;
    readonly operation: ResolvedUiSemanticDescriptor | null;
    readonly mappingStatus: ResolvedUiSemanticDescriptor | null;
    readonly targetStatus: ResolvedUiSemanticDescriptor | null;
    readonly breakdown: MappingContributionBreakdown | null;
    readonly contribution: ContinuousMappingContribution | null;
    readonly gateDecision: GateDecision | null;
    readonly pipeline: readonly MappingRuntimePipelineStage[];
    readonly probabilityText: string;
    readonly providerText: string;
    readonly sourceMeta: MappingRuntimeSourceMeta | null;
    readonly frameIndex: number;
    readonly engineTimeMs: number;
}
export declare function createMappingRuntimeViewModel(input: MappingRuntimePresenterInput): MappingRuntimeViewModel;
//# sourceMappingURL=mapping-runtime-presenter.d.ts.map