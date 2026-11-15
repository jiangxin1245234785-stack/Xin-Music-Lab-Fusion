"""Produce the score-view layers a pilot is missing, into `work/scoreview-20261110/data/<pilot>/`.

    <envs/basic>/python.exe -X utf8 source/scoreview/tools/make_layers.py <pilot> [layer ...] [--force]

Layers (see pilots.json for which a pilot needs):

    sections   SongFormer, through XLD's own runner (envs/ai)
    chords     the pilot's chord engines, through XLD's own harmony runner (envs/ai)
    beats      XLD's tempo.analyze (layer_beats.py, MuScriptor's interpreter)
    vocals     lead notes + pitch contour (layer_vocals.py)
    energy     loudness envelope of the mix, 0.1 s hop
    audio      the compressed file the listening page plays, checked against the stems' clock

Nothing here writes into the analysis root or into XLD's runtime folders: the runners are
started with this pilot's data folder as their working directory (XLD starts them inside
the analysis root, where they leave feature caches), and the numba / matplotlib caches are
pointed here as well. A layer that already exists is left alone unless `--force` is given.

Every time is in seconds from the audio zero of the stems. The original file is decoded
with soundfile, exactly as XLD's separation runner decodes it, so that zero is the same
one; `audio` then proves it by correlating against the stems.
"""
import argparse
import hashlib
import json
import os
import shutil
import subprocess
import sys
from pathlib import Path

HERE = Path(__file__).resolve().parent
REPO = HERE.parents[2]
RUNTIME = REPO / 'runtime' / '0.5.0'
XLD = REPO / 'source' / 'xld-runtime-baseline'
PYTHON = {
    'basic': RUNTIME / 'envs' / 'basic' / 'python.exe',
    'ai': RUNTIME / 'envs' / 'ai' / 'python.exe',
    'msaf': RUNTIME / 'envs' / 'msaf' / 'python.exe',
    'muscriptor': REPO / 'runtime' / 'addons' / 'yourmt3-v1' / 'python.exe',
}
#: One binary file of an Artifact may be 15 MB; leave headroom rather than land on the limit.
AUDIO_BYTES_CAP = 14_500_000


def load_config():
    config = json.loads((HERE / 'pilots.json').read_text(encoding='utf-8'))
    resolve = lambda value: Path(value) if Path(value).is_absolute() else REPO / value
    config['analysisRoot'] = resolve(config['analysisRoot'])
    config['dataRoot'] = resolve(config['dataRoot'])
    config['pageRoot'] = resolve(config['pageRoot'])
    return config


def read_json(path):
    return json.loads(Path(path).read_text(encoding='utf-8'))


def write_json(path, value):
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(value, ensure_ascii=False), encoding='utf-8')


def runner_environment(scratch):
    """What XLD's bundled runtime sets for its runners, with the writable caches moved here."""
    env = dict(os.environ)
    env.update({
        'PYTHONIOENCODING': 'utf-8',
        'XLD_RUNTIME_ROOT': str(RUNTIME / 'scripts'),
        'XLD_STABLE_RUNTIME_ROOT': str(RUNTIME / 'scripts'),
        'TORCH_HOME': str(RUNTIME / 'models' / 'torch'),
        'HF_HOME': str(RUNTIME / 'models' / 'huggingface'),
        'HF_HUB_OFFLINE': '1',
        'XLD_CHORDS_ROOT': str(REPO / 'runtime' / 'addons' / 'chords-v1'),
        'XLD_CHORDS_PYTHON': str(REPO / 'runtime' / 'addons' / 'chords-v1' / 'python.exe'),
        'XLD_MUSCRIPTOR_ROOT': str(REPO / 'runtime' / 'addons' / 'muscriptor-v1'),
        'NUMBA_CACHE_DIR': str(scratch / 'numba'),
        'MPLCONFIGDIR': str(scratch / 'matplotlib'),
    })
    return env


def run(command, cwd, env):
    """Run one runner; pass its progress lines through, fail loudly with its last words."""
    print('  $ ' + ' '.join(Path(str(part)).name if os.sep in str(part) else str(part) for part in command), flush=True)
    process = subprocess.Popen([str(part) for part in command], cwd=str(cwd), env=env, stdout=subprocess.PIPE,
                               stderr=subprocess.STDOUT, text=True, encoding='utf-8', errors='replace')
    tail = []
    for line in process.stdout:
        line = line.rstrip()
        if not line:
            continue
        tail = (tail + [line])[-12:]
        try:
            payload = json.loads(line)
            if isinstance(payload, dict) and payload.get('message'):
                print(f'    {payload.get("progress", 0):4.0%} {payload["message"]}', flush=True)
                continue
        except ValueError:
            pass
        print(f'    {line[:200]}', flush=True)
    if process.wait():
        raise SystemExit(f'失败（退出码 {process.returncode}）：\n' + '\n'.join(tail))


