const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.join(__dirname, '..');
const runtime = require('../i18n/runtime-messages.js');
const enKeys = Object.keys(runtime.EN_US_RUNTIME_MESSAGES).sort();
const zhKeys = Object.keys(runtime.ZH_CN_RUNTIME_MESSAGES).sort();

assert.deepEqual(zhKeys, enKeys, 'runtime catalog keys must stay aligned');
assert.ok(enKeys.length >= 130, `expected at least 130 runtime keys, received ${enKeys.length}`);
for (const key of enKeys) {
  assert.equal(typeof runtime.translateRuntime('en-US', key), 'string');
  assert.equal(typeof runtime.translateRuntime('zh-CN', key), 'string');
  assert.ok(!runtime.translateRuntime('en-US', key).startsWith('['), `missing en-US ${key}`);
  assert.ok(!runtime.translateRuntime('zh-CN', key).startsWith('['), `missing zh-CN ${key}`);
}

assert.equal(runtime.translateRuntime('en-US', 'runtime.library.summary', { albums: 4, tracks: 25, root: 'D:\\Music' }), '4 albums · 25 tracks · D:\\Music');
assert.equal(runtime.translateRuntime('zh-CN', 'runtime.library.summary', { albums: 4, tracks: 25, root: 'D:\\Music' }), '4 张专辑 · 25 首 · D:\\Music');
assert.equal(runtime.localizeBackendMessage('正在启动分析器', 'en-US'), 'Starting analyzer');
assert.equal(runtime.localizeBackendMessage('MSAF · SF 正在准备音频特征', 'en-US'), 'MSAF · SF preparing audio features');
assert.equal(runtime.localizeBackendMessage('Harmony 运行时缺少 Librosa', 'en-US'), 'Harmony runtime is missing Librosa');
assert.equal(runtime.localizeBackendMessage('raw-error-code-17', 'en-US'), 'raw-error-code-17');
assert.equal(runtime.localizeBackendMessage('正在启动分析器', 'zh-CN'), '正在启动分析器');

const html = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
const app = fs.readFileSync(path.join(root, 'app.js'), 'utf8');
assert.ok(html.indexOf('i18n/runtime-messages.js') < html.indexOf('app.js'));
assert.ok(app.includes('refreshRuntimeLocaleUi'));
assert.ok(app.includes('logBackendAnalysis'));
assert.ok(!app.includes('MutationObserver'));

const withoutLineComments = app.replace(/\/\/.*$/gm, '');
assert.ok(!/[\u3400-\u9fff]/.test(withoutLineComments), 'renderer runtime copy must not contain hard-coded CJK literals');

console.log(`XLD i18n Step 4: PASS (${enKeys.length} runtime keys)`);
