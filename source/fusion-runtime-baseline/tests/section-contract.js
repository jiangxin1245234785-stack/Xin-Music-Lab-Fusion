'use strict';

const Features = require('../section-features.js');
const Sections = require('../section-engines.js');

const extractor = Features.create({ bandCount: 24 });
const fftSize = 4096;
const sampleRate = 48000;
const spectrum = new Float32Array(fftSize / 2).fill(-108);
for (const frequency of [55, 110, 220, 440, 880, 1760, 3520]) {
  const bin = Math.round(frequency / (sampleRate / fftSize));
  for (let offset = -2; offset <= 2; offset++) spectrum[Math.max(1, bin + offset)] = -31 - Math.abs(offset) * 5;
}
const waveform = new Uint8Array(fftSize);
for (let index = 0; index < waveform.length; index++) waveform[index] = 128 + Math.round(Math.sin(index * .12) * 17);
const featureFrame = extractor.update({ spectrum, waveform, sampleRate, fftSize, playing: true }, 100);

const featureKeys = [
  'overall', 'rms', 'bass', 'mid', 'treble', 'flux', 'onset', 'centroid', 'flatness',
  'orchestrationDensity', 'orchestrationDelta', 'orchestrationFall', 'spectralFullness',
  'fullnessDelta', 'fullnessPersistence', 'fullnessFall', 'chordConfidence', 'chordChange',
  'harmonicTension', 'dynamicRange', 'acid'
];
const featureFinite = featureKeys.every(key => Number.isFinite(featureFrame[key]));
const rawBusIndependent = featureFrame.source === 'raw-section-bus-v1'
  && featureFrame.profile.length === 24
  && featureFrame.vector.length >= 32;

const makeSpectrum = kind => {
  const result = new Float32Array(fftSize / 2).fill(kind === 'full' ? -62 : -108);
  const frequencies = kind === 'chord'
    ? [130.81, 164.81, 196, 261.63, 329.63, 392, 523.25, 659.25, 783.99]
    : [55, 110, 220, 440, 880, 1760, 3520];
  frequencies.forEach(frequency => {
    const bin = Math.round(frequency / (sampleRate / fftSize));
    for (let offset = -1; offset <= 1; offset++) result[Math.max(1, bin + offset)] = -30 - Math.abs(offset) * 6;
  });
  return result;
};
const extractStable = kind => {
  const current = Features.create({ bandCount: 24 });
  let frame;
  for (let index = 0; index < 50; index++) {
    frame = current.update({ spectrum: makeSpectrum(kind), waveform, sampleRate, fftSize, playing: true }, index * 100);
  }
  return frame;
};
const sparseFrame = extractStable('sparse');
const fullFrame = extractStable('full');
const chordFrame = extractStable('chord');

const suite = Sections.create({ foote: { sampleMs: 125, halfWindow: 8 }, recurrence: { sampleMs: 375 }, fused: { confirmMs: 1800 } });
let footeEvents = 0;
let formEvents = 0;
let maxFoote = 0;
let maxForm = 0;
const clusterSequence = [];
const labels = [];
let firstLiveClimax = -1;
let firstFusedClimax = -1;
let firstFooteBoundary = -1;
let firstFormBoundary = -1;

const profileA = [.86,.72,.25,.18,.64,.78,.2,.15,.54,.68,.22,.12,.24,.3,.36,.45,.16,.18];
const profileB = [.12,.22,.78,.88,.24,.18,.8,.72,.2,.16,.74,.82,.82,.76,.68,.34,.3,.62];
const legacy = (section, confidence, novelty, rise, fall) => ({
  section,
  sectionConfidence: confidence,
  novelty,
  structureDelta: { ensembleLift: rise, partsLift: rise * .8, ensembleFall: fall, partsFall: fall * .8 },
  sectionScores: { layering: rise, full: section === 'FULL' ? confidence : 0, climax: section === 'CLIMAX' ? confidence : 0, drop: section === 'DROP' ? confidence : 0 }
});
const syntheticFrame = (vector, orchestration, delta, fall, now, fullness = orchestration) => ({
  source: 'raw-section-bus-v1', ready: true, now, vector, profile: vector.slice(0, 12),
  overall: .32, orchestrationDensity: orchestration, orchestrationDelta: delta, orchestrationFall: fall, flux: .08,
  spectralFullness: fullness, fullnessDelta: delta, fullnessPersistence: fullness > .6 ? .9 : .12,
  fullnessFall: fall, chord: fullness > .6 ? 'Cm' : 'C', chordConfidence: .72,
  chordChange: delta || fall ? .68 : .04, harmonicTension: fullness > .6 ? .58 : .18
});

