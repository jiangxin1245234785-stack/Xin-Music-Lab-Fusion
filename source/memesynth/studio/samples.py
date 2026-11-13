"""The user's own samples (SPEC v26): a wav dragged onto a track, kept once, played by the score.

A sample is stored under its own number, the first 16 hex digits of the sha256 of the bytes as they
came in: `<folder>/<id>/sample.wav` (48 kHz, its own channels up to two, 32-bit float, converted by the
export's resampler so the page and the export read the same numbers) and `info.json` beside it.

How it plays is written into a plan entry as `sample` and turned into an ordinary kit here (`kit_json`),
so the renderer and the kit loader stay exactly as they are.
"""
from __future__ import annotations

import hashlib
import io
import json
import math
import re
from pathlib import Path

import numpy as np
import soundfile

from studio import batch

ROOT = Path(__file__).resolve().parents[1]
REPO = ROOT.parents[1]
FOLDER = REPO / 'work' / 'memesynth-cache' / 'samples'   # the server's default; test instances use another
RATE = batch.SAMPLE_RATE
MAX_SECONDS = 20.0
MAX_BYTES = 50 * 1024 * 1024
SILENT = 10.0 ** (-60 / 20)                     # a file whose peak is under −60 dBFS holds nothing
ROOT_LIMITS = (30.0, 5000.0)
DB_LIMITS = (-24.0, 24.0)
PITCHED = ('bass', 'guitar', 'piano', 'other')
PARTS = {'kick': ('drums/kick',), 'snare': ('drums/snare',),
         'cymbal': ('drums/hihat', 'drums/openhat', 'drums/ride', 'drums/crash')}
PART_ZH = {'kick': '底鼓', 'snare': '军鼓', 'cymbal': '镲'}
#: The route whose material a pitched track's sample is matched against: the track's own route in every kit.
MAIN_ROUTE = {'bass': 'bass', 'guitar': 'guitar', 'piano': 'piano', 'other': 'strings'}
NAMES = ('C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B')
ID = re.compile(r'^[0-9a-f]{16}$')


class SampleError(ValueError):
    """A file that is not taken, with one sentence saying why."""


def measured_root(audio, rate, fmin=35.0, fmax=5000.0):
    """Period by autocorrelation, skipping the lag-0 lobe and preferring the first real peak. None when there is none.

    rootHz is the one field in a kit that nothing else can catch: the renderer divides the
    target pitch by it, so a sample labelled 220 Hz that is really 440 plays every note an
    octave out and every other measurement still looks correct. (Moved here from
    tests/test_memesynth.py unchanged.)
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


def note_of(hz):
    """('A2', +12): the nearest equal-tempered note (A4 = 440 Hz) and how far off, in whole cents."""
    midi = 69.0 + 12.0 * math.log2(hz / 440.0)
    nearest = int(math.floor(midi + 0.5))
    return f'{NAMES[nearest % 12]}{nearest // 12 - 1}', int(math.floor(100.0 * (midi - nearest) + 0.5))


def note_hz(name):
    """The equal-tempered Hz of a note name such as 'A2' or 'C#3' (A4 = 440)."""
    match = re.fullmatch(r'([A-G]#?)(-?\d+)', str(name))
    if not match or match.group(1) not in NAMES:
        raise ValueError(f'不认识的音名：{name}')
    midi = NAMES.index(match.group(1)) + 12 * (int(match.group(2)) + 1)
    return 440.0 * 2.0 ** ((midi - 69) / 12.0)


def mono(audio):
    """The sample as the kit loader hears it: channels averaged in float32 (`kit.load_sample_audio`)."""
    audio = np.asarray(audio, dtype=np.float32)
    return audio if audio.ndim == 1 else np.ascontiguousarray(audio.mean(axis=1), dtype=np.float32)


def head_rms(audio):
    """RMS of the first second (all of it when shorter), mono: the loudness a replacement is matched by."""
    head = np.asarray(audio, dtype=np.float64)[:RATE]
    return float(np.sqrt(np.mean(np.square(head)))) if head.size else 0.0


def valid_id(sample_id):
    return isinstance(sample_id, str) and bool(ID.match(sample_id))


def path_of(folder, sample_id):
    """The stored wav for a number, or None when the number is not a number or nothing is stored under it."""
    if not valid_id(sample_id):
        return None
    path = Path(folder) / sample_id / 'sample.wav'
    return path if path.is_file() else None


def known(folder):
    """The numbers that have a stored wav, sorted."""
    folder = Path(folder)
    if not folder.is_dir():
        return []
    return sorted(p.name for p in folder.iterdir() if valid_id(p.name) and (p / 'sample.wav').is_file())


def info(folder, sample_id):
    path = path_of(folder, sample_id)
    if path is None:
        return None
    try:
        return json.loads((path.parent / 'info.json').read_text(encoding='utf-8'))
    except (OSError, ValueError):
        return None


def store(data, name, folder):
    """Keep the bytes of a dropped file as a sample. Returns (info, whether it was there already).
    Raises SampleError with one sentence when the file is not taken."""
    if len(data) > MAX_BYTES:
        raise SampleError(f'文件 {len(data) / 1048576:.0f} MB，采样最大 50 MB')
    sample_id = hashlib.sha256(data).hexdigest()[:16]
    folder = Path(folder)
    found = info(folder, sample_id)
    if found is not None:
        return dict(found, id=sample_id), True
    try:
        described = soundfile.info(io.BytesIO(data))
    except Exception:  # noqa: BLE001 — libsndfile says only that it cannot read it
        raise SampleError('这不是 WAV 文件，采样只收 wav') from None
    if described.format not in ('WAV', 'WAVEX'):
        raise SampleError(f'这是 {described.format} 文件，采样只收 wav')
    if described.frames <= 0:
        raise SampleError('这个 wav 是空的')
    seconds = described.frames / described.samplerate
    if seconds > MAX_SECONDS:
        raise SampleError(f'这个采样 {seconds:.1f} 秒，最长 20 秒；剪短再拖')
    audio, rate = soundfile.read(io.BytesIO(data), dtype='float32', always_2d=True)
    audio = audio[:, :2]
    if not np.isfinite(audio).all():
        raise SampleError('这个 wav 里有坏的采样值（不是有限数）')
    if float(np.abs(audio).max()) < SILENT:
        raise SampleError('这个文件全是静音（峰值低于 −60 dBFS）')
    channels = audio.shape[1]
    converted = batch.to_48k(audio, rate)[:, :channels]      # to_48k makes two of one; a mono file stays mono
    heard = mono(converted)
    root = measured_root(heard, RATE)
    record = {'name': str(name or 'sample.wav'), 'seconds': round(len(converted) / RATE, 3), 'channels': channels,
              'frames': len(converted), 'rootHz': round(root, 3) if root else None}
    if root:
        record['note'], record['cents'] = note_of(root)
    target = folder / sample_id
    target.mkdir(parents=True, exist_ok=True)
    scratch = target / 'sample.tmp.wav'
    soundfile.write(str(scratch), converted, RATE, subtype='FLOAT', format='WAV')
    (target / 'info.json').write_text(json.dumps(record, ensure_ascii=False, indent=1), encoding='utf-8')
    scratch.replace(target / 'sample.wav')                  # last: a half-written folder never counts as stored
    return dict(record, id=sample_id), False


def matched_db(heard, kit, track, part=None):
    """The gain (dB) that puts a sample near the sound it replaces in `kit` (a loaded memesynth Kit): the head RMS
    of the replaced material over the sample's, plus that voice's own gain; clamped to ±24, to 0.1 dB.
    The replaced sound is the track's main route, or for the drums the first route of the part (cymbal: hihat)."""
    route = PARTS[part][0] if track == 'drums' else MAIN_ROUTE[track]
    voice = kit.resolve(route)
    own = head_rms(heard)
    if voice is None or own <= 0:
        return 0.0
    theirs = head_rms(kit.samples[voice.sample].audio)
    value = (20.0 * math.log10(theirs / own) if theirs > 0 else DB_LIMITS[0]) + 20.0 * math.log10(max(voice.gain, 1e-6))
    value = max(DB_LIMITS[0], min(DB_LIMITS[1], value))
    return math.floor(value * 10.0 + 0.5) / 10.0


