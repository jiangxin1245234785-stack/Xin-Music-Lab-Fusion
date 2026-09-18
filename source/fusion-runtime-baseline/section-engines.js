(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  if (root) root.SmokeResonanceSectionEngines = api;
})(typeof window !== 'undefined' ? window : globalThis, function () {
  'use strict';

  const clamp = (value, low = 0, high = 1) => Math.max(low, Math.min(high, Number(value) || 0));
  const mix = (from, to, amount) => from + (to - from) * clamp(amount);
  const smoothstep = (edge0, edge1, value) => {
    const x = clamp((value - edge0) / Math.max(1e-6, edge1 - edge0));
    return x * x * (3 - 2 * x);
  };
  const distance = (left, right) => {
    const length = Math.min(left?.length || 0, right?.length || 0);
    if (!length) return 1;
    let sum = 0;
    for (let index = 0; index < length; index++) {
      const delta = (Number(left[index]) || 0) - (Number(right[index]) || 0);
      sum += delta * delta;
    }
    return Math.sqrt(sum / length);
  };
  const averageVector = vectors => {
    if (!vectors.length) return [];
    const result = new Array(vectors[0].length).fill(0);
    vectors.forEach(vector => vector.forEach((value, index) => { result[index] += value; }));
    return result.map(value => value / vectors.length);
  };
  const similarity = (left, right) => clamp(1 - distance(left, right) * 1.65);
  const labelForCluster = index => index < 26 ? String.fromCharCode(65 + index) : `S${index + 1}`;

  class FooteNoveltyEngine {
    constructor(config = {}) {
      this.sampleMs = Math.max(80, Number(config.sampleMs) || 125);
      this.halfWindow = Math.max(6, Number(config.halfWindow) || 10);
      this.reset();
    }

    reset() {
      this.lastSampleAt = -Infinity;
      this.lastBoundaryAt = -Infinity;
      this.vectors = [];
      this.densities = [];
      this.noveltyHistory = [];
      this.pulse = 0;
      this.armed = true;
      this.last = this.output(0, 0, 0, 0, false);
      return this.last;
    }

    checkerboardNovelty() {
      const window = this.halfWindow;
      const total = window * 2;
      if (this.vectors.length < total) return 0;
      const frames = this.vectors.slice(-total);
      let within = 0;
      let withinCount = 0;
      let cross = 0;
      let crossCount = 0;
      for (let left = 0; left < total; left += 2) {
        for (let right = left + 1; right < total; right += 2) {
          const value = similarity(frames[left], frames[right]);
          const sameSide = (left < window) === (right < window);
          if (sameSide) { within += value; withinCount++; }
          else { cross += value; crossCount++; }
        }
      }
      return clamp((within / Math.max(1, withinCount) - cross / Math.max(1, crossCount)) * 3.2);
    }

    output(now, novelty, score, direction, boundary) {
      return {
        id: 'foote', family: 'boundary', name: 'Foote Novelty',
        reference: 'MSAF Foote / checkerboard novelty', ready: this.vectors.length >= this.halfWindow * 2,
        label: boundary || now - this.lastBoundaryAt < 900 ? 'CHANGE' : 'STABLE',
        confidence: clamp(score), boundary: clamp(this.pulse), novelty: clamp(novelty),
        direction: Math.max(-1, Math.min(1, direction || 0)), latencyMs: this.halfWindow * this.sampleMs,
        event: boundary ? { type: 'boundary', at: now, strength: clamp(score), direction } : null
      };
    }

    update(frame, now) {
      if (!frame?.ready || now - this.lastSampleAt < this.sampleMs) {
        this.pulse *= .94;
        this.last = { ...this.last, boundary: this.pulse, event: null };
        return this.last;
      }
      this.lastSampleAt = now;
      this.vectors.push(Array.from(frame.vector || []));
      this.densities.push(clamp(frame.orchestrationDensity));
      if (this.vectors.length > 192) this.vectors.shift();
      if (this.densities.length > 192) this.densities.shift();
      const novelty = this.checkerboardNovelty();
      this.noveltyHistory.push(novelty);
      if (this.noveltyHistory.length > 96) this.noveltyHistory.shift();
      const mean = this.noveltyHistory.reduce((sum, value) => sum + value, 0) / this.noveltyHistory.length;
      const variance = this.noveltyHistory.reduce((sum, value) => sum + (value - mean) ** 2, 0) / this.noveltyHistory.length;
      const deviation = Math.sqrt(variance);
      const absoluteScore = smoothstep(.035, .22, novelty);
      const adaptiveScore = smoothstep(mean + deviation * .75 + .012, mean + deviation * 2.8 + .035, novelty);
      const score = clamp(Math.max(absoluteScore * .72, adaptiveScore));
      const window = this.halfWindow;
      const oldDensity = this.densities.slice(-window * 2, -window).reduce((sum, value) => sum + value, 0) / Math.max(1, window);
      const newDensity = this.densities.slice(-window).reduce((sum, value) => sum + value, 0) / Math.max(1, window);
      const direction = clamp((newDensity - oldDensity) * 3.2, -1, 1);
      if (score < .3) this.armed = true;
      const boundary = this.vectors.length >= window * 2 && this.armed && score > .62 && now - this.lastBoundaryAt > 1450;
      if (boundary) {
        this.armed = false;
        this.lastBoundaryAt = now;
        this.pulse = score;
      } else this.pulse *= .82;
      this.last = this.output(now, novelty, score, direction, boundary);
      return this.last;
    }
  }

  class RecurrenceFormEngine {
    constructor(config = {}) {
      this.sampleMs = Math.max(300, Number(config.sampleMs) || 500);
      this.maxClusters = Math.max(3, Number(config.maxClusters) || 7);
      this.reset();
    }

    reset() {
      this.lastSampleAt = -Infinity;
      this.lastBoundaryAt = -Infinity;
      this.startedAt = 0;
      this.clusters = [];
      this.current = -1;
      this.candidate = -1;
      this.candidateCount = 0;
      this.boundaryPulse = 0;
      this.last = this.output(0, 0, false, 0, 0);
      return this.last;
    }

    createCluster(vector, now) {
      if (this.clusters.length >= this.maxClusters) return -1;
      const index = this.clusters.length;
      this.clusters.push({ centroid: [...vector], count: 1, createdAt: now, lastSeenAt: now });
      return index;
    }

    output(now, confidence, boundary, direction, recurrence) {
      return {
        id: 'recurrence', family: 'form', name: 'Recurrence Form',
        reference: 'MSAF scluster / recurrence-family causal approximation',
        ready: this.clusters.length > 0 && now - this.startedAt > 3200,
        label: this.current >= 0 ? labelForCluster(this.current) : '—',
        confidence: clamp(confidence), boundary: clamp(this.boundaryPulse), novelty: clamp(this.boundaryPulse),
        direction: Math.max(-1, Math.min(1, direction || 0)), latencyMs: this.sampleMs * 2,
        cluster: this.current, clusterCount: this.clusters.length, recurrence: clamp(recurrence),
        event: boundary ? { type: 'form-change', at: now, strength: clamp(confidence), direction } : null
      };
    }

    update(frame, now) {
      if (!frame?.ready || now - this.lastSampleAt < this.sampleMs) {
        this.boundaryPulse *= .96;
        this.last = { ...this.last, boundary: this.boundaryPulse, event: null };
        return this.last;
      }
      this.lastSampleAt = now;
      if (!this.startedAt) this.startedAt = now;
      const vector = Array.from(frame.vector || []);
      if (!this.clusters.length) {
        this.current = this.createCluster(vector, now);
        this.last = this.output(now, .45, false, 0, 0);
        return this.last;
      }

      const matches = this.clusters.map((cluster, index) => ({ index, similarity: similarity(vector, cluster.centroid) }))
        .sort((left, right) => right.similarity - left.similarity);
      let best = matches[0];
      const currentMatch = matches.find(match => match.index === this.current) || best;
      const second = matches[1]?.similarity || 0;
      const newSection = best.similarity < .79 && this.clusters.length < this.maxClusters;
      const proposed = newSection ? this.clusters.length : best.index;
      const changeStrength = newSection
        ? clamp((.82 - best.similarity) * 3.8)
        : clamp((best.similarity - currentMatch.similarity) * 4.2 + (1 - currentMatch.similarity) * .8);

      if (proposed !== this.current && changeStrength > .16) {
        if (this.candidate === proposed) this.candidateCount++;
        else { this.candidate = proposed; this.candidateCount = 1; }
      } else {
        this.candidate = -1;
        this.candidateCount = 0;
      }

      let boundary = false;
      let recurrence = 0;
      const previous = this.current;
      if (this.candidateCount >= 2 && now - this.lastBoundaryAt > 1800) {
        if (this.candidate === this.clusters.length) this.current = this.createCluster(vector, now);
        else this.current = this.candidate;
        boundary = this.current >= 0 && this.current !== previous;
        recurrence = boundary && this.current < this.clusters.length - 1 ? 1 : 0;
        this.candidate = -1;
        this.candidateCount = 0;
        if (boundary) {
          this.lastBoundaryAt = now;
          this.boundaryPulse = clamp(.52 + changeStrength * .48);
        }
      }

      const cluster = this.clusters[this.current];
      if (cluster && (!boundary || similarity(vector, cluster.centroid) > .76)) {
        const alpha = clamp(1 / Math.min(28, cluster.count + 1), .025, .18);
        cluster.centroid = cluster.centroid.map((value, index) => mix(value, vector[index] || 0, alpha));
        cluster.count++;
        cluster.lastSeenAt = now;
      }
      this.boundaryPulse *= boundary ? 1 : .78;
      const selectedSimilarity = this.clusters[this.current] ? similarity(vector, this.clusters[this.current].centroid) : 0;
      const margin = Math.max(0, selectedSimilarity - second);
      const confidence = clamp(smoothstep(.68, .92, selectedSimilarity) * .72 + smoothstep(.015, .12, margin) * .28);
      const direction = boundary ? clamp((frame.orchestrationDelta || 0) - (frame.orchestrationFall || 0), -1, 1) : 0;
      this.last = this.output(now, confidence, boundary, direction, recurrence);
      return this.last;
    }
  }

  class FusedSectionEngine {
    constructor(config = {}) {
      this.config = {
        fullnessWeight: 1.15,
        liveWeight: .75,
        boundaryWeight: .65,
        harmonyWeight: .35,
        confirmMs: 2400
      };
      this.setConfig(config);
      this.reset();
    }

    setConfig(values = {}) {
      if (values.fullnessWeight !== undefined) this.config.fullnessWeight = clamp(values.fullnessWeight, .35, 1.8);
      if (values.liveWeight !== undefined) this.config.liveWeight = clamp(values.liveWeight, 0, 1.5);
      if (values.boundaryWeight !== undefined) this.config.boundaryWeight = clamp(values.boundaryWeight, 0, 1.5);
      if (values.harmonyWeight !== undefined) this.config.harmonyWeight = clamp(values.harmonyWeight, 0, 1.5);
      if (values.confirmMs !== undefined) this.config.confirmMs = Math.max(1400, Math.min(4200, Number(values.confirmMs) || 2400));
      return { ...this.config };
    }

    getConfig() {
      return { ...this.config };
    }

    reset(now = 0) {
      this.state = 'SPARSE';
      this.stateStartedAt = now;
      this.candidate = 'SPARSE';
      this.candidateAt = now;
      this.boundaryPulse = 0;
      this.last = this.output(now, {}, 0, null, 0, 0);
      return this.last;
    }

    requiredMs(label, boundaryEvidence) {
      const factor = label === 'CLIMAX' ? 1.15 : label === 'FULL' ? 1 : label === 'DROP' ? .7 : label === 'LAYERING' ? .82 : .86;
      return Math.max(1400, this.config.confirmMs * factor * (1 - clamp(boundaryEvidence) * .16));
    }

    output(now, scores, confidence, event, candidateProgress, requiredMs) {
      return {
        id: 'fused', family: 'adjudicator', name: 'OUR Fused',
        reference: 'Xin delayed causal evidence fusion', ready: Boolean(scores.ready),
        label: this.state, confidence: clamp(confidence), boundary: clamp(this.boundaryPulse),
        novelty: clamp(scores.boundaryEvidence), direction: clamp(scores.direction, -1, 1),
        latencyMs: Math.round(requiredMs || this.config.confirmMs),
        candidateLabel: this.candidate,
        candidateConfidence: clamp(scores[this.candidate?.toLowerCase()] || 0),
        candidateProgress: clamp(candidateProgress),
        sectionScores: {
          layering: clamp(scores.layering), full: clamp(scores.full),
          climax: clamp(scores.climax), drop: clamp(scores.drop)
        },
        evidence: {
          fullness: clamp(scores.fullness), fullnessDelta: clamp(scores.fullnessDelta),
          persistence: clamp(scores.persistence), boundary: clamp(scores.boundaryEvidence),
          harmony: clamp(scores.harmonyEvidence), live: clamp(scores.liveEvidence)
        },
        event
      };
    }

    update(frame, now, live, foote, recurrence) {
      if (!frame?.ready) {
        this.boundaryPulse *= .9;
        this.last = { ...this.last, ready: false, boundary: this.boundaryPulse, event: null };
        return this.last;
      }
      const liveScores = live?.sectionScores || {};
      const fullness = clamp(frame.spectralFullness);
      const fullnessDelta = clamp(frame.fullnessDelta);
      const persistence = clamp(frame.fullnessPersistence);
      const fullnessFall = clamp(frame.fullnessFall);
      const orchestration = clamp(frame.orchestrationDensity);
      const orchestrationDelta = clamp(frame.orchestrationDelta);
      const orchestrationFall = clamp(frame.orchestrationFall);
      const chordChange = clamp(frame.chordChange);
      const harmonicTension = clamp(frame.harmonicTension);
      const footeEvidence = foote?.ready ? Math.max(foote.boundary || 0, foote.novelty || 0) : 0;
      const formEvidence = recurrence?.ready ? recurrence.boundary || 0 : 0;
      const boundaryEvidence = clamp(
        Math.max(footeEvidence, formEvidence) * this.config.boundaryWeight
        + chordChange * this.config.harmonyWeight * .22
      );
      const harmonyEvidence = clamp(harmonicTension * .55 + chordChange * .45);
      const liveEvidence = clamp(Math.max(liveScores.layering || 0, liveScores.full || 0, liveScores.climax || 0, liveScores.drop || 0));
      const spectralHigh = smoothstep(.43, .76, fullness);
      const silence = clamp(frame.overall) < .025 && fullness < .08;
      const scores = {
        ready: true,
        fullness,
        fullnessDelta,
        persistence,
        boundaryEvidence,
        harmonyEvidence,
        liveEvidence,
        direction: clamp((fullnessDelta + orchestrationDelta) - (fullnessFall + orchestrationFall), -1, 1),
        layering: clamp(
          (fullnessDelta * .42 + orchestrationDelta * .28 + persistence * .12) * this.config.fullnessWeight
          + (liveScores.layering || 0) * .34 * this.config.liveWeight
          + boundaryEvidence * .12
        ),
        full: clamp(
          (fullness * .5 + persistence * .24 + orchestration * .16 + spectralHigh * .1) * this.config.fullnessWeight
          + (liveScores.full || 0) * .3 * this.config.liveWeight
        ),
        climax: clamp(
          (fullness * .42 + persistence * .26 + fullnessDelta * .16 + spectralHigh * .16) * this.config.fullnessWeight
          + (liveScores.climax || 0) * .28 * this.config.liveWeight
          + harmonyEvidence * .09 * this.config.harmonyWeight
        ),
        drop: clamp(
          (fullnessFall * .54 + orchestrationFall * .26 + (1 - fullness) * persistence * .12) * this.config.fullnessWeight
          + (liveScores.drop || 0) * .3 * this.config.liveWeight
          + boundaryEvidence * .1
        )
      };

      let target = 'SPARSE';
      if (!silence) {
        if (scores.drop > .57) target = 'DROP';
        else if (scores.climax > .68 && fullness > .48) target = 'CLIMAX';
        else if (scores.full > .53 && fullness > .38) target = 'FULL';
        else if (scores.layering > .25 || scores.full > .31 || orchestration > .3) target = 'LAYERING';
      }
      if (target === this.state) {
        this.candidate = target;
        this.candidateAt = now;
      } else if (target !== this.candidate) {
        this.candidate = target;
        this.candidateAt = now;
      }
      const requiredMs = this.requiredMs(this.candidate, boundaryEvidence);
      const candidateProgress = target === this.state ? 1 : (now - this.candidateAt) / requiredMs;
      let event = null;
      if (target !== this.state && candidateProgress >= 1) {
        const previous = this.state;
        this.state = target;
        this.stateStartedAt = now;
        this.boundaryPulse = clamp(.52 + boundaryEvidence * .28 + (scores[target.toLowerCase()] || 0) * .2);
        event = { type: 'fused-section', at: now, from: previous, to: target, strength: this.boundaryPulse };
        this.candidate = target;
        this.candidateAt = now;
      } else this.boundaryPulse *= .86;
      const stateScore = this.state === 'SPARSE'
        ? clamp(1 - Math.max(scores.layering, scores.full, scores.climax, scores.drop))
        : clamp(scores[this.state.toLowerCase()] || 0);
      this.last = this.output(now, scores, stateScore, event, candidateProgress, requiredMs);
      return this.last;
    }
  }

  class SectionEngineSuite {
    constructor(config = {}) {
      this.enabled = { our: true, fused: true, foote: true, recurrence: true };
      this.foote = new FooteNoveltyEngine(config.foote);
      this.recurrence = new RecurrenceFormEngine(config.recurrence);
      this.fused = new FusedSectionEngine(config.fused);
      this.reset();
    }

    reset(now = 0) {
      this.foote.reset();
      this.recurrence.reset();
      this.fused.reset(now);
      this.last = {
        now,
        input: { source: 'raw-section-bus-v1', ready: false },
        enabled: { ...this.enabled },
        engines: {
          our: { id: 'our', name: 'OUR State', family: 'state', ready: false, label: 'SPARSE', confidence: 0, boundary: 0, direction: 0, latencyMs: 0 },
          fused: this.fused.last,
          foote: this.foote.last,
          recurrence: this.recurrence.last
        }
      };
      return this.get();
    }

    setEnabled(id, enabled) {
      if (id in this.enabled) this.enabled[id] = Boolean(enabled);
      if (this.last) this.last.enabled = { ...this.enabled };
      return { ...this.enabled };
    }

    setConfig(values = {}) {
      return this.fused.setConfig(values);
    }

    getConfig() {
      return this.fused.getConfig();
    }

    update(frame, now, legacyOutput) {
      const structureDelta = legacyOutput?.structureDelta || {};
      const rise = Math.max(structureDelta.ensembleLift || 0, structureDelta.partsLift || 0, frame?.orchestrationDelta || 0);
      const fall = Math.max(structureDelta.ensembleFall || 0, structureDelta.partsFall || 0, frame?.orchestrationFall || 0);
      const legacyBoundary = clamp(Math.max(legacyOutput?.novelty || 0, rise * .72, fall * .82, legacyOutput?.sectionScores?.drop || 0));
      const our = {
        id: 'our', family: 'state', name: 'OUR State', reference: 'Xin causal arrangement state engine',
        ready: Boolean(frame?.ready && legacyOutput), label: legacyOutput?.section || 'SPARSE',
        confidence: clamp(legacyOutput?.sectionConfidence || 0), boundary: legacyBoundary,
        novelty: clamp(legacyOutput?.novelty || 0), direction: clamp(rise - fall, -1, 1), latencyMs: 0,
        sectionScores: legacyOutput?.sectionScores || { layering: 0, full: 0, climax: 0, drop: 0 }
      };
      const foote = this.enabled.foote ? this.foote.update(frame, now) : { ...this.foote.last, ready: false, event: null };
      const recurrence = this.enabled.recurrence ? this.recurrence.update(frame, now) : { ...this.recurrence.last, ready: false, event: null };
      const fused = this.enabled.fused
        ? this.fused.update(frame, now, our, foote, recurrence)
        : { ...this.fused.last, ready: false, event: null };
      this.last = {
        now,
        input: {
          source: frame?.source || 'raw-section-bus-v1', ready: Boolean(frame?.ready),
          orchestration: clamp(frame?.orchestrationDensity), level: clamp(frame?.overall),
          fullness: clamp(frame?.spectralFullness), fullnessDelta: clamp(frame?.fullnessDelta),
          fullnessPersistence: clamp(frame?.fullnessPersistence), fullnessFall: clamp(frame?.fullnessFall),
          chord: frame?.chord || 'N', chordConfidence: clamp(frame?.chordConfidence),
          chordChange: clamp(frame?.chordChange), harmonicTension: clamp(frame?.harmonicTension),
          chroma: Array.from(frame?.chroma || []), flux: clamp(frame?.flux), bands: frame?.profile?.length || 0
        },
        enabled: { ...this.enabled },
        engines: { our, fused, foote, recurrence }
      };
      return this.get();
    }

    get() {
      return JSON.parse(JSON.stringify(this.last));
    }
  }

  return Object.freeze({
    create: config => new SectionEngineSuite(config),
    references: () => ({
      foote: 'https://github.com/urinieto/msaf/tree/main/msaf/algorithms/foote',
      recurrence: 'https://github.com/urinieto/msaf/tree/main/msaf/algorithms/scluster'
    })
  });
});
