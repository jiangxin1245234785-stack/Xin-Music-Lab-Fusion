"""ADTOF onsets + MDX23C DrumSep kit stems -> 7 GM drum keys with stem-energy-relative velocity.

Pipeline (R3, freeze v1 §6): the drums stem is separated into kick / snare / toms / hh / ride / crash with the
DrumSep 6-stem model (weights under XLD_DRUMSEP_ROOT, CC BY-NC-ND), ADTOF detects onsets and five classes on the
original drums stem, cymbal hits are assigned to crash or ride by comparing the two stems' energy around the onset,
and every hit's velocity is the short-time RMS peak (dB) of its own stem mapped per class onto 32–127 relative to
this track. This is a relative dynamic, not the recording's true performance velocity. Kit stems are not persisted;
`--keep-kit DIR` on the runner writes them for verification and listening pages.
"""
from pathlib import Path
import hashlib
import json
import math
import os
import sys
import time

ADTOF_TO_STEM = {35: 'kick', 38: 'snare', 47: 'toms', 42: 'hh', 49: None}  # 49 decided per hit: crash / ride
ADTOF_TO_KEY = {35: 'kick', 38: 'snare', 47: 'tom', 42: 'hihat'}
VENDOR = Path(__file__).resolve().parent / 'vendor'


class Config:
    """Attribute access over the MSST yaml dict (replaces ml_collections.ConfigDict)."""
    def __init__(self, data):
        for key, value in data.items():
            setattr(self, key, Config(value) if isinstance(value, dict) else value)

    def __contains__(self, key):
        return hasattr(self, key)


def load_yaml(path):
    import yaml

    class Loader(yaml.SafeLoader):
        pass
    Loader.add_constructor('tag:yaml.org,2002:python/tuple', lambda loader, node: tuple(loader.construct_sequence(node)))
    return yaml.load(Path(path).read_text(encoding='utf-8'), Loader=Loader)


def root():
    return Path(os.environ.get('XLD_DRUMSEP_ROOT', str(Path(__file__).parent / 'drumsep-not-installed')))


def kit_paths(profile):
    kit = profile['options']['kit']
    return root() / kit['file'], root() / kit['config']


def file_sha256(path):
    with Path(path).open('rb') as handle:
        return hashlib.file_digest(handle, 'sha256').hexdigest()


def ready(profile):
    from drums import checkpoint_path
    weight = checkpoint_path(profile)
    checkpoint, config = kit_paths(profile)
    kit = profile['options']['kit']
    return (weight.is_file() and weight.stat().st_size == profile['checkpoint']['size']
            and checkpoint.is_file() and checkpoint.stat().st_size == kit['size'] and config.is_file())


def load_model(profile, notify):
    import torch
    checkpoint, config_file = kit_paths(profile)
    kit = profile['options']['kit']
    if not checkpoint.is_file() or not config_file.is_file():
        raise ValueError('鼓组分离权重缺失（XLD_DRUMSEP_ROOT）')
    notify('校验鼓组分离权重', .05, 'model')
    if file_sha256(checkpoint) != kit['sha256'] or file_sha256(config_file) != kit['configSha256']:
        raise ValueError('鼓组分离权重校验失败')
    config = Config(load_yaml(config_file))
    if list(config.training.instruments) != list(kit['stems']):
        raise ValueError('鼓组分离配置的 stem 顺序与注册表不一致')
    if str(VENDOR) not in sys.path:
        sys.path.insert(0, str(VENDOR))
    from mdx23c.tfc_tdf_v3 import TFC_TDF_net
    model = TFC_TDF_net(config)
    state = torch.load(checkpoint, map_location='cpu', weights_only=True)
    model.load_state_dict(state.get('state_dict', state), strict=True)
    return model.eval(), config


