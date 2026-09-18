'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { app, BrowserWindow } = require('electron');

process.env.XLD_TEST = '1';
app.commandLine.appendSwitch('disable-gpu');
app.disableHardwareAcceleration();
app.setPath('userData', path.join(os.tmpdir(), `xld-i18n-app-smoke-${process.pid}`));

require('../desktop/main.cjs');

async function waitForWindow() {
  for (let attempt = 0; attempt < 100; attempt += 1) {
    const win = BrowserWindow.getAllWindows()[0];
    if (win && !win.webContents.isLoading()) return win;
    await new Promise(resolve => setTimeout(resolve, 100));
  }
  throw new Error('XLD window did not become ready');
}

app.whenReady().then(async () => {
  const win = await waitForWindow();
  try {
    const readiness = await win.webContents.executeJavaScript(`(async () => {
      for (let attempt = 0; attempt < 800; attempt += 1) {
        if (window.__xinXldLocaleUi && window.__xinXldStaticLocaleUi && window.XLDRuntimeMessages && window.__xldAppReady) return { ready: true };
        await new Promise(resolve => setTimeout(resolve, 50));
      }
      return {
        ready: false,
        documentReadyState: document.readyState,
        localeUi: Boolean(window.__xinXldLocaleUi),
        staticUi: Boolean(window.__xinXldStaticLocaleUi),
        runtimeMessages: Boolean(window.XLDRuntimeMessages),
        appReady: Boolean(window.__xldAppReady),
        apiReady: Boolean(window.XLD),
        librarySummary: document.querySelector('#librarySummary')?.textContent || '',
        log: document.querySelector('#analysisLog')?.textContent || ''
      };
    })()`);
    if (!readiness.ready) throw new Error(`XLD readiness timeout: ${JSON.stringify(readiness)}`);
    await new Promise(resolve => setTimeout(resolve, 120));
    if (process.env.XLD_I18N_SCREENSHOT) {
      win.showInactive();
      await new Promise(resolve => setTimeout(resolve, 120));
      const image = await win.capturePage();
      fs.writeFileSync(process.env.XLD_I18N_SCREENSHOT, image.toPNG());
      win.hide();
    }
    const localResult = await win.webContents.executeJavaScript(`(async () => {
      const audio = document.querySelector('#audioElement');
      const readDomainState = () => ({
        source: audio?.getAttribute('src') || '',
        currentTime: audio?.currentTime || 0,
        paused: audio?.paused !== false,
        albumCount: document.querySelectorAll('.album-card').length,
        trackCount: document.querySelectorAll('.track-row').length,
        selectedEngine: document.querySelector('.engine-card.selected')?.dataset.engine || ''
      });
      const before = readDomainState();
      const initial = { ...window.xinXldLocale.getState() };
      const initialLibraryTitle = document.querySelector('.library-panel .panel-heading h2')?.textContent;
      const localeControlReady = Boolean(document.querySelector('#localeControl'));
      document.querySelector('[data-locale="en-US"]')?.click();
      await new Promise(resolve => setTimeout(resolve, 0));
      const local = { ...window.xinXldLocale.getState() };
      const englishActive = document.querySelector('[data-locale="en-US"]')?.classList.contains('active');
      const englishLibraryTitle = document.querySelector('.library-panel .panel-heading h2')?.textContent;
      const englishSubtitle = document.querySelector('.brand-copy > span')?.textContent;
      const englishLabTitle = document.querySelector('#labTitle')?.textContent;
      const englishTargetTitle = document.querySelector('#analysisTargetTitle')?.textContent;
      const englishNowTitle = document.querySelector('#nowTitle')?.textContent;
      const englishComparisonTitle = document.querySelector('#comparisonTitle')?.textContent;
      const persisted = localStorage.getItem('xin.xld.locale');
      const desktopLocale = await window.XLD.getHostLocale();
      const afterLocal = readDomainState();
      return {
        apiReady: Boolean(window.XLD),
        localeReady: Boolean(window.xinXldLocale),
        localeControlReady,
        initial,
        initialLibraryTitle,
        local,
        englishActive,
        englishLibraryTitle,
        englishSubtitle,
        englishLabTitle,
        englishTargetTitle,
        englishNowTitle,
        englishComparisonTitle,
        persisted,
        desktopLocale,
        before,
        afterLocal,
        htmlLang: document.documentElement.lang
      };
    })()`);

    if (process.env.XLD_I18N_SCREENSHOT_EN) {
      win.showInactive();
      await new Promise(resolve => setTimeout(resolve, 120));
      const image = await win.capturePage();
      fs.writeFileSync(process.env.XLD_I18N_SCREENSHOT_EN, image.toPNG());
      win.hide();
    }

    const hostResult = await win.webContents.executeJavaScript(`(async () => {
      const audio = document.querySelector('#audioElement');
      const readDomainState = () => ({
        source: audio?.getAttribute('src') || '',
        currentTime: audio?.currentTime || 0,
        paused: audio?.paused !== false,
        albumCount: document.querySelectorAll('.album-card').length,
        trackCount: document.querySelectorAll('.track-row').length,
        selectedEngine: document.querySelector('.engine-card.selected')?.dataset.engine || ''
      });
      window.xinXldLocale.setHostLocale('zh-CN');
      await new Promise(resolve => setTimeout(resolve, 0));
      return {
        host: { ...window.xinXldLocale.getState() },
        hostLibraryTitle: document.querySelector('.library-panel .panel-heading h2')?.textContent,
        hostLabTitle: document.querySelector('#labTitle')?.textContent,
        hostNowTitle: document.querySelector('#nowTitle')?.textContent,
        afterHost: readDomainState(),
        htmlLang: document.documentElement.lang
      };
    })()`);
    const restoredResult = await win.webContents.executeJavaScript(`(async () => {
      const audio = document.querySelector('#audioElement');
      const readDomainState = () => ({
        source: audio?.getAttribute('src') || '',
        currentTime: audio?.currentTime || 0,
        paused: audio?.paused !== false,
        albumCount: document.querySelectorAll('.album-card').length,
        trackCount: document.querySelectorAll('.track-row').length,
        selectedEngine: document.querySelector('.engine-card.selected')?.dataset.engine || ''
      });
      window.xinXldLocale.clearHostLocale();
      await new Promise(resolve => setTimeout(resolve, 0));
      const localized = [...document.querySelectorAll('[data-i18n], [data-i18n-title], [data-i18n-placeholder], [data-i18n-aria-label]')];
      const fallbackMarkers = localized.flatMap(element => [
        element.textContent,
        element.getAttribute('title'),
        element.getAttribute('placeholder'),
        element.getAttribute('aria-label')
      ]).filter(value => /^\[[\w.-]+\]$/.test(String(value || '').trim()));
      return {
        restored: { ...window.xinXldLocale.getState() },
        restoredLibraryTitle: document.querySelector('.library-panel .panel-heading h2')?.textContent,
        restoredLabTitle: document.querySelector('#labTitle')?.textContent,
        afterRestore: readDomainState(),
        fallbackMarkers,
        restoredHtmlLang: document.documentElement.lang
      };
    })()`);
    const result = { ...localResult, ...hostResult, ...restoredResult };
    if (process.env.XLD_I18N_RESULT) fs.writeFileSync(process.env.XLD_I18N_RESULT, JSON.stringify({ ok: true, result }, null, 2));

    assert.equal(result.apiReady, true);
    assert.equal(result.localeReady, true);
    assert.equal(result.localeControlReady, true);
    assert.deepEqual(result.initial, { locale: 'zh-CN', source: 'default' });
    assert.equal(result.initialLibraryTitle, '唱片库');
    assert.deepEqual(result.local, { locale: 'en-US', source: 'local' });
    assert.equal(result.englishActive, true);
    assert.equal(result.englishLibraryTitle, 'Album library');
    assert.equal(result.englishSubtitle, 'LOCAL ALBUM PLAYER · STRUCTURE + HARMONY OBSERVATORY');
    assert.equal(result.englishLabTitle, 'Section workbench');
    assert.equal(result.englishTargetTitle, 'Click to select a track');
    assert.equal(result.englishNowTitle, 'Not playing');
    assert.equal(result.englishComparisonTitle, 'Select a track first');
    assert.equal(result.hostLibraryTitle, '唱片库');
    assert.equal(result.hostLabTitle, '段落评测台');
    assert.equal(result.hostNowTitle, '尚未播放');
    assert.equal(result.persisted, 'en-US');
    assert.equal(result.desktopLocale.locale, 'en-US');
    assert.equal(result.desktopLocale.source, 'renderer');
    assert.equal(result.desktopLocale.hostLocale, null);
    assert.deepEqual(result.host, { locale: 'zh-CN', source: 'host' });
    assert.deepEqual(result.restored, { locale: 'en-US', source: 'local' });
    assert.equal(result.restoredLibraryTitle, 'Album library');
    assert.equal(result.restoredLabTitle, 'Section workbench');
    assert.deepEqual(result.fallbackMarkers, []);
    assert.deepEqual(result.afterLocal, result.before);
    assert.deepEqual(result.afterHost, result.before);
    assert.deepEqual(result.afterRestore, result.before);
    assert.equal(result.htmlLang, 'zh-CN');
    assert.equal(result.restoredHtmlLang, 'en-US');
    console.log('XLD i18n full-app smoke: PASS');
  } finally {
    win.destroy();
    app.quit();
  }
}).catch(error => {
  console.error(error);
  if (process.env.XLD_I18N_RESULT) fs.writeFileSync(process.env.XLD_I18N_RESULT, JSON.stringify({ ok: false, error: error.stack || error.message }, null, 2));
  app.exit(1);
});
