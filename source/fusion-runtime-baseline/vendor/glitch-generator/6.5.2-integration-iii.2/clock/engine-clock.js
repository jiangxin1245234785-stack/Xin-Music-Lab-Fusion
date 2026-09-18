export class FixedStepEngineClock {
    stepMs;
    frameIndex = 0;
    nowMs = 0;
    constructor(stepMs = 1000 / 60) {
        this.stepMs = stepMs;
        if (!Number.isFinite(stepMs) || stepMs <= 0) {
            throw new Error(`Invalid fixed clock step: ${String(stepMs)}`);
        }
    }
    reset() {
        this.frameIndex = 0;
        this.nowMs = 0;
    }
    tick() {
        const frame = {
            frameIndex: this.frameIndex,
            nowMs: this.nowMs,
            deltaMs: this.frameIndex === 0 ? 0 : this.stepMs
        };
        this.frameIndex++;
        this.nowMs += this.stepMs;
        return frame;
    }
}
export class RealtimeEngineClock {
    nowProvider;
    frameIndex = 0;
    originMs = 0;
    previousMs = 0;
    constructor(nowProvider) {
        this.nowProvider = nowProvider;
        this.reset();
    }
    reset() {
        const now = this.readProvider();
        this.frameIndex = 0;
        this.originMs = now;
        this.previousMs = now;
    }
    tick() {
        const current = this.readProvider();
        const frame = {
            frameIndex: this.frameIndex,
            nowMs: Math.max(0, current - this.originMs),
            deltaMs: this.frameIndex === 0 ? 0 : Math.max(0, current - this.previousMs)
        };
        this.previousMs = current;
        this.frameIndex++;
        return frame;
    }
    readProvider() {
        const value = this.nowProvider();
        if (!Number.isFinite(value))
            throw new Error('Realtime clock provider returned a non-finite value');
        return value;
    }
}
//# sourceMappingURL=engine-clock.js.map