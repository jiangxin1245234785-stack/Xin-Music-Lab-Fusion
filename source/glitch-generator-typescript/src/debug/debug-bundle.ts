import {
  CURRENT_ENGINE_VERSION,
  CURRENT_SCHEMA_VERSION
} from '../preset/version.js';

export type DebugConsoleLevel =
  'debug' | 'info' | 'log' | 'warn' | 'error';

export interface DebugConsoleEntry {
  readonly sequence: number;
  readonly engineTimeMs: number;
  readonly level: DebugConsoleLevel;
  readonly arguments: readonly unknown[];
}

export interface DebugBundleEngineState {
  readonly presetSeed: number;
  readonly sessionSeed: number;
  readonly clockMode: string;
  readonly engineTimeMs: number;
}

export interface DebugBundleInput {
  readonly preset: unknown;
  readonly snapshotState: unknown;
  readonly audioFeatureSample: unknown;
  readonly mappingContributions: unknown;
  readonly targetFinalValues: unknown;
  readonly energyBudgetState: unknown;
  readonly safetyLimiterState: unknown;
  readonly shaderPassConfig: unknown;
  readonly screenshotPng: Uint8Array;
  readonly consoleLogs: readonly DebugConsoleEntry[];
  readonly engine: DebugBundleEngineState;
}

export interface DebugBundleEntry {
  readonly name: string;
  readonly bytes: Uint8Array;
}

export interface DebugBundleManifest {
  readonly formatVersion: 1;
  readonly engineVersion: string;
  readonly schemaVersion: number;
  readonly exportedAtEngineTimeMs: number;
  readonly clockMode: string;
  readonly presetSeed: number;
  readonly sessionSeed: number;
  readonly files: readonly string[];
}

export interface DebugBundle {
  readonly manifest: DebugBundleManifest;
  readonly entries: readonly DebugBundleEntry[];
  readonly archive: Uint8Array;
}

type ConsoleMethod = (...args: unknown[]) => void;

export interface ConsoleCaptureTarget {
  debug: ConsoleMethod;
  info: ConsoleMethod;
  log: ConsoleMethod;
  warn: ConsoleMethod;
  error: ConsoleMethod;
}

const encoder = new TextEncoder();

function finite(value: number, fallback = 0): number {
  return Number.isFinite(value) ? value : fallback;
}

function normalizeLogValue(
  value: unknown,
  seen: WeakSet<object>,
  depth = 0
): unknown {
  if (
    value === null ||
    typeof value === 'string' ||
    typeof value === 'boolean'
  ) {
    return value;
  }
  if (typeof value === 'number') {
    return Number.isFinite(value) ? value : String(value);
  }
  if (typeof value === 'bigint') return `${value.toString()}n`;
  if (typeof value === 'undefined') return '[undefined]';
  if (typeof value === 'function') return `[Function ${value.name || 'anonymous'}]`;
  if (typeof value === 'symbol') return value.toString();
  if (value instanceof Error) {
    return {
      name: value.name,
      message: value.message,
      stack: value.stack ?? ''
    };
  }
  if (typeof value !== 'object') return String(value);
  if (seen.has(value)) return '[Circular]';
  if (depth >= 4) return '[MaxDepth]';
  seen.add(value);
  if (Array.isArray(value)) {
    return value.slice(0, 50).map(
      item => normalizeLogValue(item, seen, depth + 1)
    );
  }
  const output: Record<string, unknown> = {};
  for (const key of Object.keys(value).sort().slice(0, 50)) {
    try {
      output[key] = normalizeLogValue(
        (value as Record<string, unknown>)[key],
        seen,
        depth + 1
      );
    } catch {
      output[key] = '[Unreadable]';
    }
  }
  return output;
}

function normalizeLogArguments(args: readonly unknown[]): readonly unknown[] {
  const seen = new WeakSet<object>();
  return Object.freeze(
    args.slice(0, 50).map(value => normalizeLogValue(value, seen))
  );
}

export class DebugConsoleLogBuffer {
  private readonly entries: DebugConsoleEntry[] = [];
  private nextSequence = 1;

  constructor(readonly capacity = 200) {
    if (!Number.isInteger(capacity) || capacity <= 0) {
      throw new Error(`Invalid debug log capacity: ${String(capacity)}`);
    }
  }

  record(
    engineTimeMs: number,
    level: DebugConsoleLevel,
    args: readonly unknown[]
  ): DebugConsoleEntry {
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

  list(): readonly DebugConsoleEntry[] {
    return this.entries.map(entry => Object.freeze({
      ...entry,
      arguments: normalizeLogArguments(entry.arguments)
    }));
  }

  clear(): void {
    this.entries.length = 0;
    this.nextSequence = 1;
  }
}

export function installConsoleLogCapture(
  target: ConsoleCaptureTarget,
  buffer: DebugConsoleLogBuffer,
  engineTimeProvider: () => number
): () => void {
  const levels = Object.freeze([
    'debug',
    'info',
    'log',
    'warn',
    'error'
  ] as const);
  const originals = new Map<DebugConsoleLevel, ConsoleMethod>();
  for (const level of levels) {
    const original = target[level].bind(target);
    originals.set(level, original);
    target[level] = (...args: unknown[]): void => {
      buffer.record(engineTimeProvider(), level, args);
      original(...args);
    };
  }
  let restored = false;
  return (): void => {
    if (restored) return;
    restored = true;
    for (const level of levels) {
      const original = originals.get(level);
      if (original) target[level] = original;
    }
  };
}

function stableJson(value: unknown): string {
  return `${JSON.stringify(value, null, 2)}\n`;
}

function jsonEntry(name: string, value: unknown): DebugBundleEntry {
  return Object.freeze({ name, bytes: encoder.encode(stableJson(value)) });
}

function crc32(bytes: Uint8Array): number {
  let crc = 0xffffffff;
  for (const value of bytes) {
    crc ^= value;
    for (let bit = 0; bit < 8; bit += 1) {
      crc = (crc >>> 1) ^ (crc & 1 ? 0xedb88320 : 0);
    }
  }
  return (crc ^ 0xffffffff) >>> 0;
}

function writeUint16(target: Uint8Array, offset: number, value: number): void {
  new DataView(target.buffer, target.byteOffset, target.byteLength)
    .setUint16(offset, value, true);
}

function writeUint32(target: Uint8Array, offset: number, value: number): void {
  new DataView(target.buffer, target.byteOffset, target.byteLength)
    .setUint32(offset, value >>> 0, true);
}

function concatenate(parts: readonly Uint8Array[]): Uint8Array {
  const output = new Uint8Array(parts.reduce(
    (total, part) => total + part.byteLength,
    0
  ));
  let offset = 0;
  for (const part of parts) {
    output.set(part, offset);
    offset += part.byteLength;
  }
  return output;
}

export function encodeDebugBundleZip(
  entries: readonly DebugBundleEntry[]
): Uint8Array {
  const localParts: Uint8Array[] = [];
  const centralParts: Uint8Array[] = [];
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

export function buildDebugBundle(input: DebugBundleInput): DebugBundle {
  const payloadEntries: DebugBundleEntry[] = [
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
  const manifest: DebugBundleManifest = Object.freeze({
    formatVersion: 1,
    engineVersion: CURRENT_ENGINE_VERSION,
    schemaVersion: CURRENT_SCHEMA_VERSION,
    exportedAtEngineTimeMs: Math.max(
      0,
      finite(input.engine.engineTimeMs)
    ),
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