def source_of(track_dir):
    meta = read_json(track_dir / 'track.json')
    source = Path(meta['source'])
    if not source.is_file():
        raise SystemExit(f'找不到原曲：{source}')
    return source


def make_sections(pilot, track_dir, data, scratch, force):
    out = data / 'songformer.json'
    if out.is_file() and not force:
        return print(f'  段落：已有 {out.name}，跳过')
    run([PYTHON['ai'], RUNTIME / 'scripts' / 'analysis-ai' / 'songformer_runner.py', '--engine', 'songformer',
         '--input', source_of(track_dir), '--output', out, '--auto'], scratch, runner_environment(scratch))
    body = read_json(out)
    print(f'  段落：{len(body["segments"])} 段 · ' + ' '.join(s['label'] for s in body['segments']))


def make_plain_sections(pilot, track_dir, data, scratch, force):
    """MSAF's sections: boundaries plus cluster letters (A / B / C), no names.

    Neither pilot needs them to play; they are here so the listening page can show what a
    song without a naming engine looks like, which most of the library is.
    """
    out = data / 'msaf.json'
    if out.is_file() and not force:
        return print(f'  无名段落：已有 {out.name}，跳过')
    run([PYTHON['msaf'], RUNTIME / 'scripts' / 'analysis' / 'runner.py', '--engine', 'msaf',
         '--input', source_of(track_dir), '--output', out], scratch, runner_environment(scratch))
    body = read_json(out)
    print(f'  无名段落：{len(body["segments"])} 段 · ' + ' '.join(s['label'] for s in body['segments']))


def make_chords(pilot, track_dir, data, scratch, force):
    for engine in pilot.get('chordEngines', []):
        out = data / f'{engine}.json'
        if out.is_file() and not force:
            print(f'  和弦：已有 {out.name}，跳过')
            continue
        run([PYTHON['ai'], XLD / 'analysis-harmony' / 'harmony_runner.py', '--engine', engine,
             '--input', source_of(track_dir), '--output', out], scratch, runner_environment(scratch))
        body = read_json(out)
        print(f'  和弦 {engine}：{len(body["segments"])} 段，时长 {body["duration"]}')


def make_beats(pilot, track_dir, data, scratch, force):
    out = data / 'beats.json'
    if out.is_file() and not force:
        return print(f'  节拍：已有 {out.name}，跳过')
    run([PYTHON['muscriptor'], '-X', 'utf8', HERE / 'layer_beats.py', source_of(track_dir), out],
        scratch, runner_environment(scratch))


def make_vocals(pilot, track_dir, data, scratch, force):
    out = data / 'vocals.json'
    if out.is_file() and not force:
        return print(f'  人声：已有 {out.name}，跳过')
    spec = pilot.get('vocals')
    if not spec:
        raise SystemExit('这首试点没有配置人声来源（pilots.json 的 vocals）')
    resolve = lambda value: Path(value) if Path(value).is_absolute() else REPO / value
    run([PYTHON['basic'], '-X', 'utf8', HERE / 'layer_vocals.py', resolve(spec['f0']), resolve(spec['audio']), out],
        scratch, runner_environment(scratch))


def decode(path):
    import soundfile as sf
    audio, rate = sf.read(str(path), dtype='float32', always_2d=True)
    return audio, rate


def make_energy(pilot, track_dir, data, scratch, force):
    """RMS level of the mono mix every 0.1 s, in dB. The page smooths it; nothing is smoothed here."""
    import numpy as np
    out = data / 'energy.json'
    if out.is_file() and not force:
        return print(f'  响度：已有 {out.name}，跳过')
    audio, rate = decode(source_of(track_dir))
    mono = audio.mean(axis=1)
    hop = rate // 10
    count = len(mono) // hop
    frames = mono[:count * hop].reshape(count, hop)
    db = 20 * np.log10(np.maximum(np.sqrt(np.mean(frames ** 2, axis=1)), 1e-6))
    write_json(out, {'schemaVersion': 1, 'kind': 'energy', 'hop': hop / rate,
                     'db': [round(float(v), 1) for v in db]})
    print(f'  响度：{count} 帧，中位 {np.median(db):.1f} dB，最响 {db.max():.1f} dB')


