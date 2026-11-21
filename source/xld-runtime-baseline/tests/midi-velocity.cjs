'use strict';
// Stem-energy velocity: the backends that transcribe pitch but not dynamics must stay wired to the
// post-pass, and the ones that predict their own velocity must stay out of it. The audible behaviour
// is covered by tests/midi-velocity.py, which needs a Python interpreter; this is the registry and
// dispatch guard that runs in the normal suite.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.join(__dirname, '..');
const read = file => fs.readFileSync(path.join(root, file), 'utf8');
const profiles = JSON.parse(read('analysis-midi/models.json'));
const profileFor = id => profiles.find(profile => profile.id === id);

// Flat-velocity backends, and the window each instrument family needs: a plucked or struck attack
// peaks within a few tens of milliseconds, a bowed string takes far longer to speak.
// The expected attack window per engine. Everything else about the catalog is derived from
// models.json rather than listed here: a hardcoded list of which engines get the pass goes
// stale the moment a new model lands — which is exactly what happened when MuScriptor v0.4
// was added. So the rule is inverted. Every profile carrying velocityFromStem is checked,
// whoever added it, and every profile without it has to be on the exempt list below. A new
// flat-velocity engine that forgets the pass therefore fails here instead of shipping flat.
// piano- / bass-muscriptor-large (MODELS-1, 2026-11-15) run with guitar Large's settings, window included.
const WINDOWS = {'muscriptor-medium': 0.08, 'muscriptor-large': 0.08, 'piano-muscriptor-medium': 0.08, 'piano-muscriptor-large': 0.08, 'bass-muscriptor-medium': 0.08, 'bass-muscriptor-large': 0.08, 'strings-muscriptor-medium': 0.15, 'winds-muscriptor-medium': 0.15, 'winds-muscriptor-large': 0.15,
  'strings-muscriptor-large': 0.15, 'strings-muscriptor-large-raw': 0.15, 'strings-muscriptor-large-v04': 0.15,
  'other-muscriptor-medium': 0.15, 'other-muscriptor-large': 0.15,
  'yourmt3-plus': 0.10, 'drums-adtof': 0.08, 'vocals-pyin': 0.12};
// Backends that return a real performance velocity, plus the DrumSep engine, which already measures
// every hit on its own separated kit stem — a broadband pass over the whole kit would be worse.
const UNTOUCHED = ['basic-pitch', 'piano-highres', 'piano-transkun', 'guitar-gaps', 'bass-highres', 'drums-adtof-stems',
  // Retired 2026-09-19; their stored results stay readable, and they will never run again.
  'drums-muscriptor-medium', 'drums-muscriptor-large',
  // A copy of score-vocals.json's notes: the vocal line already carries its own velocities (vocals_runner.py),
  // and converting it must not add a rule on top.
  'vocals-rmvpe'];

const SCALED = profiles.filter(profile => profile.options && profile.options.velocityFromStem).map(p => p.id);
assert.deepEqual([...SCALED].sort(), Object.keys(WINDOWS).sort(),
  'models.json 里带 velocityFromStem 的档案与本测试的窗口表对不上 —— 新模型要补一行');
assert.deepEqual(profiles.map(p => p.id).filter(id => !SCALED.includes(id)).sort(), [...UNTOUCHED].sort(),
  '有档案既不做力度推算也不在豁免名单里 —— 它要么该接上这一步，要么该写明为什么不接');

for (const id of SCALED) {
  const windowPost = WINDOWS[id];
  const profile = profileFor(id);
  assert(profile, id + ' must stay registered');
  const options = profile.options.velocityFromStem;
  assert(options, id + ' must carry velocityFromStem');
  assert.equal(options.windowPostSeconds, windowPost, id + ' attack window');
  assert.equal(options.velocityFloor, 32);
  assert.equal(options.velocityCeil, 127);
  assert(options.velocityFloor < options.velocityCeil, id + ' needs a range to map onto');
  assert(options.percentileLow < options.percentileHigh, id + ' percentiles');
  assert(options.onsetGroupSeconds > 0 && options.onsetGroupSeconds <= 0.05, id + ' onset grouping');
  assert(options.minimumOnsetsForScale >= 1, id + ' pooling threshold');
  // The output differs from what this engine wrote before, so it must not answer to the same name.
  const suffix = profile.options.oneTrack ? '-stemvel1-onetrack1' : '-stemvel1';
  assert(profile.model.endsWith(suffix), id + ' must version its new output: ' + profile.model);
}
for (const id of UNTOUCHED) {
  assert(profileFor(id), id + ' must stay registered');
  assert.equal(profileFor(id).options.velocityFromStem, undefined, id + ' predicts its own velocity');
  assert(!/-stemvel1$/.test(profileFor(id).model), id + ' model string unchanged');
}
assert.equal(new Set(profiles.map(p => p.model)).size, profiles.length, 'model strings stay unique');

// Code ships and the runner dispatches it, last, after the timing passes have settled the notes.
assert(fs.existsSync(path.join(root, 'analysis-midi', 'velocity.py')), 'velocity.py ships');
const velocity = read('analysis-midi/velocity.py');
assert(velocity.includes('def apply(') && velocity.includes('def onset_db('), 'velocity exposes its entry points');
assert(velocity.includes('--selftest'), 'velocity keeps a selftest');
const runner = read('analysis-midi/runner.py');
assert(runner.includes("if 'velocityFromStem' in options:"), 'runner dispatches the pass');
assert(runner.includes('velocityReplaced'), 'the manifest records what the pass replaced');
assert(runner.indexOf("if 'velocityFromStem' in options:") > runner.indexOf('from muscriptor_backend import finish_timing'),
  'the pass runs after the timing passes, so it scales the notes that are actually written');
assert(runner.indexOf("if 'velocityFromStem' in options:") < runner.indexOf('notes = [{"start": note.start'),
  'and before notes.json is built, so both carry the same velocities');

// The DrumSep engine keeps its own per-kit-stem velocity; the two paths must not both claim the drums.
const stems = profileFor('drums-adtof-stems');
assert.deepEqual(stems.options.drumMap, {kick: 36, snare: 38, tom: 47, hihat: 42, crash: 49, ride: 51});
assert.equal(stems.defaultFor, 'drums', 'the DrumSep engine is still the drum default');
console.log('midi-velocity: ok (' + SCALED.length + ' engines scaled, ' + UNTOUCHED.length
  + ' left alone, catalog derived from models.json, runner dispatch ordered, models versioned)');
