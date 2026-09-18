import type { ResolvedPreset } from '../schema/types.js';
import { type PresetValidationContext, type PresetValidationReport } from './validation.js';
export type PresetCompatibilityStatus = 'current' | 'migrated' | 'partial' | 'incompatible';
export interface AppliedPresetMigration {
    readonly from: number;
    readonly to: number;
    readonly label: string;
}
export interface MigratedPresetField {
    readonly path: string;
    readonly action: 'defaulted' | 'preserved';
    readonly description: string;
    readonly from: number;
    readonly to: number;
}
export interface NonMigratedPresetField {
    readonly path: string;
    readonly reason: string;
}
export interface PresetCompatibilityWarning {
    readonly path: string;
    readonly reason: string;
}
export interface PresetCompatibilityReport {
    readonly status: PresetCompatibilityStatus;
    readonly compatible: boolean;
    readonly fullyCompatible: boolean;
    readonly sourceSchemaVersion: number | null;
    readonly targetSchemaVersion: number;
    readonly sourceEngineVersion: string | null;
    readonly targetEngineVersion: string;
    readonly appliedMigrations: readonly AppliedPresetMigration[];
    readonly migratedFields: readonly MigratedPresetField[];
    readonly nonMigratedFields: readonly NonMigratedPresetField[];
    readonly warnings: readonly PresetCompatibilityWarning[];
    readonly validation: PresetValidationReport;
    readonly preset?: ResolvedPreset;
}
export declare function buildPresetCompatibilityReport(input: unknown, context?: PresetValidationContext): PresetCompatibilityReport;
//# sourceMappingURL=compatibility.d.ts.map