import type { PcmFrame } from '../audio/types.js';
import { createAudioFeatureFrame } from '../schema/defaults.js';
import type { ResolvedAudioFeatureFrame } from '../schema/types.js';

const BASS_RANGE = Object.freeze([20, 250] as const);
const MID_RANGE = Object.freeze([250, 4000] as const);
const TREBLE_RANGE = Object.freeze([4000, 16000] as const);

const clamp01 = (value: number): number => Math.max(0, Math.min(1, value));

export interface CoreFeatureObservation {
  readonly frame: ResolvedAudioFeatureFrame;
  readonly spectrum: Float64Array;
  readonly peakAmplitude: number;
}

function assertPowerOfTwo(value: number): void {
  if (value < 32 || (value & (value - 1)) !== 0) {
    throw new Error(`FFT frame length must be a power of two >= 32; received ${value}`);
  }
}

function fft(real: Float64Array, imaginary: Float64Array): void {
  const size = real.length;
  assertPowerOfTwo(size);

  for (let index = 1, reverse = 0; index < size; index++) {
    let bit = size >> 1;
    while (reverse & bit) {
      reverse ^= bit;
      bit >>= 1;
    }
    reverse ^= bit;
    if (index < reverse) {
      [real[index], real[reverse]] = [real[reverse]!, real[index]!];
      [imaginary[index], imaginary[reverse]] = [imaginary[reverse]!, imaginary[index]!];
    }
  }

  for (let length = 2; length <= size; length <<= 1) {
    const angle = -2 * Math.PI / length;
    const phaseReal = Math.cos(angle);
    const phaseImaginary = Math.sin(angle);

    for (let offset = 0; offset < size; offset += length) {
      let rotationReal = 1;
      let rotationImaginary = 0;
      for (let index = 0; index < length / 2; index++) {
        const even = offset + index;
        const odd = even + length / 2;
        const oddReal = real[odd]! * rotationReal - imaginary[odd]! * rotationImaginary;
        const oddImaginary = real[odd]! * rotationImaginary + imaginary[odd]! * rotationReal;
        const evenReal = real[even]!;
        const evenImaginary = imaginary[even]!;

        real[even] = evenReal + oddReal;
        imaginary[even] = evenImaginary + oddImaginary;
        real[odd] = evenReal - oddReal;
        imaginary[odd] = evenImaginary - oddImaginary;

        const nextRotationReal =
          rotationReal * phaseReal - rotationImaginary * phaseImaginary;
        rotationImaginary =
          rotationReal * phaseImaginary + rotationImaginary * phaseReal;
        rotationReal = nextRotationReal;
      }
    }
  }
}

function bandAmplitude(
  real: Float64Array,
  imaginary: Float64Array,
  sampleRate: number,
  coherentGain: number,
  lowHz: number,
  highHz: number
): number {
  const size = real.length;
  const nyquist = sampleRate / 2;
  const low = Math.max(0, lowHz);
  const high = Math.min(nyquist, highHz);
  if (high <= low) return 0;

  const start = Math.max(1, Math.ceil(low * size / sampleRate));
  const end = Math.min(size / 2, Math.floor(high * size / sampleRate));
  let squared = 0;
  const scale = 2 / Math.max(1, size * coherentGain);
  for (let bin = start; bin <= end; bin++) {
    const magnitude = Math.hypot(real[bin]!, imaginary[bin]!) * scale;
    squared += magnitude * magnitude;
  }
  return clamp01(Math.sqrt(squared));
}

