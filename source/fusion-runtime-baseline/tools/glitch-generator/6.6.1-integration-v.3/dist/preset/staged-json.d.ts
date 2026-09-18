import type { ResolvedPreset } from '../schema/types.js';
import { type PresetValidationContext, type PresetValidationReport } from './validation.js';
export interface StagedPresetJsonResult {
    readonly applied: false;
    readonly valid: boolean;
    readonly log: string;
    readonly report?: PresetValidationReport;
    readonly preset?: ResolvedPreset;
}
export declare function stagePresetJson(serialized: string, context?: PresetValidationContext): StagedPresetJsonResult;
//# sourceMappingURL=staged-json.d.ts.map