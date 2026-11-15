"""Local studio for memesynth: serves the page, and does the exporting with the real renderer.

Why a browser and not a window: this repo's embedded Python ships `_tkinter.pyd` and the
Tcl DLLs but not the Tcl script library, so `Tk()` raises TclError and no tkinter GUI can
start here at all (SPEC §6). A localhost page costs nothing extra, reuses the audition
engine that was already verified against the Python renderer, and keeps export on the real
`memesynth` so what lands on disk is what the CLI would have written.

Binds to 127.0.0.1 only. Start it with `音色工作台.cmd` at the repo root, or:

    runtime/0.5.0/envs/basic/python.exe source/memesynth/studio/server.py [某首.mid]
"""
from __future__ import annotations

import base64
import json
import mimetypes
import os
import socket
import sys
import threading
import time
import traceback
import uuid
import webbrowser
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path

HERE = Path(__file__).resolve().parent
ROOT = HERE.parent
REPO = ROOT.parents[1]
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

LOG = REPO / 'work' / 'memesynth-cache' / 'studio.log'
if sys.stderr is None or sys.stdout is None:
    # pythonw (the launcher's window-less start) has no console: everything that would be
    # printed, a traceback at import included, goes to a log, started afresh once it is large.
    LOG.parent.mkdir(parents=True, exist_ok=True)
    mode = 'w' if LOG.is_file() and LOG.stat().st_size > 1_000_000 else 'a'
    sys.stdout = sys.stderr = LOG.open(mode, encoding='utf-8', buffering=1)

from studio import library, vocals  # noqa: E402
from studio import batch, effects, samples  # noqa: E402
from studio import xld_stems  # noqa: E402
from studio.batch import export, rebuild, stem_levels  # noqa: E402

KITS_DIR = ROOT / 'kits'
#: Where a sung vocal sits when its slider is at 0 dB: RMS over the frames it sings (SPEC v2 §3).
VOCAL_TARGET_DB = -20.0
DEFAULT_OUT = REPO / 'work' / 'memesynth-out'
PLANS = REPO / 'work' / 'memesynth-cache' / 'plans'      # named plans, and the last state of each library song
LISTEN = REPO / 'work' / 'memesynth-cache' / 'listen'    # the whole rebuild rendered to hear in the page; one file at a time
CLIP_MAX = 10 * 1024 * 1024                               # SPEC v28: a saved 12-second clip is ~2.3 MB
SAMPLES = REPO / 'work' / 'memesynth-cache' / 'samples'  # SPEC v26: the user's own samples; `--samples` puts them elsewhere
JOBS: dict = {}
JOBS_LOCK = threading.Lock()
SONGS: dict = {}            # key → song, from the last library scan; the only paths /library/ will serve
LEVELS: dict = {}           # (song key, preset) → how its stems are scaled; measured once, it takes a few seconds
PAGES = {'seen': 0.0, 'bye': 0.0}   # when a page last asked for anything, and when one last said it was closing


def kit_index():
    """Every built kit, with sample URLs the page can fetch directly from `kits/`."""
    #: Kind, mark (the page holds the drawings) and one line about each kit. The kinds are listed
    #: in this order; inside a kind the kits keep the order of `order` below.
    kinds_in_order = ['复古合成', '舞池', '低音', '硬核', '氛围实验', '游戏机', '原声']
    about = {
        'acid': ('复古合成', 'knob', 'TR-808 + TB-303，低音带酸性扫频'),
        'fmkeys': ('复古合成', 'sine', 'DX 式 FM 电钢 + 合成器垫，和声最厚'),
        'synthwave': ('复古合成', 'sun', '80 年代：Juno 贝斯、复音铜管、门限混响军鼓'),
        'italo': ('复古合成', 'disco', 'Italo / Eurobeat：音序器贝斯、方波主音、牛铃'),
        'electro': ('复古合成', 'robot', 'Kraftwerk 一路：声码器主音、808、激光拨奏'),
        'vaporwave': ('复古合成', 'column', '80 年代数字合成器，加合唱、去高频、泡在混响里'),
        'supersaw': ('舞池', 'saw', 'Trance / EDM：每个音七个锯齿，909 鼓加拍手'),
        'house': ('舞池', 'house', 'M1 风琴贝斯、亮而硬的钢琴、弦乐机、707 鼓'),
        'techno': ('舞池', 'grid', '底鼓带低频余震、Dub 和弦带回声、金属打击'),
        'garage': ('舞池', 'shuffle', '2-step：滑入的弹跳贝斯、八度风琴、人声切片'),
        'futurebass': ('舞池', 'spark', '锯齿和弦带侧链起伏，主音上滑'),
        'psytrance': ('舞池', 'spiral', '短促的滚动低音、谐振激光、带回声的主音'),
        'trap': ('低音', 'cone', '808 当贝斯用，暗色钟琴，金属镲'),
        'reese': ('低音', 'beat', 'Drum & Bass：两个失谐锯齿的 Reese 贝斯，Break 鼓'),
        'wobble': ('低音', 'lfo', 'Dubstep：每秒开合 4 次的贝斯、元音主音、大军鼓'),
        'phonk': ('低音', 'cowbell', '808 牛铃当旋律，削波贝斯，8 位磁带味'),
        'hoover': ('硬核', 'siren', '90 年代 Rave：吸尘器音色、Rave 钢琴、过载 909'),
        'hardstyle': ('硬核', 'bolt', '失真到有音高的底鼓、反向贝斯、尖叫主音'),
        'hyperpop': ('硬核', 'star', '削波锯齿、带金属环音的底鼓、氦气人声'),
        'lofi': ('氛围实验', 'tape', '走带不稳的磁带 + 12 位采样器的鼓，闷而暖'),
        'ambient': ('氛围实验', 'cloud', '慢起音 + 3 秒混响，快句子会糊成一片'),
        'glitch': ('氛围实验', 'glitch', '位数不够、参数乱跳、包络重触发；音高不坏'),
        'chiptune': ('游戏机', 'gamepad', 'NES 2A03 方波／三角波／噪声，红白机'),
        'c64': ('游戏机', 'chip', 'SID 芯片：脉宽不停地摆、谐振滤波、4 位的鼓'),
        'megadrive': ('游戏机', 'cartridge', 'YM2612：拧过头的 FM，贝斯带弹拨感，8 位 DAC 鼓'),
        'pluck': ('原声', 'strings', 'Karplus-Strong 物理建模弦，最接近原声'),
        'organ': ('原声', 'pipes', '拉杆电风琴 + 闭管风琴，唯一不衰减的一套'),
        'orchestra': ('原声', 'violin', '弓弦／铜管／竖琴／定音鼓，唯一慢起音'),
        'musicbox': ('原声', 'bell', 'FM 钟声与钟琴，八音盒，脆而远'),
        'gamelan': ('原声', 'gong', '青铜排琴与锣，非谐波，和弦互相打拍'),
    }
    # The first ten keep their places, which are their number keys (1–9, 0); the rest follow by kind.
    order = ['acid', 'chiptune', 'pluck', 'musicbox', 'fmkeys', 'organ', 'orchestra', 'gamelan', 'synthwave', 'supersaw']
    order += [name for name in about if name not in order]
    found = {p.parent.name: p for p in sorted(KITS_DIR.glob('*/kit.json'))}
    loudness = kit_loudness()
    index = {}
    for name in order + [n for n in found if n not in order]:
        if name not in found:
            continue
        kit = json.loads(found[name].read_text(encoding='utf-8'))
        index[name] = {
            'name': kit.get('name', name),
            'blurb': about.get(name, ('', '', ''))[2],
            'category': about.get(name, ('其他', 'note', ''))[0], 'icon': about.get(name, ('其他', 'note', ''))[1],
            'rank': kinds_in_order.index(about[name][0]) if name in about else len(kinds_in_order),
            # entry['file'] is already relative to the kit directory ("samples/x.wav").
            'samples': {sample: {'file': f'kits/{name}/{entry["file"]}',
                                 'rootHz': entry['rootHz'], 'label': entry.get('_label', '')}
                        for sample, entry in kit['samples'].items()},
            'voices': kit['voices'],
            'vocal': effects.vocal_preset(name),             # what this preset does to the vocal (SPEC v15)
            'vocalTreat': effects.VOCAL_TREAT.get(name, 'none'),   # and its second tier (SPEC v27)
            # how loud this kit plays each track, dB vs fmkeys (tools/kit_levels.py): the page corrects borrowed levels with it
            'loudness': loudness.get(name, {}),
        }
    return index


