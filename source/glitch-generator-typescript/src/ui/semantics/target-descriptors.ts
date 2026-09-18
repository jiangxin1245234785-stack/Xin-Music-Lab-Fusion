import {
  FORMAL_TARGET_UNIFORM_BINDINGS,
  VISUAL_TARGET_REGISTRY,
  VISUAL_TARGETS,
  type GlslUniformTargetDefinition,
  type VisualTargetDefinition
} from '../../render/index.js';
import type { TranslationKey } from '../i18n/index.js';
import {
  resolveSemanticDescriptor,
  safeSemanticId,
  type DescriptorResolutionOptions,
  type ResolvedUiSemanticDescriptor,
  type UiSemanticCategory,
  type UiSemanticDescriptor,
  type UiSemanticFormatter,
  type UiSemanticTranslator,
  type UiSemanticUnit
} from './types.js';

interface TargetDescriptorSpec {
  readonly labelKey: TranslationKey;
  readonly descriptionKey: TranslationKey;
  readonly category: UiSemanticCategory;
  readonly unit: UiSemanticUnit;
  readonly formatter: UiSemanticFormatter;
  readonly technicalAlias?: string;
}

const FORMAL_TARGET_SPECS: Readonly<Record<string, TargetDescriptorSpec>> = {
  [VISUAL_TARGETS.feedbackRetention]: {
    labelKey: 'semantic.target.feedback.retention.label',
    descriptionKey: 'semantic.target.feedback.retention.description',
    category: 'feedback', unit: 'normalized', formatter: 'percent'
  },
  [VISUAL_TARGETS.feedbackDecay]: {
    labelKey: 'semantic.target.feedback.decay.label',
    descriptionKey: 'semantic.target.feedback.decay.description',
    category: 'feedback', unit: 'normalized', formatter: 'percent'
  },
  [VISUAL_TARGETS.feedbackZoom]: {
    labelKey: 'semantic.target.feedback.zoom.label',
    descriptionKey: 'semantic.target.feedback.zoom.description',
    category: 'feedback', unit: 'ratio', formatter: 'multiplier'
  },
  [VISUAL_TARGETS.feedbackRotation]: {
    labelKey: 'semantic.target.feedback.rotation.label',
    descriptionKey: 'semantic.target.feedback.rotation.description',
    category: 'feedback', unit: 'radians', formatter: 'degrees'
  },
  [VISUAL_TARGETS.blockSize]: {
    labelKey: 'semantic.target.blockDamage.blockSize.label',
    descriptionKey: 'semantic.target.blockDamage.blockSize.description',
    category: 'block-damage', unit: 'viewport-fraction', formatter: 'percent'
  },
  [VISUAL_TARGETS.blockDisplacementX]: {
    labelKey: 'semantic.target.blockDamage.displacementX.label',
    descriptionKey: 'semantic.target.blockDamage.displacementX.description',
    category: 'block-damage', unit: 'normalized', formatter: 'signed-percent'
  },
  [VISUAL_TARGETS.blockSpawnProbability]: {
    labelKey: 'semantic.target.blockDamage.spawnProbability.label',
    descriptionKey: 'semantic.target.blockDamage.spawnProbability.description',
    category: 'block-damage', unit: 'normalized', formatter: 'percent'
  },
  [VISUAL_TARGETS.blockLifetime]: {
    labelKey: 'semantic.target.blockDamage.lifetime.label',
    descriptionKey: 'semantic.target.blockDamage.lifetime.description',
    category: 'block-damage', unit: 'seconds', formatter: 'duration'
  },
  [VISUAL_TARGETS.rgbDistance]: {
    labelKey: 'semantic.target.rgbSplit.distance.label',
    descriptionKey: 'semantic.target.rgbSplit.distance.description',
    category: 'rgb-split', unit: 'viewport-fraction', formatter: 'percent'
  },
  [VISUAL_TARGETS.rgbAngle]: {
    labelKey: 'semantic.target.rgbSplit.angle.label',
    descriptionKey: 'semantic.target.rgbSplit.angle.description',
    category: 'rgb-split', unit: 'radians', formatter: 'degrees'
  },
  [VISUAL_TARGETS.rgbDecay]: {
    labelKey: 'semantic.target.rgbSplit.decay.label',
    descriptionKey: 'semantic.target.rgbSplit.decay.description',
    category: 'rgb-split', unit: 'normalized', formatter: 'percent',
    technicalAlias: 'Decay'
  },
  [VISUAL_TARGETS.scanlineDepth]: {
    labelKey: 'semantic.target.scanlineGrain.scanlineDepth.label',
    descriptionKey: 'semantic.target.scanlineGrain.scanlineDepth.description',
    category: 'texture', unit: 'normalized', formatter: 'percent'
  },
  [VISUAL_TARGETS.grainDensity]: {
    labelKey: 'semantic.target.scanlineGrain.grainDensity.label',
    descriptionKey: 'semantic.target.scanlineGrain.grainDensity.description',
    category: 'texture', unit: 'normalized', formatter: 'percent'
  },
  [VISUAL_TARGETS.grainContrast]: {
    labelKey: 'semantic.target.scanlineGrain.grainContrast.label',
    descriptionKey: 'semantic.target.scanlineGrain.grainContrast.description',
    category: 'texture', unit: 'ratio', formatter: 'multiplier'
  },
  [VISUAL_TARGETS.dropoutProbability]: {
    labelKey: 'semantic.target.signalLoss.dropoutProbability.label',
    descriptionKey: 'semantic.target.signalLoss.dropoutProbability.description',
    category: 'signal-loss', unit: 'normalized', formatter: 'percent'
  },
  [VISUAL_TARGETS.dropoutOpacity]: {
    labelKey: 'semantic.target.signalLoss.dropoutOpacity.label',
    descriptionKey: 'semantic.target.signalLoss.dropoutOpacity.description',
    category: 'signal-loss', unit: 'normalized', formatter: 'percent'
  },
  [VISUAL_TARGETS.whiteTearBrightness]: {
    labelKey: 'semantic.target.signalLoss.whiteTearBrightness.label',
    descriptionKey: 'semantic.target.signalLoss.whiteTearBrightness.description',
    category: 'signal-loss', unit: 'normalized', formatter: 'percent'
  },
  [VISUAL_TARGETS.colorBrightness]: {
    labelKey: 'semantic.target.color.brightness.label',
    descriptionKey: 'semantic.target.color.brightness.description',
    category: 'color', unit: 'normalized', formatter: 'percent'
  },
  [VISUAL_TARGETS.colorContrast]: {
    labelKey: 'semantic.target.color.contrast.label',
    descriptionKey: 'semantic.target.color.contrast.description',
    category: 'color', unit: 'ratio', formatter: 'multiplier'
  },
  [VISUAL_TARGETS.colorSaturation]: {
    labelKey: 'semantic.target.color.saturation.label',
    descriptionKey: 'semantic.target.color.saturation.description',
    category: 'color', unit: 'ratio', formatter: 'multiplier'
  },
  [VISUAL_TARGETS.colorFlashStrength]: {
    labelKey: 'semantic.target.color.flashStrength.label',
    descriptionKey: 'semantic.target.color.flashStrength.description',
    category: 'color', unit: 'normalized', formatter: 'percent'
  }
};

