export type DebugConsoleLevel = 'debug' | 'info' | 'log' | 'warn' | 'error';
export interface DebugConsoleEntry {
    readonly sequence: number;
    readonly engineTimeMs: number;
    readonly level: DebugConsoleLevel;
    readonly arguments: readonly unknown[];
}
export interface DebugBundleEngineState {
    readonly presetSeed: number;
    readonly sessionSeed: number;
    readonly clockMode: string;
    readonly engineTimeMs: number;
}
export interface DebugBundleInput {
    readonly preset: unknown;
    readonly snapshotState: unknown;
    readonly audioFeatureSample: unknown;
    readonly mappingContributions: unknown;
    readonly targetFinalValues: unknown;
    readonly energyBudgetState: unknown;
    readonly safetyLimiterState: unknown;
    readonly shaderPassConfig: unknown;
    readonly screenshotPng: Uint8Array;
    readonly consoleLogs: readonly DebugConsoleEntry[];
    readonly engine: DebugBundleEngineState;
}
export interface DebugBundleEntry {
    readonly name: string;
    readonly bytes: Uint8Array;
}
export interface DebugBundleManifest {
    readonly formatVersion: 1;
    readonly engineVersion: string;
    readonly schemaVersion: number;
    readonly exportedAtEngineTimeMs: number;
    readonly clockMode: string;
    readonly presetSeed: number;
    readonly sessionSeed: number;
    readonly files: readonly string[];
}
export interface DebugBundle {
    readonly manifest: DebugBundleManifest;
    readonly entries: readonly DebugBundleEntry[];
    readonly archive: Uint8Array;
}
type ConsoleMethod = (...args: unknown[]) => void;
export interface ConsoleCaptureTarget {
    debug: ConsoleMethod;
    info: ConsoleMethod;
    log: ConsoleMethod;
    warn: ConsoleMethod;
    error: ConsoleMethod;
}
export declare class DebugConsoleLogBuffer {
    readonly capacity: number;
    private readonly entries;
    private nextSequence;
    constructor(capacity?: number);
    record(engineTimeMs: number, level: DebugConsoleLevel, args: readonly unknown[]): DebugConsoleEntry;
    list(): readonly DebugConsoleEntry[];
    clear(): void;
}
export declare function installConsoleLogCapture(target: ConsoleCaptureTarget, buffer: DebugConsoleLogBuffer, engineTimeProvider: () => number): () => void;
export declare function encodeDebugBundleZip(entries: readonly DebugBundleEntry[]): Uint8Array;
export declare function buildDebugBundle(input: DebugBundleInput): DebugBundle;
export {};
//# sourceMappingURL=debug-bundle.d.ts.map