(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.SmokeResonanceGlitchEngine = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';

  const clamp01 = value => Math.max(0, Math.min(1, Number(value) || 0));
  const response = (current, target, dt, rise, fall) => {
    const time = target > current ? rise : fall;
    return current + (target - current) * (1 - Math.exp(-dt / Math.max(.001, time)));
  };

  class GlitchEngine {
    constructor() {
      this.reset(0);
    }

    reset(now = 0) {
      this.state = {
        lastAt: now,
        lastMicroAt: -Infinity,
        lastReleaseAt: -Infinity,
        slowEnvelope: 0,
        fastEnvelope: 0,
        transient: 0,
        base: 0,
        noise: 0,
        burst: 0,
        flash: 0,
        tension: 0,
        release: null,
        releaseStrength: 0
      };
      return this.get();
    }

    update(input = {}, now = 0, config = {}) {
      const state = this.state;
      const dt = state.lastAt ? Math.max(1 / 240, Math.min(.08, (now - state.lastAt) / 1000)) : 1 / 60;
      state.lastAt = now;
      const playing = Boolean(input.playing);
      const strength = Math.max(.4, Number(config.fxStrength) || 1);
      const slowTarget = playing ? clamp01(input.loudness) : 0;
      const fastTarget = playing ? clamp01(input.fast) : 0;
      state.slowEnvelope = response(state.slowEnvelope, slowTarget, dt, .12, .55);
      state.fastEnvelope = response(state.fastEnvelope, fastTarget, dt, .035, .16);
      state.transient = Math.max(
        state.transient * Math.exp(-dt / .09),
        Math.max(0, state.fastEnvelope - state.slowEnvelope * .42)
      );

      const ensemble = clamp01(input.ensemble);
      const section = clamp01(input.section);
      const acid = clamp01(input.acid);
      const richness = clamp01(input.richness);
      const chordChange = clamp01(input.chordChange);
      const chordConfidence = clamp01(input.chordConfidence);
      const baseTarget = clamp01((state.slowEnvelope * .62 + ensemble * .24 + section * .14) * (Number(config.baseLayer) || 0) * strength);
      const noiseTarget = clamp01((acid * .46 + clamp01(input.flatness) * .18 + clamp01(input.treble) * .15 + clamp01(input.flux) * .21 + chordChange * (.08 + chordConfidence * .1)) * (Number(config.noiseLayer) || 0) * strength);
      state.base = response(state.base, baseTarget, dt, .09, .42);
      state.noise = response(state.noise, noiseTarget, dt, .055, .18);
      state.burst *= Math.exp(-dt / .075);
      state.flash *= Math.exp(-dt / .045);

      const tensionInput = clamp01(acid * .34 + ensemble * .22 + section * .26 + richness * .18);
      if (playing) {
        state.tension = clamp01(state.tension
          + dt * (.018 + tensionInput * .24) * Math.max(.5, Number(config.tensionBuild) || 1)
          - dt * (.018 + (1 - tensionInput) * .025));
      } else {
        state.tension = Math.max(0, state.tension - dt * .28);
      }

      const pulse = clamp01(input.pulse);
      const climax = clamp01(input.climax);
      const drop = clamp01(input.drop);
      const releaseThreshold = Math.max(.58, .8 - climax * .14 - state.transient * .08);
      const eventSpacing = Math.max(.5, Number(config.eventSpacing) || 1);
      const macroGap = Math.max(380, 900 * eventSpacing / Math.sqrt(strength));
      const microGap = Math.max(120, 235 * eventSpacing / Math.sqrt(strength));
      const macro = playing
        && now - state.lastReleaseAt > macroGap
        && (state.tension >= releaseThreshold || drop > .66 || (climax > .76 && state.transient > .12));
      const micro = playing
        && !macro
        && now - state.lastMicroAt > microGap
        && (state.transient > .12 || chordChange > .3)
        && (pulse > .08 || chordChange > .3);

      state.release = macro ? 'macro' : micro ? 'micro' : null;
      state.releaseStrength = 0;
      if (state.release) {
        const preReleaseTension = state.tension;
        const releaseStrength = clamp01(Math.max(state.transient, pulse, preReleaseTension, drop, chordChange * .7)
          * Math.max(0, Number(config.burstLayer) || 0)
          * strength
          * .52);
        state.releaseStrength = releaseStrength;
        state.burst = Math.max(state.burst, macro ? releaseStrength : releaseStrength * .36);
        state.flash = Math.max(state.flash, macro ? releaseStrength : releaseStrength * .22);
        if (macro) {
          state.lastReleaseAt = now;
          state.tension *= .12;
        } else {
          state.lastMicroAt = now;
          state.tension *= .9;
        }
      }
      return this.get();
    }

    get() {
      return { ...this.state };
    }
  }

  return Object.freeze({ create: () => new GlitchEngine() });
});
