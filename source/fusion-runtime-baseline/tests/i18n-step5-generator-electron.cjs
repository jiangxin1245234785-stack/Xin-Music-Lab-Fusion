'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { app, BrowserWindow } = require('electron');
const { applyGeneratorHostLocale } = require('../desktop/generator-locale.cjs');

app.commandLine.appendSwitch('disable-background-timer-throttling');
app.setPath('userData', path.join(os.tmpdir(), `xml-i18n-step5-generator-${process.pid}`));

function resolveEntry() {
  const candidates = [
    process.env.GENERATOR_ENTRY,
    path.join(__dirname, '..', 'tools', 'glitch-generator', '6.6.1-integration-v.3', 'demo', 'index.html'),
    path.resolve(__dirname, '..', '..', '..', '..', '.webgl-opt', 'glitch-generator', 'demo', 'index.html')
  ].filter(Boolean);
  const entry = candidates.find(candidate => fs.existsSync(candidate));
  if (!entry) throw new Error(`generator-entry-missing:${candidates.join('|')}`);
  return entry;
}

app.whenReady().then(async () => {
  const failures = [];
  const win = new BrowserWindow({
    width: 1120,
    height: 760,
    show: false,
    webPreferences: { contextIsolation: true, nodeIntegration: false, sandbox: true }
  });
  win.webContents.on('console-message', event => {
    if (event.level === 'error' || event.level === 3) failures.push(event.message || 'renderer error');
  });
  try {
    await win.loadFile(resolveEntry());
    const snapshot = () => win.webContents.executeJavaScript(`(() => ({
      lang: document.documentElement.lang,
      source: document.querySelector('#localeSource')?.dataset.source || '',
      localeDisabled: document.querySelector('#localeSelect')?.disabled || false,
      preset: document.querySelector('#presetSelect')?.value || '',
      seed: document.querySelector('#sessionSeed')?.value || '',
      canvasWidth: Number(document.querySelector('#phase1Canvas')?.width) || 0,
      canvasHeight: Number(document.querySelector('#phase1Canvas')?.height) || 0,
      mappingCount: document.querySelectorAll('[data-mapping-card]').length
    }))()`);

    const before = await snapshot();
    const englishResult = await applyGeneratorHostLocale(win.webContents, 'en-US');
    const english = await snapshot();
    const chineseResult = await applyGeneratorHostLocale(win.webContents, 'zh-CN');
    const chinese = await snapshot();
    assert.equal(englishResult.ok, true);
    assert.equal(chineseResult.ok, true);
    assert.deepEqual(
      { lang: english.lang, source: english.source, localeDisabled: english.localeDisabled },
      { lang: 'en-US', source: 'host', localeDisabled: true }
    );
    assert.deepEqual(
      { lang: chinese.lang, source: chinese.source, localeDisabled: chinese.localeDisabled },
      { lang: 'zh-CN', source: 'host', localeDisabled: true }
    );
    for (const key of ['preset', 'seed', 'canvasWidth', 'canvasHeight', 'mappingCount']) {
      assert.equal(english[key], before[key], `${key} changed during English host takeover`);
      assert.equal(chinese[key], before[key], `${key} changed during Chinese host takeover`);
    }
    assert.deepEqual(failures, []);
    console.log('XML i18n Step 5 Generator Electron hand-off: PASS');
  } finally {
    win.destroy();
    app.quit();
  }
}).catch(error => {
  console.error(error);
  app.exit(1);
});
