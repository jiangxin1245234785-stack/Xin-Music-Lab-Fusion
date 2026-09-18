export type LearnSourceValues = Readonly<Record<string, number>>;
export interface LearnFeatureSample {
    readonly engineTimeMs: number;
    readonly sources: LearnSourceValues;
}
export declare class FeatureHistoryBuffer {
    private readonly maxDurationMs;
    private readonly samples;
    constructor(maxDurationMs?: number);
    record(engineTimeMs: number, sources: LearnSourceValues): void;
    list(): readonly LearnFeatureSample[];
    recent(endEngineTimeMs: number, durationMs: number): readonly LearnFeatureSample[];
    clear(): void;
    private trim;
}
//# sourceMappingURL=feature-history.d.ts.map