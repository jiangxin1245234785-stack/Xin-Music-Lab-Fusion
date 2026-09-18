import { createHash } from 'node:crypto';

import {
  DISPLAY_FRAGMENT_SHADER,
  MINIMAL_FRAGMENT_SHADER,
  VISUAL_TARGET_REGISTRY,
  VISUAL_TARGETS,
  createDefaultVisualValues,
  createShaderPipelineConfig,
  createValidationBuffer,
  runOfflineDeterministicSession
} from '../../dist/index.js';

const SNAPSHOT_FORMAT_VERSION = 1;
const SNAPSHOT_WIDTH = 96;
const SNAPSHOT_SCALE = 4;
const ROW_HEIGHT = 4;
const HEADER_HEIGHT = 8;

const MODULE_COLORS = Object.freeze({
  Feedback: [104, 116, 255],
  'Block Damage': [255, 91, 132],
  'RGB Split': [74, 223, 255],
  'Scanline/Grain': [177, 113, 255],
  'Signal Loss': [255, 190, 73],
  Color: [96, 238, 177],
  'Custom(GLSL)': [235, 235, 245]
});

function sha256(value) {
  return createHash('sha256').update(value).digest('hex');
}

function clamp01(value) {
  return Math.max(0, Math.min(1, value));
}

function normalizeTarget(definition, value) {
  const span = definition.max - definition.min;
  if (span <= 0) return 0;
  return clamp01((value - definition.min) / span);
}

function representativeFrames(frames, width) {
  if (frames.length === 0) {
    throw new Error('Visual regression requires at least one offline frame.');
  }
  return Array.from({ length: width }, (_, index) => {
    const sourceIndex = Math.min(
      frames.length - 1,
      Math.floor(index * frames.length / width)
    );
    return frames[sourceIndex];
  });
}

function createRegressionPreset() {
  return {
    id: 'phase6-visual-regression',
    name: 'Phase 6 visual regression',
    seed: 0x584c44,
    targetDefaults: {
      values: createDefaultVisualValues()
    },
    envelopes: [{
      id: 'regression-onset',
      attackMs: 0,
      holdMs: 70,
      decayMs: 180,
      sustain: 0,
      releaseMs: 120,
      cooldownMs: 90
    }],
    mappings: [
      {
        id: 'regression-loudness-brightness',
        sourceId: 'audio.loudness',
        targetId: VISUAL_TARGETS.colorBrightness,
        amount: 0.92,
        range: [0.18, 0.92],
        replaceMode: 'replace'
      },
      {
        id: 'regression-bass-feedback',
        sourceId: 'audio.bass',
        targetId: VISUAL_TARGETS.feedbackZoom,
        amount: 1.18,
        range: [0.78, 1.24],
        replaceMode: 'replace'
      },
      {
        id: 'regression-mid-rgb',
        sourceId: 'audio.mid',
        targetId: VISUAL_TARGETS.rgbDistance,
        amount: 0.075,
        range: [0, 0.08],
        replaceMode: 'replace'
      },
      {
        id: 'regression-treble-scanline',
        sourceId: 'audio.treble',
        targetId: VISUAL_TARGETS.scanlineDepth,
        amount: 0.86,
        range: [0.04, 0.92],
        replaceMode: 'replace'
      },
      {
        id: 'regression-flux-blocks',
        sourceId: 'audio.flux',
        targetId: VISUAL_TARGETS.blockSpawnProbability,
        amount: 0.74,
        range: [0.02, 0.84],
        replaceMode: 'replace'
      },
      {
        id: 'regression-flatness-grain',
        sourceId: 'audio.flatness',
        targetId: VISUAL_TARGETS.grainDensity,
        amount: 0.8,
        range: [0.03, 0.9],
        replaceMode: 'replace'
      },
      {
        id: 'regression-onset-flash',
        sourceId: 'audio.onset',
        targetId: VISUAL_TARGETS.colorFlashStrength,
        kind: 'event',
        envelopeId: 'regression-onset',
        amount: 0.3,
        range: [0, 0.35],
        priority: 10,
        replaceMode: 'add'
      }
    ],
    energyBudget: {
      enabled: true,
      budget: 3.5,
      eventVoiceLimit: 4,
      globalEventPolicy: 'drop-low-priority',
      experimentalQueueEnabled: false
    }
  };
}