def kit_loudness():
    """`kits/levels.json` as {kit: {track: dB}}; empty when the file is missing or unreadable (the page then borrows plainly)."""
    try:
        data = json.loads((KITS_DIR / 'levels.json').read_text(encoding='utf-8'))
        return {kit: {track: float(value) for track, value in row.get('db', {}).items()}
                for kit, row in data.get('kits', {}).items()}
    except (OSError, ValueError, AttributeError, TypeError):
        return {}


def library_listing(extra=()):
    """The song list for the page: no paths, just what to show and whether a vocal is ready."""
    songs, looked, skipped = library.scan(extra)
    SONGS.clear()
    SONGS.update({song['key']: song for song in songs})
    rows = []
    for song in songs:
        vocal_id = vocals.known(song['vocal']) if song['vocal'] else None
        rows.append({'key': song['key'], 'title': song['title'], 'artist': song['artist'], 'album': song['album'],
                     'where': song['where'], 'vocal': bool(song['vocal']), 'prepared': bool(vocal_id),
                     'stems': sorted(song['stems']), 'plan': plan_path('songs', song['key']).is_file(),
                     'voices': vocals.ready_voices(vocal_id) if vocal_id else []})
    return {'songs': rows, 'places': looked, 'skipped': skipped}


def library_song(key, extra=()):
    """The song with this key. XLD may have re-analysed it since the last scan (the user works
    in the library at the same time), so a song whose files are gone is looked up afresh."""
    song = SONGS.get(key)
    stale = song is not None and not all(Path(p).is_file() for p in [song['midi'], *song['stems'].values()])
    if song is None or stale:
        library_listing(extra)
        for cached in [k for k in LEVELS if k[0] == key]:
            del LEVELS[cached]
    if key not in SONGS:
        raise KeyError('曲库里没有这首了（可能刚被移走或重新分析过），刷新页面再试')
    return SONGS[key]


def stem_excerpt(song, track, start, span):
    """A stretch of one separated stem as WAV bytes: 48 kHz stereo, 32-bit float.

    Converted here by the export's own resampler (`batch.window_48k`), so the page plays the
    same samples the export mixes. The page used to resample a 16-bit excerpt itself, and a
    browser does that by straight-line interpolation: a kept drum stem came out −27 dB apart."""
    import io

    import soundfile
    path = song['stems'].get(track)
    if not path:
        raise KeyError('这首没有这条分轨')
    audio = batch.window_48k(path, max(0.0, start), max(0.0, span))
    out = io.BytesIO()
    soundfile.write(out, audio, batch.SAMPLE_RATE, format='WAV', subtype='FLOAT')
    return out.getvalue()


def fx_probe():
    """One second of test signal, the same every time: a click, then a 330 Hz tone on the left and 495 Hz on the right."""
    import numpy as np
    t = np.arange(effects.RATE) / effects.RATE
    probe = np.zeros((effects.RATE, 2), dtype=np.float32)
    probe[:, 0] = 0.4 * np.sin(2 * np.pi * 330.0 * t) * np.exp(-6.0 * t)
    probe[:, 1] = 0.4 * np.sin(2 * np.pi * 495.0 * t) * np.exp(-6.0 * t)
    probe[100] = (0.9, -0.9)
    return probe


