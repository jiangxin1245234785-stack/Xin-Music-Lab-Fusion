"""Recover the native MuScriptor groups in the six pre-4c6b20d pitched profiles."""
from collections import Counter
import hashlib
import io
import json
import math
from pathlib import Path
from uuid import UUID


OLD_MODELS = {
    'muscriptor-medium': 'muscriptor-medium-f3223696-no-prelude-v1-stemvel1',
    'muscriptor-large': 'muscriptor-large-8809fdfb-no-prelude-v1-stemvel1',
    'piano-muscriptor-medium': 'muscriptor-medium-f3223696-no-prelude-v1-keys-stemvel1',
    'piano-muscriptor-large': 'muscriptor-large-8809fdfb-no-prelude-v1-keys-stemvel1',
    'bass-muscriptor-medium': 'muscriptor-medium-f3223696-no-prelude-v1-bass-stemvel1',
    'bass-muscriptor-large': 'muscriptor-large-8809fdfb-no-prelude-v1-bass-stemvel1',
}


def require(condition, reason):
    if not condition:
        raise ValueError('midi-upgrade-' + reason)


def restore(record_path, track_directory, engine, profile, track_id, stem, source_run_id, source, stat, from_run_id=None):
    import pretty_midi
    import soundfile as sf

    record_path = Path(record_path).resolve(strict=True)
    record = json.loads(record_path.read_bytes())
    old_model = OLD_MODELS.get(engine)
    require(old_model and profile['model'] == old_model + '-onetrack1' and stem in profile['stems']
            and profile['options'].get('oneTrack') == {'dedupeMs': 50}
            and profile['options'].get('adapterVersion') == 2, 'profile')
    old_options = dict(profile['options'])
    del old_options['oneTrack']
    old_options['adapterVersion'] = 1
    require(record.get('options') == old_options and record.get('model') == old_model and record.get('engine') == engine,
            'identity')
    run_id = str(UUID(record['runId']))
    require(run_id == record['runId'] and (from_run_id is None or run_id == from_run_id), 'run-id')
    require(record.get('kind') == 'midi' and record.get('schemaVersion') == 1 and record.get('timeOrigin') == 0
            and record.get('quantized') is False and record.get('tempoMode') == 'fixed-timebase'
            and record.get('trackId') == track_id and record.get('stem') == stem
            and record.get('sourceRunId') == source_run_id and not record.get('revision'), 'record')
    if track_directory is None:
        track_directory = record_path.parents[3]
        require(record_path == track_directory / 'midi' / stem / 'runs' / (run_id + '.json'), 'record-path')
    else:
        track_directory = Path(track_directory).resolve(strict=True)
        require(record_path.is_relative_to(track_directory), 'record-path')
    old_source = record['source']
    require(Path(old_source['path']).resolve(strict=True) == source and old_source['size'] == stat.st_size
            and abs(stat.st_mtime_ns / 1e6 - old_source['mtimeMs']) <= 1, 'source')
    audio = sf.info(str(source))
    require(audio.frames > 0 and audio.samplerate > 0 and record['duration'] == audio.frames / audio.samplerate, 'duration')
    backend = record['backend']
    require(backend.get('name') == 'muscriptor' and backend.get('version') == old_options['codeRevision']
            and backend.get('checkpointSha256') == profile['checkpoint']['sha256']
            and backend.get('velocityMode') == 'stem-energy-relative' and backend.get('velocityReplaced') == 'constant-100',
            'backend')

    def product(field, name, digest):
        relative = Path('midi') / stem / run_id / name
        require(record[field] == relative.as_posix(), 'product-path')
        file = track_directory / relative
        require(file.resolve(strict=True) == file, 'product-path')
        data = file.read_bytes()
        require(hashlib.sha256(data).hexdigest() == record['digests'][digest], 'digest-' + digest)
        return data

    midi = pretty_midi.PrettyMIDI(io.BytesIO(product('file', stem + '.mid', 'midi')))
    document = json.loads(product('notesFile', 'notes.json', 'notes'))
    require(document.get('kind') == 'notes' and all(document.get(key) == record[key] for key in
            ('schemaVersion', 'engine', 'model', 'trackId', 'stem', 'runId', 'sourceRunId', 'duration', 'timeOrigin')),
            'notes-record')
    notes = document['notes']
    require(isinstance(notes, list) and len(notes) == record['noteCount']
            and sum(len(part.notes) for part in midi.instruments) == len(notes), 'note-count')
    tempos = midi.get_tempo_changes()[1].tolist()
    require(midi.resolution == 960 and tempos == [float(old_options['midiTempo'])], 'timebase')
    require(backend.get('nativePrograms') == [part.program for part in midi.instruments], 'native-tracks')
    result = pretty_midi.PrettyMIDI(initial_tempo=old_options['midiTempo'], resolution=960)

    # The old writer concatenated each native track's sorted notes into notes.json. The MIDI supplies
    # group boundaries/names/programs, while notes.json still has the pre-tick floating-point times.
    # Checking the multiset *inside every group* catches reordered, flattened or damaged evidence.
    cursor = 0
    def signature(note):
        return note.pitch, note.velocity, result.time_to_tick(note.start), result.time_to_tick(note.end)
    for part in midi.instruments:
        require(not part.is_drum and not part.pitch_bends and not part.control_changes, 'native-events')
        original = []
        for row in notes[cursor:cursor + len(part.notes)]:
            start, end, pitch, velocity = (row[key] for key in ('start', 'end', 'pitch', 'velocity'))
            require(math.isfinite(start) and math.isfinite(end) and 0 <= start < end <= record['duration']
                    and type(pitch) is int and 0 <= pitch <= 127 and type(velocity) is int and 0 < velocity <= 127,
                    'note')
            original.append(pretty_midi.Note(velocity, pitch, start, end))
        require(original == sorted(original, key=lambda n: (n.start, n.pitch, n.end))
                and Counter(map(signature, original)) == Counter(map(signature, part.notes)), 'group-notes')
        cursor += len(original)
        instrument = pretty_midi.Instrument(program=int(part.program), name=part.name)
        instrument.notes = original
        result.instruments.append(instrument)
    return result, record
