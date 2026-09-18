import { createPcmAudioBuffer, type PcmAudioBuffer } from '../audio/types.js';
import { createSeededPrng } from '../random/seeded-prng.js';

export interface SineBufferOptions {
  readonly frequencyHz: number;
  readonly amplitude?: number;
  readonly durationSeconds?: number;
  readonly sampleRate?: number;
}

export function createSineBuffer(options: SineBufferOptions): PcmAudioBuffer {
  const sampleRate = options.sampleRate ?? 48000;
  const durationSeconds = options.durationSeconds ?? 1;
  const amplitude = Math.max(0, Math.min(1, options.amplitude ?? 0.8));
  const length = Math.max(1, Math.round(sampleRate * durationSeconds));
  const channel = new Float32Array(length);

  for (let index = 0; index < length; index++) {
    channel[index] = amplitude * Math.sin(
      2 * Math.PI * options.frequencyHz * index / sampleRate
    );
  }
  return createPcmAudioBuffer(sampleRate, [channel]);
}

export function createValidationBuffer(
  sampleRate = 48000,
  segmentSeconds = 0.5
): PcmAudioBuffer {
  const segmentLength = Math.round(sampleRate * segmentSeconds);
  const frequencies = [0, 80, 1000, 8000, 80, 1000, 8000] as const;
  const channel = new Float32Array(segmentLength * frequencies.length);

  frequencies.forEach((frequency, segment) => {
    if (!frequency) return;
    const amplitude = segment < 4 ? 0.55 : 0.78;
    for (let index = 0; index < segmentLength; index++) {
      const envelope = Math.min(1, index / 256, (segmentLength - index) / 256);
      channel[segment * segmentLength + index] =
        amplitude * envelope * Math.sin(2 * Math.PI * frequency * index / sampleRate);
    }
  });
  return createPcmAudioBuffer(sampleRate, [channel]);
}

export function createContinuousFeatureValidationBuffer(
  sampleRate = 48_000,
  segmentSeconds = 0.5
): PcmAudioBuffer {
  const segmentLength = Math.round(sampleRate * segmentSeconds);
  const layers: readonly (readonly number[])[] = [
    [],
    [80],
    [80, 330],
    [80, 330, 880],
    [80, 330, 880, 2_100],
    [80, 330, 880, 2_100, 5_200],
    [80, 180, 330, 620, 880, 1_400, 2_100, 3_600, 5_200, 8_200],
    [80, 180, 330, 620, 880, 1_400, 2_100, 3_600, 5_200, 8_200],
    [8_200, 10_200, 12_400],
    []
  ];
  const channel = new Float32Array(segmentLength * layers.length);
  const noise = createSeededPrng(3_101, 0);

  layers.forEach((frequencies, segment) => {
    if (frequencies.length === 0 && segment !== layers.length - 1) return;
    const layerAmplitude = (0.34 + segment * 0.045) /
      Math.pow(Math.max(1, frequencies.length), 0.72);
    for (let index = 0; index < segmentLength; index++) {
      const edge = Math.min(1, index / 192, (segmentLength - index) / 192);
      const rhythmicGate = segment === layers.length - 3
        ? 0.35 + 0.65 * Math.pow(
          Math.max(0, Math.sin(2 * Math.PI * index / (sampleRate * 0.25))),
          3
        )
        : 1;
      let sample = segment === layers.length - 1
        ? (noise.nextFloat() * 2 - 1) * 0.58
        : 0;
      for (const frequency of frequencies) {
        sample += Math.sin(
          2 * Math.PI * frequency * index / sampleRate +
          frequency * 0.00017
        ) * layerAmplitude;
      }
      channel[segment * segmentLength + index] = Math.max(
        -0.95,
        Math.min(0.95, sample * edge * rhythmicGate)
      );
    }
  });

  return createPcmAudioBuffer(sampleRate, [channel]);
}

export function createStructuralSignalValidationBuffer(
  sampleRate = 48_000
): PcmAudioBuffer {
  const durationSeconds = 8;
  const channel = new Float32Array(sampleRate * durationSeconds);
  const noise = createSeededPrng(3_202, 0);
  const layers = [80, 240, 520, 1_100, 2_300, 4_800, 8_400] as const;

  for (let index = 0; index < channel.length; index++) {
    const time = index / sampleRate;
    let sample = 0;

    if (time >= 1 && time < 2) {
      sample = 0.18 * Math.sin(2 * Math.PI * 80 * time);
    } else if (time >= 2 && time < 4) {
      const progress = (time - 2) / 2;
      const activeLayers = Math.max(
        1,
        Math.min(layers.length, 1 + Math.floor(progress * layers.length))
      );
      const amplitude = (0.2 + progress * 0.42) /
        Math.pow(activeLayers, 0.72);
      for (let layer = 0; layer < activeLayers; layer++) {
        const frequency = layers[layer]!;
        sample += amplitude * Math.sin(
          2 * Math.PI * frequency * time + layer * 0.37
        );
      }
    } else if (time >= 4 && time < 5.5) {
      const amplitude = 0.64 / Math.pow(layers.length, 0.72);
      for (let layer = 0; layer < layers.length; layer++) {
        const frequency = layers[layer]!;
        sample += amplitude * Math.sin(
          2 * Math.PI * frequency * time + layer * 0.37
        );
      }
      sample += (noise.nextFloat() * 2 - 1) * 0.08;
    } else if (time >= 5.5 && time < 7) {
      sample = 0.035 * Math.sin(2 * Math.PI * 120 * time);
    } else if (time >= 7) {
      sample =
        0.16 * Math.sin(2 * Math.PI * 180 * time) +
        0.12 * Math.sin(2 * Math.PI * 880 * time);
    }
    channel[index] = Math.max(-0.95, Math.min(0.95, sample));
  }

  return createPcmAudioBuffer(sampleRate, [channel]);
}
