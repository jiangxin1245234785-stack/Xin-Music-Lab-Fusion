(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.SmokeResonanceTargetInspector = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';

  const VERSION = '4.5.0-formal-target-inspector';
  const DEFAULT_INTERVAL_MS = 125;
  const DEFAULT_MAX_SAMPLES = 96;
  const DIMENSIONS = Object.freeze([
    'luminance', 'motion', 'texture', 'rupture', 'color'
  ]);
  const LEVEL_ORDER = Object.freeze({ QUIET: 0, PRESENT: 1, INTENSE: 2 });

  const finite = value => Number.isFinite(Number(value));
  const clamp01 = value => finite(value)
    ? Math.max(0, Math.min(1, Number(value)))
    : 0;
  const copy = value => value === null || value === undefined
    ? value
    : JSON.parse(JSON.stringify(value));

  function legacyValue(snapshot, group, key) {
    const value = snapshot?.[group]?.[key];
    if (group === 'events') return clamp01(value);
    return clamp01(value);
  }

  function levelFor(value) {
    if (value < 0.16) return 'QUIET';
    if (value < 0.5) return 'PRESENT';
    return 'INTENSE';
  }

  function maximum(values) {
    return values.reduce((result, value) => Math.max(result, value), 0);
  }

  function describeLegacyIntent(snapshot) {
    const continuous = key => legacyValue(snapshot, 'continuous', key);
    const events = key => legacyValue(snapshot, 'events', key);
    return Object.freeze({
      luminance: levelFor(maximum([
        continuous('loudness'), continuous('climaxState')
      ])),
      motion: levelFor(maximum([
        continuous('bass'), continuous('mid'), continuous('sectionDrive')
      ])),
      texture: levelFor(maximum([
        continuous('treble'), continuous('trebleSmooth')
      ])),
      rupture: levelFor(maximum([
        continuous('acid'), events('bassPeak'), events('onset')
      ])),
      color: levelFor(maximum([
        continuous('chordHue'), continuous('chordConfidence')
      ]))
    });
  }

  function describeGeneratorIntent(report) {
    const source = report?.visualIntent?.dimensions;
    return Object.freeze(Object.fromEntries(
      DIMENSIONS.map(id => [
        id,
        source?.[id]?.level || 'QUIET'
      ])
    ));
  }

  function relationFor(legacyLevel, generatorLevel) {
    const difference = Math.abs(
      (LEVEL_ORDER[legacyLevel] ?? 0) -
      (LEVEL_ORDER[generatorLevel] ?? 0)
    );
    if (difference === 0) return 'ALIGNED';
    if (difference === 1) return 'NEAR';
    return 'DIVERGENT';
  }

  function safetySummary(safety) {
    const interventions = safety?.interventions || {};
    const active = Object.entries(interventions)
      .filter(([, enabled]) => enabled === true)
      .map(([id]) => id);
    return Object.freeze({
      mode: safety?.mode || 'UNKNOWN',
      physicalCapActive: safety?.physicalCapActive === true,
      activeInterventions: Object.freeze(active)
    });
  }

  function energySummary(energyBudget) {
    return Object.freeze({
      enabled: energyBudget?.enabled === true,
      attenuation: finite(energyBudget?.attenuation)
        ? Number(energyBudget.attenuation)
        : 1,
      activeTargets: Number.isInteger(energyBudget?.activeTargets)
        ? energyBudget.activeTargets
        : 0
    });
  }

  function buildSnapshot(
    nowMs,
    legacySnapshot,
    runtimeReport,
    samples,
    maxSamples = DEFAULT_MAX_SAMPLES,
    formalPipeline = 'legacy'
  ) {
    const runtimeReady = runtimeReport?.contract === 'xin.glitch-runtime-frame/1';
    const legacyIntent = describeLegacyIntent(legacySnapshot);
    const generatorIntent = describeGeneratorIntent(runtimeReport);
    const comparison = DIMENSIONS.map(id => Object.freeze({
      id,
      legacy: legacyIntent[id],
      generator: generatorIntent[id],
      relation: runtimeReady
        ? relationFor(legacyIntent[id], generatorIntent[id])
        : 'UNAVAILABLE'
    }));
    const safety = safetySummary(runtimeReport?.safety);
    const energy = energySummary(runtimeReport?.mixer?.energyBudget);
    const timelinePoint = Object.freeze({
      nowMs,
      generatorIntent,
      safety,
      energy
    });
    const timeline = [...samples, timelinePoint].slice(-maxSamples);
    return Object.freeze({
      version: VERSION,
      sampledAtMs: nowMs,
      runtimeReady,
      formalPipeline,
      comparatorMode: 'visual-intent-only',
      legacyIntent,
      generatorIntent,
      comparison: Object.freeze(comparison),
      safety,
      energy,
      timeline: Object.freeze(timeline)
    });
  }

  class TargetInspector {
    constructor(options = {}) {
      this.root = options.root || null;
      this.formalPipeline = options.formalPipeline === 'generator'
        ? 'generator'
        : 'legacy';
      this.intervalMs = Math.max(100, Math.min(200, Number(options.intervalMs) || DEFAULT_INTERVAL_MS));
      this.maxSamples = Math.max(8, Math.min(256, Number(options.maxSamples) || DEFAULT_MAX_SAMPLES));
      this.lastSampleAt = -Infinity;
      this.samples = [];
      this.sampleCount = 0;
      this.domWrites = 0;
      this.signature = '';
      this.lastEpoch = null;
      this.latest = buildSnapshot(
        0,
        null,
        null,
        [],
        DEFAULT_MAX_SAMPLES,
        this.formalPipeline
      );
    }

    update(nowMs, legacySnapshot, runtimeReport) {
      const engineNow = Math.max(0, Number(nowMs) || 0);
      const epoch = Number.isInteger(runtimeReport?.input?.transport?.epoch)
        ? runtimeReport.input.transport.epoch
        : null;
      if (epoch !== null && this.lastEpoch !== null && epoch !== this.lastEpoch) {
        this.samples = [];
        this.lastSampleAt = -Infinity;
      }
      if (epoch !== null) this.lastEpoch = epoch;
      if (engineNow - this.lastSampleAt < this.intervalMs && this.sampleCount > 0) {
        return this.get();
      }
      this.lastSampleAt = engineNow;
      this.sampleCount++;
      const snapshot = buildSnapshot(
        engineNow,
        legacySnapshot,
        runtimeReport,
        this.samples,
        this.maxSamples,
        this.formalPipeline
      );
      this.samples = [...snapshot.timeline].slice(-this.maxSamples);
      this.latest = Object.freeze({ ...snapshot, timeline: Object.freeze([...this.samples]) });
      this.render(this.latest);
      return this.get();
    }

    render(snapshot) {
      if (!this.root) return;
      const signature = JSON.stringify(snapshot);
      if (signature === this.signature) return;
      this.signature = signature;
      let writes = 0;
      const write = (selector, text) => {
        const node = this.root.querySelector(selector);
        if (node && node.textContent !== text) {
          node.textContent = text;
          writes++;
        }
      };
      write('[data-target-inspector-clock]', `${Math.round(snapshot.sampledAtMs)} ms`);
      write('[data-target-inspector-state]', snapshot.runtimeReady ? 'SHADOW READY' : 'WAITING');
      write(
        '[data-target-inspector-safety]',
        `${snapshot.safety.mode} · ${snapshot.safety.activeInterventions.length} intervention(s)`
      );
      write(
        '[data-target-inspector-energy]',
        snapshot.energy.enabled
          ? `BUDGET ${(snapshot.energy.attenuation * 100).toFixed(0)}% · ${snapshot.energy.activeTargets} targets`
          : 'BUDGET PASSIVE'
      );
      const rows = this.root.querySelector('[data-target-inspector-rows]');
      if (rows) {
        rows.replaceChildren(...snapshot.comparison.map(row => {
          const article = this.root.ownerDocument.createElement('article');
          article.className = 'target-inspector__row';
          article.dataset.targetIntent = row.id;
          article.dataset.relation = row.relation.toLowerCase();
          article.innerHTML = [
            `<b>${row.id.toUpperCase()}</b>`,
            `<span>LEGACY <strong>${row.legacy}</strong></span>`,
            `<span>GENERATOR <strong>${row.generator}</strong></span>`,
            `<em>${row.relation}</em>`
          ].join('');
          return article;
        }));
        writes++;
      }
      const timeline = this.root.querySelector('[data-target-inspector-timeline]');
      if (timeline) {
        const recent = snapshot.timeline.slice(-8).reverse();
        timeline.replaceChildren(...recent.map(point => {
          const item = this.root.ownerDocument.createElement('li');
          item.textContent = `${Math.round(point.nowMs)}ms · ` +
            DIMENSIONS.map(id => point.generatorIntent[id][0]).join('') +
            ` · ${point.safety.activeInterventions.length}S`;
          return item;
        }));
        writes++;
      }
      this.domWrites += writes;
    }

    get() {
      return copy(this.latest);
    }

    status() {
      return {
        version: VERSION,
        intervalMs: this.intervalMs,
        rateHz: 1000 / this.intervalMs,
        sampleCount: this.sampleCount,
        domWrites: this.domWrites,
        formalPipeline: this.formalPipeline,
        comparatorMode: 'visual-intent-only',
        snapshot: this.get()
      };
    }

    reset() {
      this.lastSampleAt = -Infinity;
      this.samples = [];
      this.sampleCount = 0;
      this.signature = '';
      this.lastEpoch = null;
      this.latest = buildSnapshot(
        0,
        null,
        null,
        [],
        DEFAULT_MAX_SAMPLES,
        this.formalPipeline
      );
      return this.get();
    }
  }

  return Object.freeze({
    create: options => new TargetInspector(options),
    constants: Object.freeze({
      VERSION,
      DEFAULT_INTERVAL_MS,
      DEFAULT_MAX_SAMPLES,
      DIMENSIONS
    })
  });
});
