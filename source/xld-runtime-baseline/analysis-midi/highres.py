"""XLD adapter for the published piano, GAPS guitar and bass CRNN checkpoints."""
from pathlib import Path
import hashlib
import math
import os
os.environ.setdefault('NUMBA_CACHE_DIR', 'D:/Caches/codex/cache/xld-midi-numba')
os.environ.setdefault('MPLCONFIGDIR', 'D:/Caches/codex/cache/xld-midi-matplotlib')


def checkpoint_path(profile):
    return Path(os.environ.get('XLD_HIGHRES_MODELS', 'D:/Caches/codex/models/xld-midi-highres')) / profile['checkpoint']['file']


def predict(audio_path, profile, notify, duration):
    import numpy as np
    import soundfile as sf
    from scipy.signal import resample_poly
    import torch
    import pretty_midi
    from piano_transcription_inference.models import Note_pedal, Regress_onset_offset_frame_velocity_CRNN
    from piano_transcription_inference.inference import PianoTranscription
    from piano_transcription_inference.utilities import RegressionPostProcessor

    checkpoint = checkpoint_path(profile)
    if not checkpoint.is_file():
        raise ValueError('模型权重未就绪: ' + profile['name'])
    if hashlib.sha256(checkpoint.read_bytes()).hexdigest() != profile['checkpoint']['sha256']:
        raise ValueError('模型权重校验失败: ' + profile['name'])
    device = 'cuda' if torch.cuda.is_available() else 'cpu'
    torch.set_num_threads(min(4, os.cpu_count() or 1))
    cls = {'Note_pedal': Note_pedal, 'Regress_onset_offset_frame_velocity_CRNN': Regress_onset_offset_frame_velocity_CRNN}[profile['modelType']]
    model = cls(frames_per_second=100, classes_num=88)
    # Published checkpoints contain numpy training metadata. Hash is checked above;
    # only their model state is loaded, with exact parameter-key matching.
    weights = torch.load(checkpoint, map_location='cpu', weights_only=False)
    model.load_state_dict(weights['model'], strict=True)
    del weights
    model.to(device).eval()
    audio, sr = sf.read(str(audio_path), dtype='float32', always_2d=True)
    audio = audio.mean(axis=1)
    if sr != 16000:
        divisor = math.gcd(sr, 16000)
        audio = resample_poly(audio, 16000 // divisor, sr // divisor).astype(np.float32)
    samples = 160000
    padded = np.pad(audio, (0, max(samples, math.ceil(len(audio) / samples) * samples) - len(audio)))
    starts = list(range(0, len(padded) - samples + 1, samples // 2))
    outputs = {}
    for index, start in enumerate(starts):
        with torch.inference_mode():
            result = model(torch.from_numpy(padded[start:start + samples][None, :]).to(device))
        for key, value in result.items():
            outputs.setdefault(key, []).append(value.cpu().numpy())
        notify('正在识别音符 · ' + profile['name'], .08 + .78 * (index + 1) / len(starts), 'transcribe')
    # Reuse the author's overlap stitching and onset/offset decoder.
    for key, values in outputs.items():
        outputs[key] = PianoTranscription.deframe(None, np.concatenate(values, axis=0))[:math.ceil(duration * 100)]
    options = profile['options']
    processor = RegressionPostProcessor(100, classes_num=88,
        onset_threshold=options['onsetThreshold'], offset_threshold=options['offsetThreshold'],
        frame_threshold=options['frameThreshold'], pedal_offset_threshold=options['pedalOffsetThreshold'])
    notes, pedals = processor.output_dict_to_midi_events(outputs)
    midi = pretty_midi.PrettyMIDI(initial_tempo=120)
    instrument = pretty_midi.Instrument(0)
    for note in notes:
        start, end = max(0., float(note['onset_time'])), min(duration, float(note['offset_time']))
        if start < end:
            instrument.notes.append(pretty_midi.Note(max(1, min(127, int(note['velocity']))), int(note['midi_note']), start, end))
    for pedal in pedals or []:
        start, end = max(0., float(pedal['onset_time'])), min(duration, float(pedal['offset_time']))
        if start < end:
            instrument.control_changes.extend([pretty_midi.ControlChange(64, 127, start), pretty_midi.ControlChange(64, 0, end)])
    midi.instruments.append(instrument)
    return midi, {'name': 'highres', 'version': '7568dc7', 'device': device, 'checkpointSha256': profile['checkpoint']['sha256']}