const bindingsByTarget = new Map(
  FORMAL_TARGET_UNIFORM_BINDINGS.map(binding => [binding.targetId, binding])
);

export const FORMAL_TARGET_DESCRIPTORS: readonly UiSemanticDescriptor[] =
  Object.freeze(VISUAL_TARGET_REGISTRY.map(definition => {
    const spec = FORMAL_TARGET_SPECS[definition.id];
    if (!spec) {
      throw new Error(`Missing formal Target descriptor spec: ${definition.id}`);
    }
    const binding = bindingsByTarget.get(definition.id);
    return Object.freeze({
      id: definition.id,
      kind: 'target',
      classification: 'formal',
      labelKey: spec.labelKey,
      descriptionKey: spec.descriptionKey,
      category: spec.category,
      unit: spec.unit,
      formatter: spec.formatter,
      technicalAlias: [
        spec.technicalAlias ?? definition.label,
        binding?.uniformName
      ].filter(Boolean).join(' · ')
    } satisfies UiSemanticDescriptor);
  }));

const legacyDescriptors = [
  {
    id: VISUAL_TARGETS.alpha,
    labelKey: 'semantic.target.visual.alpha.label',
    descriptionKey: 'semantic.target.visual.alpha.description',
    unit: 'normalized', formatter: 'percent', technicalAlias: 'uAlpha'
  },
  {
    id: VISUAL_TARGETS.brightness,
    labelKey: 'semantic.target.visual.brightness.label',
    descriptionKey: 'semantic.target.visual.brightness.description',
    unit: 'normalized', formatter: 'percent', technicalAlias: 'visual.brightness'
  },
  {
    id: VISUAL_TARGETS.scale,
    labelKey: 'semantic.target.visual.scale.label',
    descriptionKey: 'semantic.target.visual.scale.description',
    unit: 'ratio', formatter: 'multiplier', technicalAlias: 'visual.scale'
  }
] as const;

