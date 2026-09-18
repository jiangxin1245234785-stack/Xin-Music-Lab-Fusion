(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.SmokeResonanceRealtimeProvider = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';

  const CONTRACT = 'xin.music-frame/1';
  const CONTRACT_VERSION = 1;
  const PROVIDER = 'realtime.core';
  const PROVIDER_VERSION = '2.1.0-shadow';
  const ENGINE_ID = 'xml-realtime-analyser';
  const CONTINUOUS_FEATURES = Object.freeze([
    'loudness',
    'bass',
    'mid',
    'treble',
    'flux'
  ]);
  const STATE_FEATURES = Object.freeze(['silence']);
  const EVENT_FEATURES = Object.freeze(['onset', 'bassPeak']);
  const ALL_FEATURES = Object.freeze([
    ...CONTINUOUS_FEATURES,
    ...STATE_FEATURES,
    ...EVENT_FEATURES
  ]);

  const clamp01 = value => {
    const numeric = Number(value);
    return Number.isFinite(numeric)
      ? Math.max(0, Math.min(1, numeric))
      : 0;
  };
  const nonNegative = value => {
    const numeric = Number(value);
    return Number.isFinite(numeric) ? Math.max(0, numeric) : 0;
  };
  const nonNegativeInteger = value => {
    const numeric = Number(value);
    return Number.isFinite(numeric)
      ? Math.max(0, Math.floor(numeric))
      : 0;
  };

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
        EVENT_FEATURES.map(key => [key, copyEvent(frame.events[key])])
      ),
      meta: Object.fromEntries(
        ALL_FEATURES.map(key => [
          key,
          {
            ...frame.meta[key],
            providerDetail: { ...frame.meta[key].providerDetail }
          }
        ])
      )
    };
  }

  function normalizeClock(input, previous) {
    const nowMs = nonNegative(input?.nowMs ?? previous?.nowMs ?? 0);
    const previousNow = nonNegative(previous?.nowMs ?? nowMs);
    return {
      frameIndex: nonNegativeInteger(
        input?.frameIndex ?? ((previous?.frameIndex ?? -1) + 1)
      ),
      nowMs,
      deltaMs: nonNegative(input?.deltaMs ?? Math.max(0, nowMs - previousNow))
    };
  }

  function normalizeTransport(input) {
    const mode = input?.mode === 'internal' ? 'internal' : 'external';
    const allowedStates = ['playing', 'paused', 'seeking', 'stopped'];
    return {
      mode,
      state: allowedStates.includes(input?.state) ? input.state : 'stopped',
      trackId: typeof input?.trackId === 'string' && input.trackId
        ? input.trackId
        : null,
      mediaTimeMs: input?.mediaTimeMs === null ||
        input?.mediaTimeMs === undefined
        ? null
        : nonNegative(input.mediaTimeMs),
      durationMs: input?.durationMs === null ||
        input?.durationMs === undefined
        ? null
        : nonNegative(input.durationMs),
      epoch: nonNegativeInteger(input?.epoch)
    };
  }

  function normalizeSample(sample, nowMs) {
    return {
      sampledAtMs: Math.min(
        nowMs,
        nonNegative(sample?.sampledAtMs ?? nowMs)
      ),
      confidence: sample?.confidence === null ||
        sample?.confidence === undefined
        ? 0.92
        : clamp01(sample.confidence),
      values: {
        loudness: clamp01(sample?.loudness),
        bass: clamp01(sample?.bass),
        mid: clamp01(sample?.mid),
        treble: clamp01(sample?.treble),
        flux: clamp01(sample?.flux),
        silence: clamp01(sample?.silence),
        onset: clamp01(sample?.onset),
        bassPeak: clamp01(sample?.bassPeak)
      }
    };
  }

  function createMeta(options) {
    return {
      sourceProvider: PROVIDER,
      providerDetail: {
        engineId: options.engineId,
        providerVersion: options.providerVersion
      },
      confidence: options.available ? options.confidence : null,
      available: options.available,
      ageMs: options.ageMs,
      fallbackReason: options.available ? null : options.fallbackReason
    };
  }

  class RealtimeProviderAdapter {
    constructor(options = {}) {
      this.options = {
        providerVersion: String(
          options.providerVersion || PROVIDER_VERSION
        ),
        engineId: String(options.engineId || ENGINE_ID),
        maxSampleAgeMs: Math.max(
          1,
          Number(options.maxSampleAgeMs) || 100
        ),
        onsetThreshold: clamp01(options.onsetThreshold ?? 0.11),
        bassPeakThreshold: clamp01(options.bassPeakThreshold ?? 0.13),
        onsetCooldownMs: Math.max(
          0,
          Number(options.onsetCooldownMs) || 72
        ),
        bassPeakCooldownMs: Math.max(
          0,
          Number(options.bassPeakCooldownMs) || 105
        )
      };
      this.reset();
    }

    reset(clockInput = {}) {
      const clock = normalizeClock(clockInput, null);
      this.lastClock = clock;
      this.lastSample = null;
      this.wasAvailable = false;
      this.previous = { onset: 0, bassPeak: 0 };
      this.lastEventAt = { onset: -Infinity, bassPeak: -Infinity };
      this.eventSerial = { onset: 0, bassPeak: 0 };
      this.frame = this.composeFrame(
        clock,
        normalizeTransport(),
        false,
        0,
        'PROVIDER_UNAVAILABLE',
        { onset: null, bassPeak: null }
      );
      return this.get();
    }

    createEvent(featureId, strength, clock, transport) {
      this.eventSerial[featureId]++;
      return {
        eventId: [
          transport.mode,
          featureId,
          transport.epoch,
          this.eventSerial[featureId]
        ].join(':'),
        strength,
        engineTimeMs: clock.nowMs,
        mediaTimeMs: transport.mediaTimeMs,
        epoch: transport.epoch
      };
    }

    composeFrame(
      clock,
      transport,
      available,
      ageMs,
      fallbackReason,
      events
    ) {
      const values = this.lastSample?.values || {
        loudness: 0,
        bass: 0,
        mid: 0,
        treble: 0,
        flux: 0,
        silence: 1,
        onset: 0,
        bassPeak: 0
      };
      const confidence = this.lastSample?.confidence ?? null;
      const meta = Object.fromEntries(ALL_FEATURES.map(featureId => [
        featureId,
        createMeta({
          ...this.options,
          available,
          ageMs,
          confidence,
          fallbackReason
        })
      ]));
      return {
        contract: CONTRACT,
        contractVersion: CONTRACT_VERSION,
        clock,
        transport,
        continuous: {
          loudness: values.loudness,
          bass: values.bass,
          mid: values.mid,
          treble: values.treble,
          flux: values.flux
        },
        states: {
          silence: values.silence
        },
        events,
        meta
      };
    }

    update(input = {}) {
      const clock = normalizeClock(input.clock, this.lastClock);
      const transport = normalizeTransport(input.transport);
      const sampling = Boolean(
        input.connected &&
        transport.state === 'playing' &&
        input.sample
      );
      if (sampling) {
        this.lastSample = normalizeSample(input.sample, clock.nowMs);
      }
      const ageMs = this.lastSample
        ? Math.max(0, clock.nowMs - this.lastSample.sampledAtMs)
        : 0;
      const available = Boolean(
        sampling && ageMs <= this.options.maxSampleAgeMs
      );
      const fallbackReason = this.lastSample
        ? 'REALTIME_STALE'
        : 'PROVIDER_UNAVAILABLE';
      const events = { onset: null, bassPeak: null };

      if (available) {
        const values = this.lastSample.values;
        const continuousSampling = this.wasAvailable &&
          clock.deltaMs <= this.options.maxSampleAgeMs;
        if (continuousSampling) {
          for (const featureId of EVENT_FEATURES) {
            const threshold = featureId === 'onset'
              ? this.options.onsetThreshold
              : this.options.bassPeakThreshold;
            const cooldown = featureId === 'onset'
              ? this.options.onsetCooldownMs
              : this.options.bassPeakCooldownMs;
            const value = values[featureId];
            const rising = value > threshold &&
              this.previous[featureId] <= threshold;
            if (
              rising &&
              clock.nowMs - this.lastEventAt[featureId] >= cooldown
            ) {
              events[featureId] = this.createEvent(
                featureId,
                value,
                clock,
                transport
              );
              this.lastEventAt[featureId] = clock.nowMs;
            }
          }
        }
        this.previous.onset = values.onset;
        this.previous.bassPeak = values.bassPeak;
      } else {
        this.previous.onset = 0;
        this.previous.bassPeak = 0;
      }

      this.wasAvailable = available;
      this.lastClock = clock;
      this.frame = this.composeFrame(
        clock,
        transport,
        available,
        ageMs,
        fallbackReason,
        events
      );
      return this.get();
    }

    get() {
      return copyFrame(this.frame);
    }
  }

  return Object.freeze({
    create: options => new RealtimeProviderAdapter(options),
    constants: Object.freeze({
      CONTRACT,
      CONTRACT_VERSION,
      PROVIDER,
      PROVIDER_VERSION,
      ENGINE_ID,
      CONTINUOUS_FEATURES,
      STATE_FEATURES,
      EVENT_FEATURES,
      ALL_FEATURES
    })
  });
});
