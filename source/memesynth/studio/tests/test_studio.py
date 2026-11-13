"""Tests for the studio's own Python: the rebuild, the library, plans, and what the server answers.

    runtime/0.5.0/envs/basic/python.exe source/memesynth/studio/tests/test_studio.py

Everything is built in a temporary folder: a small MIDI, sine-wave stems, a fake analysis
folder. Nothing touches XLD's analysis root or the studio's cache. The kits are the real ones
(`source/memesynth/kits`), because the rebuild is only meaningful through a real kit.
"""
import json
import math
import sys
import tempfile
import threading
import time
import traceback
import urllib.error
import urllib.request
from http.server import ThreadingHTTPServer
from pathlib import Path

import numpy as np
import soundfile as sf

ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT))

from studio import batch, effects, library, server, vocals  # noqa: E402

RATE = 44100


def tone(hz, seconds, level=0.3, rate=RATE):
    t = np.arange(int(seconds * rate)) / rate
    return (level * np.sin(2 * np.pi * hz * t)).astype(np.float32)


def make_midi(path, seconds=6.0):
    import pretty_midi
    midi = pretty_midi.PrettyMIDI()
    for name, program, pitches in (('bass', 33, (40, 43)), ('piano', 0, (60, 64, 67))):
        part = pretty_midi.Instrument(program=program, name=name)
        for beat in range(int(seconds * 2)):
            for pitch in pitches:
                part.notes.append(pretty_midi.Note(velocity=70 + 10 * (beat % 3), pitch=pitch,
                                                   start=beat * 0.5, end=beat * 0.5 + 0.4))
        midi.instruments.append(part)
    drums = pretty_midi.Instrument(program=0, is_drum=True, name='drums')
    for beat in range(int(seconds * 2)):
        drums.notes.append(pretty_midi.Note(velocity=100, pitch=36 if beat % 2 == 0 else 38,
                                            start=beat * 0.5, end=beat * 0.5 + 0.1))
    midi.instruments.append(drums)
    midi.write(str(path))


def make_song(root, title='测试曲', stems=('drums', 'bass', 'piano', 'vocals'), merged=True, run='run-1'):
    """A song folder shaped like XLD's analysis output. Returns it."""
    folder = root / 'Some Artist - Some Album' / f'01 {title}__abc123'
    (folder / 'stems' / run).mkdir(parents=True)
    (folder / 'track.json').write_text(json.dumps({'trackId': title, 'title': title, 'artist': 'Some Artist',
                                                   'album': 'Some Album', 'number': 1}), encoding='utf-8')
    (folder / 'stems.json').write_text(json.dumps({'runId': run}), encoding='utf-8')
    for index, name in enumerate(stems):
        sf.write(str(folder / 'stems' / run / f'{name}.wav'), np.stack([tone(110 * (index + 1), 6.0)] * 2, axis=1), RATE)
    if merged:
        (folder / 'midi' / 'merged' / 'deadbeef').mkdir(parents=True)
        make_midi(folder / 'midi' / 'merged' / 'deadbeef' / 'merged.mid')
    return folder


def close(a, b, tolerance):
    return abs(a - b) <= tolerance


# --------------------------------------------------------------------------------- batch
def test_track_of():
    expected = {'drums/kick': 'drums', 'bass': 'bass', 'guitar': 'guitar', 'guitar/acoustic guitar': 'guitar',
                'piano': 'piano', 'vocals': 'vocals', 'strings/string ensemble': 'other', 'brass': 'other'}
    for route, track in expected.items():
        assert batch.track_of(route) == track, route


def test_resampler_is_accurate():
    for hz in (440.0, 12000.0):
        out = batch.to_48k(tone(hz, 1.0, level=0.5), RATE)
        want = 0.5 * np.sin(2 * np.pi * hz * np.arange(len(out)) / 48000.0)
        core = slice(1000, len(out) - 1000)
        snr = 10 * np.log10(np.mean(want[core] ** 2) / np.mean((out[core, 0] - want[core]) ** 2))
        assert snr > 70, f'{hz} Hz: {snr:.1f} dB'
    assert batch.to_48k(tone(440, 1.0), RATE).shape == (48000, 2)
    same = batch.to_48k(np.zeros((480, 2), dtype=np.float32), 48000)
    assert same.shape == (480, 2)


def test_levels_ignore_vocals_and_silence():
    with tempfile.TemporaryDirectory() as scratch:
        scratch = Path(scratch)
        paths = {}
        for name, level in (('drums', 0.1), ('bass', 0.2), ('piano', 0.0), ('vocals', 0.3)):
            paths[name] = str(scratch / f'{name}.wav')
            sf.write(paths[name], tone(220, 1.0, level=level), RATE)
        by_track = {name: np.stack([tone(220, 1.0, level=0.4, rate=48000)] * 2, axis=1) for name in ('drums', 'bass', 'piano', 'vocals')}
        factors, spare, notes = batch.levels_from(by_track, paths)
        assert set(factors) == {'drums', 'bass'}, factors          # no vocals, no silent stem
        assert close(factors['drums'], 4.0, 0.05) and close(factors['bass'], 2.0, 0.05), factors
        assert close(spare, 3.0, 0.05), spare
        assert notes == {'empty': ['piano'], 'capped': []}, notes
        assert batch.levels_from(by_track, {}) == ({}, 1.0, {'empty': [], 'capped': []})


def test_a_nearly_empty_stem_is_not_turned_up_into_noise():
    """Bleed at -50 dBFS under transcribed notes: scaled like the others at most four times over."""
    with tempfile.TemporaryDirectory() as scratch:
        scratch = Path(scratch)
        paths = {}
        for name, level in (('drums', 0.2), ('bass', 0.2), ('guitar', 0.2), ('piano', 0.004)):
            paths[name] = str(scratch / f'{name}.wav')
            sf.write(paths[name], tone(220, 1.0, level=level), RATE)
        by_track = {name: np.stack([tone(220, 1.0, level=0.4, rate=48000)] * 2, axis=1) for name in paths}
        factors, spare, notes = batch.levels_from(by_track, paths)
        assert close(spare, 2.0, 0.05) and close(factors['piano'], 8.0, 0.2), (spare, factors)   # not 100
        assert notes == {'empty': [], 'capped': ['piano']}, notes


def test_rebuild_keeps_swaps_and_mutes():
    with tempfile.TemporaryDirectory() as scratch:
        scratch = Path(scratch)
        folder = make_song(scratch)
        song = library.read_song(folder, 'test')
        plan = {'preset': 'pluck', 'tracks': {'drums': {'mode': 'orig'}, 'bass': {'mode': 'swap', 'kit': 'acid', 'db': -3},
                                              'piano': {'mode': 'mute'}}}
        score, done = batch.rebuild(song['midi'], plan, scratch / 'out', server.KITS_DIR, stems=song['stems'], write_tracks=True)
        by = {row['track']: row for row in done['tracks']}
        assert by['drums']['by'] == 'orig' and by['bass']['by'] == 'acid' and by['piano']['by'] == 'mute'
        assert not by['piano']['sounding'] and by['drums']['sounding']
        wavs = [Path(p) for p in done['files'] if p.endswith('.wav')]
        mix, rate = sf.read(str(wavs[0]), dtype='float32')
        assert rate == 48000 and np.abs(mix).max() <= 10 ** (-1 / 20) + 1e-4
        total = np.zeros_like(mix)
        for path in wavs[1:]:
            audio, _ = sf.read(str(path), dtype='float32')
            total[:len(audio)] += audio
        assert np.mean((total - mix) ** 2) < 1e-9 * max(np.mean(mix ** 2), 1e-12) + 1e-12, 'the track files do not sum to the mix'
        assert sorted(p.stem.rsplit('.', 1)[-1] for p in wavs[1:]) == ['bass', 'drums']
        # The kept drums sit at the level the preset plays the drums, over the whole song.
        factors, _, _ = batch.stem_levels(song['midi'], server.KITS_DIR / 'pluck' / 'kit.json', song['stems'])
        drums, _ = sf.read(str([p for p in wavs if p.stem.endswith('.drums')][0]), dtype='float32')
        own = batch.file_rms(song['stems']['drums'])
        assert close(20 * np.log10(batch.rms(drums) / done['factor'] / (own * factors['drums'])), 0.0, 0.3)
        saved = json.loads([Path(p) for p in done['files'] if p.endswith('.json')][0].read_text(encoding='utf-8'))
        assert saved['preset'] == 'pluck' and saved['tracks']['bass']['kit'] == 'acid'


