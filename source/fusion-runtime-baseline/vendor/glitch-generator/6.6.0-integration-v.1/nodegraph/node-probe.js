const finiteOrZero = (value) => typeof value === 'number' && Number.isFinite(value) ? value : 0;
export class NodeProbeBank {
    capacity;
    histories = new Map();
    constructor(capacity = 96) {
        this.capacity = capacity;
        if (!Number.isInteger(capacity) || capacity < 2) {
            throw new Error('NodeProbeBank capacity must be an integer >= 2');
        }
    }
    reset() {
        this.histories.clear();
    }
    record(clock, frame) {
        const active = new Set(Object.keys(frame.outputs));
        for (const sourceId of this.histories.keys()) {
            if (!active.has(sourceId))
                this.histories.delete(sourceId);
        }
        for (const sourceId of [...active].sort()) {
            const history = this.histories.get(sourceId) ?? [];
            history.push(Object.freeze({
                engineTimeMs: clock.nowMs,
                value: finiteOrZero(frame.outputs[sourceId])
            }));
            if (history.length > this.capacity) {
                history.splice(0, history.length - this.capacity);
            }
            this.histories.set(sourceId, history);
        }
        return this.snapshots();
    }
    snapshot(sourceId) {
        const samples = this.histories.get(sourceId) ?? [];
        return Object.freeze({
            sourceId,
            value: samples.at(-1)?.value ?? 0,
            samples: Object.freeze([...samples])
        });
    }
    snapshots() {
        return Object.freeze([...this.histories.keys()]
            .sort()
            .map(sourceId => this.snapshot(sourceId)));
    }
}
export function projectNodeProbeWaveform(samples, width = 120, height = 32) {
    if (samples.length === 0)
        return '';
    const values = samples.map(sample => finiteOrZero(sample.value));
    const minimum = Math.min(0, ...values);
    const maximum = Math.max(0, ...values);
    const span = Math.max(1e-9, maximum - minimum);
    const denominator = Math.max(1, values.length - 1);
    return values.map((value, index) => {
        const x = index / denominator * width;
        const y = height - (value - minimum) / span * height;
        return `${x.toFixed(2)},${y.toFixed(2)}`;
    }).join(' ');
}
//# sourceMappingURL=node-probe.js.map