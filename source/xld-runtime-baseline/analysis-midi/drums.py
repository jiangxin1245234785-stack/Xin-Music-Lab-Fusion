"""Pinned ADTOF adapter. Five GM drum classes, fixed velocity; no quantization."""
from pathlib import Path
import hashlib
import os
import sys


def checkpoint_path(profile):
    return Path(__file__).parent / 'vendor' / 'adtof_pytorch' / 'data' / profile['checkpoint']['file']


def predict(audio_path, profile, notify, duration):
    import numpy as np
    import torch
    sys.path.insert(0, str(Path(__file__).parent / 'vendor'))
    from adtof_pytorch.model import ADTOFFrameRNN, load_audio_for_model
    from adtof_pytorch.post_processing import PeakPicker, activations_to_pretty_midi

    weight = checkpoint_path(profile)
    if not weight.is_file() or hashlib.sha256(weight.read_bytes()).hexdigest() != profile['checkpoint']['sha256']:
        raise ValueError('鼓模型权重缺失或校验失败')
    torch.set_num_threads(min(4, os.cpu_count() or 1))
    device = 'cuda' if torch.cuda.is_available() else 'cpu'
    features = load_audio_for_model(str(audio_path))
    model = ADTOFFrameRNN(n_bins=features.shape[2], use_keras_gru=False)
    weights = torch.load(weight, map_location='cpu', weights_only=True)
    model.load_state_dict(weights.get('model_weights', weights), strict=True)
    model.to(device).eval()
    options = profile['options']
    step, context = options['chunkFrames'], options['contextFrames']
    count = features.shape[1]
    predictions = []
    for start in range(0, count, step):
        end = min(count, start + step)
        left, right = max(0, start - context), min(count, end + context)
        with torch.inference_mode():
            predicted = model(features[:, left:right].to(device)).cpu().numpy()[0]
        predictions.append(predicted[start-left:end-left])
        notify('正在识别鼓点 · ADTOF', .08 + .8 * end / count, 'transcribe')
    # Decode once after stitching, so boundary peaks are neither duplicated nor lost.
    thresholds = [options[key] for key in ['kickThreshold','snareThreshold','tomThreshold','hihatThreshold','cymbalThreshold']]
    peaks = PeakPicker(thresholds=thresholds, fps=100).pick(np.concatenate(predictions))[0]
    midi = activations_to_pretty_midi(peaks, velocity=options['velocity'], note_duration=.1, program=0, is_drum=True)
    return midi, {'name':'adtof-pytorch','revision':profile['checkpoint']['revision'],
                  'device':device,'checkpointSha256':profile['checkpoint']['sha256'],
                  'velocityMode':'fixed','drumClasses':[35,38,47,42,49]}
