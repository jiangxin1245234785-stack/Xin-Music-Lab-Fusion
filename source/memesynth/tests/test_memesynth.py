"""Self-contained checks for the score, kit and render layers.

Run with any interpreter that has the requirements installed:

    python source/memesynth/tests/test_memesynth.py

The routing checks run against a real XLD export under `artifacts/` when one is
present, because the contract this program depends on is a property of XLD's output,
not of a fixture we wrote ourselves. They skip when the artifact tree is absent.
"""
import sys
import tempfile
from pathlib import Path

import numpy as np
import pretty_midi
import soundfile

ROOT = Path(__file__).resolve().parents[1]
REPO = Path(__file__).resolve().parents[3]
sys.path.insert(0, str(ROOT))

from memesynth.kit import KitError, load_kit  # noqa: E402
from memesynth.render import peak_factor, pitch_to_hz, render, resample, to_stereo  # noqa: E402
from memesynth.score import DRUM_CLASSES, DRUM_ROUTES, normalise_route, read_score  # noqa: E402

RATE = 48000
PASSED, FAILED, SKIPPED = [], [], []


def check(name):
    def wrap(function):
        try:
            function()
        except AssertionError as error:
            FAILED.append((name, str(error) or 'assertion failed'))
        except _Skip as error:
            SKIPPED.append((name, str(error)))
        except Exception as error:  # noqa: BLE001
            FAILED.append((name, f'{type(error).__name__}: {error}'))
        else:
            PASSED.append(name)
        return function
    return wrap


class _Skip(Exception):
    pass


def tone(frequency, seconds, rate=RATE):
    t = np.arange(int(seconds * rate), dtype=np.float32) / rate
    return (0.5 * np.sin(2 * np.pi * frequency * t)).astype(np.float32)


def synthetic_kit(directory, root_hz=220.0):
    """A kit of two sine samples, written to `directory`, plus its loaded form."""
    directory = Path(directory)
    (directory / 'samples').mkdir(parents=True, exist_ok=True)
    soundfile.write(str(directory / 'samples' / 'lead.wav'), tone(root_hz, 0.4), RATE)
    soundfile.write(str(directory / 'samples' / 'hit.wav'), tone(900.0, 0.12), RATE)
    (directory / 'kit.json').write_text(
        '{"name": "test", "samples": {'
        f'"lead": {{"file": "samples/lead.wav", "rootHz": {root_hz}}},'
        '"hit": {"file": "samples/hit.wav", "rootHz": 900.0}},'
        '"voices": {'
        '"guitar": {"sample": "lead", "gain": 0.8, "pan": -0.3},'
        '"guitar/distorted electric guitar": {"sample": "lead", "transpose": -12},'
        '"drums/kick": {"sample": "hit", "pitched": false, "follow": "sample"}}}',
        encoding='utf-8')
    return load_kit(directory / 'kit.json', sample_rate=RATE)


def synthetic_score(path):
    """A tiny merged-style MIDI: one named melodic track and one drum track."""
    midi = pretty_midi.PrettyMIDI()
    guitar = pretty_midi.Instrument(program=26, name='guitar / clean electric guitar')
    guitar.notes.append(pretty_midi.Note(velocity=100, pitch=57, start=0.0, end=0.5))
    guitar.notes.append(pretty_midi.Note(velocity=100, pitch=69, start=1.0, end=1.5))
    guitar.notes.append(pretty_midi.Note(velocity=100, pitch=60, start=2.0, end=2.008))  # 8 ms
    drums = pretty_midi.Instrument(program=0, is_drum=True, name='drums')
    drums.notes.append(pretty_midi.Note(velocity=120, pitch=36, start=0.0, end=0.1))
    drums.notes.append(pretty_midi.Note(velocity=60, pitch=99, start=0.5, end=0.6))  # unknown class
    midi.instruments.extend([guitar, drums])
    midi.write(str(path))
    return path


# --- score layer -----------------------------------------------------------------

@check('normalise_route 把轨名压成路由键')
def _():
    assert normalise_route('guitar / Clean Electric Guitar') == 'guitar/clean electric guitar'
    assert normalise_route('  BASS  ') == 'bass'
    assert normalise_route(None) == ''


