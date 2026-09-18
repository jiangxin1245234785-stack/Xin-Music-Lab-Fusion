export function createDeduplicatingMissingDescriptorHandler(handler) {
    const reported = new Set();
    return diagnostic => {
        const key = `${diagnostic.domain}:${diagnostic.id}`;
        if (reported.has(key))
            return;
        reported.add(key);
        handler(diagnostic);
    };
}
export function safeSemanticId(input) {
    if (typeof input === 'string')
        return input;
    if (input === null || input === undefined)
        return '';
    try {
        return String(input);
    }
    catch {
        return '(unprintable)';
    }
}
export function resolveSemanticDescriptor(descriptor, translator, params) {
    return Object.freeze({
        ...descriptor,
        label: translator.t(descriptor.labelKey, params),
        description: translator.t(descriptor.descriptionKey, params)
    });
}
function finite(value) {
    return Number.isFinite(value) ? value : null;
}
function fixed(value, digits) {
    const normalized = Object.is(value, -0) ? 0 : value;
    return normalized
        .toFixed(digits)
        .replace(/\.0+$/, '')
        .replace(/(\.\d*?)0+$/, '$1');
}
export function formatSemanticValue(descriptor, input, locale = 'zh-CN') {
    const value = finite(input);
    if (value === null)
        return '—';
    switch (descriptor.formatter) {
        case 'percent':
        case 'phase-percent':
            return `${fixed(value * 100, 1)}%`;
        case 'signed-percent': {
            const percent = value * 100;
            return `${percent > 0 ? '+' : ''}${fixed(percent, 1)}%`;
        }
        case 'hue-angle': {
            const turns = ((value % 1) + 1) % 1;
            return `${fixed(turns * 360, 1)}°`;
        }
        case 'multiplier':
            return `${fixed(value, 2)}×`;
        case 'degrees':
            return `${fixed(value * 180 / Math.PI, 1)}°`;
        case 'duration':
            return Math.abs(value) < 1
                ? `${fixed(value * 1000, 0)} ms`
                : `${fixed(value, 2)} s`;
        case 'milliseconds':
            return `${fixed(value, 0)} ms`;
        case 'decimal':
            return fixed(value, 3);
        case 'integer':
            return fixed(Math.round(value), 0);
        case 'boolean':
            return value >= 0.5
                ? locale === 'zh-CN' ? '开' : 'On'
                : locale === 'zh-CN' ? '关' : 'Off';
        case 'raw':
            return String(value);
    }
}
//# sourceMappingURL=types.js.map