def demix(model, config, mix, device, notify, batch=4):
    """MSST 'generic' overlap-add: chunk_size from the config, num_overlap chunks per position, linear fades,
    reflect padding of (chunk - step) at both ends. mix: float32 (2, T) at 44.1 kHz. Returns float32 (S, 2, T)."""
    import numpy as np
    import torch
    from contextlib import nullcontext
    chunk = int(config.audio.chunk_size)
    overlap = int(config.inference.num_overlap)
    fade = chunk // 10
    step = chunk // overlap
    border = chunk - step
    length = mix.shape[-1]
    source = torch.from_numpy(mix)
    padded = length > 2 * border and border > 0
    if padded:
        source = torch.nn.functional.pad(source, (border, border), mode='reflect')
    total = source.shape[-1]
    stems = len(config.training.instruments)
    result = np.zeros((stems, 2, total), np.float32)
    counter = np.zeros(total, np.float32)
    window = np.ones(chunk, np.float32)
    window[:fade] = np.linspace(0, 1, fade, dtype=np.float32)
    window[-fade:] = np.linspace(1, 0, fade, dtype=np.float32)
    starts = list(range(0, total, step))
    model.to(device)
    if device == 'cuda':
        torch.cuda.reset_peak_memory_stats()
    with torch.inference_mode():
        for index in range(0, len(starts), batch):
            group = starts[index:index + batch]
            parts, lengths = [], []
            for start in group:
                part = source[:, start:start + chunk]
                lengths.append(part.shape[-1])
                if part.shape[-1] < chunk:
                    part = torch.nn.functional.pad(part, (0, chunk - part.shape[-1]), mode='reflect' if part.shape[-1] > chunk // 2 else 'constant')
                parts.append(part)
            with torch.autocast('cuda') if device == 'cuda' else nullcontext():
                predicted = model(torch.stack(parts).to(device))
            values = predicted.float().cpu().numpy()
            if not np.isfinite(values).all():
                raise ValueError('鼓组分离输出包含无效采样')
            for j, start in enumerate(group):
                weights = window.copy()
                if start == 0:
                    weights[:fade] = 1
                if start + chunk >= total:
                    weights[-fade:] = 1
                seg = lengths[j]
                result[:, :, start:start + seg] += values[j, :, :, :seg] * weights[:seg]
                counter[start:start + seg] += weights[:seg]
            notify(f'鼓组分离 · {"GPU" if device == "cuda" else "CPU"} · {min(index + batch, len(starts))}/{len(starts)}', .08 + .42 * min(index + batch, len(starts)) / len(starts), 'separate')
    if np.any(counter <= 0):
        raise ValueError('鼓组分离分块边界不完整')
    result /= counter
    if padded:
        result = result[:, :, border:-border]
    peak = round(torch.cuda.max_memory_allocated() / 1048576) if device == 'cuda' else None
    return result, {'device': device, 'chunk': chunk, 'overlap': overlap, 'batch': batch, 'peakGpuMiB': peak}


def read_audio_44k(audio_path):
    """float32 (2, T) at 44.1 kHz plus the original sample rate (stems are 44.1 kHz; anything else is resampled)."""
    import numpy as np
    import soundfile as sf
    audio, rate = sf.read(str(audio_path), dtype='float32', always_2d=True)
    if rate != 44100:
        from scipy.signal import resample_poly
        divisor = math.gcd(int(rate), 44100)
        audio = resample_poly(audio, 44100 // divisor, int(rate) // divisor, axis=0).astype(np.float32)
    if audio.shape[1] == 1:
        audio = np.repeat(audio, 2, axis=1)
    elif audio.shape[1] > 2:
        audio = audio[:, :2]
    return np.ascontiguousarray(audio.T), rate


def onset_db(stem, onset, options, rate=44100):
    """Peak short-time RMS (dB) of a mono-summed stem in [onset - pre, onset + post]."""
    import numpy as np
    frame = max(1, int(round(options.get('energyFrameSeconds', .005) * rate)))
    start = max(0, int(round((onset - options.get('windowPreSeconds', .01)) * rate)))
    end = min(stem.shape[-1], int(round((onset + options.get('windowPostSeconds', .08)) * rate)))
    if end <= start:
        return -120.0
    mono = stem[:, start:end].mean(axis=0)
    count = (len(mono) // frame) * frame
    if count == 0:
        rms = float(np.sqrt(np.mean(mono ** 2)))
    else:
        frames = mono[:count].reshape(-1, frame)
        rms = float(np.sqrt(np.mean(frames ** 2, axis=1)).max())
        if len(mono) > count:
            rms = max(rms, float(np.sqrt(np.mean(mono[count:] ** 2))))
    return 20 * math.log10(max(rms, 1e-7))


def classify_and_scale(peaks, stems, options):
    """Assign GM keys and velocities. peaks: {adtof_pitch: [seconds]}; stems: {name: (2, T) float32}.
    Returns (hits, summary) where hits are dicts start / pitch / adtofPitch / stem / energyDb / velocity."""
    import numpy as np
    drum_map = options['drumMap']
    ratio = float(options.get('rideRatio', 1.0))
    hits = []
    for adtof_pitch, times in peaks.items():
        adtof_pitch = int(adtof_pitch)
        for onset in times:
            if adtof_pitch == 49:
                crash_db = onset_db(stems['crash'], onset, options)
                ride_db = onset_db(stems['ride'], onset, options)
                ride = ride_db > crash_db + 20 * math.log10(ratio) if ratio > 0 else False
                stem_name, key = ('ride', 'ride') if ride else ('crash', 'crash')
                energy = ride_db if ride else crash_db
            else:
                stem_name = ADTOF_TO_STEM[adtof_pitch]
                key = ADTOF_TO_KEY[adtof_pitch]
                energy = onset_db(stems[stem_name], onset, options)
            hits.append({'start': float(onset), 'pitch': int(drum_map[key]), 'adtofPitch': adtof_pitch,
                         'stem': stem_name, 'energyDb': round(energy, 2)})
    floor, ceil = int(options.get('velocityFloor', 32)), int(options.get('velocityCeil', 127))
    low_p, high_p = float(options.get('percentileLow', 10)), float(options.get('percentileHigh', 98))
    minimum = int(options.get('minimumHitsForClassScale', 4))
    all_db = np.array([hit['energyDb'] for hit in hits], np.float64) if hits else np.zeros(0)
    scales = {}
    for pitch in sorted({hit['pitch'] for hit in hits}):
        values = np.array([hit['energyDb'] for hit in hits if hit['pitch'] == pitch], np.float64)
        pool = values if len(values) >= minimum else all_db
        lo, hi = float(np.percentile(pool, low_p)), float(np.percentile(pool, high_p))
        if hi - lo < 1e-6:
            hi = lo + 1e-6
        scales[pitch] = {'lowDb': round(lo, 2), 'highDb': round(hi, 2), 'hits': int(len(values)), 'pooled': bool(len(values) < minimum)}
        for hit in hits:
            if hit['pitch'] == pitch:
                ratio_value = min(1.0, max(0.0, (hit['energyDb'] - lo) / (hi - lo)))
                hit['velocity'] = int(round(floor + (ceil - floor) * ratio_value))
    hits.sort(key=lambda hit: (hit['start'], hit['pitch']))
    summary = {'scales': {str(k): v for k, v in scales.items()},
               'reclassified': {'crash': sum(1 for h in hits if h['adtofPitch'] == 49 and h['stem'] == 'crash'),
                                'ride': sum(1 for h in hits if h['adtofPitch'] == 49 and h['stem'] == 'ride')},
               'medianDbByStem': {name: round(float(np.median([h['energyDb'] for h in hits if h['stem'] == name])), 2)
                                  for name in stems if any(h['stem'] == name for h in hits)}}
    return hits, summary


def predict(audio_path, profile, notify, duration, keep_kit=None):
    import numpy as np
    import pretty_midi
    import torch
    from drums import activations
    options = profile['options']
    kit = options['kit']
    started = time.monotonic()
    model, config = load_model(profile, notify)
    mix, source_rate = read_audio_44k(audio_path)
    cuda = torch.cuda.is_available()
    separated = None
    attempts = ['cuda', 'cpu'] if cuda else ['cpu']
    fallback = None
    for index, device in enumerate(attempts):
        try:
            separated, meta = demix(model, config, mix, device, notify, batch=int(options.get('kitBatch', 4)))
            break
        except Exception as error:  # noqa: BLE001 — retry on CUDA OOM only
            if device != 'cuda' or index == len(attempts) - 1 or 'out of memory' not in str(error).lower():
                raise
            fallback = 'CUDA out of memory'
            model.to('cpu')
            torch.cuda.empty_cache()
            notify('显存不足，鼓组分离改用 CPU', .1, 'fallback')
    separation_seconds = round(time.monotonic() - started, 3)
    stems = {name: separated[i] for i, name in enumerate(config.training.instruments)}
    del separated
    model.to('cpu')
    del model
    if cuda:
        torch.cuda.empty_cache()
    if keep_kit:
        import soundfile as sf
        folder = Path(keep_kit)
        folder.mkdir(parents=True, exist_ok=True)
        for name, stem in stems.items():
            sf.write(str(folder / f'{name}.wav'), stem.T, 44100, subtype='FLOAT')
        (folder / 'kit.json').write_text(json.dumps({'source': str(audio_path), 'stems': list(stems), 'sampleRate': 44100,
                                                     'checkpointSha256': kit['sha256'], **meta}, ensure_ascii=False, indent=2), encoding='utf-8')
    peaks, adtof_meta = activations(audio_path, profile, notify)
    notify('按鼓组 stem 判定 crash / ride 与力度', .9, 'velocity')
    hits, summary = classify_and_scale(peaks, stems, options)
    midi = pretty_midi.PrettyMIDI()
    instrument = pretty_midi.Instrument(program=0, is_drum=True)
    for hit in hits:
        instrument.notes.append(pretty_midi.Note(velocity=hit['velocity'], pitch=hit['pitch'], start=hit['start'], end=hit['start'] + .1))
    midi.instruments.append(instrument)
    # Top-level checkpointSha256 is what derived-assets compares with profile.checkpoint (the ADTOF weight); the kit
    # checkpoint is bound through options.kit.sha256, which is part of the version identity.
    backend = {'name': 'adtof-pytorch+mdx23c-drumsep', 'device': meta['device'], 'velocityMode': 'stem-energy-relative',
               'checkpointSha256': adtof_meta['checkpointSha256'], 'revision': adtof_meta['revision'],
               'drumClasses': sorted({int(v) for v in options['drumMap'].values()}),
               'classMap': {str(options['drumMap'][key]): adtof for adtof, key in ADTOF_TO_KEY.items()} | {str(options['drumMap']['crash']): 49, str(options['drumMap']['ride']): 49},
               'reclassified': summary['reclassified'], 'velocityScales': summary['scales'],
               'kit': {'checkpointSha256': kit['sha256'], 'configSha256': kit['configSha256'], 'license': kit.get('license'),
                       'stems': list(stems), 'separationSeconds': separation_seconds, 'sourceSampleRate': source_rate,
                       'medianDbByStem': summary['medianDbByStem'], 'fallback': fallback, **meta},
               'adtof': {'checkpointSha256': adtof_meta['checkpointSha256'], 'revision': adtof_meta['revision'], 'device': adtof_meta['device']},
               'annotations': [{'start': hit['start'], 'pitch': hit['pitch'], 'adtofPitch': hit['adtofPitch'], 'stem': hit['stem'], 'energyDb': hit['energyDb']} for hit in hits]}
    return midi, backend


def annotate(notes, annotations):
    """Attach adtofPitch / stem / energyDb to the runner's note dicts by (start, pitch)."""
    lookup = {}
    for item in annotations:
        lookup.setdefault((round(item['start'], 6), item['pitch']), []).append(item)
    for note in notes:
        bucket = lookup.get((round(note['start'], 6), note['pitch']))
        if bucket:
            item = bucket.pop(0)
            note.update(adtofPitch=item['adtofPitch'], stem=item['stem'], energyDb=item['energyDb'])
    return notes


def selftest():
    """Synthetic check of the post-processing: louder impulses get higher velocity, ride/crash follow stem energy."""
    import numpy as np
    rate = 44100
    length = rate * 4
    stems = {name: np.zeros((2, length), np.float32) for name in ['kick', 'snare', 'toms', 'hh', 'ride', 'crash']}
    def burst(stem, t, amplitude):
        start = int(t * rate)
        stems[stem][:, start:start + 441] = amplitude
    for i, amplitude in enumerate([.05, .1, .2, .4, .8]):
        burst('kick', .5 + i * .5, amplitude)
    burst('crash', 3.0, .5); burst('ride', 3.0, .05)  # crash hit
    burst('ride', 3.5, .4); burst('crash', 3.5, .02)  # ride hit
    burst('snare', 1.25, .3)
    options = {'drumMap': {'kick': 36, 'snare': 38, 'tom': 47, 'hihat': 42, 'crash': 49, 'ride': 51}, 'rideRatio': 1.0}
    peaks = {35: [.5 + i * .5 for i in range(5)], 49: [3.0, 3.5], 38: [1.25]}
    hits, summary = classify_and_scale(peaks, stems, options)
    kicks = [h['velocity'] for h in hits if h['pitch'] == 36]
    assert kicks == sorted(kicks) and kicks[0] == 32 and kicks[-1] == 127, kicks
    assert len(set(kicks)) == 5, kicks
    cymbals = {round(h['start'], 1): h['pitch'] for h in hits if h['adtofPitch'] == 49}
    assert cymbals == {3.0: 49, 3.5: 51}, cymbals
    assert summary['reclassified'] == {'crash': 1, 'ride': 1}, summary
    snare = [h for h in hits if h['pitch'] == 38][0]
    assert snare['velocity'] >= 32 and summary['scales']['38']['pooled'] is True
    notes = annotate([{'start': h['start'], 'end': h['start'] + .1, 'pitch': h['pitch'], 'velocity': h['velocity']} for h in hits], hits)
    assert all('adtofPitch' in n and 'energyDb' in n for n in notes)
    print(json.dumps({'ok': True, 'kickVelocities': kicks, 'cymbals': cymbals, 'scales': summary['scales']}, ensure_ascii=False))


if __name__ == '__main__':
    if '--selftest' in sys.argv:
        selftest()
    else:
        raise SystemExit('usage: drumkit.py --selftest')
