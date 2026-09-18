(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.SmokeResonanceLiveHarmony = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';

  const A4 = 440;
  const PC_NAMES = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];
  const MIN_HZ = 55;    // ~A1
  const MAX_HZ = 5000;  // harmonic-relevant range

  // 24 triad templates (major + minor for all 12 roots).
  function buildTemplates() {
    const shapes = [['', [0, 4, 7]], ['m', [0, 3, 7]]];
    const list = [];
    for (let rootPc = 0; rootPc < 12; rootPc += 1) {
      for (const [suffix, intervals] of shapes) {
        const vec = new Float32Array(12);
        for (const interval of intervals) vec[(rootPc + interval) % 12] = 1;
        const norm = Math.sqrt(intervals.length);
        for (let i = 0; i < 12; i += 1) vec[i] /= norm;
        list.push({ root: rootPc, label: PC_NAMES[rootPc] + suffix, vec });
      }
    }
    return list;
  }
  const TEMPLATES = buildTemplates();

  class LiveHarmony {
    constructor() {
      this.binMap = null;
      this.binSampleRate = 0;
      this.binFft = 0;
      this.chroma = new Float32Array(12);   // EMA-smoothed chroma
      this.raw = new Float32Array(12);
      this.prevIndex = -1;
      this.holdConfidence = 0;
    }

    reset() {
      this.chroma.fill(0);
      this.prevIndex = -1;
      this.holdConfidence = 0;
    }

    ensureBinMap(sampleRate, fftSize) {
      if (this.binMap && this.binSampleRate === sampleRate && this.binFft === fftSize) return;
      const bins = Math.floor(fftSize / 2);
      const map = new Int8Array(bins).fill(-1);
      const binHz = sampleRate / fftSize;
      for (let bin = 1; bin < bins; bin += 1) {
        const freq = bin * binHz;
        if (freq < MIN_HZ || freq > MAX_HZ) continue;
        const midi = 69 + 12 * Math.log2(freq / A4);
        map[bin] = (((Math.round(midi) % 12) + 12) % 12);
      }
      this.binMap = map;
      this.binSampleRate = sampleRate;
      this.binFft = fftSize;
    }

    // floatFreqData: dB magnitudes from AnalyserNode.getFloatFrequencyData.
    update(floatFreqData, sampleRate, fftSize, playing) {
      this.ensureBinMap(sampleRate, fftSize);
      const map = this.binMap;
      const raw = this.raw;
      raw.fill(0);
      let energy = 0;
      for (let bin = 0; bin < map.length; bin += 1) {
        const pc = map[bin];
        if (pc < 0) continue;
        const db = floatFreqData[bin];
        if (db <= -100 || !Number.isFinite(db)) continue;
        const mag = Math.pow(10, db / 20);
        raw[pc] += mag;
        energy += mag;
      }
      if (energy > 1e-6) for (let i = 0; i < 12; i += 1) raw[i] /= energy;

      const alpha = 0.18; // smoothing toward the new frame (CENS-like stabilising)
      for (let i = 0; i < 12; i += 1) this.chroma[i] = this.chroma[i] * (1 - alpha) + raw[i] * alpha;

      let chromaNorm = 0;
      for (let i = 0; i < 12; i += 1) chromaNorm += this.chroma[i] * this.chroma[i];
      chromaNorm = Math.sqrt(chromaNorm) || 1;

      let best = -1;
      let bestScore = -1;
      let secondScore = -1;
      for (let t = 0; t < TEMPLATES.length; t += 1) {
        const vec = TEMPLATES[t].vec;
        let dot = 0;
        for (let i = 0; i < 12; i += 1) dot += this.chroma[i] * vec[i];
        const score = dot / chromaNorm;
        if (score > bestScore) { secondScore = bestScore; bestScore = score; best = t; }
        else if (score > secondScore) secondScore = score;
      }

      const margin = Math.max(0, bestScore - secondScore);
      const confidence = Math.min(1, bestScore * 0.7 + margin * 1.7);

      // Silence / low-energy / weak match → no chord.
      if (!playing || energy < 1.5e-4 || bestScore < 0.5) {
        this.prevIndex = -1;
        this.holdConfidence = 0;
        return { label: 'N', root: -1, rootName: 'N', confidence: 0, chroma: this.chroma };
      }
      // Hysteresis: don't switch unless the new candidate is clearly competitive.
      if (best !== this.prevIndex && this.prevIndex >= 0 && confidence < this.holdConfidence * 0.9 + 0.05) {
        best = this.prevIndex;
      }
      this.prevIndex = best;
      this.holdConfidence = confidence;
      const template = TEMPLATES[best];
      return {
        label: template.label,
        root: template.root,
        rootName: PC_NAMES[template.root],
        confidence: Math.round(confidence * 100) / 100,
        chroma: this.chroma
      };
    }
  }

  return Object.freeze({ create: () => new LiveHarmony() });
});
