import type { ResolvedUnifiedMusicFrame, UnifiedMusicFrame } from './types.js';
/**
 * Resolves a partial, already-unified fixture into a complete v1 frame.
 *
 * This pure function performs no provider arbitration and reads no external
 * clock, DOM, audio, XML state or random source.
 */
export declare function buildUnifiedMusicFrame(input?: UnifiedMusicFrame): ResolvedUnifiedMusicFrame;
//# sourceMappingURL=builder.d.ts.map