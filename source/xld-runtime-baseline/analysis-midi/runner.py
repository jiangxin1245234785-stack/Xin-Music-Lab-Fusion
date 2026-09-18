"""Single-stem transcription with a replaceable CLI and mother-track timing."""
from __future__ import annotations

import argparse
from collections import Counter
import contextlib
from datetime import datetime, timezone
import hashlib
import importlib.metadata
import importlib.util
import os
import json
import math
from pathlib import Path
import sys
import time
import uuid

# Isolated Windows Python does not add the entry script directory to sys.path.
sys.path.insert(0, str(Path(__file__).resolve().parent))

PROGRESS_STREAM = sys.stdout
PROFILES = {item['id']: item for item in json.loads((Path(__file__).parent / 'models.json').read_text(encoding='utf-8'))}
MODEL = PROFILES['basic-pitch']['model']
OPTIONS = PROFILES['basic-pitch']['options']


def available_engines():
    from highres import checkpoint_path
    results = []
    for profile in PROFILES.values():
        packages = ['basic_pitch'] if profile['backend'] == 'basic-pitch' else ['piano_transcription_inference', 'torchlibrosa', 'pretty_midi', 'mido', 'importlib_resources']
        if profile['backend'] == 'adtof':
            packages = ['torch', 'librosa', 'pretty_midi', 'soundfile']
        ready = all(importlib.util.find_spec(name) is not None for name in packages)
        if profile['backend'] == 'highres':
            weight = checkpoint_path(profile)
            ready = ready and weight.is_file() and weight.stat().st_size == profile['checkpoint']['size']
        if profile['backend'] == 'adtof':
            from drums import checkpoint_path as drum_checkpoint
            weight = drum_checkpoint(profile)
            ready = ready and weight.is_file() and weight.stat().st_size == profile['checkpoint']['size']
        if profile['backend'] == 'muscriptor':
            from muscriptor_backend import ready as muscriptor_ready
            ready = muscriptor_ready(profile)
        if profile['backend'] == 'yourmt3':
            from yourmt3 import ready as yourmt3_ready
            ready = yourmt3_ready(profile)
        results.append({'id': profile['id'], 'available': bool(ready)})
    return results
STEMS = {"bass": 33, "piano": 0, "guitar": 24, "drums": 0, "strings": 48}
STRING_PROGRAMS = {"strings": 48, "strings-all": 48, "violin": 40, "viola": 41, "cello": 42, "double-bass": 43}


def emit(message, progress=None, phase=None):
    print(json.dumps({"message": message, "progress": progress, "phase": phase}, ensure_ascii=False),
          file=PROGRESS_STREAM, flush=True)


def validate_midi_roundtrip(midi, midi_file):
    import pretty_midi
    original = [note for part in midi.instruments for note in part.notes]
    saved = [note for part in pretty_midi.PrettyMIDI(str(midi_file)).instruments for note in part.notes]
    if len(saved) != len(original):
        raise ValueError("MIDI 音符数量校验失败")
    # Close onsets can collapse onto one MIDI tick and reorder a chord on readback.
    # Compare complete note multisets on the file's tick grid, not list positions.
    def signature(note):
        return (note.pitch, note.velocity, int(midi.time_to_tick(note.start)), int(midi.time_to_tick(note.end)))
    if Counter(map(signature, saved)) != Counter(map(signature, original)):
        raise ValueError("MIDI 时间校验失败")


