import type { ResolvedPreset } from '../schema/types.js';
export type PresetValidationSeverity = 'error' | 'warning';
export type UnavailableSourceFallback = 'zero' | 'hold-last';
export interface PresetValidationIssue {
    readonly severity: PresetValidationSeverity;
    readonly code: string;
    readonly path: string;
    readonly message: string;
}
export interface PresetValidationContext {
    readonly knownSourceIds?: readonly string[];
    readonly availableSourceIds?: readonly string[];
    readonly unavailableSourceFallback?: UnavailableSourceFallback;
}
export interface PresetValidationReport {
    readonly valid: boolean;
    readonly sourceSchemaVersion: number | null;
    readonly targetSchemaVersion: number;
    readonly migrated: boolean;
    readonly issues: readonly PresetValidationIssue[];
    readonly preset?: ResolvedPreset;
}
export declare function validatePreset(input: unknown, context?: PresetValidationContext): PresetValidationReport;
export declare class PresetValidationError extends Error {
    readonly report: PresetValidationReport;
    constructor(report: PresetValidationReport);
}
export declare function loadValidatedPreset(input: unknown, context?: PresetValidationContext): ResolvedPreset;
//# sourceMappingURL=validation.d.ts.map