for (let index = 0; index < 132; index++) {
  const phase = index < 44 ? 'A' : index < 88 ? 'B' : 'A2';
  const isB = phase === 'B';
  const vector = (isB ? profileB : profileA).map((value, band) => Math.max(0, Math.min(1, value + Math.sin(index * .31 + band) * .008)));
  const orchestration = isB ? .82 : .28;
  const transitionUp = index >= 44 && index < 51;
  const transitionDown = index >= 88 && index < 95;
  const now = index * 125;
  const output = suite.update(
    syntheticFrame(vector, orchestration, transitionUp ? .74 : 0, transitionDown ? .78 : 0, now, isB ? .84 : .24),
    now,
    legacy(isB ? (index > 55 ? 'CLIMAX' : 'LAYERING') : (transitionDown ? 'DROP' : 'SPARSE'), .76, transitionUp || transitionDown ? .7 : .08, transitionUp ? .7 : 0, transitionDown ? .75 : 0)
  );
  if (output.engines.foote.event) footeEvents++;
  if (output.engines.recurrence.event) formEvents++;
  if (firstFooteBoundary < 0 && output.engines.foote.event) firstFooteBoundary = index;
  if (firstFormBoundary < 0 && output.engines.recurrence.event) firstFormBoundary = index;
  maxFoote = Math.max(maxFoote, output.engines.foote.boundary);
  maxForm = Math.max(maxForm, output.engines.recurrence.boundary);
  if (index % 8 === 0) clusterSequence.push(output.engines.recurrence.cluster);
  labels.push(output.engines.recurrence.label);
  if (firstLiveClimax < 0 && output.engines.our.label === 'CLIMAX') firstLiveClimax = index;
  if (firstFusedClimax < 0 && output.engines.fused.label === 'CLIMAX') firstFusedClimax = index;
}

const final = suite.get();
const steadySuite = Sections.create({ foote: { sampleMs: 125, halfWindow: 8 }, recurrence: { sampleMs: 375 } });
let steadyEvents = 0;
for (let index = 0; index < 96; index++) {
  const now = index * 125;
  const output = steadySuite.update(syntheticFrame(profileA, .3, 0, 0, now), now, legacy('SPARSE', .7, .03, 0, 0));
  if (output.engines.foote.event || output.engines.recurrence.event) steadyEvents++;
}
const assertions = {
  featureFinite,
  rawBusIndependent,
  featureReady: featureFrame.ready,
  fullnessSeparatesBroadbandClimax: fullFrame.spectralFullness > sparseFrame.spectralFullness + .3
    && fullFrame.spectralFloorLift > sparseFrame.spectralFloorLift + .35
    && fullFrame.spectralContinuity > sparseFrame.spectralContinuity + .3,
  chordRecognitionAvailable: chordFrame.chord === 'C' && chordFrame.chordConfidence > .55 && chordFrame.chroma.length === 12,
  footeDetectedTransitions: footeEvents >= 1 && footeEvents <= 3 && maxFoote > .6,
  formDetectedTransitions: formEvents >= 1 && maxForm > .45,
  multipleForms: final.engines.recurrence.clusterCount >= 2,
  recurrenceReturned: labels.slice(-20).includes('A'),
  steadyInputHasNoFalseBoundary: steadyEvents === 0 && steadySuite.get().engines.recurrence.clusterCount === 1,
  fusedIsDelayed: firstLiveClimax >= 0 && firstFusedClimax > firstLiveClimax
    && firstFusedClimax > firstFooteBoundary && firstFusedClimax > firstFormBoundary,
  fusedCarriesEvidence: final.engines.fused?.evidence && Number.isFinite(final.engines.fused.evidence.fullness),
  unifiedProtocol: ['our', 'fused', 'foote', 'recurrence'].every(id => {
    const output = final.engines[id];
    return output && typeof output.label === 'string' && Number.isFinite(output.confidence) && Number.isFinite(output.boundary) && Number.isFinite(output.latencyMs);
  }),
  referencesPresent: Object.keys(Sections.references()).length === 2
};

console.log(JSON.stringify({
  featureFrame: Object.fromEntries(featureKeys.map(key => [key, featureFrame[key]])),
  fullnessComparison: { sparse: sparseFrame.spectralFullness, full: fullFrame.spectralFullness },
  chord: { label: chordFrame.chord, confidence: chordFrame.chordConfidence },
  firstLiveClimax, firstFusedClimax, firstFooteBoundary, firstFormBoundary,
  footeEvents, formEvents, maxFoote, maxForm, clusterSequence, final, assertions
}, null, 2));
if (Object.values(assertions).some(value => !value)) process.exitCode = 1;