def k_weighted(mono, rate):
    """ITU-R BS.1770 K-weighting: a high shelf (+4 dB above ~1.7 kHz) then a high-pass at 38 Hz.

    It is the filter loudness meters use, and it is here for one reason: a bass or a kick
    carries far more raw energy than it sounds like it does, and without the weighting the
    low stems would be given the screen. The coefficients are the standard's, re-derived
    for the stem's own sample rate.
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


def make_levels(pilot, track_dir, data, scratch, force):
    """How loud each stem is, second by second, as a listener would weigh it (K-weighted, in dB).

    One row per stem that has a lane in the model. The view turns these into each lane's
    share of the screen; nothing is smoothed or normalised here.
    """
    import numpy as np
    sys.path.insert(0, str(HERE))
    from census import active_record
    out = data / 'levels.json'
    if out.is_file() and not force:
        return print(f'  分轨响度：已有 {out.name}，跳过')
    stems = read_json(track_dir / 'stems.json')
    files = {stem['name']: track_dir / stem['file'] for stem in stems['stems']}
    groups = {}
    for record_path in sorted((track_dir / 'midi').glob('*.json')):
        stem = record_path.stem
        if stem.endswith('-source'):
            continue
        record, _ = active_record(track_dir, stem)
        source = Path((record or {}).get('source', {}).get('path') or '')
        groups[stem] = source if source.is_file() else files.get(stem)
    groups.setdefault('vocals', files.get('vocals'))
    rows = {}
    for group, path in groups.items():
        if not path or not Path(path).is_file():
            continue
        audio, rate = decode(path)
        weighted = k_weighted(audio.mean(axis=1), rate)
        count = len(weighted) // rate
        power = np.mean(weighted[:count * rate].reshape(count, rate) ** 2, axis=1)
        rows[group] = [round(float(v), 1) for v in -0.691 + 10 * np.log10(np.maximum(power, 1e-10))]
        print(f'    {group:<8} 中位 {np.median(rows[group]):6.1f} dB，最响 {max(rows[group]):6.1f} dB')
    write_json(out, {'schemaVersion': 1, 'kind': 'stem-levels', 'weighting': 'K (ITU-R BS.1770)', 'hop': 1.0, 'groups': rows})
    print(f'  分轨响度：{len(rows)} 条分轨，每秒一个值')


def make_cover(pilot, track_dir, data, scratch, force):
    """The picture beside the original file, shrunk into a data URI. A song without one is fine."""
    out = data / 'cover.json'
    if out.is_file() and not force:
        return print(f'  封面：已有 {out.name}，跳过')
    done = subprocess.run([str(PYTHON['ai']), '-X', 'utf8', str(HERE / 'layer_cover.py'), str(source_of(track_dir).parent), str(out)],
                          capture_output=True, text=True, encoding='utf-8', errors='replace')
    print('  ' + (done.stdout.strip() or done.stderr.strip()[-400:]))
    if done.returncode == 3:
        out.unlink(missing_ok=True)
    elif done.returncode:
        raise SystemExit(f'封面失败（退出码 {done.returncode}）')


def lag_between(reference, other, rate, starts, span=2.0, reach=0.08):
    """Samples by which `other` is late against `reference`, per window: [(start s, lag, peak)]."""
    import numpy as np
    width, limit = int(span * rate), int(reach * rate)
    found = []
    for start in starts:
        a = reference[int(start * rate):int(start * rate) + width]
        b = other[int(start * rate):int(start * rate) + width]
        if len(a) < width or len(b) < width or not a.any() or not b.any():
            continue
        spectrum = np.fft.rfft(b, 2 * width) * np.conj(np.fft.rfft(a, 2 * width))
        correlation = np.fft.irfft(spectrum)
        lags = np.concatenate([np.arange(0, limit + 1), np.arange(-limit, 0)])
        values = np.concatenate([correlation[:limit + 1], correlation[-limit:]])
        best = int(np.argmax(values))
        norm = float(np.linalg.norm(a) * np.linalg.norm(b)) or 1.0
        found.append((start, int(lags[best]), round(float(values[best]) / norm, 3)))
    return found


def make_audio(pilot, track_dir, data, scratch, force, page_root, name):
    """Encode the file the page plays, and measure its clock against the stems' clock.

    Two checks, both by cross-correlation in several windows across the song:
    the decoded original against the sum of the stems (is the original's zero the stems'
    zero?), and the encoded file decoded again against the original (did the encoder move
    it?). The second lag is what `audio.offset` in the model has to carry.
    """
    import numpy as np
    import soundfile as sf
    target = page_root / 'audio' / f'{name}.mp3'
    record_path = data / 'audio.json'
    if target.is_file() and record_path.is_file() and not force:
        return print(f'  音频：已有 {target.name}，跳过')
    source = source_of(track_dir)
    stems = read_json(track_dir / 'stems.json')
    audio, rate = decode(source)
    stem_frames, stem_rate = stems['stems'][0]['frames'], stems['stems'][0]['sampleRate']
    seconds = len(audio) / rate
    # XLD separates at its own rate (a 48 kHz original gives 44.1 kHz stems), so the two are
    # compared by length in seconds first and then sample by sample at the stems' rate.
    if abs(seconds - stem_frames / stem_rate) > 0.002:
        raise SystemExit(f'原曲解码出 {seconds:.4f} 秒，分轨是 {stem_frames / stem_rate:.4f} 秒：'
                         f'时间零点对不上，不能直接用')
    mono = audio.mean(axis=1)
    at_stem_rate = mono
    if rate != stem_rate:
        import soxr
        at_stem_rate = soxr.resample(mono, rate, stem_rate)
    mix = np.zeros(stem_frames, dtype=np.float64)
    for stem in stems['stems']:
        part, _ = decode(track_dir / stem['file'])
        mix += part.mean(axis=1)
    starts = [seconds * f for f in (0.1, 0.25, 0.4, 0.55, 0.7, 0.85)]
    against_stems = lag_between(mix, at_stem_rate, stem_rate, starts)

    target.parent.mkdir(parents=True, exist_ok=True)
    chosen = None
    for level in (0.30, 0.35, 0.40, 0.45, 0.50, 0.55, 0.60, 0.65, 0.70, 0.75):
        sf.write(str(target), audio, rate, format='MP3', subtype='MPEG_LAYER_III',
                 bitrate_mode='CONSTANT', compression_level=level)
        size = target.stat().st_size
        if size <= AUDIO_BYTES_CAP:
            chosen = (level, size)
            break
    if not chosen:
        raise SystemExit('压不到 15 MB 以内')
    again, again_rate = decode(target)
    against_source = lag_between(mono, again.mean(axis=1), again_rate, starts)
    lags = [lag for _, lag, _ in against_source]
    record = {
        'schemaVersion': 1, 'kind': 'page-audio', 'file': f'audio/{name}.mp3', 'bytes': chosen[1],
        'kbps': round(chosen[1] * 8 / seconds / 1000), 'compressionLevel': chosen[0],
        'sha256': hashlib.sha256(target.read_bytes()).hexdigest(),
        'sampleRate': rate, 'stemSampleRate': stem_rate, 'sourceFrames': int(len(audio)),
        'decodedFrames': int(len(again)), 'seconds': seconds,
        'originalAgainstStems': [{'at': round(s, 1), 'lagSamples': lag, 'peak': peak} for s, lag, peak in against_stems],
        'encodedAgainstOriginal': [{'at': round(s, 1), 'lagSamples': lag, 'peak': peak} for s, lag, peak in against_source],
        # Positive: the encoded file plays this much late (model time t is at t + offset in
        # the file), so the page's clock subtracts it from the playback position.
        'offsetSeconds': round(float(np.median(lags)) / rate, 5) if lags else 0.0,
    }
    write_json(record_path, record)
    print(f'  音频：{chosen[1] / 1e6:.2f} MB，{record["kbps"]} kbps，解码回来 {len(again)} 帧（原 {len(audio)}）')
    print(f'    原曲对分轨之和：{[(lag, peak) for _, lag, peak in against_stems]}（采样，相关峰值）')
    print(f'    压缩后对原曲：  {[(lag, peak) for _, lag, peak in against_source]} → offset {record["offsetSeconds"] * 1000:.2f} ms')


STEPS = {'sections': make_sections, 'plain-sections': make_plain_sections, 'chords': make_chords,
         'beats': make_beats, 'vocals': make_vocals, 'energy': make_energy, 'levels': make_levels, 'cover': make_cover}


def main(argv=None):
    parser = argparse.ArgumentParser(description='生成试点曲目缺的谱面层')
    parser.add_argument('pilot')
    parser.add_argument('layers', nargs='*')
    parser.add_argument('--force', action='store_true')
    args = parser.parse_args(argv)
    config = load_config()
    if args.pilot not in config['pilots']:
        raise SystemExit(f'未知试点：{args.pilot}（有 {", ".join(config["pilots"])}）')
    pilot = config['pilots'][args.pilot]
    track_dir = config['analysisRoot'] / pilot['trackDir']
    data = config['dataRoot'] / args.pilot
    scratch = data / 'scratch'
    scratch.mkdir(parents=True, exist_ok=True)
    for layer in args.layers or pilot['layers']:
        print(f'[{args.pilot}] {layer}', flush=True)
        if layer == 'audio':
            make_audio(pilot, track_dir, data, scratch, args.force, config['pageRoot'], args.pilot)
        elif layer in STEPS:
            STEPS[layer](pilot, track_dir, data, scratch, args.force)
        else:
            raise SystemExit(f'未知的层：{layer}')
    # Runner caches (numba, matplotlib, MSAF features) are only worth keeping while a run is going.
    shutil.rmtree(scratch, ignore_errors=True)
    return 0


if __name__ == '__main__':
    sys.exit(main())
