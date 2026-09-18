(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.SmokeResonanceFrameOwnership = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';

  const VERSION = '4.5.0-single-raf-formal-gate';
  const CONTRACT = 'xin.xml-generator-frame-ownership/1';

  const copy = value => value === null || value === undefined
    ? value
    : JSON.parse(JSON.stringify(value));
  const nonNegativeInteger = value => Number.isInteger(Number(value)) &&
    Number(value) >= 0 ? Number(value) : null;

  class FrameOwnershipMonitor {
    constructor(options = {}) {
      this.owner = String(options.owner || 'legacy.animate');
      this.formalPipeline = options.formalPipeline === 'generator'
        ? 'generator'
        : 'legacy';
      this.subscriber = String(
        options.subscriber || 'generator-runtime-shadow'
      );
      this.maxSamples = Math.max(
        16,
        Math.min(2048, Number(options.maxSamples) || 512)
      );
      this.reset();
    }

    reset() {
      this.observing = false;
      this.observedFrames = 0;
      this.readyFrames = 0;
      this.lastFrameIndex = null;
      this.lastNowMs = null;
      this.lastReadyFrameIndex = null;
      this.lastEvaluateCalls = null;
      this.lastRenderRequests = null;
      this.rafRequestsPeak = 0;
      this.samples = [];
      this.violations = {
        reentrantObservations: 0,
        duplicateFrames: 0,
        clockRegressions: 0,
        skippedHostFrames: 0,
        evaluateDeltaMismatch: 0,
        renderRequestDeltaMismatch: 0,
        outputFrameMismatch: 0,
        subscriberRafRequests: 0
      };
      return this.get();
    }

    observe(clock, runtimeStatus) {
      if (this.observing) {
        this.violations.reentrantObservations++;
        return this.get();
      }
      this.observing = true;
      try {
        const frameIndex = nonNegativeInteger(clock?.frameIndex);
        const nowMs = Number(clock?.nowMs);
        if (frameIndex === null || !Number.isFinite(nowMs)) {
          this.violations.clockRegressions++;
          return this.get();
        }
        if (this.lastFrameIndex !== null) {
          if (frameIndex === this.lastFrameIndex) {
            this.violations.duplicateFrames++;
          } else if (frameIndex < this.lastFrameIndex || nowMs < this.lastNowMs) {
            this.violations.clockRegressions++;
          } else if (frameIndex > this.lastFrameIndex + 1) {
            this.violations.skippedHostFrames +=
              frameIndex - this.lastFrameIndex - 1;
          }
        }
        this.observedFrames++;
        this.lastFrameIndex = frameIndex;
        this.lastNowMs = nowMs;

        const ready = runtimeStatus?.loadState === 'ready';
        const evaluateCalls = nonNegativeInteger(runtimeStatus?.evaluateCalls);
        const renderRequests = nonNegativeInteger(runtimeStatus?.renderRequests);
        const subscriberRafRequests = nonNegativeInteger(
          runtimeStatus?.runtime?.profile?.rafRequests
        ) || 0;
        this.rafRequestsPeak = Math.max(
          this.rafRequestsPeak,
          subscriberRafRequests
        );
        if (subscriberRafRequests > 0) {
          this.violations.subscriberRafRequests++;
        }
        if (ready && evaluateCalls !== null && renderRequests !== null) {
          this.readyFrames++;
          if (this.lastReadyFrameIndex !== null) {
            const frameDelta = frameIndex - this.lastReadyFrameIndex;
            if (evaluateCalls - this.lastEvaluateCalls !== frameDelta) {
              this.violations.evaluateDeltaMismatch++;
            }
            if (renderRequests - this.lastRenderRequests !== frameDelta) {
              this.violations.renderRequestDeltaMismatch++;
            }
          }
          this.lastReadyFrameIndex = frameIndex;
          this.lastEvaluateCalls = evaluateCalls;
          this.lastRenderRequests = renderRequests;
          const outputFrame = nonNegativeInteger(
            runtimeStatus?.renderReport?.output?.frameIndex
          );
          if (outputFrame !== null && outputFrame !== frameIndex) {
            this.violations.outputFrameMismatch++;
          }
        }
        this.samples.push(Object.freeze({
          frameIndex,
          nowMs,
          ready,
          evaluateCalls,
          renderRequests,
          actualRenders: nonNegativeInteger(
            runtimeStatus?.runtime?.profile?.renderCalls
          ),
          subscriberRafRequests
        }));
        if (this.samples.length > this.maxSamples) this.samples.shift();
        return this.get();
      } finally {
        this.observing = false;
      }
    }

    get() {
      const violationCount = Object.values(this.violations)
        .reduce((sum, value) => sum + value, 0);
      return Object.freeze({
        contract: CONTRACT,
        version: VERSION,
        formalPipeline: this.formalPipeline,
        owner: this.owner,
        continuousRafOwners: 1,
        subscriber: this.subscriber,
        subscriberMode: 'synchronous-engine-clock',
        observedFrames: this.observedFrames,
        readyFrames: this.readyFrames,
        lastFrameIndex: this.lastFrameIndex,
        rafRequestsPeak: this.rafRequestsPeak,
        violations: Object.freeze({ ...this.violations }),
        violationCount,
        pass: this.readyFrames >= 2 && violationCount === 0,
        samples: Object.freeze(this.samples.map(entry => ({ ...entry })))
      });
    }

    status() {
      return copy(this.get());
    }
  }

  return Object.freeze({
    create: options => new FrameOwnershipMonitor(options),
    constants: Object.freeze({ VERSION, CONTRACT })
  });
});
