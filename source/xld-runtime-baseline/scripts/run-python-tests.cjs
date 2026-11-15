'use strict';
// npm run test:python - every Python test of XLD in one go (audit fix 1, item 9), with the analysis interpreter
// (XLD_MIDI_PYTHON: the "basic" environment; every test here passes in it). Pass --runtime <runtime.json> to take the
// interpreter from a release's runtime.json, or set XLD_MIDI_PYTHON.
//
// Three tests failed before this script existed (they were in no script, so nobody saw it): they still run and are
// reported as known failures, without failing the run - fixing them is its own job. Any other failure fails the run.
//   npm run test:python -- --runtime ../../releases/<version>/runtime.json
const fs = require('node:fs');
const path = require('node:path');
const {spawnSync} = require('node:child_process');

const HERE = path.resolve(__dirname, '..');
const KNOWN = {
  'muscriptor-gap-fill.py': 'fails at df1556a too (AssertionError); not wired anywhere before',
  'muscriptor-parts.py': 'fails at df1556a too (the engine no longer supports that part); not wired anywhere before',
  'yourmt3-guitar.py': 'fails at df1556a too (YourMT3+ is retired for guitar); not wired anywhere before'
};
const at = process.argv.indexOf('--runtime');
if (at > 0) {
  const file = path.resolve(process.argv[at + 1]);
  const config = JSON.parse(fs.readFileSync(file, 'utf8'));
  for (const [key, value] of Object.entries(config.paths || {})) process.env[key] = path.resolve(path.dirname(file), value);
}
const python = process.env.XLD_MIDI_PYTHON;
if (!python || !fs.existsSync(python)) { console.error('No interpreter: set XLD_MIDI_PYTHON or pass --runtime <runtime.json>'); process.exit(1); }
const results = [];
for (const name of fs.readdirSync(path.join(HERE, 'tests')).filter(n => n.endsWith('.py')).sort()) {
  const started = Date.now();
  const run = spawnSync(python, ['-I', path.join('tests', name)], {cwd: HERE, encoding: 'utf8', timeout: 10 * 60 * 1000, windowsHide: true, env: {...process.env, PYTHONDONTWRITEBYTECODE: '1', PYTHONUTF8: '1'}});
  const tail = `${run.stdout || ''}${run.stderr || ''}`.trim().split(/\r?\n/).filter(Boolean).slice(-1)[0] || '';
  const state = run.status === 0 ? (KNOWN[name] ? 'PASS (was known failing)' : 'PASS') : KNOWN[name] ? 'KNOWN' : 'FAIL';
  results.push([name, state, `${((Date.now() - started) / 1000).toFixed(0)} s · ${(KNOWN[name] && run.status !== 0 ? KNOWN[name] : tail).slice(0, 140)}`]);
}
for (const [name, state, note] of results) console.log(`${state.padEnd(5)} ${name}  ${note}`);
const failed = results.filter(r => r[1] === 'FAIL').length;
console.log(`${results.filter(r => r[1].startsWith('PASS')).length} passed, ${failed} failed, ${results.filter(r => r[1] === 'KNOWN').length} known failures`);
process.exitCode = failed ? 1 : 0;
