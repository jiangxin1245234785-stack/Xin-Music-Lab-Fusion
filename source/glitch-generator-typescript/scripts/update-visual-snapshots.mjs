import { mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  buildVisualRegressionArtifact,
  serializeVisualRegressionManifest
} from '../tests/support/visual-regression.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const snapshotDirectory = path.join(root, 'tests', '__snapshots__');
const artifact = buildVisualRegressionArtifact();

mkdirSync(snapshotDirectory, { recursive: true });
writeFileSync(
  path.join(snapshotDirectory, 'phase6-visual-timeline.png'),
  artifact.png
);
writeFileSync(
  path.join(snapshotDirectory, 'phase6-visual-timeline.json'),
  serializeVisualRegressionManifest(artifact.manifest)
);

console.log(
  `[Phase 6.1] Updated visual baseline ${artifact.manifest.width}x` +
  `${artifact.manifest.height}, pixel SHA-256 ` +
  artifact.manifest.pixelSha256
);
