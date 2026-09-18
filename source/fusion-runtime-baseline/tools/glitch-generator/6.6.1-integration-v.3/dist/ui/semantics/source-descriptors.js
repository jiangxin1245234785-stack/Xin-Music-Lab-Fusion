import { RUNTIME_SOURCE_REGISTRY } from '../../runtime/source-registry-adapter.js';
import { VISUAL_CLOCK_SOURCE_REGISTRY } from '../../runtime/control-source-registry.js';
import { resolveSemanticDescriptor, safeSemanticId } from './types.js';
const SOURCE_DESCRIPTOR_SPECS = {
    'audio.loudness': {
        labelKey: 'semantic.source.audio.loudness.label',
        descriptionKey: 'semantic.source.audio.loudness.description',
        technicalAlias: 'RMS loudness proxy'
    },
    'audio.bass': {
        labelKey: 'semantic.source.audio.bass.label',
        descriptionKey: 'semantic.source.audio.bass.description',
        technicalAlias: 'Bass · low-band energy'
    },
    'audio.mid': {
        labelKey: 'semantic.source.audio.mid.label',
        descriptionKey: 'semantic.source.audio.mid.description',
        technicalAlias: 'Mid · mid-band energy'
    },
    'audio.treble': {
        labelKey: 'semantic.source.audio.treble.label',
        descriptionKey: 'semantic.source.audio.treble.description',
        technicalAlias: 'Treble · high-band energy'
    },
    'audio.dynamicRange': {
        labelKey: 'semantic.source.audio.dynamicRange.label',
        descriptionKey: 'semantic.source.audio.dynamicRange.description',
        technicalAlias: 'P90–P10 + crest proxy'
    },
    'audio.spectralDensity': {
        labelKey: 'semantic.source.audio.spectralDensity.label',
        descriptionKey: 'semantic.source.audio.spectralDensity.description',
        technicalAlias: 'Active-bin occupancy proxy'
    },
    'audio.flux': {
        labelKey: 'semantic.source.audio.flux.label',
        descriptionKey: 'semantic.source.audio.flux.description',
        technicalAlias: 'Positive spectral flux'
    },
    'audio.flatness': {
        labelKey: 'semantic.source.audio.flatness.label',
        descriptionKey: 'semantic.source.audio.flatness.description',
        technicalAlias: 'Spectral flatness'
    },
    'audio.sharpness': {
        labelKey: 'semantic.source.audio.sharpness.label',
        descriptionKey: 'semantic.source.audio.sharpness.description',
        technicalAlias: 'High-frequency weighting proxy'
    },
    'audio.buildEnergy': {
        labelKey: 'semantic.source.audio.buildEnergy.label',
        descriptionKey: 'semantic.source.audio.buildEnergy.description',
        technicalAlias: 'Build Energy'
    },
    'audio.sectionDrive': {
        labelKey: 'semantic.source.audio.sectionDrive.label',
        descriptionKey: 'semantic.source.audio.sectionDrive.description',
        technicalAlias: 'Section Drive'
    },
    'audio.rhythmPhase': {
        labelKey: 'semantic.source.audio.rhythmPhase.label',
        descriptionKey: 'semantic.source.audio.rhythmPhase.description',
        technicalAlias: 'Rhythm Phase',
        formatter: 'phase-percent'
    },
    'audio.chordConfidence': {
        labelKey: 'semantic.source.audio.chordConfidence.label',
        descriptionKey: 'semantic.source.audio.chordConfidence.description',
        technicalAlias: 'Chord Confidence feature'
    },
    'state.silence': {
        labelKey: 'semantic.source.state.silence.label',
        descriptionKey: 'semantic.source.state.silence.description',
        technicalAlias: 'Silence'
    },
    'state.inBuild': {
        labelKey: 'semantic.source.state.inBuild.label',
        descriptionKey: 'semantic.source.state.inBuild.description',
        technicalAlias: 'In Build'
    },
    'state.inDrop': {
        labelKey: 'semantic.source.state.inDrop.label',
        descriptionKey: 'semantic.source.state.inDrop.description',
        technicalAlias: 'In Drop'
    },
    'state.inClimax': {
        labelKey: 'semantic.source.state.inClimax.label',
        descriptionKey: 'semantic.source.state.inClimax.description',
        technicalAlias: 'In Climax'
    },
    'event.onset': {
        labelKey: 'semantic.source.event.onset.label',
        descriptionKey: 'semantic.source.event.onset.description',
        technicalAlias: 'Onset'
    },
    'event.bassPeak': {
        labelKey: 'semantic.source.event.bassPeak.label',
        descriptionKey: 'semantic.source.event.bassPeak.description',
        technicalAlias: 'Bass Peak'
    },
    'event.sectionBoundary': {
        labelKey: 'semantic.source.event.sectionBoundary.label',
        descriptionKey: 'semantic.source.event.sectionBoundary.description',
        technicalAlias: 'Section Boundary'
    },
    'event.dropEnter': {
        labelKey: 'semantic.source.event.dropEnter.label',
        descriptionKey: 'semantic.source.event.dropEnter.description',
        technicalAlias: 'Drop Enter'
    },
    'event.climaxEnter': {
        labelKey: 'semantic.source.event.climaxEnter.label',
        descriptionKey: 'semantic.source.event.climaxEnter.description',
        technicalAlias: 'Climax Enter'
    },
    'event.chordChange': {
        labelKey: 'semantic.source.event.chordChange.label',
        descriptionKey: 'semantic.source.event.chordChange.description',
        technicalAlias: 'Chord Change'
    },
    'confidence.sectionBoundary': {
        labelKey: 'semantic.source.confidence.sectionBoundary.label',
        descriptionKey: 'semantic.source.confidence.sectionBoundary.description',
        technicalAlias: 'Section boundary meta.confidence'
    },
    'confidence.chord': {
        labelKey: 'semantic.source.confidence.chord.label',
        descriptionKey: 'semantic.source.confidence.chord.description',
        technicalAlias: 'Chord label meta.confidence'
    },
    'confidence.climax': {
        labelKey: 'semantic.source.confidence.climax.label',
        descriptionKey: 'semantic.source.confidence.climax.description',
        technicalAlias: 'Climax state meta.confidence'
    },
    'harmony.chordHue': {
        labelKey: 'semantic.source.harmony.chordHue.label',
        descriptionKey: 'semantic.source.harmony.chordHue.description',
        technicalAlias: 'Chord root pitch class / 12',
        formatter: 'hue-angle'
    }
};
const CONTROL_SOURCE_DESCRIPTOR_SPECS = {
    'control.visualPulse': {
        labelKey: 'semantic.source.control.visualPulse.label',
        descriptionKey: 'semantic.source.control.visualPulse.description',
        technicalAlias: 'Derived visual pulse'
    },
    'control.pulse2': {
        labelKey: 'semantic.source.control.pulse2.label',
        descriptionKey: 'semantic.source.control.pulse2.description',
        technicalAlias: 'Visual pulse modulo 2'
    },
    'control.pulse4': {
        labelKey: 'semantic.source.control.pulse4.label',
        descriptionKey: 'semantic.source.control.pulse4.description',
        technicalAlias: 'Visual pulse modulo 4'
    },
    'control.pulse8': {
        labelKey: 'semantic.source.control.pulse8.label',
        descriptionKey: 'semantic.source.control.pulse8.description',
        technicalAlias: 'Visual pulse modulo 8'
    },
    'control.pulse16': {
        labelKey: 'semantic.source.control.pulse16.label',
        descriptionKey: 'semantic.source.control.pulse16.description',
        technicalAlias: 'Visual pulse modulo 16'
    },
    'control.superCycle': {
        labelKey: 'semantic.source.control.superCycle.label',
        descriptionKey: 'semantic.source.control.superCycle.description',
        technicalAlias: 'Visual pulse modulo 128'
    }
};
function categoryFor(group) {
    switch (group) {
        case 'continuous': return 'continuous';
        case 'state': return 'state';
        case 'event': return 'event';
        case 'confidence': return 'confidence';
        case 'harmony': return 'harmony';
    }
}
const runtimeDescriptors = RUNTIME_SOURCE_REGISTRY.map(definition => {
    const spec = SOURCE_DESCRIPTOR_SPECS[definition.sourceId];
    return Object.freeze({
        id: definition.sourceId,
        kind: 'source',
        classification: 'stable',
        labelKey: spec.labelKey,
        descriptionKey: spec.descriptionKey,
        category: categoryFor(definition.group),
        unit: 'normalized',
        formatter: spec.formatter ?? 'percent',
        technicalAlias: spec.technicalAlias
    });
});
const controlDescriptors = VISUAL_CLOCK_SOURCE_REGISTRY.map(definition => {
    const spec = CONTROL_SOURCE_DESCRIPTOR_SPECS[definition.sourceId];
    return Object.freeze({
        id: definition.sourceId,
        kind: 'source',
        classification: 'stable',
        labelKey: spec.labelKey,
        descriptionKey: spec.descriptionKey,
        category: 'derived-control',
        unit: 'normalized',
        formatter: 'percent',
        technicalAlias: spec.technicalAlias
    });
});
export const SOURCE_DESCRIPTORS = Object.freeze([...runtimeDescriptors, ...controlDescriptors]);
export const SOURCE_DESCRIPTOR_CATALOG = Object.freeze(Object.fromEntries(SOURCE_DESCRIPTORS.map(descriptor => [descriptor.id, descriptor])));
export function resolveSourceDescriptor(idInput, translator, options = {}) {
    const id = safeSemanticId(idInput);
    const stable = SOURCE_DESCRIPTOR_CATALOG[id];
    if (stable)
        return resolveSemanticDescriptor(stable, translator);
    const node = options.node;
    const nodeId = id.startsWith('node:') ? id.slice('node:'.length) : '';
    if (nodeId) {
        const matchingNode = node?.nodeId === nodeId ? node : undefined;
        const descriptor = Object.freeze({
            id,
            kind: 'source',
            classification: 'extension',
            labelKey: 'semantic.source.dynamicNode.label',
            descriptionKey: 'semantic.source.dynamicNode.description',
            category: 'dynamic',
            unit: 'normalized',
            formatter: 'percent',
            technicalAlias: `${matchingNode?.kind ?? 'node'}:${nodeId}`
        });
        return resolveSemanticDescriptor(descriptor, translator, {
            id,
            label: matchingNode?.label?.trim() || nodeId
        });
    }
    options.onMissingDescriptor?.({ domain: 'source', id });
    const fallback = Object.freeze({
        id,
        kind: 'source',
        classification: 'unknown',
        labelKey: 'semantic.source.unknown.label',
        descriptionKey: 'semantic.source.unknown.description',
        category: 'unknown',
        unit: 'unknown',
        formatter: 'raw',
        technicalAlias: id || '(empty)'
    });
    return resolveSemanticDescriptor(fallback, translator, { id: id || '(empty)' });
}
//# sourceMappingURL=source-descriptors.js.map