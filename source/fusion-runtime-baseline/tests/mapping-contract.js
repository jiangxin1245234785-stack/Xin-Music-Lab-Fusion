'use strict';

const Mapping = require('../mapping-engine.js');
const engine = Mapping.create({ sectionSensitivity: 1.12, sectionHold: 1.15 });
let maxAcid = 0;
let maxOrchestration = 0;
let maxClimaxConfidence = 0;
let maxDropConfidence = 0;
let events = 0;
let falseDrops = 0;
const sections = new Set();

for (let frame = 0; frame < 600; frame++) {
  const chorus = frame > 220 && frame < 520;
  const pulse = frame % 37 === 0;
  const output = engine.update({
    playing: true,
    overall: chorus ? .34 : .12,
    rms: chorus ? .25 : .09,
    bass: .18,
    mid: chorus ? .48 : .16,
    treble: chorus ? .4 : .12,
    flux: pulse ? .3 : .035,
    onset: pulse ? .4 : .03,
    centroid: .58,
    flatness: .22,
    density: chorus ? .65 : .2,
    breadth: chorus ? .8 : .22,
    voices: chorus ? .72 : .18,
    richness: chorus ? .86 : .2,
    orchestrationDensity: chorus ? .86 : .2,
    orchestrationDelta: chorus && frame < 300 ? .72 : chorus ? .16 : 0,
    orchestrationPersistence: chorus ? Math.min(1, (frame - 220) / 90) : 0,
    orchestrationFall: 0,
    effectiveParts: chorus ? 5.2 : 1.4,
    dynamicRange: .35,
    acid: chorus ? .68 : .08,
    resonance: chorus ? .76 : .1,
    sweep: chorus ? .62 : .04,
    sharpness: chorus ? .58 : .12,
    roughness: chorus ? .5 : .1
  }, frame * 16.67);
  maxAcid = Math.max(maxAcid, output.acid);
  maxOrchestration = Math.max(maxOrchestration, output.orchestration);
  maxClimaxConfidence = Math.max(maxClimaxConfidence, output.sectionScores.climax);
  maxDropConfidence = Math.max(maxDropConfidence, output.sectionScores.drop);
  if (frame < 520 && output.section === 'DROP') falseDrops++;
  if (output.event) events++;
  sections.add(output.section);
}

const result = { maxAcid, maxOrchestration, maxClimaxConfidence, maxDropConfidence, falseDrops, events, sections: [...sections] };
console.log(JSON.stringify(result, null, 2));
if (maxAcid < .55
  || maxOrchestration < .6
  || maxClimaxConfidence < .62
  || maxDropConfidence < .55
  || falseDrops > 0
  || events < 1
  || events > 3
  || !sections.has('FULL')
  || !sections.has('CLIMAX')
  || !sections.has('DROP')) process.exitCode = 1;
