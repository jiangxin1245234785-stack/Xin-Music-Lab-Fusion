import type { EngineClockFrame } from '../clock/engine-clock.js';
import { createMappingCard } from '../schema/defaults.js';
import type {
  MappingCard,
  MappingPolarity,
  MappingReplaceMode
} from '../schema/types.js';
import type { MappingSourceValues } from './minimal-mapper.js';

export type MappingRandomSource = () => number;

export interface ContinuousMappingContribution {
  readonly mappingId: string;
  readonly sourceId: string;
  readonly targetId: string;
  readonly sourceValue: number;
  readonly normalizedValue: number;
  readonly polarizedValue: number;
  readonly conditionedValue: number;
  readonly value: number;
  readonly priority: number;
  readonly effectiveMagnitude: number;
  readonly gateSourceId: string;
  readonly gateThreshold: number;
  readonly polarity: MappingPolarity;
  readonly replaceMode: MappingReplaceMode;
  readonly safetyClamp: boolean;
  readonly probability: number;
  readonly probabilitySample: number;
  readonly eventVoiceCount: number;
}

interface MappingConditioningState {
  value: number;
  sourceActive: boolean;
  probabilityPassed: boolean;
  probabilitySample: number;
}

const clamp01 = (value: number): number =>
  Math.max(0, Math.min(1, Number.isFinite(value) ? value : 0));

const finiteOr = (value: number, fallback: number): number =>
  Number.isFinite(value) ? value : fallback;

function stableMappingId(mapping: MappingCard, index: number): string {
  const explicit = mapping.id?.trim();
  if (explicit) return explicit;
  return [
    'anonymous',
    mapping.sourceId ?? '',
    mapping.targetId ?? '',
    index.toString().padStart(8, '0')
  ].join(':');
}

function normalizeSource(source: number, threshold: number, curve: number): number {
  const safeThreshold = Math.max(0, Math.min(0.999999, finiteOr(threshold, 0)));
  const aboveThreshold = clamp01(
    (clamp01(source) - safeThreshold) / (1 - safeThreshold)
  );
  const safeCurve = Math.max(0.01, Math.min(16, finiteOr(curve, 1)));
  return Math.pow(aboveThreshold, safeCurve);
}

function followEnvelope(
  previous: number,
  target: number,
  attackMs: number,
  fallMs: number,
  deltaMs: number
): number {
  const durationMs = target >= previous ? attackMs : fallMs;
  const safeDuration = Math.max(0, finiteOr(durationMs, 0));
  if (safeDuration === 0) return target;
  const alpha = 1 - Math.exp(-Math.max(0, deltaMs) / safeDuration);
  return previous + (target - previous) * alpha;
}

function sampleProbability(
  probability: number,
  randomFloat: MappingRandomSource
): {
  readonly passed: boolean;
  readonly sample: number;
} {
  const safeProbability = clamp01(probability);
  if (safeProbability >= 1) return { passed: true, sample: 0 };
  if (safeProbability <= 0) return { passed: false, sample: 1 };
  const sample = clamp01(finiteOr(randomFloat(), 1));
  return {
    passed: sample < safeProbability,
    sample
  };
}

export class ContinuousMappingProcessor {
  private readonly states = new Map<string, MappingConditioningState>();

  reset(): void {
    this.states.clear();
  }

  evaluate(
    mappings: readonly MappingCard[],
    sourceValues: MappingSourceValues,
    clock: EngineClockFrame,
    randomFloat: MappingRandomSource = () => 0
  ): readonly ContinuousMappingContribution[] {
    const contributions: ContinuousMappingContribution[] = [];
    const activeIds = new Set<string>();

    mappings.forEach((input, index) => {
      const mapping = createMappingCard(input);
      const mappingId = stableMappingId(mapping, index);
      activeIds.add(mappingId);

      if (
        mapping.kind === 'event' ||
        !mapping.enabled ||
        !mapping.sourceId ||
        !mapping.targetId
      ) {
        this.states.delete(mappingId);
        return;
      }

      const sourceValue = clamp01(Number(sourceValues[mapping.sourceId] ?? 0));
      const normalizedValue = normalizeSource(
        sourceValue,
        mapping.threshold,
        mapping.curve
      );
      const previousState = this.states.get(mappingId) ?? {
        value: 0,
        sourceActive: false,
        probabilityPassed: mapping.probability >= 1,
        probabilitySample: mapping.probability >= 1 ? 0 : 1
      };
      const sourceActive = normalizedValue > 1e-9;
      if (sourceActive && !previousState.sourceActive) {
        const decision = sampleProbability(mapping.probability, randomFloat);
        previousState.probabilityPassed = decision.passed;
        previousState.probabilitySample = decision.sample;
      }
      previousState.sourceActive = sourceActive;
      const polarizedValue = mapping.polarity === 'inverted'
        ? 1 - normalizedValue
        : normalizedValue;
      const probabilityGatedValue = previousState.probabilityPassed
        ? polarizedValue
        : 0;
      const conditionedValue = followEnvelope(
        previousState.value,
        probabilityGatedValue,
        mapping.attackMs,
        mapping.fallMs,
        clock.deltaMs
      );
      previousState.value = conditionedValue;
      this.states.set(mappingId, previousState);

      const rangeStart = finiteOr(mapping.range[0], 0);
      const rangeEnd = finiteOr(mapping.range[1], 1);
      const amount = finiteOr(mapping.amount, 1);
      const value =
        (rangeStart + (rangeEnd - rangeStart) * conditionedValue) * amount;

      contributions.push({
        mappingId,
        sourceId: mapping.sourceId,
        targetId: mapping.targetId,
        sourceValue,
        normalizedValue,
        polarizedValue,
        conditionedValue,
        value,
        priority: finiteOr(mapping.priority, 0),
        effectiveMagnitude: 0,
        gateSourceId: mapping.gateSourceId,
        gateThreshold: clamp01(mapping.gateThreshold),
        polarity: mapping.polarity,
        replaceMode: mapping.replaceMode,
        safetyClamp: mapping.safetyClamp,
        probability: clamp01(mapping.probability),
        probabilitySample: previousState.probabilitySample,
        eventVoiceCount: 0
      });
    });

    for (const id of this.states.keys()) {
      if (!activeIds.has(id)) this.states.delete(id);
    }
    return contributions;
  }
}
