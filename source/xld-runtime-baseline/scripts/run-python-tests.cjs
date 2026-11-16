'use strict';
// npm run test:python - every Python test of XLD in one go (audit fix 1, item 9), with the analysis interpreter
// (XLD_MIDI_PYTHON: the "basic" environment; every test here passes in it). Pass --runtime <runtime.json> to take the
// interpreter from a release's runtime.json, or set XLD_MIDI_PYTHON.
//
// A test that needs another environment says so in its first lines: `# xld-python: XLD_MUSCRIPTOR_PYTHON` (any XLD_*
// variable naming an interpreter); it is then run with that one. Any failure fails the run. (B7, 2026-11-15: the three
// tests once listed here as known failures were fixed - out of date, or run in the wrong environment - or removed.)
//   npm run test:python -- --runtime ../../releases/<version>/runtime.json
const fs = require('node:fs');
const path = require('node:path');
const {spawnSync} = require('node:child_process');

const HERE = path.resolve(__dirname, '..');
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
  const head = fs.readFileSync(path.join(HERE, 'tests', name), 'utf8').split(/\r?\n/).slice(0, 5).join('\n');
  const wanted = /^#\s*xld-python:\s*(XLD_[A-Z_]+)\s*$/m.exec(head);
  const interpreter = wanted ? process.env[wanted[1]] : python;
  if (!interpreter || !fs.existsSync(interpreter)) { results.push([name, 'FAIL', `0 s · no interpreter: ${wanted ? wanted[1] : 'XLD_MIDI_PYTHON'} (pass --runtime)`]); continue; }
  const run = spawnSync(interpreter, ['-I', path.join('tests', name)], {cwd: HERE, encoding: 'utf8', timeout: 10 * 60 * 1000, windowsHide: true, env: {...process.env, PYTHONDONTWRITEBYTECODE: '1', PYTHONUTF8: '1'}});
  const tail = `${run.stdout || ''}${run.stderr || ''}`.trim().split(/\r?\n/).filter(Boolean).slice(-1)[0] || '';
  const state = run.status === 0 ? 'PASS' : 'FAIL';
  results.push([name, state, `${((Date.now() - started) / 1000).toFixed(0)} s${wanted ? ' · ' + wanted[1] : ''} · ${tail.slice(0, 140)}`]);
}
for (const [name, state, note] of results) console.log(`${state.padEnd(5)} ${name}  ${note}`);
const failed = results.filter(r => r[1] === 'FAIL').length;
console.log(`${results.filter(r => r[1] === 'PASS').length} passed, ${failed} failed`);
process.exitCode = failed ? 1 : 0;
