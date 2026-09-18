(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.SmokeResonanceShadowStabilityMonitor = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';

  const VERSION = '1.3.0-formal-output-gate';
  const DEFAULT_OBSERVATION_MS = 30_000;
  const DEFAULT_INTERVAL_MS = 125;
  const DEFAULT_TELEMETRY_INTERVAL_MS = 1_000;
  const DEFAULT_CPU_BUDGET_PERCENT = 80;
  const DEFAULT_MEMORY_GROWTH_KB = 256 * 1024;
  const DEFAULT_MAX_SAMPLES = 512;

  const copy = value => value === null || value === undefined
    ? value
    : JSON.parse(JSON.stringify(value));
  const finite = value => Number.isFinite(Number(value));
  const clampNonNegative = value => finite(value)
    ? Math.max(0, Number(value))
    : 0;

  function emptyTelemetry() {
    return Object.freeze({
      available: false,
      cpuPercent: null,
      memoryKb: null,
      processCount: 0
    });
  }

  function sanitizeTelemetry(input) {
    if (!input || input.available !== true) return emptyTelemetry();
    return Object.freeze({
      available: true,
      cpuPercent: finite(input.cpuPercent) ? clampNonNegative(input.cpuPercent) : null,
      memoryKb: finite(input.memoryKb) ? clampNonNegative(input.memoryKb) : null,
      processCount: Number.isInteger(input.processCount)
        ? Math.max(0, input.processCount)
        : 0
    });
  }

  function targetState(report) {
    const values = report?.targets?.values || {};
    const entries = Object.entries(values);
    const invalidTargetIds = entries
      .filter(([, value]) => !finite(value))
      .map(([targetId]) => targetId);
    return Object.freeze({
      targetCount: entries.length,
      invalidTargetIds: Object.freeze(invalidTargetIds),
      finite: invalidTargetIds.length === 0
    });
  }

  function rendererState(report, runtimeStatus) {
    const profile = report?.profile || {};
    const output = runtimeStatus?.renderReport?.output || {};
    const port = runtimeStatus?.renderPort || {};
    const context = output.context || port.context || {};
    const quality = output.quality || port.quality || {};
    return Object.freeze({
      renderCalls: Number(profile.renderCalls) || 0,
      gpuContextsCreated: Number(profile.gpuContextsCreated) || 0,
      canvasTouches: Number(profile.canvasTouches) || 0,
      rafRequests: Number(profile.rafRequests) || 0,
      zeroGpu: profile.zeroGpu === true,
      context: Object.freeze({
        state: String(context.state || 'unavailable'),
        contextLosses: Math.max(0, Number(context.contextLosses) || 0),
        contextRestores: Math.max(0, Number(context.contextRestores) || 0),
        lastError: context.lastError ? String(context.lastError) : null
      }),
      quality: Object.freeze({
        mode: String(quality.mode || runtimeStatus?.qualityMode || 'unavailable'),
        profile: String(quality.id || 'unavailable'),
        renderScale: finite(quality.renderScale) ? Number(quality.renderScale) : null,
        maxDpr: finite(quality.maxDpr) ? Number(quality.maxDpr) : null,
        renderedFrames: Math.max(0, Number(quality.renderedFrames) || 0),
        skippedFrames: Math.max(0, Number(quality.skippedFrames) || 0)
      })
    });
  }

  function eventState(report) {
    const budget = report?.mixer?.eventBudget || {};
    const activeVoices = Math.max(0, Number(budget.activeVoices) || 0);
    const voiceLimit = Math.max(0, Number(budget.voiceLimit) || 0);
    return Object.freeze({
      activeVoices,
      voiceLimit,
      bounded: budget.enabled === false || activeVoices <= voiceLimit,
      droppedTriggers: Math.max(0, Number(budget.droppedTriggers) || 0),
      evictedVoices: Math.max(0, Number(budget.evictedVoices) || 0)
    });
  }

  function buildGate(snapshot, options) {
    const reasons = [];
    if (!snapshot.runtimeReady) reasons.push('RUNTIME_NOT_READY');
    if (!snapshot.targets.finite) reasons.push('TARGET_NON_FINITE');
    if (!snapshot.eventVoices.bounded) reasons.push('EVENT_VOICE_LIMIT');
    if (options.rendererExpected) {
      if (snapshot.renderer.context.state === 'lost') {
        reasons.push('RENDER_CONTEXT_LOST');
      } else if (snapshot.renderer.context.state === 'restore-failed') {
        reasons.push('RENDER_CONTEXT_RESTORE_FAILED');
      } else if (snapshot.renderer.context.state !== 'ready') {
        reasons.push('RENDER_CONTEXT_UNAVAILABLE');
      }
      if (snapshot.renderer.renderCalls <= 0 ||
        snapshot.renderer.canvasTouches <= 0 || snapshot.renderer.zeroGpu) {
        reasons.push('RENDERER_NOT_ACTIVE');
      }
      const expectedContexts =
        1 + snapshot.renderer.context.contextRestores;
      if (snapshot.renderer.gpuContextsCreated !== expectedContexts) {
        reasons.push('RENDERER_CONTEXT_COUNT');
      }
      if (snapshot.renderer.rafRequests > 0) {
        reasons.push('SECOND_RAF_DETECTED');
      }
      if (!['auto', 'eco', 'high'].includes(snapshot.renderer.quality.mode)) {
        reasons.push('QUALITY_MODE_INVALID');
      }
    } else if (!snapshot.renderer.zeroGpu || snapshot.renderer.renderCalls > 0 ||
      snapshot.renderer.gpuContextsCreated > 0 || snapshot.renderer.canvasTouches > 0 ||
      snapshot.renderer.rafRequests > 0) {
      reasons.push('SHADOW_ISOLATION_BROKEN');
    }
    if (snapshot.telemetry.peakCpuPercent !== null &&
      snapshot.telemetry.peakCpuPercent > options.cpuBudgetPercent) {
      reasons.push('CPU_BUDGET_EXCEEDED');
    }
    if (snapshot.telemetry.memoryGrowthKb !== null &&
      snapshot.telemetry.memoryGrowthKb > options.memoryGrowthBudgetKb) {
      reasons.push('MEMORY_GROWTH_EXCEEDED');
    }
    const ready = snapshot.observation.durationMs >= options.minimumObservationMs &&
      snapshot.observation.sampleCount > 0;
    return Object.freeze({
      ready,
      pass: reasons.length === 0 && ready,
      status: reasons.length
        ? 'BLOCKED'
        : ready
          ? 'PASS'
          : 'PROVISIONAL',
      reasons: Object.freeze(reasons)
    });
  }

  class ShadowStabilityMonitor {
    constructor(options = {}) {
      this.root = options.root || null;
      this.formalPipeline = options.formalPipeline === 'generator'
        ? 'generator'
        : 'legacy';
      this.options = Object.freeze({
        minimumObservationMs: Math.max(1_000, Number(options.minimumObservationMs) || DEFAULT_OBSERVATION_MS),
        intervalMs: Math.max(100, Math.min(200, Number(options.intervalMs) || DEFAULT_INTERVAL_MS)),
        telemetryIntervalMs: Math.max(250, Number(options.telemetryIntervalMs) || DEFAULT_TELEMETRY_INTERVAL_MS),
        cpuBudgetPercent: Math.max(1, Number(options.cpuBudgetPercent) || DEFAULT_CPU_BUDGET_PERCENT),
        memoryGrowthBudgetKb: Math.max(1024, Number(options.memoryGrowthBudgetKb) || DEFAULT_MEMORY_GROWTH_KB),
        maxSamples: Math.max(16, Math.min(2048, Number(options.maxSamples) || DEFAULT_MAX_SAMPLES)),
        rendererExpected: options.rendererExpected === true
      });
      this.reset();
    }

    reset() {
      this.lastSampleAt = -Infinity;
      this.startedAtMs = null;
      this.lastEpoch = null;
      this.sampleCount = 0;
      this.samples = [];
      this.telemetrySamples = [];
      this.signature = '';
      this.domWrites = 0;
      this.latest = this.snapshot(0, null, null);
      return this.get();
    }

    observe(clock, runtimeReport, sourceMode, runtimeStatus = null) {
      const nowMs = clampNonNegative(clock?.nowMs);
      const epoch = Number.isInteger(runtimeReport?.input?.transport?.epoch)
        ? runtimeReport.input.transport.epoch
        : null;
      if (epoch !== null && this.lastEpoch !== null && epoch !== this.lastEpoch) {
        this.reset();
      }
      if (epoch !== null) this.lastEpoch = epoch;
      if (this.startedAtMs === null) this.startedAtMs = nowMs;
      if (nowMs - this.lastSampleAt < this.options.intervalMs && this.sampleCount > 0) {
        return this.get();
      }
      this.lastSampleAt = nowMs;
      this.sampleCount++;
      this.samples.push(Object.freeze({
        nowMs,
        sourceMode: sourceMode === 'external' ? 'external' : 'internal',
        runtimeReady: runtimeReport?.contract === 'xin.glitch-runtime-frame/1',
        targets: targetState(runtimeReport),
        renderer: rendererState(runtimeReport, runtimeStatus),
        eventVoices: eventState(runtimeReport),
        energyBudget: Object.freeze({
          attenuation: finite(runtimeReport?.mixer?.energyBudget?.attenuation)
            ? Number(runtimeReport.mixer.energyBudget.attenuation)
            : 1,
          activeTargets: Math.max(0, Number(runtimeReport?.mixer?.energyBudget?.activeTargets) || 0)
        })
      }));
      if (this.samples.length > this.options.maxSamples) this.samples.shift();
      this.latest = this.snapshot(nowMs, runtimeReport, sourceMode, runtimeStatus);
      this.render(this.latest);
      return this.get();
    }

    observeTelemetry(nowMs, telemetryInput) {
      const telemetry = sanitizeTelemetry(telemetryInput);
      // Preserve an unavailable sample too: the gate must distinguish
      // "telemetry unavailable" from "telemetry was never requested".
      // This remains observation-only and cannot affect renderer state.
      this.telemetrySamples.push(Object.freeze({
        nowMs: clampNonNegative(nowMs),
        ...telemetry
      }));
      if (this.telemetrySamples.length > this.options.maxSamples) {
        this.telemetrySamples.shift();
      }
      this.latest = this.snapshot(clampNonNegative(nowMs), null, null, null);
      this.render(this.latest);
      return this.get();
    }

    telemetryDue(nowMs) {
      const last = this.telemetrySamples.at(-1)?.nowMs ?? -Infinity;
      return clampNonNegative(nowMs) - last >= this.options.telemetryIntervalMs;
    }

    snapshot(nowMs, runtimeReport, sourceMode, runtimeStatus = null) {
      const sample = this.samples.at(-1) || Object.freeze({
        nowMs,
        sourceMode: sourceMode === 'external' ? 'external' : 'internal',
        runtimeReady: runtimeReport?.contract === 'xin.glitch-runtime-frame/1',
        targets: targetState(runtimeReport),
        renderer: rendererState(runtimeReport, runtimeStatus),
        eventVoices: eventState(runtimeReport),
        energyBudget: Object.freeze({ attenuation: 1, activeTargets: 0 })
      });
      const telemetry = this.telemetrySamples;
      const cpu = telemetry
        .map(entry => entry.cpuPercent)
        .filter(value => value !== null);
      const memory = telemetry
        .map(entry => entry.memoryKb)
        .filter(value => value !== null);
      const observationStart = this.startedAtMs ?? nowMs;
      const base = Object.freeze({
        version: VERSION,
        formalPipeline: this.formalPipeline,
        rendererEnabled: this.options.rendererExpected,
        observation: Object.freeze({
          startedAtMs: observationStart,
          durationMs: Math.max(0, nowMs - observationStart),
          minimumObservationMs: this.options.minimumObservationMs,
          sourceModes: Object.freeze([...new Set(this.samples.map(entry => entry.sourceMode))]),
          sampleCount: this.sampleCount
        }),
        runtimeReady: sample.runtimeReady,
        targets: sample.targets,
        renderer: sample.renderer,
        eventVoices: sample.eventVoices,
        energyBudget: sample.energyBudget,
        telemetry: Object.freeze({
          samples: telemetry.length,
          lastCpuPercent: cpu.at(-1) ?? null,
          peakCpuPercent: cpu.length ? Math.max(...cpu) : null,
          lastMemoryKb: memory.at(-1) ?? null,
          peakMemoryKb: memory.length ? Math.max(...memory) : null,
          memoryGrowthKb: memory.length > 1
            ? Math.max(...memory) - memory[0]
            : null
        })
      });
      return Object.freeze({ ...base, gate: buildGate(base, this.options) });
    }

    render(snapshot) {
      if (!this.root) return;
      const signature = JSON.stringify(snapshot);
      if (signature === this.signature) return;
      this.signature = signature;
      const writes = [];
      const write = (selector, value) => {
        const node = this.root.querySelector(selector);
        if (node && node.textContent !== value) {
          node.textContent = value;
          writes.push(1);
        }
      };
      write('[data-shadow-gate-state]', snapshot.gate.status);
      write('[data-shadow-gate-duration]', `${(snapshot.observation.durationMs / 1000).toFixed(1)}s / ${(snapshot.observation.minimumObservationMs / 1000).toFixed(0)}s`);
      write('[data-shadow-gate-targets]', snapshot.targets.finite ? `${snapshot.targets.targetCount} finite targets` : `INVALID ${snapshot.targets.invalidTargetIds.join(', ')}`);
      write('[data-shadow-gate-voices]', `${snapshot.eventVoices.activeVoices}/${snapshot.eventVoices.voiceLimit || 0} voices`);
      write('[data-shadow-gate-system]', snapshot.telemetry.lastCpuPercent === null
        ? 'SYSTEM TELEMETRY WAITING'
        : `CPU ${snapshot.telemetry.lastCpuPercent.toFixed(1)}% · MEM ${(snapshot.telemetry.lastMemoryKb / 1024).toFixed(1)} MB`);
      write('[data-shadow-gate-reasons]', snapshot.gate.reasons.length
        ? snapshot.gate.reasons.join(' · ')
        : snapshot.gate.ready ? 'ALL GATES PASS' : 'COLLECTING ENGINE-CLOCK SAMPLES');
      this.domWrites += writes.length;
    }

    get() {
      return copy(this.latest);
    }

    status() {
      return {
        version: VERSION,
        intervalMs: this.options.intervalMs,
        rateHz: 1000 / this.options.intervalMs,
        telemetryIntervalMs: this.options.telemetryIntervalMs,
        sampleCount: this.sampleCount,
        telemetrySamples: this.telemetrySamples.length,
        domWrites: this.domWrites,
        formalPipeline: this.formalPipeline,
        rendererEnabled: this.options.rendererExpected,
        snapshot: this.get()
      };
    }
  }

  return Object.freeze({
    create: options => new ShadowStabilityMonitor(options),
    constants: Object.freeze({
      VERSION,
      DEFAULT_OBSERVATION_MS,
      DEFAULT_INTERVAL_MS,
      DEFAULT_TELEMETRY_INTERVAL_MS,
      DEFAULT_CPU_BUDGET_PERCENT,
      DEFAULT_MEMORY_GROWTH_KB
    })
  });
});
