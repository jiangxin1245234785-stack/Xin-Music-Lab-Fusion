import type { MappingDebugReason, TargetDebugReason } from '../../debug/mapping-breakdown.js';
import type { EventRetriggerMode, EventEnvelope, GlobalEventPolicy, MappingKind, MappingPolarity, MappingReplaceMode } from '../../schema/types.js';
import { type DescriptorResolutionOptions, type ResolvedUiSemanticDescriptor, type UiSemanticDescriptor, type UiSemanticTranslator } from './types.js';
export declare const MIXER_STEP_DESCRIPTORS: readonly UiSemanticDescriptor[];
export declare const MAPPING_OPERATION_IDS: readonly MappingReplaceMode[];
export declare const MAPPING_OPERATION_DESCRIPTORS: readonly UiSemanticDescriptor[];
export type EnvelopeFieldId = Exclude<keyof EventEnvelope, 'id' | 'retriggerMode'>;
export declare const ENVELOPE_FIELD_IDS: readonly EnvelopeFieldId[];
export declare const ENVELOPE_DESCRIPTORS: readonly UiSemanticDescriptor[];
export declare const GATE_STATE_IDS: readonly ["none", "open", "closed"];
export type GateStateId = typeof GATE_STATE_IDS[number];
export declare const GATE_STATE_DESCRIPTORS: readonly UiSemanticDescriptor[];
export declare const GATE_PARAMETER_IDS: readonly ["gateThreshold"];
export type GateParameterId = typeof GATE_PARAMETER_IDS[number];
export declare const GATE_PARAMETER_DESCRIPTORS: readonly UiSemanticDescriptor[];
export declare const GATE_DESCRIPTORS: readonly UiSemanticDescriptor[];
export declare const MAPPING_KIND_IDS: readonly MappingKind[];
export declare const MAPPING_KIND_DESCRIPTORS: readonly UiSemanticDescriptor[];
export declare const MAPPING_POLARITY_IDS: readonly MappingPolarity[];
export declare const MAPPING_POLARITY_DESCRIPTORS: readonly UiSemanticDescriptor[];
export declare const EVENT_RETRIGGER_IDS: readonly EventRetriggerMode[];
export declare const EVENT_RETRIGGER_DESCRIPTORS: readonly UiSemanticDescriptor[];
export declare const GLOBAL_EVENT_POLICY_IDS: readonly GlobalEventPolicy[];
export declare const GLOBAL_EVENT_POLICY_DESCRIPTORS: readonly UiSemanticDescriptor[];
export declare const MAPPING_DEBUG_REASON_IDS: readonly MappingDebugReason[];
export declare const MAPPING_DEBUG_REASON_DESCRIPTORS: readonly UiSemanticDescriptor[];
export declare const TARGET_DEBUG_REASON_IDS: readonly TargetDebugReason[];
export declare const TARGET_DEBUG_REASON_DESCRIPTORS: readonly UiSemanticDescriptor[];
export type OperationDescriptorDomain = 'mixer-step' | 'mapping-operation' | 'envelope' | 'gate' | 'mapping-kind' | 'mapping-polarity' | 'event-retrigger' | 'event-policy' | 'mapping-status' | 'target-status';
export declare const OPERATION_DESCRIPTOR_CATALOGS: Readonly<Record<OperationDescriptorDomain, Readonly<Record<string, UiSemanticDescriptor>>>>;
export interface OperationDescriptorResolutionOptions extends DescriptorResolutionOptions {
}
export declare function resolveOperationDescriptor(domain: OperationDescriptorDomain, idInput: unknown, translator: UiSemanticTranslator, options?: OperationDescriptorResolutionOptions): ResolvedUiSemanticDescriptor;
//# sourceMappingURL=operation-descriptors.d.ts.map