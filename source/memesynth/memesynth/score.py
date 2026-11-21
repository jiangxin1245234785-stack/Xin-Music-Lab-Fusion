"""Read an XLD `merged.mid` and flatten it into routed note events on the seconds timeline.

The file's tempo map, time signature and tick resolution are placeholders XLD always
writes as 120 bpm / 4-4 / 960 tpb; they carry no musical meaning and are never read
here (SPEC §7). Every time in this module is absolute seconds.

Routing keys come from the track name, which `merged.mid` writes as
`<stem> / <timbre>` for melodic parts (`guitar / distorted electric guitar`) and plain
`<stem>` when the stem has one timbre (`bass`, `piano`). Drum tracks carry
`is_drum=True` and encode the class in the pitch, which `DRUM_CLASSES` folds onto seven
routes (SPEC §6).
"""
from collections import Counter
from dataclasses import dataclass
from pathlib import Path

import pretty_midi

#: General MIDI percussion folded onto the seven classes a kit voices.
#:
#: XLD's own `drumMap` writes kick as 36, but its ADTOF path writes the GM Acoustic
#: Bass Drum 35 instead, and across the artifact corpus 35 outnumbers 36 roughly three
#: to one — reading only 36 silently drops most kicks. Other backends emit the fuller
#: GM spread (open and pedal hats, the second crash and ride, extra toms), so the map
#: covers the whole percussion range rather than one backend's six values.
DRUM_CLASSES = {
    35: 'kick', 36: 'kick',
    37: 'snare', 38: 'snare', 39: 'snare', 40: 'snare',
    42: 'hihat', 44: 'hihat',
    46: 'openhat',
    41: 'tom', 43: 'tom', 45: 'tom', 47: 'tom', 48: 'tom', 50: 'tom',
    49: 'crash', 52: 'crash', 55: 'crash', 57: 'crash',
    51: 'ride', 53: 'ride', 59: 'ride',
}

#: The route suffixes a kit can bind, in the order a drummer would name them.
DRUM_ROUTES = ('kick', 'snare', 'hihat', 'openhat', 'tom', 'crash', 'ride')

#: Stems the MIDI backends can produce. Used only to warn about unexpected track names.
STEMS = frozenset({'bass', 'piano', 'guitar', 'strings', 'winds', 'drums', 'vocals', 'other'})

#: Notes shorter than this are transcription artefacts; real exports contain 8 ms notes
#: that render as clicks (SPEC §9).
MIN_DURATION = 0.02


@dataclass(frozen=True)
class Note:
    """One note on the absolute seconds timeline, tagged with its routing key."""

    start: float
    duration: float
    pitch: int
    velocity: int
    route: str
    is_drum: bool


@dataclass(frozen=True)
class Score:
    """Every routed note of one song, plus what was dropped getting there."""

    notes: tuple
    duration: float
    routes: dict
    dropped: dict
    warnings: tuple

    def summary(self):
        """Lines describing route coverage and anything discarded, for the CLI report."""
        lines = [f'{len(self.notes)} 个音符 / {self.duration:.1f} 秒 / {len(self.routes)} 条路由']
        for route, count in sorted(self.routes.items(), key=lambda item: -item[1]):
            lines.append(f'  {route:<40} {count:>6} 个音符')
        for reason, count in sorted(self.dropped.items()):
            lines.append(f'  ! 丢弃 {count} 个音符（{reason}）')
        lines.extend(f'  ! {text}' for text in self.warnings)
        return lines


def normalise_route(name):
    """`'guitar / Clean Electric Guitar'` -> `'guitar/clean electric guitar'`."""
    parts = [part.strip().lower() for part in (name or '').split('/')]
    return '/'.join(part for part in parts if part)


def read_score(path, min_duration=MIN_DURATION):
    """Parse one merged MIDI export into a `Score`.

    `min_duration` drops the sub-10 ms notes the transcribers emit. Drum notes keep
    their onset but lose their duration, which XLD writes as a constant 0.1 s
    placeholder; the renderer takes the length from the sample instead.
    """
    midi = pretty_midi.PrettyMIDI(path if hasattr(path, 'read') else str(Path(path)))
    notes, routes, dropped, warnings = [], Counter(), Counter(), []
    for instrument in midi.instruments:
        if not instrument.notes:
            continue
        label = normalise_route(instrument.name)
        if not instrument.is_drum and not label:
            dropped['轨道无名称，无法路由'] += len(instrument.notes)
            continue
        if not instrument.is_drum and label.split('/')[0] not in STEMS:
            warnings.append(
                f"轨名 '{instrument.name}' 的 stem 段不是已知 stem —— "
                f'这可能是单 stem 导出而非 merged.mid（SPEC v2 backlog）')
        for note in instrument.notes:
            if instrument.is_drum:
                drum_class = DRUM_CLASSES.get(note.pitch)
                if drum_class is None:
                    dropped[f'未知鼓 pitch {note.pitch}'] += 1
                    continue
                route, duration = f'drums/{drum_class}', 0.0
            else:
                route, duration = label, float(note.end - note.start)
                if duration < min_duration:
                    dropped[f'短于 {min_duration * 1000:.0f} ms'] += 1
                    continue
            notes.append(Note(start=float(note.start), duration=duration, pitch=int(note.pitch),
                              velocity=int(note.velocity), route=route, is_drum=instrument.is_drum))
            routes[route] += 1
    notes.sort(key=lambda item: (item.start, item.route, item.pitch))
    return Score(notes=tuple(notes), duration=float(midi.get_end_time()), routes=dict(routes),
                 dropped=dict(dropped), warnings=tuple(dict.fromkeys(warnings)))
