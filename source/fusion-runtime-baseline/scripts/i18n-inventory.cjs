'use strict';

const fs = require('node:fs');
const path = require('node:path');
const root = path.join(__dirname, '..');
const read = file => fs.readFileSync(path.join(root, file), 'utf8');
const html = read('index.html');
const app = read('app.js');
const fusion = read('fusion.js');

const textCandidates = [...html.matchAll(/>([^<>]+)</g)]
  .map(match => match[1].replace(/\s+/g, ' ').trim())
  .filter(value => value && !value.startsWith('<!--'));
const attributeCandidates = [...html.matchAll(/\s(?:title|aria-label|placeholder)="([^"]+)"/g)]
  .map(match => match[1]);
const runtimeSource = `${app}\n${fusion}`;
const directDynamicSinks = [...runtimeSource.matchAll(/\.(?:textContent|innerHTML|title|placeholder)\s*=/g)].length;
const semanticDynamicSinks = [...runtimeSource.matchAll(/\b(?:bindUiText|bindUiAttribute)\s*\(/g)].length;
const dynamicSinks = directDynamicSinks + semanticDynamicSinks;
const result = Object.freeze({
  htmlTextCandidates: textCandidates.length,
  htmlAttributeCandidates: attributeCandidates.length,
  dynamicPresentationSinks: dynamicSinks,
  directDynamicSinks,
  semanticDynamicSinks,
  scannedFiles: ['index.html', 'app.js', 'fusion.js']
});

if (require.main === module) process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
module.exports = result;
