const { createHash } = require('node:crypto');
const { mkdirSync, readFileSync, writeFileSync } = require('node:fs');
const path = require('node:path');
const { app, BrowserWindow } = require('electron');

const root = path.resolve(__dirname, '..');
const artifactDirectory = path.join(root, 'artifacts', 'i18n-step6');
const thresholds = Object.freeze({
  maeMax: 1,
  grayDeltaOver8RatioMax: 0.001,
  histogramL1Max: 0.002,
  perceptualHashDistanceMax: 1
});
const consoleErrors = [];
let rendererGone = null;

function sha256(bytes) {
  return createHash('sha256').update(bytes).digest('hex');
}

function pngBuffer(dataUrl) {
  const prefix = 'data:image/png;base64,';
  if (!dataUrl.startsWith(prefix)) throw new Error('Invalid PNG data URL.');
  return Buffer.from(dataUrl.slice(prefix.length), 'base64');
}

function fail(message, details) {
  const suffix = details === undefined
    ? ''
    : `\n${JSON.stringify(details, null, 2)}`;
  throw new Error(`${message}${suffix}`);
}

async function run() {
  const window = new BrowserWindow({
    show: false,
    width: 640,
    height: 420,
    webPreferences: {
      backgroundThrottling: false,
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      partition: `step6-webgl-tolerance-${process.pid}`
    }
  });
  window.webContents.on('console-message', details => {
    if (details.level === 'error') {
      consoleErrors.push({
        message: details.message,
        line: details.lineNumber,
        sourceId: details.sourceId
      });
    }
  });
  window.webContents.on('render-process-gone', (_event, details) => {
    rendererGone = details;
  });

  try {
    await window.loadFile(path.join(
      root,
      'tests',
      'fixtures',
      'i18n-step6-webgl-tolerance.html'
    ));
    const result = await window.webContents.executeJavaScript(`
      (async () => {
        const deadline = Date.now() + 15000;
        while (!globalThis.step6WebglTolerance) {
          if (Date.now() > deadline) {
            throw new Error('Timed out waiting for Step 6 WebGL fixture.');
          }
          await new Promise(resolve => setTimeout(resolve, 20));
        }
        return globalThis.step6WebglTolerance;
      })()
    `, true);

    if (!result?.ok) fail('Step 6 WebGL fixture returned no result.', result);
    const beforePixels = Buffer.from(result.beforePixels);
    const afterPixels = Buffer.from(result.afterPixels);
    const beforePng = pngBuffer(result.beforePng);
    const afterPng = pngBuffer(result.afterPng);
    const packageJson = JSON.parse(readFileSync(
      path.join(root, 'package.json'),
      'utf8'
    ));
    const manifest = {
      format: 'xin.glitch-generator.i18n-step6-webgl/1',
      package: {
        name: packageJson.name,
        version: packageJson.version
      },
      fixture: 'tests/fixtures/i18n-step6-webgl-tolerance.html',
      canvas: result.canvas,
      gpu: result.gpu,
      render: result.render,
      locale: result.locale,
      evidence: result.evidence,
      thresholds,
      metrics: result.metrics,
      hashes: {
        beforeFramebufferSha256: sha256(beforePixels),
        afterFramebufferSha256: sha256(afterPixels),
        beforePngSha256: sha256(beforePng),
        afterPngSha256: sha256(afterPng)
      }
    };

    mkdirSync(artifactDirectory, { recursive: true });
    writeFileSync(
      path.join(artifactDirectory, 'webgl-reference.png'),
      beforePng
    );
    writeFileSync(
      path.join(artifactDirectory, 'webgl-manifest.json'),
      `${JSON.stringify(manifest, null, 2)}\n`,
      'utf8'
    );

    if (
      result.locale.before !== 'zh-CN' ||
      result.locale.after !== 'en-US' ||
      result.locale.displayTextBefore === result.locale.displayTextAfter
    ) {
      fail('The fixture did not switch presentation locale.', manifest);
    }
    if (
      !result.evidence.sameCanvas ||
      !result.evidence.sameContext ||
      result.evidence.contextLost ||
      result.render.renderCallsBeforeLocale !== result.render.renderCallsAfterLocale ||
      result.render.frameIndex !== result.render.frameIndexBeforeLocale
    ) {
      fail('Locale switching changed the WebGL surface or render clock.', manifest);
    }
    if (
      result.metrics.mae > thresholds.maeMax ||
      result.metrics.grayDeltaOver8Ratio > thresholds.grayDeltaOver8RatioMax ||
      result.metrics.histogramL1 > thresholds.histogramL1Max ||
      result.metrics.perceptualHashDistance > thresholds.perceptualHashDistanceMax
    ) {
      fail('Locale-only framebuffer comparison exceeded tolerance.', manifest);
    }
    if (rendererGone) fail('Electron renderer process exited.', rendererGone);
    if (consoleErrors.length > 0) {
      fail('Console errors occurred in the Step 6 WebGL fixture.', consoleErrors);
    }

    console.log(`[Electron Step 6 WebGL tolerance] ${JSON.stringify({
      ok: true,
      canvas: result.canvas,
      gpu: result.gpu,
      frameIndex: result.render.frameIndex,
      seed: result.render.presetSeed,
      metrics: result.metrics,
      thresholds,
      referencePng: 'artifacts/i18n-step6/webgl-reference.png',
      manifest: 'artifacts/i18n-step6/webgl-manifest.json'
    })}`);
  } finally {
    window.destroy();
  }
}

app.whenReady()
  .then(run)
  .then(() => app.quit())
  .catch(error => {
    console.error(error);
    app.exit(1);
  });
