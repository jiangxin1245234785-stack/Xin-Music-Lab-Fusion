export interface PcmAudioBuffer {
  readonly sampleRate: number;
  readonly channels: readonly Float32Array[];
}

export interface PcmFrame {
  readonly frameIndex: number;
  readonly sampleOffset: number;
  readonly sampleRate: number;
  readonly samples: Float32Array;
}

export function createPcmAudioBuffer(
  sampleRate: number,
  channels: readonly Float32Array[]
): PcmAudioBuffer {
  if (!Number.isFinite(sampleRate) || sampleRate <= 0) {
    throw new Error(`Invalid sampleRate: ${String(sampleRate)}`);
  }
  if (!channels.length) throw new Error('PCM buffer requires at least one channel');

  const length = channels[0]?.length ?? 0;
  if (!length) throw new Error('PCM buffer cannot be empty');
  if (channels.some(channel => channel.length !== length)) {
    throw new Error('PCM channel lengths must match');
  }

  return {
    sampleRate,
    channels: channels.map(channel => new Float32Array(channel))
  };
}

