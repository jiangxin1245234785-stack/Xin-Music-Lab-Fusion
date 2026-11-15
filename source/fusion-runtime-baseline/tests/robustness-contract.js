'use strict';

const fs = require('fs');
const path = require('path');

const root = path.resolve(__dirname, '..');
const read = filename => fs.readFileSync(path.join(root, filename), 'utf8');
const app = read('app.js');
const html = read('index.html');
const main = read(path.join('desktop', 'main.cjs'));
const preload = read(path.join('desktop', 'preload.cjs'));
const pkg = JSON.parse(read('package.json'));
const exists = filename => fs.existsSync(path.join(root, filename));
const glitchEngine = read('glitch-engine.js');
const builderPkg = JSON.parse(read(path.join('desktop-build', 'package.json')));

const assertions = {
  oneTransitionOwner: app.includes("setEffect(next, 'director')")
    && app.includes("if (source === 'user' && directorState.enabled) setDirectorEnabled(false)")
    && !app.includes('glitchAutoState')
    && !app.includes('glitchShuffle')
    && !html.includes('glitchShuffle'),
  // The app plays its own library only: nothing captures system audio or drives other players.
  noSystemAudioCapture: !app.includes('getDisplayMedia')
    && !app.includes('startCapture')
    && !app.includes('captureToken')
    && !app.includes('startExternal')
    && !app.includes('mediaControl')
    && !main.includes('setDisplayMediaRequestHandler')
    && !main.includes('desktopCapturer')
    && !main.includes('app:media-control')
    && !preload.includes('mediaControl')
    && !html.includes('id="captureButton"')
    && !html.includes('id="enterButton"'),
  hiddenWorkPaused: app.includes('if (document.hidden)'),
  adaptiveBudget: app.includes('const qualityBudgets = Object.freeze')
    && app.includes('currentQualityBudget()')
    && app.includes('longFrameRatio')
    && app.includes('pulsarFrameMs')
    && app.includes('pulsarCaptureMs: 170'),
  pulsarLayouts: html.includes('id="pulsarLayoutButton"')
    && app.includes("['folded', 'sweep', 'stereo']")
    && app.includes('createChannelSplitter(2)')
    && app.includes('SmokeResonancePulsar'),
  // XLD supplies sections and chords; the app keeps no recogniser of its own.
  noBuiltInRecognition: !app.includes('createSectionAnalyser')
    && !app.includes('createChromaAnalyser')
    && !app.includes('updateRawSectionFrame')
    && !app.includes('updateLiveHarmony')
    && !app.includes('SmokeResonanceSections')
    && !app.includes('SmokeResonanceMapping ')
    && !app.includes('mappingOutput')
    && !app.includes('original-glitch')
    && !html.includes('mappingLabPanel')
    && !html.includes('data-section-engine-toggle')
    && ['section-features.js', 'section-engines.js', 'mapping-engine.js', 'live-harmony.js', 'mapping-lab.js', 'original-glitch.js']
      .every(name => !exists(name) && !html.includes(name)),
  glitchSignalsFromTimeline: app.includes('const climaxState = fusionTimelineState.connected ? fusionTimelineState.climax : 0;')
    && app.includes("chord: fusionTimelineState.connected ? fusionTimelineState.chord : '—',")
    && app.includes('const threshold = .12;'),
  structuredGlitch: glitchEngine.includes("state.release = macro ? 'macro'")
    && glitchEngine.includes('releaseThreshold')
    && app.includes('glitchNoiseLines')
    && html.includes('data-glitch-key="burstLayer"'),
  desktopGuardrails: main.includes('requestSingleInstanceLock')
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
