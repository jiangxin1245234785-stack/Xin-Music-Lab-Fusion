"""Layers the listening score needs that no other analysis writes: the beat grid, the song's
loudness, and how loud each stem is.

    <muscriptor python> -X utf8 runner.py --engine score-layers --input <original audio> --output <result.json>

Started by the analysis service like any other result engine (stage two of the score view,
work package B0). The result sits next to the track's other results as `score-layers.json`;
`music-lab.json` is not changed, and a host that does not know this file loses nothing.

    bars    {beatsPerBar, bpm, beats, downbeats, steady, why}
            The grid is `analysis-midi/tempo.analyze` (Beat This on the original audio). Bar
            lines exist only when the grid is steady and at least 90 % of the model's own bars
            agree on one length; otherwise `downbeats` is empty and `why` says so. A wrong
            bar line on screen is worse than none.
    energy  {hop, db}          RMS of the mono mix every 0.1 s
    levels  {hop, groups}      K-weighted level of each stem every second (needs the stems)

A layer that cannot be made is `null` and its reason is in `missing`; the others still come.
The runner only reads the audio, the stems and the MIDI records. It runs under the MuScriptor
interpreter because the beat model lives in that add-on.
"""
import argparse
import json
import os
import sys
import time
from collections import Counter
from pathlib import Path

HERE = Path(__file__).resolve().parent
MIDI = HERE.parent / 'analysis-midi'
ENGINE = {'id': 'score-layers', 'name': 'Score layers', 'family': 'score', 'version': 1}
BEAT_PROFILE = 'strings-muscriptor-large-v04'     # the profile that carries `tempoAnalysis`
#: Upstream writes a time signature when 90 % of bars agree; a bar line on screen is the same claim.
MIN_BAR_AGREEMENT = 0.9


def say(progress, message, phase='analysis'):
    print(json.dumps({'progress': progress, 'phase': phase, 'message': message}, ensure_ascii=False), flush=True)


def profiles(node):
    if isinstance(node, dict):
        if 'id' in node and 'options' in node:
            yield node
        for value in node.values():
            yield from profiles(value)
    elif isinstance(node, list):
        for value in node:
            yield from profiles(value)


def bar_lengths(beats, downbeats):
    """How many tracked beats each of the model's own bars holds: {length: count}."""
    import numpy as np
    if len(downbeats) < 2 or len(beats) < 2:
        return {}
    index = np.abs(np.asarray(downbeats)[:, None] - np.asarray(beats)[None, :]).argmin(axis=1)
    return dict(Counter(int(n) for n in np.diff(index) if n >= 1))


def make_bars(source, duration):
    import numpy as np
    sys.path.insert(0, str(MIDI))
    import muscriptor_backend as backend
    import tempo
    profile = next(p for p in profiles(json.loads((MIDI / 'models.json').read_text(encoding='utf-8'))) if p['id'] == BEAT_PROFILE)
    settings = profile['options']['tempoAnalysis']
    sys.path.insert(0, str(backend.runtime_root() / settings['depsDirectory']))
    import beat_this.inference as beat_this

    # `analyze` keeps the beats and one first downbeat; the model's own downbeats are the only
    # evidence of whether the song has one bar length at all, so they are caught on the way past.
    captured = {}
    original = beat_this.Audio2Beats.__call__

    def spy(self, signal, rate):
        result = original(self, signal, rate)
        captured['beats'], captured['downbeats'] = (np.asarray(x, dtype=float) for x in result)
        return result

    beat_this.Audio2Beats.__call__ = spy
    try:
        timing = tempo.analyze(source, profile, duration, notify=lambda message, *_: say(0.1, str(message), 'beats'))
    finally:
        beat_this.Audio2Beats.__call__ = original
    beats = [round(float(t), 4) for t in timing['beats']]
    lengths = bar_lengths(captured.get('beats', []), captured.get('downbeats', []))
    total = sum(lengths.values())
    agreement = max(lengths.values()) / total if total else 0.0
    reasons = []
    if not timing['steady']:
        reasons.append('拍点偏离恒定速度')
    if not timing['beatsPerBar']:
        reasons.append('小节长度不一致，定不出拍号')
    elif agreement < MIN_BAR_AGREEMENT:
        reasons.append(f'只有 {agreement:.0%} 的小节是 {timing["beatsPerBar"]} 拍')
    steady = not reasons
    downbeats = []
    if steady and beats:
        # XLD's own rule: the bar starts on the tracked beat nearest the first downbeat, then
        # every beatsPerBar beats. Beats before it are a pickup and get no bar line.
        first = min(range(len(beats)), key=lambda i: abs(beats[i] - timing['firstDownbeat']))
        downbeats = beats[first::timing['beatsPerBar']]
    return {'beatsPerBar': timing['beatsPerBar'] if steady else None, 'bpm': round(float(timing['bpm']), 3), 'beats': beats,
            'downbeats': downbeats, 'steady': steady, 'why': '；'.join(reasons) or None,
            'barAgreement': round(agreement, 3), 'barLengthsInBeats': {str(k): v for k, v in sorted(lengths.items())},
            'engine': 'analysis-midi/tempo.analyze (Beat This)', 'checkpointSha256': timing.get('checkpointSha256')}


def make_energy(mono, rate):
    import numpy as np
    hop = rate // 10
    count = len(mono) // hop
    frames = mono[:count * hop].reshape(count, hop)
    db = 20 * np.log10(np.maximum(np.sqrt(np.mean(frames ** 2, axis=1)), 1e-6))
    return {'hop': hop / rate, 'db': [round(float(v), 1) for v in db]}


