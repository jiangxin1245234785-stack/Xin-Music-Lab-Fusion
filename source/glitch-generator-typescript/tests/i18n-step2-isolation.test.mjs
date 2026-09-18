import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

import {
  CURRENT_SCHEMA_VERSION,
  buildUnifiedMusicFrame,
  createGeneratorRuntime,
  getProductBuiltInPreset
} from '../dist/index.js';
import { createLocaleController } from '../dist/ui/i18n/index.js';

function frameAt(frameIndex) {
  const nowMs = frameIndex * 16;
  return buildUnifiedMusicFrame({
    clock: { frameIndex, nowMs, deltaMs: frameIndex === 0 ? 0 : 16 },
    transport: {
      mode: 'offline-test',
      state: 'playing',
      trackId: 'i18n-step2-fixture',
      mediaTimeMs: nowMs,
      durationMs: 120000,
      epoch: 0
    }
  });
}

test('Step 2 locale changes leave deterministic runtime and preset untouched', () => {
  const preset = getProductBuiltInPreset('temporal-excavation');
  const first = createGeneratorRuntime({ preset, sessionSeed: 2202 });
  const second = createGeneratorRuntime({ preset, sessionSeed: 2202 });
  const locale = createLocaleController();
  const presetBefore = JSON.stringify(second.getPreset());

  for (let frameIndex = 0; frameIndex < 188; frameIndex++) {
    if (frameIndex === 40) locale.setLocalLocale('en-US');
    if (frameIndex === 80) locale.setHostLocale('zh-CN');
    if (frameIndex === 120) locale.clearHostLocale();
    if (frameIndex === 160) locale.setLocalLocale('zh-CN');
    const frame = frameAt(frameIndex);
    assert.deepEqual(
      second.evaluate(frame, frame.clock),
      first.evaluate(frame, frame.clock),
      `locale switch changed deterministic frame ${frameIndex}`
    );
  }

  assert.equal(JSON.stringify(second.getPreset()), presetBefore);
  assert.equal(second.status().resetCount, 0);
  assert.equal(second.status().evaluationSerial, 188);
});

test('Step 2 locale path does not own schema or enter the browser runtime closure', async () => {
  const manifest = JSON.parse(await readFile(
    new URL('../dist/browser-manifest.json', import.meta.url),
    'utf8'
  ));
  assert.equal(CURRENT_SCHEMA_VERSION, 16);
  assert.equal(
    manifest.files.some(file => file.path.includes('ui/i18n/')),
    false
  );
});
