import { CURRENT_ENGINE_VERSION, CURRENT_SCHEMA_VERSION } from '../preset/version.js';
const encoder = new TextEncoder();
function finite(value, fallback = 0) {
    return Number.isFinite(value) ? value : fallback;
}
function normalizeLogValue(value, seen, depth = 0) {
    if (value === null ||
        typeof value === 'string' ||
        typeof value === 'boolean') {
        return value;
    }
    if (typeof value === 'number') {
        return Number.isFinite(value) ? value : String(value);
    }
    if (typeof value === 'bigint')
        return `${value.toString()}n`;
    if (typeof value === 'undefined')
        return '[undefined]';
    if (typeof value === 'function')
        return `[Function ${value.name || 'anonymous'}]`;
    if (typeof value === 'symbol')
        return value.toString();
    if (value instanceof Error) {
        return {
            name: value.name,
            message: value.message,
            stack: value.stack ?? ''
        };
    }
    if (typeof value !== 'object')
        return String(value);
    if (seen.has(value))
        return '[Circular]';
    if (depth >= 4)
        return '[MaxDepth]';
    seen.add(value);
    if (Array.isArray(value)) {
        return value.slice(0, 50).map(item => normalizeLogValue(item, seen, depth + 1));
    }
    const output = {};
    for (const key of Object.keys(value).sort().slice(0, 50)) {
        try {
            output[key] = normalizeLogValue(value[key], seen, depth + 1);
        }
        catch {
            output[key] = '[Unreadable]';
        }
    }
    return output;
}
function normalizeLogArguments(args) {
    const seen = new WeakSet();
    return Object.freeze(args.slice(0, 50).map(value => normalizeLogValue(value, seen)));
}
export class DebugConsoleLogBuffer {
    capacity;
    entries = [];
    nextSequence = 1;
    constructor(capacity = 200) {
        this.capacity = capacity;
        if (!Number.isInteger(capacity) || capacity <= 0) {
            throw new Error(`Invalid debug log capacity: ${String(capacity)}`);
        }
    }
    record(engineTimeMs, level, args) {
        const entry = Object.freeze({
            sequence: this.nextSequence++,
            engineTimeMs: Math.max(0, finite(engineTimeMs)),
            level,
            arguments: normalizeLogArguments(args)
        });
        this.entries.push(entry);
        if (this.entries.length > this.capacity) {
            this.entries.splice(0, this.entries.length - this.capacity);
        }
        return entry;
    }
    list() {
        return this.entries.map(entry => Object.freeze({
            ...entry,
            arguments: normalizeLogArguments(entry.arguments)
        }));
    }
    clear() {
        this.entries.length = 0;
        this.nextSequence = 1;
    }
}
export function installConsoleLogCapture(target, buffer, engineTimeProvider) {
    const levels = Object.freeze([
        'debug',
        'info',
        'log',
        'warn',
        'error'
    ]);
    const originals = new Map();
    for (const level of levels) {
        const original = target[level].bind(target);
        originals.set(level, original);
        target[level] = (...args) => {
            buffer.record(engineTimeProvider(), level, args);
            original(...args);
        };
    }
    let restored = false;
    return () => {
        if (restored)
            return;
        restored = true;
        for (const level of levels) {
            const original = originals.get(level);
            if (original)
                target[level] = original;
        }
    };
}
function stableJson(value) {
    return `${JSON.stringify(value, null, 2)}\n`;
}
function jsonEntry(name, value) {
    return Object.freeze({ name, bytes: encoder.encode(stableJson(value)) });
}
function crc32(bytes) {
    let crc = 0xffffffff;
    for (const value of bytes) {
        crc ^= value;
        for (let bit = 0; bit < 8; bit += 1) {
            crc = (crc >>> 1) ^ (crc & 1 ? 0xedb88320 : 0);
        }
    }
    return (crc ^ 0xffffffff) >>> 0;
}
function writeUint16(target, offset, value) {
    new DataView(target.buffer, target.byteOffset, target.byteLength)
        .setUint16(offset, value, true);
}
function writeUint32(target, offset, value) {
    new DataView(target.buffer, target.byteOffset, target.byteLength)
        .setUint32(offset, value >>> 0, true);
}
function concatenate(parts) {
    const output = new Uint8Array(parts.reduce((total, part) => total + part.byteLength, 0));
    let offset = 0;
    for (const part of parts) {
        output.set(part, offset);
        offset += part.byteLength;
    }
    return output;
}
export function encodeDebugBundleZip(entries) {
    const localParts = [];
    const centralParts = [];
    let localOffset = 0;
    for (const entry of entries) {
        const name = encoder.encode(entry.name);
        const checksum = crc32(entry.bytes);
        const local = new Uint8Array(30 + name.byteLength);
        writeUint32(local, 0, 0x04034b50);
        writeUint16(local, 4, 20);
        writeUint16(local, 6, 0x0800);
        writeUint16(local, 8, 0);
        writeUint16(local, 10, 0);
        writeUint16(local, 12, 0x0021);
        writeUint32(local, 14, checksum);
        writeUint32(local, 18, entry.bytes.byteLength);
        writeUint32(local, 22, entry.bytes.byteLength);
        writeUint16(local, 26, name.byteLength);
        writeUint16(local, 28, 0);
        local.set(name, 30);
        localParts.push(local, entry.bytes);
        const central = new Uint8Array(46 + name.byteLength);
        writeUint32(central, 0, 0x02014b50);
        writeUint16(central, 4, 20);
        writeUint16(central, 6, 20);
        writeUint16(central, 8, 0x0800);
        writeUint16(central, 10, 0);
        writeUint16(central, 12, 0);
        writeUint16(central, 14, 0x0021);
        writeUint32(central, 16, checksum);
        writeUint32(central, 20, entry.bytes.byteLength);
        writeUint32(central, 24, entry.bytes.byteLength);
        writeUint16(central, 28, name.byteLength);
        writeUint16(central, 30, 0);
        writeUint16(central, 32, 0);
        writeUint16(central, 34, 0);
        writeUint16(central, 36, 0);
        writeUint32(central, 38, 0);
        writeUint32(central, 42, localOffset);
        central.set(name, 46);
        centralParts.push(central);
        localOffset += local.byteLength + entry.bytes.byteLength;
    }
    const centralDirectory = concatenate(centralParts);
    const end = new Uint8Array(22);
    writeUint32(end, 0, 0x06054b50);
    writeUint16(end, 4, 0);
    writeUint16(end, 6, 0);
    writeUint16(end, 8, entries.length);
    writeUint16(end, 10, entries.length);
    writeUint32(end, 12, centralDirectory.byteLength);
    writeUint32(end, 16, localOffset);
    writeUint16(end, 20, 0);
    return concatenate([...localParts, centralDirectory, end]);
}
export function buildDebugBundle(input) {
    const payloadEntries = [
        jsonEntry('preset.json', input.preset),
        jsonEntry('snapshot-state.json', input.snapshotState),
        jsonEntry('audio-feature-sample.json', input.audioFeatureSample),
        jsonEntry('mapping-contributions.json', input.mappingContributions),
        jsonEntry('target-final-values.json', input.targetFinalValues),
        jsonEntry('energy-budget-state.json', input.energyBudgetState),
        jsonEntry('safety-limiter-state.json', input.safetyLimiterState),
        jsonEntry('shader-pass-config.json', input.shaderPassConfig),
        Object.freeze({
            name: 'screenshot.png',
            bytes: new Uint8Array(input.screenshotPng)
        }),
        jsonEntry('console-logs.json', input.consoleLogs),
        jsonEntry('engine.json', input.engine)
    ];
    const manifest = Object.freeze({
        formatVersion: 1,
        engineVersion: CURRENT_ENGINE_VERSION,
        schemaVersion: CURRENT_SCHEMA_VERSION,
        exportedAtEngineTimeMs: Math.max(0, finite(input.engine.engineTimeMs)),
        clockMode: input.engine.clockMode,
        presetSeed: input.engine.presetSeed,
        sessionSeed: input.engine.sessionSeed,
        files: Object.freeze([
            'manifest.json',
            ...payloadEntries.map(entry => entry.name)
        ])
    });
    const entries = Object.freeze([
        jsonEntry('manifest.json', manifest),
        ...payloadEntries
    ]);
    return Object.freeze({
        manifest,
        entries,
        archive: encodeDebugBundleZip(entries)
    });
}
//# sourceMappingURL=debug-bundle.js.map