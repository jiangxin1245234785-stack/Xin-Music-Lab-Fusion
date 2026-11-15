'use strict';
// 2026-11-13 prune: the basic scenes are LED spectrum, neon ribbons and pulsar; the listening
// score and the 11 scenes under "more scenes" stay (15 until 2026-11-15, when beta-glitch-5..8 went). Deleted scenes must not come back by name.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const read = file => fs.readFileSync(path.join(root, file), 'utf8');
const app = read('app.js');
const html = read('index.html');
const catalogs = read('i18n/catalogs.js');

const deletedScenes = ['mirror', 'waveform', 'radial', 'waterfall', 'vu', 'tunnel', 'pulse-grid', 'bloom'];
const keptBasic = ['spectrum', 'ribbons', 'pulsar'];
const more = [
  ...Array.from({ length: 7 }, (_, i) => `beta-${i + 1}`),
  ...Array.from({ length: 4 }, (_, i) => `beta-glitch-${i + 1}`)
];

// The scene strip: score, the three basic scenes, then the "more scenes" drawer with 11.
const effects = [...html.matchAll(/data-effect="([^"]+)"/g)].map(match => match[1]);
for (const id of ['score', ...keptBasic, ...more]) {
  assert.ok(effects.includes(id), `scene button kept: ${id}`);
}
const strip = html.slice(html.indexOf('<section class="visual-catalog"'), html.indexOf('<details class="catalog-archive">'));
const stripOrder = [...strip.matchAll(/data-effect="([^"]+)"/g)].map(match => match[1]);
assert.deepEqual(stripOrder, ['score', ...keptBasic]);
assert.equal((strip.match(/class="catalog-label"/g) || []).length, 0, 'the one-row strip has no group labels');
assert.equal((strip.match(/class="catalog-rule"/g) || []).length, 1, 'one rule, before "more scenes"');
assert.equal(/data-i18n="catalog\.(classic|modern)"/.test(html), false, 'classic / modern labels are gone');

const effectNamesBlock = app.slice(app.indexOf('const effectNames = {'), app.indexOf('};', app.indexOf('const effectNames = {')));
const renderersBlock = app.slice(
  app.indexOf('const legacyMaterialRenderers = Object.freeze({'),
  app.indexOf('});', app.indexOf('const legacyMaterialRenderers = Object.freeze({'))
);
const directorBlock = app.slice(app.indexOf('const directorScenes = ['), app.indexOf('];', app.indexOf('const directorScenes = [')));
for (const id of deletedScenes) {
  assert.equal(effects.includes(id), false, `scene button removed: ${id}`);
  const key = new RegExp(`(^|[\\s{,])['"]?${id.replace('-', '\\-')}['"]?\\s*:`, 'm');
  assert.equal(key.test(effectNamesBlock), false, `effectNames entry removed: ${id}`);
  assert.equal(key.test(renderersBlock), false, `renderer removed: ${id}`);
  assert.equal(directorBlock.includes(`'${id}'`), false, `director candidate removed: ${id}`);
}
for (const fn of ['drawMirrorSpectrum', 'drawWaveform', 'drawRadialSpectrum', 'drawWaterfall', 'updateWaterfallHistory',
  'drawVu', 'drawVuMeter', 'drawTunnel', 'drawPulseGrid', 'drawBloom', 'ensureModernParticles', 'traceClosedSmoothPath', 'drawGrid']) {
  assert.equal(app.includes(`function ${fn}(`), false, `function removed: ${fn}`);
}
for (const id of keptBasic) {
  assert.match(renderersBlock, new RegExp(`\\b${id}: frame =>`), `renderer kept: ${id}`);
}
for (const key of ['classic', 'modern', 'mirror', 'waveform', 'radial', 'waterfall', 'vu', 'tunnel', 'pulseGrid', 'bloom']) {
  assert.equal(catalogs.includes(`'catalog.${key}'`), false, `catalog key removed: catalog.${key}`);
}

// The automatic director only ever chose among the "more scenes"; it still does (now 11).
const directorIds = [...directorBlock.matchAll(/id: '([^']+)'/g)].map(match => match[1]);
assert.deepEqual(directorIds, more);

// A MilkDrop renderer that keeps failing falls back to LED spectrum (it used to be the prism bloom).
const butterchurn = app.slice(app.indexOf('function renderButterchurnMaterial()'), app.indexOf('const legacyMaterialRenderers'));
assert.match(butterchurn, /setActiveEffectState\('spectrum', 'renderer-fallback'\)/);

// Saved state: the last scene is not stored anywhere, so a deleted name cannot come back at start-up.
// The app starts on LED spectrum; no localStorage key is written from the active effect.
assert.match(app, /let activeEffect = 'spectrum';/);
const rendererSources = ['app.js', 'fusion.js', 'shell.js', 'score-scene.js', 'stem-controls.js', 'product-control-dock.js',
  'score-notes-controls.js', 'score-dynamics-controls.js'].map(read).join('\n');
