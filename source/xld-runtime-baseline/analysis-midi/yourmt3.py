"""Pinned YourMT3+ inference adapter; preserves the upstream segment/tie decoder."""
from pathlib import Path
from collections import Counter
import hashlib
import os
import sys
import math

REVISION = '5e66c1ea173a8186e0d20432b841d3180cc015b5'
EXPERIMENT = 'mc13_256_g4_all_v7_mt3f_sqr_rms_moe_wf4_n8k2_silu_rope_rp_b36_nops'

def runtime_root():
    return Path(os.environ.get('XLD_YOURMT3_ROOT', ''))

def checkpoint_path(profile):
    return runtime_root() / 'upstream/amt/logs/2024' / EXPERIMENT / 'checkpoints/last.ckpt'

def ready(profile):
    import importlib.util
    root = runtime_root()
    weight = checkpoint_path(profile)
    return bool(os.environ.get('XLD_YOURMT3_ROOT')) and (root / 'upstream/amt/src/model/ymt3.py').is_file() and weight.is_file() and weight.stat().st_size == profile['checkpoint']['size'] and all(importlib.util.find_spec(p) for p in ['torch', 'transformers', 'pytorch_lightning', 'wandb', 'pretty_midi', 'soundfile'])

def predict(audio_path, profile, notify, duration):
    import numpy as np
    import soundfile as sf
    from scipy.signal import resample_poly
    import torch
    import pretty_midi
    if not ready(profile):
        raise ValueError('YourMT3+ 环境或权重未就绪')
    checkpoint = checkpoint_path(profile)
    with checkpoint.open('rb') as weight_file:
        digest = hashlib.file_digest(weight_file, 'sha256').hexdigest()
    if digest != profile['checkpoint']['sha256']:
        raise ValueError('YourMT3+ 权重校验失败')
    upstream = runtime_root() / 'upstream'
    sys.path[:0] = [str(upstream), str(upstream / 'amt/src')]
    os.environ['WANDB_MODE'] = 'disabled'
    # Portable Python does not process setuptools' site-packages .pth hook.
    # Initialize its supported distutils shim before the upstream W&B import.
    import setuptools
    from model_helper import load_model_checkpoint
    from utils.audio import slice_padded_array
    from utils.note2event import mix_notes
    from utils.utils import create_inverse_vocab
    from config.vocabulary import program_vocab_presets
    from utils.event2note import merge_zipped_note_events_and_ties_to_notes
    args = [EXPERIMENT+'@last.ckpt', '-p', '2024', '-tk', 'mc13_full_plus_256', '-dec', 'multi-t5',
            '-nl', '26', '-enc', 'perceiver-tf', '-sqr', '1', '-ff', 'moe', '-wf', '4', '-nmoe', '8',
            '-kmoe', '2', '-act', 'silu', '-epe', 'rope', '-rp', '1', '-ac', 'spec', '-hop', '300',
            '-atc', '1', '-pr', '32', '-w', '0']
    torch.set_num_threads(min(4, os.cpu_count() or 1))
    previous = Path.cwd()
    try:
        os.chdir(upstream)
        model = load_model_checkpoint(args=args, device='cpu')
    finally:
        os.chdir(previous)
    device = 'cuda' if torch.cuda.is_available() else 'cpu'
    model = model.to(device).eval()
    if device == 'cuda':
        torch.cuda.reset_peak_memory_stats()
    samples, sr = sf.read(str(audio_path), dtype='float32', always_2d=True)
    samples = samples.mean(axis=1)
    rate = model.audio_cfg['sample_rate']
    if sr != rate:
        div = math.gcd(sr, rate)
        samples = resample_poly(samples, rate//div, sr//div).astype(np.float32)
    size = model.audio_cfg['input_frames']
    segments = slice_padded_array(samples[None, :], size, size)
    segments = torch.from_numpy(segments.astype('float32')).unsqueeze(1)
    predictions = []
    bsz = profile['options']['batchSize'] if device == 'cuda' else 1
    for start in range(0, len(segments), bsz):
        with torch.inference_mode():
            # Whole-file tie reconstruction happens below, not separately per batch.
            tokens, _ = model.inference_file(bsz=bsz, audio_segments=segments[start:start+bsz])
        predictions.extend(tokens)
        notify('YourMT3+ · %d / %d 段' % (min(start+bsz, len(segments)),len(segments)), .08+.8*min(start+bsz,len(segments))/len(segments), 'transcribe')
    starts = [size*i/rate for i in range(len(segments))]
    tracks, errors = [], Counter()
    for channel in range(model.task_manager.num_decoding_channels):
        batches = [arr[:, channel, :] for arr in predictions]
        zipped, _, decode_errors = model.task_manager.detokenize_list_batches(batches, starts, return_events=True)
        notes, tie_errors = merge_zipped_note_events_and_ties_to_notes(zipped)
        tracks.append(notes)
        errors.update(decode_errors)
        errors.update(tie_errors)
    notes = mix_notes(tracks)
    output_vocab = create_inverse_vocab(program_vocab_presets["gm_ext_plus"])
    midi = pretty_midi.PrettyMIDI(initial_tempo=120, resolution=960)
    programs = {}
    dropped_drums = 0
    for note in notes:
        if note.is_drum:
            dropped_drums += 1
            continue
        begin, end = max(0., float(note.onset)), min(duration, float(note.offset))
        if begin >= end:
            continue
        program = int(output_vocab.get(note.program, [note.program])[0])
        if not 0 <= program <= 127:
            program = 48
        part = programs.setdefault(program, pretty_midi.Instrument(program, name='YourMT3 program '+str(program)))
        part.notes.append(pretty_midi.Note(100, int(note.pitch), begin, end))
    midi.instruments.extend(programs.values())
    return midi, {'name':'yourmt3', 'version':REVISION, 'variant':'YPTF.MoE+Multi (noPS)', 'device':device,
                 'checkpointSha256':digest, 'decodingErrors':dict(errors), 'segments':len(segments),
                 'nativePrograms':{str(k):len(v.notes) for k,v in programs.items()}, 'excludedDrumNotes':dropped_drums,
                 'peakGpuMiB':round(torch.cuda.max_memory_allocated()/1024**2,1) if device=='cuda' else 0,
                 'velocityMode':'constant-100', 'programMode':'source-string-timbre; native groups retained'}


def preserve_overlapping_notes(midi):
    """Assign overlapping same-key notes to separate channels without moving events."""
    import copy
    tracks, extra = [], 0
    for part in midi.instruments:
        lanes = []
        for note in sorted(part.notes, key=lambda n: (n.start, n.pitch, n.end)):
            start_tick = int(midi.time_to_tick(note.start))
            available = next((lane for lane in lanes if lane[1].get(note.pitch, -1) <= start_tick), None)
            if available is None:
                voice = copy.deepcopy(part)
                voice.notes = []
                available = (voice, {})
                lanes.append(available)
            available[0].notes.append(note)
            available[1][note.pitch] = int(midi.time_to_tick(note.end))
        for i, (voice, _) in enumerate(lanes):
            voice.name = part.name + (' / overlap '+str(i+1) if i else '')
            tracks.append(voice)
        extra += max(0, len(lanes)-1)
    if len(tracks) > 15:
        raise ValueError('YourMT3+ 重叠声部超过 MIDI 的 15 个旋律通道，未改写或截短原始音符')
    midi.instruments = tracks
    return {'midiTracks': len(tracks), 'extraOverlapTracks': extra, 'noteTimingAdjusted': False}
