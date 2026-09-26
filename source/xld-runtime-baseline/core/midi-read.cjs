'use strict';
// A read-only Standard MIDI File reader, just enough to answer one question: which instrument does each note in
// notes.json belong to?
//
// notes.json is a flat list. runner.py builds it with `for part in midi.instruments for note in part.notes`, which
// throws the instrument away — so a strings result that is really five named parts (the MEGURI reference track is
// cello 1128 / string ensemble 1014 / contrabass 265 / violin 1123 / viola 1168) arrives as one undifferentiated
// run of 4698 notes. Reading the .mid back is the only way to recover the boundaries.
//
// WRITING STAYS IN PYTHON. This module never emits a MIDI file: an edited file must be produced by rewriting the
// parent through pretty_midi, so that every event this reader does not model — and there are many — survives.
//
// The grouping must match pretty_midi's, because the order it produced is the order notes.json is concatenated in.
// pretty_midi creates one Instrument per (program, channel, track) as it first encounters a note, so that is the
// key and first-encounter is the order.
const EVENT_NAMES = Object.freeze({0x80: 'note-off', 0x90: 'note-on', 0xa0: 'aftertouch', 0xb0: 'control-change',
  0xc0: 'program-change', 0xd0: 'channel-pressure', 0xe0: 'pitch-bend'});

function reader(buffer) {
  let at = 0;
  return {
    get offset() { return at; },
    seek(to) { at = to; },
    byte() { if (at >= buffer.length) throw new Error('midi-read-truncated'); return buffer[at++]; },
    bytes(count) { if (at + count > buffer.length) throw new Error('midi-read-truncated'); const slice = buffer.subarray(at, at + count); at += count; return slice; },
    uint16() { const value = this.bytes(2); return (value[0] << 8) | value[1]; },
    uint32() { const value = this.bytes(4); return ((value[0] << 24) | (value[1] << 16) | (value[2] << 8) | value[3]) >>> 0; },
    // Variable-length quantity. Four bytes is the format's own maximum; a fifth means the file is not a MIDI file.
    varint() {
      let value = 0;
      for (let index = 0; index < 4; index += 1) {
        const byte = this.byte();
        value = (value << 7) | (byte & 0x7f);
        if (!(byte & 0x80)) return value;
      }
      throw new Error('midi-read-invalid-varint');
    }
  };
}

// Parse one track into the events this reader models, keeping everything else only as a count so a caller can see
// that something it does not understand was present.
function readTrack(buffer, start, length, trackIndex) {
  const read = reader(buffer);
  read.seek(start);
  const end = start + length;
  const events = [];
  let status = 0, ticks = 0, name = null, unknown = 0;
  while (read.offset < end) {
    ticks += read.varint();
    let byte = read.byte();
    if (byte < 0x80) { if (!status) throw new Error('midi-read-running-status'); read.seek(read.offset - 1); byte = status; }
    else if (byte < 0xf0) status = byte;
    if (byte === 0xff) {
      const type = read.byte(), size = read.varint(), payload = read.bytes(size);
      if (type === 0x03 && name === null) name = payload.toString('utf8');
      else if (type === 0x51 && size === 3) events.push({ticks, kind: 'set-tempo', value: (payload[0] << 16) | (payload[1] << 8) | payload[2]});
      else if (type === 0x58 && size >= 2) events.push({ticks, kind: 'time-signature', numerator: payload[0], denominator: 2 ** payload[1]});
      else if (type === 0x2f) break;
      else unknown += 1;
      continue;
    }
    if (byte === 0xf0 || byte === 0xf7) { read.bytes(read.varint()); unknown += 1; continue; }
    const command = byte & 0xf0, channel = byte & 0x0f;
    const kind = EVENT_NAMES[command];
    if (!kind) throw new Error('midi-read-unknown-status');
    const size = command === 0xc0 || command === 0xd0 ? 1 : 2;
    const data = read.bytes(size);
    // A note-on with velocity 0 is a note-off. Treating it as an onset is the classic way to double a note count.
    if (command === 0x90 && data[1] === 0) events.push({ticks, kind: 'note-off', channel, pitch: data[0], track: trackIndex});
    else if (kind === 'note-on' || kind === 'note-off') events.push({ticks, kind, channel, pitch: data[0], velocity: data[1], track: trackIndex});
    else if (kind === 'program-change') events.push({ticks, kind, channel, program: data[0], track: trackIndex});
    else events.push({ticks, kind, channel, track: trackIndex});
  }
  return {events, name, unknown};
}

