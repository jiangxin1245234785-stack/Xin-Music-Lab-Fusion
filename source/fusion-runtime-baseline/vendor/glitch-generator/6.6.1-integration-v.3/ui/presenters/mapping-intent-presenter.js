import { createEventEnvelope, createMappingCard } from '../../schema/defaults.js';
import { formatSemanticValue, resolveOperationDescriptor, resolveSourceDescriptor, resolveTargetDescriptor } from '../semantics/index.js';
function finite(value, fallback = 0) {
    return Number.isFinite(value) ? value : fallback;
}
function fixed(value, digits = 3) {
    const normalized = Object.is(value, -0) ? 0 : finite(value);
    return normalized
        .toFixed(digits)
        .replace(/\.0+$/, '')
        .replace(/(\.\d*?)0+$/, '$1');
}
function percent(value) {
    return `${fixed(Math.max(0, Math.min(1, finite(value))) * 100, 1)}%`;
}
function amountRoleFor(amount, translator) {
    if (amount > 0)
        return translator.t('presenter.intent.amount.positive');
    if (amount < 0)
        return translator.t('presenter.intent.amount.negative');
    return translator.t('presenter.intent.amount.zero');
}
export function createMappingIntentViewModel(input) {
    if (!input.mapping) {
        return Object.freeze({
            available: false,
            summary: input.translator.t('presenter.intent.noMapping'),
            mapping: null,
            envelope: null,
            source: null,
            target: null,
            kind: null,
            operation: null,
            polarity: null,
            retrigger: null,
            gateSource: null,
            amountRole: '—',
            rangeText: '—',
            responseText: '—',
            probabilityText: '—',
            gateText: '—',
            envelopeText: '—',
            modulationCount: 0
        });
    }
    const mapping = createMappingCard(input.mapping);
    const envelope = mapping.kind === 'event'
        ? createEventEnvelope(input.envelope?.id === mapping.envelopeId
            ? input.envelope
            : { id: mapping.envelopeId })
        : null;
    const source = resolveSourceDescriptor(mapping.sourceId, input.translator, {
        ...(input.nodeSource ? { node: input.nodeSource } : {})
    });
    const target = resolveTargetDescriptor(mapping.targetId, input.translator, {
        ...(input.targetDefinitions
            ? { extensionDefinitions: input.targetDefinitions }
            : {})
    });
    const kind = resolveOperationDescriptor('mapping-kind', mapping.kind, input.translator);
    const operation = resolveOperationDescriptor('mapping-operation', mapping.replaceMode, input.translator);
    const polarity = resolveOperationDescriptor('mapping-polarity', mapping.polarity, input.translator);
    const retrigger = envelope
        ? resolveOperationDescriptor('event-retrigger', envelope.retriggerMode, input.translator)
        : null;
    const gateSource = mapping.gateSourceId
        ? resolveSourceDescriptor(mapping.gateSourceId, input.translator)
        : null;
    const amountRole = amountRoleFor(mapping.amount, input.translator);
    const locale = input.locale ?? 'zh-CN';
    const sourceThresholdText = formatSemanticValue(source, mapping.threshold, locale);
    const rangeText = `${formatSemanticValue(target, mapping.range[0], locale)} → ` +
        formatSemanticValue(target, mapping.range[1], locale);
    const responseText = `${fixed(mapping.attackMs, 0)} ms / ` +
        `${fixed(mapping.fallMs, 0)} ms`;
    const envelopeText = envelope
        ? `${envelope.id || mapping.envelopeId} · ` +
            `D ${fixed(envelope.delayMs, 0)} / A ${fixed(envelope.attackMs, 0)} / ` +
            `H ${fixed(envelope.holdMs, 0)} / D ${fixed(envelope.decayMs, 0)} / ` +
            `S ${fixed(envelope.sustain, 3)} / R ${fixed(envelope.releaseMs, 0)} / ` +
            `C ${fixed(envelope.cooldownMs, 0)} ms`
        : '—';
    const probabilityText = percent(mapping.probability);
    const gateText = gateSource
        ? `${gateSource.label} ≥ ${formatSemanticValue(gateSource, mapping.gateThreshold, locale)}`
        : '—';
    const enabledModulations = mapping.modulations.filter(item => item.enabled).length;
    let summary = mapping.kind === 'event'
        ? input.translator.t('presenter.intent.event', {
            source: source.label,
            target: target.label,
            operation: operation.label,
            polarity: polarity.label,
            amountRole,
            amount: fixed(mapping.amount),
            range: rangeText,
            envelope: envelope?.id || mapping.envelopeId || '—',
            retrigger: retrigger?.label ?? '—',
            threshold: sourceThresholdText
        })
        : input.translator.t('presenter.intent.continuous', {
            source: source.label,
            target: target.label,
            operation: operation.label,
            polarity: polarity.label,
            amountRole,
            amount: fixed(mapping.amount),
            threshold: sourceThresholdText,
            range: rangeText,
            attack: `${fixed(mapping.attackMs, 0)} ms`,
            fall: `${fixed(mapping.fallMs, 0)} ms`
        });
    if (gateSource) {
        summary += input.translator.t('presenter.intent.gate', {
            gateSource: gateSource.label,
            gateThreshold: formatSemanticValue(gateSource, mapping.gateThreshold, locale)
        });
    }
    if (mapping.probability < 1) {
        summary += input.translator.t('presenter.intent.probability', {
            probability: probabilityText
        });
    }
    if (!mapping.enabled)
        summary += input.translator.t('presenter.intent.bypassed');
    if (enabledModulations > 0) {
        summary += input.translator.t('presenter.intent.modulations', {
            count: enabledModulations
        });
    }
    return Object.freeze({
        available: true,
        summary,
        mapping,
        envelope,
        source,
        target,
        kind,
        operation,
        polarity,
        retrigger,
        gateSource,
        amountRole,
        rangeText,
        responseText,
        probabilityText,
        gateText,
        envelopeText,
        modulationCount: enabledModulations
    });
}
//# sourceMappingURL=mapping-intent-presenter.js.map