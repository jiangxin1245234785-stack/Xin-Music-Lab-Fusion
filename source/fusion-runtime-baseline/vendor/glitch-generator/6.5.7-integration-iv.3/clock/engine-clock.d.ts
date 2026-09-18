export interface EngineClockFrame {
    readonly frameIndex: number;
    readonly nowMs: number;
    readonly deltaMs: number;
}
export interface EngineClock {
    reset(): void;
    tick(): EngineClockFrame;
}
export declare class FixedStepEngineClock implements EngineClock {
    readonly stepMs: number;
    private frameIndex;
    private nowMs;
    constructor(stepMs?: number);
    reset(): void;
    tick(): EngineClockFrame;
}
export declare class RealtimeEngineClock implements EngineClock {
    private readonly nowProvider;
    private frameIndex;
    private originMs;
    private previousMs;
    constructor(nowProvider: () => number);
    reset(): void;
    tick(): EngineClockFrame;
    private readProvider;
}
//# sourceMappingURL=engine-clock.d.ts.map