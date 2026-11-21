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


class _Folded:
    """A part's instruments with one program, for compact_plain_tracks (it reads `.instruments` only)."""
    def __init__(self, instruments):
        self.instruments = instruments


def fold_part(source):
    """Every plain pitched track of a part on its most-used program (W1: winds, one track per instrument)."""
    plain = [i for i in source.instruments if i.notes and not i.is_drum and not i.pitch_bends and not i.control_changes]
    if len(plain) < 2:
        return None
    program = max(plain, key=lambda i: len(i.notes)).program
    instruments = []
    for instrument in source.instruments:
        instrument = copy.deepcopy(instrument)
        if instrument in plain or (instrument.notes and not instrument.is_drum and not instrument.pitch_bends and not instrument.control_changes):
            instrument.program = program
        instruments.append(instrument)
    return _Folded(instruments)


def merge(parts, output):
    import pretty_midi
    merged = pretty_midi.PrettyMIDI(initial_tempo=120, resolution=960)
    counts = []
    prepared = []
    for part in parts:
        source = pretty_midi.PrettyMIDI(str(part['path']))
        prepared.append([part, source, compact_plain_tracks(source, merged), False])
    pitched = lambda: sum(not i.is_drum for _, _, tracks, _ in prepared for i in tracks if i.notes)
    folded = []
    while pitched() > 15:
        candidates = [item for item in prepared if not item[3] and sum(1 for i in item[2] if i.notes and not i.is_drum) > 1]
        if not candidates:
            break
        item = max(candidates, key=lambda item: sum(1 for i in item[2] if i.notes and not i.is_drum))
        simpler = fold_part(item[1])
        item[3] = True
        if simpler is None:
            continue
        item[2] = compact_plain_tracks(simpler, merged)
        folded.append(item[0]['stem'])
    if pitched() > 15:
        raise ValueError('Too many pitched tracks for distinct MIDI channels')
    for part, source, tracks, was_folded in prepared:
        count = 0
        one_track = (part['stem'] in ('bass', 'piano', 'guitar')
                     and (part.get('model') or '').endswith('-onetrack1'))
        for index, instrument in enumerate(tracks):
            if not instrument.notes:
                continue
            instrument = copy.deepcopy(instrument)
            if part['stem'] == 'other':
                instrument.name = 'other' if index == 0 else f'other / overlap {index + 1}'
            elif one_track:
                name = source.instruments[0].name
                if index:
                    name += f' / overlap {index + 1}'
                instrument.name = part['stem'] + ' / ' + name
            else:
                instrument.name = part['stem'] if len(source.instruments) == 1 or was_folded else part['stem'] + ' / ' + instrument.name
            merged.instruments.append(instrument)
            count += len(instrument.notes)
        if count == 0:
            raise ValueError('MIDI input has no notes: ' + part['stem'])
        counts.append({'stem': part['stem'], 'noteCount': count})
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
    return {'noteCount': sum(p['noteCount'] for p in counts), 'parts': counts, 'instrumentCount': len(saved.instruments), 'folded': folded}


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--job', type=Path, required=True)
    parser.add_argument('--output', type=Path, required=True)
    args = parser.parse_args()
    job = json.loads(args.job.read_text(encoding='utf-8'))
    print(json.dumps(merge(job['parts'], args.output)), flush=True)


if __name__ == '__main__':
    main()
