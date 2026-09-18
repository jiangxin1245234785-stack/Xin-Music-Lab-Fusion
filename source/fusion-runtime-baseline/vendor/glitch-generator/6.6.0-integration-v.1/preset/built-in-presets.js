import { VISUAL_TARGETS, createDefaultVisualValues } from '../render/visual-targets.js';
import { CURRENT_SCHEMA_VERSION } from './version.js';
export const PRODUCT_BUILTIN_PRESET_CONTRACT = 'xin.glitch-product-presets/1';
function defaultTargets() {
    return { ...createDefaultVisualValues() };
}
function deepFreeze(value) {
    if (!value || typeof value !== 'object' || Object.isFrozen(value)) {
        return value;
    }
    for (const child of Object.values(value))
        deepFreeze(child);
    return Object.freeze(value);
}
function copyPreset(preset) {
    return JSON.parse(JSON.stringify(preset));
}
export const PRODUCT_BUILTIN_PRESETS = deepFreeze({
    balanced: {
        schemaVersion: CURRENT_SCHEMA_VERSION,
        id: 'balanced',
        name: 'Balanced Motion',
        description: 'Balanced energy, color and detail response.',
        seed: 1101,
        mappings: [
            { id: 'bass-to-zoom', sourceId: 'audio.bass', targetId: VISUAL_TARGETS.feedbackZoom, range: [0.9, 1.2], curve: 1.3, attackMs: 90, fallMs: 360, priority: 50 },
            { id: 'loudness-to-brightness', sourceId: 'audio.loudness', targetId: VISUAL_TARGETS.colorBrightness, range: [0.36, 0.86], curve: 1.1, attackMs: 80, fallMs: 300, priority: 40 },
            { id: 'chord-hue-to-color', sourceId: 'harmony.chordHue', targetId: VISUAL_TARGETS.colorSaturation, gateSourceId: 'confidence.chord', gateThreshold: 0.6, range: [0.65, 1.35], curve: 1, attackMs: 140, fallMs: 520, priority: 25 },
            { id: 'mid-to-rgb', sourceId: 'audio.mid', targetId: VISUAL_TARGETS.rgbDistance, range: [0, 0.035], curve: 1.4, attackMs: 60, fallMs: 260, priority: 30 },
            { id: 'treble-to-grain', sourceId: 'audio.treble', targetId: VISUAL_TARGETS.grainDensity, range: [0.05, 0.72], curve: 0.8, attackMs: 25, fallMs: 140, priority: 20 }
        ],
        targetDefaults: {
            id: 'balanced-targets',
            values: defaultTargets()
        },
        metadata: { productCategory: 'built-in' }
    },
    fracture: {
        schemaVersion: CURRENT_SCHEMA_VERSION,
        id: 'fracture',
        name: 'Controlled Fracture',
        description: 'Broadband motion with controlled block damage.',
        seed: 2217,
        mappings: [
            { id: 'bass-to-block', sourceId: 'audio.bass', targetId: VISUAL_TARGETS.blockDisplacementX, range: [0, 0.72], curve: 1.5, attackMs: 20, fallMs: 220, priority: 60 },
            { id: 'loudness-to-spawn', sourceId: 'audio.loudness', targetId: VISUAL_TARGETS.blockSpawnProbability, range: [0.02, 0.58], curve: 1.8, attackMs: 40, fallMs: 280, priority: 50 },
            { id: 'mid-to-rotation', sourceId: 'audio.mid', targetId: VISUAL_TARGETS.feedbackRotation, range: [-0.08, 0.2], curve: 1, attackMs: 160, fallMs: 420, priority: 40 },
            { id: 'treble-to-scanline', sourceId: 'audio.treble', targetId: VISUAL_TARGETS.scanlineDepth, range: [0.04, 0.82], curve: 0.7, attackMs: 20, fallMs: 120, priority: 30 }
        ],
        targetDefaults: {
            id: 'fracture-targets',
            values: defaultTargets()
        },
        metadata: { productCategory: 'built-in' }
    },
    impact: {
        schemaVersion: CURRENT_SCHEMA_VERSION,
        id: 'impact',
        name: 'Event Impact',
        description: 'Sparse bass-peak damage with deterministic envelopes.',
        seed: 3191,
        mappings: [
            { id: 'bass-to-zoom', sourceId: 'audio.bass', targetId: VISUAL_TARGETS.feedbackZoom, range: [0.92, 1.16], curve: 1.2, attackMs: 80, fallMs: 300, priority: 30 },
            {
                id: 'bass-peak-to-displacement',
                kind: 'event',
                sourceId: 'event.bassPeak',
                targetId: VISUAL_TARGETS.blockDisplacementX,
                envelopeId: 'impact-envelope',
                range: [0, 1],
                threshold: 0.12,
                priority: 80
            }
        ],
        envelopes: [{
                id: 'impact-envelope',
                delayMs: 0,
                attackMs: 15,
                holdMs: 45,
                decayMs: 90,
                sustain: 0.35,
                releaseMs: 180,
                cooldownMs: 280,
                retriggerMode: 'restart'
            }],
        targetDefaults: {
            id: 'impact-targets',
            values: defaultTargets()
        },
        metadata: { productCategory: 'built-in' }
    }
});
export function listProductBuiltInPresets() {
    return Object.freeze(Object.entries(PRODUCT_BUILTIN_PRESETS).map(([id, preset]) => Object.freeze({
        id,
        name: String(preset.name || id),
        description: String(preset.description || ''),
        schemaVersion: Number(preset.schemaVersion),
        readOnly: true,
        category: 'built-in'
    })));
}
export function getProductBuiltInPreset(id) {
    const preset = PRODUCT_BUILTIN_PRESETS[String(id || '')];
    if (!preset)
        throw new Error('PRODUCT_PRESET_NOT_FOUND');
    return copyPreset(preset);
}
//# sourceMappingURL=built-in-presets.js.map