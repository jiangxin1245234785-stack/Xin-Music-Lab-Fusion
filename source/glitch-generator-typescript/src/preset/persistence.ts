import {
  createSnapshot,
  createVisualTargetState
} from '../schema/defaults.js';
import type {
  Preset,
  ResolvedPreset,
  ResolvedSnapshot,
  Snapshot,
  VisualTargetState
} from '../schema/types.js';
import { loadPreset } from './migrations.js';
import { loadValidatedPreset } from './validation.js';

export const DEFAULT_PRESET_STORAGE_KEY = 'gmg.phase1.preset';
export const DEFAULT_CUSTOM_PRESET_STORAGE_KEY =
  'gmg.phase2.custom-presets';

export interface PresetStorage {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
}

export interface SnapshotCaptureInput {
  readonly id?: string;
  readonly name?: string;
  readonly engineTimeMs?: number;
  readonly note?: string;
  readonly thumbnail?: string;
  readonly preset: Preset;
  readonly targetState: VisualTargetState;
}

function assertPresetObject(value: unknown): Preset {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    throw new Error('Stored preset must be a JSON object');
  }
  return value as Preset;
}

export function serializePreset(input: Preset): string {
  return JSON.stringify(loadValidatedPreset(input));
}

export function deserializePreset(serialized: string): ResolvedPreset {
  return loadValidatedPreset(deserializePresetInput(serialized));
}

export function deserializePresetInput(serialized: string): Preset {
  let parsed: unknown;
  try {
    parsed = JSON.parse(serialized);
  } catch {
    throw new Error('Stored preset contains invalid JSON');
  }
  return assertPresetObject(parsed);
}

export function savePresetToStorage(
  storage: PresetStorage,
  preset: Preset,
  key = DEFAULT_PRESET_STORAGE_KEY
): ResolvedPreset {
  const resolved = loadValidatedPreset(preset);
  storage.setItem(key, serializePreset(resolved));
  return resolved;
}

export function loadPresetFromStorage(
  storage: PresetStorage,
  key = DEFAULT_PRESET_STORAGE_KEY
): ResolvedPreset {
  const serialized = storage.getItem(key);
  if (serialized === null) {
    throw new Error(`No saved preset at storage key: ${key}`);
  }
  return deserializePreset(serialized);
}

export function loadPresetInputFromStorage(
  storage: PresetStorage,
  key = DEFAULT_PRESET_STORAGE_KEY
): Preset {
  const serialized = storage.getItem(key);
  if (serialized === null) {
    throw new Error(`No saved preset at storage key: ${key}`);
  }
  return deserializePresetInput(serialized);
}

export function captureSnapshot(
  input: SnapshotCaptureInput
): ResolvedSnapshot {
  const snapshot: Snapshot = {
    preset: loadPreset(input.preset),
    targetState: createVisualTargetState(input.targetState)
  };
  if (input.id !== undefined) snapshot.id = input.id;
  if (input.name !== undefined) snapshot.name = input.name;
  if (input.engineTimeMs !== undefined) {
    snapshot.engineTimeMs = input.engineTimeMs;
  }
  if (input.note !== undefined) snapshot.note = input.note;
  if (input.thumbnail !== undefined) snapshot.thumbnail = input.thumbnail;
  return createSnapshot(snapshot);
}

export function restoreSnapshot(input: Snapshot): ResolvedSnapshot {
  return createSnapshot({
    ...input,
    preset: loadPreset(input.preset ?? {})
  });
}

function assertPresetArray(value: unknown): readonly Preset[] {
  if (!Array.isArray(value)) {
    throw new Error('Stored custom presets must be a JSON array');
  }
  return value.map(assertPresetObject);
}

export function serializePresetLibrary(
  presets: readonly Preset[]
): string {
  return JSON.stringify(presets.map(preset => loadValidatedPreset(preset)));
}

export function deserializePresetLibrary(
  serialized: string
): readonly ResolvedPreset[] {
  let parsed: unknown;
  try {
    parsed = JSON.parse(serialized);
  } catch {
    throw new Error('Stored custom presets contain invalid JSON');
  }
  return assertPresetArray(parsed).map(preset => loadValidatedPreset(preset));
}

export function loadCustomPresetsFromStorage(
  storage: PresetStorage,
  key = DEFAULT_CUSTOM_PRESET_STORAGE_KEY
): readonly ResolvedPreset[] {
  const serialized = storage.getItem(key);
  return serialized === null ? [] : deserializePresetLibrary(serialized);
}

export function saveCustomPresetToStorage(
  storage: PresetStorage,
  preset: Preset,
  key = DEFAULT_CUSTOM_PRESET_STORAGE_KEY
): ResolvedPreset {
  const existing = [...loadCustomPresetsFromStorage(storage, key)];
  const fallbackId = `custom-preset-${existing.length + 1}`;
  const resolved = loadValidatedPreset({
    ...preset,
    id: preset.id?.trim() || fallbackId
  });
  const index = existing.findIndex(item => item.id === resolved.id);
  if (index >= 0) existing[index] = resolved;
  else existing.push(resolved);
  storage.setItem(key, serializePresetLibrary(existing));
  return resolved;
}
