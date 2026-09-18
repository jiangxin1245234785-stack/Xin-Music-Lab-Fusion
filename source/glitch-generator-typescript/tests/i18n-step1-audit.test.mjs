import assert from 'node:assert/strict';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

import { buildI18nStep1Audit } from './support/i18n-step1-audit.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

test('Step 1 text and registry audit is deterministic and covers the UI surface', async () => {
  const first = await buildI18nStep1Audit(root);
  const second = await buildI18nStep1Audit(root);

  assert.deepEqual(second, first);
  assert.ok(first.summary.byClassification['direct-ui'] > 0);
  assert.ok(first.summary.byClassification['dynamic-ui-candidate'] > 0);
  assert.ok(first.scope.htmlFiles.includes('demo/index.html'));
});

test('Step 1 registry boundary is explicit and current source sets agree', async () => {
  const audit = await buildI18nStep1Audit(root);

  assert.equal(audit.registry.sourceRegistry.exactSetMatch, true);
  assert.equal(audit.registry.sourceRegistry.runtimeCount, 27);
  assert.ok(audit.registry.targetRegistry.formalCount > 0);
  assert.deepEqual(
    audit.registry.targetRegistry.legacyOrFallbackIds,
    ['visual.alpha', 'visual.brightness', 'visual.scale']
  );
  assert.equal(audit.registry.targetRegistry.dynamicTargetPrefix, 'glsl:');
});

test('Step 1 mojibake scanner keeps confirmed UTF-8 corruption out of UI sources', async () => {
  const audit = await buildI18nStep1Audit(root);
  assert.deepEqual(audit.mojibake.findings, []);
});
