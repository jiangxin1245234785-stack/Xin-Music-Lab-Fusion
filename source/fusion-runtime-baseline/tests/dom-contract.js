'use strict';

const fs = require('fs');
const path = require('path');

const root = path.resolve(__dirname, '..');
const html = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
const app = fs.readFileSync(path.join(root, 'app.js'), 'utf8');
const htmlIds = [...html.matchAll(/\bid="([^"]+)"/g)].map(match => match[1]);
const duplicateIds = [...new Set(htmlIds.filter((id, index) => htmlIds.indexOf(id) !== index))];
const referencedIds = [...app.matchAll(/\$\('#([^']+)'\)/g)].map(match => match[1]);
const uniqueIds = [...new Set(referencedIds)];
const missing = uniqueIds.filter(id => !html.includes(`id="${id}"`));
const requiredControls = [
  'data-response-key="lowGain"',
  'data-response-key="midGain"',
  'data-response-key="highGain"',
  'data-color-fx-key="cycle"',
  'data-color-fx-key="breath"',
  'data-color-fx-key="strobe"',
  'data-glitch-key="ensembleWeight"',
  'data-glitch-key="drumWeight"',
  'data-glitch-key="abrasionWeight"',
  'data-glitch-key="sectionDrive"',
  'data-glitch-key="fxStrength"',
  'data-glitch-key="rhythmLock"',
  'data-glitch-key="drumLow"',
  'data-glitch-key="abrasionDissonance"',
  'data-glitch-key="baseLayer"',
  'data-glitch-key="noiseLayer"',
  'data-glitch-key="burstLayer"',
  'id="glitchPowerButton"',
  'id="glitchPanel" aria-label="Glitch 映射设置" aria-hidden="true"',
  'id="glitchCurveCanvas"',
  'id="sourceInspector"',
  'id="targetInspector"',
  'id="shadowStabilityGate"',
  'id="generatorCanvas"',
  'id="generatorPresetControl"',
  'data-product-preset-state',
  'data-product-preset-list',
  'data-product-preset-detail',
  'FX RACK WEIGHT PRESETS · 信号权重',
  'id="generatorPresetFiles"',
  'data-product-preset-export',
  'data-product-preset-import',
  'data-product-preset-file-input',
  'data-product-preset-file-state',
  'id="generatorPresetRepository"',
  'data-preset-repository-path',
  'data-preset-repository-counts',
  'data-preset-repository-save',
  'data-preset-repository-refresh',
  'data-preset-repository-status',
  'data-preset-repository-category="builtIn"',
  'data-preset-repository-category="user"',
  'data-preset-repository-category="recovered"',
  'id="productControlDock"',
  'data-product-fx-master',
  'data-product-fx-master-output',
  'data-product-quality',
  'data-product-source',
  'data-product-source-label',
  'data-product-source-meta',
  'data-product-open-xld',
  'data-product-open-generator',
  'data-product-tool-state',
  'data-inspector-state',
  'data-inspector-transport',
  'data-inspector-warning',
  'data-inspector-rows',
  'data-target-inspector-clock',
  'data-target-inspector-state',
  'data-target-inspector-safety',
  'data-target-inspector-energy',
  'data-target-inspector-rows',
  'data-target-inspector-timeline',
  'data-shadow-gate-duration',
  'data-shadow-gate-state',
  'data-shadow-gate-targets',
  'data-shadow-gate-voices',
  'data-shadow-gate-system',
  'data-shadow-gate-reasons',
  'id="glitchPresetSave"',
  'data-glitch-preset="weg"',
  'data-mapping-key="sectionSensitivity"',
  'data-mapping-key="sectionHold"',
  'data-mapping-key="climaxSensitivity"',
  'data-mapping-key="dropSensitivity"',
  'data-section-engine-toggle="foote"',
  'data-section-engine-toggle="recurrence"',
  'data-section-engine-toggle="fused"',
  'data-section-chord',
  'data-mapping-meter="spectralFullness"',
  'data-fusion-key="fullnessWeight"',
  'data-fusion-key="harmonyWeight"',
  'data-fusion-key="confirmMs"',
  'class="section-input-note"',
  'data-effect="pulsar"',
  'id="pulsarLayoutButton"',
  'id="pulsarStyleButton"',
  'id="mediaPlayPause"'
];
const missingControls = requiredControls.filter(token => !html.includes(token));
const forbiddenControls = ['id="glitchShuffle"', '节奏自动换场'];
const presentForbiddenControls = forbiddenControls.filter(token => html.includes(token));
const missingFxEntryWiring = [
  "glitchPowerButton.addEventListener('click', () => setGlitchRackEnabled(!glitchConfig.enabled))",
  "glitchPowerButton.textContent = glitchConfig.enabled ? 'FX ON' : 'FX OFF'",
  "ensurePanelInViewport(glitchPanel)",
  "setPanelPosition(panel, saved.left, saved.top)",
  "glitchSettingsButton.addEventListener('click', () => setGlitchPanel(!glitchPanel.classList.contains('is-open'))"
].filter(token => !app.includes(token));
const coupledFxEntryState = app.includes(
  "glitchSettingsButton.classList.toggle('is-active', glitchConfig.enabled)"
);
const localResources = [...html.matchAll(/\b(?:src|href)="([^"]+)"/g)]
  .map(match => match[1].split(/[?#]/)[0])
  .filter(resource => resource && !/^(?:[a-z]+:|#)/i.test(resource));
const missingResources = localResources.filter(resource => !fs.existsSync(path.join(root, resource)));

console.log(JSON.stringify({
  referencedIds: uniqueIds.length,
  missing,
  missingControls,
  duplicateIds,
  missingResources,
  presentForbiddenControls,
  missingFxEntryWiring,
  coupledFxEntryState
}, null, 2));
if (
  missing.length ||
  missingControls.length ||
  duplicateIds.length ||
  missingResources.length ||
  presentForbiddenControls.length ||
  missingFxEntryWiring.length ||
  coupledFxEntryState
) process.exitCode = 1;
