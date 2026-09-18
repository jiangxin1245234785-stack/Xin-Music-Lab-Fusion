import type { PcmAudioBuffer, PcmFrame } from './types.js';

function assertFrameSize(frameSize: number): void {
  if (!Number.isInteger(frameSize) || frameSize <= 0) {
    throw new Error(`Invalid frameSize: ${String(frameSize)}`);
  }
}

export class OfflineDeterministicPlayback {
  private sampleOffset = 0;
  private frameIndex = 0;

  constructor(
    private readonly buffer: PcmAudioBuffer,
    readonly frameSize: number
  ) {
    assertFrameSize(frameSize);
  }

  get ended(): boolean {
    return this.sampleOffset >= this.buffer.channels[0]!.length;
  }

  reset(): void {
    this.sampleOffset = 0;
    this.frameIndex = 0;
  }

  nextFrame(): PcmFrame | null {
    if (this.ended) return null;

    const samples = new Float32Array(this.frameSize);
    const channelCount = this.buffer.channels.length;
    const available = Math.min(
      this.frameSize,
      this.buffer.channels[0]!.length - this.sampleOffset
    );

    for (let index = 0; index < available; index++) {
      let mixed = 0;
      for (const channel of this.buffer.channels) {
        mixed += channel[this.sampleOffset + index] ?? 0;
      }
      samples[index] = mixed / channelCount;
    }

    const frame: PcmFrame = {
      frameIndex: this.frameIndex,
      sampleOffset: this.sampleOffset,
      sampleRate: this.buffer.sampleRate,
      samples
    };
    this.sampleOffset += this.frameSize;
    this.frameIndex++;
    return frame;
  }
}