def test_rebuild_survives_a_broken_plan():
    with tempfile.TemporaryDirectory() as scratch:
        scratch = Path(scratch)
        song = library.read_song(make_song(scratch), 'test')
        plan = {'preset': 'no-such-kit', 'tracks': {'bass': {'mode': 'sideways', 'kit': 'nope', 'db': 'loud'},
                                                    'drums': 'not a dict', 'unknown': {'mode': 'orig'}}}
        _, done = batch.rebuild(song['midi'], plan, scratch / 'out', server.KITS_DIR, stems=song['stems'])
        assert any(row['track'] == 'bass' and row['sounding'] for row in done['tracks'])
        try:
            batch.rebuild(song['midi'], {'tracks': {name: {'mode': 'mute'} for name in batch.TRACKS}}, scratch / 'out2', server.KITS_DIR)
        except ValueError:
            pass
        else:
            raise AssertionError('a plan with every track muted must be refused, not written as silence')


def test_listen_through_is_one_plain_file():
    with tempfile.TemporaryDirectory() as scratch:
        scratch = Path(scratch)
        song = library.read_song(make_song(scratch), 'test')
        target = scratch / 'listen.wav'
        _, done = batch.rebuild(song['midi'], {'preset': 'pluck'}, scratch, server.KITS_DIR, listen_path=target)
        assert done['files'] == [str(target)] and sf.info(str(target)).subtype == 'PCM_16'
        assert not list(scratch.glob('*.json')) and len(list(scratch.glob('*.wav'))) == 1


# ------------------------------------------------------------------------------- library
def test_library_lists_what_a_song_has():
    with tempfile.TemporaryDirectory() as scratch:
        scratch = Path(scratch)
        full = library.read_song(make_song(scratch, '有人声'), 'x')
        assert sorted(full['stems']) == ['bass', 'drums', 'piano', 'vocals'] and full['vocal'].endswith('vocals.wav')
        plain = library.read_song(make_song(scratch, '没人声', stems=('drums', 'bass')), 'x')
        assert plain['vocal'] is None and sorted(plain['stems']) == ['bass', 'drums']
        assert library.read_song(make_song(scratch, '没合并', merged=False), 'x') is None


def test_library_scan_skips_what_it_cannot_read():
    with tempfile.TemporaryDirectory() as scratch:
        scratch = Path(scratch)
        make_song(scratch, '好的')
        broken = make_song(scratch, '坏的')
        (broken / 'track.json').write_text('{ not json', encoding='utf-8')
        songs, looked, skipped = library.scan(extra=[str(scratch)])
        mine = [s for s in songs if s['where'].startswith('另加')]
        assert [s['title'] for s in mine] == ['好的'] and skipped >= 1
        assert any(not place['found'] for place in library.scan(extra=[str(scratch / 'nowhere')])[1])


# -------------------------------------------------------------------------------- server
def test_plan_names_cannot_leave_the_plan_folder():
    for name in ('../../evil', 'a/b', 'c:\\\\x', 'dots...'):
        path = server.plan_path('named', name)
        assert path.parent == server.PLANS / 'named' and path.suffix == '.json', path
    for kind, name in (('named', ''), ('named', '///'), ('elsewhere', 'x')):
        try:
            server.plan_path(kind, name)
        except ValueError:
            continue
        raise AssertionError(f'{kind}/{name!r} was accepted')


def test_stem_excerpt_at_the_edges():
    with tempfile.TemporaryDirectory() as scratch:
        song = library.read_song(make_song(Path(scratch)), 'x')
        import io
        middle, rate = sf.read(io.BytesIO(server.stem_excerpt(song, 'drums', 1.0, 2.0)), dtype='float32')
        assert rate == 48000 and len(middle) == 2 * 48000     # converted by the server, whatever the stem's rate
        tail, _ = sf.read(io.BytesIO(server.stem_excerpt(song, 'drums', 5.5, 2.0)), dtype='float32')
        assert len(tail) == 48000 // 2                        # the stem ends: what is left, not an error
        past, _ = sf.read(io.BytesIO(server.stem_excerpt(song, 'drums', 99.0, 2.0)), dtype='float32')
        assert len(past) == 0
        try:
            server.stem_excerpt(song, 'guitar', 0, 1)
        except KeyError:
            pass
        else:
            raise AssertionError('a stem the song does not have must be refused')


def test_stem_excerpt_is_the_window_of_the_whole_conversion():
    """What the page plays for a kept stem is the export's samples: a window of `to_48k` over the whole file.

    Until 2026-11-12 the page resampled a 16-bit excerpt in the browser (straight-line interpolation)
    and a kept drum stem came out −27 dB from the export."""
    import io
    rng = np.random.default_rng(7)
    with tempfile.TemporaryDirectory() as scratch:
        for rate in (44100, 48000, 32000):
            noise = (0.3 * rng.standard_normal((int(6.3 * rate), 2))).astype(np.float32)
            path = Path(scratch) / f'drums-{rate}.wav'
            sf.write(str(path), noise, rate, subtype='FLOAT')
            whole = batch.to_48k(noise, rate)
            song = {'stems': {'drums': str(path)}}
            for start, span in ((0.0, 2.0), (1.0, 2.0), (2.3417, 1.5), (0.00002, 0.5), (5.9, 2.0), (7.0, 1.0)):
                got, got_rate = sf.read(io.BytesIO(server.stem_excerpt(song, 'drums', start, span)), dtype='float32', always_2d=True)
                a = int(round(start * 48000))
                want = whole[a:a + int(round(span * 48000))]
                assert got_rate == 48000 and got.shape == want.shape, (rate, start, got.shape, want.shape)
                if len(want):
                    worst = float(np.abs(got - want).max())
                    assert worst <= 1e-6, (rate, start, worst)      # the same numbers, give or take float rounding


