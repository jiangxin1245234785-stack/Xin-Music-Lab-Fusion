"""Beat grid of one song, through XLD's own `analysis-midi/tempo.analyze`.

    <muscriptor python> -X utf8 layer_beats.py <original audio> <out.json>

Runs under the interpreter MuScriptor uses (`runtime/addons/yourmt3-v1/python.exe`): the
beat model, Beat This, lives in that addon's `v04-deps`. `tempo.py` and the upstream code
are imported read-only; nothing of theirs is copied or changed.

`analyze` returns the beats and one first downbeat. The model's own downbeat picks are
thrown away inside `detect_grid`, and they are the only evidence for whether the song has
a bar length at all, so they are captured on the way past and written next to the result
as diagnostics (`raw`). The score view draws bar lines only when `stable` says so (plan
decision D4); it never counts bars onto a grid that failed this test.
"""
import json
import os
import sys
from collections import Counter
from pathlib import Path

HERE = Path(__file__).resolve().parent
REPO = HERE.parents[2]
MIDI = REPO / 'source' / 'xld-runtime-baseline' / 'analysis-midi'
PROFILE = 'strings-muscriptor-large-v04'          # the profile that carries `tempoAnalysis`

#: A bar grid is drawn only when at least this share of the model's own bars agree on one
#: length. Upstream uses 0.9 for writing a time signature; a wrong bar line on screen is
#: the same kind of mistake, so the same bar is used.
MIN_BAR_AGREEMENT = 0.9


def profiles(node):
    """Every dict carrying an `id`, wherever models.json nests its profile list."""
    if isinstance(node, dict):
        if 'id' in node and 'options' in node:
            yield node
        for value in node.values():
            yield from profiles(value)
    elif isinstance(node, list):
        for value in node:
            yield from profiles(value)


def bar_lengths(beats, downbeats):
    """How many tracked beats each of the model's bars holds: {length: count}."""
    import numpy as np
    if len(downbeats) < 2 or len(beats) < 2:
        return {}
    index = np.abs(np.asarray(downbeats)[:, None] - np.asarray(beats)[None, :]).argmin(axis=1)
    return dict(Counter(int(n) for n in np.diff(index) if n >= 1))


def main(argv=None):
    argv = list(sys.argv[1:] if argv is None else argv)
    if len(argv) != 2:
        raise SystemExit(__doc__)
    source, out = Path(argv[0]).resolve(), Path(argv[1]).resolve()
    os.environ.setdefault('XLD_MUSCRIPTOR_ROOT', str(REPO / 'runtime' / 'addons' / 'muscriptor-v1'))
    sys.path.insert(0, str(MIDI))

    import numpy as np
    import soundfile as sf
    import muscriptor_backend as backend
    import tempo

    profile = next(p for p in profiles(json.loads((MIDI / 'models.json').read_text(encoding='utf-8')))
                   if p['id'] == PROFILE)
    settings = profile['options']['tempoAnalysis']
    sys.path.insert(0, str(backend.runtime_root() / settings['depsDirectory']))
    import beat_this.inference as beat_this

    captured = {}
    original = beat_this.Audio2Beats.__call__

    def spy(self, signal, rate):
        result = original(self, signal, rate)
        captured['beats'], captured['downbeats'] = (np.asarray(x, dtype=float) for x in result)
        return result

    beat_this.Audio2Beats.__call__ = spy
    info = sf.info(str(source))
    duration = info.frames / info.samplerate
    try:
        timing = tempo.analyze(source, profile, duration,
                               notify=lambda message, *_: print(f'  {message}', flush=True))
    finally:
        beat_this.Audio2Beats.__call__ = original

    beats = np.asarray(timing['beats'], dtype=float)
    gaps = np.diff(beats)
    period = 60.0 / timing['bpm']
    index = np.arange(len(beats))
    slope, intercept = np.polyfit(index, beats, 1)
    residual = beats - (intercept + slope * index)
    lengths = bar_lengths(captured['beats'], captured['downbeats'])
    total = sum(lengths.values())
    agreement = max(lengths.values()) / total if total else 0.0
    # The local tempo over ~8 beats: a tempo that drifts or steps shows up as a spread here
    # even when single gaps look fine.
    local = 60.0 / np.convolve(gaps, np.ones(8) / 8, mode='valid') if len(gaps) >= 8 else np.array([])
    stable = bool(timing['steady'] and timing['beatsPerBar'] and agreement >= MIN_BAR_AGREEMENT)
    reasons = []
    if not timing['steady']:
        reasons.append(f'拍点偏离恒定速度 {residual.std() * 1000:.0f} ms（上限 {0.05 * period * 1000:.0f} ms）')
    if not timing['beatsPerBar']:
        reasons.append('小节长度不一致，定不出拍号')
    elif agreement < MIN_BAR_AGREEMENT:
        reasons.append(f'只有 {agreement:.0%} 的小节是 {timing["beatsPerBar"]} 拍')

    record = {
        'schemaVersion': 1, 'kind': 'beat-grid', 'source': str(source), 'duration': duration,
        'engine': 'xld analysis-midi/tempo.analyze (Beat This final0, dbn=False)',
        'bpm': timing['bpm'], 'beatsPerBar': timing['beatsPerBar'], 'firstDownbeat': timing['firstDownbeat'],
        'steady': timing['steady'], 'beats': [round(float(t), 4) for t in beats],
        'tempoNeedsEar': timing['tempoNeedsEar'], 'octaveCheck': timing['octaveCheck'],
        'checkpointSha256': timing['checkpointSha256'], 'analysisSeconds': timing['analysisSeconds'],
        'stable': stable, 'unstableBecause': reasons,
        'measured': {
            'beats': int(len(beats)), 'span': [round(float(beats[0]), 3), round(float(beats[-1]), 3)],
            'residualRmsMs': round(float(residual.std()) * 1000, 1),
            'residualLimitMs': round(0.05 * period * 1000, 1),
            'gapMedianMs': round(float(np.median(gaps)) * 1000, 1),
            'gapP05P95Ms': [round(float(np.percentile(gaps, p)) * 1000, 1) for p in (5, 95)],
            'localTempoP05P50P95': [round(float(np.percentile(local, p)), 1) for p in (5, 50, 95)] if local.size else None,
            'barLengthsInBeats': {str(k): v for k, v in sorted(lengths.items())},
            'barAgreement': round(agreement, 3),
        },
        'raw': {'beats': [round(float(t), 4) for t in captured['beats']],
                'downbeats': [round(float(t), 4) for t in captured['downbeats']]},
    }
    out.parent.mkdir(parents=True, exist_ok=True)
    out.write_text(json.dumps(record, ensure_ascii=False), encoding='utf-8')
    verdict = '稳定，可以画小节线' if stable else '不稳定，退回秒刻度：' + '；'.join(reasons)
    print(f'  {timing["bpm"]:.2f} BPM · {len(beats)} 拍 · 拍号 {timing["beatsPerBar"]} · {verdict}', flush=True)
    print(f'  小节长度分布（按模型自己的强拍）：{record["measured"]["barLengthsInBeats"]}', flush=True)
    return 0


if __name__ == '__main__':
    sys.exit(main())
