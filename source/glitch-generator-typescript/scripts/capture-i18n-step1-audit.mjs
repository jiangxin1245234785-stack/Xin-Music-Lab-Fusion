import { mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  buildI18nStep1Audit,
  renderI18nStep1AuditMarkdown
} from '../tests/support/i18n-step1-audit.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const outputDirectory = path.join(root, 'artifacts', 'i18n-step1');
const audit = await buildI18nStep1Audit(root);

mkdirSync(outputDirectory, { recursive: true });
writeFileSync(
  path.join(outputDirectory, 'text-inventory.json'),
  `${JSON.stringify(audit, null, 2)}\n`,
  'utf8'
);
writeFileSync(
  path.join(outputDirectory, 'text-inventory.md'),
  renderI18nStep1AuditMarkdown(audit),
  'utf8'
);

console.log(
  `[Step 1] ${audit.summary.total} text candidates, ` +
  `${audit.mojibake.findings.length} mojibake findings, ` +
  `${audit.registry.sourceRegistry.runtimeCount} sources, ` +
  `${audit.registry.targetRegistry.formalCount} formal targets.`
);
