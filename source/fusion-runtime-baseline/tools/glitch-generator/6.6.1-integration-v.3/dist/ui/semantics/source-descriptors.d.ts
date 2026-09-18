import { type GeneratorMappingSourceId } from '../../runtime/control-source-registry.js';
import { type DescriptorResolutionOptions, type ResolvedUiSemanticDescriptor, type UiSemanticDescriptor, type UiSemanticTranslator } from './types.js';
export declare const SOURCE_DESCRIPTORS: readonly UiSemanticDescriptor[];
export declare const SOURCE_DESCRIPTOR_CATALOG: Readonly<Record<GeneratorMappingSourceId, UiSemanticDescriptor>>;
export interface DynamicNodeSourceDescriptorInput {
    readonly nodeId: string;
    readonly label?: string;
    readonly kind?: string;
}
export interface SourceDescriptorResolutionOptions extends DescriptorResolutionOptions {
    readonly node?: DynamicNodeSourceDescriptorInput;
}
export declare function resolveSourceDescriptor(idInput: unknown, translator: UiSemanticTranslator, options?: SourceDescriptorResolutionOptions): ResolvedUiSemanticDescriptor;
//# sourceMappingURL=source-descriptors.d.ts.map