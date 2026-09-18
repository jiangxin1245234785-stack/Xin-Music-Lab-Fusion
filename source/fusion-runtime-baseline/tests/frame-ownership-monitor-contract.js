'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const api = require('../frame-ownership-monitor.js');

const source = fs.readFileSync(
  path.join(__dirname, '..', 'frame-ownership-monitor.js'),
  'utf8'
);

function status(frameIndex, evaluateCalls, renderRequests, rafRequests = 0) {
  return {
    loadState: 'ready',
    evaluateCalls,
    renderRequests,
    renderReport: { output: { frameIndex } },
    runtime: {
      profile: {
        renderCalls: renderRequests,
        rafRequests
      }
    }
  };
}

const monitor = api.create({ formalPipeline: 'generator' });
monitor.observe(
  { frameIndex: 100, nowMs: 1000 },
  status(100, 50, 49)
);
monitor.observe(
  { frameIndex: 101, nowMs: 1016.67 },
  status(101, 51, 50)
);
monitor.observe(
  { frameIndex: 102, nowMs: 1033.34 },
  status(102, 52, 51)
);
const stable = monitor.get();
assert.equal(stable.contract, 'xin.xml-generator-frame-ownership/1');
assert.equal(stable.formalPipeline, 'generator');
assert.equal(stable.owner, 'legacy.animate');
assert.equal(stable.continuousRafOwners, 1);
assert.equal(stable.subscriber, 'generator-runtime-shadow');
assert.equal(stable.subscriberMode, 'synchronous-engine-clock');
assert.equal(stable.rafRequestsPeak, 0);
assert.equal(stable.violationCount, 0);
assert.equal(stable.pass, true);

const duplicate = api.create();
duplicate.observe({ frameIndex: 1, nowMs: 10 }, status(1, 1, 1));
duplicate.observe({ frameIndex: 1, nowMs: 10 }, status(1, 2, 2));
assert.equal(duplicate.get().pass, false);
assert.equal(duplicate.get().violations.duplicateFrames, 1);

const secondRaf = api.create();
secondRaf.observe({ frameIndex: 1, nowMs: 10 }, status(1, 1, 1, 1));
secondRaf.observe({ frameIndex: 2, nowMs: 20 }, status(2, 2, 2, 1));
assert.equal(secondRaf.get().pass, false);
assert.ok(secondRaf.get().violations.subscriberRafRequests > 0);

for (const forbidden of [
  'requestAnimationFrame',
  'cancelAnimationFrame',
  'performance.now',
  'Date.now',
  'Math.random',
  'setInterval',
  'setTimeout'
]) {
  assert.equal(source.includes(forbidden), false, `forbidden: ${forbidden}`);
}

console.log(JSON.stringify({
  contract: stable.contract,
  owner: stable.owner,
  subscriber: stable.subscriber,
  observedFrames: stable.observedFrames,
  pass: stable.pass
}, null, 2));
