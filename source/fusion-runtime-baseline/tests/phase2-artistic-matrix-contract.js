'use strict';

const fs = require('fs');
const assert = require('assert/strict');

const script = fs.readFileSync(
  'tests/phase2-artistic-matrix.cjs',
  'utf8'
);
const corpus = JSON.parse(
  fs.readFileSync('phase2-listening-corpus.json', 'utf8')
);

assert.equal(corpus.contract, 'xin.phase2-listening-corpus/1');
assert.equal(corpus.segments.length, 5);
assert.deepEqual(
  corpus.segments.map(segment => segment.id),
  ['silence', 'sparse', 'build', 'drop', 'dense']
);
assert.equal(
  new Set(corpus.segments.map(segment => segment.timeSeconds)).size,
  5
);
const silenceSegment = corpus.segments.find(segment => segment.id === 'silence');
assert(
  silenceSegment.timeSeconds >= 15 &&
  corpus.track.durationSeconds - silenceSegment.timeSeconds >= 15 &&
  silenceSegment.featureEvidence.interiorGuardSeconds >= 15 &&
  silenceSegment.featureEvidence.rmsDb <= -50,
  'repeatable quiet-floor capture must be interior, near-silent, and clear of media edge seek hazards'
);
assert.equal(
  corpus.track.sourceSha256.length,
  64
);
assert.equal(
  corpus.xld.manifestSha256.length,
  64
);
assert.equal(
  corpus.xld.featureCacheSha256.length,
  64
);
assert(
  script.includes("'spectral-fabric'") &&
  script.includes("'temporal-strata'"),
  'matrix must cover both Phase 2 materials'
);
for (const preset of [
  'balanced',
  'temporal-excavation',
  'raster-deflection',
  'bitplane-drift',
  'quantized-memory'
]) {
  assert(
    script.includes(`'${preset}'`),
    `matrix must cover ${preset}`
  );
}
assert(
  script.includes('artisticAcceptance:') &&
  script.includes("'pending-xin-review'") &&
  script.includes('artisticDecisionIsAutomated: false'),
  'engineering evidence must not auto-approve artistic quality'
);
assert(
  script.includes('audioOutputMuted: true') &&
  script.includes('setAudioMuted(true)'),
  'matrix must analyze real audio without playing 60 repeated excerpts aloud'
);
assert(
  script.includes('materialButton?.click()') &&
  script.includes('window.__phase2MaterialCatalog') &&
  script.includes('window.__phase2Audio') &&
  script.includes("for (const child of [...(stage?.children || [])])") &&
  script.includes("throw new Error('capture isolation failed: '") &&
  !script.includes("style.id = 'phase2-matrix-capture-style'"),
  'matrix must retain product-control references and isolate pure canvases without CSP-unsafe styles'
);
assert(
  script.includes('targetBindingCount === 21') &&
  script.includes('xin.generator-material-fields/1') &&
  script.includes('allMaterialPairsDistinguishable'),
  'matrix must enforce bindings, field consumption, and material separation'
);
assert(
  script.includes("cell.segmentId === 'silence'") &&
  script.includes('cell.metrics.temporalDifference <= 0.08') &&
  script.includes('cell.metrics.temporalDifference >= 0.00035'),
  'silence must settle while non-silent passages must stay alive'
);
assert(
  script.includes('function nonBlankGate(metrics, segmentId)') &&
  script.includes("segmentId === 'silence'") &&
  script.includes('metrics.meanLuminance >= 0.02') &&
  script.includes('metrics.luminanceStd >= 0.001') &&
  script.includes('nonBlankGate(metrics, segment.id)'),
  'near-silence must use a calm-but-present image gate instead of the active-passage contrast floor'
);
assert(
  script.includes('unified?.continuous') &&
  script.includes('realtime?.continuous') &&
  script.includes('SmokeResonanceMaterialView?.parameters()') &&
  script.includes('activeMaterial?.input') &&
  script.includes('PHASE2_MATRIX_SEGMENTS') &&
  script.includes('PHASE2_MATRIX_MATERIALS') &&
  script.includes('PHASE2_MATRIX_PRESETS'),
  'matrix must preserve continuous audio evidence and allow targeted diagnostics'
);
assert(
  script.includes('ACTIVE_SEGMENTS') &&
  script.includes('ACTIVE_MATERIALS') &&
  script.includes('ACTIVE_PRESETS') &&
  script.includes('phase2-artistic-matrix-live.json'),
  'targeted diagnostics must have truthful counts and incremental evidence'
);
assert(
  script.includes("SmokeResonanceMaterialView?.reset(") &&
  script.includes("'phase2-cell'") &&
  script.includes('loadCaptureSession(win)') &&
  script.includes("state: 'loading-capture-session'") &&
  script.includes("state: 'warming-capture-runtime'") &&
  script.includes("state: 'capturing-baseline'") &&
  script.includes("state: 'capturing-cell'") &&
  script.includes('win = createCaptureWindow()') &&
  script.includes("state: 'finalizing'"),
  'the matrix must use one stable runtime and reset material state for every cell'
);
assert(
  script.includes('PHASE2_MATRIX_AUDIO_PRIME_MS') &&
  script.includes('await seekAndPlay(win, segment.timeSeconds);') &&
  script.includes('await sleep(audioPrimeMs);') &&
  script.indexOf('await seekAndPlay(win, segment.timeSeconds);') <
    script.indexOf("await configureCell(win, material.id, 'balanced', false);"),
  'real audio must be primed before a material is reset for capture'
);
assert(
  script.includes('app.exit(Number(process.exitCode) || 0)'),
  'matrix must terminate its Electron process after writing evidence'
);
assert(
  script.includes('async function withTimeout') &&
  script.includes('capture ${path.basename(imagePath)}') &&
  script.includes("'renderer status'") &&
  script.includes('· temporal probe'),
  'matrix must identify and bound renderer-side stalls'
);
assert(
  script.includes('async function waitForCaptureReady') &&
  script.includes('last.materialFrameIndex >= 3') &&
  script.includes('materialStatus?.runtime?.activeMaterialId') &&
  script.includes('runtime?.runtime?.preset?.id') &&
  script.includes("output?.activePipeline === 'generator'") &&
  script.includes('JSON.stringify(last)') &&
  script.includes("waitForCaptureReady(win, material.id, 'balanced', false)") &&
  script.includes('waitForCaptureReady(win, material.id, preset.id, true)') &&
  script.includes('const primeSegment = ACTIVE_SEGMENTS[0]') &&
  script.includes('await configureCell(win, primeMaterial.id, primePreset.id, true)') &&
  script.includes('capture remained empty') &&
  script.includes('if (spectral && temporal)'),
  'capture must distinguish material-only and Generator readiness, reject empty images, and keep targeted comparisons truthful'
);

console.log(JSON.stringify({
  contract: 'xin.phase2-artistic-matrix-contract/1',
  materials: 2,
  presets: 5,
  segments: corpus.segments.length,
  expectedCells: 2 * 5 * corpus.segments.length,
  artisticDecisionIsAutomated: false
}, null, 2));
