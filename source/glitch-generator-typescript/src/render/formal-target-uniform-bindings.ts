import type { VisualTargetState } from '../schema/types.js';
import { VISUAL_TARGETS } from './visual-targets.js';

export const FORMAL_TARGET_UNIFORM_CONTRACT =
  'xin.generator-target-uniform-bindings/1' as const;

export interface FormalTargetUniformBindingDefinition {
  readonly targetId: string;
  readonly uniformName: string;
}

export interface ResolvedFormalTargetUniformBinding extends
FormalTargetUniformBindingDefinition {
  readonly value: number;
}

export const FORMAL_TARGET_UNIFORM_BINDINGS:
readonly FormalTargetUniformBindingDefinition[] = Object.freeze([
  { targetId: VISUAL_TARGETS.feedbackRetention, uniformName: 'uFeedbackRetention' },
  { targetId: VISUAL_TARGETS.feedbackDecay, uniformName: 'uFeedbackDecay' },
  { targetId: VISUAL_TARGETS.feedbackZoom, uniformName: 'uFeedbackZoom' },
  { targetId: VISUAL_TARGETS.feedbackRotation, uniformName: 'uFeedbackRotation' },
  { targetId: VISUAL_TARGETS.blockSize, uniformName: 'uBlockSize' },
  { targetId: VISUAL_TARGETS.blockDisplacementX, uniformName: 'uBlockDisplacementX' },
  { targetId: VISUAL_TARGETS.blockSpawnProbability, uniformName: 'uBlockSpawnProbability' },
  { targetId: VISUAL_TARGETS.blockLifetime, uniformName: 'uBlockLifetime' },
  { targetId: VISUAL_TARGETS.rgbDistance, uniformName: 'uRgbDistance' },
  { targetId: VISUAL_TARGETS.rgbAngle, uniformName: 'uRgbAngle' },
  { targetId: VISUAL_TARGETS.rgbDecay, uniformName: 'uRgbDecay' },
  { targetId: VISUAL_TARGETS.scanlineDepth, uniformName: 'uScanlineDepth' },
  { targetId: VISUAL_TARGETS.grainDensity, uniformName: 'uGrainDensity' },
  { targetId: VISUAL_TARGETS.grainContrast, uniformName: 'uGrainContrast' },
  { targetId: VISUAL_TARGETS.dropoutProbability, uniformName: 'uDropoutProbability' },
  { targetId: VISUAL_TARGETS.dropoutOpacity, uniformName: 'uDropoutOpacity' },
  { targetId: VISUAL_TARGETS.whiteTearBrightness, uniformName: 'uWhiteTearBrightness' },
  { targetId: VISUAL_TARGETS.colorBrightness, uniformName: 'uColorBrightness' },
  { targetId: VISUAL_TARGETS.colorContrast, uniformName: 'uColorContrast' },
  { targetId: VISUAL_TARGETS.colorSaturation, uniformName: 'uColorSaturation' },
  { targetId: VISUAL_TARGETS.colorFlashStrength, uniformName: 'uColorFlashStrength' }
]);

export function requiredFormalTargetValue(
  state: VisualTargetState,
  targetId: string
): number {
  const value = Number(state.values?.[targetId]);
  if (!Number.isFinite(value)) {
    throw new Error(`RENDER_TARGET_MISSING:${targetId}`);
  }
  return value;
}

export function resolveFormalTargetUniformBindings(
  state: VisualTargetState
): readonly ResolvedFormalTargetUniformBinding[] {
  return Object.freeze(FORMAL_TARGET_UNIFORM_BINDINGS.map(binding =>
    Object.freeze({
      ...binding,
      value: requiredFormalTargetValue(state, binding.targetId)
    })
  ));
}
