'use strict';

const fs = require('fs');
const path = require('path');
const asarLib = require(path.resolve(__dirname, '..', 'node_modules', '.pnpm', '@electron+asar@3.4.1', 'node_modules', '@electron', 'asar'));

const asar = path.resolve(__dirname, '..', 'dist', 'win-unpacked', 'resources', 'app.asar');
const read = filename => asarLib.extractFile(asar, filename).toString('utf8');
const app = read('app.js');
const html = read('index.html');
const glitchEngine = read('glitch-engine.js');
const packaged = filename => { try { read(filename); return true; } catch (_) { return false; } };
const preload = read('desktop/preload.cjs');
const fusion = read('fusion.js');
const productDock = read('product-control-dock.js');
const main = read('desktop/main.cjs');
const pkg = JSON.parse(read('package.json'));
const iconAsset = asarLib.extractFile(asar, 'assets/xins-music-lab-icon.png');
const generatorManifest = JSON.parse(read(
  path.join('tools', 'glitch-generator', '6.6.1-integration-v.3', 'dist', 'browser-manifest.json')
));
const generatorDemo = read(
  path.join('tools', 'glitch-generator', '6.6.1-integration-v.3', 'demo', 'index.html')
);
const generatorEditorRuntime = asarLib.extractFile(
  asar,
  path.join('tools', 'glitch-generator', '6.6.1-integration-v.3', 'dist', 'ui-debug', 'phase1-demo.js')
);
const assertions = {
  version: pkg.version === '0.5.0-productization',
  noCalibrationPanel: !app.includes('SmokeResonanceResponse') && !app.includes('SmokeResonanceCalibration')
    && !html.includes('id="calibrationPanel"') && !html.includes('data-response-key'),
  colorApi: app.includes('SmokeResonanceColor'),
  sectionEngine: app.includes('orchestrationPersistence'),
  noBuiltInRecognition: !app.includes('SmokeResonanceSections') && !app.includes('createSectionAnalyser')
    && !app.includes('original-glitch') && !html.includes('SECTION ANALYSIS WORKBENCH')
    && !html.includes('data-section-engine-toggle') && !html.includes('data-mapping-key')
    && ['section-features.js', 'section-engines.js', 'mapping-engine.js', 'live-harmony.js', 'mapping-lab.js', 'original-glitch.js']
      .every(name => !packaged(name)),
  universalRack: app.includes('drawUniversalGlitchPostFx'),
  cycleControl: html.includes('data-color-fx-key="cycle"'),
  weightRack: html.includes('data-glitch-key="ensembleWeight"') && html.includes('data-glitch-key="drumWeight"') && html.includes('data-glitch-key="abrasionWeight"') && html.includes('data-glitch-key="rhythmLock"'),
  pulsarVisual: app.includes('drawPulsar') && html.includes('data-effect="pulsar"'),
  strongerFx: html.includes('data-glitch-key="sectionDrive"') && html.includes('data-glitch-key="fxStrength"'),
  noExternalListening: !html.includes('id="mediaPlayPause"') && !html.includes('id="captureButton"')
    && !html.includes('id="fusionModeExternal"') && !app.includes('getDisplayMedia')
    && !fusion.includes('setSourceMode') && !main.includes('setDisplayMediaRequestHandler')
    && !main.includes('app:media-control') && !preload.includes('mediaControl'),
  noDebugDiagnostics: !html.includes('id="sourceInspector"') && !html.includes('id="targetInspector"')
    && !html.includes('id="shadowStabilityGate"') && !html.includes('id="fusionProof"')
    && !fusion.includes('SmokeResonancePhaseIIGate') && !main.includes('fusion:shadow-telemetry')
    && ['resolver-legacy-shadow.js', 'shadow-stability-monitor.js', 'source-inspector.js', 'target-inspector.js']
      .every(name => !packaged(name)),
  curveMonitor: html.includes('id="glitchCurveCanvas"'),
  directorOwnsTransitions: app.includes("setEffect(next, 'director')") && !app.includes('glitchAutoState') && !html.includes('glitchShuffle'),
  adaptivePulsar: app.includes('currentQualityBudget') && app.includes('pulsarCaptureMs'),
  threePulsarLayouts: app.includes('SmokeResonancePulsar') && html.includes('id="pulsarLayoutButton"') && app.includes('createChannelSplitter(2)'),
  structuredGlitch: glitchEngine.includes('class GlitchEngine') && glitchEngine.includes('macroGap') && html.includes('data-glitch-key="burstLayer"'),
  productName: html.includes('Xin’s Music Lab'),
  iconAsset: iconAsset.length > 100000,
  productDock: html.includes('id="productControlDock"') &&
    productDock.includes("const VERSION = '5.5.0-productization'") &&
    fusion.includes('window.SmokeResonanceProductControls'),
  advancedXldEntry: html.includes('data-product-open-xld') &&
    fusion.includes('bridge?.analyzeInXld'),
  advancedGeneratorEntry: html.includes('data-product-open-generator') &&
    main.includes("ipcMain.handle('fusion:open-generator-editor'") &&
    generatorManifest.packageVersion === '6.6.1-integration-v.3' &&
    generatorManifest.files.length === 84 &&
    generatorDemo.includes('data-page-button="advanced"') &&
    generatorEditorRuntime.length > 1000,
  noGeneratorSourceCopy: (() => {
    try {
      asarLib.extractFile(
      asar,
        path.join('tools', 'glitch-generator', '6.6.1-integration-v.3', 'src', 'index.ts')
      );
      return false;
    } catch (_) {
      return true;
    }
  })()
};

console.log(JSON.stringify({ package: pkg.version, assertions }, null, 2));
if (Object.values(assertions).some(value => !value)) process.exitCode = 1;
