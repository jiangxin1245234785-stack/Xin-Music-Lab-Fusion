import type { ResolvedAudioFeatureFrame } from '../schema/types.js';

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
] as const;
type MeterKey = typeof FEATURE_KEYS[number];

export class FeatureMeterController {
  private readonly fills = new Map<MeterKey, HTMLElement>();
  private readonly values = new Map<MeterKey, HTMLOutputElement>();

  constructor(
    root: ParentNode = document,
    private readonly featureKeys: readonly MeterKey[] = FEATURE_KEYS
  ) {
    for (const key of featureKeys) {
      this.fills.set(key, this.requireElement<HTMLElement>(
        root,
        `[data-meter-fill="${key}"]`
      ));
      this.values.set(key, this.requireElement<HTMLOutputElement>(
        root,
        `[data-meter-value="${key}"]`
      ));
    }
  }

  render(frame: ResolvedAudioFeatureFrame): void {
    for (const key of this.featureKeys) {
      const value = Math.max(0, Math.min(1, frame[key]));
      this.fills.get(key)!.style.transform = `scaleX(${value.toFixed(4)})`;
      this.values.get(key)!.value = value.toFixed(3);
    }
  }

  private requireElement<T extends Element>(root: ParentNode, selector: string): T {
    const element = root.querySelector<T>(selector);
    if (!element) throw new Error(`Missing meter element: ${selector}`);
    return element;
  }
}
