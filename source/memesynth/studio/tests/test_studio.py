"""Tests for the studio's own Python: the rebuild, the library, plans, and what the server answers.

    runtime/0.5.0/envs/basic/python.exe source/memesynth/studio/tests/test_studio.py

Everything is built in a temporary folder: a small MIDI, sine-wave stems, a fake analysis
folder. Nothing touches XLD's analysis root or the studio's cache. The kits are the real ones
(`source/memesynth/kits`), because the rebuild is only meaningful through a real kit.
"""
import json
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
        assert rate == RATE and len(middle) == 2 * RATE
        tail, _ = sf.read(io.BytesIO(server.stem_excerpt(song, 'drums', 5.5, 2.0)), dtype='float32')
        assert len(tail) == RATE // 2                         # the stem ends: what is left, not an error
        past, _ = sf.read(io.BytesIO(server.stem_excerpt(song, 'drums', 99.0, 2.0)), dtype='float32')
        assert len(past) == 0
        try:
            server.stem_excerpt(song, 'guitar', 0, 1)
        except KeyError:
            pass
        else:
            raise AssertionError('a stem the song does not have must be refused')


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
    got = effects.settings({'oct': 9, 'vel': 'loud', 'tone': -250.4, 'echo': None, 'room': '35'})
    assert got == {'oct': 2, 'vel': 0, 'tone': -100, 'echo': 0, 'room': 35}, got


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
