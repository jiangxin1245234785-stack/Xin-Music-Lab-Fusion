"""Recover the identities XLD folded to fit a standard concert MIDI into 15 melodic channels.

The studio renders each MTrk itself, so its listening copy can keep the part's named tracks.
The archived merge and its source MIDI are never rewritten.
"""
import hashlib
import io
import json
from pathlib import Path


def for_studio(path):
    import mido
    import pretty_midi

    path = Path(path)
    original = path.read_bytes()
    record = path.with_name('merge.json')
    if not record.is_file():
        return original
    try:
        info = json.loads(record.read_text(encoding='utf-8'))
        if not isinstance(info, dict) or not isinstance(info.get('parts'), list):
            return original
        if info.get('sha256') != hashlib.sha256(original).hexdigest():
            return original
        output = mido.MidiFile(file=io.BytesIO(original))
        timeline = pretty_midi.PrettyMIDI(io.BytesIO(original))
        changed = False
        for part in info['parts']:
            if not isinstance(part, dict):
                continue
            stem, run = part.get('stem'), part.get('runId')
            if stem not in ('winds', 'strings') or not isinstance(run, str) or not run or not all(c.isalnum() or c in '-_' for c in run):
                continue
            # A copied analysis tree may still carry absolute historical paths. Only consult its own, hash-linked part.
            source = path.parents[2] / stem / run / (stem + '.mid')
            if not source.is_file():
                continue
            data = source.read_bytes()
            if hashlib.sha256(data).hexdigest() != part.get('sha256'):
                continue
            positions = [i for i,t in enumerate(output.tracks) if t.name.strip().lower().split('/')[0].strip() == stem]
            if not positions:
                continue
            source_midi = mido.MidiFile(file=io.BytesIO(data))
            source_time = pretty_midi.PrettyMIDI(io.BytesIO(data))
            named = []
            for track in source_midi.tracks:
                if not any(m.type == 'note_on' and m.velocity for m in track):
                    continue
                label = (track.name or '').strip()
                if not label:
                    program = next((m.program for m in track if m.type == 'program_change'), None)
                    label = pretty_midi.program_to_instrument_name(program) if program is not None else ''
                dest = mido.MidiTrack()
                dest.name = stem + (' / ' + label if label else '')
                absolute = previous = 0
                for msg in track:
                    absolute += msg.time
                    if msg.type in ('track_name', 'end_of_track', 'set_tempo', 'time_signature', 'key_signature'):
                        continue
                    tick = timeline.time_to_tick(source_time.tick_to_time(absolute))
                    dest.append(msg.copy(time=max(0, tick - previous)))
                    previous = tick
                named.append(dest)
            if named:
                first = positions[0]
                output.tracks = [t for i,t in enumerate(output.tracks) if i not in positions]
                output.tracks[first:first] = named
                changed = True
        if changed:
            result = io.BytesIO()
            output.save(file=result)
            return result.getvalue()
    except (OSError, ValueError, KeyError, TypeError, IndexError, EOFError):
        pass
    return original
