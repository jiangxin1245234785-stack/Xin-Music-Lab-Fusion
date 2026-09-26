'use strict';
// The read-only SMF reader. Its one job is to say which instrument each note in notes.json belongs to, and the
// way it fails matters more than the way it succeeds: a segmentation that is wrong looks completely normal on
// screen, and would later attach an edit to the wrong part of the file.
//
// Everything here is built byte by byte rather than read from the library, because the library changes under us
// and a test that depends on it stops being a test. The library-wide measurement — 124 run directories, all
// parsed, all matched, zero within-instrument ordering violations — is recorded in the round's handoff.
const assert = require('node:assert/strict');
const {readMidiFile, segment} = require('../core/midi-read.cjs');

const varint = value => {
  const out = [value & 0x7f];
  value >>= 7;
  while (value > 0) { out.unshift((value & 0x7f) | 0x80); value >>= 7; }
  return out;
};
const chunk = (id, body) => Buffer.concat([Buffer.from(id, 'ascii'), (() => {
  const size = Buffer.alloc(4); size.writeUInt32BE(body.length); return size;
})(), body]);
const track = events => chunk('MTrk', Buffer.from([...events.flat(Infinity), 0x00, 0xff, 0x2f, 0x00]));
const header = (format, tracks, division) => {
  const body = Buffer.alloc(6);
  body.writeUInt16BE(format, 0); body.writeUInt16BE(tracks, 2); body.writeUInt16BE(division, 4);
  return chunk('MThd', body);
};
const file = (format, division, trackBuffers) => Buffer.concat([header(format, trackBuffers.length, division), ...trackBuffers]);
const name = text => [0x00, 0xff, 0x03, text.length, ...Buffer.from(text, 'utf8')];
const program = (channel, value) => [0x00, 0xc0 | channel, value];
const on = (channel, pitch, velocity = 80, delta = 0) => [...varint(delta), 0x90 | channel, pitch, velocity];
const off = (channel, pitch, delta = 120) => [...varint(delta), 0x80 | channel, pitch, 0];
const tempo = micros => [0x00, 0xff, 0x51, 0x03, (micros >> 16) & 0xff, (micros >> 8) & 0xff, micros & 0xff];

// --- what it reads ---------------------------------------------------------------------------------------------
const simple = readMidiFile(file(1, 960, [
  track([tempo(500000)]),
  track([...name('cello'), ...program(0, 48), ...on(0, 60), ...off(0, 60), ...on(0, 62), ...off(0, 62)]),
  track([...name('violin'), ...program(1, 40), ...on(1, 72), ...off(1, 72)])
]));
assert.equal(simple.format, 1);
assert.equal(simple.division, 960);
assert.equal(simple.noteCount, 3);
assert.equal(simple.tempoChanges, 1);
assert.deepEqual(simple.instruments.map(i => [i.name, i.program, i.channel, i.track, i.noteCount]),
  [['cello', 48, 0, 1, 2], ['violin', 40, 1, 2, 1]], 'named, in the order first encountered');

// A note-on with velocity 0 is a note-off. Counting it as an onset is the classic way to double a note count,
// and it would silently shift every instrument boundary after it.
const zeroVelocity = readMidiFile(file(0, 480, [track([...program(0, 0), ...on(0, 60, 90), ...on(0, 60, 0, 240), ...on(0, 64, 90, 10), ...off(0, 64)])]));
assert.equal(zeroVelocity.noteCount, 2, 'velocity-0 note-on is a note-off, not a second onset');

// Running status: the status byte is omitted and the previous one applies.
const running = readMidiFile(file(0, 480, [track([...program(0, 0), ...on(0, 60), [0x00, 62, 80].flat(), ...off(0, 60), ...off(0, 62)])]));
assert.equal(running.noteCount, 2, 'running status note-on is still a note');

// Anything the reader does not model is skipped by length and counted, never guessed at.
const sysex = readMidiFile(file(0, 480, [track([[0x00, 0xf0, 0x03, 0x7e, 0x7f, 0xf7].flat(), ...program(0, 0), ...on(0, 60), ...off(0, 60)])]));
assert.equal(sysex.noteCount, 1);
assert.equal(sysex.unknownEvents, 1, 'a SysEx block is stepped over and reported, not swallowed');

// --- how it groups ---------------------------------------------------------------------------------------------
// pretty_midi makes one instrument per (program, channel, track), which is the order notes.json concatenates in.
const grouped = readMidiFile(file(1, 960, [
  track([...name('mixed'), ...program(0, 24), ...on(0, 60), ...off(0, 60),
    ...program(1, 30), ...on(1, 64), ...off(1, 64),
    ...on(0, 62), ...off(0, 62)])
]));
assert.deepEqual(grouped.instruments.map(i => [i.program, i.channel, i.noteCount]), [[24, 0, 2], [30, 1, 1]],
  'two channels in one track are two instruments, ordered by first note');
