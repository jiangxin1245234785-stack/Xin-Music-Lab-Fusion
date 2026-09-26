'use strict';
// R4, the half that needs real Python: does revise.py actually preserve everything it is not editing, and does
// it actually refuse everything the serialiser would otherwise eat?
//
// Deliberately NOT in `npm test`. That chain is pure Node so it stays green on a machine without the MIDI
// runtime; adding a Python dependency would make it red for the wrong reason. This runs as its own log and its
// output is published with the round, because a check that only ever ran once is a check nobody is keeping.
//
//   XLD_REVISION_TEST_ROOT=<dir holding fixture.json> node tests/midi-revision-python.cjs
//   fixture.json: {"python": "<interpreter>", "parents": ["<absolute .mid>", ...]}
//
// The library is read only: every parent is copied into the fixture root before anything touches it.
const fs = require('node:fs');
const path = require('node:path'), assert = require('node:assert/strict');
const {spawnSync} = require('node:child_process');

const root = process.env.XLD_REVISION_TEST_ROOT;
if (!root) throw Error('Isolated XLD_REVISION_TEST_ROOT required');
const fixture = JSON.parse(fs.readFileSync(path.join(root, 'fixture.json'), 'utf8'));
const script = path.join(__dirname, '..', 'analysis-midi', 'revise.py');
const work = path.join(root, 'work');
fs.rmSync(work, {recursive: true, force: true});
fs.mkdirSync(work, {recursive: true});

const call = args => {
  const result = spawnSync(fixture.python, ['-X', 'utf8', script, ...args], {encoding: 'utf8', windowsHide: true, timeout: 120000});
  if (result.status === 0) return {ok: true, value: JSON.parse(result.stdout)};
  const last = (result.stderr || '').trim().split(/\r?\n/).filter(Boolean).pop() || '';
  return {ok: false, error: (/ValueError:\s*(revision-[a-z-]+)/.exec(last) || [null, last])[1]};
};
const job = (source, instrument, notes, name) => {
  const file = path.join(work, name + '.job.json');
  fs.writeFileSync(file, JSON.stringify({source, instrument, notes}));
  return call(['--job', file, '--output', path.join(work, name + '.mid')]);
};

// The runtime probe answers before anything else does.
const probe = call(['--engines']);
assert(probe.ok && probe.value[0].available, 'the interpreter can round-trip a MIDI file: ' + JSON.stringify(probe));

const report = {python: fixture.python, parents: [], refusals: {}};
for (const original of fixture.parents) {
  const parent = path.join(work, 'parent-' + report.parents.length + '.mid');
  fs.copyFileSync(original, parent);
  const seen = call(['--inspect', parent]);
  assert(seen.ok, 'inspect: ' + seen.error);
  const rich = seen.value.instruments.reduce((best, item) =>
    (item.controlChanges + item.pitchBends > (best?.controlChanges + best?.pitchBends || -1) ? item : best), null);
  const target = rich && (rich.controlChanges || rich.pitchBends) ? rich : seen.value.instruments[0];
  assert(target.noteCount > 0, 'the fixture parent has notes to edit');

  // An ordinary edit: one velocity. Everything else in the file must survive it.
  const edited = target.notes.map((note, at) => at === 0 ? {...note, velocity: note.velocity === 127 ? 126 : note.velocity + 1} : note);
  const written = job(parent, target.index, edited, 'edit-' + report.parents.length);
  assert(written.ok, path.basename(original) + ': an ordinary edit is accepted: ' + written.error);
  const value = written.value;
  // Exactly one chunk moves, and it is the edited instrument's. This is what makes everything pretty_midi does
  // not model — sysex, markers, aftertouch, running status, channel assignment, end-of-track timing — safe:
  // a field walk over parsed objects is blind to all of it, and byte equality is not.
  assert.equal(value.changedChunk, 2 + target.index);
  assert.equal(value.chunkCount, seen.value.chunks.length);
  assert.equal(value.noteCount, edited.length);
  assert.equal(value.instrumentCount, seen.value.instruments.length, 'no instrument appears or disappears');

  // The named acceptance: the edited part keeps its expression. The piano run the plan names carries 14 CC64.
  const after = call(['--inspect', path.join(work, 'edit-' + report.parents.length + '.mid')]);
  assert(after.ok);
  assert.equal(after.value.instruments.length, seen.value.instruments.length);
  assert.equal(after.value.resolution, seen.value.resolution);
  assert.equal(after.value.tempoChanges, seen.value.tempoChanges);
  for (const was of seen.value.instruments) {
    const now = after.value.instruments[was.index];
    assert.equal(now.name, was.name, 'names survive');
    assert.equal(now.program, was.program);
    assert.equal(now.isDrum, was.isDrum);
    assert.equal(now.controlChanges, was.controlChanges, 'control changes survive on instrument ' + was.index);
    assert.equal(now.pitchBends, was.pitchBends, 'pitch bends survive on instrument ' + was.index);
    if (was.index !== target.index) assert.equal(now.noteCount, was.noteCount, 'untouched parts keep every note');
  }
  report.parents.push({file: path.basename(original), instruments: seen.value.instruments.length,
    edited: target.index, editedName: target.name, notes: target.noteCount,
    controlChanges: target.controlChanges, pitchBends: target.pitchBends,
    chunks: value.chunkCount, changedChunk: value.changedChunk, parentWasCanonical: value.parentWasCanonical});
}

// --- what it refuses, on a real file ----------------------------------------------------------------------------
// Every one of these was measured to be eaten silently by the round trip: the note count survives, or the note
// simply is not there afterwards. Refusing by name beats writing and then failing to notice.
const parent = path.join(work, 'parent-0.mid');
const base = call(['--inspect', parent]).value;
const notes = base.instruments[0].notes;
const first = notes[0];
for (const [label, list] of [
  ['revision-empty-instrument', []],
  ['revision-note-velocity-invalid', [{...first, velocity: 0}, ...notes.slice(1)]],
  ['revision-note-length-invalid', [{...first, end: first.start}, ...notes.slice(1)]],
  ['revision-note-shorter-than-one-tick', [{...first, end: first.start + 0.0002}, ...notes.slice(1)]],
  ['revision-overlapping-notes', [{...first}, {...first, start: first.start + 0.01, end: first.end + 1}]],
  ['revision-no-change', notes]
]) {
  const result = job(parent, 0, list, 'refuse-' + label);
  assert.equal(result.ok, false, label + ' must be refused');
  assert.equal(result.error, label);
  report.refusals[label] = true;
}
assert.equal(job(parent, 99, notes, 'refuse-index').error, 'revision-instrument-missing');
report.refusals['revision-instrument-missing'] = true;

fs.writeFileSync(path.join(root, 'revision-python.json'), JSON.stringify(report, null, 2));
console.log(JSON.stringify({pass: true, parents: report.parents, refusals: Object.keys(report.refusals).length}));
