import type { LocaleController, SupportedLocale, TranslationKey, TranslationParams } from '../i18n/index.js';
export type UiSemanticKind = 'source' | 'target' | 'operation' | 'envelope' | 'gate' | 'status';
export type UiSemanticClassification = 'stable' | 'formal' | 'legacy-fallback' | 'extension' | 'unknown';
export type UiSemanticCategory = 'continuous' | 'state' | 'event' | 'confidence' | 'harmony' | 'derived-control' | 'feedback' | 'block-damage' | 'rgb-split' | 'texture' | 'signal-loss' | 'color' | 'custom-glsl' | 'compatibility' | 'mixer-step' | 'mapping-operation' | 'envelope-stage' | 'gate-state' | 'gate-parameter' | 'mapping-kind' | 'mapping-polarity' | 'event-retrigger' | 'event-policy' | 'mapping-status' | 'target-status' | 'dynamic' | 'unknown';
export type UiSemanticUnit = 'normalized' | 'ratio' | 'radians' | 'seconds' | 'milliseconds' | 'viewport-fraction' | 'scalar' | 'integer' | 'boolean' | 'none' | 'unknown';
export type UiSemanticFormatter = 'percent' | 'signed-percent' | 'phase-percent' | 'hue-angle' | 'multiplier' | 'degrees' | 'duration' | 'milliseconds' | 'decimal' | 'integer' | 'boolean' | 'raw';
export interface UiSemanticDescriptor {
    readonly id: string;
    readonly kind: UiSemanticKind;
    readonly classification: UiSemanticClassification;
    readonly labelKey: TranslationKey;
    readonly descriptionKey: TranslationKey;
    readonly category: UiSemanticCategory;
    readonly unit: UiSemanticUnit;
    readonly formatter: UiSemanticFormatter;
    readonly technicalAlias?: string;
}
/** Render label/description as textContent; raw extension IDs are not HTML. */
export interface ResolvedUiSemanticDescriptor extends UiSemanticDescriptor {
    readonly label: string;
    readonly description: string;
}
export type UiSemanticTranslator = Pick<LocaleController, 't'>;
export type MissingDescriptorDomain = 'source' | 'target' | 'operation';
export interface MissingDescriptorDiagnostic {
    readonly domain: MissingDescriptorDomain;
    readonly id: string;
}
export type MissingDescriptorHandler = (diagnostic: MissingDescriptorDiagnostic) => void;
export declare function createDeduplicatingMissingDescriptorHandler(handler: MissingDescriptorHandler): MissingDescriptorHandler;
export interface DescriptorResolutionOptions {
    readonly onMissingDescriptor?: MissingDescriptorHandler;
}
export declare function safeSemanticId(input: unknown): string;
export declare function resolveSemanticDescriptor(descriptor: UiSemanticDescriptor, translator: UiSemanticTranslator, params?: TranslationParams): ResolvedUiSemanticDescriptor;
export declare function formatSemanticValue(descriptor: Pick<UiSemanticDescriptor, 'formatter'>, input: number, locale?: SupportedLocale): string;
//# sourceMappingURL=types.d.ts.map