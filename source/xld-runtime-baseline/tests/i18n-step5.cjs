'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { createMainLocaleController, normalizeLocale } = require('../desktop/locale.cjs');
const { mountDesktopLocaleBridge } = require('../i18n/desktop-locale-bridge.js');

const root = path.join(__dirname, '..');
const read = relative => fs.readFileSync(path.join(root, relative), 'utf8');
const stagedXmlRoot = path.join(root, 'xml-host-seam');
const xmlRoot = fs.existsSync(stagedXmlRoot)
  ? stagedXmlRoot
  : fs.existsSync(path.join(root, '..', 'fusion-runtime-baseline'))
    ? path.join(root, '..', 'fusion-runtime-baseline')
    : path.join(root, '..', 'xins-music-lab-fusion');
const readXml = relative => fs.readFileSync(path.join(xmlRoot, relative), 'utf8');

const mainLocale = createMainLocaleController();
assert.deepEqual(mainLocale.getState(), {
  locale: 'zh-CN', source: 'renderer', rendererLocale: 'zh-CN', hostLocale: null
});
assert.equal(mainLocale.message('dialog.library.chooseTitle'), '选择本地音乐库');
mainLocale.setRendererLocale('en-US');
assert.equal(mainLocale.message('dialog.analysis.chooseTitle'), 'Choose XLD analysis repository');
mainLocale.setHostLocale('zh-CN');
assert.equal(mainLocale.getState().source, 'host');
assert.equal(mainLocale.message('dialog.library.chooseTitle'), '选择本地音乐库');
mainLocale.clearHostLocale();
assert.equal(mainLocale.getState().locale, 'en-US');
assert.equal(normalizeLocale('fr-FR'), null);

const rendererListeners = new Set();
let localeState = { locale: 'en-US', source: 'local' };
const rendererCalls = [];
let hostListener = null;
const fakeHost = {
  xinXldLocale: {
    getState: () => localeState,
    setHostLocale(locale) { localeState = { locale, source: 'host' }; for (const fn of rendererListeners) fn(localeState); },
    clearHostLocale() { localeState = { locale: 'en-US', source: 'local' }; for (const fn of rendererListeners) fn(localeState); },
    subscribe(fn) { rendererListeners.add(fn); fn(localeState); return () => rendererListeners.delete(fn); }
  },
  XLD: {
    setRendererLocale(locale) { rendererCalls.push(locale); return Promise.resolve({ ok: true }); },
    getHostLocale() { return Promise.resolve({ locale: 'zh-CN', hostLocale: 'zh-CN', source: 'host' }); },
    onHostLocale(fn) { hostListener = fn; return () => { hostListener = null; }; }
  }
};

(async () => {
  const mounted = mountDesktopLocaleBridge(fakeHost);
  await mounted.ready;
  assert.deepEqual(rendererCalls, ['en-US']);
  assert.deepEqual(localeState, { locale: 'zh-CN', source: 'host' });
  hostListener({ locale: 'en-US', hostLocale: 'en-US', source: 'host' });
  assert.deepEqual(localeState, { locale: 'en-US', source: 'host' });
  hostListener({ locale: 'en-US', hostLocale: null, source: 'renderer' });
  assert.deepEqual(localeState, { locale: 'en-US', source: 'local' });
  assert.deepEqual(rendererCalls, ['en-US', 'en-US']);
  mounted.destroy();

  const html = read('index.html');
  assert.ok(html.indexOf('i18n/desktop-locale-bridge.js') < html.indexOf('app.js'));
  const preload = read('desktop/preload.cjs');
  assert.match(preload, /getHostLocale/);
  assert.match(preload, /setRendererLocale/);
  assert.match(preload, /onHostLocale/);
  const main = read('desktop/main.cjs');
  assert.match(main, /dialog\.library\.chooseTitle/);
  assert.match(main, /dialog\.analysis\.chooseTitle/);
  assert.match(main, /normalizeLocale\(request\??\.locale\)/);
  const xmlPreload = readXml('desktop/preload.cjs');
  const xmlMain = readXml('desktop/main.cjs');
  const xmlRenderer = readXml('fusion.js');
  assert.match(xmlPreload, /trackId, locale/);
  assert.match(xmlMain, /writeRequest\(fusionAnalysisRoot,\{source,locale/);
  assert.match(read('core/open-request.cjs'), /requestedAt:/);
  assert.match(xmlRenderer, /document\.documentElement\.lang/);
  console.log('XLD i18n Step 5: PASS');
})().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
