import type { EngineClockFrame } from '../clock/engine-clock.js';
import { type ContinuousMappingContribution, type EventBudgetReport, type MappingRandomSource, type MappingSourceValues } from '../mapping/index.js';
import { type VisualTargetDefinition } from '../render/visual-targets.js';
import { type PerformanceMeasureSink } from '../performance/index.js';
import type { EnergyBudgetConfig, EventEnvelope, MappingCard, ResolvedVisualTargetState, VisualTargetState } from '../schema/types.js';
export declare const TARGET_MIXER_STEPS: readonly ["base", "multiply", "add", "max-min", "replace", "gate", "energy-budget-clamp"];
export type TargetMixerStep = typeof TARGET_MIXER_STEPS[number];
export interface TargetMixerTrace {
    readonly base: ResolvedVisualTargetState;
    readonly multiply: ResolvedVisualTargetState;
    readonly add: ResolvedVisualTargetState;
    readonly maxMin: ResolvedVisualTargetState;
    readonly replace: ResolvedVisualTargetState;
    readonly gate: ResolvedVisualTargetState;
    readonly energyBudget: ResolvedVisualTargetState;
    readonly clamp: ResolvedVisualTargetState;
}
export interface TargetMixerFrame {
    readonly targets: ResolvedVisualTargetState;
    readonly contributions: readonly ContinuousMappingContribution[];
    readonly gateDecisions: readonly GateDecision[];
    readonly energyBudgetDecision: EnergyBudgetDecision;
    readonly eventBudgetReport: EventBudgetReport;
    readonly trace: TargetMixerTrace;
}
export interface EnergyBudgetDecision {
    readonly enabled: boolean;
    readonly budget: number;
    readonly rawWeightedEnergy: number;
    readonly finalWeightedEnergy: number;
    readonly attenuation: number;
    readonly activeTargets: number;
}
export interface GateDecision {
    readonly mappingId: string;
    readonly targetId: string;
    readonly sourceId: string;
    readonly sourceValue: number;
    readonly threshold: number;
    readonly open: boolean;
}
export interface TargetMixerInput {
    readonly mappings: readonly MappingCard[];
    readonly envelopes?: readonly EventEnvelope[];
    readonly sourceValues: MappingSourceValues;
    readonly baseState?: VisualTargetState;
    readonly clock: EngineClockFrame;
    readonly randomFloat?: MappingRandomSource;
    readonly energyBudget?: EnergyBudgetConfig;
    readonly targetDefinitions?: readonly VisualTargetDefinition[];
    readonly profiler?: PerformanceMeasureSink;
}
export declare class TargetMixer {
    private readonly mappings;
    private readonly events;
    reset(): void;
    mixFrame(input: TargetMixerInput): TargetMixerFrame;
}
//# sourceMappingURL=target-mixer.d.ts.map