@check('read_score 丢弃极短音符并按 pitch 分鼓类')
def _():
    with tempfile.TemporaryDirectory() as box:
        score = read_score(synthetic_score(Path(box) / 'merged.mid'))
    assert score.routes.get('guitar/clean electric guitar') == 2, score.routes
    assert score.routes.get('drums/kick') == 1, score.routes
    assert any('短于' in reason for reason in score.dropped), score.dropped
    assert any('未知鼓 pitch 99' in reason for reason in score.dropped), score.dropped


@check('read_score 的时间是秒，不受占位 tempo 影响')
def _():
    with tempfile.TemporaryDirectory() as box:
        score = read_score(synthetic_score(Path(box) / 'merged.mid'))
    first = next(note for note in score.notes if note.route.startswith('guitar'))
    assert abs(first.start - 0.0) < 1e-6, first
    second = [note for note in score.notes if note.route.startswith('guitar')][1]
    assert abs(second.start - 1.0) < 1e-6, second
    assert abs(second.duration - 0.5) < 1e-6, second


@check('read_score 对非 merged 导出发出警告')
def _():
    with tempfile.TemporaryDirectory() as box:
        midi = pretty_midi.PrettyMIDI()
        track = pretty_midi.Instrument(program=26, name='clean electric guitar')
        track.notes.append(pretty_midi.Note(velocity=100, pitch=57, start=0.0, end=0.5))
        midi.instruments.append(track)
        path = Path(box) / 'guitar.mid'
        midi.write(str(path))
        score = read_score(path)
    assert score.warnings and '单 stem 导出' in score.warnings[0], score.warnings


@check('真实 XLD 导出：轨名带 stem 前缀、鼓轨路由落在已知七类里')
def _():
    found = sorted(REPO.glob('artifacts/**/midi/merged/*/merged.mid'))
    if not found:
        raise _Skip('本机没有 artifacts/ 下的真实导出')
    score = read_score(found[0])
    stems = {route.split('/')[0] for route in score.routes}
    assert 'drums' in stems, stems
    assert stems <= {'bass', 'piano', 'guitar', 'strings', 'drums'}, stems
    assert not score.warnings, score.warnings
    drum_routes = {route.split('/')[1] for route in score.routes if route.startswith('drums/')}
    assert drum_routes <= set(DRUM_ROUTES), drum_routes
    assert score.duration > 1.0


@check('DRUM_CLASSES 覆盖整个 GM 打击乐区间（35 是主流底鼓，不是 36）')
def _():
    assert DRUM_CLASSES[35] == 'kick' and DRUM_CLASSES[36] == 'kick'
    assert DRUM_CLASSES[46] == 'openhat', '开镲和闭镲不是一个声音'
    assert set(DRUM_CLASSES.values()) == set(DRUM_ROUTES)
    unmapped = [p for p in range(35, 60) if p not in DRUM_CLASSES]
    assert unmapped == [54, 56, 58], f'GM 打击乐区间有未映射的 pitch：{unmapped}'


@check('全语料回归：真实导出里没有被当成未知而丢掉的 GM 鼓音符')
def _():
    found = sorted(REPO.glob('artifacts/**/midi/merged/*/merged.mid'))
    if not found:
        raise _Skip('本机没有 artifacts/ 下的真实导出')
    import re
    offenders, scanned, drum_notes = {}, 0, 0
    for path in found:
        score = read_score(path)
        scanned += 1
        drum_notes += sum(count for route, count in score.routes.items() if route.startswith('drums/'))
        for reason, count in score.dropped.items():
            match = re.search(r'未知鼓 pitch (\d+)', reason)
            if match and 35 <= int(match.group(1)) <= 59:
                offenders[int(match.group(1))] = offenders.get(int(match.group(1)), 0) + count
    assert scanned >= 1
    assert drum_notes > 1000, f'只读到 {drum_notes} 个鼓音符，语料不像是真的'
    assert not offenders, f'这些 GM 鼓 pitch 被丢掉了：{offenders}'


# --- kit layer -------------------------------------------------------------------

