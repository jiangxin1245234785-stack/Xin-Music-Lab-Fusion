export declare const VISUAL_TARGETS: Readonly<{
    readonly brightness: "visual.brightness";
    readonly scale: "visual.scale";
    readonly alpha: "visual.alpha";
    readonly feedbackRetention: "feedback.retention";
    readonly feedbackDecay: "feedback.decay";
    readonly feedbackZoom: "feedback.zoom";
    readonly feedbackRotation: "feedback.rotation";
    readonly blockSize: "blockDamage.blockSize";
    readonly blockDisplacementX: "blockDamage.displacementX";
    readonly blockSpawnProbability: "blockDamage.spawnProbability";
    readonly blockLifetime: "blockDamage.lifetime";
    readonly rgbDistance: "rgbSplit.distance";
    readonly rgbAngle: "rgbSplit.angle";
    readonly rgbDecay: "rgbSplit.decay";
    readonly scanlineDepth: "scanlineGrain.scanlineDepth";
    readonly grainDensity: "scanlineGrain.grainDensity";
    readonly grainContrast: "scanlineGrain.grainContrast";
    readonly dropoutProbability: "signalLoss.dropoutProbability";
    readonly dropoutOpacity: "signalLoss.dropoutOpacity";
    readonly whiteTearBrightness: "signalLoss.whiteTearBrightness";
    readonly colorBrightness: "color.brightness";
    readonly colorContrast: "color.contrast";
    readonly colorSaturation: "color.saturation";
    readonly colorFlashStrength: "color.flashStrength";
}>;
export interface VisualTargetDefinition {
    readonly id: string;
    readonly module: 'Feedback' | 'Block Damage' | 'RGB Split' | 'Scanline/Grain' | 'Signal Loss' | 'Color' | 'Custom(GLSL)';
    readonly label: string;
    readonly defaultValue: number;
    readonly min: number;
    readonly max: number;
}
export declare const VISUAL_TARGET_REGISTRY: readonly VisualTargetDefinition[];
export declare const VISUAL_TARGET_BY_ID: ReadonlyMap<string, VisualTargetDefinition>;
export declare function createDefaultVisualValues(): Readonly<Record<string, number>>;
//# sourceMappingURL=visual-targets.d.ts.map