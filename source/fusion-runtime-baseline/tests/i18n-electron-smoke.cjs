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
    assert.equal(first.englishProbe, 'Connect computer audio');
    assert.equal(first.englishProbeTitle, 'Choose another system-audio source');
    assert.equal(first.chineseProbe, '连接电脑声音');
    assert.deepEqual(first.initialDynamic, {
      runtime: '导演', quality: '画质 Auto', fusion: 'Fusion 控制台', autoColor: '和弦驱动配色'
    });
    assert.deepEqual(first.englishDynamic, {
      runtime: 'Director', quality: 'Quality Auto', fusion: 'Fusion Console', autoColor: 'Chord-driven palette'
    });
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
    assert.equal(reloaded.probe, 'Connect computer audio');
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
