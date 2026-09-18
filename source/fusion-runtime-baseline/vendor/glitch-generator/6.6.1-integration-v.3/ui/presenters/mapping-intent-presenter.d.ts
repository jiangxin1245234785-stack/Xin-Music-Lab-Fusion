import type { EventEnvelope, MappingCard, ResolvedEventEnvelope, ResolvedMappingCard } from '../../schema/types.js';
import type { VisualTargetDefinition } from '../../render/visual-targets.js';
import type { SupportedLocale } from '../i18n/index.js';
import { type DynamicNodeSourceDescriptorInput, type ResolvedUiSemanticDescriptor, type UiSemanticTranslator } from '../semantics/index.js';
export interface MappingIntentPresenterInput {
    readonly mapping?: MappingCard | undefined;
    readonly envelope?: EventEnvelope | undefined;
    readonly translator: UiSemanticTranslator;
    readonly targetDefinitions?: readonly VisualTargetDefinition[];
    readonly nodeSource?: DynamicNodeSourceDescriptorInput;
    readonly locale?: SupportedLocale;
}
export interface MappingIntentViewModel {
    readonly available: boolean;
    readonly summary: string;
    readonly mapping: ResolvedMappingCard | null;
    readonly envelope: ResolvedEventEnvelope | null;
    readonly source: ResolvedUiSemanticDescriptor | null;
    readonly target: ResolvedUiSemanticDescriptor | null;
    readonly kind: ResolvedUiSemanticDescriptor | null;
    readonly operation: ResolvedUiSemanticDescriptor | null;
    readonly polarity: ResolvedUiSemanticDescriptor | null;
    readonly retrigger: ResolvedUiSemanticDescriptor | null;
    readonly gateSource: ResolvedUiSemanticDescriptor | null;
    readonly amountRole: string;
    readonly rangeText: string;
    readonly responseText: string;
    readonly probabilityText: string;
    readonly gateText: string;
    readonly envelopeText: string;
    readonly modulationCount: number;
}
export declare function createMappingIntentViewModel(input: MappingIntentPresenterInput): MappingIntentViewModel;
//# sourceMappingURL=mapping-intent-presenter.d.ts.map