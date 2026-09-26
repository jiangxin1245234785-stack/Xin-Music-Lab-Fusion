"""Write one hand-edited revision of a MIDI file: replace the notes of exactly one instrument.

The parent .mid is the input, never notes.json — a strings result is five named instrument tracks and notes.json
threw that structure away, so rebuilding from it would collapse five parts into one.

WHAT THIS VERIFIES, AND WHY IT IS NOT WHAT THE PLAN ASKED FOR
-------------------------------------------------------------
The plan asked for a field-by-field "reread the parent vs reread the child" comparison of every instrument except
the edited one. Measured on this project's own corpus, that shape is wrong twice over:

  * For the untouched instruments it cannot fail. Every .mid in the library was written by pretty_midi, so it is
    already a fixed point of the round trip: all 163 files in the two analysis roots (116 + 47) re-serialise
    byte-identically. A check that is structurally incapable of failing will pass forever and be read as evidence
    that it works.
  * For the EDITED instrument the plan excludes verification entirely — and that is the only place corruption
    actually happens. Measured: a same-pitch overlap comes back with the note count intact, the pitches intact,
    the velocities intact, and an end time up to a full second early.

So verification is inverted relative to the plan:

  UNTOUCHED INSTRUMENTS -> raw MTrk chunk digests. An edit's blast radius in the written file is exactly one
  chunk, so every other chunk (and MThd) must be byte-identical. This is immune to everything pretty_midi drops
  when it reads — sysex, markers, aftertouch, running status, channel assignment, end-of-track timing — none of
  which any field walk can see, because both sides of a field walk are equally blind to them.

  THE EDITED INSTRUMENT -> compared against the REQUESTED notes, because the parent no longer describes them.

The child is compared against a CONTROL file — the parent written back unchanged — rather than against the parent
bytes. Both go through the same serialiser, so a parent that was not already canonical is normalised identically
on both sides and cannot masquerade as an edit.

Notes that the round trip is known to eat are refused up front rather than written and then missed:
zero or negative length, anything shorter than one tick, velocity 0, and same-pitch overlaps within the
instrument. merge.py works around overlaps by splitting them into extra lanes; a revision must not, because that
would silently change the instrument structure the caller addressed by index.
"""
import argparse
import hashlib
import json
from pathlib import Path

CHUNK_HEADER = 8


def chunks(data):
    """Split a Standard MIDI File into its raw chunks, so they can be compared without parsing them."""
    out, at = [], 0
    while at + CHUNK_HEADER <= len(data):
        identifier = data[at:at + 4].decode('ascii', 'replace')
        length = int.from_bytes(data[at + 4:at + 8], 'big')
        end = at + CHUNK_HEADER + length
        if end > len(data):
            raise ValueError('revision-source-truncated')
        out.append({'id': identifier, 'bytes': end - at, 'sha256': hashlib.sha256(data[at:end]).hexdigest()})
        at = end
    if at != len(data):
        raise ValueError('revision-source-truncated')
    return out


def describe(path):
    import pretty_midi
    data = Path(path).read_bytes()
    midi = pretty_midi.PrettyMIDI(str(path))
    tempos, _ = midi.get_tempo_changes()
    return {
        'resolution': int(midi.resolution),
        'tempoChanges': len(tempos),
        'chunks': chunks(data),
        # int()/float() throughout: pretty_midi hands back numpy scalars, and numpy int32 is not a Python int,
        # so json.dumps refuses it. The failure is a traceback on stdout, which is exactly what must never reach
        # the interface.
        'instruments': [{
            'index': index, 'name': str(item.name), 'program': int(item.program), 'isDrum': bool(item.is_drum),
            'noteCount': len(item.notes), 'controlChanges': len(item.control_changes), 'pitchBends': len(item.pitch_bends),
            'notes': [{'start': float(n.start), 'end': float(n.end), 'pitch': int(n.pitch), 'velocity': int(n.velocity)} for n in item.notes],
        } for index, item in enumerate(midi.instruments)],
    }


