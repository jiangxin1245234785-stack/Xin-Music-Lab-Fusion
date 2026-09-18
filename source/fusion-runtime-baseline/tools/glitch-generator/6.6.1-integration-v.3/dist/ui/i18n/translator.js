import { EN_US_MESSAGES } from './en-US.js';
import { ZH_CN_MESSAGES } from './zh-CN.js';
const DEFAULT_CATALOGS = {
    'zh-CN': ZH_CN_MESSAGES,
    'en-US': EN_US_MESSAGES
};
function interpolate(message, params) {
    if (!params)
        return message;
    return message.replace(/\{([A-Za-z0-9_]+)\}/g, (token, name) => {
        const value = params[name];
        return value === undefined ? token : String(value);
    });
}
export function translateMessage(locale, key, params, options = {}) {
    const catalogs = options.catalogs ?? DEFAULT_CATALOGS;
    const requested = catalogs[locale][key];
    if (typeof requested === 'string' && requested.length > 0) {
        return interpolate(requested, params);
    }
    const fallbackOrder = locale === 'en-US' ? ['zh-CN'] : ['en-US', 'zh-CN'];
    let resolvedLocale = null;
    let resolvedMessage;
    for (const fallbackLocale of fallbackOrder) {
        const candidate = catalogs[fallbackLocale][key];
        if (typeof candidate === 'string' && candidate.length > 0) {
            resolvedLocale = fallbackLocale;
            resolvedMessage = candidate;
            break;
        }
    }
    options.onMissingTranslation?.({
        key,
        requestedLocale: locale,
        resolvedLocale
    });
    return interpolate(resolvedMessage ?? `[${key}]`, params);
}
//# sourceMappingURL=translator.js.map