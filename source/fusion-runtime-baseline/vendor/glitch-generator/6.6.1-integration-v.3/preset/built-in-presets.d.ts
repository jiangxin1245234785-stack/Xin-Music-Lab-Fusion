import type { Preset } from '../schema/types.js';
export declare const PRODUCT_BUILTIN_PRESET_CONTRACT: "xin.glitch-product-presets/1";
export declare const PRODUCT_BUILTIN_PRESETS: Readonly<Record<string, Preset>>;
export interface ProductBuiltInPresetSummary {
    readonly id: string;
    readonly name: string;
    readonly description: string;
    readonly schemaVersion: number;
    readonly readOnly: true;
    readonly category: 'built-in';
}
export declare function listProductBuiltInPresets(): readonly ProductBuiltInPresetSummary[];
export declare function getProductBuiltInPreset(id: string): Preset;
//# sourceMappingURL=built-in-presets.d.ts.map