import { createSnapshot } from '../schema/defaults.js';
import { captureSnapshot, restoreSnapshot } from './persistence.js';
import { loadPreset } from './migrations.js';
export class SnapshotStack {
    snapshots = [];
    sequence = 1;
    get size() {
        return this.snapshots.length;
    }
    list() {
        return this.snapshots.map(createSnapshot);
    }
    latest() {
        const snapshot = this.snapshots.at(-1);
        return snapshot ? createSnapshot(snapshot) : null;
    }
    capture(input) {
        const generatedId = `snapshot-${this.sequence++}`;
        const snapshot = captureSnapshot({
            ...input,
            id: input.id?.trim() || generatedId
        });
        this.snapshots.push(snapshot);
        return createSnapshot(snapshot);
    }
    get(id) {
        const snapshot = this.snapshots.find(item => item.id === id);
        return snapshot ? createSnapshot(snapshot) : null;
    }
    restore(id) {
        const snapshot = this.get(id);
        if (!snapshot)
            throw new Error(`Unknown snapshot: ${id}`);
        return restoreSnapshot(snapshot);
    }
    delete(id) {
        const index = this.snapshots.findIndex(item => item.id === id);
        if (index < 0)
            return false;
        this.snapshots.splice(index, 1);
        return true;
    }
    replaceAll(snapshots) {
        const restored = snapshots.map(restoreSnapshot);
        this.snapshots.splice(0, this.snapshots.length, ...restored);
        this.sequence = restored.reduce((next, snapshot) => {
            const match = /^snapshot-(\d+)$/.exec(snapshot.id);
            if (!match)
                return next;
            return Math.max(next, Number(match[1]) + 1);
        }, 1);
    }
    promoteToPreset(id, options = {}) {
        const snapshot = this.restore(id);
        const promoted = {
            ...snapshot.preset,
            id: options.id?.trim() || `preset-from-${snapshot.id}`,
            name: options.name?.trim() || snapshot.name,
            description: options.description ?? snapshot.note,
            targetDefaults: snapshot.targetState,
            metadata: {
                ...snapshot.preset.metadata,
                sourceSnapshotId: snapshot.id,
                snapshotNote: snapshot.note
            }
        };
        return loadPreset(promoted);
    }
    clear() {
        this.snapshots.length = 0;
        this.sequence = 1;
    }
}
//# sourceMappingURL=snapshot-stack.js.map