def k_weighted(mono, rate):
    """ITU-R BS.1770 K-weighting: a high shelf above ~1.7 kHz, then a high-pass at 38 Hz.

    Without it a bass or a kick, which carry far more raw energy than they sound like they
    do, would be taken for the loudest thing in the song.
    """
    import numpy as np
    from scipy.signal import lfilter
    f0, gain, q = 1681.974450955533, 3.999843853973347, 0.7071752369554196
    k = np.tan(np.pi * f0 / rate)
    vh, vb = 10 ** (gain / 20), (10 ** (gain / 20)) ** 0.4996667741545416
    a0 = 1 + k / q + k * k
    shelf_b = [(vh + vb * k / q + k * k) / a0, 2 * (k * k - vh) / a0, (vh - vb * k / q + k * k) / a0]
    shelf_a = [1, 2 * (k * k - 1) / a0, (1 - k / q + k * k) / a0]
    f0, q = 38.13547087602444, 0.5003270373238773
    k = np.tan(np.pi * f0 / rate)
    a0 = 1 + k / q + k * k
    high_a = [1, 2 * (k * k - 1) / a0, (1 - k / q + k * k) / a0]
    return lfilter([1, -2, 1], high_a, lfilter(shelf_b, shelf_a, mono))


def stem_files(track_dir):
    """Which audio each lane group is heard from: the separated stem, or what its MIDI was made from."""
    manifest = json.loads((track_dir / 'stems.json').read_text(encoding='utf-8'))
    files = {stem['name']: track_dir / stem['file'] for stem in manifest['stems']}
    midi = track_dir / 'midi'
    for pointer in sorted(midi.glob('*.json')) if midi.is_dir() else []:
        try:
            source = Path(json.loads(pointer.read_text(encoding='utf-8')).get('source', {}).get('path') or '')
        except (OSError, ValueError, AttributeError):
            continue
        if not pointer.stem.endswith('-source') and source.is_file():
            files[pointer.stem] = source
    return files


def make_levels(track_dir):
    import numpy as np
    import soundfile as sf
    groups = {}
    for group, path in stem_files(track_dir).items():
        if not Path(path).is_file():
            continue
        audio, rate = sf.read(str(path), dtype='float32', always_2d=True)
        weighted = k_weighted(audio.mean(axis=1), rate)
        count = len(weighted) // rate
        if not count:
            continue
        power = np.mean(weighted[:count * rate].reshape(count, rate) ** 2, axis=1)
        groups[group] = [round(float(v), 1) for v in -0.691 + 10 * np.log10(np.maximum(power, 1e-10))]
    if not groups:
        raise ValueError('没有可读的分轨')
    return {'hop': 1.0, 'weighting': 'K (ITU-R BS.1770)', 'groups': groups}


def main(argv=None):
    parser = argparse.ArgumentParser()
    parser.add_argument('--engines', action='store_true')
    parser.add_argument('--engine')
    parser.add_argument('--input')
    parser.add_argument('--output')
    args = parser.parse_args(argv)
    if args.engines:
        print(json.dumps([{**ENGINE, 'available': True}]))
        return 0
    if args.engine != ENGINE['id'] or not args.input or not args.output:
        parser.error('需要 --engine score-layers --input <原曲> --output <结果>')
    import soundfile as sf
    source, output = Path(args.input).resolve(), Path(args.output).resolve()
    track_dir = output.parent
    started = time.monotonic()
    say(0.02, '正在读取音频', 'decode')
    info = sf.info(str(source))
    audio, rate = sf.read(str(source), dtype='float32', always_2d=True)
    duration = len(audio) / rate
    print(json.dumps({'durationSeconds': duration}), flush=True)
    layers, missing = {'bars': None, 'energy': None, 'levels': None}, {}
    steps = (('energy', 0.08, '正在量整首歌的响度', lambda: make_energy(audio.mean(axis=1), rate)),
             ('levels', 0.15, '正在量每条分轨的响度', lambda: make_levels(track_dir)),
             # The beat analysis checks the length it is told against the file header, to the
             # millisecond; for an mp3 the header and the decoded length are not the same number.
             ('bars', 0.3, '正在找拍点', lambda: make_bars(source, info.frames / info.samplerate)))
    for name, progress, message, make in steps:
        say(progress, message, name)
        try:
            layers[name] = make()
        except Exception as error:  # one layer failing must not take the others with it
            missing[name] = f'{type(error).__name__}: {error}'[:400]
    if not any(layers.values()):
        raise SystemExit('谱面层一层都没有做出来：' + json.dumps(missing, ensure_ascii=False))
    try:
        stem_run = json.loads((track_dir / 'stems.json').read_text(encoding='utf-8')).get('runId')
    except (OSError, ValueError):
        stem_run = None
    # Which separation the stem levels were measured on: a new separation makes this result stale.
    result = {'schemaVersion': 1, 'kind': 'score-layers', 'engine': ENGINE, 'duration': duration, 'source': {'stemRunId': stem_run},
              # The service accepts a result by its `engine` and `segments`; this one has no segments.
              'segments': [], **layers, 'missing': missing, 'analysisSeconds': round(time.monotonic() - started, 1)}
    output.parent.mkdir(parents=True, exist_ok=True)
    output.write_text(json.dumps(result, ensure_ascii=False), encoding='utf-8')
    say(1.0, '谱面层完成', 'complete')
    return 0


if __name__ == '__main__':
    sys.exit(main())
