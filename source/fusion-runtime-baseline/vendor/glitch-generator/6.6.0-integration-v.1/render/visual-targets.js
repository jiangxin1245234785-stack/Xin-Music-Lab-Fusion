export const VISUAL_TARGETS = Object.freeze({
    brightness: 'visual.brightness',
    scale: 'visual.scale',
    alpha: 'visual.alpha',
    feedbackRetention: 'feedback.retention',
    feedbackDecay: 'feedback.decay',
    feedbackZoom: 'feedback.zoom',
    feedbackRotation: 'feedback.rotation',
    blockSize: 'blockDamage.blockSize',
    blockDisplacementX: 'blockDamage.displacementX',
    blockSpawnProbability: 'blockDamage.spawnProbability',
    blockLifetime: 'blockDamage.lifetime',
    rgbDistance: 'rgbSplit.distance',
    rgbAngle: 'rgbSplit.angle',
    rgbDecay: 'rgbSplit.decay',
    scanlineDepth: 'scanlineGrain.scanlineDepth',
    grainDensity: 'scanlineGrain.grainDensity',
    grainContrast: 'scanlineGrain.grainContrast',
    dropoutProbability: 'signalLoss.dropoutProbability',
    dropoutOpacity: 'signalLoss.dropoutOpacity',
    whiteTearBrightness: 'signalLoss.whiteTearBrightness',
    colorBrightness: 'color.brightness',
    colorContrast: 'color.contrast',
    colorSaturation: 'color.saturation',
    colorFlashStrength: 'color.flashStrength'
});
export const VISUAL_TARGET_REGISTRY = Object.freeze([
    { id: VISUAL_TARGETS.feedbackRetention, module: 'Feedback', label: 'Retention', defaultValue: 0.82, min: 0, max: 1 },
    { id: VISUAL_TARGETS.feedbackDecay, module: 'Feedback', label: 'Decay', defaultValue: 0.94, min: 0, max: 1 },
    { id: VISUAL_TARGETS.feedbackZoom, module: 'Feedback', label: 'Zoom', defaultValue: 1, min: 0.5, max: 2 },
    { id: VISUAL_TARGETS.feedbackRotation, module: 'Feedback', label: 'Rotation', defaultValue: 0, min: -Math.PI, max: Math.PI },
    { id: VISUAL_TARGETS.blockSize, module: 'Block Damage', label: 'Block Size', defaultValue: 0.12, min: 0.01, max: 0.5 },
    { id: VISUAL_TARGETS.blockDisplacementX, module: 'Block Damage', label: 'Displacement X', defaultValue: 0, min: -1, max: 1 },
    { id: VISUAL_TARGETS.blockSpawnProbability, module: 'Block Damage', label: 'Spawn Probability', defaultValue: 0.08, min: 0, max: 1 },
    { id: VISUAL_TARGETS.blockLifetime, module: 'Block Damage', label: 'Lifetime', defaultValue: 0.35, min: 0.03, max: 4 },
    { id: VISUAL_TARGETS.rgbDistance, module: 'RGB Split', label: 'Distance', defaultValue: 0, min: 0, max: 0.08 },
    { id: VISUAL_TARGETS.rgbAngle, module: 'RGB Split', label: 'Angle', defaultValue: 0, min: -Math.PI, max: Math.PI },
    { id: VISUAL_TARGETS.rgbDecay, module: 'RGB Split', label: 'Decay', defaultValue: 0.8, min: 0, max: 1 },
    { id: VISUAL_TARGETS.scanlineDepth, module: 'Scanline/Grain', label: 'Scanline Depth', defaultValue: 0.08, min: 0, max: 1 },
    { id: VISUAL_TARGETS.grainDensity, module: 'Scanline/Grain', label: 'Grain Density', defaultValue: 0.1, min: 0, max: 1 },
    { id: VISUAL_TARGETS.grainContrast, module: 'Scanline/Grain', label: 'Grain Contrast', defaultValue: 0.2, min: 0, max: 2 },
    { id: VISUAL_TARGETS.dropoutProbability, module: 'Signal Loss', label: 'Dropout Probability', defaultValue: 0, min: 0, max: 1 },
    { id: VISUAL_TARGETS.dropoutOpacity, module: 'Signal Loss', label: 'Dropout Opacity', defaultValue: 0, min: 0, max: 1 },
    { id: VISUAL_TARGETS.whiteTearBrightness, module: 'Signal Loss', label: 'White Tear Brightness', defaultValue: 0, min: 0, max: 1 },
    { id: VISUAL_TARGETS.colorBrightness, module: 'Color', label: 'Brightness', defaultValue: 0.7, min: 0, max: 1 },
    { id: VISUAL_TARGETS.colorContrast, module: 'Color', label: 'Contrast', defaultValue: 1, min: 0, max: 2 },
    { id: VISUAL_TARGETS.colorSaturation, module: 'Color', label: 'Saturation', defaultValue: 1, min: 0, max: 2 },
    { id: VISUAL_TARGETS.colorFlashStrength, module: 'Color', label: 'Flash Strength', defaultValue: 0, min: 0, max: 0.35 }
]);
export const VISUAL_TARGET_BY_ID = new Map(VISUAL_TARGET_REGISTRY.map(definition => [definition.id, definition]));
export function createDefaultVisualValues() {
    return Object.fromEntries(VISUAL_TARGET_REGISTRY.map(definition => [
        definition.id,
        definition.defaultValue
    ]));
}
//# sourceMappingURL=visual-targets.js.map