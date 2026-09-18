'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { app, BrowserWindow, ipcMain } = require('electron');

const appRoot = path.resolve(process.env.XML_APP_ROOT || path.join(__dirname, '..'));
const screenshots = {
  'zh-CN': process.env.XML_I18N_SCREENSHOT_ZH || '',
  'en-US': process.env.XML_I18N_SCREENSHOT_EN || ''
};
let nativeLocale = 'zh-CN';

app.commandLine.appendSwitch('disable-background-timer-throttling');
app.commandLine.appendSwitch('disable-gpu');
app.disableHardwareAcceleration();
app.setPath('userData', path.join(os.tmpdir(), `xml-i18n-step6-layout-${process.pid}`));

ipcMain.handle('app:locale-get', () => ({ ok: true, locale: nativeLocale, source: 'renderer' }));
ipcMain.handle('app:locale-set', (_event, payload) => {
  if (!['zh-CN', 'en-US'].includes(payload?.locale)) return { ok: false, error: 'invalid-locale' };
  nativeLocale = payload.locale;
  return { ok: true, locale: nativeLocale, source: 'renderer' };
});
ipcMain.handle('fusion:shadow-telemetry', () => JSON.stringify({ available: false }));
ipcMain.handle('fusion:analysis-task', () => null);
ipcMain.handle('fusion:analysis-engines', () => []);
ipcMain.handle('fusion:settings', () => ({ ok: true, root: 'layout-fixture://library' }));
ipcMain.handle('fusion:scan-library', () => ({
  ok: false,
  error: 'library-not-found',
  root: 'layout-fixture://library'
}));
ipcMain.handle('fusion:preset-repository-list', () => ({
  ok: true,
  repository: {
    contract: 'xin.glitch-preset-repository/1',
    version: 'fixture',
    root: 'layout-fixture://presets',
    categories: { builtIn: [], user: [], recovered: [] },
    warnings: []
  }
}));
ipcMain.handle('fusion:open-generator-editor', (_event, payload) => ({ ok: true, locale: payload?.locale }));
ipcMain.handle('fusion:analyze-in-xld', (_event, payload) => ({ ok: true, trackId: payload?.trackId }));

function inside(rect, width, height, tolerance = 2) {
  return rect.width > 0 && rect.height > 0 &&
    rect.left >= -tolerance && rect.top >= -tolerance &&
    rect.right <= width + tolerance && rect.bottom <= height + tolerance;
}

