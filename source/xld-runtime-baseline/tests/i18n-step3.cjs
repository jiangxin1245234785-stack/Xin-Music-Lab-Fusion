const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.join(__dirname, '..');
const html = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
const catalogs = require('../i18n/catalogs.js');
const { translateMessage } = require('../i18n/translator.js');

const keyPattern = /data-i18n(?:-title|-placeholder|-aria-label|-alt)?="([^"]+)"/g;
const keys = [...html.matchAll(keyPattern)].map(match => match[1]);
assert.ok(keys.length >= 55, `expected at least 55 static bindings, received ${keys.length}`);

for (const key of new Set(keys)) {
  assert.equal(typeof catalogs.EN_US_MESSAGES[key], 'string', `missing en-US key ${key}`);
  assert.equal(typeof catalogs.ZH_CN_MESSAGES[key], 'string', `missing zh-CN key ${key}`);
  assert.ok(!translateMessage('en-US', key).startsWith('['), `unresolved en-US key ${key}`);
  assert.ok(!translateMessage('zh-CN', key).startsWith('['), `unresolved zh-CN key ${key}`);
}

for (const dynamicId of [
  'librarySummary', 'analysisState', 'analysisRootLabel', 'analysisTargetTitle',
  'analysisTargetMeta', 'segmentHint', 'segmentStatus', 'analyzeButton',
  'batchAlbumButton', 'taskTitle', 'taskMessage', 'taskElapsed', 'taskRemaining',
  'comparisonTitle', 'comparisonHint', 'currentSegmentDetail', 'integrationStatus',
  'manualTagList', 'analysisLog', 'nowTitle', 'nowArtist', 'repeatButton'
]) {
  const tag = html.match(new RegExp(`<[^>]+id="${dynamicId}"[^>]*>`))?.[0] || '';
  assert.ok(tag, `missing dynamic element ${dynamicId}`);
  assert.ok(!/data-i18n(?:=|-)/.test(tag), `dynamic element must not use static binding: ${dynamicId}`);
}

assert.ok(html.indexOf('i18n/static-ui.js') < html.indexOf('app.js'));
assert.ok(!fs.readFileSync(path.join(root, 'i18n', 'static-ui.js'), 'utf8').includes('MutationObserver'));

console.log(`XLD i18n Step 3: PASS (${new Set(keys).size} keys, ${keys.length} bindings)`);
