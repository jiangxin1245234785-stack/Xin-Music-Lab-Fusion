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
} as const);

export interface VisualTargetDefinition {
  readonly id: string;
  readonly module: 'Feedback' | 'Block Damage' | 'RGB Split' |
    'Scanline/Grain' | 'Signal Loss' | 'Color' | 'Material' |
    'Custom(GLSL)';
  readonly label: string;
  readonly defaultValue: number;
  readonly min: number;
  readonly max: number;
  readonly actionClass?: 'motion' | 'coverage' | 'refresh' |
    'displacement' | 'feedback' | 'color' | 'quantize' | 'commit';
  readonly ownerLayer?: 'material' | 'glitch' | 'composer';
  readonly semanticIntent?: string;
  readonly allowDuplicate?: boolean;
}

interface FormalTargetOwnership {
  readonly actionClass: NonNullable<VisualTargetDefinition['actionClass']>;
  readonly ownerLayer: 'glitch';
  readonly semanticIntent: string;
}

const FORMAL_TARGET_OWNERSHIP: Readonly<Record<string, FormalTargetOwnership>> =
  Object.freeze({
    [VISUAL_TARGETS.feedbackRetention]: { actionClass: 'feedback', ownerLayer: 'glitch', semanticIntent: 'temporal-memory-retention' },
    [VISUAL_TARGETS.feedbackDecay]: { actionClass: 'feedback', ownerLayer: 'glitch', semanticIntent: 'temporal-memory-decay' },
    [VISUAL_TARGETS.feedbackZoom]: { actionClass: 'motion', ownerLayer: 'glitch', semanticIntent: 'feedback-spatial-zoom' },
    [VISUAL_TARGETS.feedbackRotation]: { actionClass: 'motion', ownerLayer: 'glitch', semanticIntent: 'feedback-spatial-rotation' },
    [VISUAL_TARGETS.blockSize]: { actionClass: 'displacement', ownerLayer: 'glitch', semanticIntent: 'damage-fragment-scale' },
    [VISUAL_TARGETS.blockDisplacementX]: { actionClass: 'displacement', ownerLayer: 'glitch', semanticIntent: 'damage-horizontal-displacement' },
    [VISUAL_TARGETS.blockSpawnProbability]: { actionClass: 'commit', ownerLayer: 'glitch', semanticIntent: 'damage-fragment-commit' },
    [VISUAL_TARGETS.blockLifetime]: { actionClass: 'commit', ownerLayer: 'glitch', semanticIntent: 'damage-fragment-lifetime' },
    [VISUAL_TARGETS.rgbDistance]: { actionClass: 'displacement', ownerLayer: 'glitch', semanticIntent: 'channel-spatial-separation' },
    [VISUAL_TARGETS.rgbAngle]: { actionClass: 'displacement', ownerLayer: 'glitch', semanticIntent: 'channel-separation-direction' },
    [VISUAL_TARGETS.rgbDecay]: { actionClass: 'feedback', ownerLayer: 'glitch', semanticIntent: 'channel-separation-decay' },
    [VISUAL_TARGETS.scanlineDepth]: { actionClass: 'quantize', ownerLayer: 'glitch', semanticIntent: 'scanline-depth-quantization' },
    [VISUAL_TARGETS.grainDensity]: { actionClass: 'quantize', ownerLayer: 'glitch', semanticIntent: 'grain-spatial-density' },
    [VISUAL_TARGETS.grainContrast]: { actionClass: 'quantize', ownerLayer: 'glitch', semanticIntent: 'grain-contrast-quantization' },
    [VISUAL_TARGETS.dropoutProbability]: { actionClass: 'commit', ownerLayer: 'glitch', semanticIntent: 'signal-dropout-commit' },
    [VISUAL_TARGETS.dropoutOpacity]: { actionClass: 'commit', ownerLayer: 'glitch', semanticIntent: 'signal-dropout-opacity' },
    [VISUAL_TARGETS.whiteTearBrightness]: { actionClass: 'commit', ownerLayer: 'glitch', semanticIntent: 'signal-tear-luminance' },
    [VISUAL_TARGETS.colorBrightness]: { actionClass: 'color', ownerLayer: 'glitch', semanticIntent: 'output-luminance' },
    [VISUAL_TARGETS.colorContrast]: { actionClass: 'color', ownerLayer: 'glitch', semanticIntent: 'output-contrast' },
    [VISUAL_TARGETS.colorSaturation]: { actionClass: 'color', ownerLayer: 'glitch', semanticIntent: 'output-saturation' },
    [VISUAL_TARGETS.colorFlashStrength]: { actionClass: 'color', ownerLayer: 'glitch', semanticIntent: 'event-color-flash' }
  });

const CORE_VISUAL_TARGET_REGISTRY: readonly VisualTargetDefinition[] =
  Object.freeze([
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

export const VISUAL_TARGET_REGISTRY: readonly VisualTargetDefinition[] =
  Object.freeze(CORE_VISUAL_TARGET_REGISTRY.map(definition => Object.freeze({
    ...definition,
    ...FORMAL_TARGET_OWNERSHIP[definition.id]
  })));

export const VISUAL_TARGET_BY_ID: ReadonlyMap<string, VisualTargetDefinition> =
  new Map(VISUAL_TARGET_REGISTRY.map(definition => [definition.id, definition]));

export function createDefaultVisualValues(): Readonly<Record<string, number>> {
  return Object.fromEntries(
    VISUAL_TARGET_REGISTRY.map(definition => [
      definition.id,
      definition.defaultValue
    ])
  );
}
