(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  if (root) root.SmokeResonanceSectionFeatures = api;
})(typeof window !== 'undefined' ? window : globalThis, function () {
  'use strict';

  const clamp = (value, low = 0, high = 1) => Math.max(low, Math.min(high, Number(value) || 0));
  const mix = (from, to, amount) => from + (to - from) * clamp(amount);
  const smoothstep = (edge0, edge1, value) => {
    const x = clamp((value - edge0) / Math.max(1e-6, edge1 - edge0));
    return x * x * (3 - 2 * x);
  };
  const powerToDb = power => 10 * Math.log10(Math.max(1e-14, power));
  const cosineDistance = (left, right) => {
    let dot = 0;
    let leftPower = 0;
    let rightPower = 0;
    const length = Math.min(left?.length || 0, right?.length || 0);
    for (let index = 0; index < length; index++) {
      const a = Number(left[index]) || 0;
      const b = Number(right[index]) || 0;
      dot += a * b;
      leftPower += a * a;
      rightPower += b * b;
    }
    if (leftPower < 1e-9 || rightPower < 1e-9) return 0;
    return clamp(1 - dot / Math.sqrt(leftPower * rightPower));
  };
  const noteNames = Object.freeze(['C', 'C#', 'D', 'Eb', 'E', 'F', 'F#', 'G', 'Ab', 'A', 'Bb', 'B']);
  const chordKinds = Object.freeze([
    { suffix: '', intervals: [0, 4, 7], penalty: 0 },
    { suffix: 'm', intervals: [0, 3, 7], penalty: 0 },
    { suffix: 'sus2', intervals: [0, 2, 7], penalty: .025 },
    { suffix: 'sus4', intervals: [0, 5, 7], penalty: .025 },
    { suffix: 'dim', intervals: [0, 3, 6], penalty: .04 }
  ]);

  class SectionFeatureExtractor {
    constructor(config = {}) {
      this.bandCount = Math.max(12, Math.min(48, Math.round(config.bandCount || 24)));
      this.minFrequency = Math.max(20, Number(config.minFrequency) || 30);
      this.maxFrequency = Math.max(4000, Number(config.maxFrequency) || 16000);
      this.reset();
    }

    reset() {
      this.lastNow = 0;
      this.bandFloor = new Float32Array(this.bandCount).fill(-92);
      this.bandPeak = new Float32Array(this.bandCount).fill(-42);
      this.previousProfile = new Float32Array(this.bandCount);
      this.profileInitialized = false;
      this.previousLevel = 0;
      this.previousOrchestration = 0;
      this.orchestrationBaseline = null;
      this.orchestrationPersistence = 0;
      this.fullnessBaseline = null;
      this.fullnessPersistence = 0;
      this.previousFullness = 0;
      this.levelHistory = [];
      this.peakPosition = .5;
      this.previousChroma = new Float32Array(12);
      this.stableChroma = new Float32Array(12);
      this.chordLabel = 'N';
      this.chordCandidate = 'N';
      this.chordCandidateFrames = 0;
      this.chordConfidence = 0;
      this.lastFrame = this.emptyFrame();
      return this.lastFrame;
    }

    emptyFrame() {
      return {
        source: 'raw-section-bus-v1', ready: false, now: 0,
        overall: 0, rms: 0, bass: 0, mid: 0, treble: 0,
        flux: 0, onset: 0, centroid: .5, flatness: 0, density: 0,
        breadth: 0, voices: 0, richness: 0, orchestrationDensity: 0,
        orchestrationDelta: 0, orchestrationPersistence: 0, orchestrationFall: 0,
        spectralFullness: 0, fullnessDelta: 0, fullnessPersistence: 0, fullnessFall: 0,
        bandCoverage: 0, spectralContinuity: 0, spectralFloorLift: 0, triBandOccupancy: 0,
        effectiveParts: 0, dynamicRange: 0, spectralContrast: 0,
        acid: 0, resonance: 0, sweep: 0, sharpness: 0, roughness: 0,
        chord: 'N', chordConfidence: 0, chordChange: 0, harmonicTension: 0,
        chromaEntropy: 0, pitchClassCount: 0, chroma: new Array(12).fill(0),
        profile: new Array(this.bandCount).fill(0), vector: new Array(32).fill(0)
      };
    }

    extractHarmony(spectrum, sampleRate, fftSize, presence) {
      const chroma = new Float32Array(12);
      const binHz = sampleRate / fftSize;
      const from = Math.max(1, Math.floor(55 / binHz));
      const to = Math.min(spectrum.length - 1, Math.ceil(5000 / binHz));
      let total = 0;
      for (let bin = from; bin <= to; bin++) {
        const frequency = bin * binHz;
        const db = Number.isFinite(spectrum[bin]) ? spectrum[bin] : -140;
        if (db < -96) continue;
        const midi = 69 + 12 * Math.log2(frequency / 440);
        const nearest = Math.round(midi);
        const detune = Math.abs(midi - nearest);
        const pitchClass = ((nearest % 12) + 12) % 12;
        const tonalGate = Math.exp(-(detune * detune) / .065);
        const frequencyWeight = 1 / Math.sqrt(Math.max(.65, frequency / 220));
        const magnitude = Math.pow(10, Math.max(-96, db) / 20) * tonalGate * frequencyWeight;
        chroma[pitchClass] += magnitude;
        total += magnitude;
      }
      const maximum = Math.max(...chroma);
      if (maximum > 1e-8) for (let index = 0; index < 12; index++) chroma[index] /= maximum;

      let chromaSum = 0;
      let entropy = 0;
      let pitchClassCount = 0;
      for (let index = 0; index < 12; index++) {
        chromaSum += chroma[index];
        if (chroma[index] > .24) pitchClassCount++;
      }
      for (let index = 0; index < 12; index++) {
        const probability = chroma[index] / Math.max(1e-8, chromaSum);
        if (probability > 0) entropy -= probability * Math.log(probability);
      }
      entropy = clamp(entropy / Math.log(12));

      const candidates = [];
      for (let root = 0; root < 12; root++) {
        for (const kind of chordKinds) {
          const selected = new Set(kind.intervals.map(interval => (root + interval) % 12));
          let inside = chroma[root] * .18;
          let outside = 0;
          for (let index = 0; index < 12; index++) {
            if (selected.has(index)) inside += chroma[index];
            else outside += chroma[index];
          }
          const score = inside / (kind.intervals.length + .18) - outside / 9 * .48 - kind.penalty;
          candidates.push({ label: `${noteNames[root]}${kind.suffix}`, score });
        }
      }
      candidates.sort((left, right) => right.score - left.score);
      const best = candidates[0] || { label: 'N', score: 0 };
      const second = candidates[1]?.score || 0;
      const concentration = clamp(1 - entropy * .7);
      const confidence = presence > .08
        ? clamp(smoothstep(.025, .16, best.score - second) * .56 + smoothstep(.04, .34, best.score) * .26 + concentration * .18)
        : 0;
      const proposed = confidence > .2 && total > 1e-7 ? best.label : 'N';
      if (proposed === this.chordCandidate) this.chordCandidateFrames++;
      else {
        this.chordCandidate = proposed;
        this.chordCandidateFrames = 1;
      }
      if (this.chordCandidateFrames >= (proposed === 'N' ? 8 : 5)) this.chordLabel = proposed;
      this.chordConfidence = mix(this.chordConfidence, proposed === this.chordLabel ? confidence : confidence * .55, .24);

      const chordChange = cosineDistance(chroma, this.previousChroma);
      for (let index = 0; index < 12; index++) {
        this.previousChroma[index] = chroma[index];
        this.stableChroma[index] = mix(this.stableChroma[index], chroma[index], .16);
      }
      const dissonanceWeights = [0, .95, .42, .18, .22, .12, .82];
      let dissonance = 0;
      let pairs = 0;
      for (let left = 0; left < 12; left++) {
        for (let right = left + 1; right < 12; right++) {
          const interval = Math.min((right - left) % 12, 12 - ((right - left) % 12));
          const weight = dissonanceWeights[interval] || .08;
          dissonance += chroma[left] * chroma[right] * weight;
          pairs += chroma[left] * chroma[right];
        }
      }
      return {
        chroma: Array.from(chroma), entropy, pitchClassCount,
        label: this.chordLabel, confidence: clamp(this.chordConfidence),
        change: clamp(chordChange * 1.55), tension: pairs > 1e-8 ? clamp(dissonance / pairs) : 0
      };
    }

    update({ spectrum, waveform, sampleRate = 48000, fftSize = 4096, playing = true } = {}, now = 0) {
      if (!spectrum?.length || !waveform?.length || !playing) {
        this.lastFrame = { ...this.emptyFrame(), now };
        return this.lastFrame;
      }
      const dt = clamp(this.lastNow ? (now - this.lastNow) / 1000 : 1 / 30, 1 / 240, .2);
      this.lastNow = now;
      const binHz = sampleRate / fftSize;
      const bandDb = new Float32Array(this.bandCount);
      const bandPower = new Float32Array(this.bandCount);
      const profile = new Float32Array(this.bandCount);
      const activation = new Float32Array(this.bandCount);
      const logRatio = Math.log(this.maxFrequency / this.minFrequency);

      for (let band = 0; band < this.bandCount; band++) {
        const fromHz = this.minFrequency * Math.exp(logRatio * band / this.bandCount);
        const toHz = this.minFrequency * Math.exp(logRatio * (band + 1) / this.bandCount);
        const from = Math.max(1, Math.floor(fromHz / binHz));
        const to = Math.min(spectrum.length - 1, Math.max(from, Math.ceil(toHz / binHz)));
        let power = 0;
        let count = 0;
        for (let bin = from; bin <= to; bin++) {
          const db = Number.isFinite(spectrum[bin]) ? Math.max(-140, spectrum[bin]) : -140;
          power += Math.pow(10, db / 10);
          count++;
        }
        power /= Math.max(1, count);
        const db = powerToDb(power);
        bandDb[band] = db;
        bandPower[band] = power;

        const floorSpeed = db < this.bandFloor[band] ? 1 - Math.exp(-dt / 1.4) : 1 - Math.exp(-dt / 42);
        this.bandFloor[band] = mix(this.bandFloor[band], db, floorSpeed);
        this.bandPeak[band] = Math.max(db, this.bandPeak[band] - 1.7 * dt);
        const absolute = smoothstep(-88, -20, db);
        const relative = smoothstep(4, Math.max(14, this.bandPeak[band] - this.bandFloor[band]), db - this.bandFloor[band]);
        profile[band] = clamp(absolute * .58 + relative * .42);
        activation[band] = clamp(
          smoothstep(4.5, 15, db - this.bandFloor[band]) * .58
          + smoothstep(-86, -34, db) * .42
        );
      }

      let squareSum = 0;
      const byteWaveform = waveform instanceof Uint8Array || waveform instanceof Uint8ClampedArray;
      for (let index = 0; index < waveform.length; index += 2) {
        const sample = byteWaveform ? (waveform[index] - 128) / 128 : Number(waveform[index]) || 0;
        squareSum += sample * sample;
      }
      const rms = Math.sqrt(squareSum / Math.max(1, Math.ceil(waveform.length / 2)));
      const rmsDb = 20 * Math.log10(Math.max(1e-7, rms));
      const level = smoothstep(-62, -10, rmsDb);
      const presence = smoothstep(-58, -28, rmsDb);

      const totalPower = bandPower.reduce((sum, value) => sum + value, 0);
      let weightedPosition = 0;
      let logPower = 0;
      let activeBands = 0;
      let entropy = 0;
      let flux = 0;
      let localPeaks = 0;
      const zones = new Array(6).fill(0);
      const zoneMax = new Array(6).fill(0);
      const zoneMin = new Array(6).fill(1);
      for (let band = 0; band < this.bandCount; band++) {
        const value = profile[band];
        const probability = bandPower[band] / Math.max(1e-14, totalPower);
        weightedPosition += probability * (band + .5) / this.bandCount;
        logPower += Math.log(Math.max(1e-14, bandPower[band]));
        if (probability > 0) entropy -= probability * Math.log(probability);
        if (value > .19 && bandDb[band] > this.bandFloor[band] + 5.5) activeBands++;
        const zone = Math.min(5, Math.floor(band / this.bandCount * 6));
        zoneMax[zone] = Math.max(zoneMax[zone], value);
        zoneMin[zone] = Math.min(zoneMin[zone], value);
        if (value > .2) zones[zone] = 1;
        const left = profile[Math.max(0, band - 1)];
        const right = profile[Math.min(this.bandCount - 1, band + 1)];
        if (value > .25 && value > left * 1.06 && value >= right * 1.06) localPeaks++;
        flux += Math.max(0, value - this.previousProfile[band]);
        this.previousProfile[band] = value;
      }
      entropy = clamp(entropy / Math.log(this.bandCount));
      flux = this.profileInitialized ? clamp(flux / this.bandCount * 5.5) : 0;
      this.profileInitialized = true;
      const flatness = totalPower > 1e-14
        ? clamp(Math.exp(logPower / this.bandCount) / (totalPower / this.bandCount))
        : 0;
      const occupancy = activeBands / this.bandCount;
      const breadth = zones.reduce((sum, value) => sum + value, 0) / zones.length;
      const contrast = zoneMax.reduce((sum, value, index) => sum + Math.max(0, value - zoneMin[index]), 0) / zones.length;
      const voices = clamp(localPeaks / 8);
      const tonalLayers = voices * (1 - flatness * .55);

      const sortedActivation = Array.from(activation).sort((left, right) => left - right);
      const floorIndex = Math.max(0, Math.floor((sortedActivation.length - 1) * .25));
      const spectralFloorLift = sortedActivation[floorIndex] || 0;
      const bandCoverage = activation.reduce((sum, value) => sum + value, 0) / this.bandCount;
      let continuitySum = 0;
      for (let band = 1; band < this.bandCount; band++) {
        continuitySum += Math.sqrt(activation[band - 1] * activation[band]);
      }
      const spectralContinuity = continuitySum / Math.max(1, this.bandCount - 1);
      const activationAverage = (from, to) => {
        let sum = 0;
        let count = 0;
        for (let band = 0; band < this.bandCount; band++) {
          const frequency = this.minFrequency * Math.exp(logRatio * (band + .5) / this.bandCount);
          if (frequency >= from && frequency < to) { sum += activation[band]; count++; }
        }
        return sum / Math.max(1, count);
      };
      const lowOccupancy = activationAverage(30, 220);
      const midOccupancy = activationAverage(220, 2400);
      const highOccupancy = activationAverage(2400, 12000);
      const triBandOccupancy = Math.cbrt(Math.max(0, lowOccupancy * midOccupancy * highOccupancy));
      const spectralUniformity = clamp(1 - contrast);
      const fullnessInstant = clamp((
        bandCoverage * .3
        + spectralFloorLift * .25
        + spectralContinuity * .2
        + triBandOccupancy * .15
        + spectralUniformity * bandCoverage * .1
      ) * (1 - flux * .14) * (.5 + presence * .5));
      if (this.fullnessBaseline === null) {
        this.fullnessBaseline = fullnessInstant;
        this.previousFullness = fullnessInstant;
      }
      const previousFullness = this.previousFullness;
      const fullnessRise = Math.max(0, fullnessInstant - previousFullness);
      const fullnessDrop = Math.max(0, previousFullness - fullnessInstant);
      this.previousFullness = fullnessInstant;
      const fullnessTau = fullnessInstant > this.fullnessBaseline ? 34 : 11;
      this.fullnessBaseline = mix(this.fullnessBaseline, fullnessInstant, 1 - Math.exp(-dt / fullnessTau));
      const fullnessDelta = clamp(Math.max(0, fullnessInstant - this.fullnessBaseline) * 3.5 + fullnessRise * 3.2);
      const fullnessTarget = fullnessInstant > this.fullnessBaseline + .055 ? 1 : fullnessInstant > .52 ? .62 : 0;
      this.fullnessPersistence = mix(
        this.fullnessPersistence,
        fullnessTarget,
        1 - Math.exp(-dt / (fullnessTarget > this.fullnessPersistence ? 1.25 : 3.8))
      );
      const spectralFullness = clamp(fullnessInstant * .78 + this.fullnessPersistence * .22);
      const fullnessFall = clamp(fullnessDrop * 4.4 + Math.max(0, this.fullnessBaseline - fullnessInstant) * 2.1);
      const orchestration = clamp((
        occupancy * .24 + breadth * .19 + entropy * .13 + tonalLayers * .17 + contrast * .08 + spectralFullness * .19
      ) * (.45 + presence * .55));

      if (this.orchestrationBaseline === null) {
        this.orchestrationBaseline = orchestration;
        this.previousOrchestration = orchestration;
      }
      const previousOrchestration = this.previousOrchestration;
      const rise = Math.max(0, orchestration - previousOrchestration);
      const fall = Math.max(0, previousOrchestration - orchestration);
      this.previousOrchestration = orchestration;
      const baselineTau = orchestration > this.orchestrationBaseline ? 22 : 8;
      this.orchestrationBaseline = mix(this.orchestrationBaseline, orchestration, 1 - Math.exp(-dt / baselineTau));
      const orchestrationDelta = clamp(Math.max(0, orchestration - this.orchestrationBaseline) * 3.2 + rise * 3.4);
      const persistenceTarget = orchestration > this.orchestrationBaseline + .055 ? 1 : orchestration > .52 ? .58 : 0;
      this.orchestrationPersistence = mix(
        this.orchestrationPersistence,
        persistenceTarget,
        1 - Math.exp(-dt / (persistenceTarget > this.orchestrationPersistence ? .7 : 2.8))
      );
      const orchestrationFall = clamp(fall * 4.4 + Math.max(0, this.orchestrationBaseline - orchestration) * 2.3);
      const effectiveParts = clamp(breadth * .62 + tonalLayers * .25 + occupancy * .13) * 6;

      const levelRise = Math.max(0, level - this.previousLevel);
      this.previousLevel = level;
      const onset = clamp(flux * .74 + levelRise * 1.35);
      this.levelHistory.push(level);
      if (this.levelHistory.length > 180) this.levelHistory.shift();
      const lowLevel = Math.min(...this.levelHistory);
      const highLevel = Math.max(...this.levelHistory);
      const dynamicRange = clamp((highLevel - lowLevel) * 1.8);

      const bandAverage = (from, to) => {
        let sum = 0;
        let count = 0;
        for (let band = 0; band < this.bandCount; band++) {
          const frequency = this.minFrequency * Math.exp(logRatio * (band + .5) / this.bandCount);
          if (frequency >= from && frequency < to) { sum += profile[band]; count++; }
        }
        return sum / Math.max(1, count);
      };
      const bass = bandAverage(30, 220);
      const mid = bandAverage(220, 2400);
      const treble = bandAverage(2400, 16000);
      const peakBand = profile.reduce((best, value, index) => value > profile[best] ? index : best, 0);
      const peakPosition = peakBand / Math.max(1, this.bandCount - 1);
      const sweep = clamp(Math.abs(peakPosition - this.peakPosition) * 5.5);
      this.peakPosition = mix(this.peakPosition, peakPosition, .35);
      const resonance = clamp((profile[peakBand] - (profile[Math.max(0, peakBand - 2)] + profile[Math.min(this.bandCount - 1, peakBand + 2)]) * .5) * 2.4);
      const sharpness = clamp(weightedPosition * 1.25);
      const roughness = clamp(flatness * .52 + flux * .72);
      const acid = clamp(presence * (resonance * .34 + sweep * .18 + sharpness * .2 + roughness * .28));
      const harmony = this.extractHarmony(spectrum, sampleRate, fftSize, presence);

      const compactProfile = [];
      const compactBands = 12;
      for (let index = 0; index < compactBands; index++) {
        const from = Math.floor(index * this.bandCount / compactBands);
        const to = Math.max(from + 1, Math.floor((index + 1) * this.bandCount / compactBands));
        let sum = 0;
        for (let band = from; band < to; band++) sum += profile[band];
        compactProfile.push(sum / Math.max(1, to - from));
      }
      const meanProfile = compactProfile.reduce((sum, value) => sum + value, 0) / compactProfile.length;
      const shape = compactProfile.map(value => clamp(.5 + (value - meanProfile) * 1.35));
      const vector = [
        ...shape,
        ...harmony.chroma.map(value => value * .34),
        orchestration, breadth, spectralFullness, weightedPosition, contrast, flatness, level * .55, harmony.change * .45
      ];

      this.lastFrame = {
        source: 'raw-section-bus-v1', ready: true, now,
        overall: level, rms: clamp(rms * 3.2), bass, mid, treble,
        flux, onset, centroid: clamp(weightedPosition), flatness, density: occupancy,
        breadth, voices, richness: orchestration, orchestrationDensity: orchestration,
        orchestrationDelta, orchestrationPersistence: clamp(this.orchestrationPersistence), orchestrationFall,
        spectralFullness, fullnessDelta, fullnessPersistence: clamp(this.fullnessPersistence), fullnessFall,
        bandCoverage, spectralContinuity, spectralFloorLift, triBandOccupancy,
        effectiveParts, dynamicRange, spectralContrast: contrast,
        acid, resonance, sweep, sharpness, roughness,
        chord: harmony.label, chordConfidence: harmony.confidence, chordChange: harmony.change,
        harmonicTension: harmony.tension, chromaEntropy: harmony.entropy,
        pitchClassCount: harmony.pitchClassCount, chroma: harmony.chroma,
        profile: Array.from(profile), vector
      };
      return this.lastFrame;
    }

    get() {
      return JSON.parse(JSON.stringify(this.lastFrame));
    }
  }

  return Object.freeze({
    create: config => new SectionFeatureExtractor(config)
  });
});
