import { createAudioFeatureFrame } from '../schema/defaults.js';
import type { AudioFeatureFrame } from '../schema/types.js';

export type DebugEventType =
  | 'onset'
  | 'bassPeak'
  | 'sectionBoundary'
  | 'dropEnter'
  | 'climaxEnter';

export interface DebugEventEntry {
  readonly sequence: number;
  readonly type: DebugEventType;
  readonly engineTimeMs: number;
  readonly strength: number;
}

export class DebugEventLog {
  private readonly entries: DebugEventEntry[] = [];
  private readonly previousStrength = new Map<DebugEventType, number>();
  private sequence = 1;
  private readonly capacity: number;

  constructor(capacity = 64) {
    this.capacity = Math.max(1, Math.floor(capacity));
  }

  recordFrame(input: AudioFeatureFrame): readonly DebugEventEntry[] {
    const frame = createAudioFeatureFrame(input);
    const appended: DebugEventEntry[] = [];
    for (const [type, strength] of [
      ['onset', frame.onset],
      ['bassPeak', frame.bassPeak],
      ['sectionBoundary', frame.sectionBoundary],
      ['dropEnter', frame.dropEnter],
      ['climaxEnter', frame.climaxEnter]
    ] as const) {
      const previous = this.previousStrength.get(type) ?? 0;
      this.previousStrength.set(type, strength);
      if (strength <= 0 || previous > 0) continue;
      const entry: DebugEventEntry = Object.freeze({
        sequence: this.sequence++,
        type,
        engineTimeMs: frame.engineTimeMs,
        strength
      });
      this.entries.push(entry);
      appended.push(entry);
    }
    if (this.entries.length > this.capacity) {
      this.entries.splice(0, this.entries.length - this.capacity);
    }
    return appended;
  }

  list(): readonly DebugEventEntry[] {
    return this.entries.map(entry => ({ ...entry }));
  }

  clear(): void {
    this.entries.length = 0;
    this.previousStrength.clear();
    this.sequence = 1;
  }
}
