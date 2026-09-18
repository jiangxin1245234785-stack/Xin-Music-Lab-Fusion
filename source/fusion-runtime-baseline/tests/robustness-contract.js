'use strict';

const fs = require('fs');
const path = require('path');

const root = path.resolve(__dirname, '..');
const read = filename => fs.readFileSync(path.join(root, filename), 'utf8');
const app = read('app.js');
const html = read('index.html');
const main = read(path.join('desktop', 'main.cjs'));
const pkg = JSON.parse(read('package.json'));
const mappingLab = read('mapping-lab.js');
const sectionFeatures = read('section-features.js');
const sectionEngines = read('section-engines.js');
const glitchEngine = read('glitch-engine.js');
const builderPkg = JSON.parse(read(path.join('desktop-build', 'package.json')));

const assertions = {
  oneTransitionOwner: app.includes("setEffect(next, 'director')")
    && app.includes("if (source === 'user' && directorState.enabled) setDirectorEnabled(false)")
    && !app.includes('glitchAutoState')
    && !app.includes('glitchShuffle')
    && !html.includes('glitchShuffle'),
  captureRaceGuard: app.includes('requestId !== captureToken')
    && app.includes('audioState.stream === stream')
    && app.includes('setCapturePending(true)'),
  hiddenWorkPaused: app.includes('if (document.hidden)')
    && app.includes("if (id === 'waterfall')")
    && app.includes('updateWaterfallHistory(frame.clock.nowMs)')
    && mappingLab.includes('if (panelOpen) this.draw()')
    && mappingLab.includes('const updateUi = panelOpen'),
  adaptiveBudget: app.includes('const qualityBudgets = Object.freeze')
    && app.includes('currentQualityBudget()')
    && app.includes('longFrameRatio')
    && app.includes('pulsarFrameMs')
    && app.includes('pulsarCaptureMs: 170'),
  pulsarLayouts: html.includes('id="pulsarLayoutButton"')
    && app.includes("['folded', 'sweep', 'stereo']")
    && app.includes('createChannelSplitter(2)')
    && app.includes('SmokeResonancePulsar'),
  independentSectionBus: app.includes('createSectionAnalyser(4096)')
    && app.includes('nextSource.connect(audioState.sectionAnalyser)')
    && app.includes('updateRawSectionFrame(now)')
    && sectionFeatures.includes("source: 'raw-section-bus-v1'")
    && !sectionFeatures.includes('calibration'),
  parallelSectionEngines: sectionEngines.includes('class FooteNoveltyEngine')
    && sectionEngines.includes('class RecurrenceFormEngine')
    && sectionEngines.includes('class FusedSectionEngine')
    && app.includes('SmokeResonanceSections')
    && app.includes('harmony: () =>')
    && html.includes('data-section-engine-toggle="foote"')
    && html.includes('data-section-engine-toggle="recurrence"')
    && html.includes('data-section-engine-toggle="fused"'),
  spectralFullnessAndHarmony: sectionFeatures.includes('spectralFullness')
    && sectionFeatures.includes('extractHarmony')
    && sectionFeatures.includes('triBandOccupancy')
    && html.includes('data-section-chord')
    && html.includes('data-fusion-key="fullnessWeight"'),
  structuredGlitch: glitchEngine.includes("state.release = macro ? 'macro'")
    && glitchEngine.includes('releaseThreshold')
    && app.includes('glitchNoiseLines')
    && html.includes('data-glitch-key="burstLayer"'),
  desktopGuardrails: main.includes('requestSingleInstanceLock')
    && main.includes('if (!sources.length)')
    && main.includes("error: 'write-failed'"),
  localContentPolicy: html.includes('Content-Security-Policy')
    && html.includes("connect-src 'self'")
    && html.includes("object-src 'none'"),
  generatedStaging: pkg.scripts?.dist === 'node scripts/build-desktop.cjs'
    && !pkg.build
    && builderPkg.build?.directories?.app === 'app'
};

console.log(JSON.stringify({ version: pkg.version, assertions }, null, 2));
if (Object.values(assertions).some(value => !value)) process.exitCode = 1;
