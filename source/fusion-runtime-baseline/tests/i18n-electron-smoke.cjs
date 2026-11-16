'use strict';

const assert = require('node:assert/strict');
const os = require('node:os');
const path = require('node:path');
const { app, BrowserWindow } = require('electron');

app.commandLine.appendSwitch('disable-gpu');
app.disableHardwareAcceleration();
app.setPath('userData', path.join(os.tmpdir(), `xml-i18n-step4-${process.pid}`));

app.whenReady().then(async () => {
  const win = new BrowserWindow({ show: false, webPreferences: { contextIsolation: false } });
  try {
    await win.loadFile(path.join(__dirname, 'i18n-fixture.html'));
    const first = await win.webContents.executeJavaScript(`(async () => {
      const sentinel = window.__productState;
      const initial = { ...window.xinMusicLabLocale.getState() };
      const aliasesMatch = window.xinMusicLabLocale === window.xinXmlLocale;
      const controlReady = Boolean(window.__xinMusicLabLocaleUi && document.querySelector('#localeControl'));
      const dynamicReady = Boolean(window.__xinMusicLabDynamicUi && window.XinMusicLabDynamicUi);
      window.XinMusicLabDynamicUi.bindText(document.querySelector('#runtimeProbe'), 'runtime.director.off');
      window.XinMusicLabDynamicUi.bindText(document.querySelector('#qualityButton'), 'runtime.quality.auto');
      const initialDynamic = {
        runtime: document.querySelector('#runtimeProbe')?.textContent,
        quality: document.querySelector('#qualityButton')?.textContent,
        fusion: document.querySelector('#fusionPanel h2')?.textContent,
        autoColor: document.querySelector('#fusionAutoColor')?.closest('label')?.textContent.trim()
      };
      const initialChineseActive = document.querySelector('[data-locale="zh-CN"]')?.classList.contains('is-active');
      document.querySelector('[data-locale="en-US"]')?.click();
      const local = { ...window.xinMusicLabLocale.getState() };
      const englishActive = document.querySelector('[data-locale="en-US"]')?.classList.contains('is-active');
      const englishProbe = document.querySelector('#staticProbe')?.textContent;
      const englishProbeTitle = document.querySelector('#staticProbe')?.title;
      const englishDynamic = {
        runtime: document.querySelector('#runtimeProbe')?.textContent,
        quality: document.querySelector('#qualityButton')?.textContent,
        fusion: document.querySelector('#fusionPanel h2')?.textContent,
        autoColor: document.querySelector('#fusionAutoColor')?.closest('label')?.textContent.trim()
      };
      window.xinMusicLabLocale.setHostLocale('zh-CN');
      const host = { ...window.xinMusicLabLocale.getState() };
      const hostChineseActive = document.querySelector('[data-locale="zh-CN"]')?.classList.contains('is-active');
      const chineseProbe = document.querySelector('#staticProbe')?.textContent;
      const chineseDynamic = {
        runtime: document.querySelector('#runtimeProbe')?.textContent,
        quality: document.querySelector('#qualityButton')?.textContent,
        fusion: document.querySelector('#fusionPanel h2')?.textContent,
        autoColor: document.querySelector('#fusionAutoColor')?.closest('label')?.textContent.trim()
      };
      window.xinMusicLabLocale.clearHostLocale();
      const restored = { ...window.xinMusicLabLocale.getState() };
      await new Promise(resolve => setTimeout(resolve, 20));
      return {
        initial, local, host, restored, aliasesMatch, controlReady, dynamicReady,
        initialChineseActive, englishActive, hostChineseActive, englishProbe, englishProbeTitle, chineseProbe,
        initialDynamic, englishDynamic, chineseDynamic,
        stateIdentityStable: sentinel === window.__productState,
        stateValue: window.__productState,
        desktopBridgeReady: Boolean(window.__xinMusicLabDesktopLocaleBridge),
        nativeLocaleCalls: [...window.__nativeLocaleCalls],
        persisted: localStorage.getItem('xin.musicLab.locale'),
        htmlLang: document.documentElement.lang
      };
    })()`);
    assert.deepEqual(first.initial, { locale: 'zh-CN', source: 'default' });
    assert.deepEqual(first.local, { locale: 'en-US', source: 'local' });
    assert.deepEqual(first.host, { locale: 'zh-CN', source: 'host' });
    assert.deepEqual(first.restored, { locale: 'en-US', source: 'local' });
    assert.equal(first.aliasesMatch, true);
    assert.equal(first.controlReady, true);
    assert.equal(first.dynamicReady, true);
    assert.equal(first.initialChineseActive, true);
    assert.equal(first.englishActive, true);
    assert.equal(first.hostChineseActive, true);
    // B7: the old welcome page's keys (welcome.connect, capture.title) are gone; current ones probe the same thing.
    assert.equal(first.englishProbe, 'Pick a song');
    assert.equal(first.englishProbeTitle, 'Open the library');
    assert.equal(first.chineseProbe, '选一首歌，');
    // B7: the expected words come from the catalogs by key (the wording changed since this test was written: 「导演」 is
    // now 「自动换画面」 and so on); what is checked is that each switch of language rewrites them, not the copy itself.
    // The panel heading is no longer bound to a key, so it is not part of the check.
    const {MESSAGE_CATALOGS} = require('../i18n/catalogs.js');
    const words = locale => ({runtime: MESSAGE_CATALOGS[locale]['runtime.director.off'], quality: MESSAGE_CATALOGS[locale]['runtime.quality.auto'],
      autoColor: MESSAGE_CATALOGS[locale]['fusion.autoColorInput']});
    const keyed = shown => ({runtime: shown.runtime, quality: shown.quality, autoColor: shown.autoColor});
    assert.deepEqual(keyed(first.initialDynamic), words('zh-CN'));
    assert.deepEqual(keyed(first.englishDynamic), words('en-US'));
    assert.deepEqual(first.chineseDynamic, first.initialDynamic);
    assert.equal(first.stateIdentityStable, true);
    assert.equal(first.desktopBridgeReady, true);
    assert.deepEqual(first.nativeLocaleCalls.slice(-3), ['en-US', 'zh-CN', 'en-US']);
    assert.deepEqual(first.stateValue, { playing: true, preset: 'balanced', seed: 42, mappingCount: 5 });
    assert.equal(first.persisted, 'en-US');
    assert.equal(first.htmlLang, 'en-US');

    const loaded = new Promise(resolve => win.webContents.once('did-finish-load', resolve));
    win.reload();
    await loaded;
    const reloaded = await win.webContents.executeJavaScript(`({
      state: { ...window.xinMusicLabLocale.getState() },
      htmlLang: document.documentElement.lang,
      aliasesMatch: window.xinMusicLabLocale === window.xinXmlLocale,
      englishActive: document.querySelector('[data-locale="en-US"]')?.classList.contains('is-active'),
      probe: document.querySelector('#staticProbe')?.textContent,
      productState: window.__productState
    })`);
    assert.deepEqual(reloaded.state, { locale: 'en-US', source: 'local' });
    assert.equal(reloaded.htmlLang, 'en-US');
    assert.equal(reloaded.aliasesMatch, true);
    assert.equal(reloaded.englishActive, true);
    assert.equal(reloaded.probe, 'Pick a song');
    assert.deepEqual(reloaded.productState, { playing: true, preset: 'balanced', seed: 42, mappingCount: 5 });
    console.log('XML i18n Step 4 Electron smoke: PASS');
  } finally {
    win.destroy();
    app.quit();
  }
}).catch(error => {
  console.error(error);
  app.exit(1);
});
