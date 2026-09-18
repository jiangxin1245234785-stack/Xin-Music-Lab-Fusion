export const HARMONY_ADAPTER_VERSION = '1.0.0-shadow';
const PITCH_CLASS_BY_ROOT = Object.freeze({
    C: 0,
    'B#': 0,
    'C#': 1,
    Db: 1,
    D: 2,
    'D#': 3,
    Eb: 3,
    E: 4,
    Fb: 4,
    'E#': 5,
    F: 5,
    'F#': 6,
    Gb: 6,
    G: 7,
    'G#': 8,
    Ab: 8,
    A: 9,
    'A#': 10,
    Bb: 10,
    B: 11,
    Cb: 11
});
function rootFromLabel(label) {
    if (!label)
        return null;
    const match = /^\s*([A-Ga-g])([#♯b♭]?)/.exec(label);
    if (!match)
        return null;
    const letter = (match[1] ?? '').toUpperCase();
    const accidental = (match[2] ?? '')
        .replace('♯', '#')
        .replace('♭', 'b');
    const root = `${letter}${accidental}`;
    return Object.hasOwn(PITCH_CLASS_BY_ROOT, root) ? root : null;
}
/**
 * Converts a musical chord label into a stable pitch-class hue source.
 *
 * This is deliberately an adapter output, not an implicit string-to-visual
 * mapping: MappingCards still decide whether and where the numeric hue goes.
 */
export function adaptChordLabelToHue(label) {
    const root = rootFromLabel(label);
    if (!root) {
        return Object.freeze({ hue: 0, root: null, recognized: false });
    }
    return Object.freeze({
        hue: (PITCH_CLASS_BY_ROOT[root] ?? 0) / 12,
        root,
        recognized: true
    });
}
//# sourceMappingURL=harmony-adapter.js.map