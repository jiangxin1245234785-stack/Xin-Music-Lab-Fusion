import { createEventEnvelope, createMappingCard } from '../schema/defaults.js';
const clamp01 = (value) => Math.max(0, Math.min(1, Number.isFinite(value) ? value : 0));
const finiteOr = (value, fallback) => Number.isFinite(value) ? value : fallback;
function stableMappingId(mapping, index) {
    const explicit = mapping.id?.trim();
    return explicit || [
        'event',
        mapping.sourceId ?? '',
        mapping.targetId ?? '',
        index.toString().padStart(8, '0')
    ].join(':');
}
function envelopeDuration(envelope) {
    return Math.max(0, envelope.delayMs) +
        Math.max(0, envelope.attackMs) +
        Math.max(0, envelope.holdMs) +
        Math.max(0, envelope.decayMs) +
        Math.max(0, envelope.releaseMs);
}
function envelopeValue(elapsedMs, envelope) {
    let elapsed = Math.max(0, elapsedMs);
    const delay = Math.max(0, envelope.delayMs);
    if (elapsed < delay)
        return 0;
    elapsed -= delay;
    const attack = Math.max(0, envelope.attackMs);
    if (attack > 0 && elapsed < attack)
        return clamp01(elapsed / attack);
    elapsed -= attack;
    const hold = Math.max(0, envelope.holdMs);
    if (elapsed < hold)
        return 1;
    elapsed -= hold;
    const decay = Math.max(0, envelope.decayMs);
    const sustain = clamp01(envelope.sustain);
    if (decay > 0 && elapsed < decay) {
        return 1 - (1 - sustain) * elapsed / decay;
    }
    elapsed -= decay;
    const release = Math.max(0, envelope.releaseMs);
    if (release > 0 && elapsed < release) {
        return sustain * (1 - elapsed / release);
    }
    return 0;
}
function probabilityDecision(probability, randomFloat) {
    const safeProbability = clamp01(probability);
    if (safeProbability >= 1)
        return { passed: true, sample: 0 };
    if (safeProbability <= 0)
        return { passed: false, sample: 1 };
    const sample = clamp01(finiteOr(randomFloat(), 1));
    return {
        passed: sample < safeProbability,
        sample
    };
}
function normalizeBudget(options) {
    const enabled = options.enabled === true;
    const requestedPolicy = options.globalEventPolicy === 'queue'
        ? 'queue'
        : 'drop-low-priority';
    const queueEnabled = enabled &&
        requestedPolicy === 'queue' &&
        options.experimentalQueueEnabled === true;
    return {
        enabled,
        voiceLimit: enabled
            ? Math.max(0, Math.min(64, Math.floor(finiteOr(Number(options.voiceLimit), 4))))
            : Number.POSITIVE_INFINITY,
        requestedPolicy,
        effectivePolicy: queueEnabled ? 'queue' : 'drop-low-priority',
        queueEnabled
    };
}
export class EventMappingProcessor {
    states = new Map();
    voiceSequence = 0;
    report = Object.freeze({
        enabled: false,
        voiceLimit: Number.POSITIVE_INFINITY,
        activeVoices: 0,
        queuedVoices: 0,
        droppedTriggers: 0,
        evictedVoices: 0,
        requestedPolicy: 'drop-low-priority',
        effectivePolicy: 'drop-low-priority',
        queueExperimental: true,
        queueEnabled: false
    });
    reset() {
        this.states.clear();
        this.voiceSequence = 0;
    }
    getLastBudgetReport() {
        return this.report;
    }
    evaluate(mappings, envelopes, sourceValues, clock, randomFloat = () => 0, budgetOptions = {}) {
        const budget = normalizeBudget(budgetOptions);
        const contributions = [];
        const activeIds = new Set();
        let droppedTriggers = 0;
        let evictedVoices = 0;
        const entries = mappings
            .map((input, index) => {
            const mapping = createMappingCard(input);
            if (mapping.kind !== 'event')
                return null;
            const mappingId = stableMappingId(mapping, index);
            activeIds.add(mappingId);
            if (!mapping.enabled || !mapping.sourceId || !mapping.targetId) {
                this.states.delete(mappingId);
                return null;
            }
            const envelope = createEventEnvelope(envelopes.find(candidate => candidate.id === mapping.envelopeId) ?? {
                id: mapping.envelopeId
            });
            const state = this.states.get(mappingId) ?? {
                voices: [],
                queued: null,
                lastTriggerAtMs: -Infinity,
                lastSource: 0,
                probabilitySample: mapping.probability >= 1 ? 0 : 1
            };
            const durationMs = envelopeDuration(envelope);
            state.voices = state.voices.filter(voice => clock.nowMs - voice.startedAtMs < durationMs);
            this.states.set(mappingId, state);
            return {
                mapping,
                mappingId,
                envelope,
                state,
                sourceValue: clamp01(Number(sourceValues[mapping.sourceId] ?? 0))
            };
        })
            .filter((entry) => entry !== null)
            .sort((left, right) => left.mappingId.localeCompare(right.mappingId));
        for (const id of this.states.keys()) {
            if (!activeIds.has(id))
                this.states.delete(id);
        }
        if (budget.queueEnabled) {
            for (const entry of entries) {
                if (!entry.state.queued)
                    continue;
                if (this.totalVoiceCount() >= budget.voiceLimit)
                    break;
                this.addVoice(entry, entry.state.queued.triggerStrength, clock.nowMs);
                entry.state.queued = null;
                entry.state.lastTriggerAtMs = clock.nowMs;
            }
        }
        else {
            for (const entry of entries)
                entry.state.queued = null;
        }
        // Admission is intentionally a separate pass. A later, higher-priority
        // trigger may evict an earlier voice, so contributions must only be built
        // after the final deterministic voice set is known.
        for (const entry of entries) {
            const { mapping, mappingId, envelope, state, sourceValue } = entry;
            const triggerThreshold = Math.max(0.000001, Math.min(1, finiteOr(mapping.threshold, 0)));
            const risingTrigger = sourceValue >= triggerThreshold &&
                state.lastSource < triggerThreshold;
            const cooldownReady = clock.nowMs - state.lastTriggerAtMs >= Math.max(0, envelope.cooldownMs);
            const retriggerAllowed = state.voices.length === 0 ||
                envelope.retriggerMode === 'restart' ||
                envelope.retriggerMode === 'accumulate';
            if (risingTrigger && cooldownReady && retriggerAllowed) {
                const decision = probabilityDecision(mapping.probability, randomFloat);
                state.probabilitySample = decision.sample;
                if (decision.passed) {
                    if (envelope.retriggerMode === 'restart')
                        state.voices = [];
                    if (this.totalVoiceCount() < budget.voiceLimit) {
                        this.addVoice(entry, sourceValue, clock.nowMs);
                        state.lastTriggerAtMs = clock.nowMs;
                    }
                    else if (budget.queueEnabled) {
                        state.queued = {
                            queuedAtMs: clock.nowMs,
                            triggerStrength: sourceValue
                        };
                    }
                    else {
                        const lowest = this.findLowestPriorityVoice();
                        if (lowest &&
                            (mapping.priority > lowest.voice.priority ||
                                (mapping.priority === lowest.voice.priority &&
                                    mappingId.localeCompare(lowest.voice.mappingId) < 0))) {
                            lowest.state.voices = lowest.state.voices.filter(voice => voice.id !== lowest.voice.id);
                            this.addVoice(entry, sourceValue, clock.nowMs);
                            state.lastTriggerAtMs = clock.nowMs;
                            evictedVoices += 1;
                        }
                        else {
                            droppedTriggers += 1;
                        }
                    }
                }
            }
            state.lastSource = sourceValue;
        }
        for (const entry of entries) {
            const { mapping, mappingId, envelope, state, sourceValue } = entry;
            if (state.voices.length === 0)
                continue;
            const shaped = state.voices.reduce((sum, voice) => sum +
                envelopeValue(clock.nowMs - voice.startedAtMs, envelope) *
                    voice.triggerStrength, 0);
            const polarizedValue = mapping.polarity === 'inverted'
                ? Math.max(0, state.voices.length - shaped)
                : shaped;
            if (polarizedValue <= 0 &&
                state.voices.every(voice => clock.nowMs > voice.startedAtMs))
                continue;
            const rangeStart = finiteOr(mapping.range[0], 0);
            const rangeEnd = finiteOr(mapping.range[1], 1);
            const amount = finiteOr(mapping.amount, 1);
            const value = (rangeStart +
                (rangeEnd - rangeStart) * polarizedValue) * amount;
            contributions.push({
                mappingId,
                sourceId: mapping.sourceId,
                targetId: mapping.targetId,
                sourceValue,
                normalizedValue: state.voices.reduce((sum, voice) => sum + voice.triggerStrength, 0),
                polarizedValue,
                conditionedValue: polarizedValue,
                value,
                priority: finiteOr(mapping.priority, 0),
                effectiveMagnitude: 0,
                gateSourceId: mapping.gateSourceId,
                gateThreshold: clamp01(mapping.gateThreshold),
                polarity: mapping.polarity,
                replaceMode: mapping.replaceMode,
                safetyClamp: mapping.safetyClamp,
                probability: clamp01(mapping.probability),
                probabilitySample: state.probabilitySample,
                eventVoiceCount: state.voices.length
            });
        }
        this.report = Object.freeze({
            enabled: budget.enabled,
            voiceLimit: budget.voiceLimit,
            activeVoices: this.totalVoiceCount(),
            queuedVoices: entries.filter(entry => entry.state.queued !== null).length,
            droppedTriggers,
            evictedVoices,
            requestedPolicy: budget.requestedPolicy,
            effectivePolicy: budget.effectivePolicy,
            queueExperimental: true,
            queueEnabled: budget.queueEnabled
        });
        return contributions;
    }
    addVoice(entry, triggerStrength, startedAtMs) {
        entry.state.voices = [
            ...entry.state.voices,
            {
                id: this.voiceSequence++,
                mappingId: entry.mappingId,
                priority: entry.mapping.priority,
                startedAtMs,
                triggerStrength
            }
        ];
    }
    totalVoiceCount() {
        let count = 0;
        for (const state of this.states.values())
            count += state.voices.length;
        return count;
    }
    findLowestPriorityVoice() {
        let lowest = null;
        for (const state of this.states.values()) {
            for (const voice of state.voices) {
                if (lowest === null ||
                    voice.priority < lowest.voice.priority ||
                    (voice.priority === lowest.voice.priority &&
                        voice.mappingId.localeCompare(lowest.voice.mappingId) > 0) ||
                    (voice.priority === lowest.voice.priority &&
                        voice.mappingId === lowest.voice.mappingId &&
                        voice.id < lowest.voice.id)) {
                    lowest = { state, voice };
                }
            }
        }
        return lowest;
    }
}
//# sourceMappingURL=event-mapping.js.map