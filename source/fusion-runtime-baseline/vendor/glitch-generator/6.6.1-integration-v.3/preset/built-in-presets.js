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
const TEMPORAL_EXCAVATION_SHADER = `#version 300 es
precision highp float;
in vec2 vUv;
out vec4 outColor;
uniform sampler2D uPreviousFrame;
uniform sampler2D uHistory1;
uniform sampler2D uHistory2;
uniform sampler2D uHistory4;
uniform sampler2D uHistory7;
uniform float uHistoryAvailable;
uniform vec2 uResolution;
uniform float uSeedPhase;
uniform float uTemporalDepth;
uniform float uTemporalAgeBias;
uniform float uTemporalCellScale;
uniform float uTemporalBleed;

float hash21(vec2 p) {
  p = fract(p * vec2(123.34, 456.21));
  p += dot(p, p + 37.17 + uSeedPhase);
  return fract(p.x * p.y);
}

void main() {
  vec4 current = texture(uPreviousFrame, vUv);
  float cells = mix(6.0, 42.0, clamp(uTemporalCellScale, 0.0, 1.0));
  vec2 grid = vec2(cells, max(4.0, cells * uResolution.y / max(1.0, uResolution.x)));
  vec2 cell = floor(vUv * grid);
  vec2 within = fract(vUv * grid);
  float ageNoise = hash21(cell);
  float selector = mix(ageNoise, pow(ageNoise, 0.42), clamp(uTemporalAgeBias, 0.0, 1.0));
  vec2 drift = vec2(hash21(cell + 11.0) - 0.5, hash21(cell + 29.0) - 0.5);
  drift *= uTemporalBleed * 0.018;
  vec2 memoryUv = clamp(vUv + drift, 0.0, 1.0);
  vec4 memoryFrame;
  if (selector < 0.22) {
    memoryFrame = texture(uHistory1, memoryUv);
  } else if (selector < 0.48) {
    memoryFrame = texture(uHistory2, memoryUv);
  } else if (selector < 0.74) {
    memoryFrame = texture(uHistory4, memoryUv);
  } else {
    memoryFrame = texture(uHistory7, memoryUv);
  }
  float edgeDistance = min(min(within.x, 1.0 - within.x), min(within.y, 1.0 - within.y));
  float cellInterior = smoothstep(0.02, 0.18, edgeDistance);
  float readiness = smoothstep(0.08, 0.72, uHistoryAvailable);
  float excavation = clamp(uTemporalDepth, 0.0, 1.0) * readiness;
  excavation *= mix(0.72, 1.0, cellInterior) * mix(0.66, 1.0, ageNoise);
  vec3 result = mix(current.rgb, memoryFrame.rgb, excavation);
  outColor = vec4(clamp(result, 0.0, 1.0), current.a);
}`;
const RASTER_DEFLECTION_SHADER = `#version 300 es
precision highp float;
in vec2 vUv;
out vec4 outColor;
uniform sampler2D uPreviousFrame;
uniform vec2 uResolution;
uniform float uTime;
uniform float uSeedPhase;
uniform float uRasterBend;
uniform float uRasterLift;
uniform float uRasterDensity;
uniform float uRasterSync;

float hash11(float p) {
  return fract(sin(p * 91.731 + uSeedPhase * 43.11) * 43758.5453);
}

void main() {
  float rows = mix(52.0, 280.0, clamp(uRasterDensity, 0.0, 1.0));
  float row = floor(vUv.y * rows);
  float rowPhase = hash11(row);
  float carrier = sin(vUv.y * rows * 6.2831853 + rowPhase * 2.2);
  vec3 probe = texture(uPreviousFrame, vUv).rgb;
  float luma = dot(probe, vec3(0.2126, 0.7152, 0.0722));
  float slowDrift = sin(uTime * 0.37 + rowPhase * 6.2831853);
  float syncBand = smoothstep(0.78, 1.0, sin(vUv.y * 18.0 + uTime * 0.23) * 0.5 + 0.5);
  vec2 uv = vUv;
  uv.x += (luma - 0.5) * uRasterBend * 0.075 * (0.35 + 0.65 * carrier);
  uv.x += uRasterSync * syncBand * slowDrift * 0.032;
  uv.y += (luma - 0.5) * uRasterLift * 0.028;
  vec4 sampled = texture(uPreviousFrame, clamp(uv, 0.0, 1.0));
  float beam = 1.0 - 0.055 * uRasterDensity * (0.5 + 0.5 * carrier);
  outColor = vec4(clamp(sampled.rgb * beam, 0.0, 1.0), sampled.a);
}`;
const BITPLANE_DRIFT_SHADER = `#version 300 es
precision highp float;
in vec2 vUv;
out vec4 outColor;
uniform sampler2D uPreviousFrame;
uniform vec2 uResolution;
uniform float uSeedPhase;
uniform float uBitDepth;
uniform float uBitplaneMix;
uniform float uPaletteBins;
uniform float uDitherScale;

float hash21(vec2 p) {
  p = fract(p * vec2(443.8975, 397.2973));
  p += dot(p, p.yx + 19.19 + uSeedPhase);
  return fract(p.x * p.y);
}

void main() {
  vec4 current = texture(uPreviousFrame, vUv);
  float bitDepth = floor(clamp(uBitDepth, 2.0, 8.0) + 0.5);
  float levels = pow(2.0, bitDepth) - 1.0;
  float noise = hash21(floor(vUv * uResolution * 0.5)) - 0.5;
  vec3 dithered = clamp(current.rgb + noise * uDitherScale / max(3.0, levels), 0.0, 1.0);
  vec3 quantized = floor(dithered * levels + 0.5) / levels;
  float bins = max(2.0, floor(uPaletteBins + 0.5));
  float luma = dot(quantized, vec3(0.2126, 0.7152, 0.0722));
  float paletteLuma = floor(luma * (bins - 1.0) + 0.5) / (bins - 1.0);
  vec3 chroma = quantized - vec3(luma);
  vec3 palette = clamp(vec3(paletteLuma) + chroma * 0.72, 0.0, 1.0);
  vec3 result = mix(current.rgb, palette, clamp(uBitplaneMix, 0.0, 1.0));
  outColor = vec4(result, current.a);
}`;
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
    'temporal-excavation': {
        schemaVersion: CURRENT_SCHEMA_VERSION,
        id: 'temporal-excavation',
        name: 'Temporal Excavation',
        description: 'Excavates stable cells from a real eight-frame image reservoir.',
        seed: 2207,
        visualClock: {
            enabled: true,
            mode: 'auto',
            minimumConfidence: 0.5,
            refractoryMs: 100,
            divisions: [2, 4, 8, 16],
            resetOnSectionBoundary: false,
            sectionBoundaryConfidence: 0.7
        },
        mappings: [
            { id: 'te-loudness-brightness', sourceId: 'audio.loudness', targetId: VISUAL_TARGETS.colorBrightness, range: [0.62, 0.9], curve: 1.1, attackMs: 120, fallMs: 520, priority: 20 },
            { id: 'te-build-depth', sourceId: 'audio.buildEnergy', targetId: 'glsl:uTemporalDepth', range: [0.16, 0.72], curve: 1.2, attackMs: 520, fallMs: 1400, priority: 55 },
            { id: 'te-density-age', sourceId: 'audio.spectralDensity', targetId: 'glsl:uTemporalAgeBias', range: [0.18, 0.9], curve: 0.85, attackMs: 360, fallMs: 960, priority: 45 },
            { id: 'te-flux-bleed', sourceId: 'audio.flux', targetId: 'glsl:uTemporalBleed', range: [0.03, 0.42], curve: 1.35, attackMs: 70, fallMs: 380, priority: 35 },
            { id: 'te-held-cell-scale', sourceId: 'node:te-cell-hold', targetId: 'glsl:uTemporalCellScale', range: [0.15, 0.82], curve: 1, attackMs: 320, fallMs: 820, priority: 50 }
        ],
        nodeGraph: {
            nodes: [
                { id: 'te-cell-hold', kind: 'sample-hold', label: '4-pulse excavation cells', sampleMode: 'random', value: 0.42, threshold: 0.5 }
            ],
            edges: [
                { id: 'te-pulse4-cells', sourceId: 'control.pulse4', targetNodeId: 'te-cell-hold', targetPort: 'trigger' }
            ]
        },
        shaderPipeline: {
            passOrder: ['builtin-feedback', 'custom-glsl'],
            customPass: {
                enabled: true,
                label: 'Temporal Excavation · 8-frame reservoir',
                source: TEMPORAL_EXCAVATION_SHADER
            },
            uniformRegistry: [
                { name: 'uTemporalDepth', type: 'float', range: [0, 1], default: 0.28, label: 'Excavation Depth', impactWeight: 0.9, impactCategory: 'high' },
                { name: 'uTemporalAgeBias', type: 'float', range: [0, 1], default: 0.45, label: 'History Age Bias', impactWeight: 0.55, impactCategory: 'medium' },
                { name: 'uTemporalCellScale', type: 'float', range: [0, 1], default: 0.42, label: 'History Cell Scale', impactWeight: 0.55, impactCategory: 'medium' },
                { name: 'uTemporalBleed', type: 'float', range: [0, 1], default: 0.12, label: 'History Bleed', impactWeight: 0.2, impactCategory: 'low' }
            ]
        },
        targetDefaults: {
            id: 'temporal-excavation-targets',
            values: {
                ...defaultTargets(),
                [VISUAL_TARGETS.feedbackRetention]: 0.08,
                [VISUAL_TARGETS.feedbackDecay]: 0.9,
                [VISUAL_TARGETS.blockSpawnProbability]: 0,
                [VISUAL_TARGETS.blockDisplacementX]: 0,
                [VISUAL_TARGETS.rgbDistance]: 0,
                [VISUAL_TARGETS.scanlineDepth]: 0,
                [VISUAL_TARGETS.whiteTearBrightness]: 0,
                [VISUAL_TARGETS.colorFlashStrength]: 0
            }
        },
        metadata: {
            productCategory: 'experimental',
            glitchMechanism: 'temporal-excavation-v1'
        }
    },
    'raster-deflection': {
        schemaVersion: CURRENT_SCHEMA_VERSION,
        id: 'raster-deflection',
        name: 'Raster Deflection',
        description: 'Bends scan trajectories with luminance and slow sync drift.',
        seed: 3191,
        visualClock: {
            enabled: true,
            mode: 'auto',
            minimumConfidence: 0.5,
            refractoryMs: 100,
            divisions: [2, 4, 8, 16],
            resetOnSectionBoundary: false,
            sectionBoundaryConfidence: 0.7
        },
        mappings: [
            { id: 'rd-bass-bend', sourceId: 'audio.bass', targetId: 'glsl:uRasterBend', range: [0.08, 0.72], curve: 1.3, attackMs: 110, fallMs: 480, priority: 55 },
            { id: 'rd-mid-lift', sourceId: 'audio.mid', targetId: 'glsl:uRasterLift', range: [0.03, 0.56], curve: 1.1, attackMs: 160, fallMs: 620, priority: 45 },
            { id: 'rd-section-sync', sourceId: 'audio.sectionDrive', targetId: 'glsl:uRasterSync', range: [-0.24, 0.24], curve: 1, attackMs: 620, fallMs: 1500, priority: 35 },
            { id: 'rd-held-density', sourceId: 'node:rd-density-hold', targetId: 'glsl:uRasterDensity', range: [0.2, 0.88], curve: 1, attackMs: 420, fallMs: 980, priority: 50 },
            { id: 'rd-loudness-brightness', sourceId: 'audio.loudness', targetId: VISUAL_TARGETS.colorBrightness, range: [0.62, 0.9], curve: 1.05, attackMs: 120, fallMs: 460, priority: 20 }
        ],
        nodeGraph: {
            nodes: [
                { id: 'rd-density-hold', kind: 'sample-hold', label: '8-pulse raster density', sampleMode: 'random', value: 0.5, threshold: 0.5 }
            ],
            edges: [
                { id: 'rd-pulse8-density', sourceId: 'control.pulse8', targetNodeId: 'rd-density-hold', targetPort: 'trigger' }
            ]
        },
        shaderPipeline: {
            passOrder: ['builtin-feedback', 'custom-glsl'],
            customPass: {
                enabled: true,
                label: 'Raster Deflection · luminance scan field',
                source: RASTER_DEFLECTION_SHADER
            },
            uniformRegistry: [
                { name: 'uRasterBend', type: 'float', range: [0, 1], default: 0.24, label: 'Raster Bend', impactWeight: 0.9, impactCategory: 'high' },
                { name: 'uRasterLift', type: 'float', range: [0, 1], default: 0.18, label: 'Luminance Lift', impactWeight: 0.55, impactCategory: 'medium' },
                { name: 'uRasterDensity', type: 'float', range: [0, 1], default: 0.5, label: 'Raster Density', impactWeight: 0.55, impactCategory: 'medium' },
                { name: 'uRasterSync', type: 'float', range: [-0.5, 0.5], default: 0, label: 'Sync Drift', impactWeight: 0.2, impactCategory: 'low' }
            ]
        },
        targetDefaults: {
            id: 'raster-deflection-targets',
            values: {
                ...defaultTargets(),
                [VISUAL_TARGETS.feedbackRetention]: 0.04,
                [VISUAL_TARGETS.feedbackDecay]: 0.9,
                [VISUAL_TARGETS.blockSpawnProbability]: 0,
                [VISUAL_TARGETS.blockDisplacementX]: 0,
                [VISUAL_TARGETS.rgbDistance]: 0,
                [VISUAL_TARGETS.scanlineDepth]: 0,
                [VISUAL_TARGETS.whiteTearBrightness]: 0,
                [VISUAL_TARGETS.colorFlashStrength]: 0
            }
        },
        metadata: {
            productCategory: 'experimental',
            glitchMechanism: 'raster-deflection-v1'
        }
    },
    'bitplane-drift': {
        schemaVersion: CURRENT_SCHEMA_VERSION,
        id: 'bitplane-drift',
        name: 'Bitplane Drift',
        description: 'Rebuilds tone through held bit depth, palette bins and stable dither.',
        seed: 4219,
        visualClock: {
            enabled: true,
            mode: 'auto',
            minimumConfidence: 0.5,
            refractoryMs: 100,
            divisions: [2, 4, 8, 16],
            resetOnSectionBoundary: false,
            sectionBoundaryConfidence: 0.7
        },
        mappings: [
            { id: 'bd-flatness-mix', sourceId: 'audio.flatness', targetId: 'glsl:uBitplaneMix', range: [0.14, 0.8], curve: 0.8, attackMs: 180, fallMs: 720, priority: 55 },
            { id: 'bd-density-palette', sourceId: 'audio.spectralDensity', targetId: 'glsl:uPaletteBins', range: [3, 10], curve: 0.9, attackMs: 380, fallMs: 1000, priority: 45 },
            { id: 'bd-treble-dither', sourceId: 'audio.treble', targetId: 'glsl:uDitherScale', range: [0.03, 0.46], curve: 1.15, attackMs: 90, fallMs: 420, priority: 35 },
            { id: 'bd-held-depth', sourceId: 'node:bd-depth-hold', targetId: 'glsl:uBitDepth', range: [3, 7], curve: 1, attackMs: 360, fallMs: 900, priority: 50 },
            { id: 'bd-loudness-brightness', sourceId: 'audio.loudness', targetId: VISUAL_TARGETS.colorBrightness, range: [0.64, 0.92], curve: 1.05, attackMs: 130, fallMs: 520, priority: 20 }
        ],
        nodeGraph: {
            nodes: [
                { id: 'bd-depth-hold', kind: 'sample-hold', label: '4-pulse bit depth', sampleMode: 'random', value: 0.58, threshold: 0.5 }
            ],
            edges: [
                { id: 'bd-pulse4-depth', sourceId: 'control.pulse4', targetNodeId: 'bd-depth-hold', targetPort: 'trigger' }
            ]
        },
        shaderPipeline: {
            passOrder: ['builtin-feedback', 'custom-glsl'],
            customPass: {
                enabled: true,
                label: 'Bitplane Drift · stable palette quantizer',
                source: BITPLANE_DRIFT_SHADER
            },
            uniformRegistry: [
                { name: 'uBitDepth', type: 'float', range: [2, 8], default: 5, label: 'Bit Depth', impactWeight: 0.9, impactCategory: 'high' },
                { name: 'uBitplaneMix', type: 'float', range: [0, 1], default: 0.38, label: 'Bitplane Mix', impactWeight: 0.55, impactCategory: 'medium' },
                { name: 'uPaletteBins', type: 'float', range: [2, 12], default: 6, label: 'Palette Bins', impactWeight: 0.55, impactCategory: 'medium' },
                { name: 'uDitherScale', type: 'float', range: [0, 1], default: 0.16, label: 'Stable Dither', impactWeight: 0.2, impactCategory: 'low' }
            ]
        },
        targetDefaults: {
            id: 'bitplane-drift-targets',
            values: {
                ...defaultTargets(),
                [VISUAL_TARGETS.feedbackRetention]: 0.03,
                [VISUAL_TARGETS.feedbackDecay]: 0.9,
                [VISUAL_TARGETS.blockSpawnProbability]: 0,
                [VISUAL_TARGETS.blockDisplacementX]: 0,
                [VISUAL_TARGETS.rgbDistance]: 0,
                [VISUAL_TARGETS.scanlineDepth]: 0,
                [VISUAL_TARGETS.whiteTearBrightness]: 0,
                [VISUAL_TARGETS.colorFlashStrength]: 0
            }
        },
        metadata: {
            productCategory: 'experimental',
            glitchMechanism: 'bitplane-drift-v1'
        }
    },
    'quantized-memory': {
        schemaVersion: CURRENT_SCHEMA_VERSION,
        id: 'quantized-memory',
        name: 'Quantized Memory',
        description: 'Layered 2/4/8/16 visual timing with held, seeded damage states.',
        seed: 481516,
        visualClock: {
            enabled: true,
            mode: 'auto',
            minimumConfidence: 0.5,
            refractoryMs: 100,
            divisions: [2, 4, 8, 16],
            resetOnSectionBoundary: false,
            sectionBoundaryConfidence: 0.7
        },
        mappings: [
            { id: 'qm-loudness-brightness', sourceId: 'audio.loudness', targetId: VISUAL_TARGETS.colorBrightness, range: [0.5, 0.8], curve: 1.15, attackMs: 100, fallMs: 420, priority: 20 },
            { id: 'qm-density-saturation', sourceId: 'audio.spectralDensity', targetId: VISUAL_TARGETS.colorSaturation, range: [0.8, 1.3], curve: 0.9, attackMs: 180, fallMs: 560, priority: 20 },
            { id: 'qm-section-memory', sourceId: 'audio.sectionDrive', targetId: VISUAL_TARGETS.feedbackRetention, range: [0.78, 0.91], curve: 1.2, attackMs: 420, fallMs: 1200, priority: 30 },
            { id: 'qm-build-decay', sourceId: 'audio.buildEnergy', targetId: VISUAL_TARGETS.feedbackDecay, range: [0.9, 0.97], curve: 1.25, attackMs: 480, fallMs: 1400, priority: 30 },
            { id: 'qm-flux-texture', sourceId: 'audio.flux', targetId: VISUAL_TARGETS.grainContrast, range: [0.12, 0.9], curve: 1.4, attackMs: 35, fallMs: 260, priority: 25 },
            { id: 'qm-flatness-grain', sourceId: 'audio.flatness', targetId: VISUAL_TARGETS.grainDensity, range: [0.08, 0.42], curve: 0.8, attackMs: 80, fallMs: 360, priority: 20 },
            { id: 'qm-direction-hold-map', sourceId: 'node:qm-direction-hold', targetId: VISUAL_TARGETS.blockDisplacementX, range: [-0.38, 0.38], curve: 1, attackMs: 45, fallMs: 180, priority: 45 },
            { id: 'qm-rgb-angle-hold-map', sourceId: 'node:qm-rgb-angle-hold', targetId: VISUAL_TARGETS.rgbAngle, range: [-3.141592653589793, 3.141592653589793], curve: 1, attackMs: 100, fallMs: 320, priority: 45 },
            { id: 'qm-feedback-drift-map', sourceId: 'node:qm-feedback-drift-hold', targetId: VISUAL_TARGETS.feedbackRotation, range: [-0.045, 0.045], curve: 1, attackMs: 420, fallMs: 1000, priority: 45 },
            { id: 'qm-damage-scale-map', sourceId: 'node:qm-damage-scale-hold', targetId: VISUAL_TARGETS.blockSize, range: [0.05, 0.22], curve: 1, attackMs: 260, fallMs: 700, priority: 45 },
            {
                id: 'qm-bass-spawn',
                kind: 'event',
                sourceId: 'event.bassPeak',
                targetId: VISUAL_TARGETS.blockSpawnProbability,
                envelopeId: 'qm-damage-envelope',
                range: [0.02, 0.62],
                threshold: 0.15,
                priority: 80
            },
            {
                id: 'qm-bass-zoom',
                kind: 'event',
                sourceId: 'event.bassPeak',
                targetId: VISUAL_TARGETS.feedbackZoom,
                envelopeId: 'qm-damage-envelope',
                range: [1, 1.07],
                threshold: 0.15,
                priority: 65
            },
            {
                id: 'qm-onset-rgb',
                kind: 'event',
                sourceId: 'event.onset',
                targetId: VISUAL_TARGETS.rgbDistance,
                envelopeId: 'qm-onset-envelope',
                range: [0, 0.055],
                threshold: 0.12,
                priority: 75
            },
            {
                id: 'qm-onset-tear',
                kind: 'event',
                sourceId: 'event.onset',
                targetId: VISUAL_TARGETS.whiteTearBrightness,
                envelopeId: 'qm-tear-envelope',
                range: [0, 0.7],
                threshold: 0.2,
                priority: 90,
                probability: 0.18
            }
        ],
        envelopes: [
            {
                id: 'qm-damage-envelope',
                delayMs: 0,
                attackMs: 12,
                holdMs: 45,
                decayMs: 110,
                sustain: 0.28,
                releaseMs: 240,
                cooldownMs: 120,
                retriggerMode: 'restart'
            },
            {
                id: 'qm-onset-envelope',
                delayMs: 0,
                attackMs: 8,
                holdMs: 18,
                decayMs: 55,
                sustain: 0.2,
                releaseMs: 150,
                cooldownMs: 90,
                retriggerMode: 'restart'
            },
            {
                id: 'qm-tear-envelope',
                delayMs: 0,
                attackMs: 4,
                holdMs: 12,
                decayMs: 35,
                sustain: 0,
                releaseMs: 80,
                cooldownMs: 420,
                retriggerMode: 'ignore-until-release'
            }
        ],
        nodeGraph: {
            nodes: [
                { id: 'qm-direction-hold', kind: 'sample-hold', label: '2-pulse direction', sampleMode: 'random', value: 0.5, threshold: 0.5 },
                { id: 'qm-rgb-angle-hold', kind: 'sample-hold', label: '4-pulse RGB angle', sampleMode: 'random', value: 0.5, threshold: 0.5 },
                { id: 'qm-feedback-drift-hold', kind: 'sample-hold', label: '8-pulse feedback drift', sampleMode: 'random', value: 0.5, threshold: 0.5 },
                { id: 'qm-damage-scale-hold', kind: 'sample-hold', label: '16-pulse damage scale', sampleMode: 'random', value: 0.5, threshold: 0.5 }
            ],
            edges: [
                { id: 'qm-pulse2-direction', sourceId: 'control.pulse2', targetNodeId: 'qm-direction-hold', targetPort: 'trigger' },
                { id: 'qm-pulse4-rgb', sourceId: 'control.pulse4', targetNodeId: 'qm-rgb-angle-hold', targetPort: 'trigger' },
                { id: 'qm-pulse8-feedback', sourceId: 'control.pulse8', targetNodeId: 'qm-feedback-drift-hold', targetPort: 'trigger' },
                { id: 'qm-pulse16-scale', sourceId: 'control.pulse16', targetNodeId: 'qm-damage-scale-hold', targetPort: 'trigger' }
            ]
        },
        targetDefaults: {
            id: 'quantized-memory-targets',
            values: {
                ...defaultTargets(),
                [VISUAL_TARGETS.feedbackRetention]: 0.78,
                [VISUAL_TARGETS.feedbackDecay]: 0.93,
                [VISUAL_TARGETS.blockSpawnProbability]: 0,
                [VISUAL_TARGETS.blockLifetime]: 0.48,
                [VISUAL_TARGETS.rgbDecay]: 0.87,
                [VISUAL_TARGETS.grainDensity]: 0.12,
                [VISUAL_TARGETS.scanlineDepth]: 0.06
            }
        },
        metadata: {
            productCategory: 'experimental',
            temporalGrammar: 'quantized-memory-v1'
        }
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