// A program change mid-track opens a new instrument for later notes on that channel.
const reprogrammed = readMidiFile(file(0, 480, [track([...program(0, 0), ...on(0, 60), ...off(0, 60), ...program(0, 48), ...on(0, 62), ...off(0, 62)])]));
assert.deepEqual(reprogrammed.instruments.map(i => [i.program, i.noteCount]), [[0, 1], [48, 1]]);
// Channel 10 is percussion.
const drums = readMidiFile(file(0, 480, [track([...on(9, 38), ...off(9, 38)])]));
assert.equal(drums.instruments[0].isDrum, true);
assert.equal(readMidiFile(file(0, 480, [track([...on(0, 38), ...off(0, 38)])])).instruments[0].isDrum, false);

// --- what it refuses -------------------------------------------------------------------------------------------
for (const [label, buffer] of [
  ['too short', Buffer.alloc(8)],
  ['not a midi file', Buffer.concat([Buffer.from('RIFF', 'ascii'), Buffer.alloc(40)])],
  ['bad header length', Buffer.concat([chunk('MThd', Buffer.alloc(8)), track([])])],
  ['truncated track', file(1, 960, [track([...program(0, 0), ...on(0, 60)])]).subarray(0, 20)]
]) assert.throws(() => readMidiFile(buffer), /midi-read-/, label + ' must be refused');
// SMPTE timing exists but nothing in this project produces it, and guessing at it would silently misplace time.
assert.throws(() => readMidiFile(file(0, 0xe728, [track([])])), /smpte/, 'SMPTE division is refused rather than misread');
// A header claiming more tracks than the file holds is not fatal: the chunks actually present are what counts,
// and the count check in segment() is what decides whether the result may be used.
const overdeclared = Buffer.concat([header(1, 3, 960), track([...program(0, 0), ...on(0, 60), ...off(0, 60)])]);
assert.equal(readMidiFile(overdeclared).tracks, 1);
assert.equal(readMidiFile(overdeclared).declaredTracks, 3);
// A chunk this reader does not know is stepped over by its own length, which is what the specification asks for.
const foreign = Buffer.concat([header(1, 1, 960), chunk('XFIR', Buffer.from([1, 2, 3, 4, 5])),
  track([...program(0, 0), ...on(0, 60), ...off(0, 60)])]);
assert.equal(readMidiFile(foreign).noteCount, 1, 'an unknown chunk does not stop the tracks after it being read');
// An empty file is a real state on disk — there is a 41-byte strings result in the library — and reads as zero.
const empty = readMidiFile(file(1, 960, [track([])]));
assert.equal(empty.noteCount, 0);
assert.deepEqual(empty.instruments, []);

// --- segment(): the only thing callers use, and it fails closed -------------------------------------------------
const five = file(1, 960, [
  track([tempo(500000)]),
  ...[['cello', 0, 3], ['string ensemble', 1, 2], ['violin', 2, 4]].map(([label, channel, count]) =>
    track([...name(label), ...program(channel, 48), ...Array.from({length: count}, (_, i) => [...on(channel, 60 + i), ...off(channel, 60 + i)]).flat()]))
]);
const good = segment(five, 9);
assert.equal(good.ok, true);
assert.deepEqual(good.instruments.map(i => i.name), ['cello', 'string ensemble', 'violin']);
assert.deepEqual(good.offsets, [[0, 3], [3, 5], [5, 9]], 'offsets are the cumulative counts, which is how the flat list splits');
assert.equal(good.offsets.at(-1)[1], good.noteCount);
// The decisive refusal: if the file does not account for exactly the notes in notes.json, there is no answer.
// Returning a plausible-looking split here is worse than returning nothing.
const mismatch = segment(five, 8);
assert.equal(mismatch.ok, false);
assert.equal(mismatch.error, 'midi-read-count-mismatch');
assert.equal(mismatch.offsets, null, 'and no offsets are offered at all');
assert.equal(mismatch.noteCount, 9, 'while still saying what the file did contain');
const unreadable = segment(Buffer.from('not midi at all'), 3);
assert.equal(unreadable.ok, false);
assert.equal(unreadable.offsets, null);
assert(/midi-read-/.test(unreadable.error), unreadable.error);
// A single-instrument file is the common case and must not be split.
assert.deepEqual(segment(file(0, 480, [track([...program(0, 33), ...on(0, 40), ...off(0, 40), ...on(0, 42), ...off(0, 42)])]), 2).offsets, [[0, 2]]);

// Writing is not this module's job: an edited file must be rewritten from its parent through pretty_midi so that
// every event this reader does not model survives.
const source = require('node:fs').readFileSync(require('node:path').join(__dirname, '..', 'core', 'midi-read.cjs'), 'utf8');
assert(!/writeFile|Buffer\.concat\(\[Buffer\.from\('MThd/.test(source), 'the reader must never emit a MIDI file');

console.log('midi read: ok (grouping matches pretty_midi order, velocity-0 and running status handled, malformed refused, and a count mismatch yields no segmentation at all)');