def transcribe(input_path: Path, output_path: Path, track_id: str, stem: str,
               source_run_id: str, run_id: str, notify=emit, engine="basic-pitch", string_target="strings"):
    profile = PROFILES[engine]
    if stem not in profile["stems"] or stem in profile.get('retiredFor', []):
        raise ValueError("模型不支持当前声部")
    if stem == "strings" and string_target not in STRING_PROGRAMS:
        raise ValueError("无效弦乐音源")
    options = profile["options"]
    if stem not in STEMS:
        raise ValueError("请选择 bass、piano、guitar 或 drums")
    run_id, source_run_id = str(uuid.UUID(run_id)), str(uuid.UUID(source_run_id))
    started = time.monotonic()
    input_path = input_path.resolve()
    source_stat = input_path.stat()
    notify("读取分轨", 0.02, "decode")
    import numpy as np
    import soundfile as sf
    info = sf.info(str(input_path))
    if info.frames <= 0 or info.samplerate <= 0:
        raise ValueError("分轨音频为空")
    duration = info.frames / info.samplerate
    for block in sf.blocks(str(input_path), blocksize=65536, dtype="float32"):
        if not np.isfinite(block).all():
            raise ValueError("分轨包含无效采样")
    notify("加载转谱模型", 0.06, "model")
    import pretty_midi
    with contextlib.redirect_stdout(sys.stderr):
        if profile['backend'] == 'basic-pitch':
            from basic_pitch import FilenameSuffix, build_icassp_2022_model_path
            from basic_pitch.constants import AUDIO_N_SAMPLES, AUDIO_SAMPLE_RATE, FFT_HOP
            from basic_pitch.inference import Model, predict

            class ProgressModel(Model):
                def __init__(self):
                    super().__init__(build_icassp_2022_model_path(FilenameSuffix.onnx))
                    self.done = 0

                def predict(self, samples):
                    result = super().predict(samples)
                    self.done += (AUDIO_N_SAMPLES - 30 * FFT_HOP) / AUDIO_SAMPLE_RATE
                    notify('正在识别音符', .08 + .8 * min(1, self.done / duration), 'transcribe')
                    return result

            _, detected, _ = predict(input_path, ProgressModel(), onset_threshold=options['onsetThreshold'],
                frame_threshold=options['frameThreshold'], minimum_note_length=options['minimumNoteMs'], midi_tempo=120)
            backend = {'name': 'basic-pitch', 'version': importlib.metadata.version('basic-pitch'), 'device': 'cpu'}
        elif profile['backend'] == 'muscriptor':
            from muscriptor_backend import predict as muscriptor_predict
            detected, backend = muscriptor_predict(input_path, profile, notify, duration, string_target=string_target)
        elif profile['backend'] == 'yourmt3':
            from yourmt3 import predict as yourmt3_predict
            detected, backend = yourmt3_predict(input_path, profile, notify, duration)
        elif profile['backend'] == 'adtof':
            from drums import predict as drum_predict
            detected, backend = drum_predict(input_path, profile, notify, duration)
        else:
            from highres import predict as highres_predict
            detected, backend = highres_predict(input_path, profile, notify, duration)
    notify("保存 MIDI", 0.92, "save")
    midi = pretty_midi.PrettyMIDI(initial_tempo=options["midiTempo"], resolution=960)
    instrument = pretty_midi.Instrument(program=STRING_PROGRAMS[string_target] if stem == "strings" else STEMS[stem], name=string_target if stem == "strings" else stem, is_drum=(stem == "drums"))
    for detected_instrument in detected.instruments:
        if profile['backend'] == 'muscriptor' and stem != 'drums':
            instrument = pretty_midi.Instrument(program=STRING_PROGRAMS[string_target] if stem == 'strings' else int(detected_instrument.program), name=detected_instrument.name, is_drum=False)
            midi.instruments.append(instrument)
        if profile['backend'] == 'yourmt3' and stem == 'strings':
            instrument = pretty_midi.Instrument(program=STRING_PROGRAMS[string_target], name=detected_instrument.name, is_drum=False)
            midi.instruments.append(instrument)
        for note in detected_instrument.notes:
            start, end = max(0.0, float(note.start)), min(duration, float(note.end))
            if stem == 'drums' and 'drumNoteSeconds' in options:
                # Onset-only models do not estimate musical drum-note duration.
                end = min(duration, start + options['drumNoteSeconds'])
            if not math.isfinite(start) or not math.isfinite(end):
                raise ValueError("转谱包含无效时间")
            if start < end and note.velocity > 0:
                instrument.notes.append(pretty_midi.Note(int(note.velocity), int(note.pitch), start, end))
        instrument.pitch_bends.extend(bend for bend in detected_instrument.pitch_bends if 0 <= bend.time <= duration)
        instrument.control_changes.extend(control for control in detected_instrument.control_changes if 0 <= control.time <= duration)
    instrument.notes.sort(key=lambda note: (note.start, note.pitch, note.end))
    if instrument.is_drum:
        # Drum hits are onset events. End each hit before the next same-key hit;
        # overlapping same-key note-offs otherwise corrupt rapid rolls on readback.
        next_start = {}
        for note in reversed(instrument.notes):
            if note.pitch in next_start:
                note.end = min(note.end, next_start[note.pitch])
            next_start[note.pitch] = note.start
    if (profile['backend'] != 'muscriptor' or stem == 'drums') and (profile['backend'] != 'yourmt3' or stem != 'strings'):
        midi.instruments.append(instrument)
    for part in midi.instruments:
        part.notes.sort(key=lambda n: (n.start, n.pitch, n.end))
    if profile['backend'] == 'yourmt3' or (profile['backend'] == 'muscriptor' and stem == 'strings'):
        from yourmt3 import preserve_overlapping_notes
        backend.update(preserve_overlapping_notes(midi))
        backend['programMode'] = 'source-string-timbre; native groups retained' if stem == 'strings' else 'source-guitar-timbre; native groups combined, all notes retained'
    notes = [{"start": note.start, "end": note.end, "pitch": note.pitch, "velocity": note.velocity}
             for part in midi.instruments for note in part.notes]
    after = input_path.stat()
    if (source_stat.st_size, source_stat.st_mtime_ns) != (after.st_size, after.st_mtime_ns):
        raise ValueError("分轨文件在转谱期间发生变化，请重试")
    relative = Path("midi") / stem / run_id
    directory = output_path.parent / relative
    directory.mkdir(parents=True, exist_ok=False)
    midi_file, notes_file = directory / f"{stem}.mid", directory / "notes.json"
    midi.write(str(midi_file))
    validate_midi_roundtrip(midi, midi_file)
    notes_file.write_text(json.dumps({"schemaVersion": 1, "kind": "notes", "trackId": track_id,
                                    "stem": stem, "sourceRunId": source_run_id, "runId": run_id,
                                    "engine": engine, "model": profile["model"], "timeOrigin": 0,
                                    "duration": duration, "notes": notes}, ensure_ascii=False), encoding="utf-8")
    # Output digests let readers detect a damaged or swapped file without consulting the model registry.
    digest = lambda file: hashlib.sha256(file.read_bytes()).hexdigest()
    result = {"schemaVersion": 1, "kind": "midi", "trackId": track_id, "stem": stem,
              "runId": run_id, "sourceRunId": source_run_id,
              "source": {"path": str(input_path), "size": source_stat.st_size,
                         "mtimeMs": source_stat.st_mtime_ns / 1_000_000},
              "engine": engine, "model": profile["model"], "backend": backend,
              "options": options, "timeOrigin": 0, "duration": duration, "noteCount": len(notes),
              "tempoMode": "fixed-timebase", "quantized": False,
              "digests": {"midi": digest(midi_file), "notes": digest(notes_file)},
              "createdAt": datetime.now(timezone.utc).isoformat(), "elapsedSeconds": round(time.monotonic() - started, 3),
              "file": (relative / midi_file.name).as_posix(), "notesFile": (relative / notes_file.name).as_posix()}
    if stem == "strings":
        result.update(sourceTarget=string_target, program=STRING_PROGRAMS[string_target])
    output_path.write_text(json.dumps(result, ensure_ascii=False, indent=2), encoding="utf-8")
    notify("转谱完成" if notes else "未识别到音符", 1, "complete")
    return result


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--engines", action="store_true")
    parser.add_argument("--engine", choices=PROFILES, default="basic-pitch")
    parser.add_argument("--input", type=Path, required=False)
    parser.add_argument("--output", type=Path, required=False)
    parser.add_argument("--track-id", required=False)
    parser.add_argument("--stem", choices=STEMS, required=False)
    parser.add_argument("--source-run-id", required=False)
    parser.add_argument("--run-id", required=False)
    parser.add_argument("--string-target", choices=STRING_PROGRAMS, default="strings")
    args = parser.parse_args()
    if args.engines:
        print(json.dumps(available_engines()))
        return 0
    for name in ['input', 'output', 'track_id', 'stem', 'source_run_id', 'run_id']:
        if getattr(args, name) is None:
            parser.error('--' + name.replace('_', '-') + ' is required')
    try:
        transcribe(args.input, args.output, args.track_id, args.stem, args.source_run_id, args.run_id, engine=args.engine, string_target=args.string_target)
    except Exception as error:
        emit(str(error), phase="failed")
        print(str(error), file=sys.stderr)
        return 1
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
