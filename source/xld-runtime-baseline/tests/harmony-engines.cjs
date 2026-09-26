'use strict';
// R2 (chords.1): the harmony runner ships with the source tree and lists the same engines Node knows about.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const root = path.join(__dirname, '..');
const read = file => fs.readFileSync(path.join(root, file), 'utf8');
const runner = read('analysis-harmony/harmony_runner.py');
const runnerIds = [...runner.matchAll(/^\s+"id": "(chord-[a-z-]+)",$/gm)].map(match => match[1]);
// The ids now have one definition. What has to stay in sync is Python's ENGINES list against that registry, and
// the one copy that cannot require it — app.js, a renderer script with no module system.
const expected = [...require('../core/result-engines.cjs').HARMONY_ENGINE_IDS];
assert.deepEqual(runnerIds, expected, 'runner ENGINES must list the six chord engines in the registry order');

const listOf = source => JSON.parse(source.match(/const HARMONY_ENGINE_IDS = (\[[^\]]+\]);/)[1].replace(/'/g, '"'));
assert.deepEqual(listOf(read('app.js')), expected, 'app.js HARMONY_ENGINE_IDS out of sync with core/result-engines.cjs');
for (const file of ['core/analysis-service.cjs', 'desktop/main.cjs']) {
  assert(/require\((?:'\.\/|'\.\.\/core\/)result-engines\.cjs'\)/.test(read(file)), `${file} must take the ids from the registry`);
  assert(!/const HARMONY_ENGINE_IDS = \[/.test(read(file)), `${file} must not keep its own copy`);
}
assert(read('workspace-controls.js').includes("'chord-chordmini', 'chord-consonance'"), 'workspace controls must know the new engines');

// Weights never live in source; code does. Vendored ACE keeps its licence.
assert(!fs.existsSync(path.join(root, 'analysis-harmony', 'btc', 'weights')), 'BTC weights must not be in source');
assert(fs.existsSync(path.join(root, 'analysis-harmony', 'btc', 'btc_model.py')), 'vendored BTC code missing');
assert(fs.existsSync(path.join(root, 'analysis-harmony', 'vendor', 'ace', 'LICENSE')), 'consonance-ACE licence missing');
assert(!fs.existsSync(path.join(root, 'analysis-harmony', 'vendor', 'ace', 'ACE', 'checkpoints')), 'ACE checkpoints must not be vendored');
assert(runner.includes('XLD_RUNTIME_ROOT') && runner.includes('XLD_CHORDS_ROOT') && runner.includes('XLD_CHORDS_PYTHON'), 'runner must resolve weights from the runtime env');
assert(runner.includes('"rawLabel": mirex') && runner.includes('"rawLabel": harte'), 'new engines must carry the raw vocabulary label');

// Service wiring: runner path comes from source, consonance python is the configured chords interpreter only.
const saved = { ...process.env };
try {
  const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'xld-harmony-'));
  const chordsPython = path.join(temp, 'chords', 'python.exe');
  fs.mkdirSync(path.dirname(chordsPython), { recursive: true });
  fs.writeFileSync(chordsPython, 'fixture');
  delete process.env.XLD_CHORDS_PYTHON;
  process.env.XLD_HARMONY_PYTHON = path.join(temp, 'ai.exe');
  const service = require('../core/analysis-service.cjs');
  const created = service.createService({ xldRoot: temp, stableXldRoot: temp, analysisRoot: temp });
  assert.deepEqual(created.constants.HARMONY_ENGINE_IDS, expected);
  const internals = read('core/analysis-service.cjs');
  assert(internals.includes("if (HARMONY_ENGINE_IDS.includes(engine)) return path.join(__dirname, '..', 'analysis-harmony', 'harmony_runner.py');"), 'harmony runner must resolve from source');
  assert(internals.includes("if (engine === 'chord-consonance') return firstExisting([process.env.XLD_CHORDS_PYTHON]);"), 'consonance must only run under XLD_CHORDS_PYTHON');
  assert(!internals.includes("path.join(xldRoot, 'analysis-harmony'"), 'no harmony runner lookup may remain in the runtime tree');
  const main = read('desktop/main.cjs');
  assert(main.includes("const HARMONY_RUNNER = path.join(__dirname, '..', 'analysis-harmony', 'harmony_runner.py');"), 'desktop probes must use the source runner');
  assert(!main.includes("path.join(ANALYSIS_RUNTIME_ROOT, 'analysis-harmony'"), 'desktop must not probe the runtime harmony runner');
} finally {
  for (const key of Object.keys(process.env)) if (!(key in saved)) delete process.env[key];
  Object.assign(process.env, saved);
}

// Runtime configuration whitelist and bundle configuration know the chords addon.
const runtimeConfig = fs.readFileSync(path.join(root, '..', 'shared-analysis', 'runtime-config.cjs'), 'utf8');
assert(runtimeConfig.includes("'XLD_CHORDS_ROOT','XLD_CHORDS_PYTHON'"), 'runtime whitelist must accept the chords addon keys');
const bundle = fs.readFileSync(path.join(root, '..', 'release-tools', 'configure-bundle.cjs'), 'utf8');
assert(bundle.includes("XLD_CHORDS_ROOT:optional(chordsRoot,'chords-v1')"), 'bundle configuration must pick up runtime/addons/chords-v1');
const messages = read('i18n/runtime-messages.js');
assert(!messages.includes('four chord models') && !messages.includes('四种和弦模型'), 'batch label must not hardcode the engine count');

// chords.2: ChordMini is the primary chord engine for the album batch and the default Harmony Lab selection; BTC is the fallback.
const app = read('app.js');
assert(app.includes("const PRIMARY_HARMONY_ENGINE = 'chord-chordmini';"), 'ChordMini must be the primary chord engine');
assert(app.includes("pick(PRIMARY_HARMONY_ENGINE, ['chord-btc', ...HARMONY_ENGINE_IDS])"), 'album batch must prefer ChordMini and fall back to BTC first');
assert(app.includes('engine.id === PRIMARY_HARMONY_ENGINE && engine.available'), 'Harmony Lab default selection must prefer ChordMini');
assert(!app.includes("pick('chord-btc'"), 'no BTC-first pick may remain');
console.log('harmony-engines: ok');
