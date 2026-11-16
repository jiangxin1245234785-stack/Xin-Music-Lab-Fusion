'use strict';
// The scripted-dialog hook (core/test-dialogs.cjs) is for isolated acceptance runs only: it installs when XLD_TEST is
// '1' AND XLD_TEST_DIALOG_ANSWERS is set, never otherwise - in particular never on a normal start of a release, where
// nothing sets XLD_TEST (checked here against the release tools and both apps' main processes).
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const hook = require('../core/test-dialogs.cjs');

(async () => {
  const scratch = fs.mkdtempSync(path.join(os.tmpdir(), 'xld-test-dialogs-'));
  try {
    const file = path.join(scratch, 'answers.json');
    fs.writeFileSync(file, JSON.stringify([{open: ['D:\\x\\song.flac']}, {message: 1}]));
    const real = {showOpenDialog: () => 'real-open', showMessageBox: () => 'real-message'};
    for (const env of [{}, {XLD_TEST: '1'}, {XLD_TEST_DIALOG_ANSWERS: file}, {XLD_TEST: '0', XLD_TEST_DIALOG_ANSWERS: file}, {XLD_TEST: '1', XLD_TEST_DIALOG_ANSWERS: ''}]) {
      const dialog = {...real};
      assert.equal(hook.install(dialog, env), false, 'not installed with ' + JSON.stringify(env));
      assert.equal(dialog.showOpenDialog(), 'real-open'); assert.equal(dialog.showMessageBox(), 'real-message');
    }
    const dialog = {...real};
    assert.equal(hook.install(dialog, {XLD_TEST: '1', XLD_TEST_DIALOG_ANSWERS: file}), true);
    assert.deepEqual(await dialog.showOpenDialog({}), {canceled: false, filePaths: ['D:\\x\\song.flac']});
    assert.deepEqual(await dialog.showMessageBox({}), {response: 1, checkboxChecked: false});
    assert.deepEqual(await dialog.showOpenDialog({}), {canceled: true, filePaths: []}, 'an empty queue cancels; no dialog is shown');
    assert.deepEqual(await dialog.showMessageBox({}), {response: 0, checkboxChecked: false});
    // Nothing in a release's start path sets XLD_TEST (only the acceptance checks pass it in).
    const root = path.join(__dirname, '..', '..');
    const starts = ['release-tools/bootstrap.cjs', 'release-tools/build-dev.cjs', 'release-tools/release-shell.cjs', 'xld-runtime-baseline/desktop/main.cjs', 'fusion-runtime-baseline/desktop/main.cjs']
      .map(f => [f, fs.readFileSync(path.join(root, f), 'utf8')]);
    for (const [name, text] of starts) {
      assert(!/XLD_TEST\s*(=|:)\s*['"]1['"]|env\.XLD_TEST\s*=[^=]|XLD_TEST_DIALOG_ANSWERS\s*(=|:)\s*['"]/.test(text), name + ' must not switch the test mode on');
    }
    const main = starts.find(([n]) => n.startsWith('xld'))[1];
    assert(/require\('\.\.\/core\/test-dialogs\.cjs'\)\.install\(dialog\)/.test(main), 'XLD installs the hook through the guarded install() only');
    console.log('test dialogs: ok (installed only with XLD_TEST=1 and an answers file; answers in order, empty queue cancels; no release start path switches the test mode on)');
  } finally { fs.rmSync(scratch, {recursive: true, force: true}); }
})().catch(error => { console.error(error); process.exitCode = 1; });
