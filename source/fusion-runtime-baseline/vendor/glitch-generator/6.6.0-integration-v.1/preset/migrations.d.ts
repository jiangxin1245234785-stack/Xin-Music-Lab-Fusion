import type { Preset, ResolvedPreset } from '../schema/types.js';
export interface PresetMigration {
    readonly from: number;
    readonly to: number;
    readonly migrate: (preset: Preset) => Preset;
    readonly label?: string;
    readonly fields?: readonly PresetMigrationField[];
}
export interface PresetMigrationField {
    readonly path: string;
    readonly description: string;
}
export declare const MIGRATIONS: readonly PresetMigration[];
export declare function getMigrationPath(sourceVersion: number): readonly PresetMigration[];
export declare function migratePreset(input: Preset): Preset;
export declare function loadPreset(input: Preset): ResolvedPreset;
//# sourceMappingURL=migrations.d.ts.map