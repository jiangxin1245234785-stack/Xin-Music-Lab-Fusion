(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.SmokeResonanceXldTimelineProvider = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';

  const CONTRACT = 'xin.music-frame/1';
  const CONTRACT_VERSION = 1;
  const XLD_MAJOR = 2;
  const XLD_MINOR = 0;
  const ADAPTER_VERSION = '2.2.0-shadow';
  const ERROR_CODES = Object.freeze({
    INPUT_NOT_OBJECT: 'XLD_INPUT_NOT_OBJECT',
    CONTRACT_MISSING: 'XLD_CONTRACT_MISSING',
    CONTRACT_UNSUPPORTED: 'XLD_CONTRACT_UNSUPPORTED',
    SCHEMA_UNSUPPORTED: 'XLD_SCHEMA_VERSION_UNSUPPORTED',
    REQUIRED_FIELD_MISSING: 'XLD_REQUIRED_FIELD_MISSING',
    REQUIRED_FIELD_INVALID: 'XLD_REQUIRED_FIELD_INVALID',
    TIMING_UNIT_UNSUPPORTED: 'XLD_TIMING_UNIT_UNSUPPORTED',
    TRACK_ID_MISMATCH: 'XLD_TRACK_ID_MISMATCH',
    TRACK_SOURCE_MISMATCH: 'XLD_TRACK_SOURCE_MISMATCH',
    DURATION_MISMATCH: 'XLD_DURATION_MISMATCH',
    SEGMENT_INVALID: 'XLD_SEGMENT_INVALID',
    NOT_LOADED: 'XLD_NOT_LOADED'
  });
  const STRUCTURE_PRIORITY = Object.freeze([
    'songformer',
    'msaf',
    'msaf-cnmf',
    'msaf-sf',
    'msaf-foote'
  ]);
  // Keep identical to CHORD_ENGINE_PRIOR in fusion.js (ChordMini primary since chords.2).
  const HARMONY_PRIOR = Object.freeze({
    'chord-chordmini': 1.5,
    'chord-btc': 1.35,
    'chord-consonance': 1,
    'chord-hybrid': 1,
    'chord-cqt': 1,
    'chord-cens': 1
  });
  const OUTPUT_FEATURES = Object.freeze([
    'sectionId',
    'sectionLabel',
    'chord',
    'chordConfidence',
    'silence',
    'inBuild',
    'inDrop',
    'inClimax'
  ]);

  const isObject = value =>
    typeof value === 'object' && value !== null && !Array.isArray(value);
  const clamp01 = value => {
    const numeric = Number(value);
    return Number.isFinite(numeric)
      ? Math.max(0, Math.min(1, numeric))
      : 0;
  };
  const nullableConfidence = value => {
    if (value === null || value === undefined) return null;
    const numeric = Number(value);
    return Number.isFinite(numeric) ? clamp01(numeric) : null;
  };
  const engineId = result =>
    String(result?.engine?.id || result?.engine || '').trim();
  const normalizeSource = value =>
    String(value || '').trim().replace(/\//g, '\\').toLowerCase();
  const durationToleranceMs = expectedDurationMs =>
    Math.max(1000, Math.max(0, Number(expectedDurationMs) || 0) * 0.005);

  function error(errorCode, path, details = {}) {
    return {
      ok: false,
      error: errorCode,
      path,
      details: { ...details }
    };
  }

  function parseContract(value) {
    if (typeof value !== 'string' || value.trim() === '') {
      return error(ERROR_CODES.CONTRACT_MISSING, 'contract');
    }
    const match = value.trim().match(/^xld\.music-lab\/(\d+)(?:\.(\d+))?$/);
    if (!match || Number(match[1]) !== XLD_MAJOR) {
      return error(ERROR_CODES.CONTRACT_UNSUPPORTED, 'contract', {
        received: value,
        supportedMajor: XLD_MAJOR
      });
    }
    return {
      ok: true,
      major: Number(match[1]),
      minor: match[2] === undefined ? XLD_MINOR : Number(match[2])
    };
  }

  function validateSegment(segment, path, requireLabel) {
    if (!isObject(segment)) {
      return error(ERROR_CODES.SEGMENT_INVALID, path);
    }
    const start = Number(segment.start);
    const end = Number(segment.end);
    if (!Number.isFinite(start) || start < 0) {
      return error(ERROR_CODES.SEGMENT_INVALID, `${path}.start`);
    }
    if (!Number.isFinite(end) || end <= start) {
      return error(ERROR_CODES.SEGMENT_INVALID, `${path}.end`);
    }
    if (
      requireLabel &&
      (typeof segment.label !== 'string' || segment.label.trim() === '')
    ) {
      return error(ERROR_CODES.SEGMENT_INVALID, `${path}.label`);
    }
    if (
      segment.confidence !== null &&
      segment.confidence !== undefined &&
      (!Number.isFinite(Number(segment.confidence)) ||
        Number(segment.confidence) < 0 ||
        Number(segment.confidence) > 1)
    ) {
      return error(ERROR_CODES.SEGMENT_INVALID, `${path}.confidence`);
    }
    return { ok: true };
  }

  function validateEngineResults(results, path, requireLabel) {
    if (!Array.isArray(results)) {
      return error(ERROR_CODES.REQUIRED_FIELD_MISSING, path);
    }
    for (let resultIndex = 0; resultIndex < results.length; resultIndex++) {
      const result = results[resultIndex];
      const resultPath = `${path}[${resultIndex}]`;
      if (!isObject(result) || !engineId(result)) {
        return error(
          ERROR_CODES.REQUIRED_FIELD_INVALID,
          `${resultPath}.engine`
        );
      }
      if (!Array.isArray(result.segments)) {
        return error(
          ERROR_CODES.REQUIRED_FIELD_MISSING,
          `${resultPath}.segments`
        );
      }
      for (
        let segmentIndex = 0;
        segmentIndex < result.segments.length;
        segmentIndex++
      ) {
        const validation = validateSegment(
          result.segments[segmentIndex],
          `${resultPath}.segments[${segmentIndex}]`,
          requireLabel
        );
        if (!validation.ok) return validation;
      }
    }
    return { ok: true };
  }

  function validateManualTags(tags) {
    if (!Array.isArray(tags)) {
      return error(ERROR_CODES.REQUIRED_FIELD_MISSING, 'manualTags');
    }
    for (let index = 0; index < tags.length; index++) {
      const path = `manualTags[${index}]`;
      const validation = validateSegment(tags[index], path, true);
      if (!validation.ok) return validation;
      if (typeof tags[index].id !== 'string' || tags[index].id.trim() === '') {
        return error(ERROR_CODES.REQUIRED_FIELD_INVALID, `${path}.id`);
      }
    }
    return { ok: true };
  }

  function validateDuration(manifestDurationMs, expectedDurationMs) {
    if (
      expectedDurationMs === null ||
      expectedDurationMs === undefined ||
      !Number.isFinite(Number(expectedDurationMs)) ||
      Number(expectedDurationMs) <= 0
    ) {
      return {
        ok: true,
        pending: true,
        expectedDurationMs: null,
        manifestDurationMs,
        toleranceMs: null
      };
    }
    const expected = Number(expectedDurationMs);
    const tolerance = durationToleranceMs(expected);
    const difference = Math.abs(manifestDurationMs - expected);
    if (difference > tolerance) {
      return error(ERROR_CODES.DURATION_MISMATCH, 'timing.duration', {
        expectedDurationMs: expected,
        manifestDurationMs,
        differenceMs: difference,
        toleranceMs: tolerance
      });
    }
    return {
      ok: true,
      pending: false,
      expectedDurationMs: expected,
      manifestDurationMs,
      differenceMs: difference,
      toleranceMs: tolerance
    };
  }

  function validateManifest(manifest, expected = {}) {
    if (!isObject(manifest)) {
      return error(ERROR_CODES.INPUT_NOT_OBJECT, 'manifest');
    }
    const contract = parseContract(manifest.contract);
    if (!contract.ok) return contract;
    if (Number(manifest.schemaVersion) !== XLD_MAJOR) {
      return error(
        ERROR_CODES.SCHEMA_UNSUPPORTED,
        'schemaVersion',
        { received: manifest.schemaVersion, supported: XLD_MAJOR }
      );
    }
    if (!isObject(manifest.track)) {
      return error(ERROR_CODES.REQUIRED_FIELD_MISSING, 'track');
    }
    if (
      typeof manifest.track.id !== 'string' ||
      manifest.track.id.trim() === ''
    ) {
      return error(ERROR_CODES.REQUIRED_FIELD_MISSING, 'track.id');
    }
    if (
      typeof manifest.track.source !== 'string' ||
      manifest.track.source.trim() === ''
    ) {
      return error(ERROR_CODES.REQUIRED_FIELD_MISSING, 'track.source');
    }
    if (!isObject(manifest.timing)) {
      return error(ERROR_CODES.REQUIRED_FIELD_MISSING, 'timing');
    }
    if (manifest.timing.unit !== 'seconds') {
      return error(
        ERROR_CODES.TIMING_UNIT_UNSUPPORTED,
        'timing.unit',
        { received: manifest.timing.unit }
      );
    }
    const durationSeconds = Number(manifest.timing.duration);
    if (!Number.isFinite(durationSeconds) || durationSeconds < 0) {
      return error(
        ERROR_CODES.REQUIRED_FIELD_INVALID,
        'timing.duration'
      );
    }
    const structureValidation = validateEngineResults(
      manifest.analyses,
      'analyses',
      false
    );
    if (!structureValidation.ok) return structureValidation;
    const harmonyValidation = validateEngineResults(
      manifest.harmony,
      'harmony',
      true
    );
    if (!harmonyValidation.ok) return harmonyValidation;
    const manualValidation = validateManualTags(manifest.manualTags);
    if (!manualValidation.ok) return manualValidation;

    if (
      expected.trackId !== null &&
      expected.trackId !== undefined &&
      String(expected.trackId) !== manifest.track.id
    ) {
      return error(ERROR_CODES.TRACK_ID_MISMATCH, 'track.id', {
        expected: String(expected.trackId),
        received: manifest.track.id
      });
    }
    if (
      expected.sourcePath &&
      normalizeSource(expected.sourcePath) !==
        normalizeSource(manifest.track.source)
    ) {
      return error(ERROR_CODES.TRACK_SOURCE_MISMATCH, 'track.source', {
        expected: String(expected.sourcePath),
        received: manifest.track.source
      });
    }

    const manifestDurationMs = durationSeconds * 1000;
    const duration = validateDuration(
      manifestDurationMs,
      expected.durationMs
    );
    if (!duration.ok) return duration;
    return {
      ok: true,
      contractMajor: contract.major,
      contractMinor: contract.minor,
      trackId: manifest.track.id,
      sourcePath: manifest.track.source,
      manifestDurationMs,
      duration
    };
  }

  function normalizeSegment(segment, index) {
    return {
      index,
      id: typeof segment.id === 'string' ? segment.id : '',
      startMs: Number(segment.start) * 1000,
      endMs: Number(segment.end) * 1000,
      label: typeof segment.label === 'string' ? segment.label.trim() : '',
      confidence: nullableConfidence(segment.confidence),
      updatedAt: typeof segment.updatedAt === 'string'
        ? segment.updatedAt
        : ''
    };
  }

  function createSegmentIndex(segments) {
    return segments
      .map(normalizeSegment)
      .sort((left, right) =>
        left.startMs - right.startMs ||
        left.endMs - right.endMs ||
        left.index - right.index
      );
  }

  function segmentAt(index, mediaTimeMs) {
    let low = 0;
    let high = index.length - 1;
    let candidate = -1;
    while (low <= high) {
      const middle = (low + high) >>> 1;
      if (index[middle].startMs <= mediaTimeMs) {
        candidate = middle;
        low = middle + 1;
      } else {
        high = middle - 1;
      }
    }
    if (candidate < 0) return null;
    const segment = index[candidate];
    return mediaTimeMs < segment.endMs ? segment : null;
  }

  function activeManualTags(index, mediaTimeMs) {
    const active = [];
    for (let cursor = index.length - 1; cursor >= 0; cursor--) {
      const segment = index[cursor];
      if (segment.startMs > mediaTimeMs) continue;
      if (mediaTimeMs < segment.endMs) active.push(segment);
    }
    return active.sort((left, right) =>
      left.updatedAt.localeCompare(right.updatedAt) ||
      left.id.localeCompare(right.id)
    );
  }

  function normalizeSemanticLabel(label) {
    return String(label || '')
      .trim()
      .toLowerCase()
      .replace(/[\s_]+/g, '-');
  }

  function semanticStates(labels) {
    const normalized = labels.map(normalizeSemanticLabel);
    const has = values => normalized.some(label => values.includes(label));
    return {
      silence: has(['silence', 'silent', 'empty', '留白', '静音']) ? 1 : 0,
      inBuild: has(['build', 'buildup', 'build-up', 'pre-chorus', '推进']) ? 1 : 0,
      inDrop: has(['drop', 'breakdown', '抽空']) ? 1 : 0,
      inClimax: has(['climax', 'tutti', '高潮', '全奏']) ? 1 : 0
    };
  }

  function parseRoot(label) {
    const match = String(label || '').match(/^([A-G])([#b]?)/);
    if (!match) return '';
    const root = `${match[1]}${match[2] || ''}`;
    return ({
      Db: 'C#',
      Eb: 'D#',
      Gb: 'F#',
      Ab: 'G#',
      Bb: 'A#'
    })[root] || root;
  }

  function copyMeta(meta) {
    return {
      ...meta,
      providerDetail: { ...meta.providerDetail }
    };
  }

  function copyFrame(frame) {
    return {
      contract: frame.contract,
      contractVersion: frame.contractVersion,
      clock: { ...frame.clock },
      transport: { ...frame.transport },
      continuous: { ...frame.continuous },
      states: { ...frame.states },
      events: { ...frame.events },
      labels: { ...frame.labels },
      meta: Object.fromEntries(
        Object.entries(frame.meta).map(([key, value]) => [
          key,
          copyMeta(value)
        ])
      )
    };
  }

  function featureMeta(provider, engine, version, confidence, available) {
    return {
      sourceProvider: provider,
      providerDetail: {
        engineId: engine,
        providerVersion: version || ADAPTER_VERSION
      },
      confidence: available ? confidence : null,
      available,
      ageMs: 0,
      fallbackReason: available ? null : 'PROVIDER_UNAVAILABLE'
    };
  }

  function fallbackReasonForError(errorCode) {
    if (errorCode === ERROR_CODES.CONTRACT_UNSUPPORTED ||
      errorCode === ERROR_CODES.SCHEMA_UNSUPPORTED) {
      return 'XLD_CONTRACT_UNSUPPORTED';
    }
    if (errorCode === ERROR_CODES.TRACK_ID_MISMATCH ||
      errorCode === ERROR_CODES.TRACK_SOURCE_MISMATCH) {
      return 'TRACK_ID_MISMATCH';
    }
    if (errorCode === ERROR_CODES.DURATION_MISMATCH) {
      return 'DURATION_MISMATCH';
    }
    return 'PROVIDER_UNAVAILABLE';
  }

  class XldTimelineProviderAdapter {
    constructor() {
      this.frameIndex = 0;
      this.cacheBuilds = 0;
      this.reset();
    }

    reset() {
      this.manifest = null;
      this.validation = null;
      this.durationState = 'pending';
      this.durationValidation = null;
      this.cache = {
        manual: [],
        analyses: new Map(),
        harmony: new Map()
      };
      this.frame = this.unavailableFrame(
        ERROR_CODES.NOT_LOADED,
        {},
        {}
      );
      return this.get();
    }

    load(manifest, expected = {}) {
      const validation = validateManifest(manifest, expected);
      this.validation = validation;
      if (!validation.ok) {
        this.manifest = null;
        this.durationState = 'rejected';
        this.frame = this.unavailableFrame(validation.error, {}, {});
        return { ...validation };
      }
      this.manifest = manifest;
      this.durationValidation = validation.duration;
      this.durationState = validation.duration.pending
        ? 'pending'
        : 'accepted';
      this.cache = {
        manual: createSegmentIndex(manifest.manualTags),
        analyses: new Map(manifest.analyses.map(result => [
          engineId(result),
          {
            id: engineId(result),
            name: String(result.engine?.name || engineId(result)),
            version: String(
              result.engine?.version ||
              manifest.producer?.version ||
              ADAPTER_VERSION
            ),
            segments: createSegmentIndex(result.segments)
          }
        ])),
        harmony: new Map(manifest.harmony.map(result => [
          engineId(result),
          {
            id: engineId(result),
            name: String(result.engine?.name || engineId(result)),
            version: String(
              result.engine?.version ||
              manifest.producer?.version ||
              ADAPTER_VERSION
            ),
            segments: createSegmentIndex(result.segments)
          }
        ]))
      };
      this.cacheBuilds++;
      return {
        ...validation,
        durationState: this.durationState,
        cache: this.cacheStats()
      };
    }

    setPlaybackDuration(durationMs) {
      if (!this.manifest || !this.validation?.ok) {
        return error(ERROR_CODES.NOT_LOADED, 'manifest');
      }
      const validation = validateDuration(
        this.validation.manifestDurationMs,
        durationMs
      );
      this.durationValidation = validation;
      this.durationState = validation.ok
        ? validation.pending ? 'pending' : 'accepted'
        : 'rejected';
      if (!validation.ok) {
        this.frame = this.unavailableFrame(validation.error, {}, {});
      }
      return { ...validation, durationState: this.durationState };
    }

    cacheStats() {
      return {
        builds: this.cacheBuilds,
        manualSegments: this.cache.manual.length,
        analyses: Object.fromEntries(
          [...this.cache.analyses].map(([id, value]) => [
            id,
            value.segments.length
          ])
        ),
        harmony: Object.fromEntries(
          [...this.cache.harmony].map(([id, value]) => [
            id,
            value.segments.length
          ])
        )
      };
    }

    selectStructure(engineSelection) {
      if (
        engineSelection &&
        engineSelection !== 'auto' &&
        this.cache.analyses.has(engineSelection)
      ) {
        return this.cache.analyses.get(engineSelection);
      }
      for (const id of STRUCTURE_PRIORITY) {
        if (this.cache.analyses.has(id)) return this.cache.analyses.get(id);
      }
      return this.cache.analyses.values().next().value || null;
    }

    selectHarmony(mediaTimeMs, engineSelection) {
      if (
        engineSelection &&
        engineSelection !== 'consensus' &&
        this.cache.harmony.has(engineSelection)
      ) {
        const engine = this.cache.harmony.get(engineSelection);
        const segment = segmentAt(engine.segments, mediaTimeMs);
        return segment ? {
          label: segment.label,
          confidence: segment.confidence,
          engineId: engine.id,
          version: engine.version,
          segmentIndex: segment.index,
          token: `${engine.id}:${segment.index}`
        } : null;
      }
      const candidates = [];
      for (const engine of this.cache.harmony.values()) {
        const segment = segmentAt(engine.segments, mediaTimeMs);
        const root = parseRoot(segment?.label);
        if (!segment || !root) continue;
        const confidence = segment.confidence ?? 0;
        candidates.push({
          root,
          label: segment.label,
          confidence,
          engineId: engine.id,
          version: engine.version,
          segmentIndex: segment.index,
          weight: confidence * (HARMONY_PRIOR[engine.id] || 1)
        });
      }
      if (!candidates.length) return null;
      const roots = new Map();
      for (const candidate of candidates) {
        const bucket = roots.get(candidate.root) || {
          root: candidate.root,
          weight: 0,
          members: []
        };
        bucket.weight += candidate.weight;
        bucket.members.push(candidate);
        roots.set(candidate.root, bucket);
      }
      const winner = [...roots.values()].sort((left, right) =>
        right.weight - left.weight ||
        left.root.localeCompare(right.root)
      )[0];
      const strongest = winner.members.sort((left, right) =>
        right.weight - left.weight ||
        left.engineId.localeCompare(right.engineId)
      )[0];
      const totalWeight = candidates.reduce(
        (sum, candidate) => sum + candidate.weight,
        0
      );
      return {
        label: strongest.label,
        confidence: totalWeight > 0
          ? clamp01(winner.weight / totalWeight)
          : 0,
        engineId: `consensus:${winner.members
          .map(member => member.engineId)
          .sort()
          .join('+')}`,
        version: ADAPTER_VERSION,
        segmentIndex: strongest.segmentIndex,
        token: `consensus:${winner.members
          .sort((left, right) => left.engineId.localeCompare(right.engineId))
          .map(member => `${member.engineId}:${member.segmentIndex}`)
          .join('+')}`
      };
    }

    cursorAt(mediaTimeMs, options = {}) {
      if (
        !this.manifest ||
        !this.validation?.ok ||
        this.durationState !== 'accepted'
      ) {
        return {
          available: false,
          error: this.durationValidation?.error ||
            this.validation?.error ||
            ERROR_CODES.NOT_LOADED,
          section: null,
          harmony: null
        };
      }
      const time = Math.max(0, Number(mediaTimeMs) || 0);
      const manualTags = activeManualTags(this.cache.manual, time);
      const latestManual = manualTags.at(-1) || null;
      const structureEngine = this.selectStructure(
        options.structureEngineId
      );
      const structureSegment = structureEngine
        ? segmentAt(structureEngine.segments, time)
        : null;
      const harmony = this.selectHarmony(
        time,
        options.harmonyEngineId
      );
      const section = latestManual
        ? {
            token: `manual:${latestManual.id}`,
            provider: 'xld.manual',
            engineId: 'manual-tags',
            segmentIndex: latestManual.index,
            startMs: latestManual.startMs,
            endMs: latestManual.endMs
          }
        : structureSegment
          ? {
              token: `${structureEngine.id}:${structureSegment.index}`,
              provider: structureEngine.id === 'songformer'
                ? 'xld.songformer'
                : 'xld.msaf',
              engineId: structureEngine.id,
              segmentIndex: structureSegment.index,
              startMs: structureSegment.startMs,
              endMs: structureSegment.endMs
            }
          : null;
      return {
        available: true,
        error: null,
        section,
        harmony: harmony
          ? {
              token: harmony.token,
              provider: 'xld.harmony',
              engineId: harmony.engineId,
              segmentIndex: harmony.segmentIndex,
              label: harmony.label
            }
          : null
      };
    }

    normalizeClock(clock = {}) {
      const nowMs = Math.max(0, Number(clock.nowMs) || 0);
      const output = {
        frameIndex: Number.isFinite(Number(clock.frameIndex))
          ? Math.max(0, Math.floor(Number(clock.frameIndex)))
          : this.frameIndex++,
        nowMs,
        deltaMs: Math.max(0, Number(clock.deltaMs) || 0)
      };
      return output;
    }

    normalizeTransport(transport = {}, mediaTimeMs = null) {
      const states = ['playing', 'paused', 'seeking', 'stopped'];
      const resolvedMediaTimeMs = mediaTimeMs !== null
        ? Math.max(0, Number(mediaTimeMs) || 0)
        : transport.mediaTimeMs !== null &&
            transport.mediaTimeMs !== undefined &&
            Number.isFinite(Number(transport.mediaTimeMs))
          ? Math.max(0, Number(transport.mediaTimeMs))
          : null;
      const resolvedDurationMs =
        transport.durationMs !== null &&
        transport.durationMs !== undefined &&
        Number.isFinite(Number(transport.durationMs))
          ? Math.max(0, Number(transport.durationMs))
          : this.durationValidation?.expectedDurationMs ?? null;
      return {
        mode: transport.mode === 'external' ? 'external' : 'internal',
        state: states.includes(transport.state)
          ? transport.state
          : 'stopped',
        trackId: typeof transport.trackId === 'string'
          ? transport.trackId
          : this.validation?.trackId || null,
        mediaTimeMs: resolvedMediaTimeMs,
        durationMs: resolvedDurationMs,
        epoch: Number.isFinite(Number(transport.epoch))
          ? Math.max(0, Math.floor(Number(transport.epoch)))
          : 0
      };
    }

    unavailableFrame(errorCode, clockInput, transportInput) {
      const fallbackReason = fallbackReasonForError(errorCode);
      const meta = Object.fromEntries(OUTPUT_FEATURES.map(featureId => [
        featureId,
        {
          sourceProvider: 'neutral',
          providerDetail: {
            engineId: 'xld-timeline-adapter',
            providerVersion: ADAPTER_VERSION
          },
          confidence: null,
          available: false,
          ageMs: 0,
          fallbackReason
        }
      ]));
      return {
        contract: CONTRACT,
        contractVersion: CONTRACT_VERSION,
        clock: this.normalizeClock(clockInput),
        transport: this.normalizeTransport(transportInput),
        continuous: { chordConfidence: 0 },
        states: {
          silence: 0,
          inBuild: 0,
          inDrop: 0,
          inClimax: 0
        },
        events: {},
        labels: {
          sectionId: null,
          sectionLabel: null,
          chord: null
        },
        meta
      };
    }

    frameAt(mediaTimeMs, options = {}) {
      const clock = this.normalizeClock(options.clock);
      const transport = this.normalizeTransport(
        options.transport,
        Number.isFinite(Number(mediaTimeMs))
          ? Math.max(0, Number(mediaTimeMs))
          : null
      );
      if (options.active === false) {
        this.frame = this.unavailableFrame(
          ERROR_CODES.NOT_LOADED,
          clock,
          transport
        );
        return this.get();
      }
      if (!this.manifest || !this.validation?.ok) {
        this.frame = this.unavailableFrame(
          this.validation?.error || ERROR_CODES.NOT_LOADED,
          clock,
          transport
        );
        return this.get();
      }
      if (this.durationState !== 'accepted') {
        this.frame = this.unavailableFrame(
          this.durationValidation?.error || ERROR_CODES.NOT_LOADED,
          clock,
          transport
        );
        return this.get();
      }

      const time = Math.max(0, Number(mediaTimeMs) || 0);
      const manualTags = activeManualTags(this.cache.manual, time);
      const latestManual = manualTags.at(-1) || null;
      const structureEngine = this.selectStructure(
        options.structureEngineId
      );
      const structureSegment = structureEngine
        ? segmentAt(structureEngine.segments, time)
        : null;
      const useManual = Boolean(latestManual);
      const structureProvider = useManual
        ? 'xld.manual'
        : structureEngine?.id === 'songformer'
          ? 'xld.songformer'
          : 'xld.msaf';
      const structureVersion = useManual
        ? ADAPTER_VERSION
        : structureEngine?.version || ADAPTER_VERSION;
      const semantic = useManual || structureEngine?.id === 'songformer';
      const sectionId = useManual
        ? `manual:${latestManual.id}`
        : structureSegment
          ? structureEngine.id === 'songformer'
            ? `${structureEngine.id}:${structureSegment.label}:${structureSegment.index}`
            : `${structureEngine.id}:cluster:${structureSegment.label || structureSegment.index}`
          : null;
      const sectionLabel = useManual
        ? latestManual.label
        : semantic && structureSegment
          ? structureSegment.label
          : null;
      const sectionConfidence = useManual
        ? 1
        : structureSegment?.confidence ?? null;
      const semanticLabels = useManual
        ? manualTags.map(tag => tag.label)
        : semantic && structureSegment
          ? [structureSegment.label]
          : [];
      const states = semanticStates(semanticLabels);
      const harmony = this.selectHarmony(
        time,
        options.harmonyEngineId
      );
      const meta = {};

      if (sectionId) {
        meta.sectionId = featureMeta(
          structureProvider,
          useManual ? 'manual-tags' : structureEngine.id,
          structureVersion,
          sectionConfidence,
          true
        );
        meta.sectionLabel = featureMeta(
          structureProvider,
          useManual ? 'manual-tags' : structureEngine.id,
          structureVersion,
          sectionConfidence,
          Boolean(sectionLabel)
        );
      }
      if (semanticLabels.length) {
        for (const featureId of [
          'silence',
          'inBuild',
          'inDrop',
          'inClimax'
        ]) {
          meta[featureId] = featureMeta(
            structureProvider,
            useManual ? 'manual-tags' : structureEngine.id,
            structureVersion,
            sectionConfidence,
            true
          );
        }
      }
      if (harmony) {
        meta.chord = featureMeta(
          'xld.harmony',
          harmony.engineId,
          harmony.version,
          harmony.confidence,
          true
        );
        meta.chordConfidence = copyMeta(meta.chord);
      }

      this.frame = {
        contract: CONTRACT,
        contractVersion: CONTRACT_VERSION,
        clock,
        transport,
        continuous: harmony
          ? { chordConfidence: harmony.confidence ?? 0 }
          : {},
        states: semanticLabels.length ? states : {},
        events: {},
        labels: {
          ...(sectionId ? { sectionId } : {}),
          ...(sectionLabel ? { sectionLabel } : {}),
          ...(harmony ? { chord: harmony.label } : {})
        },
        meta
      };
      return this.get();
    }

    status() {
      return {
        loaded: Boolean(this.manifest && this.validation?.ok),
        error: this.validation?.ok
          ? this.durationValidation?.ok === false
            ? this.durationValidation.error
            : null
          : this.validation?.error || ERROR_CODES.NOT_LOADED,
        durationState: this.durationState,
        trackId: this.validation?.ok ? this.validation.trackId : null,
        contractMajor: this.validation?.ok
          ? this.validation.contractMajor
          : null,
        contractMinor: this.validation?.ok
          ? this.validation.contractMinor
          : null,
        cache: this.cacheStats()
      };
    }

    get() {
      return copyFrame(this.frame);
    }
  }

  return Object.freeze({
    create: () => new XldTimelineProviderAdapter(),
    validateManifest,
    durationToleranceMs,
    constants: Object.freeze({
      CONTRACT,
      CONTRACT_VERSION,
      XLD_MAJOR,
      XLD_MINOR,
      ADAPTER_VERSION,
      ERROR_CODES,
      STRUCTURE_PRIORITY,
      HARMONY_PRIOR,
      OUTPUT_FEATURES
    })
  });
});
