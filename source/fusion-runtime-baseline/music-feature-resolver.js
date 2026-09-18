(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.SmokeResonanceMusicFeatureResolver = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';

  const CONTRACT = 'xin.music-frame/1';
  const CONTRACT_VERSION = 1;
  const RESOLVER_VERSION = '2.3.0-shadow';
  const RESOLVER_ENGINE = 'xml-music-feature-resolver';
  const CONTINUOUS = Object.freeze([
    'loudness',
    'bass',
    'mid',
    'treble',
    'dynamicRange',
    'spectralDensity',
    'flux',
    'flatness',
    'sharpness',
    'buildEnergy',
    'sectionDrive',
    'rhythmPhase',
    'chordConfidence'
  ]);
  const STATES = Object.freeze([
    'silence',
    'inBuild',
    'inDrop',
    'inClimax'
  ]);
  const EVENTS = Object.freeze([
    'onset',
    'bassPeak',
    'sectionBoundary',
    'dropEnter',
    'climaxEnter',
    'chordChange'
  ]);
  const LABELS = Object.freeze([
    'sectionId',
    'sectionLabel',
    'chord'
  ]);
  const ALL_FEATURES = Object.freeze([
    ...CONTINUOUS,
    ...STATES,
    ...EVENTS,
    ...LABELS
  ]);
  const REALTIME_CORE_CONTINUOUS = Object.freeze([
    'loudness',
    'bass',
    'mid',
    'treble',
    'flux'
  ]);
  const HEURISTIC_CONTINUOUS = Object.freeze([
    'dynamicRange',
    'spectralDensity',
    'flatness',
    'sharpness',
    'buildEnergy',
    'sectionDrive',
    'rhythmPhase'
  ]);
  const ALLOWED_FALLBACKS = new Set([
    'NO_SOURCE',
    'NO_XLD',
    'XLD_CONTRACT_UNSUPPORTED',
    'TRACK_ID_MISMATCH',
    'DURATION_MISMATCH',
    'REALTIME_STALE',
    'PROVIDER_UNAVAILABLE',
    'HELD_LAST'
  ]);
  const EPOCH_TRANSITIONS = new Set([
    'seek',
    'loop',
    'track-change',
    'mode-change'
  ]);
  const QUIET_TRANSITIONS = new Set([
    'init',
    'play',
    'pause',
    'resume',
    'stop',
    'seek',
    'loop',
    'track-change',
    'mode-change'
  ]);

  const clamp01 = value => {
    const number = Number(value);
    return Number.isFinite(number)
      ? Math.max(0, Math.min(1, number))
      : 0;
  };

  const nonNegative = (value, fallback = 0) => {
    const number = Number(value);
    return Number.isFinite(number)
      ? Math.max(0, number)
      : fallback;
  };

  const nonNegativeInteger = (value, fallback = 0) => {
    const number = Number(value);
    return Number.isFinite(number)
      ? Math.max(0, Math.floor(number))
      : fallback;
  };

  function stableHash(value) {
    let hash = 0x811c9dc5;
    const input = String(value ?? '');
    for (let index = 0; index < input.length; index++) {
      hash ^= input.charCodeAt(index);
      hash = Math.imul(hash, 0x01000193);
    }
    return (hash >>> 0).toString(16).padStart(8, '0');
  }

  function copyMeta(meta) {
    return {
      ...meta,
      providerDetail: { ...meta.providerDetail }
    };
  }

  function copyEvent(event) {
    return event ? { ...event } : null;
  }

  function copyFrame(frame) {
    return {
      contract: frame.contract,
      contractVersion: frame.contractVersion,
      clock: { ...frame.clock },
      transport: { ...frame.transport },
      continuous: { ...frame.continuous },
      states: { ...frame.states },
      events: Object.fromEntries(
        EVENTS.map(featureId => [
          featureId,
          copyEvent(frame.events[featureId])
        ])
      ),
      labels: { ...frame.labels },
      meta: Object.fromEntries(
        ALL_FEATURES.map(featureId => [
          featureId,
          copyMeta(frame.meta[featureId])
        ])
      )
    };
  }

  function normalizeClock(input = {}, previous = null) {
    const nowMs = nonNegative(input.nowMs, previous?.nowMs || 0);
    return {
      frameIndex: nonNegativeInteger(
        input.frameIndex,
        (previous?.frameIndex || 0) + 1
      ),
      nowMs,
      deltaMs: nonNegative(
        input.deltaMs,
        previous ? Math.max(0, nowMs - previous.nowMs) : 0
      )
    };
  }

  function normalizeTransport(input = {}, epoch = 0) {
    const mode = ['internal', 'external', 'offline-test'].includes(input.mode)
      ? input.mode
      : 'external';
    const state = ['playing', 'paused', 'seeking', 'stopped'].includes(
      input.state
    )
      ? input.state
      : 'stopped';
    return {
      mode,
      state,
      trackId: typeof input.trackId === 'string' && input.trackId
        ? input.trackId
        : null,
      mediaTimeMs: input.mediaTimeMs === null ||
        input.mediaTimeMs === undefined
        ? null
        : nonNegative(input.mediaTimeMs),
      durationMs: input.durationMs === null ||
        input.durationMs === undefined
        ? null
        : nonNegative(input.durationMs),
      epoch: nonNegativeInteger(epoch)
    };
  }

  function fallbackReason(meta, defaultReason = 'NO_SOURCE') {
    return ALLOWED_FALLBACKS.has(meta?.fallbackReason)
      ? meta.fallbackReason
      : defaultReason;
  }

  function neutralMeta(reason = 'NO_SOURCE') {
    return {
      sourceProvider: 'neutral',
      providerDetail: {
        engineId: RESOLVER_ENGINE,
        providerVersion: RESOLVER_VERSION
      },
      confidence: null,
      available: false,
      ageMs: 0,
      fallbackReason: ALLOWED_FALLBACKS.has(reason)
        ? reason
        : 'NO_SOURCE'
    };
  }

  function heldMeta(previous, ageMs) {
    return {
      sourceProvider: 'held-last',
      providerDetail: {
        engineId: previous.meta.providerDetail?.engineId ||
          RESOLVER_ENGINE,
        providerVersion: previous.meta.providerDetail?.providerVersion ||
          RESOLVER_VERSION
      },
      confidence: previous.meta.confidence ?? null,
      available: true,
      ageMs,
      fallbackReason: 'HELD_LAST'
    };
  }

  function featureGroup(featureId) {
    if (CONTINUOUS.includes(featureId)) return 'continuous';
    if (STATES.includes(featureId)) return 'states';
    if (LABELS.includes(featureId)) return 'labels';
    return 'events';
  }

  function hasFeature(frame, featureId) {
    const group = featureGroup(featureId);
    return Boolean(
      frame &&
      frame[group] &&
      Object.prototype.hasOwnProperty.call(frame[group], featureId)
    );
  }

  function featureValue(frame, featureId) {
    return frame?.[featureGroup(featureId)]?.[featureId];
  }

  function isNumericFeature(featureId) {
    return CONTINUOUS.includes(featureId) || STATES.includes(featureId);
  }

  function validValue(featureId, value) {
    if (isNumericFeature(featureId)) {
      return Number.isFinite(Number(value));
    }
    return typeof value === 'string' && value.length > 0;
  }

  function isRealtimeProvider(provider) {
    return provider === 'realtime.core' ||
      provider === 'realtime.heuristic';
  }

  class MusicFeatureResolver {
    constructor(options = {}) {
      this.options = {
        realtimeTtlMs: Math.max(
          1,
          Number(options.realtimeTtlMs) || 150
        ),
        holdLastMs: Math.max(
          0,
          Number(options.holdLastMs) || 350
        ),
        discontinuityFloorMs: Math.max(
          250,
          Number(options.discontinuityFloorMs) || 1000
        ),
        providerVersion: String(
          options.providerVersion || RESOLVER_VERSION
        )
      };
      this.reset();
    }

    reset(clockInput = {}) {
      this.lastClock = normalizeClock(clockInput);
      this.transport = null;
      this.epoch = 0;
      this.lastTransitionSerial = null;
      this.lastTransition = 'init';
      this.history = new Map();
      this.providerEventIds = new Map();
      this.realtimeEventSerial = 0;
      this.seenEventIds = new Set();
      this.baseline = null;
      this.frame = this.composeNeutralFrame(
        this.lastClock,
        normalizeTransport({}, this.epoch)
      );
      return this.get();
    }

    composeNeutralFrame(clock, transport) {
      return {
        contract: CONTRACT,
        contractVersion: CONTRACT_VERSION,
        clock,
        transport,
        continuous: Object.fromEntries(
          CONTINUOUS.map(featureId => [featureId, 0])
        ),
        states: Object.fromEntries(
          STATES.map(featureId => [featureId, 0])
        ),
        events: Object.fromEntries(
          EVENTS.map(featureId => [featureId, null])
        ),
        labels: Object.fromEntries(
          LABELS.map(featureId => [featureId, null])
        ),
        meta: Object.fromEntries(
          ALL_FEATURES.map(featureId => [
            featureId,
            neutralMeta('NO_SOURCE')
          ])
        )
      };
    }

    transitionTransport(clock, transportInput, transitionInput) {
      const previous = this.transport;
      const provisional = normalizeTransport(transportInput, this.epoch);
      const transition = transitionInput &&
        typeof transitionInput.type === 'string'
        ? {
            type: transitionInput.type,
            serial: nonNegativeInteger(transitionInput.serial)
          }
        : null;
      const transitionIsNew = Boolean(
        transition &&
        transition.serial !== this.lastTransitionSerial
      );
      const reasons = new Set();

      if (previous) {
        if (previous.mode !== provisional.mode) reasons.add('mode-change');
        if (previous.trackId !== provisional.trackId) {
          reasons.add('track-change');
        }
        if (
          provisional.state === 'seeking' &&
          previous.state !== 'seeking'
        ) {
          reasons.add('seek');
        }
        if (
          previous.mediaTimeMs !== null &&
          provisional.mediaTimeMs !== null &&
          previous.state === 'playing' &&
          provisional.state === 'playing'
        ) {
          const mediaDelta =
            provisional.mediaTimeMs - previous.mediaTimeMs;
          const forwardLimit = Math.max(
            this.options.discontinuityFloorMs,
            clock.deltaMs * 4 + 250
          );
          if (mediaDelta < -250) {
            const duration = provisional.durationMs ||
              previous.durationMs;
            const looksLikeLoop = Boolean(
              duration &&
              previous.mediaTimeMs > duration * 0.75 &&
              provisional.mediaTimeMs < duration * 0.25
            );
            reasons.add(looksLikeLoop ? 'loop' : 'seek');
          } else if (mediaDelta > forwardLimit) {
            reasons.add('seek');
          }
        }
      }

      if (transitionIsNew) {
        this.lastTransitionSerial = transition.serial;
        this.lastTransition = transition.type;
        if (EPOCH_TRANSITIONS.has(transition.type)) {
          reasons.add(transition.type);
        }
      }

      const epochChanged = Boolean(previous && reasons.size);
      if (epochChanged) {
        this.epoch++;
        this.history.clear();
        this.providerEventIds.clear();
        this.realtimeEventSerial = 0;
        this.seenEventIds.clear();
        this.baseline = null;
      } else if (!previous) {
        this.epoch = nonNegativeInteger(transportInput?.epoch);
      }

      const transport = normalizeTransport(transportInput, this.epoch);
      this.transport = transport;
      const playbackStateChanged = Boolean(
        previous && previous.state !== transport.state
      );
      const transitionType = transitionIsNew
        ? transition.type
        : epochChanged
          ? [...reasons].sort()[0]
          : 'tick';
      const suppressEvents = !previous ||
        epochChanged ||
        transport.state !== 'playing' ||
        playbackStateChanged ||
        (transitionIsNew && QUIET_TRANSITIONS.has(transition.type));

      return {
        transport,
        epochChanged,
        transitionType,
        suppressEvents,
        reasons: [...reasons].sort()
      };
    }

    candidate(frame, featureId) {
      if (!hasFeature(frame, featureId)) return null;
      const value = featureValue(frame, featureId);
      const meta = frame?.meta?.[featureId];
      if (!meta || meta.available !== true) {
        return {
          usable: false,
          value,
          meta,
          reason: fallbackReason(meta, 'PROVIDER_UNAVAILABLE')
        };
      }
      if (!validValue(featureId, value)) {
        return {
          usable: false,
          value,
          meta,
          reason: 'PROVIDER_UNAVAILABLE'
        };
      }
      const ageMs = nonNegative(meta.ageMs);
      if (
        isRealtimeProvider(meta.sourceProvider) &&
        ageMs > this.options.realtimeTtlMs
      ) {
        return {
          usable: false,
          value,
          meta,
          reason: 'REALTIME_STALE'
        };
      }
      return {
        usable: true,
        value: isNumericFeature(featureId)
          ? clamp01(value)
          : value,
        meta: {
          sourceProvider: meta.sourceProvider,
          providerDetail: {
            engineId: String(meta.providerDetail?.engineId || ''),
            providerVersion: String(
              meta.providerDetail?.providerVersion || ''
            )
          },
          confidence: meta.confidence === null ||
            meta.confidence === undefined
            ? null
            : clamp01(meta.confidence),
          available: true,
          ageMs,
          fallbackReason: null
        },
        reason: null
      };
    }

    choose(featureId, frames, clock, options = {}) {
      let reason = options.defaultReason || 'NO_SOURCE';
      for (const frame of frames) {
        const candidate = this.candidate(frame, featureId);
        if (!candidate) continue;
        if (!candidate.usable) {
          reason = candidate.reason || reason;
          continue;
        }
        this.history.set(featureId, {
          value: candidate.value,
          meta: candidate.meta,
          observedAtMs: clock.nowMs
        });
        return {
          value: candidate.value,
          meta: candidate.meta
        };
      }

      const previous = this.history.get(featureId);
      const holdAllowed = options.hold !== false &&
        previous &&
        (
          options.sticky === true ||
          clock.nowMs - previous.observedAtMs <= this.options.holdLastMs
        );
      if (holdAllowed) {
        const ageMs = Math.max(
          previous.meta.ageMs,
          clock.nowMs - previous.observedAtMs
        );
        return {
          value: previous.value,
          meta: heldMeta(previous, ageMs)
        };
      }

      return {
        value: isNumericFeature(featureId) ? 0 : null,
        meta: neutralMeta(reason)
      };
    }

    eventChannelMeta(frame, featureId) {
      const meta = frame?.meta?.[featureId];
      if (!meta || meta.available !== true) {
        return neutralMeta(
          fallbackReason(meta, 'PROVIDER_UNAVAILABLE')
        );
      }
      const ageMs = nonNegative(meta.ageMs);
      if (
        isRealtimeProvider(meta.sourceProvider) &&
        ageMs > this.options.realtimeTtlMs
      ) {
        return neutralMeta('REALTIME_STALE');
      }
      return {
        sourceProvider: meta.sourceProvider,
        providerDetail: {
          engineId: String(meta.providerDetail?.engineId || ''),
          providerVersion: String(
            meta.providerDetail?.providerVersion || ''
          )
        },
        confidence: meta.confidence === null ||
          meta.confidence === undefined
          ? null
          : clamp01(meta.confidence),
        available: true,
        ageMs,
        fallbackReason: null
      };
    }

    makeEvent(
      featureId,
      strength,
      meta,
      token,
      clock,
      transport
    ) {
      const scope = stableHash(
        transport.mode === 'external'
          ? 'external'
          : transport.trackId || 'no-track'
      );
      const xld = String(meta.sourceProvider).startsWith('xld.');
      const eventId = xld
        ? `xld:${scope}:${featureId}:e${transport.epoch}:b${stableHash(token)}`
        : `rt:${scope}:${featureId}:e${transport.epoch}:n${++this.realtimeEventSerial}`;
      if (this.seenEventIds.has(eventId)) return null;
      if (this.seenEventIds.size >= 4096) this.seenEventIds.clear();
      this.seenEventIds.add(eventId);
      return {
        eventId,
        strength: clamp01(strength),
        engineTimeMs: clock.nowMs,
        mediaTimeMs: transport.mediaTimeMs,
        epoch: transport.epoch
      };
    }

    resolveRealtimeEvent(
      featureId,
      frame,
      clock,
      transport,
      suppressEvents
    ) {
      const meta = this.eventChannelMeta(frame, featureId);
      const upstream = frame?.events?.[featureId] || null;
      if (
        suppressEvents ||
        !meta.available ||
        !upstream ||
        typeof upstream.eventId !== 'string' ||
        !upstream.eventId
      ) {
        return { event: null, meta };
      }
      const last = this.providerEventIds.get(featureId);
      if (last === upstream.eventId) return { event: null, meta };
      this.providerEventIds.set(featureId, upstream.eventId);
      return {
        event: this.makeEvent(
          featureId,
          upstream.strength,
          meta,
          upstream.eventId,
          clock,
          transport
        ),
        meta
      };
    }

    deriveEvents(
      frame,
      clock,
      transport,
      transition,
      xldCursor
    ) {
      const events = Object.fromEntries(
        EVENTS.map(featureId => [featureId, null])
      );
      const eventMeta = {};
      for (const featureId of ['onset', 'bassPeak']) {
        const resolved = this.resolveRealtimeEvent(
          featureId,
          frame.realtime,
          clock,
          transport,
          transition.suppressEvents
        );
        events[featureId] = resolved.event;
        eventMeta[featureId] = resolved.meta;
      }

      const sectionMeta = frame.meta.sectionId.available
        ? frame.meta.sectionId
        : frame.meta.sectionLabel;
      const chordMeta = frame.meta.chord;
      const sectionToken = sectionMeta.available
        ? String(sectionMeta.sourceProvider).startsWith('xld.')
          ? xldCursor?.section?.token ||
            frame.labels.sectionId ||
            frame.labels.sectionLabel
          : frame.labels.sectionId || frame.labels.sectionLabel
        : null;
      const chordToken = chordMeta.available
        ? String(chordMeta.sourceProvider).startsWith('xld.')
          ? xldCursor?.harmony?.token || frame.labels.chord
          : frame.labels.chord
        : null;
      const baseline = {
        sectionToken,
        sectionProvider: sectionMeta.sourceProvider,
        chordToken,
        chordProvider: chordMeta.sourceProvider,
        inDrop: frame.states.inDrop,
        inClimax: frame.states.inClimax
      };
      const previous = this.baseline;
      const sameSectionProvider = Boolean(
        previous &&
        previous.sectionProvider === baseline.sectionProvider
      );
      const sameChordProvider = Boolean(
        previous &&
        previous.chordProvider === baseline.chordProvider
      );

      if (!transition.suppressEvents && previous) {
        if (
          sameSectionProvider &&
          previous.sectionToken &&
          sectionToken &&
          previous.sectionToken !== sectionToken
        ) {
          events.sectionBoundary = this.makeEvent(
            'sectionBoundary',
            sectionMeta.confidence ?? 1,
            sectionMeta,
            sectionToken,
            clock,
            transport
          );
        }
        if (
          sameSectionProvider &&
          previous.inDrop <= 0 &&
          baseline.inDrop > 0
        ) {
          events.dropEnter = this.makeEvent(
            'dropEnter',
            frame.meta.inDrop.confidence ?? baseline.inDrop,
            frame.meta.inDrop,
            sectionToken || 'drop',
            clock,
            transport
          );
        }
        if (
          sameSectionProvider &&
          previous.inClimax <= 0 &&
          baseline.inClimax > 0
        ) {
          events.climaxEnter = this.makeEvent(
            'climaxEnter',
            frame.meta.inClimax.confidence ?? baseline.inClimax,
            frame.meta.inClimax,
            sectionToken || 'climax',
            clock,
            transport
          );
        }
        if (
          sameChordProvider &&
          previous.chordToken &&
          chordToken &&
          previous.chordToken !== chordToken
        ) {
          events.chordChange = this.makeEvent(
            'chordChange',
            frame.continuous.chordConfidence,
            chordMeta,
            chordToken,
            clock,
            transport
          );
        }
      }

      eventMeta.sectionBoundary = copyMeta(sectionMeta);
      eventMeta.dropEnter = copyMeta(frame.meta.inDrop);
      eventMeta.climaxEnter = copyMeta(frame.meta.inClimax);
      eventMeta.chordChange = copyMeta(chordMeta);
      this.baseline = baseline;
      return { events, meta: eventMeta };
    }

    resolve(input = {}) {
      const clock = normalizeClock(input.clock, this.lastClock);
      const transition = this.transitionTransport(
        clock,
        input.transport,
        input.transition
      );
      const realtime = input.realtimeFrame || null;
      const xld = input.xldFrame || null;
      const heuristic = input.heuristicFrame || null;
      const continuous = {};
      const states = {};
      const labels = {};
      const meta = {};

      for (const featureId of REALTIME_CORE_CONTINUOUS) {
        const resolved = this.choose(
          featureId,
          [realtime, xld],
          clock,
          { defaultReason: 'PROVIDER_UNAVAILABLE' }
        );
        continuous[featureId] = resolved.value;
        meta[featureId] = resolved.meta;
      }

      for (const featureId of HEURISTIC_CONTINUOUS) {
        const resolved = this.choose(
          featureId,
          [heuristic, realtime, xld],
          clock
        );
        continuous[featureId] = resolved.value;
        meta[featureId] = resolved.meta;
      }

      const chordConfidence = this.choose(
        'chordConfidence',
        [xld, heuristic],
        clock,
        {
          defaultReason: 'NO_XLD',
          sticky: transition.transport.state === 'paused'
        }
      );
      continuous.chordConfidence = chordConfidence.value;
      meta.chordConfidence = chordConfidence.meta;

      const xldSilence = this.candidate(xld, 'silence');
      const silenceFrames = xldSilence?.usable &&
        xldSilence.value > 0 &&
        xldSilence.meta.sourceProvider === 'xld.manual'
        ? [xld, realtime, heuristic]
        : [realtime, xld, heuristic];
      const silence = this.choose(
        'silence',
        silenceFrames,
        clock,
        { defaultReason: 'PROVIDER_UNAVAILABLE' }
      );
      states.silence = silence.value;
      meta.silence = silence.meta;

      for (const featureId of ['inBuild', 'inDrop', 'inClimax']) {
        const resolved = this.choose(
          featureId,
          [xld, heuristic],
          clock,
          {
            defaultReason: 'NO_XLD',
            sticky: transition.transport.state === 'paused'
          }
        );
        states[featureId] = resolved.value;
        meta[featureId] = resolved.meta;
      }

      for (const featureId of LABELS) {
        const resolved = this.choose(
          featureId,
          [xld, heuristic],
          clock,
          {
            defaultReason: 'NO_XLD',
            hold: transition.transport.state === 'paused',
            sticky: transition.transport.state === 'paused'
          }
        );
        labels[featureId] = resolved.value;
        meta[featureId] = resolved.meta;
      }

      const draft = {
        realtime,
        continuous,
        states,
        labels,
        meta
      };
      const derived = this.deriveEvents(
        draft,
        clock,
        transition.transport,
        transition,
        input.xldCursor || null
      );
      for (const featureId of EVENTS) {
        meta[featureId] = derived.meta[featureId] ||
          neutralMeta('NO_SOURCE');
      }

      this.lastClock = clock;
      this.lastTransition = transition.transitionType;
      this.frame = {
        contract: CONTRACT,
        contractVersion: CONTRACT_VERSION,
        clock,
        transport: transition.transport,
        continuous,
        states,
        events: derived.events,
        labels,
        meta
      };
      return this.get();
    }

    get() {
      return copyFrame(this.frame);
    }

    status() {
      return {
        version: this.options.providerVersion,
        epoch: this.epoch,
        transition: this.lastTransition,
        transport: this.transport
          ? { ...this.transport }
          : null,
        heldFeatures: [...this.history.keys()].sort(),
        seenEvents: this.seenEventIds.size,
        config: { ...this.options }
      };
    }
  }

  return Object.freeze({
    create: options => new MusicFeatureResolver(options),
    constants: Object.freeze({
      CONTRACT,
      CONTRACT_VERSION,
      RESOLVER_VERSION,
      RESOLVER_ENGINE,
      CONTINUOUS,
      STATES,
      EVENTS,
      LABELS,
      ALL_FEATURES
    })
  });
});
