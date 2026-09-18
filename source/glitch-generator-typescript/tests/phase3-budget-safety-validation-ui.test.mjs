import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const html = readFileSync(
  new URL('../demo/index.html', import.meta.url),
  'utf8'
);
const runtime = readFileSync(
  new URL('../src/ui-debug/phase1-demo.ts', import.meta.url),
  'utf8'
);

test('Step 3.4 UI exposes active budget, weights and event policy controls', () => {
  for (const id of [
    'energyBudgetEnabled',
    'energyBudgetValue',
    'eventVoiceLimit',
    'globalEventPolicy',
    'experimentalQueueEnabled',
    'energyWeightTableBody',
    'energyBudgetAttenuation',
    'eventVoiceStatus'
  ]) {
    assert.match(html, new RegExp(`id="${id}"`));
  }
  assert.match(runtime, /energyBudget:\s*energyBudgetConfig/);
  assert.match(runtime, /mixed\.energyBudgetDecision/);
});

test('Step 3.5 UI distinguishes soft switches from locked physical caps', () => {
  for (const id of [
    'safetyWhiteout',
    'safetyBlackout',
    'safetyFeedbackRunaway',
    'safetyModeStatus',
    'safetyInterventionStatus'
  ]) {
    assert.match(html, new RegExp(`id="${id}"`));
  }
  assert.match(html, /PHYSICAL CAP · LOCKED/);
  assert.match(html, /Brightness ≤ 1\.00 · Flash ≤ 3 Hz/);
});

test('Step 3.6 UI renders precise preset validation reports', () => {
  assert.match(html, /id="presetValidationStatus"/);
  assert.match(html, /id="presetValidationIssues"/);
  assert.match(runtime, /buildPresetCompatibilityReport\(preset\)/);
  assert.match(runtime, /compatibility\.validation/);
  assert.match(runtime, /issue\.code/);
  assert.match(runtime, /issue\.path/);
  assert.match(runtime, /issue\.message/);
});
