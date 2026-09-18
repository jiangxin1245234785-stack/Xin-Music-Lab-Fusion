export declare const HARMONY_ADAPTER_VERSION: "1.0.0-shadow";
export interface HarmonyHueResult {
    readonly hue: number;
    readonly root: string | null;
    readonly recognized: boolean;
}
/**
 * Converts a musical chord label into a stable pitch-class hue source.
 *
 * This is deliberately an adapter output, not an implicit string-to-visual
 * mapping: MappingCards still decide whether and where the numeric hue goes.
 */
export declare function adaptChordLabelToHue(label: string | null): HarmonyHueResult;
//# sourceMappingURL=harmony-adapter.d.ts.map