def is_number(value):
    return not isinstance(value, bool) and isinstance(value, (int, float)) and math.isfinite(value)


def clean(value, track):
    """A plan entry's `sample`, checked (SPEC v26 §3; the page's `cleanSample` is the same rule), or None.
    A missing key, a number out of range or a part it does not know drops the whole thing; the vocal never has one.
    Whether the file is there is not looked at here."""
    if track == 'vocals' or track not in (*PITCHED, 'drums') or not isinstance(value, dict):
        return None
    sample_id, name, db = value.get('id'), value.get('name'), value.get('db')
    if not valid_id(sample_id) or not isinstance(name, str) or not is_number(db) or not DB_LIMITS[0] <= db <= DB_LIMITS[1]:
        return None
    if track == 'drums':
        part = value.get('part')
        return {'id': sample_id, 'name': name, 'part': part, 'db': db} if part in PARTS else None
    root = value.get('root')
    if not is_number(root) or not ROOT_LIMITS[0] <= root <= ROOT_LIMITS[1]:
        return None
    return {'id': sample_id, 'name': name, 'root': root, 'db': db}


def kit_json(sample, track, routes, folder, base_dir=None):
    """The kit that plays a track with its sample, as kit.json data (every `file` absolute).

    A pitched track: the sample alone, on every route of the track in this song (`routes`), following the notes.
    The drums: the base kit (`base_dir`, a built kit's folder) with the sample put in place of one part."""
    file = str((Path(folder) / sample['id'] / 'sample.wav').resolve())
    gain = 10.0 ** (sample['db'] / 20.0)
    if track != 'drums':
        voice = {'sample': '@sample', 'follow': 'note', 'fade': 0.01, 'pan': 0.0, 'gain': gain}
        return {'name': 'sample', 'samples': {'@sample': {'file': file, 'rootHz': sample['root']}},
                'voices': {route: dict(voice) for route in routes}}
    from memesynth.kit import load_kit
    base_dir = Path(base_dir)
    data = json.loads((base_dir / 'kit.json').read_text(encoding='utf-8'))
    base = load_kit(base_dir / 'kit.json', sample_rate=RATE)          # for the pans as the base kit resolves them
    samples = {}
    for key, entry in data['samples'].items():
        entry = dict(entry) if isinstance(entry, dict) else {'file': entry}
        if not Path(entry['file']).is_absolute():
            entry['file'] = str((base_dir / entry['file']).resolve())
        samples[key] = entry
    samples['@sample'] = {'file': file, 'rootHz': 440.0}            # never pitched: the root is only for the loader
    voices = dict(data['voices'])
    for route in PARTS[sample['part']]:
        replaced = base.resolve(route)
        voices[route] = {'sample': '@sample', 'pitched': False, 'follow': 'sample', 'gain': gain,
                         'pan': replaced.pan if replaced is not None else 0.0}
    return {'name': f'{data.get("name") or base_dir.name} + sample', 'samples': samples, 'voices': voices}