for (const call of rendererSources.matchAll(/localStorage\.setItem\(([^;]+)\)/g)) {
  assert.equal(/activeEffect|dataset\.effect|effectName/.test(call[1]), false, `no scene persisted: ${call[0]}`);
}
assert.equal(/localStorage\.getItem\(['"][^'"]*(effect|scene)[^'"]*['"]\)/i.test(rendererSources), false, 'no scene restored from storage');

// P2: the two material scenes and what existed only for them are gone; the runtime stays.
for (const file of ['experimental-materials.js', 'material-mapping-profile.js', 'phase2-listening-corpus.json',
  'tests/experimental-materials-contract.js', 'tests/material-mapping-profile-contract.js',
  'tests/phase2-material-integration-contract.js', 'tests/phase2-artistic-matrix.cjs', 'tests/phase2-artistic-matrix-contract.js']) {
  assert.equal(fs.existsSync(path.join(root, file)), false, `removed: ${file}`);
}
for (const file of ['visual-material-runtime.js', 'material-target-registry.js']) {
  assert.ok(fs.existsSync(path.join(root, file)), `material runtime kept: ${file}`);
  assert.ok(html.includes(`<script src="./${file}"></script>`), `material runtime loaded: ${file}`);
}
const fusion = read('fusion.js');
for (const gone of ['spectral-fabric', 'temporal-strata', 'SmokeResonanceExperimentalMaterials', 'experimentalMaterialApi',
  'SmokeResonanceMaterialMappingProfile', 'experimental-materials.js', 'material-mapping-profile.js']) {
  assert.equal(app.includes(gone) || html.includes(gone) || fusion.includes(gone), false, `gone: ${gone}`);
}
for (const key of ['listen', 'material', 'spectralFabric', 'temporalStrata']) {
  assert.equal(catalogs.includes(`'catalog.${key}'`), false, `catalog key removed: catalog.${key}`);
}
for (const kept of ['ensureMaterialRuntime', 'renderLegacyMaterialFrame', 'materialFrameOrchestrator', 'materialApi.createLegacyAdapter']) {
  assert.ok(app.includes(kept), `material runtime path kept: ${kept}`);
}

// P3: the spectrum calibration panel is gone and the mapping is fixed at its old default
// (calibrationPresets['open-flat'] with the flat response, no auto gain).
assert.match(app, /const spectrumMapping = Object\.freeze\(\{ minFreq: 20, maxFreq: 20000, minDb: -92, maxDb: -18, tilt: 2, smoothing: \.68 \}\);/);
const appWithoutSharedClasses = app.replace(/\.?calibration-(head|field|close|toggle|presets|grid|foot)\b/g, '');
for (const gone of ['calibration', 'Calibration', 'frequencyResponse', 'responsePresets', 'autoGain', 'responseGainDb',
  'standardWeightingDb', 'itu468', "'bark'", "'mel'", "'linear'"]) {
  assert.equal(appWithoutSharedClasses.includes(gone), false, `app.js no longer has: ${gone}`);
}
for (const gone of ['id="calibrationPanel"', 'id="calibrationButton"', 'data-calibration-', 'data-response-', 'id="frequencyScale"',
  'id="autoGain"', 'SPECTRUM CALIBRATION']) {
  assert.equal(html.includes(gone), false, `index.html no longer has: ${gone}`);
}
assert.equal(/'(calibration|response)\.[A-Za-z0-9.]+'|'engine\.calibration'/.test(catalogs), false, 'calibration / response keys removed');
assert.equal(read('i18n/dynamic-ui.js').includes('calibrationPanel'), false);
for (const css of ['style.css', 'shell.css', 'xml-studio.css']) {
  assert.equal(read(css).includes('.calibration-panel'), false, `${css}: panel styles removed`);
}
// Log axis only; one mapping for LED spectrum, pulsar and the audio features.
const frequencyAt = app.slice(app.indexOf('function frequencyAt('), app.indexOf('function frequencyPosition('));
assert.match(frequencyAt, /spectrumMapping\.minFreq \* Math\.pow\(spectrumMapping\.maxFreq \/ spectrumMapping\.minFreq, t\)/);
assert.equal((app.match(/const center = Math\.sqrt\(from \* to\);/g) || []).length, 2, 'LED and stereo pulsar bands use the log centre');

// Saved state: an old calibration in the profile is never read; its keys are left untouched.
for (const key of ['xins-fusion-calibration', 'xins-fusion-frequency-response']) {
  assert.equal(rendererSources.includes(key), false, `old saved key no longer read or written: ${key}`);
}

// 2026-11-15: Datamosh / RGB Split / Codec Rain / Signal Loss (beta-glitch-5..8) reused the first four
// Glitch presets under other names; they are gone, and so is the Glitch renderer nothing ever called.
for (const n of [5, 6, 7, 8]) {
  assert.equal(effects.includes(`beta-glitch-${n}`), false, `scene removed: beta-glitch-${n}`);
  assert.equal(app.includes(`'beta-glitch-${n}'`), false, `app.js no longer names beta-glitch-${n}`);
}
assert.equal(effects.filter(id => id.startsWith('beta-')).length, 11, 'more scenes: 7 MilkDrop + 4 Glitch');
assert.match(catalogs, /'catalog\.archive': 'More scenes · 11'/);
assert.match(catalogs, /'catalog\.archive': '更多画面 · 11'/);
for (const gone of ['drawGlitchPostFx', 'glitchProfiles', 'spawnGlitchFragments', 'glitchFrequencyDensity',
  'catalog.datamoshTitle', 'catalog.rgbSplitTitle', 'catalog.codecRainTitle', 'catalog.signalLossTitle']) {
  assert.equal(app.includes(gone) || html.includes(gone) || catalogs.includes(gone), false, `gone: ${gone}`);
}
assert.match(app, /function drawUniversalGlitchPostFx\(/, 'the FX Rack renderer stays');

console.log('scene prune contract ok');
