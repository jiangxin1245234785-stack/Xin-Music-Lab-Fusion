(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.SmokeResonanceSourceInspector = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';

  const VERSION = '2.4.0-shadow';
  const UPDATE_INTERVAL_MS = 125;
  const UNKNOWN = 'UNKNOWN';
  const GROUPS = Object.freeze([
    Object.freeze({
      id: 'energy',
      label: '能量与频谱',
      features: Object.freeze([
        ['loudness', '响度'],
        ['bass', '低频'],
        ['mid', '中频'],
        ['treble', '高频'],
        ['dynamicRange', '动态范围'],
        ['spectralDensity', '频谱密度'],
        ['flux', '频谱变化'],
        ['flatness', '平坦度'],
        ['sharpness', '尖锐度'],
        ['buildEnergy', '推进能量'],
        ['sectionDrive', '段落驱动'],
        ['rhythmPhase', '节奏相位'],
        ['chordConfidence', '和弦置信']
      ])
    }),
    Object.freeze({
      id: 'state',
      label: '持续状态',
      features: Object.freeze([
        ['silence', '静音'],
        ['inBuild', '推进中'],
        ['inDrop', '抽空中'],
        ['inClimax', '高潮中']
      ])
    }),
    Object.freeze({
      id: 'event',
      label: '瞬时事件',
      features: Object.freeze([
        ['onset', '起音'],
        ['bassPeak', '低频峰值'],
        ['sectionBoundary', '段落边界'],
        ['dropEnter', '进入抽空'],
        ['climaxEnter', '进入高潮'],
        ['chordChange', '和弦变化']
      ])
    }),
    Object.freeze({
      id: 'label',
      label: '结构与和声',
      features: Object.freeze([
        ['sectionId', '段落 ID'],
        ['sectionLabel', '段落标签'],
        ['chord', '和弦']
      ])
    })
  ]);
  const FEATURE_GROUP = Object.freeze(
    Object.fromEntries(
      GROUPS.flatMap(group =>
        group.features.map(([featureId]) => [featureId, group.id])
      )
    )
  );

  const clamp01 = value => {
    const number = Number(value);
    return Number.isFinite(number)
      ? Math.max(0, Math.min(1, number))
      : 0;
  };

  function classifyXldError(errorCode) {
    const code = typeof errorCode === 'string' ? errorCode : '';
    if (!code || [
      'XLD_NOT_LOADED',
      'PROVIDER_UNAVAILABLE',
      'NO_XLD'
    ].includes(code)) {
      return null;
    }
    if ([
      'XLD_CONTRACT_MISSING',
      'XLD_CONTRACT_UNSUPPORTED',
      'XLD_SCHEMA_VERSION_UNSUPPORTED'
    ].includes(code)) {
      return {
        category: 'contract',
        label: 'XLD 契约拒绝',
        code
      };
    }
    if ([
      'XLD_TRACK_ID_MISMATCH',
      'XLD_TRACK_SOURCE_MISMATCH'
    ].includes(code)) {
      return {
        category: 'track',
        label: '曲目身份不匹配',
        code
      };
    }
    if (code === 'XLD_DURATION_MISMATCH') {
      return {
        category: 'duration',
        label: '音频时长不匹配',
        code
      };
    }
    return {
      category: 'provider',
      label: 'XLD 数据不可用',
      code
    };
  }

  function featureValue(frame, featureId) {
    if (FEATURE_GROUP[featureId] === 'energy') {
      return frame?.continuous?.[featureId];
    }
    if (FEATURE_GROUP[featureId] === 'state') {
      return frame?.states?.[featureId];
    }
    if (FEATURE_GROUP[featureId] === 'event') {
      return frame?.events?.[featureId];
    }
    return frame?.labels?.[featureId];
  }

  function formatAge(value) {
    const number = Number(value);
    if (!Number.isFinite(number) || number < 0) return UNKNOWN;
    if (number >= 1000) return `${(number / 1000).toFixed(1)} s`;
    return `${Math.round(number)} ms`;
  }

  function formatConfidence(value) {
    if (value === null || value === undefined) return UNKNOWN;
    const number = Number(value);
    return Number.isFinite(number)
      ? `${Math.round(clamp01(number) * 100)}%`
      : UNKNOWN;
  }

  function formatProvider(meta) {
    if (!meta || typeof meta.sourceProvider !== 'string') return UNKNOWN;
    const engineId = String(meta.providerDetail?.engineId || '');
    return engineId
      ? `${meta.sourceProvider} · ${engineId}`
      : meta.sourceProvider;
  }

  function formatValue(featureId, frame) {
    const meta = frame?.meta?.[featureId];
    if (!meta || meta.available !== true) return UNKNOWN;
    const value = featureValue(frame, featureId);
    const group = FEATURE_GROUP[featureId];
    if (group === 'event') {
      return value
        ? `EVENT ${Math.round(clamp01(value.strength) * 100)}%`
        : 'IDLE';
    }
    if (group === 'label') {
      return typeof value === 'string' && value
        ? value
        : UNKNOWN;
    }
    const number = Number(value);
    return Number.isFinite(number)
      ? `${Math.round(clamp01(number) * 100)}%`
      : UNKNOWN;
  }

  function buildSnapshot(frame, context = {}) {
    const rows = GROUPS.flatMap(group =>
      group.features.map(([featureId, label]) => {
        const meta = frame?.meta?.[featureId] || null;
        return {
          featureId,
          label,
          group: group.id,
          value: formatValue(featureId, frame),
          provider: formatProvider(meta),
          confidence: formatConfidence(meta?.confidence),
          age: formatAge(meta?.ageMs),
          fallback: meta?.fallbackReason || '—',
          available: meta?.available === true
        };
      })
    );
    const activeProviders = new Set(
      rows
        .filter(row => row.available)
        .map(row => frame.meta[row.featureId]?.sourceProvider)
        .filter(Boolean)
    );
    const hasXld = [...activeProviders].some(provider =>
      String(provider).startsWith('xld.')
    );
    const hasRealtime = [...activeProviders].some(provider =>
      String(provider).startsWith('realtime.')
    );
    const hasHeld = activeProviders.has('held-last');
    const sourceState = hasXld && hasRealtime
      ? 'HYBRID'
      : hasXld
        ? 'XLD'
        : hasRealtime
          ? 'LIVE'
          : hasHeld
            ? 'HOLD'
            : 'NEUTRAL';
    const transport = frame?.transport || {};
    return {
      version: VERSION,
      sourceState,
      transport: [
        String(transport.mode || 'unknown').toUpperCase(),
        String(transport.state || 'unknown').toUpperCase(),
        `E${Number.isInteger(transport.epoch) ? transport.epoch : 0}`
      ].join(' · '),
      warning: classifyXldError(context.xldStatus?.error),
      rows
    };
  }

  function copy(value) {
    return value === null || value === undefined
      ? value
      : JSON.parse(JSON.stringify(value));
  }

  class SourceInspector {
    constructor(options = {}) {
      this.root = options.root || null;
      this.intervalMs = Math.max(
        100,
        Math.min(200, Number(options.intervalMs) || UPDATE_INTERVAL_MS)
      );
      this.lastSampleAt = -Infinity;
      this.signature = '';
      this.lastSnapshot = null;
      this.sampleCount = 0;
      this.updateCount = 0;
      this.domWrites = 0;
      this.rows = new Map();
      if (this.root) this.buildDom();
    }

    buildDom() {
      const container = this.root.querySelector(
        '[data-inspector-rows]'
      );
      if (!container || this.rows.size) return;
      const documentRef = this.root.ownerDocument;
      for (const group of GROUPS) {
        const section = documentRef.createElement('section');
        section.className = 'source-inspector__group';
        section.dataset.inspectorGroup = group.id;
        const heading = documentRef.createElement('h3');
        heading.textContent = group.label;
        section.append(heading);
        for (const [featureId, label] of group.features) {
          const row = documentRef.createElement('article');
          row.className = 'source-inspector__row';
          row.dataset.inspectorFeature = featureId;
          row.innerHTML = [
            '<div class="source-inspector__primary">',
            `<span>${label}<code>${featureId}</code></span>`,
            '<strong data-inspector-field="value">UNKNOWN</strong>',
            '</div>',
            '<div class="source-inspector__provider" data-inspector-field="provider">UNKNOWN</div>',
            '<div class="source-inspector__meta">',
            '<span>CONF <b data-inspector-field="confidence">UNKNOWN</b></span>',
            '<span>AGE <b data-inspector-field="age">UNKNOWN</b></span>',
            '<span>FALLBACK <b data-inspector-field="fallback">—</b></span>',
            '</div>'
          ].join('');
          section.append(row);
          this.rows.set(featureId, {
            root: row,
            value: row.querySelector('[data-inspector-field="value"]'),
            provider: row.querySelector('[data-inspector-field="provider"]'),
            confidence: row.querySelector(
              '[data-inspector-field="confidence"]'
            ),
            age: row.querySelector('[data-inspector-field="age"]'),
            fallback: row.querySelector(
              '[data-inspector-field="fallback"]'
            )
          });
        }
        container.append(section);
      }
    }

    writeText(node, value) {
      if (!node || node.textContent === value) return 0;
      node.textContent = value;
      return 1;
    }

    writeAttribute(node, name, value) {
      if (!node || node.getAttribute(name) === value) return 0;
      node.setAttribute(name, value);
      return 1;
    }

    render(snapshot) {
      if (!this.root) return 0;
      let writes = 0;
      const state = this.root.querySelector('[data-inspector-state]');
      const transport = this.root.querySelector(
        '[data-inspector-transport]'
      );
      const warning = this.root.querySelector(
        '[data-inspector-warning]'
      );
      writes += this.writeText(state, snapshot.sourceState);
      writes += this.writeAttribute(
        state,
        'data-state',
        snapshot.sourceState.toLowerCase()
      );
      writes += this.writeText(transport, snapshot.transport);
      const warningText = snapshot.warning
        ? `${snapshot.warning.label} · ${snapshot.warning.code}`
        : '';
      writes += this.writeText(warning, warningText);
      writes += this.writeAttribute(
        warning,
        'data-category',
        snapshot.warning?.category || 'none'
      );
      if (warning) {
        const hidden = snapshot.warning ? null : '';
        if (hidden === null && warning.hasAttribute('hidden')) {
          warning.removeAttribute('hidden');
          writes++;
        } else if (hidden === '' && !warning.hasAttribute('hidden')) {
          warning.setAttribute('hidden', '');
          writes++;
        }
      }
      for (const row of snapshot.rows) {
        const nodes = this.rows.get(row.featureId);
        if (!nodes) continue;
        writes += this.writeText(nodes.value, row.value);
        writes += this.writeText(nodes.provider, row.provider);
        writes += this.writeText(
          nodes.confidence,
          row.confidence
        );
        writes += this.writeText(nodes.age, row.age);
        writes += this.writeText(nodes.fallback, row.fallback);
        writes += this.writeAttribute(
          nodes.root,
          'data-available',
          String(row.available)
        );
      }
      return writes;
    }

    update(engineTimeMs, frame, context = {}) {
      const nowMs = Number(engineTimeMs);
      const safeNow = Number.isFinite(nowMs) ? Math.max(0, nowMs) : 0;
      if (safeNow < this.lastSampleAt) this.lastSampleAt = -Infinity;
      if (safeNow - this.lastSampleAt < this.intervalMs) {
        return {
          sampled: false,
          updated: false,
          writes: 0
        };
      }
      this.lastSampleAt = safeNow;
      this.sampleCount++;
      const snapshot = buildSnapshot(frame, context);
      const signature = JSON.stringify(snapshot);
      this.lastSnapshot = snapshot;
      if (signature === this.signature) {
        return {
          sampled: true,
          updated: false,
          writes: 0
        };
      }
      this.signature = signature;
      const writes = this.render(snapshot);
      this.domWrites += writes;
      this.updateCount++;
      return {
        sampled: true,
        updated: true,
        writes
      };
    }

    status() {
      return {
        version: VERSION,
        intervalMs: this.intervalMs,
        rateHz: 1000 / this.intervalMs,
        lastSampleAt: Number.isFinite(this.lastSampleAt)
          ? this.lastSampleAt
          : null,
        sampleCount: this.sampleCount,
        updateCount: this.updateCount,
        domWrites: this.domWrites,
        snapshot: copy(this.lastSnapshot)
      };
    }
  }

  return Object.freeze({
    create: options => new SourceInspector(options),
    buildSnapshot,
    classifyXldError,
    constants: Object.freeze({
      VERSION,
      UPDATE_INTERVAL_MS,
      UNKNOWN,
      GROUPS,
      FEATURE_GROUP
    })
  });
});