def shape_check(midi_bytes, plan, window=None):
    """`/api/shapecheck`: the shaped notes of a MIDI under a plan, in order, and the pump's kick times;
    with `window` ({start, frames} in samples) also the pump's envelope there."""
    import tempfile

    from studio.batch import TRACKS, layer_notes, plan_tracks, read_score, shaped_notes, track_of
    if not midi_bytes:
        raise ValueError('没有收到 MIDI')
    with tempfile.TemporaryDirectory() as scratch:
        path = Path(scratch) / 'check.mid'
        path.write_bytes(midi_bytes)
        score = read_score(path)
    known = sorted(p.parent.name for p in KITS_DIR.glob('*/kit.json'))
    tracks, preset, pump = plan_tracks(plan, known)
    played = shaped_notes(score, tracks)
    out = {'notes': [[n.route, n.start, n.duration, n.pitch, n.velocity] for n in played.notes],
           'kicks': effects.kick_times(played), 'pump': pump, 'preset': preset}
    # Each swapped track's layer (SPEC v24): the notes its second kit plays, and how many fell outside 0–127.
    out['layers'] = {}
    for name in TRACKS:
        layer = tracks[name].get('layer')
        if layer and tracks[name]['mode'] == 'swap' and any(track_of(n.route) == name for n in played.notes):
            part, dropped = layer_notes(played, name, layer['oct'])
            out['layers'][name] = {'layer': layer, 'dropped': dropped,
                                   'notes': [[n.route, n.start, n.duration, n.pitch, n.velocity] for n in part.notes]}
    if isinstance(window, dict):
        # The pump's gain for a stretch of samples, as float64, so the page can compare its own sample by sample.
        start, frames = int(window.get('start', 0)), min(int(window.get('frames', 0)), 60 * effects.RATE)
        envelope = effects.pump_envelope(out['kicks'], frames, pump['depth'], pump['release'], start=start)
        out['envelope'] = base64.b64encode(envelope.astype('<f8').tobytes()).decode('ascii')
    return out


def plan_path(kind, key):
    """Where a plan lives: `named/<name>.json` or `songs/<library key>.json`."""
    safe = ''.join(c for c in str(key) if c not in '\\/:*?"<>|.').strip()[:80]
    if kind not in ('named', 'songs') or not safe:
        raise ValueError('方案的名字不能用')
    return PLANS / kind / f'{safe}.json'


def run_rebuild(job_id, midi_bytes, midi_name, plan, out_dir, write_tracks, vocal_choice, stems, listen=False, pack=False):
    """The rebuild as a job, the same way `run_job` runs the per-kit export.

    With `listen` it is rendered into the cache for the page to play, replacing the last one."""
    staging = Path(out_dir) / '.studio-input'
    try:
        staging.mkdir(parents=True, exist_ok=True)
        if listen:
            for old in Path(out_dir).glob('*.wav'):
                try:
                    old.unlink()
                except OSError:                      # still being played: it goes next time
                    pass
        safe = ''.join(c for c in Path(midi_name).stem if c not in '\\/:*?"<>|').strip() or 'input'
        midi_path = staging / f'{safe}.mid'
        midi_path.write_bytes(midi_bytes)

        def progress(fraction, message):
            with JOBS_LOCK:
                JOBS[job_id].update(progress=float(fraction), message=message)

        vocal, vocal_note = load_vocal(vocal_choice)

        def treat_vocal(name, say):
            # SPEC v27: the same cached file the page plays, made now if it is not there yet
            treated, why = load_vocal(vocal_choice, name, say)
            if treated is None:
                raise RuntimeError(why)
            return treated

        score, written = rebuild(midi_path, plan, out_dir, KITS_DIR, stems=stems, vocal=vocal, treat_vocal=treat_vocal,
                                 voice=(vocal_choice or {}).get('voice', ''), write_tracks=write_tracks,
                                 progress=progress, listen_path=(Path(out_dir) / f'{job_id}.wav') if listen else None,
                                 pack=pack and not listen, samples_dir=SAMPLES)
        with JOBS_LOCK:
            JOBS[job_id].update(done=True, progress=1.0, message='完成', vocalNote=vocal_note, rebuild=written,
                                listen=f'/listen/{job_id}.wav' if listen else '',
                                summary={'notes': len(score.notes), 'seconds': round(score.duration, 1),
                                         'routes': len(score.routes)},
                                outDir=str(Path(out_dir).resolve()))
    except Exception as error:  # noqa: BLE001 — the page has to be told, not the console
        traceback.print_exc()
        with JOBS_LOCK:
            JOBS[job_id].update(done=True, error=f'{type(error).__name__}: {error}')
    finally:
        try:
            for leftover in staging.glob('*.mid'):
                leftover.unlink()
            staging.rmdir()
        except OSError:
            pass


def load_vocal(choice, treat='none', say=None):
    """The chosen vocal at its final level, or (None, why not) — SPEC v2 §4–5. With `treat` (SPEC v27), the cached
    treated file, made first if it is not there; a treated file keeps the RMS of the voice, so the level is the same."""
    if not choice or not choice.get('voice'):
        return None, ''
    import soundfile
    try:
        path = (vocals.vocal_audio(choice.get('id', ''), choice['voice']) if treat == 'none'
                else vocals.treated(choice.get('id', ''), choice['voice'], treat, say))
        level = vocals.status(choice['id'])['info']['activeRmsDb']
    except (FileNotFoundError, ValueError, OSError) as error:
        return None, f'人声没加上：{error}'
    gain_db = VOCAL_TARGET_DB + float(choice.get('offsetDb') or 0.0) - level
    audio, _ = soundfile.read(str(path), dtype='float32')
    return audio * (10.0 ** (gain_db / 20.0)), ''


def run_job(job_id, midi_bytes, midi_name, kit_names, out_dir, stems, vocal_choice=None):
    """Render in a worker thread; the page polls /api/job for progress (SPEC §3)."""
    staging = Path(out_dir) / '.studio-input'
    try:
        staging.mkdir(parents=True, exist_ok=True)
        safe = ''.join(c for c in Path(midi_name).stem if c not in '\\/:*?"<>|').strip() or 'input'
        midi_path = staging / f'{safe}.mid'
        midi_path.write_bytes(midi_bytes)
        chosen = [KITS_DIR / name / 'kit.json' for name in kit_names]
        missing = [p for p in chosen if not p.is_file()]
        if missing:
            raise FileNotFoundError('找不到：' + '、'.join(str(p) for p in missing))

        def progress(fraction, message):
            with JOBS_LOCK:
                JOBS[job_id].update(progress=float(fraction), message=message)

        vocal, vocal_note = load_vocal(vocal_choice)
        score, results = export(midi_path, chosen, out_dir, stems=stems, progress=progress,
                                vocal=vocal, voice=(vocal_choice or {}).get('voice', ''))
        with JOBS_LOCK:
            JOBS[job_id].update(
                done=True, progress=1.0, message='完成', vocalNote=vocal_note,
                summary={'notes': len(score.notes), 'seconds': round(score.duration, 1),
                         'routes': len(score.routes)},
                results=[{'kit': r.kit, 'files': r.files, 'rendered': r.rendered,
                          'truncated': r.truncated, 'unresolved': r.unresolved, 'error': r.error}
                         for r in results],
                outDir=str(Path(out_dir).resolve()))
    except Exception as error:  # noqa: BLE001 — the page has to be told, not the console
        traceback.print_exc()
        with JOBS_LOCK:
            JOBS[job_id].update(done=True, error=f'{type(error).__name__}: {error}')
    finally:
        try:
            for leftover in staging.glob('*.mid'):
                leftover.unlink()
            staging.rmdir()
        except OSError:
            pass