def check_requested(midi, notes):
    """Refuse what the serialiser would silently eat. Every one of these was measured, not guessed."""
    if not notes:
        # Emptying an instrument makes pretty_midi's READER drop it on the next open (only note_on creates an
        # instrument), which shifts every later index — and instruments are addressed by index. R4 refuses;
        # R10 decides what deleting a whole part should mean.
        raise ValueError('revision-empty-instrument')
    seen = {}
    for at, note in enumerate(notes):
        start, end = float(note['start']), float(note['end'])
        pitch, velocity = int(note['pitch']), int(note['velocity'])
        if not 0 <= pitch <= 127:
            raise ValueError('revision-note-pitch-invalid')
        # Velocity 0 is a note-off in the file format: the note would be written and then read back as nothing.
        if not 1 <= velocity <= 127:
            raise ValueError('revision-note-velocity-invalid')
        if not start >= 0 or not end > start:
            raise ValueError('revision-note-length-invalid')
        # Shorter than one tick and it quantises to zero length, which the reader discards. Measured threshold at
        # 960 PPQ / 120 BPM: 0.26 ms disappears, 0.40 ms survives.
        if round(midi.time_to_tick(end)) <= round(midi.time_to_tick(start)):
            raise ValueError('revision-note-shorter-than-one-tick')
        previous = seen.get(pitch)
        # The one genuine silent-loss path: pretty_midi writes note-off as note-on velocity 0, and the reader
        # closes ALL open notes of that pitch at the first one. The count survives; the length does not.
        if previous is not None and start < previous:
            raise ValueError('revision-overlapping-notes')
        seen[pitch] = end
    return notes


def write_revision(job, output):
    import pretty_midi
    source = Path(job['source'])
    index = int(job['instrument'])
    output = Path(output)
    output.parent.mkdir(parents=True, exist_ok=True)

    original = source.read_bytes()
    midi = pretty_midi.PrettyMIDI(str(source))
    if not midi.instruments:
        # The 41-byte strings result is a real active pointer, not a hypothetical. Adding a first note means
        # choosing a program, a track name and a channel, which is a decision for the editing round.
        raise ValueError('revision-source-has-no-instruments')
    if not 0 <= index < len(midi.instruments):
        raise ValueError('revision-instrument-missing')
    requested = check_requested(midi, job['notes'])

    # The control: the parent written back with no edit at all. Comparing against this rather than against the
    # parent's own bytes means a parent that was not already in the serialiser's canonical form is normalised on
    # both sides, instead of showing up as if the edit had touched everything.
    control_path = output.with_suffix('.control.mid')
    midi.write(str(control_path))
    control = control_path.read_bytes()

    child = pretty_midi.PrettyMIDI(str(source))
    child.instruments[index].notes = [
        pretty_midi.Note(velocity=int(n['velocity']), pitch=int(n['pitch']), start=float(n['start']), end=float(n['end']))
        for n in sorted(requested, key=lambda n: (float(n['start']), int(n['pitch'])))]
    child.write(str(output))
    written = output.read_bytes()

    control_chunks, child_chunks = chunks(control), chunks(written)
    if len(control_chunks) != len(child_chunks):
        raise ValueError('revision-chunk-count-changed')
    differing = [at for at, (a, b) in enumerate(zip(control_chunks, child_chunks)) if a['sha256'] != b['sha256']]
    # pretty_midi writes MThd, one timing track, then one track per instrument. Asserting the exact index rather
    # than just "one chunk" means a change in that layout fails loudly instead of quietly verifying the wrong track.
    expected = 2 + index   # chunk 0 is MThd, chunk 1 is the timing track, then one per instrument
    # Submitting the notes the instrument already has produces a file identical to the parent. That is not a
    # revision, and saving it would spend a version slot on a duplicate the version list cannot tell apart.
    if not differing:
        raise ValueError('revision-no-change')
    if differing != [expected]:
        raise ValueError('revision-blast-radius: expected only chunk %d to change, got %s' % (expected, differing))

    # The edited instrument, against what was asked for — the parent cannot serve as the reference here, because
    # the parent is exactly what this edit replaced.
    saved = pretty_midi.PrettyMIDI(str(output))
    if len(saved.instruments) != len(child.instruments):
        raise ValueError('revision-instrument-count-changed')
    after = saved.instruments[index].notes
    if len(after) != len(requested):
        raise ValueError('revision-note-count-changed: wrote %d, read back %d' % (len(requested), len(after)))
    tick = saved.tick_to_time(1) - saved.tick_to_time(0)

    # Both sides get the same canonical order before they are paired. pretty_midi appends a note when it reads the
    # note-OFF, so what comes back is ordered by end time, not by start -- zipping the read order against the
    # written order compares unrelated notes and reports a difference that is not there.
    order = lambda note: (int(note['pitch']), float(note['start']), float(note['end']), int(note['velocity']))
    # The edited instrument's chunk is allowed to change, which means everything else inside it -- its sustain
    # pedal, its pitch bends, its name, its program -- is inside the blast radius and unguarded by the chunk
    # digests. A revision replaces NOTES; the parent is the right reference for the rest of the instrument.
    # Measured: without this, wiping 646 control changes off the edited piano part passes every other check.
    before = midi.instruments[index]
    kept = saved.instruments[index]
    if (str(before.name), int(before.program), bool(before.is_drum)) != (str(kept.name), int(kept.program), bool(kept.is_drum)):
        raise ValueError('revision-instrument-identity-changed')
    for field, keys in [('control_changes', ('number', 'value')), ('pitch_bends', ('pitch',))]:
        was, now = getattr(before, field), getattr(kept, field)
        if len(was) != len(now):
            raise ValueError('revision-expression-lost: %s %d -> %d' % (field, len(was), len(now)))
        for a, b in zip(was, now):
            if any(int(getattr(a, key)) != int(getattr(b, key)) for key in keys) or abs(a.time - b.time) > tick:
                raise ValueError('revision-expression-changed: ' + field)

    read_back = [{'pitch': int(n.pitch), 'start': float(n.start), 'end': float(n.end), 'velocity': int(n.velocity)} for n in after]
    for want, got in zip(sorted(requested, key=order), sorted(read_back, key=order)):
        if int(want['pitch']) != got['pitch'] or int(want['velocity']) != got['velocity']:
            raise ValueError('revision-note-changed')
        # One tick, not one millisecond: a millisecond is nearly two ticks here, which is enough room to hide a
        # real truncation. Nothing may move by more than the grid the file is written on.
        if abs(float(want['start']) - got['start']) > tick or abs(float(want['end']) - got['end']) > tick:
            raise ValueError('revision-note-moved')

    # Cache the VERIFIED file, including untouched instruments, in parser order. A partial cache makes
    # the reader reject the whole multi-instrument MIDI on its next load.
    flattened = [{'start': float(n.start), 'end': float(n.end), 'pitch': int(n.pitch), 'velocity': int(n.velocity)}
                 for part in saved.instruments for n in part.notes]
    output.with_suffix('.notes.json').write_text(json.dumps(flattened), encoding='utf-8')
    control_path.unlink(missing_ok=True)
    return {
        'ok': True,
        'instrument': index,
        'instrumentName': str(saved.instruments[index].name),
        'noteCount': len(after),
        'instrumentCount': len(saved.instruments),
        'resolution': int(saved.resolution),
        'tickSeconds': float(tick),
        'changedChunk': expected,
        'chunkCount': len(child_chunks),
        # Whether the parent was already the serialiser's own output. Informational: the comparison above does not
        # depend on it, but a false here means this parent came from somewhere else and is worth knowing about.
        'parentWasCanonical': control == original,
        'digests': {'parent': hashlib.sha256(original).hexdigest(), 'child': hashlib.sha256(written).hexdigest()},
        'duration': float(saved.get_end_time()),
    }


