import { SURFACE_TRANSLATIONS } from './surface-catalog.js';
import { DYNAMIC_SURFACE_TRANSLATIONS } from './surface-dynamic-catalog.js';
import { EN_US_SEMANTIC_MESSAGES } from './semantic-en-US.js';
import { ZH_CN_SEMANTIC_MESSAGES } from './semantic-zh-CN.js';
const TRANSLATABLE_ATTRIBUTES = [
    'aria-label',
    'placeholder',
    'title'
];
function translateKnownSurfaceSegment(value) {
    const normalized = normalizeSurfaceText(value);
    return DYNAMIC_SURFACE_TRANSLATIONS[normalized] ??
        SURFACE_TRANSLATIONS[normalized] ??
        value;
}
const ZH_PATTERNS = [
    {
        expression: /^Node Output: (.+)$/i,
        render: label => `节点输出：${label}`
    },
    {
        expression: /^Unknown Source: (.+)$/i,
        render: id => `未知声音信号：${id}`
    },
    {
        expression: /^Custom GLSL: (.+)$/i,
        render: label => `自定义 GLSL：${label}`
    },
    {
        expression: /^Unknown Visual Target: (.+)$/i,
        render: id => `未知画面目标：${id}`
    },
    {
        expression: /^(\d+) EVENTS?$/i,
        render: count => `${count} 个事件`
    },
    {
        expression: /^(\d+) snapshots?$/i,
        render: count => `${count} 个快照`
    },
    {
        expression: /^(\d+) TARGETS?$/i,
        render: count => `${count} 个目标`
    },
    {
        expression: /^(\d+) PROBES?$/i,
        render: count => `${count} 个探针`
    },
    {
        expression: /^(\d+) PASSES?$/i,
        render: count => `${count} 个画面算法阶段`
    },
    {
        expression: /^(\d+) nodes · (\d+) edges$/i,
        render: (nodes, edges) => `${nodes} 个节点 · ${edges} 条连接`
    },
    {
        expression: /^(\d+) MAPPINGS · (\d+) CORE NODES$/i,
        render: (mappings, nodes) => `${mappings} 条映射 · ${nodes} 个核心节点`
    },
    {
        expression: /^REVISION (\d+)$/i,
        render: revision => `修订 ${revision}`
    },
    {
        expression: /^APPLIED · REVISION (\d+)$/i,
        render: revision => `已应用 · 修订 ${revision}`
    },
    {
        expression: /^REJECTED · LIVE REVISION (\d+)$/i,
        render: revision => `已拒绝 · 当前修订 ${revision}`
    },
    {
        expression: /^FBO (\d+)\/2 · ([^·]+) · ENGINE ([\d.]+) ms$/i,
        render: (surface, size, time) => `帧缓冲 ${surface}/2 · ${size.trim()} · 引擎 ${time} ms`
    },
    {
        expression: /^(\d+)% OF BUDGET$/i,
        render: value => `已使用预算的 ${value}%`
    },
    {
        expression: /^(\d+)% PASSIVE$/i,
        render: value => `被动监测 ${value}%`
    },
    {
        expression: /^(\d+)% OVER BUDGET$/i,
        render: value => `超出预算帧 ${value}%`
    },
    {
        expression: /^INVALID · (\d+) ERROR$/i,
        render: count => `无效 · ${count} 个错误`
    },
    {
        expression: /^VALID · (\d+) WARNING$/i,
        render: count => `有效 · ${count} 个警告`
    },
    {
        expression: /^Schema (\d+) · all validation checks passed\.$/i,
        render: version => `Schema ${version} · 全部校验通过。`
    },
    {
        expression: /^CAPTURED · (.+)$/i,
        render: id => `已捕获 · ${id}`
    },
    {
        expression: /^RESTORED · (.+)$/i,
        render: id => `已恢复 · ${id}`
    },
    {
        expression: /^DELETED · (.+)$/i,
        render: id => `已删除 · ${id}`
    },
    {
        expression: /^PROMOTED · (.+)$/i,
        render: name => `已提升为预设 · ${name}`
    },
    {
        expression: /^RECORDED · (.+)$/i,
        render: label => `已记录 · ${translateKnownSurfaceSegment(label)}`
    },
    {
        expression: /^UNDO · (.+)$/i,
        render: label => `撤销 · ${translateKnownSurfaceSegment(label)}`
    },
    {
        expression: /^REDO · (.+)$/i,
        render: label => `重做 · ${translateKnownSurfaceSegment(label)}`
    },
    {
        expression: /^EDITING · (.+)$/i,
        render: key => `正在编辑 · ${translateKnownSurfaceSegment(key)}`
    },
    {
        expression: /^MANUAL · (.+)$/i,
        render: value => `手动 · ${translateKnownSurfaceSegment(value)}`
    },
    {
        expression: /^FALLBACK · (.+)$/i,
        render: value => `回退 · ${translateKnownSurfaceSegment(value)}`
    },
    {
        expression: /^ACTIVE · (.+)$/i,
        render: value => `已介入 · ${translateKnownSurfaceSegment(value)}`
    },
    {
        expression: /^(.+) · UNREGISTERED$/i,
        render: id => `${id} · 未注册`
    },
    {
        expression: /^(.+) live waveform$/i,
        render: id => `${id} 实时波形`
    },
    {
        expression: /^Move (.+) (up|down)$/i,
        render: (label, direction) => `${direction.toLowerCase() === 'up' ? '上移' : '下移'} ${label}`
    },
    {
        expression: /^Observed (.+) dynamics ([\d.]+)\.$/i,
        render: (source, value) => `观测到 ${source} 的动态值为 ${value}。`
    },
    {
        expression: /^(.+) loaded\. Compile is pending; live pass is unchanged\.$/i,
        render: file => `${file} 已载入。等待编译；当前画面算法尚未改变。`
    },
    {
        expression: /^(.+) loaded\. Live pass is unchanged until compile succeeds\.$/i,
        render: label => `${label} 已载入。编译成功前不会改变当前画面算法。`
    },
    {
        expression: /^Disconnected (.+) → (.+)\.$/i,
        render: (source, target) => `已断开 ${source} → ${target}。`
    },
    {
        expression: /^Created (.+)\.$/i,
        render: id => `已创建 ${id}。`
    },
    {
        expression: /^Deleted (.+)\.$/i,
        render: id => `已删除 ${id}。`
    },
    {
        expression: /^(.+) removed from the preset registry\.$/i,
        render: id => `${id} 已从预设注册表移除。`
    },
    {
        expression: /^(.+) registered as a mappable target\.$/i,
        render: id => `${id} 已注册为可映射目标。`
    },
    {
        expression: /^(.+) Live state remains unchanged\.$/i,
        render: prefix => `${prefix} 当前运行状态保持不变。`
    },
    {
        expression: /^IMPACT ([\d.]+)$/i,
        render: value => `影响权重 ${value}`
    },
    {
        expression: /^Change (.+) energy weight$/i,
        render: label => `更改 ${label} 的能量权重`
    },
    {
        expression: /^AMOUNT ([\d.-]+)(?: ·)?$/i,
        render: value => `作用量 ${value}`
    },
    {
        expression: /^(\d+) MOD$/i,
        render: count => `${count} 个调制器`
    },
    {
        expression: /^([\d.]+) s · (\d+) samples$/i,
        render: (seconds, samples) => `${seconds} 秒 · ${samples} 个样本`
    },
    {
        expression: /^(.+) ACTIVE · EDITS STAY IN (.+)$/i,
        render: (active, destination) => `${active} 已激活 · 编辑仅保留在 ${destination}`
    },
    {
        expression: /^AVG ([\d.]+) · PEAK ([\d.]+) · LAST ([\d.]+) ms$/i,
        render: (average, peak, last) => `平均 ${average} · 峰值 ${peak} · 最近 ${last} ms`
    },
    {
        expression: /^(\d+) files(?: ·)?$/i,
        render: count => `${count} 个文件`
    },
    {
        expression: /^engine ([\d]+:[\d.]+)$/i,
        render: time => `引擎时间 ${time}`
    },
    {
        expression: /^recovery point (\d+)$/i,
        render: sequence => `恢复点 ${sequence}`
    },
    {
        expression: /^Session (\d+) ended unexpectedly\. (.+) was saved at engine ([\d]+:[\d.]+) with (\d+) snapshots\. Restore or discard before new autosaves can replace it\.$/i,
        render: (session, preset, time, snapshots) => `会话 ${session} 意外结束。${preset} 已在引擎时间 ${time} 保存，包含 ${snapshots} 个快照。请恢复或丢弃，以免被新的自动存档覆盖。`
    },
    {
        expression: /^(.+) Current session (\d+) can continue with a fresh recovery point\.$/i,
        render: (warning, session) => `${warning} 当前会话 ${session} 可以使用新的恢复点继续。`
    },
    {
        expression: /^Session (\d+) is protected\. Edits save at transaction boundaries and every 5\.0 engine seconds\.$/i,
        render: session => `会话 ${session} 已受保护。编辑会在事务边界以及每 5.0 引擎秒保存。`
    },
    {
        expression: /^Session (\d+) ended unexpectedly\.$/i,
        render: session => `会话 ${session} 意外结束。`
    },
    {
        expression: /^(.+) was saved at engine$/i,
        render: preset => `${preset} 已保存于引擎时间`
    },
    {
        expression: /^([\d:.-]+) with$/i,
        render: time => `${time}，包含`
    },
    {
        expression: /^(\d+) snapshots\. Restore or discard$/i,
        render: count => `${count} 个快照。请恢复或丢弃`
    },
    {
        expression: /^(.+) Current session (\d+) can$/i,
        render: (warning, session) => `${warning} 当前会话 ${session} 可以`
    },
    {
        expression: /^Session (\d+) is protected\. Edits save at$/i,
        render: session => `会话 ${session} 已受保护。编辑会保存于`
    }
];
const ENGLISH_LETTER = /[A-Za-z]{2,}/;
const TECHNICAL_ONLY = /^(?:[A-Z0-9_.:+/\-]+|(?:audio|state|confidence|visual|glsl|node):?[A-Za-z0-9_.:\-]+)$/;
export function normalizeSurfaceText(value) {
    return value.trim().replace(/\s+/g, ' ');
}
const SEMANTIC_TRANSLATIONS = Object.freeze(Object.fromEntries(Object.entries(EN_US_SEMANTIC_MESSAGES).map(([key, english]) => [
    normalizeSurfaceText(english),
    normalizeSurfaceText(ZH_CN_SEMANTIC_MESSAGES[key] ?? english)
])));
const ALL_SURFACE_TRANSLATIONS = Object.freeze({
    ...SURFACE_TRANSLATIONS,
    ...DYNAMIC_SURFACE_TRANSLATIONS,
    ...SEMANTIC_TRANSLATIONS
});
const REVERSE_TRANSLATIONS = Object.freeze(Object.fromEntries(Object.entries(ALL_SURFACE_TRANSLATIONS).map(([english, chinese]) => [
    normalizeSurfaceText(chinese),
    english
])));
function canonicalEnglish(value) {
    const normalized = normalizeSurfaceText(value);
    return REVERSE_TRANSLATIONS[normalized] ?? normalized;
}
function translatePattern(value) {
    for (const pattern of ZH_PATTERNS) {
        const match = pattern.expression.exec(value);
        if (match)
            return pattern.render(...match.slice(1));
    }
    return null;
}
export function translateSurfaceText(locale, value) {
    const normalized = normalizeSurfaceText(value);
    const segments = normalized.split(' · ').map(canonicalEnglish);
    const english = segments.join(' · ');
    if (locale === 'en-US')
        return english;
    const whole = ALL_SURFACE_TRANSLATIONS[english] ?? translatePattern(english);
    if (whole)
        return whole;
    if (segments.length > 1) {
        return segments.map(segment => ALL_SURFACE_TRANSLATIONS[segment] ?? translatePattern(segment) ?? segment).join(' · ');
    }
    return english;
}
function isTechnicalOnly(value) {
    return TECHNICAL_ONLY.test(value) ||
        /^(?:WebGL2|GLSL|FBO|RGB|JSON|DAG|LFO|FX Rack)$/i.test(value);
}
function collectUnresolvedEnglish(root) {
    const unresolved = new Set();
    const walker = root.ownerDocument?.createTreeWalker(root, NodeFilter.SHOW_TEXT);
    if (!walker)
        return [];
    let node = walker.nextNode();
    while (node) {
        const text = normalizeSurfaceText(node.textContent ?? '');
        const parent = node.parentElement;
        if (text &&
            ENGLISH_LETTER.test(text) &&
            !isTechnicalOnly(text) &&
            !parent?.closest('.locale-control, script, style, pre, code') &&
            translateSurfaceText('zh-CN', text) === text) {
            unresolved.add(text);
        }
        node = walker.nextNode();
    }
    return [...unresolved].sort();
}
function preserveOuterWhitespace(source, translated) {
    const leading = source.match(/^\s*/)?.[0] ?? '';
    const trailing = source.match(/\s*$/)?.[0] ?? '';
    return `${leading}${translated}${trailing}`;
}
export function mountLocalizedSurface(controller, root) {
    const textSources = new WeakMap();
    const attributeSources = new WeakMap();
    let stats = {
        translatedTextNodes: 0,
        translatedAttributes: 0,
        unresolvedEnglish: []
    };
    let disposed = false;
    let observer = null;
    const shouldSkip = (element) => Boolean(element?.closest('.locale-control, script, style, [data-i18n-raw]'));
    const localizeTextNode = (node, locale, updateSource) => {
        if (shouldSkip(node.parentElement))
            return 0;
        const current = node.textContent ?? '';
        if (!normalizeSurfaceText(current))
            return 0;
        if (updateSource || !textSources.has(node))
            textSources.set(node, current);
        const source = textSources.get(node) ?? current;
        const translated = translateSurfaceText(locale, source);
        const next = preserveOuterWhitespace(source, translated);
        if (next === current)
            return 0;
        node.textContent = next;
        return 1;
    };
    const localizeAttributes = (element, locale, updateSource, changedAttribute) => {
        if (shouldSkip(element))
            return 0;
        let translatedCount = 0;
        const sources = attributeSources.get(element) ?? new Map();
        attributeSources.set(element, sources);
        for (const attribute of TRANSLATABLE_ATTRIBUTES) {
            if (changedAttribute && changedAttribute !== attribute)
                continue;
            const current = element.getAttribute(attribute);
            if (!current)
                continue;
            if (updateSource || !sources.has(attribute))
                sources.set(attribute, current);
            const source = sources.get(attribute) ?? current;
            const translated = translateSurfaceText(locale, source);
            if (translated !== current) {
                element.setAttribute(attribute, translated);
                translatedCount += 1;
            }
        }
        return translatedCount;
    };
    const localizeSubtree = (target, locale, updateSource) => {
        let translatedTextNodes = 0;
        let translatedAttributes = 0;
        if (target.nodeType === Node.TEXT_NODE) {
            translatedTextNodes += localizeTextNode(target, locale, updateSource);
            return { translatedTextNodes, translatedAttributes };
        }
        if (!(target instanceof Element) && target !== root) {
            return { translatedTextNodes, translatedAttributes };
        }
        if (target instanceof Element) {
            translatedAttributes += localizeAttributes(target, locale, updateSource);
            if (shouldSkip(target))
                return { translatedTextNodes, translatedAttributes };
        }
        const owner = target.ownerDocument ?? root.ownerDocument;
        const walker = owner?.createTreeWalker(target, NodeFilter.SHOW_ELEMENT | NodeFilter.SHOW_TEXT);
        if (!walker)
            return { translatedTextNodes, translatedAttributes };
        let node = walker.nextNode();
        while (node) {
            if (node.nodeType === Node.TEXT_NODE) {
                translatedTextNodes += localizeTextNode(node, locale, updateSource);
            }
            else if (node instanceof Element) {
                translatedAttributes += localizeAttributes(node, locale, updateSource);
            }
            node = walker.nextNode();
        }
        return { translatedTextNodes, translatedAttributes };
    };
    const observe = () => {
        if (!observer || disposed)
            return;
        observer.observe(root, {
            subtree: true,
            childList: true,
            characterData: true,
            attributes: true,
            attributeFilter: [...TRANSLATABLE_ATTRIBUTES]
        });
    };
    const render = (state, updateSource) => {
        observer?.disconnect();
        const translated = localizeSubtree(root, state.locale, updateSource);
        stats = {
            ...translated,
            unresolvedEnglish: state.locale === 'zh-CN' ? collectUnresolvedEnglish(root) : []
        };
        observe();
        return stats;
    };
    if (typeof MutationObserver !== 'undefined') {
        observer = new MutationObserver(records => {
            observer?.disconnect();
            let translatedTextNodes = 0;
            let translatedAttributes = 0;
            const locale = controller.getLocale();
            for (const record of records) {
                if (record.type === 'characterData') {
                    translatedTextNodes += localizeTextNode(record.target, locale, true);
                }
                else if (record.type === 'attributes') {
                    translatedAttributes += localizeAttributes(record.target, locale, true, record.attributeName);
                }
                else {
                    for (const node of Array.from(record.addedNodes)) {
                        const translated = localizeSubtree(node, locale, true);
                        translatedTextNodes += translated.translatedTextNodes;
                        translatedAttributes += translated.translatedAttributes;
                    }
                }
            }
            stats = {
                translatedTextNodes,
                translatedAttributes,
                // Keep the last explicit full-surface audit here. Dynamic meters and
                // diagnostics mutate every frame; rescanning the complete Demo DOM for
                // each MutationObserver batch made the Chinese presentation path do
                // substantially more work than English. `render()` (locale changes)
                // and the public `refresh()` remain the authoritative full audits,
                // while frame updates localize only the nodes present in this batch.
                unresolvedEnglish: locale === 'zh-CN'
                    ? stats.unresolvedEnglish
                    : []
            };
            observe();
        });
    }
    const unsubscribe = controller.subscribe(state => {
        render(state, false);
    });
    render(controller.getState(), true);
    return {
        refresh: () => render(controller.getState(), false),
        getStats: () => stats,
        dispose() {
            disposed = true;
            unsubscribe();
            observer?.disconnect();
        }
    };
}
//# sourceMappingURL=surface-dom-adapter.js.map