import { VISUAL_TARGET_BY_ID, VISUAL_TARGETS } from '../render/visual-targets.js';
export const TARGET_INTENT_CONTRACT = 'xin.generator-target-intent/1';
const DIMENSIONS = Object.freeze({
    luminance: Object.freeze([
        VISUAL_TARGETS.colorBrightness,
        VISUAL_TARGETS.colorFlashStrength
    ]),
    motion: Object.freeze([
        VISUAL_TARGETS.feedbackZoom,
        VISUAL_TARGETS.feedbackRotation,
        VISUAL_TARGETS.rgbDistance,
        VISUAL_TARGETS.rgbAngle
    ]),
    texture: Object.freeze([
        VISUAL_TARGETS.scanlineDepth,
        VISUAL_TARGETS.grainDensity,
        VISUAL_TARGETS.grainContrast
    ]),
    rupture: Object.freeze([
        VISUAL_TARGETS.blockDisplacementX,
        VISUAL_TARGETS.blockSpawnProbability,
        VISUAL_TARGETS.dropoutProbability,
        VISUAL_TARGETS.whiteTearBrightness
    ]),
    color: Object.freeze([
        VISUAL_TARGETS.colorContrast,
        VISUAL_TARGETS.colorSaturation
    ])
});
function clamp01(value) {
    return Math.max(0, Math.min(1, Number.isFinite(value) ? value : 0));
}
function activityFor(targetId, value) {
    const definition = VISUAL_TARGET_BY_ID.get(targetId);
    if (!definition || !Number.isFinite(value))
        return null;
    const span = definition.max - definition.min;
    if (span <= 0)
        return 0;
    return clamp01(Math.abs(value - definition.defaultValue) / span);
}
function levelFor(activity) {
    if (activity < 0.16)
        return 'QUIET';
    if (activity < 0.5)
        return 'PRESENT';
    return 'INTENSE';
}
/**
 * Summarizes final Generator targets as semantic visual intentions.
 * It intentionally has no audio input and exposes no raw cross-engine delta.
 */
export function describeGeneratorTargetIntent(targets) {
    const dimensions = {};
    for (const [id, targetIds] of Object.entries(DIMENSIONS)) {
        const activities = targetIds
            .map(targetId => activityFor(targetId, targets.values[targetId] ?? NaN))
            .filter((activity) => activity !== null);
        const activity = activities.length
            ? activities.reduce((sum, value) => sum + value, 0) / activities.length
            : 0;
        dimensions[id] = Object.freeze({
            id,
            level: levelFor(activity),
            targetIds: Object.freeze([...targetIds])
        });
    }
    return Object.freeze({
        contract: TARGET_INTENT_CONTRACT,
        dimensions: Object.freeze(dimensions)
    });
}
//# sourceMappingURL=target-intent.js.map