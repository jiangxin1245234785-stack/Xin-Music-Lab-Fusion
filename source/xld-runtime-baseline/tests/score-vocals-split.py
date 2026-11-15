"""vocals_runner.py keeps the lead split: written once under refinement/, read back while the vocal stem is the
same, made again when the stem changes, never made for a stem with no singing; a missing add-on is one sentence.

    <roformer python> -X utf8 tests/score-vocals-split.py

The two models are replaced by stand-ins (the split halves the stem, the pitch model hums A4), so this checks the
files and the decisions, not the models. Needs numpy and soundfile (the RoFormer interpreter has both).
"""
import json
import os
import sys
import tempfile
import time
from pathlib import Path

import numpy as np
import soundfile as sf

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE.parent / 'analysis-score'))
sys.path.insert(0, str(HERE.parent / 'analysis-midi'))
import stem_audio as stem_io  # noqa: E402  (lead / backing are marked 24-bit FLAC since 2026-11-15)
import vocals_runner as runner  # noqa: E402

RATE, SECONDS = 44100, 12
calls = {'split': 0, 'pitch': 0}


def fake_split(audio, rate, model_dir):
    calls['split'] += 1
    return (audio * 0.5).astype(np.float32), 'cpu'


def fake_pitch(mono, rate, upstream, weights):
    calls['pitch'] += 1
    frames = int(len(mono) / rate * runner.FPS)
    return np.full(frames, 440.0), float(runner.FPS)


def make_track(root, loud=True):
    track = root / 'track'
    run_id = '11111111-2222-3333-4444-555555555555'
    (track / 'stems' / run_id).mkdir(parents=True)
    t = np.arange(RATE * SECONDS) / RATE
    tone = (0.3 * np.sin(2 * np.pi * 440 * t) if loud else 1e-4 * np.sin(2 * np.pi * 440 * t)).astype(np.float32)
    sf.write(str(track / 'stems' / run_id / 'vocals.wav'), np.stack([tone, tone * 0.9], axis=1), RATE, subtype='FLOAT')
    (track / 'stems.json').write_text(json.dumps({'trackId': 't' * 40, 'runId': run_id, 'stems': [
        {'name': 'vocals', 'file': f'stems/{run_id}/vocals.wav', 'sampleRate': RATE, 'channels': 2, 'frames': RATE * SECONDS}]}), encoding='utf-8')
    return track, track / 'stems' / run_id / 'vocals.wav'


def addons_root(root, with_karaoke=True, with_rmvpe=True):
    base = root / 'addons'
    if with_karaoke:
        (base / 'karaoke-v1' / 'becruily').mkdir(parents=True)
        (base / 'karaoke-v1' / 'becruily' / 'model.ckpt').write_bytes(b'ckpt')
        (base / 'karaoke-v1' / 'becruily' / 'config.yaml').write_text('stand-in: true\n', encoding='utf-8')
    if with_rmvpe:
        (base / 'seedvc-v1' / 'upstream' / 'checkpoints').mkdir(parents=True)
        (base / 'seedvc-v1' / 'upstream' / 'modules').mkdir(parents=True)
        (base / 'seedvc-v1' / 'upstream' / 'checkpoints' / 'rmvpe.pt').write_bytes(b'w')
        (base / 'seedvc-v1' / 'upstream' / 'modules' / 'rmvpe.py').write_text('', encoding='utf-8')
    os.environ['XLD_KARAOKE_ROOT'] = str(base / 'karaoke-v1')
    os.environ['XLD_SEEDVC_ROOT'] = str(base / 'seedvc-v1')


def run(track, name='score-vocals.next.json'):
    out = track / name
    runner.main(['--engine', 'score-vocals', '--input', 'unused', '--output', str(out)])
    result = json.loads(out.read_text(encoding='utf-8'))
    out.replace(track / 'score-vocals.json')
    return result


def files(track):
    return sorted(str(p.relative_to(track)).replace('\\', '/') for p in track.rglob('*') if p.is_file())


