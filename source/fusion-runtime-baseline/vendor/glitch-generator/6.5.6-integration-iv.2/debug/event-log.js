import { createAudioFeatureFrame } from '../schema/defaults.js';
export class DebugEventLog {
    entries = [];
    previousStrength = new Map();
    sequence = 1;
    capacity;
    constructor(capacity = 64) {
        this.capacity = Math.max(1, Math.floor(capacity));
    }
    recordFrame(input) {
        const frame = createAudioFeatureFrame(input);
        const appended = [];
        for (const [type, strength] of [
            ['onset', frame.onset],
            ['bassPeak', frame.bassPeak],
            ['sectionBoundary', frame.sectionBoundary],
            ['dropEnter', frame.dropEnter],
            ['climaxEnter', frame.climaxEnter]
        ]) {
            const previous = this.previousStrength.get(type) ?? 0;
            this.previousStrength.set(type, strength);
            if (strength <= 0 || previous > 0)
                continue;
            const entry = Object.freeze({
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
    list() {
        return this.entries.map(entry => ({ ...entry }));
    }
    clear() {
        this.entries.length = 0;
        this.previousStrength.clear();
        this.sequence = 1;
    }
}
//# sourceMappingURL=event-log.js.map