def selftest():
    """Answer the runtime probe in the shape every other runner answers it: a list of available ids.

    The probe's whole contract is `--engines` -> [{id, available}], so the writer answers the same way rather
    than needing its own machinery. It does a real round trip instead of a bare import, because an interpreter
    that can import pretty_midi but cannot write a file is a runtime that fails at save time, which is the worst
    moment to find out.
    """
    try:
        import tempfile
        import pretty_midi
        midi = pretty_midi.PrettyMIDI(initial_tempo=120, resolution=960)
        part = pretty_midi.Instrument(program=0, name='probe')
        part.notes.append(pretty_midi.Note(velocity=64, pitch=60, start=0.0, end=0.5))
        midi.instruments.append(part)
        with tempfile.TemporaryDirectory() as directory:
            probe = Path(directory) / 'probe.mid'
            midi.write(str(probe))
            back = pretty_midi.PrettyMIDI(str(probe))
            ok = len(back.instruments) == 1 and len(back.instruments[0].notes) == 1 and len(chunks(probe.read_bytes())) == 3
        return [{'id': 'manual-revision', 'available': bool(ok)}]
    except Exception as error:                                   # noqa: BLE001 - the probe reports, never raises
        return [{'id': 'manual-revision', 'available': False, 'error': str(error)[:200]}]


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--engines', action='store_true')
    parser.add_argument('--inspect', type=Path)
    parser.add_argument('--job', type=Path)
    parser.add_argument('--output', type=Path)
    args = parser.parse_args()
    if args.engines:
        print(json.dumps(selftest()), flush=True)
        return
    if args.inspect:
        print(json.dumps(describe(args.inspect)), flush=True)
        return
    if not args.job or not args.output:
        raise SystemExit('revision-job-required')
    job = json.loads(args.job.read_text(encoding='utf-8'))
    print(json.dumps(write_revision(job, args.output)), flush=True)


if __name__ == '__main__':
    main()
