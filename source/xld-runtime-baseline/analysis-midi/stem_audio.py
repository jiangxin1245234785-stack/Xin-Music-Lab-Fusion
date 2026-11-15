"""Stem audio in either of the two formats an analysis root holds (2026-11-15, audit fix 2).

- 32-bit float WAV: every stem and refinement file written before the change.
- 24-bit FLAC written at half level and marked inside the file with the Vorbis comment ``comment=xld-gain=2``
  (manifests say ``encoding: "flac-24", gain: 2``). A float stem may go above full scale and 24-bit integers cannot,
  so samples are halved before writing and doubled again by every reader. The error this leaves is at most 2**-23
  (half a step of 24-bit after doubling).

Readers use :func:`read` (soundfile.read with the gain applied) or, where an engine opens the file itself,
:func:`decoded`, which yields a path to a float WAV with the gain applied (the file itself when no gain is needed,
otherwise a temporary copy in the system temp folder, removed afterwards - never inside the analysis root).
Writers use :func:`write_stem`.
"""
from __future__ import annotations

import contextlib
import os
import tempfile
from pathlib import Path

GAIN_TAG = 'xld-gain='
FLAC_GAIN = 2
ENCODING_FLAC = 'flac-24'
ENCODING_WAV = 'wav-float32'
LIMIT = 2.0 ** -23


def gain_of(path) -> float:
    """The gain the file was marked with (1 for a WAV or an unmarked FLAC)."""
    path = Path(path)
    if path.suffix.lower() != '.flac':
        return 1.0
    import soundfile as sf
    with sf.SoundFile(str(path)) as handle:
        comment = (handle.comment or '').strip()
    if comment.startswith(GAIN_TAG):
        value = float(comment[len(GAIN_TAG):])
        if not 0 < value <= 16:
            raise ValueError('无效的分轨增益标记')
        return value
    return 1.0


def read(path, **kwargs):
    """soundfile.read with the stem's gain applied. Same arguments and return value."""
    import soundfile as sf
    data, rate = sf.read(str(path), **kwargs)
    gain = gain_of(path)
    if gain != 1:
        data = data * data.dtype.type(gain) if hasattr(data, 'dtype') and data.dtype.kind == 'f' else data * gain
    return data, rate


def info(path):
    import soundfile as sf
    return sf.info(str(path))


@contextlib.contextmanager
def decoded(path):
    """A path to read as a plain float WAV: the file itself when it needs no gain, else a temporary decoded copy."""
    path = Path(path)
    if gain_of(path) == 1:
        yield path
        return
    import soundfile as sf
    handle, name = tempfile.mkstemp(prefix='xld-stem-', suffix='.wav')
    os.close(handle)
    try:
        with sf.SoundFile(str(path)) as source, sf.SoundFile(name, 'w', source.samplerate, source.channels, 'FLOAT', format='WAV') as target:
            gain = gain_of(path)
            for block in source.blocks(blocksize=1 << 18, dtype='float32', always_2d=True):
                target.write(block * gain)
        yield Path(name)
    finally:
        with contextlib.suppress(OSError):
            os.remove(name)


def write_stem(path, data, rate):
    """Writes ``data`` (frames x channels float, any level) as a marked 24-bit FLAC at half level. Returns the manifest
    fields to record for it: ``{"encoding": "flac-24", "gain": 2}``."""
    import numpy as np
    import soundfile as sf
    path = Path(path)
    if path.suffix.lower() != '.flac':
        raise ValueError('分轨应写成 .flac')
    data = np.asarray(data, dtype=np.float32)
    if data.ndim == 1:
        data = data[:, None]
    half = data * np.float32(1 / FLAC_GAIN)
    if not np.isfinite(half).all() or float(np.abs(half).max(initial=0)) >= 1:
        raise ValueError('分轨采样超出可写范围')
    with sf.SoundFile(str(path), 'w', int(rate), data.shape[1], 'PCM_24', format='FLAC') as handle:
        handle.comment = GAIN_TAG + str(FLAC_GAIN)
        handle.write(half)
    return {'encoding': ENCODING_FLAC, 'gain': FLAC_GAIN}


def check_written(path, frames, channels, rate) -> bool:
    """A file this module wrote (or a legacy float WAV) with the expected shape."""
    import soundfile as sf
    try:
        meta = sf.info(str(path))
    except Exception:
        return False
    if meta.frames != frames or meta.channels != channels or meta.samplerate != rate:
        return False
    if Path(path).suffix.lower() == '.flac':
        return meta.format == 'FLAC' and meta.subtype == 'PCM_24' and gain_of(path) == FLAC_GAIN
    return meta.format == 'WAV' and meta.subtype == 'FLOAT'


def _jobs(command, jobs_file):
    """Batch work for scripts/migrate-stems.cjs; one JSON line per job on stdout.

    encode: {"wav", "flac"} - write the WAV as a marked FLAC at "flac" and read it back: frames, channels and rate
            equal, largest difference from the WAV at most LIMIT (2**-23).
    decode: {"flac", "wav", "mtimeNs"} - write the FLAC back as a float WAV (as the runners wrote stems) with the
            given modification time."""
    import json
    import numpy as np
    import soundfile as sf
    for job in json.loads(Path(jobs_file).read_text(encoding='utf-8')):
        try:
            if command == 'encode':
                source, rate = sf.read(job['wav'], dtype='float32', always_2d=True)
                peak = float(np.abs(source).max(initial=0))
                write_stem(job['flac'], source, rate)
                back, back_rate = read(job['flac'], dtype='float32', always_2d=True)
                error = float(np.abs(back - source).max(initial=0)) if back.shape == source.shape else None
                ok = back.shape == source.shape and back_rate == rate and error is not None and error <= LIMIT
                print(json.dumps({'job': job, 'ok': ok, 'frames': len(source), 'channels': source.shape[1], 'rate': rate,
                                  'peak': peak, 'maxError': error}), flush=True)
            elif command == 'decode':
                data, rate = read(job['flac'], dtype='float32', always_2d=True)
                sf.write(job['wav'], data, rate, subtype='FLOAT', format='WAV')
                os.utime(job['wav'], ns=(int(job['mtimeNs']), int(job['mtimeNs'])))
                print(json.dumps({'job': job, 'ok': True, 'frames': len(data)}), flush=True)
            else:
                raise ValueError('unknown command ' + command)
        except Exception as error:  # one job failing must not hide the others' results
            print(json.dumps({'job': job, 'ok': False, 'error': str(error)}), flush=True)


if __name__ == '__main__':
    import sys
    _jobs(sys.argv[1], sys.argv[2])