// `instruments` come back in the order pretty_midi would have produced them, each with the number of notes it
// holds. Those counts are what segment the flat notes.json array.
function readMidiFile(buffer) {
  if (!Buffer.isBuffer(buffer) || buffer.length < 14) throw new Error('midi-read-too-short');
  const head = reader(buffer);
  if (head.bytes(4).toString('ascii') !== 'MThd') throw new Error('midi-read-not-midi');
  if (head.uint32() !== 6) throw new Error('midi-read-bad-header');
  const format = head.uint16(), declaredTracks = head.uint16(), division = head.uint16();
  if (division & 0x8000) throw new Error('midi-read-smpte-unsupported');
  const tracks = [];
  let at = 14;
  while (at + 8 <= buffer.length) {
    const id = buffer.toString('ascii', at, at + 4), length = buffer.readUInt32BE(at + 4);
    if (at + 8 + length > buffer.length) throw new Error('midi-read-truncated');
    // Anything that is not an MTrk is skipped by length, which is what the specification asks for.
    if (id === 'MTrk') tracks.push(readTrack(buffer, at + 8, length, tracks.length));
    at += 8 + length;
  }
  // Bytes left over that are too short to be a chunk header mean the file was cut off. Reading the tracks that
  // did arrive and reporting a note count for them would turn a truncated file into a confident wrong answer.
  if (at !== buffer.length) throw new Error('midi-read-truncated');
  if (!tracks.length) return {format, division, tracks: 0, instruments: [], noteCount: 0, unknownEvents: 0, tempoChanges: 0};

  // Conservative lower bound for a new split: at least one tick at the slowest tempo.
  // The existing writer remains the authority for exact event/tick round trips.
  const tempos=tracks[0].events.filter(e=>e.kind==='set-tempo');
  const values=tempos.map(e=>e.value);if(!tempos.some(e=>e.ticks===0))values.push(500000);
  const maxTickSeconds=division>0?Math.max(...values)/division/1e6:null;
  const instruments = [], byKey = new Map();
  let noteCount = 0, unknownEvents = 0, tempoChanges = 0;
  for (const track of tracks) {
    // Program state is per channel and resets for each track, exactly as pretty_midi reads it.
    const program = new Array(16).fill(0);
    unknownEvents += track.unknown;
    for (const event of track.events) {
      if (event.kind === 'set-tempo') { tempoChanges += 1; continue; }
      if (event.kind === 'program-change') { program[event.channel] = event.program; continue; }
      if (event.kind !== 'note-on') continue;
      const isDrum = event.channel === 9;
      const key = program[event.channel] + '|' + event.channel + '|' + event.track;
      let instrument = byKey.get(key);
      if (!instrument) {
        instrument = {index: instruments.length, name: track.name || '', program: program[event.channel], isDrum, channel: event.channel, track: event.track, noteCount: 0};
        byKey.set(key, instrument);
        instruments.push(instrument);
      }
      instrument.noteCount += 1;
      noteCount += 1;
    }
  }
  return {format, division, tracks: tracks.length, declaredTracks, instruments, noteCount, unknownEvents, tempoChanges, maxTickSeconds};
}

// The whole point: turn a flat note list into per-instrument slices, or refuse. Refusing is a real outcome —
// guessing a segmentation that is wrong looks completely normal on screen and would attach edits to the wrong
// part of the file.
function segment(buffer, flatNoteCount) {
  let file;
  try { file = readMidiFile(buffer); }
  catch (error) { return {ok: false, error: error.message, instruments: [], offsets: null}; }
  if (file.noteCount !== flatNoteCount) return {ok: false, error: 'midi-read-count-mismatch', instruments: file.instruments, offsets: null, noteCount: file.noteCount};
  const offsets = [];
  let at = 0;
  for (const instrument of file.instruments) { offsets.push([at, at + instrument.noteCount]); at += instrument.noteCount; }
  return {ok: true, ...file, offsets};
}

module.exports = {readMidiFile, segment};