@check('load_kit 一次报出全部问题')
def _():
    with tempfile.TemporaryDirectory() as box:
        (Path(box) / 'kit.json').write_text(
            '{"samples": {"a": {"file": "nope.wav", "rootHz": 220}, "b": {"file": "x.wav"}},'
            '"voices": {"guitar": {"sample": "ghost"}, "bass": {}}}', encoding='utf-8')
        try:
            load_kit(Path(box) / 'kit.json', sample_rate=RATE)
        except KitError as error:
            problems = '\n'.join(error.problems)
        else:
            raise AssertionError('应当抛出 KitError')
    assert 'nope.wav' in problems, problems
    assert 'rootHz' in problems or 'x.wav' in problems, problems
    assert '未定义的素材' in problems or 'ghost' in problems, problems
    assert '没有 sample 字段' in problems, problems


@check('kit 路由先精确后回退到 stem')
def _():
    with tempfile.TemporaryDirectory() as box:
        kit = synthetic_kit(box)
    assert kit.resolve('guitar/distorted electric guitar').transpose == -12
    assert kit.resolve('guitar/clean electric guitar').route == 'guitar'
    assert kit.resolve('guitar').gain == 0.8
    assert kit.resolve('strings') is None


@check('load_kit 把素材重采样到工程采样率')
def _():
    with tempfile.TemporaryDirectory() as box:
        directory = Path(box)
        (directory / 'samples').mkdir()
        soundfile.write(str(directory / 'samples' / 'a.wav'), tone(220.0, 1.0, 22050), 22050)
        (directory / 'kit.json').write_text(
            '{"samples": {"a": {"file": "samples/a.wav", "rootHz": 220}},'
            '"voices": {"bass": {"sample": "a"}}}', encoding='utf-8')
        kit = load_kit(directory / 'kit.json', sample_rate=RATE)
    assert abs(kit.samples['a'].audio.size - RATE) < 10, kit.samples['a'].audio.size


# --- render layer ----------------------------------------------------------------

@check('pitch_to_hz 与 transpose')
def _():
    assert abs(pitch_to_hz(69) - 440.0) < 1e-9
    assert abs(pitch_to_hz(57, 12) - 440.0) < 1e-9
    assert abs(pitch_to_hz(81) - 880.0) < 1e-9


@check('resample 按比例改变长度')
def _():
    source = tone(220.0, 1.0)
    assert abs(resample(source, 2.0).size - source.size / 2) <= 2
    assert abs(resample(source, 0.5).size - source.size * 2) <= 2
    assert resample(source, 1.0).size == source.size


@check('to_stereo 等功率声像')
def _():
    mono = np.ones(10, dtype=np.float32)
    centre = to_stereo(mono, 0.0)
    assert abs(centre[0, 0] - centre[0, 1]) < 1e-6
    left = to_stereo(mono, -1.0)
    assert left[0, 0] > 0.99 and left[0, 1] < 1e-6, left[0]


@check('peak_factor 只在超限时衰减，且取全部 buffer 的最大峰值')
def _():
    quiet = np.full((10, 2), 0.1, dtype=np.float32)
    assert peak_factor([quiet], -1.0) == 1.0
    loud = np.full((10, 2), 2.0, dtype=np.float32)
    factor = peak_factor([loud], -1.0)
    assert abs(float(np.abs(loud * factor).max()) - 10 ** (-1 / 20)) < 1e-6
    # a stem louder than the mix must drive the factor, or it clips on disk
    assert peak_factor([quiet, loud], -1.0) == factor
    assert peak_factor([], -1.0) == 1.0


@check('render 产出分轨、遵守 follow、并报告未覆盖路由')
def _():
    with tempfile.TemporaryDirectory() as box:
        kit = synthetic_kit(box)
        score = read_score(synthetic_score(Path(box) / 'merged.mid'))
    seen = []
    result = render(score, kit, progress=lambda fraction, message: seen.append(fraction))
    assert result.rendered == 3, result.rendered
    assert set(result.stems) == {'guitar/clean electric guitar', 'drums/kick'}, set(result.stems)
    assert result.mix.ndim == 2 and result.mix.shape[1] == 2, result.mix.shape
    assert seen and seen[-1] == 1.0, seen
    guitar = result.stems['guitar/clean electric guitar']
    assert guitar.ndim == 1, '分轨保持单声道，声像在写出时施加'
    assert result.stereo_stem('guitar/clean electric guitar').shape == (guitar.size, 2)
    assert np.abs(guitar[:int(0.4 * RATE)]).max() > 0.01, '第一个音应当发声'
    # follow=note truncates the 0.4 s sample to the 0.5 s note, so sound stops by 0.5 s
    assert np.abs(guitar[int(0.45 * RATE):int(0.9 * RATE)]).max() < 1e-3, '音符之间应当静音'


