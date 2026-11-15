"""How far the notes in a pilot's model sit from the sound they stand for, measured on the audio.

    <envs/basic>/python.exe -X utf8 source/scoreview/tools/measure_sync.py onsets <pilot>
    <envs/basic>/python.exe -X utf8 source/scoreview/tools/measure_sync.py excerpt <pilot> <start s> <seconds>

`onsets` answers "is this lane early or late against its own stem". For every lane it
slides the lane's note starts along the stem the notes were transcribed from and finds the
shift at which the most sound begins: a rise-in-level curve is summed at every note start,
for every shift from -150 to +150 ms, and the shift with the largest sum is the lane's
offset. Positive means the sound starts after the note does (the note crosses the play
line early). The curve has a lag of its own (a level has to rise before it shows), so the
same procedure is run on synthetic bursts at known times and that lag is taken off.

It measures timing only. A lane can be perfectly on time and still be the wrong notes.

`excerpt` writes a short mono WAV of the original, decoded the way XLD decodes it, into
`<page>/measure/`. The page's in-browser check (see HANDOFF) correlates what the browser
actually plays against it, which is how the browser's own decoding of the compressed file
is tied back to the stems' clock.

Read-only on the analysis root; writes only under work/scoreview-20261110/.
"""
import argparse
import json
import sys
from pathlib import Path

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE))
from make_layers import load_config, source_of  # noqa: E402
from census import active_record  # noqa: E402

GRID = 1000                 # the rise curve is sampled every millisecond
REACH_MS = 150
RMS_MS = 5                  # level is measured over this window
RISE_MS = 10                # and compared with the level this long before


def rise_curve(mono, rate):
    """Half-wave rectified rise of the log level, one value per millisecond."""
    import numpy as np
    window = max(1, int(round(rate * RMS_MS / 1000)))
    power = np.convolve(mono.astype(np.float64) ** 2, np.ones(window) / window, mode='same')
    step = rate / GRID
    index = np.minimum((np.arange(int(len(mono) / step)) * step).astype(np.int64), len(mono) - 1)
    level = 10 * np.log10(np.maximum(power[index], 1e-10))
    level = np.maximum(level, level.max() - 60)                   # silence is silence, not -100 dB
    rise = np.zeros_like(level)
    rise[RISE_MS:] = np.maximum(0, level[RISE_MS:] - level[:-RISE_MS])
    return rise


def offset_of(rise, onsets):
    """(lag ms at the peak, width of the peak at 80% in ms, peak over the typical value, onsets used)."""
    import numpy as np
    starts = np.unique(np.round(np.asarray(onsets) * GRID).astype(np.int64))
    starts = starts[(starts > REACH_MS + RISE_MS) & (starts < len(rise) - REACH_MS - 1)]
    if len(starts) < 20:
        return None
    lags = np.arange(-REACH_MS, REACH_MS + 1)
    score = np.array([rise[starts + lag].sum() for lag in lags])
    smooth = np.convolve(score, np.ones(5) / 5, mode='same')
    peak = int(np.argmax(smooth))
    above = np.flatnonzero(smooth >= smooth[peak] - 0.2 * (smooth[peak] - np.median(smooth)))
    left = right = peak
    while left - 1 in above:
        left -= 1
    while right + 1 in above:
        right += 1
    return int(lags[peak]), int(right - left + 1), float(smooth[peak] / max(np.median(smooth), 1e-9)), int(len(starts))


def method_lag(rate):
    """The curve's own lag: bursts with a 2 ms attack at known times, measured the same way."""
    import numpy as np
    rng = np.random.default_rng(7)
    seconds = 40
    audio = rng.normal(0, 1e-4, rate * seconds)
    times = np.sort(rng.uniform(1, seconds - 1, 120))
    attack, body = int(0.002 * rate), int(0.08 * rate)
    for t in times:
        start = int(round(t * rate))
        burst = rng.normal(0, 0.3, body) * np.exp(-np.arange(body) / (0.03 * rate))
        burst[:attack] *= np.linspace(0, 1, attack)
        audio[start:start + body] += burst
    return offset_of(rise_curve(audio, rate), times)[0]


def stem_audio(track_dir, record):
    recorded = Path((record.get('source') or {}).get('path') or '')
    if recorded.is_file():
        return recorded
    for marker in ('stems', 'refinement'):
        if marker in recorded.parts:
            moved = track_dir.joinpath(*recorded.parts[recorded.parts.index(marker):])
            if moved.is_file():
                return moved
    return None


