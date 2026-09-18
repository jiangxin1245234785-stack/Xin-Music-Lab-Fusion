import { createAudioFeatureFrame } from '../schema/defaults.js';
import type {
  AudioFeatureFrame,
  ResolvedAudioFeatureFrame
} from '../schema/types.js';

const clamp01 = (value: number): number =>
  Math.max(0, Math.min(1, Number.isFinite(value) ? value : 0));

export class EventFeatureDetector {
  private previousLoudness = 0;
  private previousBass = 0;

  reset(): void {
    this.previousLoudness = 0;
    this.previousBass = 0;
  }

  apply(input: AudioFeatureFrame): ResolvedAudioFeatureFrame {
    const frame = createAudioFeatureFrame(input);
    const loudnessRise = Math.max(0, frame.loudness - this.previousLoudness);
    const bassRise = Math.max(0, frame.bass - this.previousBass);
    const onset = clamp01((loudnessRise - 0.012) * 7.5);
    const bassPeak = frame.bass >= 0.12
      ? clamp01((bassRise - 0.008) * 8 + Math.max(0, frame.bass - 0.72) * 1.4)
      : 0;

    this.previousLoudness = frame.loudness;
    this.previousBass = frame.bass;
    return createAudioFeatureFrame({
      ...frame,
      onset,
      bassPeak
    });
  }
}
