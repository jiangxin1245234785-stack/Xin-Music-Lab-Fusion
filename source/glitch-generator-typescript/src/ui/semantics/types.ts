import type {
  LocaleController,
  SupportedLocale,
  TranslationKey,
  TranslationParams
} from '../i18n/index.js';

export type UiSemanticKind =
  | 'source'
  | 'target'
  | 'operation'
  | 'envelope'
  | 'gate'
  | 'status';

export type UiSemanticClassification =
  | 'stable'
  | 'formal'
  | 'legacy-fallback'
  | 'extension'
  | 'unknown';

export type UiSemanticCategory =
  | 'continuous'
  | 'state'
  | 'event'
  | 'confidence'
  | 'harmony'
  | 'derived-control'
  | 'feedback'
  | 'block-damage'
  | 'rgb-split'
  | 'texture'
  | 'signal-loss'
  | 'color'
  | 'custom-glsl'
  | 'compatibility'
  | 'mixer-step'
  | 'mapping-operation'
  | 'envelope-stage'
  | 'gate-state'
  | 'gate-parameter'
  | 'mapping-kind'
  | 'mapping-polarity'
  | 'event-retrigger'
  | 'event-policy'
  | 'mapping-status'
  | 'target-status'
  | 'dynamic'
  | 'unknown';

export type UiSemanticUnit =
  | 'normalized'
  | 'ratio'
  | 'radians'
  | 'seconds'
  | 'milliseconds'
  | 'viewport-fraction'
  | 'scalar'
  | 'integer'
  | 'boolean'
  | 'none'
  | 'unknown';

export type UiSemanticFormatter =
  | 'percent'
  | 'signed-percent'
  | 'phase-percent'
  | 'hue-angle'
  | 'multiplier'
  | 'degrees'
  | 'duration'
  | 'milliseconds'
  | 'decimal'
  | 'integer'
  | 'boolean'
  | 'raw';

export interface UiSemanticDescriptor {
  readonly id: string;
  readonly kind: UiSemanticKind;
  readonly classification: UiSemanticClassification;
  readonly labelKey: TranslationKey;
  readonly descriptionKey: TranslationKey;
  readonly category: UiSemanticCategory;
  readonly unit: UiSemanticUnit;
  readonly formatter: UiSemanticFormatter;
  readonly technicalAlias?: string;
}

/** Render label/description as textContent; raw extension IDs are not HTML. */
export interface ResolvedUiSemanticDescriptor
  extends UiSemanticDescriptor {
  readonly label: string;
  readonly description: string;
}

export type UiSemanticTranslator = Pick<LocaleController, 't'>;

export type MissingDescriptorDomain =
  | 'source'
  | 'target'
  | 'operation';

export interface MissingDescriptorDiagnostic {
  readonly domain: MissingDescriptorDomain;
  readonly id: string;
}

export type MissingDescriptorHandler = (
  diagnostic: MissingDescriptorDiagnostic
) => void;

export function createDeduplicatingMissingDescriptorHandler(
  handler: MissingDescriptorHandler
): MissingDescriptorHandler {
  const reported = new Set<string>();
  return diagnostic => {
    const key = `${diagnostic.domain}:${diagnostic.id}`;
    if (reported.has(key)) return;
    reported.add(key);
    handler(diagnostic);
  };
}

export interface DescriptorResolutionOptions {
  readonly onMissingDescriptor?: MissingDescriptorHandler;
}

export function safeSemanticId(input: unknown): string {
  if (typeof input === 'string') return input;
  if (input === null || input === undefined) return '';
  try {
    return String(input);
  } catch {
    return '(unprintable)';
  }
}

export function resolveSemanticDescriptor(
  descriptor: UiSemanticDescriptor,
  translator: UiSemanticTranslator,
  params?: TranslationParams
): ResolvedUiSemanticDescriptor {
  return Object.freeze({
    ...descriptor,
    label: translator.t(descriptor.labelKey, params),
    description: translator.t(descriptor.descriptionKey, params)
  });
}

function finite(value: number): number | null {
  return Number.isFinite(value) ? value : null;
}

function fixed(value: number, digits: number): string {
  const normalized = Object.is(value, -0) ? 0 : value;
  return normalized
    .toFixed(digits)
    .replace(/\.0+$/, '')
    .replace(/(\.\d*?)0+$/, '$1');
}

export function formatSemanticValue(
  descriptor: Pick<UiSemanticDescriptor, 'formatter'>,
  input: number,
  locale: SupportedLocale = 'zh-CN'
): string {
  const value = finite(input);
  if (value === null) return '—';
  switch (descriptor.formatter) {
    case 'percent':
    case 'phase-percent':
      return `${fixed(value * 100, 1)}%`;
    case 'signed-percent': {
      const percent = value * 100;
      return `${percent > 0 ? '+' : ''}${fixed(percent, 1)}%`;
    }
    case 'hue-angle': {
      const turns = ((value % 1) + 1) % 1;
      return `${fixed(turns * 360, 1)}°`;
    }
    case 'multiplier':
      return `${fixed(value, 2)}×`;
    case 'degrees':
      return `${fixed(value * 180 / Math.PI, 1)}°`;
    case 'duration':
      return Math.abs(value) < 1
        ? `${fixed(value * 1000, 0)} ms`
        : `${fixed(value, 2)} s`;
    case 'milliseconds':
      return `${fixed(value, 0)} ms`;
    case 'decimal':
      return fixed(value, 3);
    case 'integer':
      return fixed(Math.round(value), 0);
    case 'boolean':
      return value >= 0.5
        ? locale === 'zh-CN' ? '开' : 'On'
        : locale === 'zh-CN' ? '关' : 'Off';
    case 'raw':
      return String(value);
  }
}