@check('render 对 kit 没覆盖的路由只跳过不报错')
def _():
    with tempfile.TemporaryDirectory() as box:
        kit = synthetic_kit(box)
        midi = pretty_midi.PrettyMIDI()
        track = pretty_midi.Instrument(program=33, name='bass')
        track.notes.append(pretty_midi.Note(velocity=100, pitch=40, start=0.0, end=0.5))
        path = Path(box) / 'merged.mid'
        midi.instruments.append(track)
        midi.write(str(path))
        score = read_score(path)
    result = render(score, kit)
    assert result.rendered == 0
    assert result.unresolved == {'bass': 1}, result.unresolved


@check('render 把音高映射成重采样比例')
def _():
    with tempfile.TemporaryDirectory() as box:
        kit = synthetic_kit(box, root_hz=220.0)
        midi = pretty_midi.PrettyMIDI()
        track = pretty_midi.Instrument(program=26, name='guitar')
        # A3 == 220 Hz == the sample root, so follow=note plays it back unresampled.
        track.notes.append(pretty_midi.Note(velocity=127, pitch=57, start=0.0, end=0.4))
        midi.instruments.append(track)
        path = Path(box) / 'merged.mid'
        midi.write(str(path))
        score = read_score(path)
    result = render(score, kit)
    voiced = np.flatnonzero(np.abs(result.stems['guitar']) > 1e-4)
    assert voiced.size and abs(voiced.max() - 0.4 * RATE) < 0.02 * RATE, voiced.max() / RATE



# --- kit library -----------------------------------------------------------------
# These run against the built kits under `kits/`, which are gitignored output of
# `tools/make_kits.py`. They skip when the library has not been built yet.

sys.path.insert(0, str(ROOT / 'tools'))


def built_kits():
    import kitdefs
    found = [name for name in kitdefs.KITS if (ROOT / 'kits' / name / 'kit.json').is_file()]
    if not found:
        raise _Skip('音色库尚未构建：先跑 tools/make_kits.py all')
    return kitdefs, found


def measured_root(audio, rate, fmin=35.0, fmax=5000.0):
    """Period by autocorrelation, skipping the lag-0 lobe and preferring the first real peak.

    rootHz is the one field in a kit that nothing else can catch: the renderer divides the
    target pitch by it, so a sample labelled 220 Hz that is really 440 plays every note an
    octave out and every other measurement still looks correct.
    """
    start = int(0.02 * rate)
    window = audio[start:start + int(0.5 * rate)].astype(np.float64)
    if window.size < 2048:
        window = audio.astype(np.float64)
    if window.size < 512:
        return None
    window = window - window.mean()
    size = 1 << int(np.ceil(np.log2(window.size * 2)))
    spectrum = np.fft.rfft(window * np.hanning(window.size), n=size)
    correlation = np.fft.irfft(spectrum * np.conj(spectrum))[:window.size]
    if correlation[0] <= 0:
        return None
    correlation /= correlation[0]
    low, high = max(1, int(rate / fmax)), min(int(rate / fmin), window.size - 1)
    negative = np.flatnonzero(correlation[:high] <= 0)
    begin = max(low, int(negative[0]) if negative.size else low)
    if high <= begin + 2:
        return None
    band = correlation[begin:high]
    best = float(band.max())
    if best <= 0.1:
        return None
    interior = band[1:-1]
    peaks = np.flatnonzero((interior >= band[:-2]) & (interior > band[2:]) & (interior >= 0.85 * best))
    estimate = rate / (begin + (int(peaks[0]) + 1 if peaks.size else int(np.argmax(band))))

    # Autocorrelation reports the waveform's period, which is not always the pitch. An
    # organ with a 5 1/3' drawbar has partials at 2f and 3f of a tone that is not there,
    # so the period is f while every listener hears 2f. Climb to the lowest octave that
    # actually carries energy — that is the one the renderer has to divide by.
    magnitude = np.abs(np.fft.rfft(window * np.hanning(window.size), n=size))
    bins = np.fft.rfftfreq(size, 1 / rate)
    near = lambda hz: float(magnitude[(bins > hz * 0.96) & (bins < hz * 1.04)].max(initial=0.0))
    for _ in range(3):
        if estimate * 2 > fmax or near(estimate) >= 0.1 * near(estimate * 2):
            break
        estimate *= 2
    return estimate


