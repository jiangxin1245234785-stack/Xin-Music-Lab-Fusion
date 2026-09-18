'use strict';

const SUPPORTED_LOCALES = Object.freeze(['zh-CN', 'en-US']);
const DEFAULT_LOCALE = 'zh-CN';

const NATIVE_MESSAGES = Object.freeze({
  'zh-CN': Object.freeze({
    'dialog.bridge.openTitle': '选择 XLD 的 music-lab.json',
    'dialog.bridge.filter': 'XLD 音乐分析桥接文件',
    'dialog.preset.exportTitle': '导出 Glitch Generator 预设',
    'dialog.preset.importTitle': '导入 Glitch Generator 预设',
    'dialog.preset.filter': 'Glitch Generator 预设',
    'dialog.snapshot.saveTitle': '保存 Xin’s Music Lab 快照',
    'dialog.snapshot.filter': 'PNG 图像',
    'window.generator.title': 'Glitch 映射生成器 · {version}'
  }),
  'en-US': Object.freeze({
    'dialog.bridge.openTitle': 'Choose an XLD music-lab.json file',
    'dialog.bridge.filter': 'XLD Music Lab bridge file',
    'dialog.preset.exportTitle': 'Export Glitch Generator preset',
    'dialog.preset.importTitle': 'Import Glitch Generator preset',
    'dialog.preset.filter': 'Glitch Generator preset',
    'dialog.snapshot.saveTitle': 'Save Xin’s Music Lab snapshot',
    'dialog.snapshot.filter': 'PNG image',
    'window.generator.title': 'Glitch Mapping Generator · {version}'
  })
});

function normalizeLocale(locale) {
  return SUPPORTED_LOCALES.includes(locale) ? locale : null;
}

function interpolate(template, params = {}) {
  return String(template).replace(/\{([a-zA-Z0-9_]+)\}/g, (_match, key) =>
    Object.prototype.hasOwnProperty.call(params, key) ? String(params[key]) : `{${key}}`
  );
}

function createMainLocaleController(options = {}) {
  let rendererLocale = normalizeLocale(options.rendererLocale) || DEFAULT_LOCALE;

  function getState() {
    return Object.freeze({ locale: rendererLocale, source: 'renderer' });
  }

  function setRendererLocale(locale) {
    const normalized = normalizeLocale(locale);
    if (!normalized) throw new RangeError(`unsupported-locale:${String(locale)}`);
    rendererLocale = normalized;
    return getState();
  }

  function message(key, params) {
    const locale = getState().locale;
    const template = NATIVE_MESSAGES[locale]?.[key] || NATIVE_MESSAGES['en-US']?.[key] || `[${key}]`;
    return interpolate(template, params);
  }

  return Object.freeze({ getState, setRendererLocale, message });
}

module.exports = Object.freeze({
  SUPPORTED_LOCALES,
  DEFAULT_LOCALE,
  NATIVE_MESSAGES,
  normalizeLocale,
  interpolate,
  createMainLocaleController
});
