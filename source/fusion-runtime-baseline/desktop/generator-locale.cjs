'use strict';

const { normalizeLocale, DEFAULT_LOCALE } = require('./locale.cjs');

function hostLocaleScript(locale, attempts = 120, intervalMs = 25) {
  const normalized = normalizeLocale(locale) || DEFAULT_LOCALE;
  const safeAttempts = Math.max(1, Math.min(400, Number(attempts) || 120));
  const safeInterval = Math.max(5, Math.min(250, Number(intervalMs) || 25));
  return `(() => new Promise(resolve => {
    let remaining = ${safeAttempts};
    const apply = () => {
      const host = globalThis.xinGlitchGeneratorLocale;
      if (host && typeof host.setLocale === 'function') {
        const state = host.setLocale(${JSON.stringify(normalized)});
        resolve({ ok: true, locale: host.getLocale(), source: state?.source || 'host' });
        return;
      }
      remaining -= 1;
      if (remaining <= 0) {
        resolve({ ok: false, error: 'generator-locale-adapter-timeout' });
        return;
      }
      setTimeout(apply, ${safeInterval});
    };
    apply();
  }))()`;
}

async function applyGeneratorHostLocale(webContents, locale, options = {}) {
  if (!webContents || webContents.isDestroyed?.()) {
    return { ok: false, error: 'generator-web-contents-unavailable' };
  }
  const normalized = normalizeLocale(locale) || DEFAULT_LOCALE;
  try {
    const result = await webContents.executeJavaScript(
      hostLocaleScript(normalized, options.attempts, options.intervalMs),
      true
    );
    return result?.ok
      ? { ok: true, locale: normalized, source: 'host' }
      : { ok: false, error: result?.error || 'generator-locale-adapter-unavailable' };
  } catch (error) {
    return { ok: false, error: error?.message || 'generator-locale-sync-failed' };
  }
}

module.exports = Object.freeze({ hostLocaleScript, applyGeneratorHostLocale });