@check('每套 kit 都能加载，且覆盖全部必需路由')
def _():
    kitdefs, names = built_kits()
    for name in names:
        kit = load_kit(ROOT / 'kits' / name / 'kit.json', sample_rate=RATE)
        missing = [route for route in kitdefs.REQUIRED if kit.resolve(route) is None]
        assert not missing, f'{name} 缺路由 {missing}'


@check('每个素材都是真实音频，没有静音、非有限值或明显直流')
def _():
    _, names = built_kits()
    for name in names:
        kit = load_kit(ROOT / 'kits' / name / 'kit.json', sample_rate=RATE)
        for sample in kit.samples.values():
            audio = sample.audio
            assert audio.size > 64, f'{name}/{sample.name} 太短'
            assert np.isfinite(audio).all(), f'{name}/{sample.name} 含非有限采样'
            assert float(np.abs(audio).max()) > 0.2, f'{name}/{sample.name} 峰值过低'
            offset = abs(float(np.mean(audio)))
            assert offset < 0.05, f'{name}/{sample.name} 直流偏移 {offset:.3f}'


@check('pitched 素材的 rootHz 与实测基频一致')
def _():
    _, names = built_kits()
    for name in names:
        kit = load_kit(ROOT / 'kits' / name / 'kit.json', sample_rate=RATE)
        pitched = {voice.sample for voice in kit.voices.values() if voice.pitched}
        for sample_name in sorted(pitched):
            sample = kit.samples[sample_name]
            measured = measured_root(sample.audio, RATE)
            if measured is None:
                continue
            ratio = measured / sample.root_hz
            assert 0.94 < ratio < 1.06, \
                f'{name}/{sample_name}: rootHz {sample.root_hz:.0f} 与实测 {measured:.0f} 差 {ratio:.2f}x'


@check('跟随乐谱的声部，素材长度够盖住真实音符的 95 分位')
def _():
    # Measured over the 31 merged exports under artifacts/: the 95th percentile note is
    # 0.83 s on guitar, 1.42 s on bass, 1.59 s on strings and 2.73 s on piano. A sample
    # shorter than that truncates most held notes, which is what makes a kit sound clipped.
    need = {'bass': 1.42, 'guitar': 0.83, 'piano': 2.73, 'strings': 1.59, 'vocals': 1.5}
    _, names = built_kits()
    short = []
    for name in names:
        kit = load_kit(ROOT / 'kits' / name / 'kit.json', sample_rate=RATE)
        for route, want in need.items():
            voice = kit.resolve(route)
            if voice is None or voice.follow == 'sample':
                continue              # a voice that rings for its own length cannot truncate
            have = kit.samples[voice.sample].audio.size / RATE
            if have + 1e-6 < want:
                short.append(f'{name}/{route}: 素材 {have:.2f}s < 95 分位音符 {want:.2f}s')
    # acid predates the measurement and is kept byte-identical on purpose; everything else
    # in the library is sized from it.
    unexpected = [text for text in short if not text.startswith('acid/')]
    assert not unexpected, '; '.join(unexpected)


