'use strict';

const fs = require('node:fs');
const path = require('node:path');
const catalogs = require('../i18n/catalogs.js');
const translator = require('../i18n/translator.js');
const dynamicUi = require('../i18n/dynamic-ui.js');
const nativeLocale = require('../desktop/locale.cjs');

const root = path.join(__dirname, '..');
const read = relative => fs.readFileSync(path.join(root, relative), 'utf8');
const unique = values => [...new Set(values)].sort();
const difference = (left, right) => left.filter(value => !right.includes(value));

function bindingKeys(html) {
  return unique([...html.matchAll(
    /data-i18n(?:-title|-placeholder|-aria-label|-alt)?="([^"]+)"/g
  )].map(match => match[1]));
}

function dynamicManifestKeys() {
  return unique([
    ...dynamicUi.TEXT_BINDINGS.map(([, key]) => key),
    ...dynamicUi.ATTRIBUTE_BINDINGS.map(([, , key]) => key),
    ...dynamicUi.CONTROL_LABEL_BINDINGS.map(([, key]) => key)
  ]);
}

function referencedMessageKeys() {
  const sources = [
    'app.js',
    'fusion.js',
    'product-control-dock.js',
    'generator-preset-selector.js',
    'generator-preset-file-control.js',
    'generator-preset-repository-control.js'
  ].map(read).join('\n');
  return unique([...sources.matchAll(
    /(?:uiText|bindUiText|bindUiAttribute|this\.t)\(\s*['"]([\w.-]+)['"]/g
  )].map(match => match[1]));
}

function rawMetadataViolations(html) {
  const protectedIds = [
    'trackTitle', 'trackMeta', 'fusionTrack', 'fusionArtist', 'fusionAlbum',
    'fusionChord', 'fusionLibraryRoot', 'fusionAnalysisPercent'
  ];
  return protectedIds.filter(id => {
    const match = html.match(new RegExp(`<[^>]+id="${id}"[^>]*>`, 'i'));
    return match && /data-i18n(?:-|=)/.test(match[0]);
  });
}

function forbiddenRuntimeCoupling() {
  const files = [
    'i18n/bootstrap.js', 'i18n/catalogs.js', 'i18n/translator.js',
    'i18n/locale-controller.js', 'i18n/locale-ui.js', 'i18n/static-ui.js',
    'i18n/dynamic-ui.js', 'i18n/desktop-locale-bridge.js'
  ];
  const patterns = [
    'MutationObserver', 'requestAnimationFrame', 'AudioContext', 'getContext(',
    'Math.random(', 'performance.now(', 'Date.now('
  ];
  return files.flatMap(file => {
    const source = read(file);
    return patterns.filter(pattern => source.includes(pattern)).map(pattern => ({ file, pattern }));
  });
}

function runAudit() {
  const html = read('index.html');
  const enKeys = Object.keys(catalogs.EN_US_MESSAGES).sort();
  const zhKeys = Object.keys(catalogs.ZH_CN_MESSAGES).sort();
  const nativeEn = Object.keys(nativeLocale.NATIVE_MESSAGES['en-US']).sort();
  const nativeZh = Object.keys(nativeLocale.NATIVE_MESSAGES['zh-CN']).sort();
  const staticKeys = bindingKeys(html);
  const dynamicKeys = dynamicManifestKeys();
  const referencedKeys = referencedMessageKeys();
  const allRequiredKeys = unique([...staticKeys, ...dynamicKeys, ...referencedKeys]);
  const missingEnglish = difference(allRequiredKeys, enKeys);
  const missingChinese = difference(allRequiredKeys, zhKeys);
  const fallbackMarkers = allRequiredKeys.flatMap(key => [
    ['en-US', translator.translateMessage('en-US', key)],
    ['zh-CN', translator.translateMessage('zh-CN', key)]
  ]).filter(([, value]) => /^\[[\w.-]+\]$/.test(String(value)));
  const rawViolations = rawMetadataViolations(html);
  const forbidden = forbiddenRuntimeCoupling();
  const packageJson = JSON.parse(read('package.json'));
  const report = {
    contract: 'xin.xml-i18n-release-audit/1',
    version: packageJson.version,
    locales: [...catalogs.SUPPORTED_LOCALES],
    counts: {
      catalog: enKeys.length,
      staticBindings: [...html.matchAll(/data-i18n(?:-title|-placeholder|-aria-label|-alt)?="[^"]+"/g)].length,
      staticKeys: staticKeys.length,
      dynamicManifestKeys: dynamicKeys.length,
      referencedMessageKeys: referencedKeys.length,
      requiredKeys: allRequiredKeys.length,
      nativeKeys: nativeEn.length
    },
    checks: {
      catalogParity: difference(enKeys, zhKeys).length === 0 && difference(zhKeys, enKeys).length === 0,
      nativeCatalogParity: difference(nativeEn, nativeZh).length === 0 && difference(nativeZh, nativeEn).length === 0,
      allBindingsResolve: missingEnglish.length === 0 && missingChinese.length === 0,
      noFallbackMarkers: fallbackMarkers.length === 0,
      rawMetadataProtected: rawViolations.length === 0,
      presentationOnly: forbidden.length === 0
    },
    details: {
      missingEnglish,
      missingChinese,
      fallbackMarkers,
      rawViolations,
      forbidden
    }
  };
  report.ok = Object.values(report.checks).every(Boolean);
  return Object.freeze(report);
}

if (require.main === module) {
  const report = runAudit();
  console.log(JSON.stringify(report, null, 2));
  if (!report.ok) process.exitCode = 1;
}

module.exports = Object.freeze({ runAudit });