function spectrumMetrics(
  spectrum: Float64Array,
  sampleRate: number,
  fftSize: number
): {
  readonly spectralDensity: number;
  readonly flatness: number;
  readonly sharpness: number;
} {
  const start = Math.max(1, Math.ceil(20 * fftSize / sampleRate));
  const end = Math.min(
    spectrum.length - 1,
    Math.floor(Math.min(16_000, sampleRate / 2) * fftSize / sampleRate)
  );
  if (end < start) {
    return { spectralDensity: 0, flatness: 0, sharpness: 0 };
  }

  let maximum = 0;
  let arithmetic = 0;
  let logarithmic = 0;
  let weightedFrequency = 0;
  let magnitudeTotal = 0;
  const epsilon = 1e-12;
  const count = end - start + 1;

  for (let bin = start; bin <= end; bin++) {
    const magnitude = spectrum[bin] ?? 0;
    maximum = Math.max(maximum, magnitude);
    arithmetic += magnitude;
    logarithmic += Math.log(magnitude + epsilon);
    const frequency = bin * sampleRate / fftSize;
    weightedFrequency += magnitude * Math.pow(frequency / 16_000, 1.35);
    magnitudeTotal += magnitude;
  }
  if (maximum <= epsilon || magnitudeTotal <= epsilon) {
    return { spectralDensity: 0, flatness: 0, sharpness: 0 };
  }

  const densityThreshold = Math.max(1e-5, maximum * 0.055);
  let activeBins = 0;
  for (let bin = start; bin <= end; bin++) {
    if ((spectrum[bin] ?? 0) >= densityThreshold) activeBins += 1;
  }
  const mean = arithmetic / count;
  const geometric = Math.exp(logarithmic / count);
  return {
    spectralDensity: clamp01(activeBins / count * 12),
    flatness: clamp01(geometric / Math.max(epsilon, mean)),
    sharpness: clamp01(weightedFrequency / magnitudeTotal)
  };
}

export function extractCoreFeatureObservation(
  frame: PcmFrame
): CoreFeatureObservation {
  const size = frame.samples.length;
  assertPowerOfTwo(size);

  const real = new Float64Array(size);
  const imaginary = new Float64Array(size);
  let sumSquares = 0;
  let windowSum = 0;
  let peakAmplitude = 0;

  for (let index = 0; index < size; index++) {
    const sample = Number.isFinite(frame.samples[index]) ? frame.samples[index]! : 0;
    sumSquares += sample * sample;
    peakAmplitude = Math.max(peakAmplitude, Math.abs(sample));
    const window = 0.5 - 0.5 * Math.cos(2 * Math.PI * index / Math.max(1, size - 1));
    real[index] = sample * window;
    windowSum += window;
  }

  fft(real, imaginary);
  const coherentGain = windowSum / size;
  const loudness = clamp01(Math.sqrt(sumSquares / size) * Math.SQRT2);
  const spectrum = new Float64Array(size / 2 + 1);
  const spectrumScale = 2 / Math.max(1, size * coherentGain);
  for (let bin = 1; bin < spectrum.length; bin++) {
    spectrum[bin] =
      Math.hypot(real[bin]!, imaginary[bin]!) * spectrumScale;
  }
  const bass = bandAmplitude(
    real,
    imaginary,
    frame.sampleRate,
    coherentGain,
    BASS_RANGE[0],
    BASS_RANGE[1]
  );
  const mid = bandAmplitude(
    real,
    imaginary,
    frame.sampleRate,
    coherentGain,
    MID_RANGE[0],
    MID_RANGE[1]
  );
  const treble = bandAmplitude(
    real,
    imaginary,
    frame.sampleRate,
    coherentGain,
    TREBLE_RANGE[0],
    TREBLE_RANGE[1]
  );
  const metrics = spectrumMetrics(spectrum, frame.sampleRate, size);
  const rms = Math.sqrt(sumSquares / size);
  const crest = peakAmplitude / Math.max(1e-9, rms);
  const dynamicRange = clamp01((crest - 1) / 5);
  const sectionDrive = clamp01(
    loudness * 0.5 +
    metrics.spectralDensity * 0.3 +
    metrics.sharpness * 0.2
  );

  return {
    frame: createAudioFeatureFrame({
      frameIndex: frame.frameIndex,
      engineTimeMs: frame.sampleOffset / frame.sampleRate * 1000,
      available: true,
      loudness,
      bass,
      mid,
      treble,
      dynamicRange,
      spectralDensity: metrics.spectralDensity,
      sectionDrive,
      flatness: metrics.flatness,
      sharpness: metrics.sharpness
    }),
    spectrum,
    peakAmplitude
  };
}

export function extractCoreFeatures(frame: PcmFrame): ResolvedAudioFeatureFrame {
  return extractCoreFeatureObservation(frame).frame;
}
