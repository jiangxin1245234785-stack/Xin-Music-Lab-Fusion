(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  if (root) root.SmokeResonanceMappingEngine = api;
})(typeof window !== 'undefined' ? window : globalThis, function () {
  'use strict';

  const clamp = (value, low = 0, high = 1) => Math.max(low, Math.min(high, Number(value) || 0));
  const mix = (from, to, amount) => from + (to - from) * clamp(amount);
  const smoothstep = (edge0, edge1, value) => {
    const x = clamp((value - edge0) / Math.max(1e-6, edge1 - edge0));
    return x * x * (3 - 2 * x);
  };

  const defaults = Object.freeze({
    sensitivity: 1,
    sectionSensitivity: 1,
    sectionHold: 1,
    climaxSensitivity: 1,
    dropSensitivity: 1
  });

  class MappingEngine {
    constructor(config = {}) {
      this.config = { ...defaults };
      this.setConfig(config);
      this.reset();
    }

    setConfig(values = {}) {
      if (values.sensitivity !== undefined) this.config.sensitivity = clamp(values.sensitivity, .55, 1.8);
      if (values.sectionSensitivity !== undefined) this.config.sectionSensitivity = clamp(values.sectionSensitivity, .7, 1.45);
      if (values.sectionHold !== undefined) this.config.sectionHold = clamp(values.sectionHold, .55, 1.8);
      if (values.climaxSensitivity !== undefined) this.config.climaxSensitivity = clamp(values.climaxSensitivity, .7, 1.45);
      if (values.dropSensitivity !== undefined) this.config.dropSensitivity = clamp(values.dropSensitivity, .7, 1.45);
      return { ...this.config };
    }

    getConfig() {
      return { ...this.config };
    }

    reset(now = 0) {
      this.lastNow = now;
      this.fastLevel = 0;
      this.slowLevel = 0;
      this.previousSlowLevel = 0;
      this.arousal = 0;
      this.tension = 0;
      this.novelty = 0;
      this.onsetMean = .05;
      this.onsetDeviation = .03;
      this.onsetDensity = 0;
      this.previousOnset = 0;
      this.ensemble = 0;
      this.ensembleBaseline = null;
      this.previousEnsemble = 0;
      this.ensembleSurge = 0;
      this.acid = 0;
      this.lastEnsembleCandidateAt = -Infinity;
      this.lastCandidateAt = -Infinity;
      this.lastEventAt = -Infinity;
      this.ruptureUntil = 0;
      this.aftermathUntil = 0;
      this.silenceStartedAt = 0;
      this.state = 'SILENCE';
      this.stateStartedAt = now;
      this.section = 'SPARSE';
      this.sectionStartedAt = now;
      this.sectionPersistence = 0;
      this.sectionScores = { layering: 0, full: 0, climax: 0, drop: 0 };
      this.structureShort = null;
      this.structureLong = null;
      this.structurePeak = { level: 0, ensemble: 0, parts: 0, breadth: 0, activity: 0, fullness: 0 };
      this.structureDelta = { levelLift: 0, ensembleLift: 0, partsLift: 0, activityLift: 0, levelFall: 0, ensembleFall: 0, partsFall: 0, activityFall: 0 };
      this.climaxCandidateAt = 0;
      this.fullCandidateAt = 0;
      this.dropCandidateAt = 0;
      this.lastDropAt = -Infinity;
      this.sectionDropUntil = 0;
      this.sectionAfterglowUntil = 0;
      this.eventId = 0;
      this.baseline = null;
      this.lastOutput = this.makeOutput(null, 0, 0, 0, 0, {});
      return this.lastOutput;
    }

    setState(next, now) {
      if (next === this.state) return;
      this.state = next;
      this.stateStartedAt = now;
    }

    setSection(next, now) {
      if (next === this.section) return;
      this.section = next;
      this.sectionStartedAt = now;
    }

    updateBaseline(vector, dt) {
      if (!this.baseline) {
        this.baseline = [...vector];
        return 0;
      }
      const alpha = 1 - Math.exp(-dt / 13);
      let distance = 0;
      const weights = [1.15, .85, .7, .8, .65, .7, .65, .92, .82, .72, .86];
      for (let index = 0; index < vector.length; index++) {
        const delta = vector[index] - this.baseline[index];
        distance += delta * delta * weights[index];
        this.baseline[index] += delta * alpha;
      }
      return clamp(Math.sqrt(distance / vector.length) * 3.4);
    }

    updateSectionModel(input, now, dt, silence) {
      const current = {
        level: clamp(input.level),
        ensemble: clamp(input.ensemble),
        parts: clamp(input.effectiveParts / 6),
        breadth: clamp(input.breadth),
        activity: clamp(this.onsetDensity * .58 + clamp(input.onset) * .24 + clamp(input.flux) * .18),
        spectral: clamp(input.spectralFullness)
      };
      current.fullness = clamp(
        current.spectral * .48
        + current.ensemble * .2
        + current.parts * .12
        + current.breadth * .08
        + this.sectionPersistence * .07
        + current.activity * .05
      );

      if (!this.structureShort) {
        this.structureShort = { ...current };
        this.structureLong = { ...current };
        this.structurePeak = { ...current };
      }

      const positiveLift = (value, baseline, floor = .06) => clamp((value - baseline) / (floor + baseline * .42));
      const peakFall = (value, peak, floor = .06) => smoothstep(.12, .82, clamp((peak - value) / (floor + peak * .55)));
      const ensembleLift = positiveLift(current.ensemble, this.structureLong.ensemble, .055);
      const partsLift = positiveLift(current.parts, this.structureLong.parts, .07);
      const breadthLift = positiveLift(current.breadth, this.structureLong.breadth, .065);
      const activityLift = positiveLift(current.activity, this.structureLong.activity, .055);
      const spectralLift = Math.max(positiveLift(current.spectral, this.structureLong.spectral, .055), clamp(input.fullnessDelta));
      const levelLift = positiveLift(current.level, this.structureLong.level, .055);
      const levelFall = peakFall(current.level, this.structurePeak.level, .045);
      const ensembleFall = peakFall(current.ensemble, this.structurePeak.ensemble, .055);
      const partsFall = peakFall(current.parts, this.structurePeak.parts, .07);
      const activityFall = peakFall(current.activity, this.structurePeak.activity, .05);
      const spectralFall = Math.max(peakFall(current.spectral, this.structurePeak.spectral, .055), clamp(input.fullnessFall));
      this.structureDelta = { levelLift, ensembleLift, partsLift, activityLift, spectralLift, levelFall, ensembleFall, partsFall, activityFall, spectralFall };

      const relativeRise = clamp(spectralLift * .36 + ensembleLift * .24 + partsLift * .2 + breadthLift * .1 + activityLift * .1);
      const absoluteHigh = smoothstep(.54, .82, current.fullness);
      const layeringTarget = clamp(this.ensembleSurge * .55 + relativeRise * .45);
      const fullTarget = clamp(current.fullness * .82 + relativeRise * .18);
      const climaxTarget = clamp(current.fullness * .58 + relativeRise * .25 + absoluteHigh * .17 + this.ensembleSurge * .08);
      const collapseCoincidence = ([spectralFall, levelFall, ensembleFall, partsFall, activityFall].filter(value => value > .25).length) / 5;
      const priorFullness = smoothstep(.3, .66, this.structurePeak.fullness);
      const collapse = spectralFall * .34 + levelFall * .12 + ensembleFall * .24 + partsFall * .18 + activityFall * .12;
      const dropTarget = clamp((collapse * .78 + collapseCoincidence * .22) * priorFullness + clamp(input.orchestrationFall) * .28);
      const targets = { layering: layeringTarget, full: fullTarget, climax: climaxTarget, drop: dropTarget };
      for (const key of Object.keys(targets)) {
        const target = targets[key];
        const attack = key === 'drop' ? .055 : key === 'climax' ? .2 : .16;
        const release = key === 'drop' ? .72 : key === 'climax' ? 1.35 : .92;
        this.sectionScores[key] = mix(
          this.sectionScores[key],
          target,
          1 - Math.exp(-dt / (target > this.sectionScores[key] ? attack : release))
        );
      }

      const dropThreshold = clamp(.58 / this.config.dropSensitivity, .42, .76);
      const dropReady = this.sectionScores.drop > dropThreshold
        && this.structurePeak.fullness > .34
        && now - this.lastDropAt > 900;
      if (dropReady) {
        if (!this.dropCandidateAt) this.dropCandidateAt = now;
        if (now - this.dropCandidateAt > 85) {
          this.lastDropAt = now;
          this.sectionDropUntil = now + 980 * this.config.sectionHold;
          this.sectionAfterglowUntil = now + 4300 * this.config.sectionHold;
          this.dropCandidateAt = 0;
        }
      } else this.dropCandidateAt = 0;

      const climaxThreshold = clamp(.66 / this.config.climaxSensitivity, .5, .82);
      const fullThreshold = clamp(.5 / this.config.sectionSensitivity, .38, .68);
      if (this.sectionScores.climax > climaxThreshold) {
        if (!this.climaxCandidateAt) this.climaxCandidateAt = now;
      } else this.climaxCandidateAt = 0;
      if (this.sectionScores.full > fullThreshold) {
        if (!this.fullCandidateAt) this.fullCandidateAt = now;
      } else this.fullCandidateAt = 0;

      if (now < this.sectionDropUntil) this.setSection('DROP', now);
      else if (now < this.sectionAfterglowUntil && this.sectionScores.full < fullThreshold * .9) this.setSection('AFTERGLOW', now);
      else if (silence) this.setSection('SPARSE', now);
      else {
        const sectionAgeMs = now - this.sectionStartedAt;
        const keepClimax = this.section === 'CLIMAX'
          && (this.sectionScores.climax > climaxThreshold * .7 || sectionAgeMs < 1200 * this.config.sectionHold);
        const enterClimax = this.climaxCandidateAt
          && now - this.climaxCandidateAt > 260 / this.config.climaxSensitivity;
        const keepFull = this.section === 'FULL'
          && (this.sectionScores.full > fullThreshold * .72 || sectionAgeMs < 850 * this.config.sectionHold);
        const enterFull = this.fullCandidateAt
          && now - this.fullCandidateAt > 220 / this.config.sectionSensitivity;
        if (keepClimax || enterClimax) this.setSection('CLIMAX', now);
        else if (keepFull || enterFull) this.setSection('FULL', now);
        else if (this.sectionScores.layering > clamp(.2 / this.config.sectionSensitivity, .13, .3) || current.ensemble > .3) this.setSection('LAYERING', now);
        else this.setSection('SPARSE', now);
      }

      const shortAlpha = 1 - Math.exp(-dt / 2.4);
      const longAlpha = 1 - Math.exp(-dt / 24);
      const peakDecay = Math.exp(-dt / 7.5);
      for (const key of Object.keys(current)) {
        this.structureShort[key] = mix(this.structureShort[key], current[key], shortAlpha);
        this.structureLong[key] = mix(this.structureLong[key], current[key], longAlpha);
        this.structurePeak[key] = Math.max(current[key], this.structurePeak[key] * peakDecay);
      }
    }

    chooseEventType(input, strength) {
      const bass = clamp(input.bass);
      const treble = clamp(input.treble);
      const flatness = clamp(input.flatness);
      const acid = clamp(input.acid);
      const novelty = clamp(this.novelty);
      if (clamp(input.ensembleSurge) > .2 && strength > .52) return 'rupture';
      if (novelty > .38 && strength > .72) return 'rupture';
      if (bass > treble * 1.18 && bass > .22) return 'block';
      if (acid > .5 && strength > .48) return input.sweep > .42 ? 'chromatic' : 'sort';
      if (treble > bass * 1.12 && treble > .2) return 'chromatic';
      if (flatness > .44) return 'sort';
      return 'rupture';
    }

    makeOutput(event, impact, threshold, charge, level, input) {
      const ruptureActive = this.state === 'RUPTURE';
      const aftermathActive = this.state === 'AFTERMATH';
      const eventStrength = event?.strength || 0;
      const destruction = ruptureActive
        ? Math.max(eventStrength, clamp(this.tension * 1.18))
        : aftermathActive
          ? clamp(this.tension * .42 + this.arousal * .12)
          : 0;
      return {
        state: this.state,
        stateAge: Math.max(0, (this.lastNow - this.stateStartedAt) / 1000),
        section: this.section,
        sectionAge: Math.max(0, (this.lastNow - this.sectionStartedAt) / 1000),
        sectionPersistence: clamp(this.sectionPersistence),
        sectionConfidence: clamp(this.sectionScores[this.section.toLowerCase()] || (this.section === 'AFTERGLOW' ? 1 - this.sectionScores.drop : 0)),
        sectionScores: {
          layering: clamp(this.sectionScores.layering),
          full: clamp(this.sectionScores.full),
          climax: clamp(this.sectionScores.climax),
          drop: clamp(this.sectionScores.drop)
        },
        structureDelta: { ...this.structureDelta },
        arousal: clamp(this.arousal),
        tension: clamp(this.tension),
        novelty: clamp(this.novelty),
        orchestration: clamp(this.ensemble),
        orchestrationSurge: clamp(this.ensembleSurge),
        effectiveParts: Math.max(0, Math.min(6, Number(input.effectiveParts) || 0)),
        acid: clamp(this.acid),
        impact: clamp(impact),
        onsetThreshold: clamp(threshold),
        charge: clamp(charge),
        event,
        layers: {
          base: clamp(.035 + this.arousal * .23 + this.ensemble * .24),
          noise: clamp((clamp(input.flatness) * .22 + clamp(input.treble) * .14 + this.tension * .09 + this.ensembleSurge * .14 + this.acid * .26) * .58),
          corrosion: clamp(this.acid * (.42 + this.tension * .28 + this.ensemble * .16)),
          destruction
        },
        source: {
          level: clamp(level),
          bass: clamp(input.bass),
          mid: clamp(input.mid),
          treble: clamp(input.treble),
          flux: clamp(input.flux),
          centroid: clamp(input.centroid, 0, 1),
          flatness: clamp(input.flatness),
          density: clamp(input.density),
          breadth: clamp(input.breadth),
          voices: clamp(input.voices),
          richness: clamp(input.richness),
          orchestrationDensity: clamp(input.orchestrationDensity),
          orchestrationDelta: clamp(input.orchestrationDelta),
          orchestrationFall: clamp(input.orchestrationFall),
          spectralFullness: clamp(input.spectralFullness),
          fullnessDelta: clamp(input.fullnessDelta),
          fullnessPersistence: clamp(input.fullnessPersistence),
          fullnessFall: clamp(input.fullnessFall),
          chord: input.chord || 'N',
          chordConfidence: clamp(input.chordConfidence),
          chordChange: clamp(input.chordChange),
          harmonicTension: clamp(input.harmonicTension),
          acid: clamp(input.acid),
          resonance: clamp(input.resonance),
          sweep: clamp(input.sweep),
          sharpness: clamp(input.sharpness),
          roughness: clamp(input.roughness)
        }
      };
    }

    update(input = {}, now = 0) {
      const currentNow = Number.isFinite(now) ? now : 0;
      const dt = clamp(this.lastNow ? (currentNow - this.lastNow) / 1000 : 1 / 60, 1 / 240, .12);
      this.lastNow = currentNow;

      const playing = input.playing !== false;
      const overall = clamp(input.overall);
      const rms = clamp(input.rms);
      const onset = clamp(input.onset);
      const flux = clamp(input.flux);
      const bass = clamp(input.bass);
      const mid = clamp(input.mid);
      const treble = clamp(input.treble);
      const centroid = clamp(input.centroid, 0, 1);
      const flatness = clamp(input.flatness);
      const density = clamp(input.density);
      const breadth = clamp(input.breadth);
      const voices = clamp(input.voices);
      const richness = clamp(input.richness);
      const orchestrationDensity = clamp(input.orchestrationDensity ?? richness);
      const orchestrationDeltaInput = clamp(input.orchestrationDelta);
      const orchestrationPersistenceInput = clamp(input.orchestrationPersistence);
      const orchestrationFall = clamp(input.orchestrationFall);
      const spectralFullness = clamp(input.spectralFullness ?? orchestrationDensity);
      const fullnessDelta = clamp(input.fullnessDelta ?? orchestrationDeltaInput);
      const fullnessPersistence = clamp(input.fullnessPersistence ?? orchestrationPersistenceInput);
      const fullnessFall = clamp(input.fullnessFall ?? orchestrationFall);
      const effectiveParts = Math.max(0, Math.min(6, Number(input.effectiveParts) || 0));
      const acidInput = playing ? clamp(input.acid) : 0;
      const resonance = clamp(input.resonance);
      const sweep = clamp(input.sweep);
      const sharpness = clamp(input.sharpness);
      const roughness = clamp(input.roughness);
      const dynamicRange = clamp(input.dynamicRange);

      const rawLevel = playing ? clamp(Math.max(overall, rms * 1.15) * this.config.sensitivity) : 0;
      const fastAlpha = 1 - Math.exp(-dt / (rawLevel > this.fastLevel ? .055 : .24));
      const slowAlpha = 1 - Math.exp(-dt / (rawLevel > this.slowLevel ? 1.8 : 3.8));
      this.fastLevel = mix(this.fastLevel, rawLevel, fastAlpha);
      this.slowLevel = mix(this.slowLevel, rawLevel, slowAlpha);
      const envelopeDelta = Math.max(0, this.fastLevel - this.slowLevel);
      const impact = clamp(envelopeDelta * 3.5 + onset * .44 + flux * .28);

      const ensembleTarget = playing ? clamp(orchestrationDensity * .72 + breadth * .17 + voices * .11) : 0;
      const ensembleAlpha = 1 - Math.exp(-dt / (ensembleTarget > this.ensemble ? .16 : 1.35));
      this.ensemble = mix(this.ensemble, ensembleTarget, ensembleAlpha);
      if (this.ensembleBaseline === null) this.ensembleBaseline = this.ensemble;
      const ensembleSlope = clamp(Math.max(0, (this.ensemble - this.previousEnsemble) / dt) * .42);
      this.previousEnsemble = this.ensemble;
      this.ensembleBaseline = mix(this.ensembleBaseline, this.ensemble, 1 - Math.exp(-dt / 11.5));
      const ensembleDelta = Math.max(0, this.ensemble - this.ensembleBaseline);
      const ensembleSurgeTarget = clamp(
        ensembleDelta * 2.2
        + ensembleSlope * .38
        + orchestrationDeltaInput * .62
        + orchestrationPersistenceInput * orchestrationDeltaInput * .18
      );
      this.ensembleSurge = mix(
        this.ensembleSurge,
        ensembleSurgeTarget,
        1 - Math.exp(-dt / (ensembleSurgeTarget > this.ensembleSurge ? .1 : 1.8))
      );
      this.sectionPersistence = mix(
        this.sectionPersistence,
        playing ? orchestrationPersistenceInput : 0,
        1 - Math.exp(-dt / (orchestrationPersistenceInput > this.sectionPersistence ? .45 : 1.8))
      );
      const ensemblePressure = clamp(this.ensemble * .7 + this.ensembleSurge * .62);
      const acidTarget = clamp(
        acidInput * .58 + resonance * .14 + sweep * .12 + sharpness * .09 + roughness * .07
      );
      this.acid = mix(
        this.acid,
        acidTarget,
        1 - Math.exp(-dt / (acidTarget > this.acid ? .075 : .5))
      );

      const arousalTarget = clamp(
        rawLevel * 1.04
        + impact * .22
        + density * .06
        + treble * .04
        + ensemblePressure * .38
      );
      const arousalAlpha = 1 - Math.exp(-dt / (arousalTarget > this.arousal ? .12 : .7));
      this.arousal = mix(this.arousal, arousalTarget, arousalAlpha);

      const vector = [overall, bass, mid, treble, centroid, flatness, density, richness, breadth, voices, acidInput];
      const noveltyTarget = this.updateBaseline(vector, dt);
      const noveltyAlpha = 1 - Math.exp(-dt / (noveltyTarget > this.novelty ? .18 : 2.2));
      this.novelty = mix(this.novelty, noveltyTarget, noveltyAlpha);

      const deviation = Math.abs(onset - this.onsetMean);
      this.onsetMean = mix(this.onsetMean, onset, 1 - Math.exp(-dt / 3.4));
      this.onsetDeviation = mix(this.onsetDeviation, deviation, 1 - Math.exp(-dt / 4.8));
      const onsetThreshold = clamp(this.onsetMean + this.onsetDeviation * 1.15 + .025, .095, .62);
      const candidate = playing
        && onset > onsetThreshold
        && onset > this.previousOnset * 1.035
        && currentNow - this.lastCandidateAt > 155;
      if (candidate) this.lastCandidateAt = currentNow;
      const ensembleCandidate = playing
        && this.ensemble > .3
        && this.ensembleSurge > .105
        && currentNow - this.lastEnsembleCandidateAt > 720;
      if (ensembleCandidate) this.lastEnsembleCandidateAt = currentNow;
      this.previousOnset = onset;
      this.onsetDensity *= Math.exp(-dt / 2.4);
      if (candidate) this.onsetDensity = clamp(this.onsetDensity + .24);

      const slowSlope = clamp(Math.max(0, (this.slowLevel - this.previousSlowLevel) / dt) * 3.2);
      this.previousSlowLevel = this.slowLevel;
      const texturePressure = clamp(flatness * .52 + flux * .48);
      const charge = clamp((
        this.arousal * (
          .12
          + slowSlope * .72
          + this.onsetDensity * .36
          + texturePressure * .2
          + this.acid * .08
          + this.novelty * .32
          + dynamicRange * .08
        )
        + ensemblePressure * (
          .11
          + this.ensemble * .2
          + this.ensembleSurge * .52
          + this.novelty * .16
          + this.acid * .055
        )
      ));
      const silence = !playing || rawLevel < .022;
      const leak = silence
        ? .3
        : .008 + (1 - this.arousal) * .007;
      const recovering = currentNow < this.aftermathUntil;
      const effectiveCharge = charge * (recovering ? .22 : 1);
      this.tension = clamp(this.tension + (effectiveCharge * .12 - leak) * dt);

      let event = null;
      const tensionThreshold = .5;
      const cooldown = 3600;
      const releaseReady = this.tension > tensionThreshold
        && (candidate || ensembleCandidate)
        && currentNow - this.lastEventAt > cooldown
        && currentNow >= this.aftermathUntil
        && (impact > .18 || this.ensembleSurge > .12 || this.novelty > .14 || this.tension > .78);
      if (releaseReady) {
        const strength = clamp(
          .28
          + smoothstep(tensionThreshold, 1, this.tension) * .48
          + impact * .26
          + this.ensembleSurge * .24
          + this.novelty * .16
          + this.acid * .08
        );
        const type = this.chooseEventType({ bass, mid, treble, flatness, acid: this.acid, sweep, ensembleSurge: this.ensembleSurge }, strength);
        const duration = Math.round(280 + strength * 940);
        event = {
          id: ++this.eventId,
          type,
          strength,
          duration,
          direction: bass >= treble ? (this.eventId % 2 ? -1 : 1) : (centroid > .55 ? 1 : -1),
          seed: ((this.eventId * 2654435761) ^ Math.floor(currentNow) ^ Math.floor(centroid * 65535)) >>> 0,
          at: currentNow
        };
        this.lastEventAt = currentNow;
        this.ruptureUntil = currentNow + duration;
        this.aftermathUntil = this.ruptureUntil + 2600 + strength * 4200;
        this.tension *= .14 + (1 - strength) * .18;
      }

      if (silence) {
        if (!this.silenceStartedAt) this.silenceStartedAt = currentNow;
      } else {
        this.silenceStartedAt = 0;
      }

      if (currentNow < this.ruptureUntil) this.setState('RUPTURE', currentNow);
      else if (currentNow < this.aftermathUntil) this.setState('AFTERMATH', currentNow);
      else if (silence && currentNow - this.silenceStartedAt > 650) this.setState('SILENCE', currentNow);
      else if (this.tension > .64 && impact < .11 && onset < onsetThreshold) this.setState('SUSPENSION', currentNow);
      else if (this.tension > .16 || this.arousal > .24 || this.ensemble > .38) this.setState('BUILD', currentNow);
      else this.setState('SEED', currentNow);

      this.updateSectionModel({
        level: rawLevel,
        ensemble: this.ensemble,
        effectiveParts,
        breadth,
        onset,
        flux,
        orchestrationFall,
        spectralFullness,
        fullnessDelta,
        fullnessFall
      }, currentNow, dt, silence);

      this.lastOutput = this.makeOutput(event, impact, onsetThreshold, charge, rawLevel, {
        bass, mid, treble, flux, centroid, flatness, density, breadth, voices, richness,
        orchestrationDensity, orchestrationDelta: orchestrationDeltaInput, orchestrationFall,
        spectralFullness, fullnessDelta, fullnessPersistence, fullnessFall,
        chord: input.chord || 'N', chordConfidence: clamp(input.chordConfidence),
        chordChange: clamp(input.chordChange), harmonicTension: clamp(input.harmonicTension),
        effectiveParts, acid: this.acid, resonance, sweep, sharpness, roughness
      });
      return this.lastOutput;
    }

    get() {
      return JSON.parse(JSON.stringify(this.lastOutput));
    }
  }

  return Object.freeze({
    create: config => new MappingEngine(config),
    defaults: () => ({ ...defaults })
  });
});
