const path = require('node:path');
const { app, BrowserWindow } = require('electron');

async function run() {
  const window = new BrowserWindow({
    show: false,
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true
    }
  });
  try {
    await window.loadFile(path.join(
      __dirname,
      'fixtures',
      'integration',
      'browser-file-import-smoke.html'
    ));
    const result = await window.webContents.executeJavaScript(`
      new Promise((resolve, reject) => {
        const deadline = Date.now() + 10000;
        const poll = () => {
          if (globalThis.__glitchBrowserSmoke) {
            resolve(globalThis.__glitchBrowserSmoke);
          } else if (Date.now() >= deadline) {
            reject(new Error('Timed out waiting for browser ESM import.'));
          } else {
            setTimeout(poll, 20);
          }
        };
        poll();
      })
    `);
    if (!result?.ok) {
      throw new Error(result?.error ?? 'Unknown browser import failure.');
    }
    if (
      result.entryId !==
      '@xins-music-lab/glitch-mapping-generator/browser' ||
      result.contract !== 'xin.music-frame/1' ||
      result.frameIndex !== 3 ||
      result.sourceRendered !== true ||
      result.sourceContract !== 'xin.generator-source-render/1' ||
      result.sourceKind !== 'canvas' ||
      result.sourceWidth !== 64 ||
      result.sourceHeight !== 64 ||
      result.renderCalls !== 2 ||
      result.gpuContextsCreated !== 2 ||
      result.rafRequests !== 0 ||
      result.qualityMode !== 'high' ||
      result.qualityProfile !== 'high' ||
      result.contextTestSupported !== true ||
      result.contextLossSkipped !== true ||
      result.contextRestored !== true ||
      result.targetBindingContract !==
        'xin.generator-target-uniform-bindings/1' ||
      result.targetBindingCount !== 21 ||
      result.targetBindingsFinite !== true ||
      result.pixel?.[0] <= result.pixel?.[1]
    ) {
      throw new Error(`Unexpected browser API result: ${JSON.stringify(result)}`);
    }
    console.log(`[Electron file:// smoke] ${JSON.stringify(result)}`);
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
