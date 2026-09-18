export class UndoHistory {
    options;
    past = [];
    future = [];
    active = null;
    sequence = 0;
    equals;
    limit;
    constructor(options) {
        this.options = options;
        this.equals = options.equals ?? ((left, right) => JSON.stringify(left) === JSON.stringify(right));
        this.limit = Math.max(1, Math.floor(options.limit ?? 100));
    }
    get canUndo() {
        return this.past.length > 0;
    }
    get canRedo() {
        return this.future.length > 0;
    }
    get undoLabel() {
        return this.past.at(-1)?.label ?? null;
    }
    get redoLabel() {
        return this.future.at(-1)?.label ?? null;
    }
    get activeContinuousKey() {
        return this.active?.key ?? null;
    }
    beginContinuous(key, label, before, engineTimeMs) {
        if (this.active?.key === key)
            return;
        if (this.active) {
            throw new Error(`Continuous transaction "${this.active.key}" must commit before "${key}"`);
        }
        this.active = {
            key,
            label,
            engineTimeMs,
            before: this.options.clone(before)
        };
    }
    commitContinuous(after) {
        if (!this.active)
            return null;
        const active = this.active;
        this.active = null;
        return this.record(active.label, 'continuous', active.before, after, active.engineTimeMs);
    }
    cancelContinuous() {
        this.active = null;
    }
    recordDiscrete(label, before, after, engineTimeMs, kind = 'discrete') {
        if (this.active) {
            throw new Error(`Cannot record discrete transaction while "${this.active.key}" is active`);
        }
        return this.record(label, kind, before, after, engineTimeMs);
    }
    undo() {
        this.cancelContinuous();
        const transaction = this.past.pop();
        if (!transaction)
            return null;
        this.future.push(transaction);
        return {
            state: this.options.clone(transaction.before),
            transaction
        };
    }
    redo() {
        this.cancelContinuous();
        const transaction = this.future.pop();
        if (!transaction)
            return null;
        this.past.push(transaction);
        return {
            state: this.options.clone(transaction.after),
            transaction
        };
    }
    clear() {
        this.past.length = 0;
        this.future.length = 0;
        this.active = null;
        this.sequence = 0;
    }
    record(label, kind, before, after, engineTimeMs) {
        const beforeClone = this.options.clone(before);
        const afterClone = this.options.clone(after);
        if (this.equals(beforeClone, afterClone))
            return null;
        const transaction = Object.freeze({
            sequence: this.sequence++,
            label,
            kind,
            engineTimeMs: Number.isFinite(engineTimeMs) ? engineTimeMs : 0,
            before: beforeClone,
            after: afterClone
        });
        this.past.push(transaction);
        if (this.past.length > this.limit)
            this.past.shift();
        this.future.length = 0;
        return transaction;
    }
}
//# sourceMappingURL=undo-history.js.map