def main():
    runner.split_lead, runner.track_pitch = fake_split, fake_pitch
    with tempfile.TemporaryDirectory() as tmp:
        root = Path(tmp)
        addons_root(root)
        track, stem = make_track(root)

        first = run(track)
        split = first['provenance']['split']
        assert calls == {'split': 1, 'pitch': 1}, calls
        assert first['lane'] and first['lane']['notes'], 'a sung line'
        assert split['reused'] is False
        lead, backing = track / split['lead'], track / split['backing']
        for path in (lead, backing):
            info = sf.info(str(path))
            assert (info.format, info.subtype, info.samplerate, info.channels, info.frames) == ('FLAC', 'PCM_24', RATE, 2, RATE * SECONDS), info
            assert stem_io.gain_of(path) == stem_io.FLAC_GAIN
        stem_audio, _ = sf.read(str(stem), dtype='float32', always_2d=True)
        lead_audio, _ = stem_io.read(str(lead), dtype='float32', always_2d=True)
        back_audio, _ = stem_io.read(str(backing), dtype='float32', always_2d=True)
        assert np.max(np.abs(lead_audio + back_audio - stem_audio)) < 1e-6, 'lead + backing = stem'
        manifest = json.loads((track / split['manifest']).read_text(encoding='utf-8'))
        assert manifest['kind'] == 'refinement' and manifest['engine'] == 'karaoke-lead' and manifest['target'] == 'lead'
        assert manifest['originalSource']['runId'] == first['source']['stemRunId'] and manifest['originalSource']['size'] == first['source']['size']
        assert first['source']['path'] == str(stem.resolve()) and abs(first['source']['mtimeMs'] - stem.stat().st_mtime_ns / 1e6) < 1e-3
        assert not any(name.startswith('refinement/.') for name in files(track)), 'no staging left: ' + repr(files(track))
        before = files(track)

        second = run(track)
        assert calls == {'split': 1, 'pitch': 2}, 'same stem: the split is read back, not made again ' + repr(calls)
        assert second['provenance']['split']['reused'] is True and second['provenance']['split']['lead'] == split['lead']
        assert files(track) == before, 'reading it back writes nothing new'

        later = time.time() + 10
        os.utime(stem, (later, later))
        third = run(track)
        assert calls['split'] == 2, 'a changed stem is split again'
        assert third['provenance']['split']['runId'] != split['runId']
        assert lead.is_file(), 'the earlier split is not removed here'

        # A missing add-on: one sentence naming it. With a split on disk, only the pitch model is needed.
        addons_root(root / 'no-karaoke', with_karaoke=False)
        run(track)
        assert calls['split'] == 2, 'a stored split does not need the split model'
        os.utime(stem, (later + 10, later + 10))
        try:
            run(track)
            raise AssertionError('should have stopped')
        except SystemExit as stop:
            assert str(stop) == '人声曲线需要的扩展没有装：karaoke-v1 (主唱分离模型)', str(stop)
        addons_root(root / 'no-rmvpe', with_rmvpe=False)
        try:
            run(track)
            raise AssertionError('should have stopped')
        except SystemExit as stop:
            assert 'seedvc-v1 (RMVPE)' in str(stop), str(stop)

        # A staging folder a killed run left behind is cleared the next time a split is saved; a fresh one (maybe
        # still being written), one without our README mark and one holding a stranger file are left alone.
        folder = track / 'refinement'
        old_mark = folder / ('.next.' + '0' * 8 + '-0000-0000-0000-' + '0' * 12)
        fresh = folder / ('.next.' + '1' * 8 + '-1111-1111-1111-' + '1' * 12)
        foreign = folder / ('.next.' + '2' * 8 + '-2222-2222-2222-' + '2' * 12)
        mixed = folder / ('.next.' + '3' * 8 + '-3333-3333-3333-' + '3' * 12)
        for path in (old_mark, fresh, foreign, mixed):
            path.mkdir()
            (path / 'target.wav').write_bytes(b'half')
        for path in (old_mark, fresh, mixed):
            (path / 'README.txt').write_text(runner.README_MARK + '\n', encoding='utf-8')
        (foreign / 'README.txt').write_text('something else\n', encoding='utf-8')
        (mixed / 'notes.txt').write_text('not ours\n', encoding='utf-8')
        hour_ago = time.time() - 3600
        for path in (old_mark, foreign, mixed):
            for child in path.iterdir():
                os.utime(child, (hour_ago, hour_ago))
        addons_root(root / 'clean-addons')
        os.utime(stem, (later + 20, later + 20))
        run(track)
        assert not old_mark.exists(), 'the stale staging folder of this engine is cleared'
        assert fresh.exists() and foreign.exists() and mixed.exists(), 'fresh, unmarked or mixed folders are left alone'
        assert not any(p.name.startswith('.next.') and p not in (fresh, foreign, mixed) for p in folder.iterdir()), 'and the run leaves none of its own'

        # A stem that is not quiet but where the pitch model follows under 5 s of singing: lane null and a reason, but
        # the split was made before that was known, so it is stored and named (INTERFACE.md says so).
        hummed_root = root / 'hummed'
        hummed_root.mkdir()
        hummed, _ = make_track(hummed_root)
        runner.track_pitch = lambda mono, rate, upstream, weights: (np.zeros(int(len(mono) / rate * runner.FPS)), float(runner.FPS))
        brief = run(hummed)
        runner.track_pitch = fake_pitch
        assert brief['lane'] is None and brief['why'] and brief['provenance']['split'], brief
        assert (hummed / brief['provenance']['split']['lead']).is_file()

        # No singing: lane null, a reason, no split, no model run.
        addons_root(root / 'quiet-addons')
        quiet_root = root / 'quiet'
        quiet_root.mkdir()
        quiet, _ = make_track(quiet_root, loud=False)
        count = dict(calls)
        silent = run(quiet)
        assert silent['lane'] is None and silent['why'] and 'provenance' not in silent, silent
        assert calls == count, 'nothing is run on an empty stem'
        assert not (quiet / 'refinement').exists(), 'and nothing is stored'
    print('score vocals split: PASS (marked FLAC lead / backing at the stem format, sum to the stem, read back on the same stem, '
          'made again on a changed stem, missing add-on named, no split for an empty stem)')


if __name__ == '__main__':
    main()
