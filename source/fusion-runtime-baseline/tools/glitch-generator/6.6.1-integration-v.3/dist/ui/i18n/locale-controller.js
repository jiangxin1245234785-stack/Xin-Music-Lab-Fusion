import { translateMessage } from './translator.js';
import { SUPPORTED_LOCALES } from './types.js';
export const DEFAULT_LOCALE = 'zh-CN';
export const FALLBACK_LOCALE = 'en-US';
export const LOCALE_STORAGE_KEY = 'xin.glitch-mapping-generator.ui.locale.v1';
export function isSupportedLocale(value) {
    return (typeof value === 'string' &&
        SUPPORTED_LOCALES.includes(value));
}
function readStoredLocale(storage) {
    if (!storage)
        return null;
    try {
        const value = storage.getItem(LOCALE_STORAGE_KEY);
        return isSupportedLocale(value) ? value : null;
    }
    catch {
        return null;
    }
}
export function createLocaleController(options = {}) {
    const listeners = new Set();
    let localLocale = readStoredLocale(options.storage);
    let hostLocale = isSupportedLocale(options.hostLocale)
        ? options.hostLocale
        : null;
    let revision = 0;
    const resolve = () => {
        let locale = DEFAULT_LOCALE;
        let source = 'default';
        if (localLocale) {
            locale = localLocale;
            source = 'local';
        }
        if (hostLocale) {
            locale = hostLocale;
            source = 'host';
        }
        return { locale, source, revision };
    };
    let state = resolve();
    const publishIfChanged = () => {
        const next = resolve();
        if (next.locale === state.locale && next.source === state.source) {
            return state;
        }
        revision += 1;
        state = { ...next, revision };
        for (const listener of listeners)
            listener(state);
        return state;
    };
    const persistLocalLocale = () => {
        if (!options.storage)
            return;
        try {
            if (localLocale) {
                options.storage.setItem(LOCALE_STORAGE_KEY, localLocale);
            }
            else {
                options.storage.removeItem(LOCALE_STORAGE_KEY);
            }
        }
        catch {
            // The in-memory preference remains authoritative for this session.
        }
    };
    const translate = (key, params) => translateMessage(state.locale, key, params, options);
    return {
        getState: () => state,
        getLocale: () => state.locale,
        t: (key, params) => translate(key, params),
        translate,
        setLocalLocale(locale) {
            localLocale = isSupportedLocale(locale) ? locale : null;
            persistLocalLocale();
            return publishIfChanged();
        },
        clearLocalLocale() {
            localLocale = null;
            persistLocalLocale();
            return publishIfChanged();
        },
        setHostLocale(locale) {
            hostLocale = isSupportedLocale(locale) ? locale : null;
            return publishIfChanged();
        },
        clearHostLocale() {
            hostLocale = null;
            return publishIfChanged();
        },
        subscribe(listener) {
            listeners.add(listener);
            return () => listeners.delete(listener);
        }
    };
}
//# sourceMappingURL=locale-controller.js.map