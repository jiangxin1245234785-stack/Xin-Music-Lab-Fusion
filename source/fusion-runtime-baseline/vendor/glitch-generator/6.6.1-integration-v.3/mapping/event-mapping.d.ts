import type { EngineClockFrame } from '../clock/engine-clock.js';
import type { EventEnvelope, GlobalEventPolicy, MappingCard } from '../schema/types.js';
import type { ContinuousMappingContribution, MappingRandomSource } from './continuous-mapping.js';
import type { MappingSourceValues } from './minimal-mapper.js';
export interface EventBudgetOptions {
    readonly enabled?: boolean;
    readonly voiceLimit?: number;
    readonly globalEventPolicy?: GlobalEventPolicy;
    readonly experimentalQueueEnabled?: boolean;
}
export interface EventBudgetReport {
    readonly enabled: boolean;
    readonly voiceLimit: number;
    readonly activeVoices: number;
    readonly queuedVoices: number;
    readonly droppedTriggers: number;
    readonly evictedVoices: number;
    readonly requestedPolicy: GlobalEventPolicy;
    readonly effectivePolicy: GlobalEventPolicy;
    readonly queueExperimental: true;
    readonly queueEnabled: boolean;
}
export declare class EventMappingProcessor {
    private readonly states;
    private voiceSequence;
    private report;
    reset(): void;
    getLastBudgetReport(): EventBudgetReport;
    evaluate(mappings: readonly MappingCard[], envelopes: readonly EventEnvelope[], sourceValues: MappingSourceValues, clock: EngineClockFrame, randomFloat?: MappingRandomSource, budgetOptions?: EventBudgetOptions): readonly ContinuousMappingContribution[];
    private addVoice;
    private totalVoiceCount;
    private findLowestPriorityVoice;
}
//# sourceMappingURL=event-mapping.d.ts.map