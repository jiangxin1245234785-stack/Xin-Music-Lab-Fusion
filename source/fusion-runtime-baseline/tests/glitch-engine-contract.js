'use strict';

const GlitchEngine = require('../glitch-engine.js');
const config = {
  fxStrength: 1.4,
  baseLayer: 1,
  noiseLayer: 1,
  burstLayer: 1.35,
  tensionBuild: 1.25,
  eventSpacing: 1
};

function simulate(stepMs) {
  const engine = GlitchEngine.create();
  const releases = [];
  let output = engine.get();
  for (let now = stepMs; now <= 9000; now += stepMs) {
    const beat = Math.round(now / stepMs) % Math.max(1, Math.round(480 / stepMs)) === 0;
    const active = now > 1200;
    output = engine.update({
      playing: active,
      loudness: active ? .48 : 0,
      fast: beat ? .85 : .12,
      ensemble: active ? .78 : 0,
      section: active ? .82 : 0,
      acid: active ? .7 : 0,
      richness: active ? .84 : 0,
      flatness: active ? .38 : 0,
      treble: active ? .55 : 0,
      flux: beat ? .72 : .08,
      pulse: beat ? .9 : .04,
      climax: now > 5200 ? .84 : .45,
      drop: now > 7600 && now < 7900 ? .88 : 0
    }, now, config);
    if (output.release) releases.push({ now, type: output.release, strength: output.releaseStrength });
  }
  return { output, releases };
}

const at60 = simulate(1000 / 60);
const macro60 = at60.releases.filter(event => event.type === 'macro');
const macroGaps = macro60.slice(1).map((event, index) => event.now - macro60[index].now);
const idle = GlitchEngine.create();
let idleRelease = false;
for (let now = 16; now < 3000; now += 16) {
  if (idle.update({ playing: false }, now, config).release) idleRelease = true;
}
function tensionAfter(stepMs) {
  const engine = GlitchEngine.create();
  let output;
  for (let now = stepMs; now <= 2400; now += stepMs) {
    output = engine.update({
      playing: true,
      loudness: .25,
      fast: .08,
      ensemble: .38,
      section: .28,
      acid: .3,
      richness: .42,
      flatness: .18,
      treble: .22,
      flux: .05,
      pulse: 0,
      climax: 0,
      drop: 0
    }, now, { ...config, tensionBuild: .65, burstLayer: 0 });
  }
  return output.tension;
}
const tension60 = tensionAfter(1000 / 60);
const tension30 = tensionAfter(1000 / 30);

const assertions = {
  noIdleRelease: !idleRelease,
  producesBaseLayer: at60.output.base > .35,
  producesNoiseLayer: at60.output.noise > .25,
  producesMacroRelease: macro60.length >= 1,
  sparseMacroRelease: macroGaps.every(gap => gap >= 560),
  boundedReleaseCount: at60.releases.length < 30,
  frameRateStable: Math.abs(tension60 - tension30) < .025,
  finiteOutput: Object.values(at60.output).every(value => typeof value !== 'number' || Number.isFinite(value))
};

console.log(JSON.stringify({ releases: at60.releases, final: at60.output, frameRate: { tension60, tension30 }, assertions }, null, 2));
if (Object.values(assertions).some(value => !value)) process.exitCode = 1;
