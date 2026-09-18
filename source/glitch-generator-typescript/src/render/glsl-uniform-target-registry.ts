import type { VisualTargetDefinition } from './visual-targets.js';

export type GlslUniformType = 'float' | 'int' | 'bool';
export type GlslImpactCategory = 'high' | 'medium' | 'low';

export interface GlslUniformMetadata {
  readonly name?: string;
  readonly type?: GlslUniformType;
  readonly range?: readonly [number, number];
  readonly default?: number;
  readonly label?: string;
  readonly impactWeight?: number;
  readonly impactCategory?: GlslImpactCategory;
}

export interface ResolvedGlslUniformMetadata {
  readonly name: string;
  readonly type: GlslUniformType;
  readonly range: readonly [number, number];
  readonly default: number;
  readonly label: string;
  readonly impactWeight: number;
  readonly impactCategory: GlslImpactCategory;
}

export interface GlslUniformWarning {
  readonly code: 'IMPACT_WEIGHT_BELOW_RECOMMENDED';
  readonly message: string;
}

export interface GlslUniformTargetDefinition extends VisualTargetDefinition {
  readonly module: 'Custom(GLSL)';
  readonly uniformName: string;
  readonly uniformType: GlslUniformType;
  readonly impactWeight: number;
  readonly impactCategory: GlslImpactCategory;
}

export interface GlslUniformRegistration {
  readonly metadata: ResolvedGlslUniformMetadata;
  readonly target: GlslUniformTargetDefinition;
  readonly warnings: readonly GlslUniformWarning[];
}

export const GLSL_IMPACT_CATEGORY_DEFAULTS: Readonly<
  Record<GlslImpactCategory, { readonly weight: number; readonly minimum: number }>
> = Object.freeze({
  high: Object.freeze({ weight: 0.9, minimum: 0.8 }),
  medium: Object.freeze({ weight: 0.55, minimum: 0.4 }),
  low: Object.freeze({ weight: 0.2, minimum: 0.1 })
});

export const GLSL_UNIFORM_METADATA_DEFAULTS:
Readonly<Omit<ResolvedGlslUniformMetadata, 'name' | 'label'>> = Object.freeze({
  type: 'float',
  range: Object.freeze([0, 1] as const),
  default: 0,
  impactWeight: GLSL_IMPACT_CATEGORY_DEFAULTS.medium.weight,
  impactCategory: 'medium'
});

export const GLSL_ENGINE_UNIFORM_NAMES: ReadonlySet<string> = new Set([
  'uPreviousFrame',
  'uSourceFrame',
  'uSourceAvailable',
  'uHistory1',
  'uHistory2',
  'uHistory4',
  'uHistory7',
  'uHistoryAvailable',
  'uResolution',
  'uTime',
  'uAlpha',
  'uSeedPhase',
  'uFeedbackRetention',
  'uFeedbackDecay',
  'uFeedbackZoom',
  'uFeedbackRotation',
  'uBlockSize',
  'uBlockDisplacementX',
  'uBlockSpawnProbability',
  'uBlockLifetime',
  'uRgbDistance',
  'uRgbAngle',
  'uRgbDecay',
  'uScanlineDepth',
  'uGrainDensity',
  'uGrainContrast',
  'uDropoutProbability',
  'uDropoutOpacity',
  'uWhiteTearBrightness',
  'uColorBrightness',
  'uColorContrast',
  'uColorSaturation',
  'uColorFlashStrength',
  'uFrame'
]);

const GLSL_IDENTIFIER = /^[A-Za-z_][A-Za-z0-9_]*$/;

function assertFinite(value: number, field: string): void {
  if (!Number.isFinite(value)) {
    throw new Error(`${field} must be a finite number.`);
  }
}

function titleFromName(name: string): string {
  return name
    .replace(/^u_/, '')
    .replace(/([a-z0-9])([A-Z])/g, '$1 $2')
    .replaceAll('_', ' ')
    .replace(/\b\w/g, value => value.toUpperCase());
}

export function glslUniformTargetId(name: string): string {
  return `glsl:${name}`;
}

