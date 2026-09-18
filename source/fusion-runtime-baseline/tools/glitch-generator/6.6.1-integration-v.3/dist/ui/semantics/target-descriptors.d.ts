import { type VisualTargetDefinition } from '../../render/index.js';
import { type DescriptorResolutionOptions, type ResolvedUiSemanticDescriptor, type UiSemanticDescriptor, type UiSemanticTranslator } from './types.js';
export declare const FORMAL_TARGET_DESCRIPTORS: readonly UiSemanticDescriptor[];
export declare const LEGACY_TARGET_DESCRIPTORS: readonly UiSemanticDescriptor[];
export declare const STATIC_TARGET_DESCRIPTORS: readonly UiSemanticDescriptor[];
export declare const TARGET_DESCRIPTOR_CATALOG: Readonly<Record<string, UiSemanticDescriptor>>;
export interface TargetDescriptorResolutionOptions extends DescriptorResolutionOptions {
    /** Current active extension definitions supplied by the owning Registry. */
    readonly extensionDefinitions?: readonly VisualTargetDefinition[];
}
export declare function resolveTargetDescriptor(idInput: unknown, translator: UiSemanticTranslator, options?: TargetDescriptorResolutionOptions): ResolvedUiSemanticDescriptor;
//# sourceMappingURL=target-descriptors.d.ts.map