function setPixel(rgba, width, x, y, red, green, blue, alpha = 255) {
  const offset = (y * width + x) * 4;
  rgba[offset] = red;
  rgba[offset + 1] = green;
  rgba[offset + 2] = blue;
  rgba[offset + 3] = alpha;
}

function renderVisualTimeline(frames) {
  const height = HEADER_HEIGHT + VISUAL_TARGET_REGISTRY.length * ROW_HEIGHT;
  const rgba = Buffer.alloc(SNAPSHOT_WIDTH * height * 4);
  const sampled = representativeFrames(frames, SNAPSHOT_WIDTH);
  const shaderDigest = Buffer.from(
    sha256(`${MINIMAL_FRAGMENT_SHADER}\n${DISPLAY_FRAGMENT_SHADER}`),
    'hex'
  );

  for (let x = 0; x < SNAPSHOT_WIDTH; x += 1) {
    const byte = shaderDigest[x % shaderDigest.length];
    for (let y = 0; y < HEADER_HEIGHT; y += 1) {
      const bit = (byte >> (y % 8)) & 1;
      setPixel(
        rgba,
        SNAPSHOT_WIDTH,
        x,
        y,
        bit ? 131 : 24,
        bit ? 255 : 22,
        bit ? 222 : 44
      );
    }
  }

  for (
    let targetIndex = 0;
    targetIndex < VISUAL_TARGET_REGISTRY.length;
    targetIndex += 1
  ) {
    const definition = VISUAL_TARGET_REGISTRY[targetIndex];
    const color = MODULE_COLORS[definition.module];
    for (let x = 0; x < SNAPSHOT_WIDTH; x += 1) {
      const value = sampled[x].targets.values[definition.id] ??
        definition.defaultValue;
      const normalized = normalizeTarget(definition, value);
      const intensity = 0.08 + normalized * 0.92;
      for (let row = 0; row < ROW_HEIGHT; row += 1) {
        const divider = row === ROW_HEIGHT - 1 ? 0.42 : 1;
        setPixel(
          rgba,
          SNAPSHOT_WIDTH,
          x,
          HEADER_HEIGHT + targetIndex * ROW_HEIGHT + row,
          Math.round(color[0] * intensity * divider),
          Math.round(color[1] * intensity * divider),
          Math.round(color[2] * intensity * divider)
        );
      }
    }
  }
  return { width: SNAPSHOT_WIDTH, height, rgba, sampled };
}

function upscaleNearest(width, height, rgba, scale) {
  const scaledWidth = width * scale;
  const scaledHeight = height * scale;
  const scaled = Buffer.alloc(scaledWidth * scaledHeight * 4);
  for (let y = 0; y < scaledHeight; y += 1) {
    const sourceY = Math.floor(y / scale);
    for (let x = 0; x < scaledWidth; x += 1) {
      const sourceX = Math.floor(x / scale);
      const sourceOffset = (sourceY * width + sourceX) * 4;
      const targetOffset = (y * scaledWidth + x) * 4;
      rgba.copy(scaled, targetOffset, sourceOffset, sourceOffset + 4);
    }
  }
  return { width: scaledWidth, height: scaledHeight, rgba: scaled };
}

function crc32(buffer) {
  let crc = 0xffffffff;
  for (const value of buffer) {
    crc ^= value;
    for (let bit = 0; bit < 8; bit += 1) {
      crc = (crc >>> 1) ^ (crc & 1 ? 0xedb88320 : 0);
    }
  }
  return (crc ^ 0xffffffff) >>> 0;
}

function adler32(buffer) {
  let a = 1;
  let b = 0;
  for (const value of buffer) {
    a = (a + value) % 65521;
    b = (b + a) % 65521;
  }
  return ((b << 16) | a) >>> 0;
}

