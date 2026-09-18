export declare function combineSeeds(presetSeed: number, sessionSeed: number): number;
export declare class SeededPrng {
    private state;
    constructor(seed: number);
    reset(seed: number): void;
    nextUint32(): number;
    nextFloat(): number;
}
export declare function createSeededPrng(presetSeed: number, sessionSeed?: number): SeededPrng;
//# sourceMappingURL=seeded-prng.d.ts.map