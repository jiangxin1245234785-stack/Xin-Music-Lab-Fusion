"""Merge XLD's active MIDI parts on their absolute seconds timeline."""
import argparse
import copy
import json
from pathlib import Path


def compact_plain_tracks(source, timebase):
    """Share channels only within one stem and timbre, without expression conflicts."""
    groups, ordered = {}, []
    for instrument in source.instruments:
        if not instrument.notes:
            continue
        if instrument.is_drum or instrument.pitch_bends or instrument.control_changes:
            ordered.append([instrument])
            continue
        if instrument.program not in groups:
            groups[instrument.program] = []
            ordered.append(groups[instrument.program])
        groups[instrument.program].append(instrument)
    output = []
    for group in ordered:
        if len(group) == 1:
            output.append(copy.deepcopy(group[0]))
            continue
        lanes = []
        for note in sorted((n for part in group for n in part.notes), key=lambda n:(n.start,n.pitch,n.end)):
            start = int(timebase.time_to_tick(note.start))
            lane = next((item for item in lanes if item[1].get(note.pitch, -1) <= start), None)
            if lane is None:
                instrument = copy.deepcopy(group[0])
                instrument.notes = []
                lane = (instrument, {})
                lanes.append(lane)
            lane[0].notes.append(copy.deepcopy(note))
            lane[1][note.pitch] = int(timebase.time_to_tick(note.end))
        output.extend(item[0] for item in lanes)
    return output


def merge(parts, output):
    import pretty_midi
    merged = pretty_midi.PrettyMIDI(initial_tempo=120, resolution=960)
    counts = []
    for part in parts:
        source = pretty_midi.PrettyMIDI(str(part['path']))
        count = 0
        for instrument in compact_plain_tracks(source, merged):
            if not instrument.notes:
                continue
            instrument = copy.deepcopy(instrument)
            instrument.name = part['stem'] if len(source.instruments) == 1 else part['stem'] + ' / ' + instrument.name
            merged.instruments.append(instrument)
            count += len(instrument.notes)
        if count == 0:
            raise ValueError('MIDI input has no notes: ' + part['stem'])
        counts.append({'stem': part['stem'], 'noteCount': count})
    if sum(not instrument.is_drum for instrument in merged.instruments) > 15:
        raise ValueError('Too many pitched tracks for distinct MIDI channels')
    output = Path(output)
    output.parent.mkdir(parents=True, exist_ok=True)
    merged.write(str(output))
    saved = pretty_midi.PrettyMIDI(str(output))
    if len(saved.instruments) != len(merged.instruments):
        raise ValueError('MIDI track verification failed')
    for before, after in zip(merged.instruments, saved.instruments):
        if before.program != after.program or before.is_drum != after.is_drum or len(before.notes) != len(after.notes):
            raise ValueError('MIDI instrument verification failed')
        sort_notes = lambda notes: sorted(notes, key=lambda n: (n.pitch, n.start, n.end, n.velocity))
        for a, b in zip(sort_notes(before.notes), sort_notes(after.notes)):
            if (a.pitch, a.velocity) != (b.pitch, b.velocity) or max(abs(a.start-b.start), abs(a.end-b.end)) > 0.001:
                raise ValueError('MIDI note timing verification failed')
        for name, fields in [('control_changes', ['number', 'value']), ('pitch_bends', ['pitch'])]:
            a, b = getattr(before, name), getattr(after, name)
            if len(a) != len(b):
                raise ValueError('MIDI expression verification failed')
            for x, y in zip(a, b):
                if any(getattr(x, f) != getattr(y, f) for f in fields) or abs(x.time-y.time) > 0.001:
                    raise ValueError('MIDI expression timing verification failed')
    return {'noteCount': sum(p['noteCount'] for p in counts), 'parts': counts, 'instrumentCount': len(saved.instruments)}


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--job', type=Path, required=True)
    parser.add_argument('--output', type=Path, required=True)
    args = parser.parse_args()
    job = json.loads(args.job.read_text(encoding='utf-8'))
    print(json.dumps(merge(job['parts'], args.output)), flush=True)


if __name__ == '__main__':
    main()
