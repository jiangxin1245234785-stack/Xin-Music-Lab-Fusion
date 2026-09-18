export interface EngineClockFrame {
  readonly frameIndex: number;
  readonly nowMs: number;
  readonly deltaMs: number;
}

export interface EngineClock {
  reset(): void;
  tick(): EngineClockFrame;
}

export class FixedStepEngineClock implements EngineClock {
  private frameIndex = 0;
  private nowMs = 0;

  constructor(readonly stepMs = 1000 / 60) {
    if (!Number.isFinite(stepMs) || stepMs <= 0) {
      throw new Error(`Invalid fixed clock step: ${String(stepMs)}`);
    }
  }

  reset(): void {
    this.frameIndex = 0;
    this.nowMs = 0;
  }

  tick(): EngineClockFrame {
    const frame: EngineClockFrame = {
      frameIndex: this.frameIndex,
      nowMs: this.nowMs,
      deltaMs: this.frameIndex === 0 ? 0 : this.stepMs
    };
    this.frameIndex++;
    this.nowMs += this.stepMs;
    return frame;
  }
}

export class RealtimeEngineClock implements EngineClock {
  private frameIndex = 0;
  private originMs = 0;
  private previousMs = 0;

  constructor(private readonly nowProvider: () => number) {
    this.reset();
  }

  reset(): void {
    const now = this.readProvider();
    this.frameIndex = 0;
    this.originMs = now;
    this.previousMs = now;
  }

  tick(): EngineClockFrame {
    const current = this.readProvider();
    const frame: EngineClockFrame = {
      frameIndex: this.frameIndex,
      nowMs: Math.max(0, current - this.originMs),
      deltaMs: this.frameIndex === 0 ? 0 : Math.max(0, current - this.previousMs)
    };
    this.previousMs = current;
    this.frameIndex++;
    return frame;
  }

  private readProvider(): number {
    const value = this.nowProvider();
    if (!Number.isFinite(value)) throw new Error('Realtime clock provider returned a non-finite value');
    return value;
  }
}