export function resolveGlslUniformMetadata(
  input: GlslUniformMetadata
): ResolvedGlslUniformMetadata {
  const name = input.name?.trim() ?? '';
  if (!GLSL_IDENTIFIER.test(name) || name.startsWith('gl_')) {
    throw new Error(
      'Uniform name must be a valid GLSL identifier and cannot use the gl_ prefix.'
    );
  }
  if (GLSL_ENGINE_UNIFORM_NAMES.has(name)) {
    throw new Error(
      `Uniform name "${name}" is reserved by the rendering engine.`
    );
  }

  const type = input.type ?? GLSL_UNIFORM_METADATA_DEFAULTS.type;
  if (type !== 'float' && type !== 'int' && type !== 'bool') {
    throw new Error(`Unsupported uniform type "${String(type)}".`);
  }

  const range = input.range ?? GLSL_UNIFORM_METADATA_DEFAULTS.range;
  const minimum = Number(range[0]);
  const maximum = Number(range[1]);
  assertFinite(minimum, 'range minimum');
  assertFinite(maximum, 'range maximum');
  if (minimum >= maximum) {
    throw new Error('Uniform range minimum must be less than maximum.');
  }

  const defaultValue = Number(
    input.default ?? GLSL_UNIFORM_METADATA_DEFAULTS.default
  );
  assertFinite(defaultValue, 'default');
  if (defaultValue < minimum || defaultValue > maximum) {
    throw new Error('Uniform default must be inside its declared range.');
  }

  if (
    type === 'int' &&
    (
      !Number.isInteger(minimum) ||
      !Number.isInteger(maximum) ||
      !Number.isInteger(defaultValue)
    )
  ) {
    throw new Error('Integer uniform range and default must be integers.');
  }
  if (
    type === 'bool' &&
    (
      minimum !== 0 ||
      maximum !== 1 ||
      (defaultValue !== 0 && defaultValue !== 1)
    )
  ) {
    throw new Error('Boolean uniforms require range 0..1 and default 0 or 1.');
  }

  const impactCategory =
    input.impactCategory ?? GLSL_UNIFORM_METADATA_DEFAULTS.impactCategory;
  const category = GLSL_IMPACT_CATEGORY_DEFAULTS[impactCategory];
  if (!category) {
    throw new Error(
      `Unsupported impact category "${String(impactCategory)}".`
    );
  }
  const impactWeight = Number(input.impactWeight ?? category.weight);
  assertFinite(impactWeight, 'impactWeight');
  if (impactWeight < 0 || impactWeight > 1) {
    throw new Error('impactWeight must be between 0 and 1.');
  }

  return Object.freeze({
    name,
    type,
    range: Object.freeze([minimum, maximum] as const),
    default: defaultValue,
    label: input.label?.trim() || titleFromName(name),
    impactWeight,
    impactCategory
  });
}

export function inspectGlslUniformImpact(
  metadata: ResolvedGlslUniformMetadata
): readonly GlslUniformWarning[] {
  const minimum =
    GLSL_IMPACT_CATEGORY_DEFAULTS[metadata.impactCategory].minimum;
  if (metadata.impactWeight >= minimum) return Object.freeze([]);
  return Object.freeze([Object.freeze({
    code: 'IMPACT_WEIGHT_BELOW_RECOMMENDED',
    message:
      `${metadata.label} is classified ${metadata.impactCategory.toUpperCase()} ` +
      `but impactWeight ${metadata.impactWeight.toFixed(2)} is below the ` +
      `recommended minimum ${minimum.toFixed(2)}.`
  })]);
}

export function coerceGlslUniformValue(
  target: GlslUniformTargetDefinition,
  input: number
): number {
  const finite = Number.isFinite(input) ? input : target.defaultValue;
  const clamped = Math.max(target.min, Math.min(target.max, finite));
  if (target.uniformType === 'bool') return clamped >= 0.5 ? 1 : 0;
  if (target.uniformType === 'int') return Math.round(clamped);
  return clamped;
}

function createRegistration(
  input: GlslUniformMetadata
): GlslUniformRegistration {
  const metadata = resolveGlslUniformMetadata(input);
  const target: GlslUniformTargetDefinition = Object.freeze({
    id: glslUniformTargetId(metadata.name),
    module: 'Custom(GLSL)',
    label: metadata.label,
    defaultValue: metadata.default,
    min: metadata.range[0],
    max: metadata.range[1],
    uniformName: metadata.name,
    uniformType: metadata.type,
    impactWeight: metadata.impactWeight,
    impactCategory: metadata.impactCategory
  });
  return Object.freeze({
    metadata,
    target,
    warnings: inspectGlslUniformImpact(metadata)
  });
}

export class GLSLUniformTargetRegistry {
  private readonly registrations = new Map<string, GlslUniformRegistration>();

  register(input: GlslUniformMetadata): GlslUniformRegistration {
    const registration = createRegistration(input);
    if (this.registrations.has(registration.metadata.name)) {
      throw new Error(
        `Uniform "${registration.metadata.name}" is already registered.`
      );
    }
    this.registrations.set(registration.metadata.name, registration);
    return registration;
  }

  replace(
    name: string,
    input: GlslUniformMetadata
  ): GlslUniformRegistration {
    if (!this.registrations.has(name)) {
      throw new Error(`Uniform "${name}" is not registered.`);
    }
    const registration = createRegistration({ ...input, name });
    this.registrations.set(name, registration);
    return registration;
  }

  remove(name: string): boolean {
    return this.registrations.delete(name);
  }

  replaceAll(
    inputs: readonly GlslUniformMetadata[]
  ): readonly GlslUniformRegistration[] {
    const staged = inputs.map(createRegistration);
    const names = new Set<string>();
    for (const registration of staged) {
      if (names.has(registration.metadata.name)) {
        throw new Error(
          `Uniform "${registration.metadata.name}" is duplicated.`
        );
      }
      names.add(registration.metadata.name);
    }
    this.registrations.clear();
    for (const registration of staged) {
      this.registrations.set(registration.metadata.name, registration);
    }
    return this.list();
  }

  clear(): void {
    this.registrations.clear();
  }

  get(name: string): GlslUniformRegistration | undefined {
    return this.registrations.get(name);
  }

  list(): readonly GlslUniformRegistration[] {
    return Object.freeze([...this.registrations.values()]);
  }

  targetDefinitions(): readonly GlslUniformTargetDefinition[] {
    return Object.freeze(this.list().map(entry => entry.target));
  }
}