def test_resampler_is_the_reference_polyphase_filter():
    """The strided `to_48k` against the plain per-sample sum it replaced (same kernels, gathered taps)."""
    rng = np.random.default_rng(11)
    audio = (0.3 * rng.standard_normal((44100 // 3, 2))).astype(np.float32)
    up, down, kernels = batch.resampler(44100)
    frames = len(audio) * up // down
    padded = np.pad(audio, ((batch.RESAMPLE_HALF, batch.RESAMPLE_HALF + 1), (0, 0)))
    taps = np.arange(-batch.RESAMPLE_HALF + 1, batch.RESAMPLE_HALF + 1)
    want = np.zeros((frames, 2), dtype=np.float32)
    for n in range(frames):
        base = (n * down) // up
        want[n] = kernels[n % up] @ padded[base + taps + batch.RESAMPLE_HALF]
    assert float(np.abs(batch.to_48k(audio, 44100) - want).max()) <= 1e-6


def test_queue_cancel_and_busy():
    key = ('0' * 16, 'test-voice')
    try:
        assert not vocals.busy()
        vocals.STATE[key] = {'state': 'queued'}
        assert vocals.busy() and vocals.cancel(*key) and not vocals.busy()
        vocals.STATE[key] = {'state': 'running'}
        assert not vocals.cancel(*key) and vocals.busy()       # one that runs is left to finish
    finally:
        vocals.STATE.pop(key, None)


# ------------------------------------------------------------------------------- effects
def test_fx_settings_survive_a_bad_plan():
    assert effects.settings(None) == effects.DEFAULTS
    got = effects.settings({'oct': 9, 'vel': 'loud', 'tone': -250.4, 'echo': None, 'room': '35',
                            'gate': 300, 'late': -99, 'loose': -5, 'thin': '40'})
    assert got == {'oct': 2, 'vel': 0, 'gate': 100, 'late': -60, 'loose': 0, 'thin': 40, 'tone': -100, 'echo': 0, 'room': 35}, got
    assert effects.pump_settings(None) == {'depth': 0, 'release': 180}
    assert effects.pump_settings({'depth': 250, 'release': 'fast'}) == {'depth': 100, 'release': 180}
    assert effects.pump_settings({'depth': 40, 'release': 10}) == {'depth': 40, 'release': 60}


def toy_score():
    """Bass and drums, with repeated pitches, ties in velocity and a note at time 0."""
    from memesynth.score import Note, Score
    notes = []
    for i in range(12):
        start = 0.25 * i
        notes.append(Note(start=start, duration=0.2 if i % 3 else 0.6, pitch=40 + (i % 2) * 3, velocity=50 + (i * 7) % 40,
                          route='bass', is_drum=False))
        if i % 2 == 0:
            notes.append(Note(start=start, duration=0.0, pitch=36, velocity=100, route='drums/kick', is_drum=True))
    notes.sort(key=lambda n: (n.start, n.route, n.pitch))
    return Score(notes=tuple(notes), duration=3.5, routes={'bass': 12, 'drums/kick': 6}, dropped={}, warnings=())


def test_shape_note_controls_each_do_what_they_say():
    score = toy_score()
    plain = effects.settings({})
    bass = lambda notes: [n for n in notes if n.route == 'bass']
    shaped = lambda **kw: effects.shape(score, {'bass': effects.settings(kw)}, batch.track_of)
    # thin: floor(12 · 0.7 · 0.5) = 4 dropped, the quietest as written
    got = bass(shaped(thin=50).notes)
    assert len(got) == 12 - 4
    gone = sorted(set((n.start, n.velocity) for n in bass(score.notes)) - set((n.start, n.velocity) for n in got))
    assert max(v for _, v in gone) <= min(n.velocity for n in got), gone
    # gate: −100 is a quarter (never under 30 ms); +100 four times, never past the next same pitch
    short = bass(shaped(gate=-100).notes)
    assert all(abs(b.duration - max(0.03, a.duration / 4)) < 1e-12 for a, b in zip(bass(score.notes), short))
    long = bass(shaped(gate=100).notes)
    for note in long:
        later = [m.start for m in long if m.pitch == note.pitch and m.start > note.start]
        assert not later or note.start + note.duration <= min(later) + 1e-12
    assert any(b.duration > a.duration for a, b in zip(bass(score.notes), long))
    # late: −60 ms, never before 0
    early = bass(shaped(late=-60).notes)
    assert min(n.start for n in early) == 0.0 and all(abs(b.start - max(0.0, a.start - 0.06)) < 1e-12 for a, b in zip(bass(score.notes), early))
    # loose 100: each note moved by its own jitter (place n, track index 1 = bass), inside ±30 ms and ±20
    loose = bass(shaped(loose=100).notes)
    expected = []
    for n, note in enumerate(bass(score.notes)):
        start = max(0.0, note.start + effects.jitter(n, 1, 1) * 0.03)
        velocity = max(1, min(127, math.floor(note.velocity + effects.jitter(n, 2, 1) * 20 + 0.5)))
        assert abs(start - note.start) <= 0.03 + 1e-12 and abs(velocity - note.velocity) <= 20
        expected.append((round(start, 12), note.pitch, velocity))
    assert sorted(expected) == sorted((round(n.start, 12), n.pitch, n.velocity) for n in loose)
    assert any(abs(a[0] - b.start) > 1e-4 for a, b in zip(expected, bass(score.notes)))
    # drums are left alone by a bass setting; the score stays sorted
    for result in (shaped(thin=50), shaped(gate=100), shaped(late=-60), shaped(loose=100)):
        assert [n for n in result.notes if n.route == 'drums/kick'] == [n for n in score.notes if n.route == 'drums/kick']
        assert list(result.notes) == sorted(result.notes, key=lambda n: (n.start, n.route, n.pitch))


def test_shape_order_and_determinism():
    score = toy_score()
    all_four = effects.settings({'thin': 30, 'oct': 1, 'vel': 50, 'gate': 50, 'late': 20, 'loose': 60})
    one = effects.shape(score, {'bass': all_four}, batch.track_of)
    two = effects.shape(score, {'bass': all_four}, batch.track_of)
    assert one.notes == two.notes                                                   # the same input, the same output
    # thin comes first: the dropped notes are the quietest as written, whatever vel and loose do afterwards
    kept = [n for n in one.notes if n.route == 'bass']
    assert len(kept) == 12 - int(12 * 0.7 * 0.3)
    assert all(n.pitch in (52, 55) for n in kept)                                    # octave applied to what is left
    # late comes before loose: every start is the written one + 20 ms ± 18 ms (loose 60 → 0.6 · 30 ms)
    written = sorted(n.start for n in score.notes if n.route == 'bass')
    assert all(any(abs(n.start - (w + 0.02)) <= 0.018 + 1e-9 for w in written) for n in kept)
    assert min(n.start for n in kept) >= 0.0
    # jitter stays in −1..1 and depends on every input
    assert all(-1.0 <= effects.jitter(n, s, t) < 1.0 for n in range(500) for s in (1, 2) for t in range(6))
    assert len({effects.jitter(0, s, t) for s in (1, 2) for t in range(6)}) == 12


def test_pump_envelope():
    rate = effects.RATE
    env = effects.pump_envelope([0.5, 1.0], rate * 2, 50, 200)
    d = 0.8 * 0.5
    assert np.all(env[:int(0.5 * rate) + 1] == 1.0)                                 # before the first kick, and on it
    at = lambda t: env[int(round(t * rate))]
    assert abs(at(0.5 + 0.0025) - (1 - d * 0.5 * math.exp(-0.0025 / 0.2))) < 1e-9    # halfway up the 5 ms ramp
    assert abs(at(0.5 + 0.1) - (1 - d * math.exp(-0.1 / 0.2))) < 1e-9
    # the most recent kick takes over: just after 1.0 the gain is back near 1 before its own ramp
    assert at(1.0) == 1.0 and abs(at(1.3) - (1 - d * math.exp(-0.3 / 0.2))) < 1e-9
    assert np.all(effects.pump_envelope([], 1000, 50, 200) == 1.0)
    assert np.all(effects.pump_envelope([0.1], 1000, 0, 200) == 1.0)
    # a window starting later sees the same numbers as the whole
    part = effects.pump_envelope([0.5, 1.0], 4800, 50, 200, start=int(0.98 * rate))
    assert np.array_equal(part, env[int(0.98 * rate):int(0.98 * rate) + 4800])
    # the deepest point is at the end of the ramp: 1 − d · exp(−5 ms / release)
    assert abs(env.min() - (1 - d * math.exp(-0.005 / 0.2))) < 1e-6


def test_shape_moves_octaves_and_dynamics_of_one_track_only():
    with tempfile.TemporaryDirectory() as scratch:
        midi = Path(scratch) / 'a.mid'
        make_midi(midi)
        score = batch.read_score(midi)
    plain = {name: effects.settings({}) for name in batch.TRACKS}
    assert effects.shape(score, plain, batch.track_of) is score                    # nothing asked, nothing copied
    chosen = dict(plain, bass=effects.settings({'oct': 1, 'vel': -100}), drums=effects.settings({'oct': 2, 'vel': 100}))
    shaped = effects.shape(score, chosen, batch.track_of)
    assert len(shaped.notes) == len(score.notes)
    spread = lambda notes: max(n.velocity for n in notes) - min(n.velocity for n in notes)
    for track, shift in (('bass', 12), ('piano', 0), ('drums', 0)):                # a drum has no octave
        before = [n for n in score.notes if batch.track_of(n.route) == track]
        after = [n for n in shaped.notes if batch.track_of(n.route) == track]
        assert [b.pitch - a.pitch for a, b in zip(before, after)] == [shift] * len(before), track
        assert [a.start for a in before] == [b.start for b in after]
        if track == 'bass':
            assert spread(before) == 20 and spread(after) == 5, (spread(before), spread(after))   # a quarter of it
        if track == 'piano':
            assert before == after
    assert all(1 <= n.velocity <= 127 for n in shaped.notes)


def test_convolve_in_blocks_is_convolution():
    rng = np.random.default_rng(3)
    signal, kernel = rng.standard_normal(5000), rng.standard_normal(700)
    assert np.allclose(effects.convolve(signal, kernel, block=1024), np.convolve(signal, kernel), atol=1e-9)


def test_effects_do_what_they_say():
    rate = effects.RATE
    t = np.arange(rate) / rate
    low, high = np.sin(2 * np.pi * 110 * t), np.sin(2 * np.pi * 9000 * t)
    both = np.stack([0.3 * (low + high)] * 2, axis=1).astype(np.float32)
    level = lambda audio, wave: abs(float(np.dot(audio[4800:rate, 0], wave[4800:rate]))) / (rate - 4800) * 2
    nothing = effects.settings({})
    assert effects.apply(both, nothing) is both
    dark = effects.apply(both, dict(nothing, tone=-80))
    assert dark.shape == both.shape
    assert level(dark, low) > 0.25 and level(dark, high) < 0.005, (level(dark, low), level(dark, high))
    thin = effects.apply(both, dict(nothing, tone=80))
    assert level(thin, high) > 0.25 and level(thin, low) < 0.01, (level(thin, low), level(thin, high))

    click = np.zeros((rate, 2), dtype=np.float32)
    click[10] = 1.0
    echoed = effects.apply(click, dict(nothing, echo=100))
    step = int(effects.ECHO_SECONDS * rate)
    assert len(echoed) == rate + int(effects.TAIL_SECONDS * rate)
    assert close(float(echoed[10 + step, 0]), effects.ECHO_WET, 1e-6)
    second = 10 + 2 * step + effects.LOOP_LATENCY                                  # where the page's loop puts it
    assert close(float(echoed[second, 0]), effects.ECHO_WET * effects.ECHO_FEEDBACK, 1e-6)
    assert float(np.abs(echoed[11:10 + step]).max()) == 0.0

    room = effects.impulse()
    assert room.shape == (int(effects.ROOM_SECONDS * rate), 2)
    assert np.allclose(np.sum(room.astype(np.float64) ** 2, axis=0), 1.0, atol=1e-4)
    assert abs(float(np.corrcoef(room[:, 0], room[:, 1])[0, 1])) < 0.1             # a different room for each ear
    wet = effects.apply(click, dict(nothing, room=100))
    assert np.allclose(wet[11:1011], effects.ROOM_WET * room[1:1001], atol=1e-6)   # after the click: the room alone


def test_plan_tracks_cleans_a_layer():
    known = ['acid', 'pluck', 'wobble']
    plan = {'preset': 'pluck', 'tracks': {
        'bass': {'mode': 'swap', 'layer': {'kit': 'wobble', 'oct': -1, 'db': -3}},
        'guitar': {'mode': 'swap', 'layer': {'kit': 'nope', 'oct': 1}},             # unknown kit: no layer
        'piano': {'mode': 'orig', 'layer': {'kit': 'acid', 'oct': 5, 'db': -40}},   # clamped; kept on a kept stem
        'other': {'mode': 'swap', 'layer': {'kit': 'acid', 'oct': 'up', 'db': None}},   # not numbers: defaults
        'drums': {'mode': 'swap', 'layer': {'kit': 'acid', 'oct': 1, 'db': 0.5}},     # drums: no octave; halves round up
        'vocals': {'mode': 'swap', 'layer': {'kit': 'acid'}}}}                        # the vocal never has one
    tracks, _, _ = batch.plan_tracks(plan, known)
    assert tracks['bass']['layer'] == {'kit': 'wobble', 'oct': -1, 'db': -3}
    assert 'layer' not in tracks['guitar'] and 'layer' not in tracks['vocals']
    assert tracks['piano']['layer'] == {'kit': 'acid', 'oct': 1, 'db': -12}
    assert tracks['other']['layer'] == {'kit': 'acid', 'oct': 0, 'db': -6}
    assert tracks['drums']['layer'] == {'kit': 'acid', 'oct': 0, 'db': 0}
    for odd in ('wobble', None, [], {'oct': 1}, {'kit': ['acid']}, {'kit': 'acid', 'oct': float('nan'), 'db': float('inf')}, {'kit': 'acid', 'oct': True}):
        tracks, _, _ = batch.plan_tracks({'tracks': {'bass': {'layer': odd}}}, known)
        assert tracks['bass'].get('layer') in (None, {'kit': 'acid', 'oct': 0, 'db': -6}), (odd, tracks['bass'])
    tracks, _, _ = batch.plan_tracks({'tracks': {'bass': {}}}, known)
    assert 'layer' not in tracks['bass']


def test_rebuild_layer_adds_the_moved_notes_in_a_second_kit():
    """A track with a layer == the same track without it + the layer kit playing the track's shaped notes
    an octave down, times the layer's gain; before the pump and effects (none here). Floats, not files."""
    import dataclasses
    with tempfile.TemporaryDirectory() as scratch:
        scratch = Path(scratch)
        midi = scratch / 'a.mid'
        make_midi(midi)
        base = {'preset': 'pluck', 'tracks': {'drums': {'mode': 'mute'}, 'piano': {'mode': 'mute'},
                                              'bass': {'mode': 'swap', 'db': -2, 'gate': -40, 'thin': 50}}}
        layered = json.loads(json.dumps(base))
        layered['tracks']['bass']['layer'] = {'kit': 'acid', 'oct': -1, 'db': -6}
        written = {}
        original_write = batch.soundfile.write
        try:
            def keep(path, data, *args, **kwargs):
                written[str(path)] = np.array(data, dtype=np.float32)
            batch.soundfile.write = keep
            _, plain = batch.rebuild(midi, base, scratch / 'plain', server.KITS_DIR, write_tracks=True)
            _, both = batch.rebuild(midi, layered, scratch / 'both', server.KITS_DIR, write_tracks=True)
        finally:
            batch.soundfile.write = original_write
        track = lambda done: written[next(p for p in done['files'] if p.endswith('.bass.wav'))] / done['factor']
        one, two = track(plain), track(both)
        # the layer alone, as the export renders it
        from memesynth.kit import load_kit
        from memesynth.render import render
        score = batch.read_score(midi)
        tracks, _, _ = batch.plan_tracks(layered, sorted(p.parent.name for p in server.KITS_DIR.glob('*/kit.json')))
        played = batch.shaped_notes(score, tracks)
        part, dropped = batch.layer_notes(played, 'bass', -1)
        assert dropped == 0 and len(part.notes) == sum(1 for n in played.notes if batch.track_of(n.route) == 'bass') > 0
        assert all(n.pitch == m.pitch - 12 for n, m in zip(part.notes, [n for n in played.notes if batch.track_of(n.route) == 'bass']))
        result = render(part, load_kit(server.KITS_DIR / 'acid' / 'kit.json', sample_rate=batch.SAMPLE_RATE))
        alone = sum(result.stereo_stem(route) for route in result.stems) * 10 ** (-6 / 20) * 10 ** (-2 / 20)
        expect = np.zeros((max(len(one), len(alone)), 2), dtype=np.float64)
        expect[:len(one)] += one
        expect[:len(alone)] += alone
        assert len(two) == len(expect), (len(two), len(expect))
        assert np.abs(two - expect).max() <= 1e-6, np.abs(two - expect).max()
        row = next(r for r in both['tracks'] if r['track'] == 'bass')
        assert row['layer'] == {'kit': 'acid', 'oct': -1, 'db': -6} and row['layerRendered'] == result.rendered and row['layerDropped'] == 0
        assert 'layer' not in next(r for r in plain['tracks'] if r['track'] == 'bass')
        # moved out of range: those notes are left out and counted
        high = dataclasses.replace(played, notes=tuple(dataclasses.replace(n, pitch=120) if batch.track_of(n.route) == 'bass' else n for n in played.notes))
        _, gone = batch.layer_notes(high, 'bass', 1)
        assert gone == len(part.notes)
        # a kept stem does not play its layer
        kept = json.loads(json.dumps(layered))
        kept['tracks']['bass']['mode'] = 'mute'
        kept['tracks']['piano']['mode'] = 'swap'
        _, done = batch.rebuild(midi, kept, scratch / 'kept', server.KITS_DIR, listen_path=scratch / 'kept.wav')
        assert 'layer' not in next(r for r in done['tracks'] if r['track'] == 'bass')


def test_pack_lists_the_right_files():
    """SPEC v25: a sounding track gets a wav, a swapped track with notes a MIDI, a sounding layer its own MIDI;
    a muted track and a kept stem get no MIDI; nothing is written beside the folder."""
    with tempfile.TemporaryDirectory() as scratch:
        scratch = Path(scratch)
        song = library.read_song(make_song(scratch), 'test')
        plan = {'preset': 'pluck', 'tracks': {'drums': {'mode': 'swap'}, 'bass': {'mode': 'swap', 'layer': {'kit': 'acid', 'oct': -1, 'db': -6}},
                                              'piano': {'mode': 'mute'}, 'guitar': {'mode': 'swap'}, 'vocals': {'mode': 'orig'}}}
        out = scratch / 'out'
        _, done = batch.rebuild(song['midi'], plan, out, server.KITS_DIR, stems=song['stems'], pack=True)
        folder = Path(done['folder'])
        assert folder.parent == out and folder.name == 'merged.pluck.工程包', folder
        names = sorted(Path(p).name for p in done['files'])
        assert names == sorted(['00 混音.wav', '01 鼓 drums.wav', '02 贝斯 bass.wav', '01 鼓 drums.mid', '02 贝斯 bass.mid',
                                '02 贝斯 bass.叠层.mid', '方案.json', '说明.txt']), names
        assert sorted(p.name for p in out.iterdir()) == [folder.name], 'a pack writes nothing beside its folder'
        assert sorted(p.name for p in folder.iterdir()) == names
        text = (folder / '说明.txt').read_bytes()
        assert text.startswith(b'\xef\xbb\xbf') and '120 BPM' in text.decode('utf-8-sig') and '钢琴：静音' in text.decode('utf-8-sig')
        saved = json.loads((folder / '方案.json').read_text(encoding='utf-8'))
        assert saved['preset'] == 'pluck' and saved['tracks']['bass']['layer']['kit'] == 'acid' and 'written' in saved
        again = batch.rebuild(song['midi'], plan, out, server.KITS_DIR, stems=song['stems'], pack=True)[1]
        assert Path(again['folder']).name == 'merged.pluck-2.工程包'


def test_pack_midi_cannot_hold_overlapping_notes_of_one_pitch():
    import pretty_midi
    from memesynth.score import Note
    notes = [Note(0.0, 1.0, 60, 90, 'guitar/a', False), Note(0.5, 1.0, 60, 80, 'guitar/b', False),   # overlaps: cut at 0.5
             Note(2.0, 0.2, 60, 70, 'guitar/a', False), Note(2.0, 0.6, 60, 60, 'guitar/b', False),   # same start: one, the longer
             Note(0.25, 0.5, 64, 100, 'guitar/a', False), Note(1.0, 0.1, 200, 100, 'guitar/a', False)]  # another pitch; out of range
    midi, counts = batch.pack_midi(notes, 'guitar - pluck', False)
    assert counts == {'skipped': 1, 'shortened': 1, 'merged': 1}, counts
    with tempfile.TemporaryDirectory() as scratch:
        path = Path(scratch) / 'a.mid'
        midi.write(str(path))
        back = sorted((n.start, n.end, n.pitch) for n in pretty_midi.PrettyMIDI(str(path)).instruments[0].notes)
    assert back == [(0.0, 0.5, 60), (0.25, 0.75, 64), (0.5, 1.5, 60), (2.0, 2.6, 60)], back


def test_pack_wavs_line_up_and_the_midi_is_the_shaped_notes():
    import pretty_midi
    with tempfile.TemporaryDirectory() as scratch:
        scratch = Path(scratch)
        song = library.read_song(make_song(scratch), 'test')
        plan = {'preset': 'pluck', 'pump': {'depth': 50, 'release': 150},
                'tracks': {'drums': {'mode': 'swap', 'thin': 30}, 'piano': {'mode': 'orig'},
                           'bass': {'mode': 'swap', 'gate': -40, 'late': -15, 'loose': 40, 'thin': 50, 'room': 30,
                                    'layer': {'kit': 'acid', 'oct': 1, 'db': -3}}}}
        _, done = batch.rebuild(song['midi'], plan, scratch / 'out', server.KITS_DIR, stems=song['stems'], pack=True)
        folder = Path(done['folder'])
        mix, rate = sf.read(str(folder / '00 混音.wav'), dtype='float64')
        total, lengths = np.zeros_like(mix), set()
        for path in folder.glob('0[1-6] *.wav'):
            audio, _ = sf.read(str(path), dtype='float64')
            lengths.add(len(audio))
            total += audio
        assert rate == 48000 and lengths == {len(mix)}, (lengths, len(mix))
        error = 10 * np.log10(np.mean((total - mix) ** 2) / np.mean(mix ** 2))
        assert error < -100, error                      # 24-bit files: the sum is off only by rounding
        score = batch.read_score(song['midi'])
        tracks, _, _ = batch.plan_tracks(plan, sorted(p.parent.name for p in server.KITS_DIR.glob('*/kit.json')))
        played = batch.shaped_notes(score, tracks)
        for name, drums in (('bass', False), ('drums', True)):
            mine = [n for n in played.notes if batch.track_of(n.route) == name]
            midi = pretty_midi.PrettyMIDI(str(next(folder.glob(f'0? * {name}.mid'))))
            assert midi.resolution == 480 and [round(t) for t in midi.get_tempo_changes()[1]] == [120]
            (part,) = midi.instruments
            assert part.is_drum == drums and len(part.notes) == len(mine)
            got = sorted(part.notes, key=lambda n: (n.start, n.pitch))
            want = sorted(mine, key=lambda n: (n.start, n.pitch))
            for a, b in zip(got, want):
                assert abs(a.start - b.start) <= 0.53e-3 and a.pitch == b.pitch and a.velocity == b.velocity
                assert abs((a.end - a.start) - (0.1 if drums else b.duration)) <= 0.53e-3
        layer = pretty_midi.PrettyMIDI(str(folder / '02 贝斯 bass.叠层.mid')).instruments[0]
        main = pretty_midi.PrettyMIDI(str(folder / '02 贝斯 bass.mid')).instruments[0]
        assert [n.pitch for n in layer.notes] == [n.pitch + 12 for n in main.notes]
        assert layer.name == 'bass - layer acid' and main.name == 'bass - pluck', (layer.name, main.name)
        assert not list(folder.glob('04 *.mid')), 'a kept stem has no MIDI'


def test_rebuild_carries_octave_dynamics_and_effects():
    with tempfile.TemporaryDirectory() as scratch:
        scratch = Path(scratch)
        midi = scratch / 'a.mid'
        make_midi(midi)
        base = {'preset': 'pluck', 'tracks': {'drums': {'mode': 'mute'}, 'piano': {'mode': 'mute'}, 'bass': {'mode': 'swap'}}}

        def bass(extra, name):
            plan = json.loads(json.dumps(base))
            plan['tracks']['bass'].update(extra)
            _, done = batch.rebuild(midi, plan, scratch / name, server.KITS_DIR)
            audio, rate = sf.read(next(p for p in done['files'] if p.endswith('.wav')), dtype='float32')
            row = next(r for r in done['tracks'] if r['track'] == 'bass')
            return audio, row, done['seconds']

        plain, row, seconds = bass({}, 'plain')
        assert 'oct' not in row and 'room' not in row
        crossings = lambda audio: int(np.sum(np.signbit(audio[:96000, 0]) != np.signbit(np.roll(audio[:96000, 0], 1))))
        up, row, _ = bass({'oct': 1}, 'up')
        assert row['oct'] == 1 and crossings(up) > 1.5 * crossings(plain), (crossings(plain), crossings(up))
        wet, row, longer = bass({'echo': 60, 'room': 50, 'tone': -20}, 'wet')
        assert row['echo'] == 60 and row['room'] == 50 and row['tone'] == -20
        assert close(longer - seconds, effects.TAIL_SECONDS, 0.01), (seconds, longer)
        odd, row, _ = bass({'oct': 'high', 'echo': 900}, 'odd')                      # nonsense falls back or is clamped
        assert 'oct' not in row and row['echo'] == 100
        saved = json.loads(next(scratch.glob('wet/*.json')).read_text(encoding='utf-8'))
        assert saved['tracks']['bass']['echo'] == 60 and saved['tracks']['piano']['room'] == 0


def test_vocal_table_covers_every_kit_and_only_those():
    import runpy
    kits = runpy.run_path(str(ROOT / 'tools' / 'kitdefs' / '__init__.py'), run_name='kitdefs_table')['KITS']
    assert sorted(effects.VOCAL_PRESETS) == sorted(kits), set(effects.VOCAL_PRESETS) ^ set(kits)
    for name, values in effects.VOCAL_PRESETS.items():
        assert sorted(values) == ['echo', 'room', 'tone'] and effects.settings(values) == dict(effects.DEFAULTS, **values), name
    assert effects.VOCAL_PRESETS['lofi'] == {'tone': -45, 'echo': 0, 'room': 15}
    assert effects.VOCAL_PRESETS['ambient'] == {'tone': -15, 'echo': 30, 'room': 70}
    assert effects.vocal_preset('no-such-kit') == {'tone': 0, 'echo': 0, 'room': 0}
    index = server.kit_index()                                                     # the page reads the same numbers
    assert all(index[name]['vocal'] == effects.VOCAL_PRESETS[name] for name in index), 'kits.json disagrees'


def test_kits_json_carries_the_kit_loudness_table():
    """kits.json gives each kit its row of tools/kit_levels.py's table; without the file, empty rows (the page borrows plainly)."""
    table = server.KITS_DIR / 'levels.json'
    index = server.kit_index()
    if table.is_file():
        rows = json.loads(table.read_text(encoding='utf-8'))['kits']
        assert all(index[name]['loudness'] == rows[name]['db'] for name in index if name in rows), 'kits.json disagrees with levels.json'
        assert index['fmkeys']['loudness'] and not any(index['fmkeys']['loudness'].values())
    kept = server.KITS_DIR
    with tempfile.TemporaryDirectory() as scratch:
        try:
            server.KITS_DIR = Path(scratch)
            assert server.kit_loudness() == {}
            (Path(scratch) / 'levels.json').write_text('{ not json', encoding='utf-8')
            assert server.kit_loudness() == {}
        finally:
            server.KITS_DIR = kept


def test_vocal_settings_follow_the_preset_or_not():
    ambient = effects.VOCAL_PRESETS['ambient']
    own = dict(effects.DEFAULTS, oct=1, vel=-20, tone=40, echo=5, room=0)
    # follow true: the preset's sound, its own notes
    assert effects.vocal_settings(dict(own, follow=True), 'ambient') == dict(effects.DEFAULTS, oct=1, vel=-20, **ambient)
    # follow false: its own five, whatever the preset
    assert effects.vocal_settings(dict(own, follow=False), 'ambient') == own
    assert effects.vocal_settings({'follow': False}, 'ambient') == effects.DEFAULTS
    # no key: follows only if its own tone, echo and room are all 0
    assert effects.vocal_settings({'oct': -1}, 'lofi') == dict(effects.DEFAULTS, oct=-1, **effects.VOCAL_PRESETS['lofi'])
    assert effects.vocal_settings(own, 'lofi') == own
    assert effects.vocal_settings({'room': 10}, 'lofi')['room'] == 10 and effects.vocal_settings({'room': 10}, 'lofi')['tone'] == 0
    assert effects.vocal_settings(None, 'chiptune') == dict(effects.DEFAULTS, tone=20)
    assert effects.vocal_settings({'follow': 'yes', 'echo': 3}, 'ambient')['echo'] == 3  # a nonsense flag counts as missing
    assert effects.vocal_settings({'follow': True}, 'no-such-kit') == effects.DEFAULTS


def test_rebuild_applies_the_preset_to_a_sung_vocal():
    with tempfile.TemporaryDirectory() as scratch:
        scratch = Path(scratch)
        song = library.read_song(make_song(scratch), 'test')
        sung = np.concatenate([tone(220, 6.0, rate=48000), np.zeros(4800, np.float32)])
        quiet = {name: {'mode': 'mute'} for name in batch.TRACKS}

        def vocal(preset, extra, name):
            plan = {'preset': preset, 'tracks': dict(quiet, vocals=dict({'mode': 'orig'}, **extra))}
            _, done = batch.rebuild(song['midi'], plan, scratch / name, server.KITS_DIR, stems=song['stems'],
                                    vocal=sung, voice='original')
            row = next(r for r in done['tracks'] if r['track'] == 'vocals')
            saved = json.loads(Path(next(p for p in done['files'] if p.endswith('.json'))).read_text(encoding='utf-8'))
            return done['seconds'], row, saved['tracks']['vocals']

        dry, row, saved = vocal('pluck', {'follow': False}, 'dry')
        assert row['sounding'] and row['follow'] is False and not any(k in row for k in ('tone', 'echo', 'room'))
        assert close(dry, len(sung) / 48000, 0.01), dry                             # no effect, no tail
        assert saved['follow'] is False
        wet, row, saved = vocal('ambient', {}, 'ambient')                         # an old plan with nothing set follows
        assert close(wet - dry, effects.TAIL_SECONDS, 0.01), (dry, wet)
        assert row['follow'] is True and (row['tone'], row['echo'], row['room']) == (-15, 30, 70), row
        assert saved['follow'] is True and saved['room'] == 0                     # the plan keeps its own numbers
        lofi, row, _ = vocal('lofi', {'follow': True, 'room': 99}, 'lofi')
        assert close(lofi - dry, effects.TAIL_SECONDS, 0.01) and row['room'] == 15 and row['tone'] == -45, row
        chip, row, _ = vocal('chiptune', {'follow': True}, 'chip')               # tone only: no tail
        assert close(chip, dry, 0.01) and row['tone'] == 20 and 'echo' not in row
        own, row, _ = vocal('ambient', {'echo': 40}, 'own')                      # an old plan with its own echo keeps it
        assert row['follow'] is False and row['echo'] == 40 and 'room' not in row and close(own - dry, effects.TAIL_SECONDS, 0.01)


def test_server_outlives_its_pages_only_while_there_is_work():
    key = ('0' * 16, 'test-voice')
    kept = dict(server.PAGES)
    try:
        server.PAGES.update(seen=0.0, bye=0.0)
        began = time.monotonic()
        server.wait_for_pages(first=0.2, quiet=0.2, farewell=0.1, tick=0.05)       # no page ever came
        assert time.monotonic() - began < 2
        server.PAGES.update(seen=time.monotonic(), bye=time.monotonic() + 0.01)     # a page was here and said goodbye
        vocals.STATE[key] = {'state': 'running'}                                    # ...while a voice is converting
        waiter = threading.Thread(target=server.wait_for_pages, kwargs=dict(first=0.2, quiet=5.0, farewell=0.1, tick=0.05), daemon=True)
        waiter.start()
        waiter.join(0.8)
        assert waiter.is_alive(), 'the server would have stopped in the middle of a conversion'
        vocals.STATE.pop(key, None)
        waiter.join(2)
        assert not waiter.is_alive(), 'the server did not stop once the page had gone and the work was done'
        server.PAGES.update(seen=time.monotonic(), bye=0.0)                         # a page that is still asking
        waiter = threading.Thread(target=server.wait_for_pages, kwargs=dict(first=0.2, quiet=5.0, farewell=0.1, tick=0.05), daemon=True)
        waiter.start()
        waiter.join(0.6)
        assert waiter.is_alive(), 'the server stopped under a page that is still open'
        server.PAGES.update(bye=time.monotonic() + 0.01)
        waiter.join(2)
        assert not waiter.is_alive()
        # Two windows: one says goodbye, the other is covered and has not reported for a moment.
        now = time.monotonic()
        server.PAGES.update(seen=now, bye=now + 0.01, live={'covered': now})
        waiter = threading.Thread(target=server.wait_for_pages, kwargs=dict(first=0.2, quiet=1.2, farewell=0.1, tick=0.05), daemon=True)
        waiter.start()
        waiter.join(0.7)
        assert waiter.is_alive(), 'closing one window stopped the server under another'
        waiter.join(3)
        assert not waiter.is_alive(), 'a window that never reports again must not keep the server for ever'
    finally:
        vocals.STATE.pop(key, None)
        server.PAGES.clear()
        server.PAGES.update(kept)


def fetch(url, headers=None):
    request = urllib.request.Request(url, headers=headers or {})
    try:
        with urllib.request.urlopen(request, timeout=10) as response:
            return response.status, dict(response.headers), response.read()
    except urllib.error.HTTPError as error:
        return error.code, dict(error.headers), error.read()


def test_server_answers_in_words_and_serves_ranges():
    """Over a real socket: seeking in a rendered song, and errors that arrive as JSON, never as a dropped connection."""
    with tempfile.TemporaryDirectory() as scratch:
        scratch = Path(scratch)
        kept = server.LISTEN, server.library_listing
        httpd = ThreadingHTTPServer(('127.0.0.1', 0), server.Handler)
        httpd.opened_midi, httpd.library_extra = None, []
        threading.Thread(target=httpd.serve_forever, daemon=True).start()
        base = f'http://127.0.0.1:{httpd.server_address[1]}'
        try:
            server.LISTEN = scratch
            name = 'ab' * 16
            (scratch / f'{name}.wav').write_bytes(bytes(range(256)) * 4)
            status, headers, body = fetch(f'{base}/listen/{name}.wav', {'Range': 'bytes=10-19'})
            assert status == 206 and body == bytes(range(10, 20)) and headers['Content-Range'] == 'bytes 10-19/1024'
            status, _, body = fetch(f'{base}/listen/{name}.wav', {'Range': 'bytes=1000-'})
            assert status == 206 and len(body) == 24
            assert fetch(f'{base}/listen/{name}.wav')[0] == 200
            assert fetch(f'{base}/listen/{name}.wav', {'Range': 'bytes=5000-'})[0] == 416
            assert fetch(f'{base}/listen/..%2f..%2fserver.py.wav')[0] == 403
            status, _, body = fetch(f'{base}/api/stem?song=nope&track=drums')
            assert status == 404 and 'error' in json.loads(body)
            status, _, body = fetch(f'{base}/api/plan?name=')
            assert status == 400 and 'error' in json.loads(body)

            def explode(*_):
                raise RuntimeError('boom')
            server.library_listing = explode
            status, _, body = fetch(f'{base}/api/library')
            assert status == 500 and 'boom' in json.loads(body)['error']
        finally:
            server.LISTEN, server.library_listing = kept
            httpd.shutdown()


# --------------------------------------------------------------------------------- own samples (SPEC v26)
def saw(hz, seconds, level=0.3, rate=RATE):
    t = np.arange(int(seconds * rate)) / rate
    return (level * (2.0 * ((t * hz) % 1.0) - 1.0)).astype(np.float32)


def wav_bytes(audio, rate=RATE, kind='WAV', subtype=None):
    import io
    out = io.BytesIO()
    sf.write(out, audio, rate, format=kind, **({'subtype': subtype} if subtype else {}))
    return out.getvalue()


def test_measured_root_finds_saws_and_a_sine_and_not_noise():
    from studio import samples
    for hz in (55.0, 110.0, 220.0, 440.0, 880.0):
        found = samples.measured_root(saw(hz, 1.0, rate=48000), 48000)
        assert found is not None and abs(found / hz - 1) < 0.01, (hz, found)
    found = samples.measured_root(tone(330.0, 1.0, rate=48000), 48000)
    assert found is not None and abs(found / 330.0 - 1) < 0.01, found
    noise = np.random.default_rng(5).uniform(-0.3, 0.3, 48000).astype(np.float32)
    assert samples.measured_root(noise, 48000) is None
    assert samples.note_of(110.0) == ('A2', 0) and samples.note_of(440.0 * 2 ** (0.12 / 12)) == ('A4', 12)
    assert abs(samples.note_hz('C3') - 130.8128) < 1e-3 and samples.note_hz('A4') == 440.0


def test_a_sample_is_kept_once_at_48k_and_odd_files_are_refused():
    from studio import samples
    with tempfile.TemporaryDirectory() as scratch:
        folder = Path(scratch) / 'samples'
        data = wav_bytes(saw(110.0, 1.5))                                   # 44.1 kHz mono
        first, existed = samples.store(data, '锯齿 bass.wav', folder)
        again, existed_again = samples.store(data, 'renamed.wav', folder)
        assert not existed and existed_again and first['id'] == again['id'] == __import__('hashlib').sha256(data).hexdigest()[:16]
        assert samples.known(folder) == [first['id']] and len(list(folder.iterdir())) == 1
        audio, rate = sf.read(str(folder / first['id'] / 'sample.wav'), dtype='float32', always_2d=True)
        assert rate == 48000 and audio.shape[1] == 1 and sf.info(str(folder / first['id'] / 'sample.wav')).subtype == 'FLOAT'
        import io
        source, _ = sf.read(io.BytesIO(data), dtype='float32', always_2d=True)
        assert np.array_equal(audio[:, 0], batch.to_48k(source, RATE)[:, 0])     # the export's own resampler
        assert first['channels'] == 1 and abs(first['rootHz'] / 110 - 1) < 0.01 and first['note'] == 'A2'
        assert json.loads((folder / first['id'] / 'info.json').read_text(encoding='utf-8'))['name'] == '锯齿 bass.wav'
        wide, _ = samples.store(wav_bytes(np.stack([saw(220.0, 1.0), tone(330, 1.0), tone(440, 1.0)], axis=1), rate=48000), 'three.wav', folder)
        assert wide['channels'] == 2 and sf.info(str(folder / wide['id'] / 'sample.wav')).channels == 2
        refused = {
            'long': wav_bytes(saw(110.0, 21.0)),
            'midi': b'MThd\x00\x00\x00\x06\x00\x01\x00\x01\x01\xe0MTrk\x00\x00\x00\x04\x00\xff\x2f\x00',
            'flac': wav_bytes(saw(110.0, 1.0), kind='FLAC'),
            'silent': wav_bytes(np.zeros(RATE, dtype=np.float32), subtype='FLOAT'),
            'quiet': wav_bytes(saw(110.0, 1.0, level=0.0009), subtype='FLOAT'),
        }
        for why, body in refused.items():
            try:
                samples.store(body, why + '.wav', folder)
            except samples.SampleError as error:
                assert str(error), why
            else:
                raise AssertionError(f'{why} was taken')
        kept = samples.MAX_BYTES
        try:
            samples.MAX_BYTES = 1000
            try:
                samples.store(data, 'big.wav', folder)
                raise AssertionError('too big was taken')
            except samples.SampleError as error:
                assert '50 MB' in str(error)
        finally:
            samples.MAX_BYTES = kept
        assert len(samples.known(folder)) == 2, 'nothing refused was kept'
        assert samples.path_of(folder, '../' + first['id']) is None and samples.path_of(folder, 'ABCDEF0123456789') is None


def test_plan_tracks_cleans_a_sample_and_drops_a_missing_file():
    known = ['acid', 'pluck']
    with tempfile.TemporaryDirectory() as scratch:
        folder = Path(scratch)
        (folder / '0123456789abcdef').mkdir()
        (folder / '0123456789abcdef' / 'sample.wav').write_bytes(wav_bytes(saw(110.0, 0.5)))
        good, gone = '0123456789abcdef', 'fedcba9876543210'
        plan = {'preset': 'pluck', 'tracks': {
            'bass': {'mode': 'swap', 'sample': {'id': good, 'name': 'a.wav', 'root': 110.0, 'db': -3.5}},
            'guitar': {'mode': 'swap', 'kit': 'acid', 'sample': {'id': gone, 'name': 'b.wav', 'root': 110.0, 'db': 0}},
            'piano': {'mode': 'orig', 'sample': {'id': good, 'name': 'c.wav', 'root': 220, 'db': 24}},
            'drums': {'mode': 'swap', 'sample': {'id': good, 'name': 'k.wav', 'part': 'kick', 'db': -24}},
            'vocals': {'mode': 'swap', 'sample': {'id': good, 'name': 'v.wav', 'root': 220, 'db': 0}}}}
        lost = {}
        tracks, _, _ = batch.plan_tracks(plan, known, samples_dir=folder, lost=lost)
        assert tracks['bass']['sample'] == {'id': good, 'name': 'a.wav', 'root': 110.0, 'db': -3.5}
        assert tracks['piano']['sample']['db'] == 24 and tracks['drums']['sample']['part'] == 'kick'
        assert 'sample' not in tracks['guitar'] and 'sample' not in tracks['vocals']
        assert lost == {'guitar': '吉他 的采样 b.wav 找不到了，用回 acid'}, lost
        odd = [None, 'x', {'id': good, 'name': 'a.wav', 'root': 110.0}, {'id': good, 'name': 'a.wav', 'db': 0},
               {'id': good, 'root': 110, 'db': 0}, {'id': 'nothex', 'name': 'a', 'root': 110, 'db': 0},
               {'id': good, 'name': 'a', 'root': 29, 'db': 0}, {'id': good, 'name': 'a', 'root': 5001, 'db': 0},
               {'id': good, 'name': 'a', 'root': 110, 'db': 24.5}, {'id': good, 'name': 'a', 'root': 110, 'db': True},
               {'id': good, 'name': 'a', 'root': float('nan'), 'db': 0}, {'id': good, 'name': 'a', 'root': '110', 'db': 0}]
        for value in odd:
            tracks, _, _ = batch.plan_tracks({'tracks': {'bass': {'sample': value}}}, known, samples_dir=folder)
            assert 'sample' not in tracks['bass'], value
        for part in ('tom', None, 'Kick'):
            tracks, _, _ = batch.plan_tracks({'tracks': {'drums': {'sample': {'id': good, 'name': 'k', 'part': part, 'db': 0}}}}, known, samples_dir=folder)
            assert 'sample' not in tracks['drums'], part
        tracks, _, _ = batch.plan_tracks({'tracks': {'bass': {}}}, known, samples_dir=folder)
        assert 'sample' not in tracks['bass']


def capture_writes():
    written, original = {}, batch.soundfile.write

    def keep(path, data, *args, **kwargs):
        written[str(path)] = np.array(data, dtype=np.float32)
    batch.soundfile.write = keep
    return written, lambda: setattr(batch.soundfile, 'write', original)


def test_rebuild_with_a_sample_is_the_handwritten_kit():
    """A pitched track's sample and a drum part's sample render exactly as a kit.json written by hand from the
    spec; the drums' other routes stay as the base kit plays them."""
    from memesynth.kit import load_kit
    from memesynth.render import render
    from studio import samples
    with tempfile.TemporaryDirectory() as scratch:
        scratch = Path(scratch)
        midi = scratch / 'a.mid'
        make_midi(midi)
        folder = scratch / 'samples'
        bass, _ = samples.store(wav_bytes(saw(110.0, 1.0)), 'bass.wav', folder)
        kick, _ = samples.store(wav_bytes(np.stack([tone(60, 0.3, 0.8), tone(61, 0.3, 0.7)], axis=1)), 'kick.wav', folder)
        plan = {'preset': 'pluck', 'tracks': {'piano': {'mode': 'mute'},
                'bass': {'mode': 'swap', 'db': -2, 'gate': -40, 'sample': {'id': bass['id'], 'name': 'bass.wav', 'root': 108.0, 'db': -4.5}},
                'drums': {'mode': 'swap', 'kit': 'acid', 'sample': {'id': kick['id'], 'name': 'kick.wav', 'part': 'kick', 'db': 3.0}}}}
        written, restore = capture_writes()
        try:
            _, done = batch.rebuild(midi, plan, scratch / 'out', server.KITS_DIR, write_tracks=True, samples_dir=folder)
            _, plain = batch.rebuild(midi, {**plan, 'tracks': {**plan['tracks'], 'drums': {'mode': 'swap', 'kit': 'acid'}}},
                                     scratch / 'plain', server.KITS_DIR, write_tracks=True, samples_dir=folder)
        finally:
            restore()
        track = lambda result, name: written[next(p for p in result['files'] if p.endswith(f'.{name}.wav'))]
        tracks, _, _ = batch.plan_tracks(plan, sorted(p.parent.name for p in server.KITS_DIR.glob('*/kit.json')), samples_dir=folder)
        played = batch.shaped_notes(batch.read_score(midi), tracks)
        # by hand, from SPEC v26 §4
        hand = {'samples': {'s': {'file': str(folder / bass['id'] / 'sample.wav'), 'rootHz': 108.0}},
                'voices': {'bass': {'sample': 's', 'follow': 'note', 'fade': 0.01, 'pan': 0, 'gain': 10 ** (-4.5 / 20)}}}
        (scratch / 'hand').mkdir()
        (scratch / 'hand' / 'kit.json').write_text(json.dumps(hand), encoding='utf-8')
        result = render(batch.sample_notes(played, 'bass'), load_kit(scratch / 'hand' / 'kit.json'))
        expect = (sum(result.stereo_stem(r) for r in result.stems) * (10.0 ** (-2 / 20))) * done['factor']
        got = track(done, 'bass')
        assert got.shape == expect.shape and np.array_equal(got, expect.astype(np.float32)), np.abs(got - expect).max()
        row = next(r for r in done['tracks'] if r['track'] == 'bass')
        assert row['by'] == 'sample' and row['sample']['id'] == bass['id'] and row['sampleRendered'] == result.rendered > 0
        # the drums: acid with its kick replaced, the pan kept
        acid = json.loads((server.KITS_DIR / 'acid' / 'kit.json').read_text(encoding='utf-8'))
        base = load_kit(server.KITS_DIR / 'acid' / 'kit.json')
        drums = {'samples': {**{k: {**v, 'file': str(server.KITS_DIR / 'acid' / v['file'])} for k, v in acid['samples'].items()},
                             'mine': {'file': str(folder / kick['id'] / 'sample.wav'), 'rootHz': 1.0}},
                 'voices': {**acid['voices'], 'drums/kick': {'sample': 'mine', 'pitched': False, 'follow': 'sample', 'gain': 10 ** (3 / 20),
                                                             'pan': base.resolve('drums/kick').pan}}}
        (scratch / 'hand' / 'kit.json').write_text(json.dumps(drums), encoding='utf-8')
        mine = render(batch.sample_notes(played, 'drums'), load_kit(scratch / 'hand' / 'kit.json'))
        theirs = render(batch.sample_notes(played, 'drums'), base)
        expect = sum(mine.stereo_stem(r) for r in mine.stems) * done['factor']
        got = track(done, 'drums')
        assert got.shape == expect.shape and np.array_equal(got, expect.astype(np.float32)), np.abs(got - expect).max()
        assert set(mine.stems) == set(theirs.stems) and 'drums/kick' in mine.stems
        for route in mine.stems:
            same = np.array_equal(mine.stems[route], theirs.stems[route])
            assert same == (route != 'drums/kick'), route
        assert next(r for r in done['tracks'] if r['track'] == 'drums')['by'] == 'acid + sample kick'
        assert done['sampleNotes'] == []
        # a sample whose file is gone: the kit plays, and the report says so
        (folder / bass['id']).rename(folder / 'away')
        _, back = batch.rebuild(midi, plan, scratch / 'back', server.KITS_DIR, listen_path=scratch / 'back.wav', samples_dir=folder)
        row = next(r for r in back['tracks'] if r['track'] == 'bass')
        assert row['by'] == 'pluck' and row['sampleLost'] == '贝斯 的采样 bass.wav 找不到了，用回 pluck', row
        assert back['sampleNotes'] == ['贝斯 的采样 bass.wav 找不到了，用回 pluck']


def test_pack_names_a_sample():
    import pretty_midi
    from studio import samples
    with tempfile.TemporaryDirectory() as scratch:
        scratch = Path(scratch)
        song = library.read_song(make_song(scratch), 'test')
        folder = scratch / 'samples'
        bass, _ = samples.store(wav_bytes(saw(110.0, 1.0)), 'bass.wav', folder)
        plan = {'preset': 'pluck', 'tracks': {'piano': {'mode': 'mute'}, 'vocals': {'mode': 'mute'},
                'bass': {'mode': 'swap', 'sample': {'id': bass['id'], 'name': '我的 bass.wav', 'root': 110.0, 'db': -3.2}},
                'drums': {'mode': 'swap', 'sample': {'id': bass['id'], 'name': 'k.wav', 'part': 'kick', 'db': 0}}}}
        _, done = batch.rebuild(song['midi'], plan, scratch / 'out', server.KITS_DIR, stems=song['stems'], pack=True, samples_dir=folder)
        pack = Path(done['folder'])
        assert pretty_midi.PrettyMIDI(str(pack / '02 贝斯 bass.mid')).instruments[0].name == 'bass - sample'
        assert pretty_midi.PrettyMIDI(str(pack / '01 鼓 drums.mid')).instruments[0].name == 'drums - pluck + sample kick'
        text = (pack / '说明.txt').read_text(encoding='utf-8-sig')
        assert '贝斯：换 · 采样 我的 bass.wav（A2，−3.2 dB）' in text, text
        assert '鼓：换 · 鼓 pluck，底鼓换成采样 k.wav' in text, text


def test_server_takes_a_sample_and_serves_only_numbers():
    from studio import samples
    with tempfile.TemporaryDirectory() as scratch:
        kept = server.SAMPLES
        server.SAMPLES = Path(scratch) / 'samples'
        httpd = ThreadingHTTPServer(('127.0.0.1', 0), server.Handler)
        httpd.opened_midi, httpd.library_extra = None, []
        threading.Thread(target=httpd.serve_forever, daemon=True).start()
        base = f'http://127.0.0.1:{httpd.server_address[1]}'

        def post(query, body, name='锯齿.wav'):
            request = urllib.request.Request(f'{base}/api/sample?{query}', data=body, method='POST',
                                             headers={'X-File-Name': urllib.parse.quote(name)})
            try:
                with urllib.request.urlopen(request, timeout=30) as response:
                    return response.status, json.loads(response.read())
            except urllib.error.HTTPError as error:
                return error.code, json.loads(error.read())
        import urllib.parse
        try:
            body = wav_bytes(saw(110.0, 1.0))
            status, answer = post('track=bass&kit=hoover', body)
            assert status == 200 and answer['name'] == '锯齿.wav' and answer['note'] == 'A2' and not answer['existed'], answer
            assert -24 <= answer['db'] <= 24 and answer['samples'] == [answer['id']]
            status, again = post('track=drums&kit=hoover', body)
            assert status == 200 and again['existed'] and set(again['dbs']) == {'kick', 'snare', 'cymbal'}, again
            assert fetch(f'{base}/api/samples')[2] and json.loads(fetch(f'{base}/api/samples')[2])['samples'] == [answer['id']]
            status, headers, data = fetch(f'{base}/samples/{answer["id"]}.wav')
            assert status == 200 and headers.get('Cache-Control') == 'no-store' and data[:4] == b'RIFF'
            for bad in ('0123456789abcdef', '..%2finfo', answer['id'].upper(), answer['id'] + '0'):
                assert fetch(f'{base}/samples/{bad}.wav')[0] == 404, bad
            for query, why in (('track=vocals&kit=hoover', '人声'), ('track=bass&kit=nope', '音色'), ('track=bass&kit=..%2Fhoover', '音色')):
                status, answer = post(query, body)
                assert status == 400 and why in answer['error'], answer
            status, answer = post('track=bass&kit=hoover', b'MThd\x00\x00\x00\x06', 'a.mid')
            assert status == 400 and 'wav' in answer['error'], answer
            assert len(samples.known(server.SAMPLES)) == 1
        finally:
            server.SAMPLES = kept
            httpd.shutdown()


TESTS = [value for name, value in sorted(globals().items()) if name.startswith('test_') and callable(value)]


def main():
    failed = 0
    for test in TESTS:
        began = time.monotonic()
        try:
            test()
        except Exception:  # noqa: BLE001 — every test runs, whatever the one before did
            failed += 1
            print(f'  FAILED  {test.__name__}')
            traceback.print_exc()
        else:
            print(f'  ok      {test.__name__}  ({time.monotonic() - began:.1f}s)')
    print(f'\n{len(TESTS) - failed} passed, {failed} failed')
    return 1 if failed else 0


if __name__ == '__main__':
    sys.exit(main())
