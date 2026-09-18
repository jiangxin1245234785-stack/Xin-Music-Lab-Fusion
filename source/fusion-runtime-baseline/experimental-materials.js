(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.SmokeResonanceExperimentalMaterials = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';

  const VERSION = '1.0.0-phase2';
  const API_CONTRACT = 'xin.experimental-materials/1';
  const MATERIAL_CONTRACT = 'xin.visual-material/1';
  const OUTPUT_CONTRACT = 'xin.material-output/1';
  const FIELD_CONTRACT = 'xin.material-field/1';
  const DEFAULT_PALETTE = Object.freeze({
    main: Object.freeze([141, 124, 255]),
    hot: Object.freeze([114, 232, 206]),
    dark: Object.freeze([26, 21, 58])
  });
  const DEFINITIONS = Object.freeze([
    Object.freeze({
      id: 'spectral-fabric',
      label: 'Spectral Fabric',
      category: 'material-experiment',
      sourceKind: 'material-canvas',
      fields: Object.freeze(['density'])
    }),
    Object.freeze({
      id: 'temporal-strata',
      label: 'Temporal Strata',
      category: 'material-experiment',
      sourceKind: 'material-canvas',
      fields: Object.freeze(['density', 'age'])
    })
  ]);

  function clamp01(value) {
    const number = Number(value);
    if (!Number.isFinite(number)) return 0;
    return Math.max(0, Math.min(1, number));
  }

  function mix(a, b, amount) {
    return a + (b - a) * clamp01(amount);
  }

  function targetValue(parameters, id, fallback) {
    return parameters && Object.prototype.hasOwnProperty.call(parameters, id)
      ? clamp01(parameters[id])
      : fallback;
  }

  function safePalette(input) {
    const read = (key, fallback) => {
      const values = Array.isArray(input?.[key]) ? input[key] : fallback;
      return values.slice(0, 3).map((value, index) => {
        const number = Number(value);
        return Number.isFinite(number)
          ? Math.max(0, Math.min(255, Math.round(number)))
          : fallback[index];
      });
    };
    return {
      main: read('main', DEFAULT_PALETTE.main),
      hot: read('hot', DEFAULT_PALETTE.hot),
      dark: read('dark', DEFAULT_PALETTE.dark)
    };
  }

  function normalizeSpectrum(input, size = 96) {
    const source = input && typeof input.length === 'number' ? input : [];
    const output = new Float32Array(size);
    if (!source.length) return output;
    for (let index = 0; index < size; index++) {
      const position = size === 1
        ? 0
        : index / (size - 1) * Math.max(0, source.length - 1);
      const left = Math.floor(position);
      const right = Math.min(source.length - 1, left + 1);
      output[index] = mix(
        clamp01(source[left]),
        clamp01(source[right]),
        position - left
      );
    }
    return output;
  }

  function spectrumAt(spectrum, position) {
    const x = clamp01(position) * Math.max(0, spectrum.length - 1);
    const left = Math.floor(x);
    const right = Math.min(spectrum.length - 1, left + 1);
    return mix(spectrum[left] || 0, spectrum[right] || 0, x - left);
  }

  function smoothSpectrum(input, continuity) {
    const source = normalizeSpectrum(input);
    const output = new Float32Array(source.length);
    const radius = 1 + Math.round(clamp01(continuity) * 7);
    for (let index = 0; index < source.length; index++) {
      let total = 0;
      let weight = 0;
      for (let offset = -radius; offset <= radius; offset++) {
        const sampleIndex = Math.max(0, Math.min(source.length - 1, index + offset));
        const sampleWeight = radius + 1 - Math.abs(offset);
        total += source[sampleIndex] * sampleWeight;
        weight += sampleWeight;
      }
      output[index] = weight ? total / weight : 0;
    }
    return output;
  }

  function spectrumMetrics(input) {
    const values = input && typeof input.length === 'number' ? input : [];
    if (!values.length) {
      return Object.freeze({ min: 0, max: 0, mean: 0, spread: 0 });
    }
    let min = 1;
    let max = 0;
    let sum = 0;
    for (const rawValue of values) {
      const value = clamp01(rawValue);
      min = Math.min(min, value);
      max = Math.max(max, value);
      sum += value;
    }
    const mean = sum / values.length;
    let variance = 0;
    for (const rawValue of values) {
      const difference = clamp01(rawValue) - mean;
      variance += difference * difference;
    }
    return Object.freeze({
      min,
      max,
      mean,
      spread: Math.sqrt(variance / values.length)
    });
  }

  function articulateSpectrum(input) {
    const source = input && typeof input.length === 'number' ? input : [];
    const output = new Float32Array(source.length);
    const metrics = spectrumMetrics(source);
    const range = metrics.max - metrics.min;
    const articulation = clamp01((range - 0.025) / 0.32) * 0.54;
    for (let index = 0; index < source.length; index++) {
      const absolute = clamp01(source[index]);
      const relative = range > 0.0001
        ? clamp01((absolute - metrics.min) / range)
        : absolute;
      output[index] = mix(absolute, relative, articulation);
    }
    return output;
  }

  function colorForDensity(density, palette, out, offset, alpha = 1) {
    const value = clamp01(density);
    let from = palette.dark;
    let to = palette.main;
    let amount = value / 0.62;
    if (value > 0.62) {
      from = palette.main;
      to = palette.hot;
      amount = (value - 0.62) / 0.38;
    }
    out[offset] = Math.round(mix(from[0], to[0], amount));
    out[offset + 1] = Math.round(mix(from[1], to[1], amount));
    out[offset + 2] = Math.round(mix(from[2], to[2], amount));
    out[offset + 3] = Math.round(255 * clamp01(alpha));
  }

  function createRaster(width, height) {
    const w = Math.max(1, Math.floor(Number(width) || 1));
    const h = Math.max(1, Math.floor(Number(height) || 1));
    return {
      width: w,
      height: h,
      color: new Uint8ClampedArray(w * h * 4),
      density: new Uint8ClampedArray(w * h)
    };
  }

  function buildSpectralFabric(options = {}) {
    const raster = createRaster(options.width, options.height);
    const spectrum = smoothSpectrum(
      options.spectrum,
      options.continuity
    );
    const palette = safePalette(options.palette);
    const coverage = clamp01(options.coverage ?? 1);
    const continuity = clamp01(options.continuity ?? 0.72);
    const densityTarget = clamp01(options.density ?? 0.5);
    const energy = clamp01(options.energy);
    const phase = Number.isFinite(Number(options.phase))
      ? Number(options.phase)
      : 0;
    let occupied = 0;

    for (let y = 0; y < raster.height; y++) {
      const v = raster.height === 1 ? 0 : y / (raster.height - 1);
      for (let x = 0; x < raster.width; x++) {
        const u = raster.width === 1 ? 0 : x / (raster.width - 1);
        const warp = Math.sin(
          u * Math.PI * (2.5 + densityTarget * 4) +
          phase * 0.47 +
          v * (1.5 - continuity)
        ) * (0.015 + (1 - continuity) * 0.055);
        const sample = spectrumAt(spectrum, clamp01(u + warp));
        const neighboring = spectrumAt(
          spectrum,
          clamp01(1 - u * (0.72 + continuity * 0.22))
        );
        const ridge = 0.14 + (1 - Math.pow(sample, 0.7)) * 0.68;
        const foldedRidge =
          0.88 -
          neighboring * (0.2 + densityTarget * 0.18) +
          Math.sin(u * Math.PI * 3 + phase * 0.31) * 0.035;
        const primaryWidth =
          0.045 +
          coverage * 0.13 +
          sample * (0.035 + densityTarget * 0.07);
        const primary = Math.exp(
          -Math.pow((v - ridge) / Math.max(0.018, primaryWidth), 2) * 2.2
        );
        const folded = Math.exp(
          -Math.pow(
            (v - foldedRidge) /
            Math.max(0.02, 0.025 + densityTarget * 0.07),
            2
          ) * 2.6
        ) * (0.2 + neighboring * 0.48);
        const weave =
          (0.5 + 0.5 * Math.sin(
            (u * (7 + densityTarget * 11) + v * (4 + continuity * 5)) *
            Math.PI +
            phase
          )) *
          (0.035 + densityTarget * 0.12) *
          (0.25 + sample * 0.75);
        const background =
          (0.012 + energy * 0.035) *
          (0.5 + 0.5 * Math.sin(v * Math.PI + phase * 0.13));
        const value = clamp01(
          (primary * (0.45 + sample * 0.72) + folded + weave + background) *
          (0.55 + coverage * 0.45)
        );
        const pixel = y * raster.width + x;
        raster.density[pixel] = Math.round(value * 255);
        if (value > 0.055) occupied++;
        colorForDensity(
          value,
          palette,
          raster.color,
          pixel * 4,
          Math.min(1, 0.54 + value * 0.62)
        );
      }
    }
    raster.coverage = occupied / (raster.width * raster.height);
    return raster;
  }

  function buildTemporalRow(options = {}) {
    const width = Math.max(1, Math.floor(Number(options.width) || 1));
    const spectrum = articulateSpectrum(
      smoothSpectrum(options.spectrum, options.continuity)
    );
    const continuity = clamp01(options.continuity ?? 0.72);
    const densityTarget = clamp01(options.density ?? 0.5);
    const coverage = clamp01(options.coverage ?? 1);
    const energy = clamp01(options.energy);
    const phase = Number.isFinite(Number(options.phase))
      ? Number(options.phase)
      : 0;
    const output = new Uint8ClampedArray(width);
    for (let x = 0; x < width; x++) {
      const u = width === 1 ? 0 : x / (width - 1);
      const warp =
        Math.sin(u * Math.PI * (2 + densityTarget * 3) + phase * 0.41) *
        (1 - continuity) * 0.04;
      const sample = spectrumAt(spectrum, clamp01(u + warp));
      const neighbor = spectrumAt(spectrum, clamp01(u * 0.77 + 0.115));
      const filament =
        (0.5 + 0.5 * Math.sin(
          u * Math.PI * (4 + densityTarget * 9) + phase
        )) *
        (0.04 + densityTarget * 0.13);
      const value = clamp01(
        (
          Math.pow(sample, 0.72) * (0.72 + densityTarget * 0.38) +
          neighbor * 0.16 +
          filament +
          energy * 0.05
        ) *
        (0.45 + coverage * 0.55)
      );
      output[x] = Math.round(value * 255);
    }
    return output;
  }

  function meanFrameDifference(current, previous) {
    if (!previous || previous.length !== current.length) return 1;
    let difference = 0;
    for (let index = 0; index < current.length; index += 4) {
      difference += Math.abs(current[index] - previous[index]);
      difference += Math.abs(current[index + 1] - previous[index + 1]);
      difference += Math.abs(current[index + 2] - previous[index + 2]);
    }
    return difference / (current.length / 4 * 3 * 255);
  }

  function resolveSize(target, options = {}) {
    const width = Math.max(1, Math.floor(Number(target?.width) || 1));
    const height = Math.max(1, Math.floor(Number(target?.height) || 1));
    const maxWidth = Math.max(64, Math.floor(options.maxWidth || 320));
    const maxHeight = Math.max(36, Math.floor(options.maxHeight || 180));
    const scale = Math.min(1, maxWidth / width, maxHeight / height);
    return {
      width: Math.max(1, Math.round(width * scale)),
      height: Math.max(1, Math.round(height * scale))
    };
  }

  function fieldSurface(semantic, canvas, format) {
    return Object.freeze({
      contract: FIELD_CONTRACT,
      semantic,
      kind: 'canvas',
      source: canvas,
      sourceKind: `material-field-${semantic}`,
      width: canvas.width,
      height: canvas.height,
      format,
      colorSpace: 'linear'
    });
  }

  function writeColorCanvas(canvas, raster) {
    const context = canvas.getContext('2d', { alpha: true });
    const image = context.createImageData(raster.width, raster.height);
    image.data.set(raster.color);
    context.putImageData(image, 0, 0);
  }

  function writeScalarCanvas(canvas, values) {
    const context = canvas.getContext('2d', { alpha: false });
    const image = context.createImageData(canvas.width, canvas.height);
    for (let index = 0; index < values.length; index++) {
      const value = values[index];
      const offset = index * 4;
      image.data[offset] = value;
      image.data[offset + 1] = value;
      image.data[offset + 2] = value;
      image.data[offset + 3] = 255;
    }
    context.putImageData(image, 0, 0);
  }

  class BaseExperimentalMaterial {
    constructor(options = {}) {
      this.id = String(options.id || '');
      this.label = String(options.label || this.id);
      this.createCanvas = options.createCanvas;
      this.createSurface = options.createSurface;
      this.presentSurface = typeof options.presentSurface === 'function'
        ? options.presentSurface
        : null;
      this.maxWidth = options.maxWidth || 320;
      this.maxHeight = options.maxHeight || 180;
      if (typeof this.createCanvas !== 'function') {
        throw new Error(`EXPERIMENTAL_MATERIAL_CANVAS_FACTORY_REQUIRED:${this.id}`);
      }
      if (typeof this.createSurface !== 'function') {
        throw new Error(`EXPERIMENTAL_MATERIAL_SURFACE_FACTORY_REQUIRED:${this.id}`);
      }
      this.colorCanvas = null;
      this.fieldCanvases = {};
      this.lastUpdate = null;
      this.lastOutput = null;
      this.lastColor = null;
      this.resetCount = 0;
      this.updateCount = 0;
      this.renderCount = 0;
      this.refreshCount = 0;
      this.lastResetReason = 'initial';
      this.lastRefreshAt = null;
      this.metrics = {
        coverage: 0,
        meanFrameDifference: 0,
        actualRefreshRate: 0
      };
    }

    ensureCanvas(name, width, height) {
      let canvas = name === 'color'
        ? this.colorCanvas
        : this.fieldCanvases[name];
      if (!canvas) {
        canvas = this.createCanvas(width, height);
        if (name === 'color') this.colorCanvas = canvas;
        else this.fieldCanvases[name] = canvas;
      }
      if (canvas.width !== width) canvas.width = width;
      if (canvas.height !== height) canvas.height = height;
      return canvas;
    }

    reset(reason = 'manual') {
      this.resetCount++;
      this.lastResetReason = String(reason || 'manual');
      this.lastUpdate = null;
      this.lastOutput = null;
      this.lastColor = null;
      this.lastRefreshAt = null;
      this.refreshCount = 0;
      this.metrics = {
        coverage: 0,
        meanFrameDifference: 0,
        actualRefreshRate: 0
      };
      this.onReset();
    }

    onReset() {}

    update(musicFrame, clock, parameters = {}) {
      this.updateCount++;
      this.lastUpdate = {
        musicFrame: musicFrame || {},
        clock: { ...(clock || {}) },
        parameters: { ...(parameters || {}) }
      };
      return Object.freeze({
        musicFrame,
        clock: Object.freeze({ ...(clock || {}) }),
        parameters: Object.freeze({ ...(parameters || {}) })
      });
    }

    refreshInterval() {
      const refresh = targetValue(
        this.lastUpdate?.parameters,
        'material.refreshRate',
        1
      );
      return 34 + Math.pow(1 - refresh, 1.8) * 1466;
    }

    shouldRefresh() {
      const now = Number(this.lastUpdate?.clock?.nowMs) || 0;
      return this.lastRefreshAt === null ||
        now - this.lastRefreshAt >= this.refreshInterval();
    }

    recordRefresh(raster) {
      const now = Number(this.lastUpdate?.clock?.nowMs) || 0;
      const elapsed = this.lastRefreshAt === null
        ? 0
        : Math.max(0, now - this.lastRefreshAt);
      this.metrics.coverage = clamp01(raster.coverage);
      this.metrics.meanFrameDifference = meanFrameDifference(
        raster.color,
        this.lastColor
      );
      this.metrics.actualRefreshRate = elapsed > 0 ? 1000 / elapsed : 0;
      this.lastColor = new Uint8ClampedArray(raster.color);
      this.lastRefreshAt = now;
      this.refreshCount++;
    }

    finishOutput(fields) {
      const frameIndex = Number(this.lastUpdate?.clock?.frameIndex);
      const color = this.createSurface({
        kind: 'canvas',
        source: this.colorCanvas,
        sourceKind: 'material-canvas',
        width: this.colorCanvas.width,
        height: this.colorCanvas.height,
        format: 'rgba8',
        colorSpace: 'srgb'
      });
      this.lastOutput = Object.freeze({
        contract: OUTPUT_CONTRACT,
        materialId: this.id,
        frameIndex: Number.isInteger(frameIndex) ? frameIndex : null,
        color,
        fields: Object.freeze({ ...fields })
      });
      this.presentSurface?.(color);
      this.renderCount++;
      return this.lastOutput;
    }

    outputs() {
      return this.lastOutput;
    }

    status() {
      const musicFrame = this.lastUpdate?.musicFrame || {};
      return Object.freeze({
        contract: MATERIAL_CONTRACT,
        version: VERSION,
        id: this.id,
        label: this.label,
        adapter: 'native-material',
        sourceKind: 'material-canvas',
        frameIndex: Number.isInteger(this.lastOutput?.frameIndex)
          ? this.lastOutput.frameIndex
          : null,
        resetCount: this.resetCount,
        updateCount: this.updateCount,
        renderCount: this.renderCount,
        refreshCount: this.refreshCount,
        lastResetReason: this.lastResetReason,
        refreshIntervalMs: this.refreshInterval(),
        input: Object.freeze({
          energy: clamp01(musicFrame.energy?.overall),
          spectrum: spectrumMetrics(musicFrame.spectrum),
          palette: safePalette(musicFrame.palette),
          parameters: Object.freeze({
            ...(this.lastUpdate?.parameters || {})
          })
        }),
        metrics: Object.freeze({
          coverage: this.metrics.coverage,
          meanFrameDifference: this.metrics.meanFrameDifference,
          refreshRate: this.metrics.actualRefreshRate,
          actualRefreshRate: this.metrics.actualRefreshRate
        })
      });
    }
  }

  class SpectralFabricMaterial extends BaseExperimentalMaterial {
    constructor(options = {}) {
      super({ ...options, id: 'spectral-fabric', label: 'Spectral Fabric' });
    }

    render(target = {}) {
      if (!this.lastUpdate) throw new Error('MATERIAL_RENDER_BEFORE_UPDATE');
      const size = resolveSize(target, this);
      const colorCanvas = this.ensureCanvas('color', size.width, size.height);
      const densityCanvas = this.ensureCanvas('density', size.width, size.height);
      if (this.shouldRefresh() || !this.lastOutput) {
        const frame = this.lastUpdate.musicFrame;
        const parameters = this.lastUpdate.parameters;
        const now = Number(this.lastUpdate.clock.nowMs) || 0;
        const raster = buildSpectralFabric({
          width: size.width,
          height: size.height,
          spectrum: frame.spectrum,
          palette: frame.palette,
          energy: frame.energy?.overall,
          phase: now / 1000,
          coverage: targetValue(parameters, 'material.coverage', 1),
          continuity: targetValue(parameters, 'material.continuity', 0.72),
          density: targetValue(parameters, 'material.density', 0.5)
        });
        writeColorCanvas(colorCanvas, raster);
        writeScalarCanvas(densityCanvas, raster.density);
        this.recordRefresh(raster);
      }
      return this.finishOutput({
        density: fieldSurface('density', densityCanvas, 'r8-unorm')
      });
    }
  }

  class TemporalStrataMaterial extends BaseExperimentalMaterial {
    constructor(options = {}) {
      super({ ...options, id: 'temporal-strata', label: 'Temporal Strata' });
      this.densityState = null;
      this.ageState = null;
      this.primed = false;
      this.primeEnergy = 0;
    }

    onReset() {
      this.densityState = null;
      this.ageState = null;
      this.primed = false;
      this.primeEnergy = 0;
    }

    ensureState(width, height) {
      const length = width * height;
      if (!this.densityState || this.densityState.length !== length) {
        this.densityState = new Uint8ClampedArray(length);
        this.ageState = new Uint8ClampedArray(length);
        this.primed = false;
        this.primeEnergy = 0;
      }
    }

    primeState(width, height, row, phase, densityTarget, energy) {
      const oldestScale = 0.22 + densityTarget * 0.12;
      const newestScale = 0.68 + densityTarget * 0.24;
      const bandHeight = Math.max(
        2,
        Math.round(7 - densityTarget * 4)
      );
      for (let y = 0; y < height; y++) {
        const vertical = height === 1 ? 1 : y / (height - 1);
        const age = 1 - vertical;
        const band = Math.floor(y / bandHeight);
        const bandNoise =
          0.5 +
          0.5 * Math.sin(
            band * 12.9898 +
            phase * 0.37 +
            Math.sin(band * 0.71) * 2.4
          );
        const drift = Math.round(
          Math.sin(band * 0.73 + phase * 0.71) *
          (2 + densityTarget * 7)
        );
        const layerPulse =
          0.42 +
          0.58 * (
            0.5 +
            0.5 * Math.sin(
              band * (0.48 + densityTarget * 0.22) +
              phase * 0.43
            )
          );
        const faultScale = mix(0.58, 1.08, bandNoise);
        const layerScale =
          mix(oldestScale, newestScale, Math.pow(vertical, 0.72)) *
          layerPulse *
          faultScale;
        for (let x = 0; x < width; x++) {
          const sourceX = (x + drift + width) % width;
          const index = y * width + x;
          this.densityState[index] = Math.round(row[sourceX] * layerScale);
          this.ageState[index] = Math.round(age * 232);
        }
      }
      this.primed = true;
      this.primeEnergy = clamp01(energy);
    }

    advanceState(width, height, row, rowStep) {
      const shift = Math.max(1, Math.min(height, rowStep));
      const rowWidth = width * shift;
      this.densityState.copyWithin(0, rowWidth);
      this.ageState.copyWithin(0, rowWidth);
      const retained = width * (height - shift);
      for (let index = 0; index < retained; index++) {
        this.ageState[index] = Math.min(255, this.ageState[index] + shift);
      }
      for (let y = height - shift; y < height; y++) {
        const layerFade = 0.82 + 0.18 * (
          (y - (height - shift)) / Math.max(1, shift - 1)
        );
        for (let x = 0; x < width; x++) {
          const index = y * width + x;
          this.densityState[index] = Math.round(row[x] * layerFade);
          this.ageState[index] = 0;
        }
      }
    }

    rasterFromState(width, height, palette) {
      const raster = createRaster(width, height);
      const colors = safePalette(palette);
      let occupied = 0;
      for (let index = 0; index < this.densityState.length; index++) {
        const density = this.densityState[index] / 255;
        const age = this.ageState[index] / 255;
        const temporalFade = 1 - age * 0.58;
        const value = density * temporalFade;
        raster.density[index] = this.densityState[index];
        if (value > 0.055) occupied++;
        colorForDensity(
          value,
          colors,
          raster.color,
          index * 4,
          Math.min(1, 0.48 + value * 0.68)
        );
      }
      raster.coverage = occupied / (width * height);
      return raster;
    }

    render(target = {}) {
      if (!this.lastUpdate) throw new Error('MATERIAL_RENDER_BEFORE_UPDATE');
      const size = resolveSize(target, this);
      const colorCanvas = this.ensureCanvas('color', size.width, size.height);
      const densityCanvas = this.ensureCanvas('density', size.width, size.height);
      const ageCanvas = this.ensureCanvas('age', size.width, size.height);
      this.ensureState(size.width, size.height);
      if (this.shouldRefresh() || !this.lastOutput) {
        const frame = this.lastUpdate.musicFrame;
        const parameters = this.lastUpdate.parameters;
        const now = Number(this.lastUpdate.clock.nowMs) || 0;
        const densityTarget = targetValue(
          parameters,
          'material.density',
          0.5
        );
        const energy = clamp01(frame.energy?.overall);
        const row = buildTemporalRow({
          width: size.width,
          spectrum: frame.spectrum,
          energy,
          phase: now / 1000,
          coverage: targetValue(parameters, 'material.coverage', 1),
          continuity: targetValue(
            parameters,
            'material.continuity',
            0.72
          ),
          density: densityTarget
        });
        if (
          !this.primed ||
          (this.primeEnergy < 0.08 && energy >= 0.12)
        ) {
          this.primeState(
            size.width,
            size.height,
            row,
            now / 1000,
            densityTarget,
            energy
          );
        }
        const rowStep = 1 + Math.round(densityTarget * 2);
        this.advanceState(size.width, size.height, row, rowStep);
        const raster = this.rasterFromState(
          size.width,
          size.height,
          frame.palette
        );
        writeColorCanvas(colorCanvas, raster);
        writeScalarCanvas(densityCanvas, this.densityState);
        writeScalarCanvas(ageCanvas, this.ageState);
        this.recordRefresh(raster);
      }
      return this.finishOutput({
        density: fieldSurface('density', densityCanvas, 'r8-unorm'),
        age: fieldSurface('age', ageCanvas, 'r8-unorm')
      });
    }
  }

  function descriptorFor(id) {
    return DEFINITIONS.find(definition => definition.id === id) || null;
  }

  function create(id, options = {}) {
    const key = String(id || '');
    if (key === 'spectral-fabric') {
      return new SpectralFabricMaterial(options);
    }
    if (key === 'temporal-strata') {
      return new TemporalStrataMaterial(options);
    }
    throw new Error(`EXPERIMENTAL_MATERIAL_UNKNOWN:${key}`);
  }

  return Object.freeze({
    has: id => Boolean(descriptorFor(String(id || ''))),
    describe: id => descriptorFor(String(id || '')),
    list: () => DEFINITIONS,
    create,
    pure: Object.freeze({
      normalizeSpectrum,
      smoothSpectrum,
      buildSpectralFabric,
      buildTemporalRow,
      meanFrameDifference,
      spectrumMetrics,
      articulateSpectrum
    }),
    constants: Object.freeze({
      VERSION,
      API_CONTRACT,
      MATERIAL_CONTRACT,
      OUTPUT_CONTRACT,
      FIELD_CONTRACT
    })
  });
});