def onsets(config, name):
    import numpy as np
    import soundfile as sf
    pilot = config['pilots'][name]
    track_dir = config['analysisRoot'] / pilot['trackDir']
    data = config['dataRoot'] / name
    model = json.loads((data / 'bundle.json').read_text(encoding='utf-8'))
    curves, rows = {}, []

    def curve_for(path):
        if path not in curves:
            audio, rate = sf.read(str(path), dtype='float32', always_2d=True)
            curves[path] = (rise_curve(audio.mean(axis=1), rate), rate)
        return curves[path]

    calibration = {}
    for lane in model['lanes']:
        if lane['kind'] == 'melody':
            spec = pilot.get('vocals') or {}
            path = (Path(spec['audio']) if Path(spec.get('audio', '')).is_absolute()
                    else config['analysisRoot'].parents[2] / spec['audio']) if spec.get('audio') else None
        else:
            record, _ = active_record(track_dir, lane['group'])
            path = stem_audio(track_dir, record) if record else None
        if not path or not Path(path).is_file():
            rows.append({'lane': lane['id'], 'label': lane['label'], 'note': '找不到这条轨的分轨音频'})
            continue
        rise, rate = curve_for(Path(path))
        if rate not in calibration:
            calibration[rate] = method_lag(rate)
        groups = ([(lane['label'], [n[0] for n in lane['notes']])] if lane['kind'] != 'drums' else
                  [(f'{lane["label"]}·{row}', [h[0] for h in lane['hits'] if h[1] == index])
                   for index, row in enumerate(lane['rows'])])
        for label, starts in groups:
            found = offset_of(rise, starts)
            if not found:
                if starts:
                    rows.append({'lane': lane['id'], 'label': label, 'onsets': len(set(starts)), 'note': '起音太少，量不出'})
                continue
            lag, width, contrast, used = found
            rows.append({'lane': lane['id'], 'label': label, 'onsets': used, 'offsetMs': lag - calibration[rate],
                         'peakWidthMs': width, 'contrast': round(contrast, 2)})
    result = {'pilot': name, 'methodLagMs': calibration, 'reachMs': REACH_MS, 'rows': rows,
              'reading': '正数：声音比音符晚开始（音符过线偏早）；负数：音符过线偏晚。peakWidthMs 越宽、contrast 越接近 1，这个数越不可信。'}
    (data / 'sync-onsets.json').write_text(json.dumps(result, ensure_ascii=False, indent=1), encoding='utf-8')
    print(f'■ {model["track"]["title"]}（测量方法自身的滞后 {calibration} ms，已扣除）')
    print(f'  {"轨":<14}{"起音数":>7}{"偏移 ms":>9}{"峰宽 ms":>9}{"峰比":>7}')
    for row in rows:
        if 'offsetMs' in row:
            print(f'  {row["label"]:<14}{row["onsets"]:>8}{row["offsetMs"]:>+10}{row["peakWidthMs"]:>10}{row["contrast"]:>9}')
        else:
            print(f'  {row["label"]:<14}{row.get("onsets", 0):>8}   {row["note"]}')
    return 0


def excerpt(config, name, start, seconds):
    import soundfile as sf
    pilot = config['pilots'][name]
    audio, rate = sf.read(str(source_of(config['analysisRoot'] / pilot['trackDir'])), dtype='float32', always_2d=True)
    first = int(round(start * rate))
    out = config['pageRoot'] / 'measure' / f'{name}-{start:g}-{seconds:g}.wav'
    out.parent.mkdir(parents=True, exist_ok=True)
    sf.write(str(out), audio[first:first + int(round(seconds * rate))].mean(axis=1), rate, subtype='PCM_16')
    print(f'  {out.name}：原曲 {start:g}–{start + seconds:g} 秒，{rate} Hz 单声道（只用于本地量同步，不发布）')
    return 0


def main(argv=None):
    parser = argparse.ArgumentParser(description='量音符和声音差多少')
    commands = parser.add_subparsers(dest='command', required=True)
    one = commands.add_parser('onsets')
    one.add_argument('pilot')
    two = commands.add_parser('excerpt')
    two.add_argument('pilot')
    two.add_argument('start', type=float)
    two.add_argument('seconds', type=float)
    args = parser.parse_args(argv)
    config = load_config()
    if args.command == 'onsets':
        return onsets(config, args.pilot)
    return excerpt(config, args.pilot, args.start, args.seconds)


if __name__ == '__main__':
    sys.exit(main())
