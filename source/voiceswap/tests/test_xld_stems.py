"""voiceswap reads XLD's stems in both formats (2026-11-15): float WAV and XLD's marked 24-bit FLAC.

    runtime/0.5.0/envs/highres/python.exe -X utf8 source/voiceswap/tests/test_xld_stems.py

Everything is built in a temporary folder; nothing touches XLD's analysis root and no model runs.
`fixtures/stem-audio/` is a copy of XLD's own fixture (git ignores audio, so the tests also make their own).
"""
import json
import sys
import tempfile
import time
import traceback
from pathlib import Path

import numpy as np
import soundfile as sf

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE.parent))

import remix  # noqa: E402
import xld_stems  # noqa: E402

FIXTURES = HERE / 'fixtures' / 'stem-audio'
RATE, LIMIT = 44100, 2.0 ** -23


def signal(seconds=0.5, seed=20261115):
    """Silence, a constant, a tone, noise and bursts clipped at 1.9: over full scale on purpose."""
    rng = np.random.default_rng(seed)
    n = int(seconds * RATE)
    data = np.zeros((n, 2), np.float32)
    t = np.arange(n) / RATE
    data[n // 10:n // 5] = 0.25
    data[n // 5:2 * n // 5] = (0.6 * np.sin(2 * np.pi * 440 * t[n // 5:2 * n // 5]))[:, None]
    data[2 * n // 5:3 * n // 5] = 0.3 * rng.standard_normal((3 * n // 5 - 2 * n // 5, 2))
    data[3 * n // 5:4 * n // 5] = 2.5 * rng.standard_normal((4 * n // 5 - 3 * n // 5, 2))
    return np.clip(data, -1.9, 1.9).astype(np.float32)


def write_marked_flac(path, data, rate=RATE):
    """As XLD's stem_audio.write_stem: 24-bit FLAC at half level, comment xld-gain=2."""
    with sf.SoundFile(str(path), 'w', rate, data.shape[1], 'PCM_24', format='FLAC') as handle:
        handle.comment = 'xld-gain=2'
        handle.write(data * np.float32(0.5))


def make_run(root, names=('vocals', 'drums', 'bass'), flac=True, manifest=True):
    """An XLD song folder with one separation run; returns the run folder."""
    folder = root / 'Artist - Album' / '01 曲__abc'
    run = folder / 'stems' / 'run-1'
    run.mkdir(parents=True)
    (folder / 'track.json').write_text(json.dumps({'title': '曲'}), encoding='utf-8')
    entries = []
    for index, name in enumerate(names):
        data = signal(1.0, seed=index)
        if flac:
            write_marked_flac(run / f'{name}.flac', data)
        else:
            sf.write(str(run / f'{name}.wav'), data, RATE, subtype='FLOAT')
        entries.append({'name': name, 'file': f'stems/run-1/{name}.{"flac" if flac else "wav"}'})
    if manifest:
        (folder / 'stems.json').write_text(json.dumps({'runId': 'run-1', 'stems': entries}), encoding='utf-8')
    return run


def test_flac_reads_as_the_wav_it_came_from():
    with tempfile.TemporaryDirectory() as scratch:
        scratch = Path(scratch)
        data = signal()
        sf.write(str(scratch / 'made.wav'), data, RATE, subtype='FLOAT')
        write_marked_flac(scratch / 'made.flac', data)
        pairs = [(scratch / 'made.wav', scratch / 'made.flac')]
        if (FIXTURES / 'marked.flac').is_file():
            pairs.append((FIXTURES / 'source.wav', FIXTURES / 'marked.flac'))
        for wav, flac in pairs:
            want, rate = sf.read(str(wav), dtype='float32', always_2d=True)
            got, got_rate = xld_stems.read(flac, dtype='float32', always_2d=True)
            assert float(np.abs(want).max()) > 1.0
            assert got_rate == rate and got.shape == want.shape and float(np.abs(got - want).max()) <= LIMIT, flac
            assert xld_stems.gain_of(flac) == 2 and xld_stems.gain_of(wav) == 1
        plain = scratch / 'plain.flac'
        sf.write(str(plain), data[:2205] * 0.4, RATE, subtype='PCM_16', format='FLAC')
        for path in [plain] + ([FIXTURES / 'plain.flac'] if (FIXTURES / 'plain.flac').is_file() else []):
            assert xld_stems.gain_of(path) == 1
            assert np.array_equal(xld_stems.read(path, dtype='float32')[0], sf.read(str(path), dtype='float32')[0])


def test_run_stems_finds_flac_and_picks_one_file_per_stem():
    with tempfile.TemporaryDirectory() as scratch:
        scratch = Path(scratch)
        run = make_run(scratch / 'a')
        found = xld_stems.run_stems(run)
        assert sorted(found) == ['bass', 'drums', 'vocals'] and all(p.suffix == '.flac' for p in found.values())
        # a migration that has not deleted the WAV yet: one file per stem, the one stems.json lists
        for name in found:
            sf.write(str(run / f'{name}.wav'), signal(1.0), RATE, subtype='FLOAT')
        both = xld_stems.run_stems(run)
        assert sorted(both) == ['bass', 'drums', 'vocals'] and all(p.suffix == '.flac' for p in both.values())
        # no manifest for this run: the WAV, as before
        (run.parent.parent / 'stems.json').unlink()
        assert all(p.suffix == '.wav' for p in xld_stems.run_stems(run).values())
        # WAV only, as every song before the migration
        old = make_run(scratch / 'b', flac=False)
        assert all(p.suffix == '.wav' for p in xld_stems.run_stems(old).values())


def remix_stops_with(argv):
    try:
        remix.main(argv)
    except SystemExit as stop:
        return str(stop)
    raise AssertionError('remix should have stopped')


def test_remix_reads_a_flac_song_and_still_refuses_one_without_stems():
    """remix.py on a migrated run gets past "where are the stems" and reads vocal and backing at the WAV's level
    (--mix-only with no conversion on disk: it stops at the first converted file, before any model would run)."""
    with tempfile.TemporaryDirectory() as scratch:
        scratch = Path(scratch)
        run = make_run(scratch / 'song')
        why = remix_stops_with([str(run), '--out', str(scratch / 'out')])
        assert '至少给一个' in why, why                                   # found vocals + backing, asks for a voice
        try:
            remix.main([str(run), '--voice', 'xiaoxiao', '--mix-only', '--out', str(scratch / 'out')])
        except (sf.LibsndfileError, RuntimeError, OSError):              # vocals-mono__xiaoxiao.wav is not there
            pass
        mono, rate = sf.read(str(scratch / 'out' / 'vocals-mono.wav'), dtype='float32')
        want = signal(1.0, seed=0).mean(axis=1)                         # vocals were seed 0
        assert rate == RATE and float(np.abs(mono - want).max()) <= LIMIT, 'the vocal is read at full level'
        empty = scratch / 'empty' / 'stems' / 'run-1'
        empty.mkdir(parents=True)
        assert '要有 vocals.wav' in remix_stops_with([str(empty), '--voice', 'xiaoxiao', '--out', str(scratch / 'o2')])
        lone = make_run(scratch / 'lone', names=('vocals',))
        assert '要有 vocals.wav' in remix_stops_with([str(lone), '--voice', 'xiaoxiao', '--out', str(scratch / 'o3')])


TESTS = [value for name, value in sorted(globals().items()) if name.startswith('test_') and callable(value)]


def main():
    failed = 0
    for test in TESTS:
        began = time.monotonic()
        try:
            test()
        except Exception:  # noqa: BLE001 — every test runs
            failed += 1
            print(f'  FAILED  {test.__name__}')
            traceback.print_exc()
        else:
            print(f'  ok      {test.__name__}  ({time.monotonic() - began:.1f}s)')
    print(f'\n{len(TESTS) - failed} passed, {failed} failed')
    return 1 if failed else 0


if __name__ == '__main__':
    sys.exit(main())
