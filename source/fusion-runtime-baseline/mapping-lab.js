(function (root) {
  'use strict';

  const stateLabels = {
    SPARSE: '稀疏', LAYERING: '加层', FULL: '全奏', CLIMAX: '高潮', DROP: '抽空', AFTERGLOW: '余波'
  };
  const stateColors = {
    SPARSE: 'rgba(114,232,206,.18)', LAYERING: 'rgba(119,225,255,.3)', FULL: 'rgba(116,164,255,.42)',
    CLIMAX: 'rgba(255,95,187,.58)', DROP: 'rgba(255,190,95,.54)', AFTERGLOW: 'rgba(141,124,255,.35)'
  };
  const clusterColors = [
    'rgba(141,124,255,.52)', 'rgba(114,232,206,.52)', 'rgba(255,95,187,.5)',
    'rgba(255,190,95,.5)', 'rgba(116,164,255,.52)', 'rgba(182,255,85,.45)', 'rgba(255,120,98,.5)'
  ];

  class MappingLab {
    constructor(engine, suite) {
      this.engine = engine;
      this.suite = suite;
      this.panel = document.querySelector('#mappingLabPanel');
      this.button = document.querySelector('#mappingLabButton');
      this.closeButton = document.querySelector('#mappingLabClose');
      this.resetButton = document.querySelector('#mappingLabReset');
      this.canvas = document.querySelector('#mappingLabCanvas');
      this.ctx = this.canvas?.getContext('2d');
      this.history = [];
      this.lastSampleAt = 0;
      this.lastUiAt = 0;
      this.stateElement = document.querySelector('#mappingState');
      this.chordElement = this.panel?.querySelector('[data-section-chord]');
      this.chordConfidenceElement = this.panel?.querySelector('[data-section-chord-confidence]');
      this.meters = new Map();
      this.engineCards = new Map();
      this.panel?.querySelectorAll('[data-mapping-meter]').forEach(meter => {
        const key = meter.dataset.mappingMeter;
        this.meters.set(key, { meter, text: this.panel.querySelector(`[data-mapping-value="${key}"]`) });
      });
      this.panel?.querySelectorAll('[data-section-engine-toggle]').forEach(card => {
        const id = card.dataset.sectionEngineToggle;
        this.engineCards.set(id, {
          card,
          label: this.panel.querySelector(`[data-section-engine-label="${id}"]`),
          confidence: this.panel.querySelector(`[data-section-engine-confidence="${id}"]`),
          latency: this.panel.querySelector(`[data-section-engine-latency="${id}"]`),
          candidate: this.panel.querySelector(`[data-section-engine-candidate="${id}"]`)
        });
      });
      this.bind();
      this.restore();
      this.resize();
    }

    bind() {
      this.closeButton?.addEventListener('click', () => this.setOpen(false));
      this.resetButton?.addEventListener('click', () => {
        this.engine.reset(performance.now());
        this.suite?.reset(performance.now());
        this.history.length = 0;
        this.draw();
      });
      this.panel?.addEventListener('input', event => {
        const input = event.target.closest('[data-mapping-key]');
        const fusionInput = event.target.closest('[data-fusion-key]');
        if (!input && !fusionInput) return;
        if (input) this.engine.setConfig({ [input.dataset.mappingKey]: Number(input.value) });
        if (fusionInput) this.suite?.setConfig({ [fusionInput.dataset.fusionKey]: Number(fusionInput.value) });
        this.syncControls();
        this.persist();
      });
      this.panel?.addEventListener('click', event => {
        const card = event.target.closest('[data-section-engine-toggle]');
        if (!card || card.dataset.sectionEngineToggle === 'our') return;
        const id = card.dataset.sectionEngineToggle;
        const enabled = card.getAttribute('aria-pressed') !== 'true';
        this.suite?.setEnabled(id, enabled);
        card.setAttribute('aria-pressed', String(enabled));
        card.classList.toggle('is-active', enabled);
        this.persist();
      });
      window.addEventListener('resize', () => {
        if (this.isOpen()) this.resize();
      });
    }

    restore() {
      try {
        const saved = JSON.parse(localStorage.getItem('smoke-resonance-mapping-lab'));
        if (saved && typeof saved === 'object') {
          this.engine.setConfig(saved.mapping || saved);
          if (saved.fusion) this.suite?.setConfig(saved.fusion);
          if (saved.enabled) {
            Object.entries(saved.enabled).forEach(([id, enabled]) => {
              if (id !== 'our') this.suite?.setEnabled(id, enabled);
            });
          }
        }
      } catch (_) {}
      this.syncControls();
    }

    persist() {
      try {
        const enabled = {};
        this.engineCards.forEach(({ card }, id) => { enabled[id] = card.getAttribute('aria-pressed') === 'true'; });
        localStorage.setItem('smoke-resonance-mapping-lab', JSON.stringify({
          mapping: this.engine.getConfig(), fusion: this.suite?.getConfig?.() || {}, enabled
        }));
      } catch (_) {}
    }

    syncControls() {
      const config = this.engine.getConfig();
      this.panel?.querySelectorAll('[data-mapping-key]').forEach(input => { input.value = config[input.dataset.mappingKey]; });
      this.panel?.querySelectorAll('[data-mapping-output]').forEach(output => {
        output.textContent = `${Math.round(config[output.dataset.mappingOutput] * 100)}%`;
      });
      const fusion = this.suite?.getConfig?.() || {};
      this.panel?.querySelectorAll('[data-fusion-key]').forEach(input => { input.value = fusion[input.dataset.fusionKey]; });
      this.panel?.querySelectorAll('[data-fusion-output]').forEach(output => {
        const key = output.dataset.fusionOutput;
        output.textContent = key === 'confirmMs' ? `${(fusion[key] / 1000).toFixed(1)}s` : `${Math.round(fusion[key] * 100)}%`;
      });
      const enabled = this.suite?.get()?.enabled || { our: true, fused: true, foote: true, recurrence: true };
      this.engineCards.forEach(({ card }, id) => {
        const active = id === 'our' || enabled[id] !== false;
        card.setAttribute('aria-pressed', String(active));
        card.classList.toggle('is-active', active);
      });
    }

    setOpen(open) {
      this.panel?.classList.toggle('is-open', open);
      this.panel?.setAttribute('aria-hidden', String(!open));
      this.button?.setAttribute('aria-expanded', String(open));
      if (open) this.resize();
    }

    isOpen() {
      return Boolean(this.panel?.classList.contains('is-open'));
    }

    resize() {
      if (!this.canvas || !this.ctx || !this.isOpen()) return;
      const width = Math.max(320, Math.round(this.canvas.clientWidth || 430));
      const height = Math.max(210, Math.round(this.canvas.clientHeight || 224));
      const dpr = Math.min(window.devicePixelRatio || 1, 1.5);
      this.canvas.width = Math.round(width * dpr);
      this.canvas.height = Math.round(height * dpr);
      this.ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      this.width = width;
      this.height = height;
      this.draw();
    }

    updateEngineCards(sectionOutput) {
      const engines = sectionOutput?.engines || {};
      this.engineCards.forEach((elements, id) => {
        const output = engines[id];
        if (!output) return;
        if (elements.label) {
          elements.label.textContent = output.ready ? (stateLabels[output.label] || output.label) : 'WARMUP';
          elements.label.dataset.state = output.label;
        }
        if (elements.confidence) elements.confidence.textContent = `${Math.round((output.confidence || 0) * 100)}%`;
        if (elements.latency) elements.latency.textContent = `${((output.latencyMs || 0) / 1000).toFixed(1)}s`;
        if (elements.candidate) {
          const candidate = stateLabels[output.candidateLabel] || output.candidateLabel || '—';
          elements.candidate.textContent = `候选 ${candidate} · ${Math.round((output.candidateProgress || 0) * 100)}%`;
        }
        elements.card.classList.toggle('has-event', Boolean(output.event));
        elements.card.classList.toggle('is-ready', Boolean(output.ready));
      });
    }

    update(output, sectionOutput, now = performance.now()) {
      if (!output || !sectionOutput) return;
      const panelOpen = this.isOpen();
      const updateUi = panelOpen && now - this.lastUiAt >= 66;
      if (updateUi) {
        this.lastUiAt = now;
        if (this.stateElement) {
          const confidence = Math.round((output.sectionConfidence || 0) * 100);
          this.stateElement.textContent = `${stateLabels[output.section] || output.section}${confidence ? ` ${confidence}%` : ''}`;
          this.stateElement.dataset.state = output.section;
        }
        this.updateEngineCards(sectionOutput);
      }
      const values = {
        orchestration: sectionOutput.input?.orchestration || output.orchestration || 0,
        orchestrationSurge: output.orchestrationSurge || 0,
        spectralFullness: sectionOutput.input?.fullness || 0,
        chordChange: sectionOutput.input?.chordChange || 0,
        climaxConfidence: output.sectionScores?.climax || 0,
        dropConfidence: output.sectionScores?.drop || 0
      };
      if (updateUi) {
        if (this.chordElement) this.chordElement.textContent = sectionOutput.input?.chord === 'N' ? '—' : sectionOutput.input?.chord || '—';
        if (this.chordConfidenceElement) this.chordConfidenceElement.textContent = `${Math.round((sectionOutput.input?.chordConfidence || 0) * 100)}%`;
        Object.entries(values).forEach(([key, value]) => {
          const elements = this.meters.get(key);
          if (elements?.meter) elements.meter.style.setProperty('--meter', `${Math.round(value * 100)}%`);
          if (elements?.text) elements.text.textContent = value.toFixed(2);
        });
      }
      if (now - this.lastSampleAt >= 100) {
        this.lastSampleAt = now;
        const engines = sectionOutput.engines || {};
        this.history.push({
          orchestration: values.orchestration,
          ourConfidence: engines.our?.confidence || 0,
          ourBoundary: engines.our?.boundary || 0,
          ourState: engines.our?.label || 'SPARSE',
          fusedConfidence: engines.fused?.confidence || 0,
          fusedBoundary: engines.fused?.boundary || 0,
          fusedState: engines.fused?.label || 'SPARSE',
          foote: engines.foote?.boundary || 0,
          footeNovelty: engines.foote?.novelty || 0,
          form: engines.recurrence?.boundary || 0,
          cluster: Number.isFinite(engines.recurrence?.cluster) ? engines.recurrence.cluster : -1,
          fullness: values.spectralFullness
        });
        if (this.history.length > 300) this.history.shift();
        if (panelOpen) this.draw();
      }
    }

    drawCurve(key, color, top, laneHeight, lineWidth = 1.5) {
      if (this.history.length < 2) return;
      const ctx = this.ctx;
      const plotLeft = 46;
      const plotWidth = this.width - plotLeft - 8;
      ctx.beginPath();
      this.history.forEach((sample, index) => {
        const x = plotLeft + index / Math.max(1, this.history.length - 1) * plotWidth;
        const y = top + laneHeight - 5 - (sample[key] || 0) * (laneHeight - 10);
        if (index === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
      });
      ctx.strokeStyle = color;
      ctx.lineWidth = lineWidth;
      ctx.stroke();
    }

    draw() {
      if (!this.ctx) return;
      const ctx = this.ctx;
      const width = this.width || 430;
      const height = this.height || 224;
      const plotLeft = 46;
      const plotWidth = width - plotLeft - 8;
      const top = 22;
      const laneHeight = (height - 38) / 4;
      ctx.clearRect(0, 0, width, height);
      const gradient = ctx.createLinearGradient(0, 0, 0, height);
      gradient.addColorStop(0, 'rgba(17,20,36,.98)');
      gradient.addColorStop(1, 'rgba(4,6,12,.98)');
      ctx.fillStyle = gradient;
      ctx.fillRect(0, 0, width, height);

      ctx.font = '8px sans-serif';
      ctx.fillStyle = 'rgba(255,255,255,.28)';
      ctx.fillText('30s PARALLEL ANALYSIS', 8, 13);
      const labels = ['LIVE', 'FUSED', 'FOOTE', 'FORM'];
      labels.forEach((label, lane) => {
        const y = top + lane * laneHeight;
        ctx.fillStyle = 'rgba(255,255,255,.32)';
        ctx.fillText(label, 8, y + laneHeight * .55);
        ctx.strokeStyle = 'rgba(255,255,255,.06)';
        ctx.beginPath();
        ctx.moveTo(plotLeft, y + laneHeight);
        ctx.lineTo(width - 8, y + laneHeight);
        ctx.stroke();
      });

      if (this.history.length) {
        this.history.forEach((sample, index) => {
          const x = plotLeft + index / Math.max(1, this.history.length - 1) * plotWidth;
          const nextX = plotLeft + (index + 1) / Math.max(1, this.history.length - 1) * plotWidth;
          ctx.fillStyle = stateColors[sample.ourState] || stateColors.SPARSE;
          ctx.fillRect(x, top, Math.max(1, nextX - x + .5), laneHeight);
          ctx.fillStyle = stateColors[sample.fusedState] || stateColors.SPARSE;
          ctx.fillRect(x, top + laneHeight, Math.max(1, nextX - x + .5), laneHeight);
          if (sample.cluster >= 0) {
            ctx.fillStyle = clusterColors[sample.cluster % clusterColors.length];
            ctx.fillRect(x, top + laneHeight * 3, Math.max(1, nextX - x + .5), laneHeight);
          }
        });
      }

      this.drawCurve('ourBoundary', 'rgba(255,255,255,.92)', top, laneHeight, 1.25);
      this.drawCurve('fusedBoundary', 'rgba(255,95,187,.98)', top + laneHeight, laneHeight, 2);
      this.drawCurve('footeNovelty', 'rgba(114,232,206,.42)', top + laneHeight * 2, laneHeight, 1);
      this.drawCurve('foote', 'rgba(114,232,206,.98)', top + laneHeight * 2, laneHeight, 2);
      this.drawCurve('form', 'rgba(255,190,95,.98)', top + laneHeight * 3, laneHeight, 2);

      ctx.save();
      ctx.globalAlpha = .6;
      ctx.setLineDash([2, 3]);
      this.drawCurve('fullness', 'rgba(116,164,255,.82)', top, laneHeight * 4, 1);
      ctx.restore();
    }
  }

  root.SmokeResonanceMappingLab = Object.freeze({
    create: (engine, suite) => new MappingLab(engine, suite)
  });
})(window);