export const LEGACY_TARGET_DESCRIPTORS: readonly UiSemanticDescriptor[] =
  Object.freeze(legacyDescriptors.map(spec => Object.freeze({
    ...spec,
    kind: 'target',
    classification: 'legacy-fallback',
    category: 'compatibility'
  } satisfies UiSemanticDescriptor)));

export const STATIC_TARGET_DESCRIPTORS: readonly UiSemanticDescriptor[] =
  Object.freeze([
    ...FORMAL_TARGET_DESCRIPTORS,
    ...LEGACY_TARGET_DESCRIPTORS
  ]);

export const TARGET_DESCRIPTOR_CATALOG: Readonly<Record<string, UiSemanticDescriptor>> =
  Object.freeze(Object.fromEntries(
    STATIC_TARGET_DESCRIPTORS.map(descriptor => [descriptor.id, descriptor])
  ));

function isRegisteredGlslTarget(
  id: string,
  definition: VisualTargetDefinition | undefined
): definition is GlslUniformTargetDefinition {
  if (!definition || definition.module !== 'Custom(GLSL)') return false;
  const candidate = definition as GlslUniformTargetDefinition;
  return (
    candidate.id === id &&
    typeof candidate.uniformName === 'string' &&
    (
      candidate.uniformType === 'float' ||
      candidate.uniformType === 'int' ||
      candidate.uniformType === 'bool'
    ) &&
    id === `glsl:${candidate.uniformName}`
  );
}

export interface TargetDescriptorResolutionOptions
  extends DescriptorResolutionOptions {
  /** Current active extension definitions supplied by the owning Registry. */
  readonly extensionDefinitions?: readonly VisualTargetDefinition[];
}

export function resolveTargetDescriptor(
  idInput: unknown,
  translator: UiSemanticTranslator,
  options: TargetDescriptorResolutionOptions = {}
): ResolvedUiSemanticDescriptor {
  const id = safeSemanticId(idInput);
  const stable = TARGET_DESCRIPTOR_CATALOG[id];
  if (stable) return resolveSemanticDescriptor(stable, translator);

  const activeExtension = options.extensionDefinitions
    ?.find(definition => definition.id === id);
  if (isRegisteredGlslTarget(id, activeExtension)) {
    const extension = activeExtension;
    const unit: UiSemanticUnit = extension.uniformType === 'bool'
      ? 'boolean'
      : extension.uniformType === 'int' ? 'integer' : 'scalar';
    const formatter: UiSemanticFormatter = extension.uniformType === 'bool'
      ? 'boolean'
      : extension.uniformType === 'int' ? 'integer' : 'decimal';
    const descriptor = Object.freeze({
      id,
      kind: 'target',
      classification: 'extension',
      labelKey: 'semantic.target.dynamicGlsl.label',
      descriptionKey: 'semantic.target.dynamicGlsl.description',
      category: 'custom-glsl',
      unit,
      formatter,
      technicalAlias: extension.uniformName
    } satisfies UiSemanticDescriptor);
    return resolveSemanticDescriptor(descriptor, translator, {
      id,
      label: extension.label || extension.uniformName,
      uniform: extension.uniformName
    });
  }

  options.onMissingDescriptor?.({ domain: 'target', id });
  const isGlslStyle = id.startsWith('glsl:');
  const fallback = Object.freeze({
    id,
    kind: 'target',
    classification: 'unknown',
    labelKey: isGlslStyle
      ? 'semantic.target.unknownGlsl.label'
      : 'semantic.target.unknown.label',
    descriptionKey: isGlslStyle
      ? 'semantic.target.unknownGlsl.description'
      : 'semantic.target.unknown.description',
    category: 'unknown',
    unit: 'unknown',
    formatter: 'raw',
    technicalAlias: id || '(empty)'
  } satisfies UiSemanticDescriptor);
  return resolveSemanticDescriptor(fallback, translator, { id: id || '(empty)' });
}
