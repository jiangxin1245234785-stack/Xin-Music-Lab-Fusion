'use strict';
// R3 (drums.1): the ADTOF + DrumSep engine is registered as an alternative only, resolves its kit weights from the
// runtime addon, ships no weights, and is known to the renderer lists and hints.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.join(__dirname, '..');
const read = file => fs.readFileSync(path.join(root, file), 'utf8');
const profiles = JSON.parse(read('analysis-midi/models.json'));
const adtof = profiles.find(p => p.id === 'drums-adtof');
const stems = profiles.find(p => p.id === 'drums-adtof-stems');
assert(adtof && stems, 'both drum engines registered');
// drums.2: after the user's listening verdict the 7-class DrumSep engine is the default and plain ADTOF the
// alternative. Both stay registered — older results keep reading, and ADTOF remains selectable.
assert.equal(stems.defaultFor, 'drums', 'the DrumSep engine is the drum default');
assert.equal(adtof.defaultFor, undefined, 'plain ADTOF stays available as an alternative');
assert.deepEqual(stems.stems, ['drums']);
assert.equal(stems.backend, 'adtof-stems');
assert.deepEqual(stems.checkpoint, adtof.checkpoint, 'same ADTOF weights');
for (const key of ['kickThreshold', 'snareThreshold', 'tomThreshold', 'hihatThreshold', 'cymbalThreshold', 'chunkFrames', 'contextFrames', 'midiTempo']) {
  assert.equal(stems.options[key], adtof.options[key], `ADTOF option unchanged: ${key}`);
}
assert.equal(stems.options.velocity, undefined, 'no fixed velocity for the DrumSep engine');
const kit = stems.options.kit;
assert.equal(kit.sha256, 'd2a4aa53eb584d21eead358a4e66d1882ad182911be018f052b5da73be9096d0');
assert.equal(kit.size, 437652699);
assert.equal(kit.license, 'CC-BY-NC-ND-4.0');
assert.deepEqual(kit.stems, ['kick', 'snare', 'toms', 'hh', 'ride', 'crash']);
assert.deepEqual(stems.options.drumMap, { kick: 36, snare: 38, tom: 47, hihat: 42, crash: 49, ride: 51 });
assert(stems.model.includes('d2a4aa53') && stems.model.includes('1bc986e596ec'), 'model string binds both checkpoints');
assert.equal(new Set(profiles.map(p => p.model)).size, profiles.length, 'model strings unique');

// Code ships, weights do not.
assert(fs.existsSync(path.join(root, 'analysis-midi', 'drumkit.py')));
assert(fs.existsSync(path.join(root, 'analysis-midi', 'vendor', 'mdx23c', 'tfc_tdf_v3.py')));
assert(fs.existsSync(path.join(root, 'analysis-midi', 'vendor', 'mdx23c', 'LICENSE')));
assert(fs.existsSync(path.join(root, 'analysis-midi', 'vendor', 'mdx23c', 'PROVENANCE.md')));
const walk = dir => fs.readdirSync(dir, { withFileTypes: true }).flatMap(e => e.isDirectory() ? walk(path.join(dir, e.name)) : [path.join(dir, e.name)]);
const bigBinaries = walk(path.join(root, 'analysis-midi')).filter(f => /\.(ckpt|th|pt)$/.test(f) || fs.statSync(f).size > 20 * 1024 * 1024);
assert.deepEqual(bigBinaries, [], 'no separation checkpoints in source: ' + bigBinaries.join(', '));
const drumkit = read('analysis-midi/drumkit.py');
assert(drumkit.includes("os.environ.get('XLD_DRUMSEP_ROOT'") && drumkit.includes('stem-energy-relative'), 'kit resolved from the runtime env with relative velocity');
const runner = read('analysis-midi/runner.py');
assert(runner.includes("profile['backend'] == 'adtof-stems'") && runner.includes('--keep-kit'), 'runner dispatches adtof-stems');
const drums = read('analysis-midi/drums.py');
assert(drums.includes('def activations(') && drums.includes("'velocityMode': 'fixed'"), 'ADTOF adapter keeps its fixed-velocity output');

// Renderer lists, hint and i18n.
assert(read('app.js').includes("'drums-adtof','drums-adtof-stems'"), 'app refresh list knows the engine');
assert(read('workspace-controls.js').includes("'drums-adtof','drums-adtof-stems'"), 'workspace controls know the engine');
assert(read('derived-controls.js').includes("'drums-adtof-stems'?rt('runtime.assets.drumStemsHint')"), 'hint wired');
const messages = read('i18n/runtime-messages.js');
assert.equal((messages.match(/"runtime\.assets\.drumStemsHint"/g) || []).length, 2, 'hint present in both locales');
assert(fs.readFileSync(path.join(root, '..', 'shared-analysis', 'runtime-config.cjs'), 'utf8').includes("'XLD_DRUMSEP_ROOT'"), 'runtime whitelist');
assert(fs.readFileSync(path.join(root, '..', 'release-tools', 'configure-bundle.cjs'), 'utf8').includes("optional(drumsepRoot,'drumsep-v1')"), 'bundle addon');
console.log('midi-drumkit: ok');
