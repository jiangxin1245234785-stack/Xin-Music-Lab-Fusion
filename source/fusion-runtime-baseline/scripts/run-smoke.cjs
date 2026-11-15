'use strict';
// npm run test:smoke - every Electron smoke test of XML in one go (audit fix 1, item 9).
// Each runs under Electron with APPDATA pointed at a fresh temp folder (a copy of XML_SMOKE_APPDATA when set: a fixture
// profile whose settings name a scratch analysis root), never at the user's own profile. A test that needs a fixture
// (an environment variable naming its scratch folder) is skipped, with the variable named, when that is not set.
//   XML_SMOKE_APPDATA=<fixture appdata> [ELECTRON=<electron.exe>] npm run test:smoke
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const {spawnSync} = require('node:child_process');

const HERE = path.resolve(__dirname, '..');
const electron = process.env.ELECTRON || path.resolve(HERE, '..', 'smoke-resonance', 'node_modules', 'electron', 'dist', process.platform === 'win32' ? 'electron.exe' : 'electron');
// [test file, environment variables it needs (all), needs a fixture profile]
const TESTS = [
  ['tests/runtime-smoke.cjs', [], true],
  ['tests/i18n-electron-smoke.cjs', [], true],
  ['tests/i18n-step5-generator-electron.cjs', [], true],
  ['tests/i18n-step6-layout-electron.cjs', [], true],
  ['tests/shell-layout-electron.cjs', [], true],
  ['tests/roundtrip-electron.cjs', ['XML_ROUNDTRIP_ROOT'], false],
  ['tests/midi-models-electron.cjs', ['XLD_MODELS_TEST_ROOT'], false],
  ['tests/separation-models-electron.cjs', ['XLD_SEPARATION_TEST_ROOT'], false],
  ['tests/stems-electron-smoke.cjs', ['STEM_SMOKE_INPUT', 'STEM_SMOKE_OUTPUT'], false]
];
if (!fs.existsSync(electron)) { console.error('Electron not found: set ELECTRON=<path to electron.exe>'); process.exit(1); }
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
for (const [file, needs, profile] of TESTS) {
  const missing = needs.filter(key => !process.env[key]);
  if (profile && !process.env.XML_SMOKE_APPDATA) missing.push('XML_SMOKE_APPDATA');
  if (missing.length) { results.push([file, 'SKIP', 'needs ' + missing.join(', ')]); continue; }
  const appdata = fs.mkdtempSync(path.join(os.tmpdir(), 'xml-smoke-'));
  if (profile) fs.cpSync(process.env.XML_SMOKE_APPDATA, appdata, {recursive: true});
  const started = Date.now();
  const run = spawnSync(electron, [file], {cwd: HERE, env: {...process.env, APPDATA: appdata, XML_TEST: '1'}, encoding: 'utf8', timeout: 15 * 60 * 1000, windowsHide: true});
  fs.rmSync(appdata, {recursive: true, force: true});
  const tail = `${run.stdout || ''}${run.stderr || ''}`.trim().split(/\r?\n/).filter(Boolean).slice(-1)[0] || '';
  results.push([file, run.status === 0 ? 'PASS' : 'FAIL', `${((Date.now() - started) / 1000).toFixed(0)} s · ${tail.slice(0, 140)}`]);
}
for (const [file, state, note] of results) console.log(`${state.padEnd(4)} ${file}  ${note}`);
const failed = results.filter(r => r[1] === 'FAIL').length;
console.log(`${results.filter(r => r[1] === 'PASS').length} passed, ${failed} failed, ${results.filter(r => r[1] === 'SKIP').length} skipped`);
process.exitCode = failed ? 1 : 0;
