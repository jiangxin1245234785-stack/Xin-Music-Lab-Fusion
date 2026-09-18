import type { Preset, ResolvedPreset, ResolvedSnapshot, Snapshot, VisualTargetState } from '../schema/types.js';
export declare const DEFAULT_PRESET_STORAGE_KEY = "gmg.phase1.preset";
export declare const DEFAULT_CUSTOM_PRESET_STORAGE_KEY = "gmg.phase2.custom-presets";
export interface PresetStorage {
    getItem(key: string): string | null;
    setItem(key: string, value: string): void;
}
export interface SnapshotCaptureInput {
    readonly id?: string;
    readonly name?: string;
    readonly engineTimeMs?: number;
    readonly note?: string;
    readonly thumbnail?: string;
    readonly preset: Preset;
    readonly targetState: VisualTargetState;
}
export declare function serializePreset(input: Preset): string;
export declare function deserializePreset(serialized: string): ResolvedPreset;
export declare function deserializePresetInput(serialized: string): Preset;
export declare function savePresetToStorage(storage: PresetStorage, preset: Preset, key?: string): ResolvedPreset;
export declare function loadPresetFromStorage(storage: PresetStorage, key?: string): ResolvedPreset;
export declare function loadPresetInputFromStorage(storage: PresetStorage, key?: string): Preset;
export declare function captureSnapshot(input: SnapshotCaptureInput): ResolvedSnapshot;
export declare function restoreSnapshot(input: Snapshot): ResolvedSnapshot;
export declare function serializePresetLibrary(presets: readonly Preset[]): string;
export declare function deserializePresetLibrary(serialized: string): readonly ResolvedPreset[];
export declare function loadCustomPresetsFromStorage(storage: PresetStorage, key?: string): readonly ResolvedPreset[];
export declare function saveCustomPresetToStorage(storage: PresetStorage, preset: Preset, key?: string): ResolvedPreset;
//# sourceMappingURL=persistence.d.ts.map