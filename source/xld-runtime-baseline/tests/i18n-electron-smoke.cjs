'use strict';

const assert = require('node:assert/strict');
const os = require('node:os');
const path = require('node:path');
const { app, BrowserWindow } = require('electron');

app.commandLine.appendSwitch('disable-gpu');
app.disableHardwareAcceleration();
app.setPath('userData', path.join(os.tmpdir(), `xld-i18n-smoke-${process.pid}`));

app.whenReady().then(async () => {
  const win = new BrowserWindow({ show: false, webPreferences: { contextIsolation: false } });
  try {
    await win.loadFile(path.join(__dirname, 'i18n-fixture.html'));
    const result = await win.webContents.executeJavaScript(`(() => {
      const initial = { ...window.xinXldLocale.getState() };
      const initialLang = document.documentElement.lang;
      document.querySelector('[data-locale="en-US"]').click();
      const local = { ...window.xinXldLocale.getState() };
      const englishActive = document.querySelector('[data-locale="en-US"]').classList.contains('active');
      const englishStatic = document.querySelector('#staticProbe').textContent;
      const runtimeSummary = window.XLDRuntimeMessages.translateRuntime('en-US', 'runtime.library.summary', { albums: 2, tracks: 8, root: 'D:/Music' });
      const backendStatus = window.XLDRuntimeMessages.localizeBackendMessage('正在启动分析器', 'en-US');
      const persisted = localStorage.getItem('xin.xld.locale');
      window.xinXldLocale.setHostLocale('zh-CN');
      const host = { ...window.xinXldLocale.getState() };
      const chineseStatic = document.querySelector('#staticProbe').textContent;
      const finalLang = document.documentElement.lang;
      return { initial, initialLang, local, host, finalLang, englishActive, englishStatic, chineseStatic, runtimeSummary, backendStatus, persisted };
    })()`);

    assert.deepEqual(result.initial, { locale: 'zh-CN', source: 'default' });
    assert.equal(result.initialLang, 'zh-CN');
    assert.deepEqual(result.local, { locale: 'en-US', source: 'local' });
    assert.equal(result.englishActive, true);
    assert.equal(result.englishStatic, 'Choose an album');
    assert.equal(result.chineseStatic, '选择一张唱片');
    assert.equal(result.runtimeSummary, '2 albums · 8 tracks · D:/Music');
    assert.equal(result.backendStatus, 'Starting analyzer');
    assert.equal(result.persisted, 'en-US');
    assert.deepEqual(result.host, { locale: 'zh-CN', source: 'host' });
    assert.equal(result.finalLang, 'zh-CN');

    const didReload = new Promise(resolve => win.webContents.once('did-finish-load', resolve));
    win.reload();
    await didReload;
    const reloaded = await win.webContents.executeJavaScript(`(() => ({
      state: { ...window.xinXldLocale.getState() },
      htmlLang: document.documentElement.lang,
      englishActive: document.querySelector('[data-locale="en-US"]').classList.contains('active'),
      staticText: document.querySelector('#staticProbe').textContent,
      persisted: localStorage.getItem('xin.xld.locale')
    }))()`);
    assert.deepEqual(reloaded.state, { locale: 'en-US', source: 'local' });
    assert.equal(reloaded.htmlLang, 'en-US');
    assert.equal(reloaded.englishActive, true);
    assert.equal(reloaded.staticText, 'Choose an album');
    assert.equal(reloaded.persisted, 'en-US');
    console.log('XLD i18n Electron smoke: PASS');
  } finally {
    win.destroy();
    await app.quit();
  }
}).catch(error => {
  console.error(error);
  app.exit(1);
});
