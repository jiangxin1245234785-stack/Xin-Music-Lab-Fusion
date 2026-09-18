import { createHash } from 'node:crypto';
import { readFileSync, readdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const screenshotDirectory = path.join(
  root,
  'artifacts',
  'i18n-step1',
  'screenshots'
);
const pageNames = ['advanced', 'map', 'perform', 'shader', 'visual'];
const viewportNames = ['1366x768', '820x900'];

function dimensions(jpeg) {
  if (jpeg[0] !== 0xff || jpeg[1] !== 0xd8) {
    throw new Error('Step 1 screenshot is not a JPEG file.');
  }
  let offset = 2;
  while (offset + 8 < jpeg.length) {
    if (jpeg[offset] !== 0xff) {
      offset += 1;
      continue;
    }
    const marker = jpeg[offset + 1];
    if ([0xc0, 0xc1, 0xc2, 0xc3, 0xc5, 0xc6, 0xc7, 0xc9, 0xca, 0xcb, 0xcd, 0xce, 0xcf].includes(marker)) {
      return {
        height: jpeg.readUInt16BE(offset + 5),
        width: jpeg.readUInt16BE(offset + 7)
      };
    }
    if (marker === 0xd8 || marker === 0xd9) {
      offset += 2;
      continue;
    }
    const length = jpeg.readUInt16BE(offset + 2);
    if (length < 2) break;
    offset += length + 2;
  }
  throw new Error('Step 1 JPEG dimensions could not be read.');
}

const files = readdirSync(screenshotDirectory)
  .filter(filename => filename.endsWith('.jpg'))
  .sort((left, right) => left.localeCompare(right))
  .map(filename => {
    const jpeg = readFileSync(path.join(screenshotDirectory, filename));
    const parsed = dimensions(jpeg);
    return {
      filename,
      bytes: jpeg.length,
      width: parsed.width,
      height: parsed.height,
      sha256: createHash('sha256').update(jpeg).digest('hex')
    };
  });

const expectedFiles = viewportNames.flatMap(viewport =>
  pageNames.map(page => `${viewport}-${page}.jpg`)
).sort((left, right) => left.localeCompare(right));
const actualFiles = files.map(file => file.filename);
if (JSON.stringify(actualFiles) !== JSON.stringify(expectedFiles)) {
  throw new Error(
    `Step 1 screenshot set is incomplete. Expected ${expectedFiles.join(', ')}; ` +
    `received ${actualFiles.join(', ')}.`
  );
}

const consoleLog = JSON.parse(readFileSync(
  path.join(screenshotDirectory, 'browser-console.json'),
  'utf8'
));
const manifest = {
  format: 'xin.glitch-generator.i18n-step1-screenshots/1',
  captureMode: 'browser viewport screenshot',
  pages: pageNames,
  viewports: {
    regular: { width: 1366, height: 768 },
    xmlEmbeddedNarrow: { width: 820, height: 900 }
  },
  consoleWarningAndErrorCount: consoleLog.length,
  files
};

writeFileSync(
  path.join(screenshotDirectory, 'manifest.json'),
  `${JSON.stringify(manifest, null, 2)}\n`,
  'utf8'
);
console.log(
  `[Step 1] ${files.length} viewport screenshots indexed; ` +
  `${consoleLog.length} browser warnings/errors.`
);