@check('每套 kit 都能把一段含全部路由的乐谱渲染出声')
def _():
    _, names = built_kits()
    with tempfile.TemporaryDirectory() as box:
        midi = pretty_midi.PrettyMIDI()
        for index, stem in enumerate(['bass', 'piano', 'guitar', 'strings', 'vocals']):
            track = pretty_midi.Instrument(program=0, name=stem)
            track.notes = [pretty_midi.Note(velocity=96, pitch=48 + index * 3 + step * 4,
                                            start=index * 0.5 + step * 1.2, end=index * 0.5 + step * 1.2 + 0.9)
                           for step in range(3)]
            midi.instruments.append(track)
        kit_drums = pretty_midi.Instrument(program=0, is_drum=True, name='drums')
        for index, pitch in enumerate([36, 38, 42, 46, 47, 49, 51]):
            kit_drums.notes.append(pretty_midi.Note(velocity=100, pitch=pitch, start=index * 0.3, end=index * 0.3 + 0.1))
        midi.instruments.append(kit_drums)
        path = Path(box) / 'merged.mid'
        midi.write(str(path))
        score = read_score(path)
    assert len(score.routes) == 12, sorted(score.routes)
    for name in names:
        kit = load_kit(ROOT / 'kits' / name / 'kit.json', sample_rate=RATE)
        result = render(score, kit)
        assert not result.unresolved, f'{name} 有未解析路由 {result.unresolved}'
        assert result.rendered == len(score.notes), f'{name} 只渲染了 {result.rendered}/{len(score.notes)}'
        quiet = [route for route, buffer in result.stems.items()
                 if float(np.sqrt(np.mean(buffer.astype(np.float64) ** 2))) < 1e-5]
        assert not quiet, f'{name} 这些路由渲染为静音：{quiet}'


@check('kit 之间确实不一样，不是同一份音频换了名字')
def _():
    _, names = built_kits()
    if len(names) < 2:
        raise _Skip('只构建了一套 kit')
    fingerprints = {}
    for name in names:
        kit = load_kit(ROOT / 'kits' / name / 'kit.json', sample_rate=RATE)
        voice = kit.resolve('piano')
        audio = kit.samples[voice.sample].audio[:RATE]
        spectrum = np.abs(np.fft.rfft(audio * np.hanning(audio.size), n=1 << 15))
        fingerprints[name] = spectrum / (np.linalg.norm(spectrum) + 1e-12)
    for left in names:
        for right in names:
            if left < right:
                similarity = float(fingerprints[left] @ fingerprints[right])
                assert similarity < 0.98, f'{left} 与 {right} 的钢琴声部几乎相同（相似度 {similarity:.3f}）'


@check('kit 响度表（kit_levels）的平均和离散按定义算')
def _():
    import kit_levels
    levels = {'a': {'fmkeys': {'bass': 0.1, 'drums': 0.2}, 'loud': {'bass': 0.2, 'drums': 0.0}},
              'b': {'fmkeys': {'bass': 0.1, 'drums': 0.2}, 'loud': {'bass': 0.4, 'drums': 0.4}}}
    got = kit_levels.table(levels)
    assert got['fmkeys']['db'] == dict.fromkeys(kit_levels.TRACKS, 0.0), got['fmkeys']
    want_bass = (20 * np.log10(2) + 20 * np.log10(4)) / 2
    assert abs(got['loud']['db']['bass'] - want_bass) < 0.01 and abs(got['loud']['spread']['bass'] - 20 * np.log10(2)) < 0.01, got['loud']
    assert abs(got['loud']['db']['drums'] - 20 * np.log10(2)) < 0.01 and got['loud']['spread']['drums'] == 0.0   # a silent song is left out
    assert got['loud']['db']['piano'] == 0.0                                                                    # nothing anywhere: 0


@check('kits/levels.json：每套构建了的 kit 都有一行，fmkeys 全是 0，数都是有限的')
def _():
    import json
    _, names = built_kits()
    path = ROOT / 'kits' / 'levels.json'
    if not path.is_file():
        raise _Skip('还没量：跑 tools/kit_levels.py')
    data = json.loads(path.read_text(encoding='utf-8'))
    assert sorted(data['kits']) == sorted(names), set(data['kits']) ^ set(names)
    assert all(value == 0.0 for value in data['kits']['fmkeys']['db'].values())
    for name, row in data['kits'].items():
        assert sorted(row['db']) == sorted(data['tracks']) and sorted(row['spread']) == sorted(data['tracks']), name
        assert all(np.isfinite(v) for v in [*row['db'].values(), *row['spread'].values()]), name
    assert len(data['measuredOn']) == 3


def run():
    for name in PASSED:
        print(f'  ok    {name}')
    for name, reason in SKIPPED:
        print(f'  skip  {name}  — {reason}')
    for name, reason in FAILED:
        print(f'  FAIL  {name}\n          {reason}')
    print(f'\n{len(PASSED)} passed, {len(FAILED)} failed, {len(SKIPPED)} skipped')
    return 1 if FAILED else 0


if __name__ == '__main__':
    sys.exit(run())
