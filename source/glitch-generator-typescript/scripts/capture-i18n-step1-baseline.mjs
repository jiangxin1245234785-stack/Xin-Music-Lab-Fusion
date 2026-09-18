import { mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  buildI18nStep1DeterministicBaseline,
  serializeI18nStep1Baseline
} from '../tests/support/i18n-step1-baseline.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const outputDirectory = path.join(root, 'artifacts', 'i18n-step1');
const outputPath = path.join(outputDirectory, 'deterministic-baseline.json');
const baseline = buildI18nStep1DeterministicBaseline();

mkdirSync(outputDirectory, { recursive: true });
writeFileSync(outputPath, serializeI18nStep1Baseline(baseline), 'utf8');

console.log(
  `[Step 1] ${baseline.fixture.frameCount} deterministic frames captured; ` +
  `${baseline.checkpoints.length} checkpoints; ` +
  `mixer ${baseline.hashes.targetMixerOutputs.slice(0, 12)}.`
);
