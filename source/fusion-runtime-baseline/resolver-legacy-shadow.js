(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.SmokeResonanceResolverLegacyShadow = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';

  const VERSION = '2.5.0-shadow-gate';
  const FORMAL_PIPELINE = 'legacy';
  const DEFAULT_INTERVAL_MS = 125;
  const SCENARIOS = Object.freeze({
    LOCAL_XLD: 'local-xld',
    LOCAL_NO_XLD: 'local-no-xld',
    EXTERNAL: 'external-listening',
    REALTIME_STALE: 'realtime-stale',
    XLD_REJECTED: 'xld-rejected'
  });
  const XLD_REJECTION_CODES = new Set([
    'XLD_CONTRACT_MISSING',
    'XLD_CONTRACT_UNSUPPORTED',
    'XLD_SCHEMA_VERSION_UNSUPPORTED',
    'XLD_TRACK_ID_MISMATCH',
    'XLD_TRACK_SOURCE_MISMATCH',
    'XLD_DURATION_MISMATCH'
  ]);
  const LEGACY_CONTINUOUS_KEYS = Object.freeze([
    'acid',
    'bass',
    'bassSmooth',
    'build',
    'chordConfidence',
    'chordHue',
    'climaxState',
    'dropState',
    'ensemble',
    'loudness',
    'mid',
    'midSmooth',
    'sectionDrive',
    'treble',
    'trebleSmooth'
  ]);
  const LEGACY_EVENT_KEYS = Object.freeze([
    'bassPeak',
    'chordChange',
    'climaxEnter',
    'dropEnter',
    'onset',
    'sectionBoundary'
  ]);
  const COMPARABLE = Object.freeze([
    { featureId: 'loudness', unifiedGroup: 'continuous', legacyGroup: 'continuous', legacyId: 'loudness' },
    { featureId: 'bass', unifiedGroup: 'continuous', legacyGroup: 'continuous', legacyId: 'bass' },
    { featureId: 'mid', unifiedGroup: 'continuous', legacyGroup: 'continuous', legacyId: 'mid' },
    { featureId: 'treble', unifiedGroup: 'continuous', legacyGroup: 'continuous', legacyId: 'treble' },
    { featureId: 'buildEnergy', unifiedGroup: 'continuous', legacyGroup: 'continuous', legacyId: 'build', approximate: true },
    { featureId: 'sectionDrive', unifiedGroup: 'continuous', legacyGroup: 'continuous', legacyId: 'sectionDrive' },
    { featureId: 'inClimax', unifiedGroup: 'states', legacyGroup: 'continuous', legacyId: 'climaxState' },
    { featureId: 'inDrop', unifiedGroup: 'states', legacyGroup: 'continuous', legacyId: 'dropState' },
    { featureId: 'chordConfidence', unifiedGroup: 'continuous', legacyGroup: 'continuous', legacyId: 'chordConfidence' },
    { featureId: 'onset', unifiedGroup: 'events', legacyGroup: 'events', legacyId: 'onset' },
    { featureId: 'bassPeak', unifiedGroup: 'events', legacyGroup: 'events', legacyId: 'bassPeak' },
    { featureId: 'sectionBoundary', unifiedGroup: 'events', legacyGroup: 'events', legacyId: 'sectionBoundary' },
    { featureId: 'climaxEnter', unifiedGroup: 'events', legacyGroup: 'events', legacyId: 'climaxEnter' },
    { featureId: 'dropEnter', unifiedGroup: 'events', legacyGroup: 'events', legacyId: 'dropEnter' },
    { featureId: 'chordChange', unifiedGroup: 'events', legacyGroup: 'events', legacyId: 'chordChange' }
  ]);
  const RESOLVER_ONLY = Object.freeze([
    'dynamicRange',
    'spectralDensity',
    'flux',
    'flatness',
    'sharpness',
    'rhythmPhase',
    'silence',
    'inBuild',
    'sectionId',
    'sectionLabel',
    'chord'
  ]);

  const finite = value => Number.isFinite(Number(value));
  const clamp01 = value => finite(value)
    ? Math.max(0, Math.min(1, Number(value)))
    : 0;

  function copy(value) {
    if (Array.isArray(value)) return value.map(copy);
    if (!value || typeof value !== 'object') return value;
    return Object.fromEntries(
      Object.entries(value).map(([key, child]) => [key, copy(child)])
    );
  }

  function sourceIs(meta, prefix) {
    return String(meta?.sourceProvider || '').startsWith(prefix);
  }

  function rejectionCode(context = {}) {
    const code = String(
      context.xldValidationError ||
      context.xldStatus?.error ||
      ''
    );
    return XLD_REJECTION_CODES.has(code) ? code : null;
  }

  function realtimeIsStale(frame, context = {}) {
    const realtime = context.realtimeFrame;
    const realtimeMeta = realtime?.meta?.loudness;
    if (
      realtimeMeta?.fallbackReason === 'REALTIME_STALE' ||
      (
        realtimeMeta?.available === false &&
        Number(realtimeMeta?.ageMs) > 0
      )
    ) {
      return true;
    }
    const meta = frame?.meta?.loudness;
    return meta?.fallbackReason === 'REALTIME_STALE' ||
      (
        meta?.sourceProvider === 'neutral' &&
        meta?.fallbackReason === 'REALTIME_STALE'
      );
  }

  function classifyScenario(frame, context = {}) {
    if (rejectionCode(context)) return SCENARIOS.XLD_REJECTED;
    if (
      context.sourceMode === 'external' ||
      frame?.transport?.mode === 'external'
    ) {
      return SCENARIOS.EXTERNAL;
    }
    if (realtimeIsStale(frame, context)) {
      return SCENARIOS.REALTIME_STALE;
    }
    const structureMeta = frame?.meta?.sectionLabel ||
      frame?.meta?.sectionId;
    if (
      context.xldStatus?.loaded === true ||
      sourceIs(structureMeta, 'xld.')
    ) {
      return SCENARIOS.LOCAL_XLD;
    }
    return SCENARIOS.LOCAL_NO_XLD;
  }

  function provider(frame, featureId) {
    return String(frame?.meta?.[featureId]?.sourceProvider || 'neutral');
  }

  function providerAvailable(frame, featureId) {
    return frame?.meta?.[featureId]?.available === true;
  }

  function providerMatches(value, prefixes) {
    return prefixes.some(prefix => String(value).startsWith(prefix));
  }

  function evaluateScenario(scenario, frame, context = {}) {
    const playing = frame?.transport?.state === 'playing';
    const checks = [];
    const add = (id, pass, actual, expected) => {
      checks.push({ id, pass: Boolean(pass), actual, expected });
    };
    const energyProvider = provider(frame, 'loudness');
    const structureProvider = provider(frame, 'sectionLabel');
    const harmonyProvider = provider(frame, 'chord');

    if (!playing) {
      return {
        observed: false,
        pass: null,
        reason: 'TRANSPORT_NOT_PLAYING',
        checks
      };
    }

    if (scenario === SCENARIOS.LOCAL_XLD) {
      add(
        'energy-realtime',
        providerMatches(energyProvider, ['realtime.core']),
        energyProvider,
        'realtime.core'
      );
      add(
        'structure-xld',
        providerMatches(structureProvider, ['xld.']),
        structureProvider,
        'xld.*'
      );
      add(
        'harmony-xld',
        providerMatches(harmonyProvider, ['xld.']),
        harmonyProvider,
        'xld.*'
      );
    } else if (scenario === SCENARIOS.LOCAL_NO_XLD) {
      add(
        'energy-realtime',
        providerMatches(energyProvider, ['realtime.core']),
        energyProvider,
        'realtime.core'
      );
      add(
        'structure-fallback',
        providerMatches(structureProvider, ['realtime.heuristic', 'neutral']),
        structureProvider,
        'realtime.heuristic|neutral'
      );
      add(
        'no-xld-provider',
        !providerMatches(structureProvider, ['xld.']) &&
          !providerMatches(harmonyProvider, ['xld.']),
        `${structureProvider}|${harmonyProvider}`,
        'no xld.*'
      );
    } else if (scenario === SCENARIOS.EXTERNAL) {
      add(
        'energy-realtime',
        providerMatches(energyProvider, ['realtime.core']),
        energyProvider,
        'realtime.core'
      );
      add(
        'structure-low-confidence-fallback',
        providerMatches(structureProvider, ['realtime.heuristic', 'neutral']),
        structureProvider,
        'realtime.heuristic|neutral'
      );
      add(
        'external-transport',
        frame?.transport?.mode === 'external',
        frame?.transport?.mode,
        'external'
      );
    } else if (scenario === SCENARIOS.REALTIME_STALE) {
      add(
        'energy-held-or-neutral',
        providerMatches(energyProvider, ['held-last', 'neutral']),
        energyProvider,
        'held-last|neutral'
      );
      add(
        'stale-reason-preserved',
        ['HELD_LAST', 'REALTIME_STALE'].includes(
          frame?.meta?.loudness?.fallbackReason
        ),
        frame?.meta?.loudness?.fallbackReason,
        'HELD_LAST|REALTIME_STALE'
      );
      add(
        'structure-remains-xld',
        providerMatches(structureProvider, ['xld.']),
        structureProvider,
        'xld.*'
      );
    } else if (scenario === SCENARIOS.XLD_REJECTED) {
      add(
        'rejection-code-preserved',
        Boolean(rejectionCode(context)),
        rejectionCode(context),
        'known XLD rejection code'
      );
      add(
        'energy-realtime',
        providerMatches(energyProvider, ['realtime.core']),
        energyProvider,
        'realtime.core'
      );
      add(
        'no-rejected-xld-provider',
        !providerMatches(structureProvider, ['xld.']) &&
          !providerMatches(harmonyProvider, ['xld.']),
        `${structureProvider}|${harmonyProvider}`,
        'no xld.*'
      );
    }

    return {
      observed: true,
      pass: checks.length > 0 && checks.every(check => check.pass),
      reason: null,
      checks
    };
  }

  function legacySchema(snapshot) {
    const continuousKeys = Object.keys(
      snapshot?.continuous || {}
    ).sort();
    const eventKeys = Object.keys(snapshot?.events || {}).sort();
    const available = Boolean(
      snapshot &&
      snapshot.continuous &&
      snapshot.events
    );
    return {
      available,
      continuousKeys,
      eventKeys,
      frozenShape: available &&
        JSON.stringify(continuousKeys) ===
          JSON.stringify(LEGACY_CONTINUOUS_KEYS) &&
        JSON.stringify(eventKeys) ===
          JSON.stringify(LEGACY_EVENT_KEYS)
    };
  }

  function unifiedValue(frame, spec) {
    const meta = frame?.meta?.[spec.featureId];
    if (meta?.available !== true) return null;
    const raw = frame?.[spec.unifiedGroup]?.[spec.featureId];
    if (spec.unifiedGroup === 'events') {
      return raw && finite(raw.strength) ? clamp01(raw.strength) : 0;
    }
    return finite(raw) ? clamp01(raw) : null;
  }

  function legacyValue(snapshot, spec) {
    const raw = snapshot?.[spec.legacyGroup]?.[spec.legacyId];
    return finite(raw) ? clamp01(raw) : null;
  }

  function compare(frame, legacySnapshot) {
    return Object.fromEntries(COMPARABLE.map(spec => {
      const resolved = unifiedValue(frame, spec);
      const legacy = legacyValue(legacySnapshot, spec);
      return [
        spec.featureId,
        {
          legacyFeatureId: spec.legacyId,
          approximate: Boolean(spec.approximate),
          resolved,
          legacy,
          absoluteDelta: resolved === null || legacy === null
            ? null
            : Math.abs(resolved - legacy),
          sourceProvider: frame?.meta?.[spec.featureId]
            ?.sourceProvider || 'neutral',
          confidence: frame?.meta?.[spec.featureId]
            ?.confidence ?? null,
          available: providerAvailable(frame, spec.featureId)
        }
      ];
    }));
  }

  class ResolverLegacyShadow {
    constructor(options = {}) {
      this.intervalMs = Math.max(
        1,
        Number(options.intervalMs) || DEFAULT_INTERVAL_MS
      );
      this.reset();
    }

    reset() {
      this.lastSampleAt = -Infinity;
      this.sampleCount = 0;
      this.scenarioCounts = Object.fromEntries(
        Object.values(SCENARIOS).map(id => [id, 0])
      );
      this.latest = {
        version: VERSION,
        sampledAtMs: 0,
        sampleCount: 0,
        scenario: null,
        scenarioGate: {
          observed: false,
          pass: null,
          reason: 'NO_SAMPLE',
          checks: []
        },
        formalPipeline: FORMAL_PIPELINE,
        comparatorMode: 'read-only',
        legacy: legacySchema(null),
        comparisons: {},
        resolverOnly: [...RESOLVER_ONLY],
        isolation: {
          readsLegacySnapshotOnly: true,
          writesLegacyBus: false,
          writesRenderer: false,
          writesTimeline: false
        }
      };
      return this.get();
    }

    update(nowMs, frame, legacySnapshot, context = {}) {
      const engineNow = Math.max(0, Number(nowMs) || 0);
      if (
        engineNow - this.lastSampleAt < this.intervalMs &&
        this.sampleCount > 0
      ) {
        return this.get();
      }
      this.lastSampleAt = engineNow;
      const scenario = classifyScenario(frame, context);
      this.sampleCount++;
      this.scenarioCounts[scenario]++;
      this.latest = {
        version: VERSION,
        sampledAtMs: engineNow,
        sampleCount: this.sampleCount,
        scenario,
        scenarioGate: evaluateScenario(scenario, frame, context),
        formalPipeline: FORMAL_PIPELINE,
        comparatorMode: 'read-only',
        transport: copy(frame?.transport || null),
        providers: {
          energy: provider(frame, 'loudness'),
          structure: provider(frame, 'sectionLabel'),
          harmony: provider(frame, 'chord')
        },
        legacy: legacySchema(legacySnapshot),
        comparisons: compare(frame, legacySnapshot),
        resolverOnly: [...RESOLVER_ONLY],
        rejectionCode: rejectionCode(context),
        scenarioCounts: { ...this.scenarioCounts },
        isolation: {
          readsLegacySnapshotOnly: true,
          writesLegacyBus: false,
          writesRenderer: false,
          writesTimeline: false
        }
      };
      return this.get();
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
        scenario: this.latest.scenario,
        scenarioGate: copy(this.latest.scenarioGate),
        formalPipeline: FORMAL_PIPELINE,
        comparatorMode: 'read-only',
        legacyFrozenShape: this.latest.legacy.frozenShape,
        scenarioCounts: { ...this.scenarioCounts }
      };
    }
  }

  return Object.freeze({
    create: options => new ResolverLegacyShadow(options),
    classifyScenario,
    evaluateScenario,
    constants: Object.freeze({
      VERSION,
      FORMAL_PIPELINE,
      DEFAULT_INTERVAL_MS,
      SCENARIOS,
      XLD_REJECTION_CODES: Object.freeze([...XLD_REJECTION_CODES]),
      LEGACY_CONTINUOUS_KEYS,
      LEGACY_EVENT_KEYS,
      COMPARABLE,
      RESOLVER_ONLY
    })
  });
});
