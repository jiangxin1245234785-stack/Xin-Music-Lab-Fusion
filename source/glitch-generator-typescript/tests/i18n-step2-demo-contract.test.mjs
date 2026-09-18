import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const html = await readFile(
  new URL('../demo/index.html', import.meta.url),
  'utf8'
);
const demoSource = await readFile(
  new URL('../src/ui-debug/phase1-demo.ts', import.meta.url),
  'utf8'
);
const browserSource = await readFile(
  new URL('../src/browser/index.ts', import.meta.url),
  'utf8'
);
const packageJson = JSON.parse(await readFile(
  new URL('../package.json', import.meta.url),
  'utf8'
));

test('Step 2 demo exposes exactly zh-CN and en-US locale choices', () => {
  const values = [...html.matchAll(/<option[^>]+value="([^"]+)"/g)]
    .filter(match => /localeOption/.test(match[0]))
    .map(match => match[1]);
  assert.deepEqual(values, ['zh-CN', 'en-US']);
  assert.match(html, /id="localeSelect"/);
  assert.match(html, /id="localeSource"/);
});

test('Step 2 locale bridge stays in UI bootstrap and outside runtime history', () => {
  assert.match(demoSource, /mountLocaleUi\(localeController/);
  assert.match(demoSource, /xinGlitchGeneratorLocale = mountedLocaleUi\.host/);
  assert.equal(
    (demoSource.match(/mountedLocaleUi/g) ?? []).length,
    3,
    'locale adapter should only mount, expose, dispose and release'
  );
  assert.doesNotMatch(browserSource, /i18n|locale|document|localStorage/);
  assert.equal(
    packageJson.exports['./ui/locale'].default,
    './dist/ui/i18n/index.js'
  );
});