class Handler(BaseHTTPRequestHandler):
    server_version = 'memesynth-studio'

    def log_message(self, fmt, *args):            # one line per request is enough
        if '/api/' in str(args[0] if args else ''):          # an error is logged with a status, not a string
            sys.stderr.write(f'  {args[0]}\n')

    def send_json(self, payload, status=200):
        body = json.dumps(payload, ensure_ascii=False).encode('utf-8')
        self.send_response(status)
        self.send_header('Content-Type', 'application/json; charset=utf-8')
        self.send_header('Content-Length', str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def send_bytes(self, data, kind):
        self.send_response(200)
        self.send_header('Content-Type', kind)
        self.send_header('Content-Length', str(len(data)))
        self.send_header('Cache-Control', 'no-store')
        self.end_headers()
        self.wfile.write(data)

    def send_file(self, path: Path):
        if not path.is_file():
            return self.send_json({'error': f'没有这个文件：{path.name}'}, 404)
        data = path.read_bytes()
        kind = mimetypes.guess_type(path.name)[0] or 'application/octet-stream'
        if path.suffix in ('.html', '.js', '.json', '.css'):
            kind += '; charset=utf-8'
        self.send_response(200)
        self.send_header('Content-Type', kind)
        self.send_header('Content-Length', str(len(data)))
        self.send_header('Cache-Control', 'no-store')        # a local server: nothing is worth a stale kit after a rebuild
        self.end_headers()
        self.wfile.write(data)

    def send_ranged(self, path: Path):
        """A file the page may seek in: answers `Range: bytes=a-b` with just that stretch."""
        if not path.is_file():
            return self.send_json({'error': f'没有这个文件：{path.name}'}, 404)
        size = path.stat().st_size
        first, last = 0, size - 1
        asked = (self.headers.get('Range') or '').strip()
        if asked.startswith('bytes='):
            low, _, high = asked[len('bytes='):].partition('-')
            try:
                if low:
                    first = int(low)
                    last = min(size - 1, int(high)) if high else size - 1
                elif high:
                    first = max(0, size - int(high))
            except ValueError:
                first, last = 0, size - 1
            if first > last or first >= size:
                self.send_response(416)
                self.send_header('Content-Range', f'bytes */{size}')
                self.end_headers()
                return None
        self.send_response(206 if asked.startswith('bytes=') else 200)
        self.send_header('Content-Type', 'audio/wav')
        self.send_header('Accept-Ranges', 'bytes')
        self.send_header('Content-Length', str(last - first + 1))
        if asked.startswith('bytes='):
            self.send_header('Content-Range', f'bytes {first}-{last}/{size}')
        self.send_header('Cache-Control', 'no-store')
        self.end_headers()
        with path.open('rb') as handle:
            handle.seek(first)
            left = last - first + 1
            while left > 0:
                chunk = handle.read(min(1 << 20, left))
                if not chunk:
                    break
                try:
                    self.wfile.write(chunk)
                except OSError:                      # the page stopped listening
                    return None
                left -= len(chunk)
        return None

    def guard(self, handle):
        """Whatever goes wrong while answering, the page is told in words: an exception that
        escapes would only drop the connection, which the page reads as "the server is gone"."""
        # Each window names itself (`page=`), so one window closing is not taken for all of them.
        page = self.path.partition('page=')[2].partition('&')[0][:40] if '?' in self.path else ''
        now = time.monotonic()
        if self.path.startswith('/api/bye'):
            PAGES['bye'] = now
            PAGES.setdefault('live', {}).pop(page, None)
        else:
            PAGES['seen'] = now
            if page:
                PAGES.setdefault('live', {})[page] = now
        try:
            handle()
        except (BrokenPipeError, ConnectionError):
            pass                                     # the page went away mid-answer
        except Exception as error:  # noqa: BLE001
            traceback.print_exc()
            try:
                self.send_json({'error': f'服务端出错了：{type(error).__name__}: {error}'}, 500)
            except OSError:
                pass

    def do_GET(self):
        self.guard(self.get)

    def do_POST(self):
        self.guard(self.post)

    def get(self):
        route = self.path.split('?', 1)[0]
        if route in ('/', '/index.html'):
            return self.send_file(HERE / 'app.html')
        if route == '/engine.js':
            return self.send_file(HERE / 'engine.js')
        if route == '/theme.css':
            return self.send_file(HERE / 'theme.css')
        if route == '/kits.json':
            return self.send_json(kit_index())
        if route == '/reverb.wav':
            # The room the page auditions with is the one the export uses: one impulse, made here.
            import io
            import soundfile
            out = io.BytesIO()
            soundfile.write(out, effects.impulse(), effects.RATE, format='WAV', subtype='FLOAT')
            return self.send_bytes(out.getvalue(), 'audio/wav')
        if route == '/api/fxcheck':
            # A test hook: a fixed click-and-tone through the effects, for comparing the page's nodes with this.
            import io
            import urllib.parse
            import soundfile
            query = urllib.parse.parse_qs(self.path.partition('?')[2])
            chosen = effects.settings({key: (query.get(key) or [0])[0] for key in effects.DEFAULTS})
            out = io.BytesIO()
            soundfile.write(out, effects.apply(fx_probe(), chosen), effects.RATE, format='WAV', subtype='FLOAT')
            return self.send_bytes(out.getvalue(), 'audio/wav')
        if route == '/api/start':
            from studio import vocalfx                          # the names only: librosa is not loaded here
            return self.send_json({'defaultOut': str(DEFAULT_OUT), 'treatments': vocalfx.NAMES,
                                   'opened': self.server.opened_midi,
                                   'openedStamp': getattr(self.server, 'opened_stamp', 0),
                                   'repo': str(REPO)})
        if route == '/api/job':
            job_id = self.path.split('id=', 1)[-1] if 'id=' in self.path else ''
            with JOBS_LOCK:
                return self.send_json(JOBS.get(job_id, {'error': '没有这个任务'}))
        if route.startswith('/kits/'):
            # Only ever inside kits/, and only wav: the page asks for nothing else.
            parts = [p for p in route[1:].split('/') if p not in ('', '.', '..')]
            target = (ROOT / Path(*parts)).resolve()
            if target.suffix == '.wav' and str(target).startswith(str(KITS_DIR.resolve())):
                return self.send_file(target)
            return self.send_json({'error': '拒绝'}, 403)
        if route == '/api/samples':
            return self.send_json({'samples': samples.known(SAMPLES)})
        if route.startswith('/samples/') and route.endswith('.wav'):
            # Only a 16-hex number that is stored; nothing else under the folder is ever served.
            path = samples.path_of(SAMPLES, route[len('/samples/'):-len('.wav')])
            if path is None:
                return self.send_json({'error': '没有这个采样'}, 404)
            return self.send_file(path)
        if route == '/api/library':
            return self.send_json(library_listing(self.server.library_extra))
        if route.startswith('/library/') and route.endswith('.mid'):
            try:
                return self.send_file(Path(library_song(route[len('/library/'):-len('.mid')], self.server.library_extra)['midi']))
            except KeyError as error:
                return self.send_json({'error': str(error.args[0])}, 404)
        if route.startswith('/listen/') and route.endswith('.wav'):
            name = route[len('/listen/'):-len('.wav')]
            if len(name) != 32 or any(c not in '0123456789abcdef' for c in name):
                return self.send_json({'error': '拒绝'}, 403)
            return self.send_ranged(LISTEN / f'{name}.wav')
        if route == '/api/stem':
            import urllib.parse
            query = urllib.parse.parse_qs(self.path.partition('?')[2])
            try:
                song = library_song(query.get('song', [''])[0], self.server.library_extra)
                data = stem_excerpt(song, query.get('track', [''])[0],
                                    float(query.get('start', ['0'])[0]), float(query.get('span', ['12'])[0]))
            except (KeyError, ValueError, OSError, RuntimeError) as error:   # RuntimeError: libsndfile could not read it
                return self.send_json({'error': f'这条分轨读不了：{error.args[0] if error.args else error}'}, 404)
            self.send_response(200)
            self.send_header('Content-Type', 'audio/wav')
            self.send_header('Content-Length', str(len(data)))
            self.send_header('Cache-Control', 'no-store')
            self.end_headers()
            return self.wfile.write(data)
        if route == '/api/levels':
            import urllib.parse
            query = urllib.parse.parse_qs(self.path.partition('?')[2])
            key, preset = query.get('song', [''])[0], query.get('preset', [''])[0]
            try:
                song = library_song(key, self.server.library_extra)
                kit = KITS_DIR / preset / 'kit.json'
                if not kit.is_file() or '/' in preset or '\\' in preset or '..' in preset:
                    raise KeyError('没有这套音色')
                # Measured once per song, preset and state of the files: a new merge or separation is measured again.
                stamp = tuple(Path(p).stat().st_mtime_ns for p in [song['midi'], *sorted(song['stems'].values())])
                if LEVELS.get((key, preset), {}).get('stamp') != stamp:
                    factors, spare, notes = stem_levels(song['midi'], kit, song['stems'])
                    LEVELS[(key, preset)] = {'factors': factors, 'spare': spare, 'notes': notes, 'stamp': stamp}
                found = LEVELS[(key, preset)]
                return self.send_json({'factors': found['factors'], 'spare': found['spare'],
                                       'empty': found['notes']['empty'], 'capped': found['notes']['capped']})
            except KeyError as error:
                return self.send_json({'error': str(error.args[0])}, 404)
            except Exception as error:  # noqa: BLE001 — the page has to be told, not the console
                traceback.print_exc()
                return self.send_json({'error': f'量不了原声的音量：{error}'}, 500)
        if route == '/api/plans':
            names = sorted(p.stem for p in (PLANS / 'named').glob('*.json')) if (PLANS / 'named').is_dir() else []
            return self.send_json({'plans': names})
        if route == '/api/plan':
            import urllib.parse
            query = urllib.parse.parse_qs(self.path.partition('?')[2])
            try:
                kind = 'named' if 'name' in query else 'songs'
                path = plan_path(kind, (query.get('name') or query.get('song') or [''])[0])
                return self.send_json({'plan': json.loads(path.read_text(encoding='utf-8')) if path.is_file() else None})
            except (ValueError, OSError) as error:
                return self.send_json({'error': str(error)}, 400)
        if route == '/opened.mid' and self.server.opened_midi:
            return self.send_file(Path(self.server.opened_midi))
        if route == '/voices.json':
            return self.send_json(vocals.catalog())
        if route == '/api/vocal':
            try:
                return self.send_json(vocals.status(self.path.split('id=', 1)[-1] if 'id=' in self.path else ''))
            except (ValueError, OSError) as error:
                return self.send_json({'error': str(error)}, 404)
        if route.startswith('/vocal/'):
            # /vocal/<16 hex>/<voice>.wav, and only ever from the cache.
            # ?treat=<name> (SPEC v27, a whitelist): that treatment's cached file, made first if need be (this waits).
            import urllib.parse
            parts = route.split('/')
            treat = (urllib.parse.parse_qs(self.path.partition('?')[2]).get('treat') or ['none'])[0]
            if treat not in effects.TREATMENTS:
                return self.send_json({'error': '没有这种人声处理'}, 400)
            if len(parts) == 4 and parts[3].endswith('.wav'):
                try:
                    return self.send_file(vocals.treated(parts[2], parts[3][:-4], treat))
                except (ValueError, FileNotFoundError) as error:
                    return self.send_json({'error': str(error)}, 404)
            return self.send_json({'error': '拒绝'}, 403)
        if route == '/api/treat':
            import urllib.parse
            query = urllib.parse.parse_qs(self.path.partition('?')[2])
            try:
                return self.send_json(self.treat_answer(*((query.get(k) or [''])[0] for k in ('vocal', 'voice', 'treat')), start=False))
            except (ValueError, FileNotFoundError) as error:
                return self.send_json({'error': str(error)}, 400)
        return self.send_json({'error': '没有这个地址'}, 404)

    def take_clip(self, length):
        """POST /api/clip (SPEC v28): the page's 12 seconds as wav bytes; the name it suggests in `X-File-Name` and the
        output folder in `X-Out-Dir` (both URL-encoded; no folder = the default). Only RIFF…WAVE, at most 10 MB, and
        only straight into that folder: a name with a path in it is refused, not cleaned. Same name twice → `-2`."""
        import urllib.parse
        if length > CLIP_MAX:
            self.close_connection = True                   # the body is not read
            return self.send_json({'error': f'片段 {length / 1048576:.1f} MB，最大 10 MB'}, 400)
        data = self.rfile.read(length)
        if len(data) < 12 or data[:4] != b'RIFF' or data[8:12] != b'WAVE':
            return self.send_json({'error': '这不是 WAV 数据，片段没存'}, 400)
        name = urllib.parse.unquote(self.headers.get('X-File-Name') or '').strip()
        if not name or '..' in name or '/' in name or '\\' in name:
            return self.send_json({'error': '片段的文件名不能带路径，片段没存'}, 400)
        name = ''.join(c for c in name if c not in ':*?"<>|' and ord(c) >= 32).strip(' .') or 'clip'
        if not name.lower().endswith('.wav'):
            name += '.wav'
        out_dir = Path(urllib.parse.unquote(self.headers.get('X-Out-Dir') or '') or DEFAULT_OUT).expanduser()
        if not out_dir.is_absolute():
            return self.send_json({'error': '输出目录要写完整路径'}, 400)
        try:
            out_dir.mkdir(parents=True, exist_ok=True)
        except OSError as error:
            return self.send_json({'error': f'建不了输出目录：{error}'}, 400)
        path = batch.unique(out_dir / name)
        if path.resolve().parent != out_dir.resolve():
            return self.send_json({'error': '片段的文件名不能带路径，片段没存'}, 400)
        path.write_bytes(data)
        return self.send_json({'ok': True, 'path': str(path), 'name': path.name, 'folder': str(out_dir.resolve())})

    @staticmethod
    def treat_answer(vocal_id, voice, treat, start):
        """/api/treat (SPEC v27): {state: ready | working | error | missing, message?}; POST starts the work."""
        if treat not in effects.TREATMENTS:
            raise ValueError('没有这种人声处理')
        vocals.vocal_audio(vocal_id, voice)                       # the voice itself has to be there
        state = vocals.request_treat(vocal_id, voice, treat) if start else vocals.treat_status(vocal_id, voice, treat)
        return dict(state, vocal=vocal_id, voice=voice, treat=treat)

    def take_sample(self, length):
        """POST /api/sample?track=<轨>&kit=<音色>: the dropped file's bytes as the body, its name URL-encoded in
        `X-File-Name` (SPEC v26 §1). Kept once under its number; the answer carries what was measured and the gain
        that matches it to what it replaces in that kit (for the drums one per part, the part is picked after)."""
        import urllib.parse
        query = urllib.parse.parse_qs(self.path.partition('?')[2])
        track, kit_name = (query.get('track') or [''])[0], (query.get('kit') or [''])[0]
        if length > samples.MAX_BYTES:
            self.close_connection = True                  # the body is not read
            return self.send_json({'error': f'文件 {length / 1048576:.0f} MB，采样最大 50 MB'}, 400)
        data = self.rfile.read(length)
        if track not in (*samples.PITCHED, 'drums'):
            return self.send_json({'error': '人声这一行不接采样' if track == 'vocals' else '不认识这条轨'}, 400)
        kit_path = KITS_DIR / kit_name / 'kit.json'
        if not kit_name or '/' in kit_name or '\\' in kit_name or '..' in kit_name or not kit_path.is_file():
            return self.send_json({'error': '没有这套音色'}, 400)
        name = urllib.parse.unquote(self.headers.get('X-File-Name') or '') or 'sample.wav'
        try:
            record, existed = samples.store(data, name, SAMPLES)
        except samples.SampleError as error:
            return self.send_json({'error': str(error)}, 400)
        import soundfile
        from memesynth.kit import load_kit
        heard = samples.mono(soundfile.read(str(samples.path_of(SAMPLES, record['id'])), dtype='float32', always_2d=True)[0])
        kit = load_kit(kit_path, sample_rate=batch.SAMPLE_RATE)
        if track == 'drums':
            record['dbs'] = {part: samples.matched_db(heard, kit, track, part) for part in samples.PARTS}
        else:
            record['db'] = samples.matched_db(heard, kit, track)
        # This drop's own name, even when the same bytes were kept before under another.
        record.update(name=name, existed=existed, samples=samples.known(SAMPLES))
        return self.send_json(record)

    def post(self):
        route = self.path.split('?', 1)[0]
        length = int(self.headers.get('Content-Length') or 0)
        if route == '/api/sample':
            return self.take_sample(length)
        if route == '/api/clip':
            return self.take_clip(length)
        if route == '/api/vocal':
            if 'json' in (self.headers.get('Content-Type') or ''):
                # A library song: the stem is already on this disk, so only its key travels.
                try:
                    song = library_song(json.loads(self.rfile.read(length) or b'{}').get('song', ''), self.server.library_extra)
                    if not song['vocal']:
                        return self.send_json({'error': '这首没有分离出人声'}, 404)
                    return self.send_json(vocals.store_file(song['vocal'])[1])
                except KeyError as error:
                    return self.send_json({'error': str(error.args[0])}, 404)
                except Exception as error:  # noqa: BLE001 — the page has to be told, not the console
                    traceback.print_exc()
                    return self.send_json({'error': f'人声分轨处理失败：{error}'}, 500)
            # The stem comes as the raw body: base64 inside JSON would add a third to 50 MB.
            data = self.rfile.read(length)
            marked = xld_stems.is_marked_flac(data)          # XLD's FLAC stem (half level, comment xld-gain=2)
            if not marked and (data[:4] != b'RIFF' or data[8:12] != b'WAVE'):
                return self.send_json({'error': '这不是 WAV 文件（要 XLD 分离出的 vocals.wav）'}, 400)
            try:
                vocal_id, state = vocals.store(xld_stems.flac_to_wav_bytes(data) if marked else data)
            except Exception as error:  # noqa: BLE001 — the page has to be told, not the console
                traceback.print_exc()
                return self.send_json({'error': f'人声分轨处理失败：{error}'}, 500)
            return self.send_json(state)
        try:
            payload = json.loads(self.rfile.read(length) or b'{}')
        except json.JSONDecodeError as error:
            return self.send_json({'error': f'请求不是合法 JSON：{error}'}, 400)

        if route == '/api/plan':
            try:
                kind = 'named' if payload.get('name') else 'songs'
                path = plan_path(kind, payload.get('name') or payload.get('song') or '')
                path.parent.mkdir(parents=True, exist_ok=True)
                path.write_text(json.dumps(payload.get('plan') or {}, ensure_ascii=False, indent=1), encoding='utf-8')
                return self.send_json({'ok': True, 'name': path.stem})
            except (ValueError, OSError) as error:
                return self.send_json({'error': str(error)}, 400)

        if route == '/api/shapecheck':
            # A test hook: the notes as the export would play them for this MIDI and plan, and the kicks
            # the pump follows, so the page can compare its own shaping note by note (SPEC v19, v20).
            try:
                midi_bytes = base64.b64decode(payload.get('midi') or '')
                return self.send_json(shape_check(midi_bytes, payload.get('plan') or {}, payload.get('window')))
            except Exception as error:  # noqa: BLE001 — a test hook says what went wrong
                return self.send_json({'error': f'{type(error).__name__}: {error}'}, 400)

        if route == '/api/export':
            out_dir = Path(payload.get('outDir') or DEFAULT_OUT).expanduser()
            if not out_dir.is_absolute():
                return self.send_json({'error': '输出目录要写完整路径'}, 400)
            try:
                out_dir.mkdir(parents=True, exist_ok=True)
            except OSError as error:
                return self.send_json({'error': f'建不了输出目录：{error}'}, 400)
            kits = payload.get('kits') or []
            if not kits and not payload.get('plan'):
                return self.send_json({'error': '一套音色都没勾'}, 400)
            try:
                midi_bytes = base64.b64decode(payload.get('midi') or '')
            except Exception:  # noqa: BLE001
                return self.send_json({'error': 'MIDI 数据损坏'}, 400)
            if not midi_bytes:
                return self.send_json({'error': '没有收到 MIDI'}, 400)
            job_id = uuid.uuid4().hex
            with JOBS_LOCK:
                JOBS[job_id] = {'progress': 0.0, 'message': '准备中', 'done': False}
            if payload.get('plan'):
                # The rebuild: one file as the plan says, with the stems of a library song if it is one.
                stems = {}
                if payload.get('song'):
                    try:
                        stems = library_song(payload['song'], self.server.library_extra)['stems']
                    except KeyError:
                        stems = {}
                listen = bool(payload.get('listen'))
                if listen:
                    out_dir = LISTEN
                    out_dir.mkdir(parents=True, exist_ok=True)
                threading.Thread(target=run_rebuild, daemon=True, args=(
                    job_id, midi_bytes, payload.get('name') or 'input.mid', payload['plan'], out_dir,
                    bool(payload.get('stems')) and not listen, payload.get('vocal'), stems, listen,
                    bool(payload.get('pack')) and not listen)).start()
                return self.send_json({'jobId': job_id})
            threading.Thread(target=run_job, daemon=True, args=(
                job_id, midi_bytes, payload.get('name') or 'input.mid', kits, out_dir,
                bool(payload.get('stems')), payload.get('vocal'))).start()
            return self.send_json({'jobId': job_id})

        if route == '/api/bye':
            return self.send_json({'ok': True})

        if route == '/api/open':
            # The launcher, started again with a MIDI while this studio is open, hands the file over.
            target = Path(str(payload.get('path') or ''))
            if target.suffix.lower() not in ('.mid', '.midi') or not target.is_file():
                return self.send_json({'error': '这不是一个 MIDI 文件'}, 400)
            self.server.opened_midi = str(target.resolve())
            self.server.opened_stamp = getattr(self.server, 'opened_stamp', 0) + 1
            return self.send_json({'ok': True})

        if route == '/api/cancel':
            try:
                vocals.cancel(payload.get('id', ''), payload.get('voice', ''))
                return self.send_json(vocals.status(payload['id']))
            except (ValueError, OSError, KeyError) as error:
                return self.send_json({'error': str(error)}, 400)

        if route == '/api/treat':
            try:
                return self.send_json(self.treat_answer(payload.get('vocal', ''), payload.get('voice', ''), payload.get('treat', ''), start=True))
            except (ValueError, FileNotFoundError) as error:
                return self.send_json({'error': str(error)}, 400)

        if route == '/api/swap':
            try:
                vocals.request(payload.get('id', ''), payload.get('voice', ''))
                return self.send_json(vocals.status(payload['id']))
            except (ValueError, OSError, KeyError) as error:
                return self.send_json({'error': str(error)}, 400)

        if route == '/api/reveal':
            target = Path(payload.get('path') or DEFAULT_OUT)
            if not target.exists():
                return self.send_json({'error': '这个目录还不存在'}, 404)
            try:
                os.startfile(str(target if target.is_dir() else target.parent))  # noqa: S606
                return self.send_json({'ok': True})
            except Exception as error:  # noqa: BLE001
                return self.send_json({'error': str(error)}, 500)

        return self.send_json({'error': '没有这个地址'}, 404)


def find_browser():
    """Edge or Chrome, for a window of its own (`--app`). None when neither is installed."""
    roots = [os.environ.get(name) for name in ('ProgramFiles(x86)', 'ProgramFiles', 'LocalAppData')]
    for tail in ('Microsoft/Edge/Application/msedge.exe', 'Google/Chrome/Application/chrome.exe'):
        for root in roots:
            if root and (Path(root) / tail).is_file():
                return Path(root) / tail
    return None


def studio_at(port):
    """Is a studio from this repository already serving on `port`?"""
    import urllib.request
    try:
        with urllib.request.urlopen(f'http://127.0.0.1:{port}/api/start', timeout=1.5) as response:
            return json.loads(response.read()).get('repo') == str(REPO)
    except (OSError, ValueError):
        return False


def app_window(url):
    """Open the studio in a window of its own and return the browser process.

    A profile of its own (in the cache) makes the browser process last exactly as long as
    the window, which is what lets the launcher stop the server when it closes."""
    import subprocess
    browser = find_browser()
    if browser is None:
        webbrowser.open(url)
        return None
    profile = REPO / 'work' / 'memesynth-cache' / 'browser'
    profile.mkdir(parents=True, exist_ok=True)
    return subprocess.Popen([str(browser), f'--app={url}', f'--user-data-dir={profile}', '--window-size=1320,900',
                             '--no-first-run', '--no-default-browser-check', '--disable-background-mode'])


def wait_for_pages(first=45.0, quiet=150.0, farewell=6.0, tick=2.0):
    """Return once nobody is using the server: the launcher's window-less process ends here.

    A page asks for something every few seconds while it is open and says goodbye when it
    closes. So: stop `farewell` seconds after a goodbye that nothing followed, or after
    `quiet` seconds of silence (a hidden window's timers may fire only once a minute), or
    after `first` seconds if no page ever came. Never while a voice is converting or a file
    is being written. Two looks in a row have to agree, so a machine waking from sleep is
    not mistaken for an empty room."""
    started, agreed = time.monotonic(), 0
    while agreed < 2:
        time.sleep(tick)
        now = time.monotonic()
        working = vocals.busy() or any(not job.get('done') for job in list(JOBS.values()))
        # Another window that has not said goodbye still counts while it was heard from within
        # `quiet`: a covered or minimised window may report only once a minute.
        others = any(now - seen < quiet for seen in list(PAGES.get('live', {}).values()))
        gone = PAGES['bye'] > PAGES['seen'] and now - PAGES['bye'] > farewell and not others
        silent = now - (PAGES['seen'] or started) > (quiet if PAGES['seen'] else first)
        agreed = agreed + 1 if (gone or silent) and not working else 0


def free_port(preferred=8777):
    for port in range(preferred, preferred + 40):
        with socket.socket() as probe:
            if probe.connect_ex(('127.0.0.1', port)) != 0:
                return port
    raise OSError('127.0.0.1 上找不到空闲端口')


def main(argv=None):
    argv = list(sys.argv[1:] if argv is None else argv)
    open_browser = '--no-browser' not in argv
    app = '--app' in argv                        # --app: a window of its own, and stop when it closes
    window = '--no-window' not in argv           # --no-window: app mode for a page opened by hand (tests)
    argv = [a for a in argv if a not in ('--no-browser', '--app', '--console', '--no-window')]
    extra = []                                   # --library <folder>: one more analysis folder to list songs from
    while '--library' in argv:
        at = argv.index('--library')
        extra += argv[at + 1:at + 2]
        del argv[at:at + 2]
    if '--plans' in argv:                        # --plans <folder>: keep plans somewhere else (the test instances)
        global PLANS
        at = argv.index('--plans')
        PLANS = Path(argv[at + 1])
        del argv[at:at + 2]
    if '--samples' in argv:                      # --samples <folder>: keep dropped samples somewhere else (the test instances)
        global SAMPLES
        at = argv.index('--samples')
        SAMPLES = Path(argv[at + 1])
        if not SAMPLES.is_absolute():
            SAMPLES = REPO / SAMPLES
        del argv[at:at + 2]
    preferred = 8777                             # --port <n>: a second studio beside one that is running
    if '--port' in argv:
        at = argv.index('--port')
        preferred = int(argv[at + 1])
        del argv[at:at + 2]
    opened = None
    if argv and Path(argv[0]).is_file():
        opened = str(Path(argv[0]).resolve())
    if not any(KITS_DIR.glob('*/kit.json')):
        raise SystemExit('音色库还没构建：先跑 source/memesynth/tools/make_kits.py all')
    if app and studio_at(preferred):
        # Double-clicked again: one studio is enough, so this only brings up a window on it,
        # and hands it the MIDI if one was dropped on the launcher.
        if opened:
            import urllib.request
            request = urllib.request.Request(f'http://127.0.0.1:{preferred}/api/open',
                                             data=json.dumps({'path': opened}).encode('utf-8'),
                                             headers={'Content-Type': 'application/json'})
            try:
                urllib.request.urlopen(request, timeout=5).close()
            except OSError as error:
                print(f'没能把文件交给已经开着的工作台：{error}')
        if window:
            app_window(f'http://127.0.0.1:{preferred}/')
        return 0
    port = free_port(preferred)
    server = ThreadingHTTPServer(('127.0.0.1', port), Handler)
    server.opened_midi = opened
    server.opened_stamp = 1 if opened else 0
    server.library_extra = extra
    url = f'http://127.0.0.1:{port}/'
    print(f'音色工作台已启动：{url}')
    print(f'输出目录默认：{DEFAULT_OUT}')
    if opened:
        print(f'已带入文件：{opened}')
    if app:
        threading.Thread(target=server.serve_forever, daemon=True).start()
        if window:
            app_window(url)
        wait_for_pages()
        server.shutdown()
        print('没有页面在用了，停止。')
        return 0
    print('关掉这个窗口就停止。')
    if open_browser:
        threading.Timer(0.6, lambda: webbrowser.open(url)).start()
    else:
        print('（--no-browser：自己打开上面那个地址）')
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        print('\n停止。')
    return 0


def report_fatal(text):
    """A double-clicked studio that cannot start has no console to say so: say it in a box."""
    print(text, file=sys.stderr)
    if '--app' in sys.argv:
        try:
            import ctypes
            ctypes.windll.user32.MessageBoxW(None, f'{text}\n\n详情在 {LOG}', '音色工作台没能启动', 0x10)
        except Exception:  # noqa: BLE001 — not Windows, or no desktop: the log has it
            pass


if __name__ == '__main__':
    try:
        code = main()
    except SystemExit as stop:
        if stop.code not in (0, None):
            report_fatal(str(stop.code))
        raise
    except Exception as error:  # noqa: BLE001
        traceback.print_exc()
        report_fatal(f'{type(error).__name__}: {error}')
        raise SystemExit(1)
    raise SystemExit(code)
