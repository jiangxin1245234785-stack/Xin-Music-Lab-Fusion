import type { Preset, ResolvedPreset } from '../schema/types.js';
import { type PresetCompatibilityReport } from './compatibility.js';
import { type PresetValidationContext } from './validation.js';
export declare const PRODUCT_PRESET_JSON_CONTRACT: "xin.glitch-product-preset-json/1";
export declare const PRODUCT_PRESET_JSON_VERSION: "5.3.0-product-json";
export interface ProductPresetJsonOptions {
    readonly allowPartial?: boolean;
    readonly allowShaderPipelineChanges?: boolean;
    readonly validationContext?: PresetValidationContext;
}
export interface ProductPresetJsonStageResult {
    readonly contract: typeof PRODUCT_PRESET_JSON_CONTRACT;
    readonly version: typeof PRODUCT_PRESET_JSON_VERSION;
    readonly applied: false;
    readonly valid: boolean;
    readonly code: string;
    readonly log: string;
    readonly compatibility?: PresetCompatibilityReport;
    readonly preset?: ResolvedPreset;
}
export declare function exportProductPresetJson(input: Preset): string;
export declare function createProductPresetFileName(input: Preset): string;
export declare function stageProductPresetJson(serialized: string, options?: ProductPresetJsonOptions): ProductPresetJsonStageResult;
//# sourceMappingURL=product-json.d.ts.map