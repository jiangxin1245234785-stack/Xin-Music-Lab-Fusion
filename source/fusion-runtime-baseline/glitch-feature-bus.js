(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.SmokeResonanceGlitchFeatureBus = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';

  const clamp01 = value => Math.max(0, Math.min(1, Number(value) || 0));
  const CONTINUOUS_KEYS = Object.freeze([
    'loudness', 'bass', 'mid', 'treble',
    'bassSmooth', 'midSmooth', 'trebleSmooth',
    'ensemble', 'acid', 'build', 'sectionDrive',
    'climaxState', 'dropState', 'chordHue', 'chordConfidence'
  ]);
  const EVENT_KEYS = Object.freeze([
    'onset', 'bassPeak', 'sectionBoundary', 'climaxEnter', 'dropEnter', 'chordChange'
  ]);
  const EVENT_DECAY = Object.freeze({
    onset: .09,
    bassPeak: .16,
    sectionBoundary: .28,
    climaxEnter: .48,
    dropEnter: .52,
    chordChange: .2
  });

  class GlitchFeatureBus {
    constructor() {
      this.reset(0);
    }

    reset(now = 0) {
      this.state = {
        now,
        lastAt: now,
        frame: 0,
        seed: .317,
        seedInt: 0x51f15e,
        lastOnsetAt: -Infinity,
        lastBassAt: -Infinity,
        lastSectionSerial: null,
        previous: {
          onset: 0,
          bassPeak: 0,
          boundaryPulse: 0,
          climaxState: 0,
          dropState: 0,
          chordChange: 0
        },
        continuous: Object.fromEntries(CONTINUOUS_KEYS.map(key => [key, 0])),
        events: Object.fromEntries(EVENT_KEYS.map(key => [key, 0]))
      };
      return this.get();
    }

    update(input = {}, now = 0) {
      const state = this.state;
      const dt = state.lastAt ? Math.max(1 / 240, Math.min(.1, (now - state.lastAt) / 1000)) : 1 / 60;
      state.lastAt = now;
      state.now = now;
      state.frame++;

      for (const key of CONTINUOUS_KEYS) state.continuous[key] = clamp01(input[key]);

      const playing = Boolean(input.playing);
      const onset = clamp01(input.onset);
      const bassPeak = clamp01(input.bassPeak);
      const boundaryPulse = clamp01(input.boundaryPulse);
      const climaxState = state.continuous.climaxState;
      const dropState = state.continuous.dropState;
      const chordChange = clamp01(input.chordChange);
      const sectionSerial = Number.isFinite(Number(input.sectionSerial)) ? Number(input.sectionSerial) : null;

      const onsetEdge = playing
        && onset > .11
        && onset > state.previous.onset * 1.035
        && now - state.lastOnsetAt > 72;
      const bassEdge = playing
        && bassPeak > .13
        && bassPeak > state.previous.bassPeak * 1.04
        && now - state.lastBassAt > 105;
      const serialEdge = sectionSerial !== null
        && state.lastSectionSerial !== null
        && sectionSerial !== state.lastSectionSerial;
      const boundaryEdge = serialEdge || (boundaryPulse > .72 && state.previous.boundaryPulse <= .72);
      const climaxEdge = climaxState > .66 && state.previous.climaxState <= .66;
      const dropEdge = dropState > .66 && state.previous.dropState <= .66;
      const chordEdge = chordChange > .3 && state.previous.chordChange <= .3;

      if (onsetEdge) state.lastOnsetAt = now;
      if (bassEdge) state.lastBassAt = now;
      if (sectionSerial !== null) state.lastSectionSerial = sectionSerial;

      const triggers = {
        onset: onsetEdge ? onset : 0,
        bassPeak: bassEdge ? bassPeak : 0,
        sectionBoundary: boundaryEdge ? Math.max(.72, boundaryPulse) : 0,
        climaxEnter: climaxEdge ? Math.max(.78, climaxState) : 0,
        dropEnter: dropEdge ? Math.max(.82, dropState) : 0,
        chordChange: chordEdge ? chordChange : 0
      };
      for (const key of EVENT_KEYS) {
        const decayed = state.events[key] * Math.exp(-dt / EVENT_DECAY[key]);
        state.events[key] = Math.max(decayed, triggers[key]);
      }

      if (Object.values(triggers).some(value => value > 0)) {
        state.seedInt = (Math.imul(state.seedInt, 1664525) + 1013904223) >>> 0;
        state.seed = state.seedInt / 4294967296;
      }

      Object.assign(state.previous, {
        onset,
        bassPeak,
        boundaryPulse,
        climaxState,
        dropState,
        chordChange
      });
      return this.get();
    }

    get() {
      return {
        now: this.state.now,
        frame: this.state.frame,
        seed: this.state.seed,
        continuous: { ...this.state.continuous },
        events: { ...this.state.events }
      };
    }
  }

  return Object.freeze({
    create: () => new GlitchFeatureBus(),
    constants: Object.freeze({ CONTINUOUS_KEYS, EVENT_KEYS })
  });
});
