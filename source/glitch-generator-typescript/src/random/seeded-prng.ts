const FALLBACK_SEED = 0x6d2b79f5;

function toUint32(value: number): number {
  if (!Number.isFinite(value)) return FALLBACK_SEED;
  const normalized = Math.trunc(value) >>> 0;
  return normalized || FALLBACK_SEED;
}

export function combineSeeds(presetSeed: number, sessionSeed: number): number {
  let value = toUint32(presetSeed) ^ Math.imul(toUint32(sessionSeed), 0x9e3779b1);
  value ^= value >>> 16;
  value = Math.imul(value, 0x85ebca6b);
  value ^= value >>> 13;
  value = Math.imul(value, 0xc2b2ae35);
  value ^= value >>> 16;
  return value >>> 0 || FALLBACK_SEED;
}

export class SeededPrng {
  private state: number;

  constructor(seed: number) {
    this.state = toUint32(seed);
  }

  reset(seed: number): void {
    this.state = toUint32(seed);
  }

  nextUint32(): number {
    let value = this.state;
    value ^= value << 13;
    value ^= value >>> 17;
    value ^= value << 5;
    this.state = value >>> 0 || FALLBACK_SEED;
    return this.state;
  }

  nextFloat(): number {
    return this.nextUint32() / 4294967296;
  }
}

export function createSeededPrng(presetSeed: number, sessionSeed = 0): SeededPrng {
  return new SeededPrng(combineSeeds(presetSeed, sessionSeed));
}