function pngChunk(type, data) {
  const typeBuffer = Buffer.from(type, 'ascii');
  const length = Buffer.alloc(4);
  length.writeUInt32BE(data.length);
  const checksum = Buffer.alloc(4);
  checksum.writeUInt32BE(crc32(Buffer.concat([typeBuffer, data])));
  return Buffer.concat([length, typeBuffer, data, checksum]);
}

function uncompressedZlib(buffer) {
  const blocks = [Buffer.from([0x78, 0x01])];
  for (let offset = 0; offset < buffer.length; offset += 65535) {
    const length = Math.min(65535, buffer.length - offset);
    const header = Buffer.alloc(5);
    header[0] = offset + length >= buffer.length ? 1 : 0;
    header.writeUInt16LE(length, 1);
    header.writeUInt16LE((~length) & 0xffff, 3);
    blocks.push(header, buffer.subarray(offset, offset + length));
  }
  const checksum = Buffer.alloc(4);
  checksum.writeUInt32BE(adler32(buffer));
  blocks.push(checksum);
  return Buffer.concat(blocks);
}

function encodePng(width, height, rgba) {
  const scanlines = Buffer.alloc(height * (1 + width * 4));
  for (let y = 0; y < height; y += 1) {
    const rowOffset = y * (1 + width * 4);
    scanlines[rowOffset] = 0;
    rgba.copy(
      scanlines,
      rowOffset + 1,
      y * width * 4,
      (y + 1) * width * 4
    );
  }
  const header = Buffer.alloc(13);
  header.writeUInt32BE(width, 0);
  header.writeUInt32BE(height, 4);
  header[8] = 8;
  header[9] = 6;
  return Buffer.concat([
    Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
    pngChunk('IHDR', header),
    pngChunk('IDAT', uncompressedZlib(scanlines)),
    pngChunk('IEND', Buffer.alloc(0))
  ]);
}

function round(value) {
  return Number(value.toFixed(8));
}

export function buildVisualRegressionArtifact() {
  const frames = runOfflineDeterministicSession({
    buffer: createValidationBuffer(),
    preset: createRegressionPreset(),
    sessionSeed: 0x6100,
    frameSize: 1024
  });
  const rendered = renderVisualTimeline(frames);
  const scaled = upscaleNearest(
    rendered.width,
    rendered.height,
    rendered.rgba,
    SNAPSHOT_SCALE
  );
  const png = encodePng(scaled.width, scaled.height, scaled.rgba);
  const checkpoints = [0, 24, 48, 72, 95].map(index => ({
    x: index,
    engineTimeMs: round(rendered.sampled[index].clock.nowMs),
    brightness: round(
      rendered.sampled[index].targets.values[
        VISUAL_TARGETS.colorBrightness
      ] ?? 0
    ),
    feedbackZoom: round(
      rendered.sampled[index].targets.values[
        VISUAL_TARGETS.feedbackZoom
      ] ?? 0
    ),
    blockSpawn: round(
      rendered.sampled[index].targets.values[
        VISUAL_TARGETS.blockSpawnProbability
      ] ?? 0
    )
  }));
  const manifest = {
    formatVersion: SNAPSHOT_FORMAT_VERSION,
    width: scaled.width,
    height: scaled.height,
    sampleCount: SNAPSHOT_WIDTH,
    pixelScale: SNAPSHOT_SCALE,
    engineClock: 'fixed-step-offline',
    sessionSeed: 0x6100,
    targetIds: VISUAL_TARGET_REGISTRY.map(definition => definition.id),
    passOrder: createShaderPipelineConfig().passOrder,
    shaderSha256: {
      builtinFeedback: sha256(MINIMAL_FRAGMENT_SHADER),
      display: sha256(DISPLAY_FRAGMENT_SHADER)
    },
    pixelSha256: sha256(scaled.rgba),
    pngSha256: sha256(png),
    checkpoints
  };
  return Object.freeze({ manifest: Object.freeze(manifest), png });
}

export function serializeVisualRegressionManifest(manifest) {
  return `${JSON.stringify(manifest, null, 2)}\n`;
}
