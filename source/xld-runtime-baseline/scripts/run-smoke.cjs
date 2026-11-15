'use strict';
// npm run test:smoke - every Electron / real-model smoke test of XLD in one go (audit fix 1, item 9).
// Each runs with APPDATA pointed at a fresh temp folder (XLD's test mode keeps its settings under it), never at the
// user's own profile. Each needs its own fixture folder, named by an environment variable; a test whose variable is
// not set is skipped, with the variable named.
//   [ELECTRON=<electron.exe>] XLD_MODELS_TEST_ROOT=... npm run test:smoke
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const {spawnSync} = require('node:child_process');

const HERE = path.resolve(__dirname, '..');
const electron = process.env.ELECTRON || path.resolve(HERE, '..', 'smoke-resonance', 'node_modules', 'electron', 'dist', process.platform === 'win32' ? 'electron.exe' : 'electron');
// [test file, environment variables it needs (all), runs under Electron]
const TESTS = [
  ['tests/fixture-smoke.cjs', ['XLD_TEST_USERDATA'], true],
  ['tests/ai-smoke.cjs', ['XLD_TEST_USERDATA'], true],
  ['tests/ai-live-smoke.cjs', ['XLD_TEST_USERDATA'], true],
  ['tests/ai-segment-smoke.cjs', ['XLD_TEST_USERDATA'], true],
  ['tests/v03-ui-smoke.cjs', ['XLD_TEST_USERDATA'], true],
  ['tests/cancel-smoke.cjs', [], true],
  ['tests/refinement-player-electron.cjs', [], true],
  ['tests/derived-electron-smoke.cjs', ['XLD_DERIVED_FIXTURE', 'XLD_DERIVED_OUTPUT'], true],
  ['tests/generation-electron-smoke.cjs', ['XLD_OWNERSHIP_TEST_ROOT'], true],
  ['tests/guitar-ui.cjs', ['XLD_GUITAR_TEST_ROOT'], true],
  ['tests/muscriptor-ui.cjs', ['XLD_GUITAR_TEST_ROOT'], true],
  ['tests/compact-workspace-ui.cjs', ['XLD_STRINGS_TEST_ROOT'], true],
  ['tests/single-screen-ui.cjs', ['XLD_STRINGS_TEST_ROOT'], true],
  ['tests/string-midi-ui.cjs', ['XLD_STRINGS_TEST_ROOT'], true],
  ['tests/midi-batch-ui.cjs', ['XLD_BATCH_TEST_ROOT'], true],
  ['tests/midi-status-electron.cjs', ['XLD_STATUS_TEST_ROOT'], true],
  ['tests/multimodel-electron.cjs', ['XLD_MODELS_TEST_ROOT'], true],
  ['tests/roundtrip-electron.cjs', ['XLD_ROUNDTRIP_ROOT'], true],
  ['tests/multimodel-real.cjs', ['XLD_MODELS_TEST_ROOT'], false],
  ['tests/note-shape-python.cjs', ['XLD_SHAPE_TEST_ROOT'], false]
];
// --runtime <runtime.json>: the interpreters and model folders of a release (tests that run a real model need them;
// nothing falls back to an older install).
const at = process.argv.indexOf('--runtime');
if (at > 0) {
  const file = path.resolve(process.argv[at + 1]);
  const config = JSON.parse(fs.readFileSync(file, 'utf8'));
  for (const [key, value] of Object.entries(config.paths || {})) process.env[key] = path.resolve(path.dirname(file), value);
  for (const [key, value] of Object.entries(config.flags || {})) process.env[key] = String(value);
}
const results = [];
for (const [file, needs, underElectron] of TESTS) {
  const missing = needs.filter(key => !process.env[key]);
  if (missing.length) { results.push([file, 'SKIP', 'needs ' + missing.join(', ')]); continue; }
  if (underElectron && !fs.existsSync(electron)) { results.push([file, 'SKIP', 'Electron not found (set ELECTRON)']); continue; }
  const appdata = fs.mkdtempSync(path.join(os.tmpdir(), 'xld-smoke-'));
  const started = Date.now();
  const run = spawnSync(underElectron ? electron : process.execPath, [file], {cwd: HERE, env: {...process.env, APPDATA: appdata, XLD_TEST: '1'}, encoding: 'utf8', timeout: 30 * 60 * 1000, windowsHide: true});
  fs.rmSync(appdata, {recursive: true, force: true});
  const tail = `${run.stdout || ''}${run.stderr || ''}`.trim().split(/\r?\n/).filter(Boolean).slice(-1)[0] || '';
  results.push([file, run.status === 0 ? 'PASS' : 'FAIL', `${((Date.now() - started) / 1000).toFixed(0)} s · ${tail.slice(0, 140)}`]);
}
for (const [file, state, note] of results) console.log(`${state.padEnd(4)} ${file}  ${note}`);
const failed = results.filter(r => r[1] === 'FAIL').length;
console.log(`${results.filter(r => r[1] === 'PASS').length} passed, ${failed} failed, ${results.filter(r => r[1] === 'SKIP').length} skipped`);
process.exitCode = failed ? 1 : 0;