app.whenReady().then(async () => {
  const win = new BrowserWindow({
    width: 1280,
    height: 760,
    minWidth: 640,
    minHeight: 480,
    show: false,
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
      preload: path.join(appRoot, 'desktop', 'preload.cjs'),
      offscreen: true
    }
  });
  const rendererErrors = [];
  win.webContents.on('console-message', event => {
    if (event.level === 'error' || event.level === 3) rendererErrors.push(event.message || 'renderer error');
  });
  const execute = async (label, source) => {
    try {
      return await win.webContents.executeJavaScript(source);
    } catch (error) {
      throw new Error(`${label}: ${error.message}; renderer=${rendererErrors.slice(-4).join(' | ')}`);
    }
  };
  try {
    await win.loadFile(path.join(appRoot, 'index.html'));
    win.webContents.debugger.attach('1.3');
    const ready = await execute('readiness', `(async () => {
      for (let attempt = 0; attempt < 240; attempt += 1) {
        if (window.xinMusicLabLocale && window.XinMusicLabDynamicUi && window.SmokeResonanceProductControls) return true;
        await new Promise(resolve => setTimeout(resolve, 25));
      }
      return false;
    })()`);
    assert.equal(ready, true, 'main XML interface did not become locale-ready');

    await execute('sentinel', `(() => {
      window.__step6LocaleSentinel = {
        stage: document.querySelector('.stage'),
        visualizer: document.querySelector('#visualizer'),
        productApi: window.SmokeResonanceProductControls,
        presetApi: window.SmokeResonanceGeneratorPresets,
        activeEffect: document.querySelector('.scene-button.is-active')?.dataset.scene || '',
        fxPower: document.querySelector('#glitchPowerButton')?.getAttribute('aria-pressed') || 'false'
      };
      document.querySelector('#welcome')?.remove();
      document.querySelector('#glitchPanel')?.classList.add('is-open');
      document.querySelector('#glitchPanel')?.setAttribute('aria-hidden', 'false');
    })()`);

    const scenarios = [];
    for (const locale of ['zh-CN', 'en-US']) {
      await execute('locale-switch', `window.xinMusicLabLocale.setLocale(${JSON.stringify(locale)})`);
      await new Promise(resolve => setTimeout(resolve, 40));
      for (const [width, height] of [[960, 640], [1280, 760], [1600, 900]]) {
        await win.webContents.debugger.sendCommand('Emulation.setDeviceMetricsOverride', {
          width,
          height,
          deviceScaleFactor: 1,
          mobile: false
        });
        await new Promise(resolve => setTimeout(resolve, 60));
        const metrics = await execute('layout-read', `(() => {
          const rect = selector => {
            const node = document.querySelector(selector);
            const value = node?.getBoundingClientRect();
            return value ? { left: value.left, top: value.top, right: value.right, bottom: value.bottom, width: value.width, height: value.height } : null;
          };
          const localized = [...document.querySelectorAll('[data-i18n], [data-i18n-title], [data-i18n-placeholder], [data-i18n-aria-label], [data-i18n-alt]')];
          const fallbackMarkers = localized.flatMap(node => [
            node.textContent,
            node.getAttribute('title'),
            node.getAttribute('placeholder'),
            node.getAttribute('aria-label'),
            node.getAttribute('alt')
          ]).filter(value => /^\\[[\\w.-]+\\]$/.test(String(value || '').trim()));
          const sentinel = window.__step6LocaleSentinel;
          const lookStyle = getComputedStyle(document.querySelector('.settings-row--look'));
          return {
            locale: document.documentElement.lang,
            viewport: { width: innerWidth, height: innerHeight },
            document: { clientWidth: document.documentElement.clientWidth, scrollWidth: document.documentElement.scrollWidth },
            rects: {
              mood: rect('.mood-panel'),
              locale: rect('#localeControl'),
              product: rect('#productControlDock'),
              xld: rect('[data-product-open-xld]'),
              generator: rect('[data-product-open-generator]'),
              glitch: rect('#glitchPanel')
            },
            copy: {
              product: document.querySelector('#productControlDock > .settings-label')?.textContent,
              quality: document.querySelector('[data-product-quality]')?.textContent,
              recipe: document.querySelector('.product-preset-control__head b')?.textContent,
              repository: document.querySelector('#generatorPresetRepository > summary b')?.textContent,
              sourceInspector: document.querySelector('#sourceInspector > summary b')?.textContent
            },
            fallbackMarkers,
            styles: {
              lookFlexWrap: lookStyle.flexWrap,
              lookWidth: lookStyle.width,
              lookMinWidth: lookStyle.minWidth,
              loadedSheets: [...document.styleSheets].map(sheet => sheet.href || 'inline')
            },
            stateStable: Boolean(
              sentinel.stage === document.querySelector('.stage') &&
              sentinel.visualizer === document.querySelector('#visualizer') &&
              sentinel.productApi === window.SmokeResonanceProductControls &&
              sentinel.presetApi === window.SmokeResonanceGeneratorPresets &&
              sentinel.activeEffect === (document.querySelector('.scene-button.is-active')?.dataset.scene || '') &&
              sentinel.fxPower === (document.querySelector('#glitchPowerButton')?.getAttribute('aria-pressed') || 'false')
            )
          };
        })()`);
        scenarios.push(metrics);
      }
      const screenshot = screenshots[locale];
      if (screenshot) {
        await win.webContents.debugger.sendCommand('Emulation.setDeviceMetricsOverride', {
          width: 1280,
          height: 760,
          deviceScaleFactor: 1,
          mobile: false
        });
        await new Promise(resolve => setTimeout(resolve, 80));
        fs.writeFileSync(screenshot, (await win.capturePage()).toPNG());
      }
    }

    assert.deepEqual([...new Set(scenarios.map(item => item.viewport.width))], [960, 1280, 1600], 'viewport emulation did not exercise all target widths');

    for (const scenario of scenarios) {
      assert.equal(scenario.document.scrollWidth <= scenario.document.clientWidth + 2, true, `page overflow: ${JSON.stringify(scenario)}`);
      assert.equal(scenario.fallbackMarkers.length, 0, `fallback marker: ${scenario.fallbackMarkers.join(', ')}`);
      assert.equal(scenario.stateStable, true, `domain state changed for ${scenario.locale}`);
      for (const [name, rect] of Object.entries(scenario.rects)) {
        assert.ok(rect, `missing ${name} in ${scenario.locale}`);
        assert.equal(inside(rect, scenario.viewport.width, scenario.viewport.height), true, `${name} escaped viewport: ${JSON.stringify(scenario)}`);
      }
      const expected = scenario.locale === 'zh-CN'
        ? { product: '产品', recipe: '视觉配方 · GENERATOR', repository: '预设仓库', sourceInspector: '音源诊断' }
        : { product: 'PRODUCT', recipe: 'VISUAL RECIPE · GENERATOR', repository: 'PRESET REPOSITORY', sourceInspector: 'SOURCE INSPECTOR' };
      assert.equal(scenario.copy.product, expected.product);
      assert.equal(scenario.copy.recipe, expected.recipe);
      assert.equal(scenario.copy.repository, expected.repository);
      assert.equal(scenario.copy.sourceInspector, expected.sourceInspector);
    }

    const report = {
      ok: true,
      contract: 'xin.xml-i18n-layout-smoke/1',
      appRoot,
      scenarios
    };
    if (process.env.XML_I18N_LAYOUT_RESULT) {
      fs.writeFileSync(process.env.XML_I18N_LAYOUT_RESULT, JSON.stringify(report, null, 2));
    }
    console.log(`XML i18n Step 6 layout: PASS (${scenarios.length} locale/viewport scenarios)`);
  } finally {
    if (win.webContents.debugger.isAttached()) win.webContents.debugger.detach();
    win.destroy();
    app.quit();
  }
}).catch(error => {
  console.error(error);
  if (process.env.XML_I18N_LAYOUT_RESULT) {
    fs.writeFileSync(process.env.XML_I18N_LAYOUT_RESULT, JSON.stringify({ ok: false, error: error.stack || error.message }, null, 2));
  }
  app.exit(1);
});
