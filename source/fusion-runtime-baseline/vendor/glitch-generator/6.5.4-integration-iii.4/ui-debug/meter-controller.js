const FEATURE_KEYS = [
    'loudness',
    'bass',
    'mid',
    'treble',
    'dynamicRange',
    'spectralDensity',
    'buildEnergy',
    'sectionDrive',
    'rhythmPhase',
    'flux',
    'flatness',
    'sharpness'
];
export class FeatureMeterController {
    featureKeys;
    fills = new Map();
    values = new Map();
    constructor(root = document, featureKeys = FEATURE_KEYS) {
        this.featureKeys = featureKeys;
        for (const key of featureKeys) {
            this.fills.set(key, this.requireElement(root, `[data-meter-fill="${key}"]`));
            this.values.set(key, this.requireElement(root, `[data-meter-value="${key}"]`));
        }
    }
    render(frame) {
        for (const key of this.featureKeys) {
            const value = Math.max(0, Math.min(1, frame[key]));
            this.fills.get(key).style.transform = `scaleX(${value.toFixed(4)})`;
            this.values.get(key).value = value.toFixed(3);
        }
    }
    requireElement(root, selector) {
        const element = root.querySelector(selector);
        if (!element)
            throw new Error(`Missing meter element: ${selector}`);
        return element;
    }
}
//# sourceMappingURL=meter-controller.js.map