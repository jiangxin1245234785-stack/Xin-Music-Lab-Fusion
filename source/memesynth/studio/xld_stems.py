"""XLD's separated stems as the studio reads them, in either format XLD keeps them (2026-11-15).

Read-only, and on purpose not an import of XLD's code: this is the same rule XLD's own
`analysis-midi/stem_audio.py` follows, written out again here so memesynth stays standalone.

- A 32-bit float WAV: read as it is.
- A 24-bit FLAC that XLD wrote at half level, marked inside the file with the comment
  `xld-gain=2` (its `stems.json` entry also says `encoding: "flac-24", gain: 2`). Every reader
  multiplies by that gain again; without it the stem plays 6 dB low. An unmarked FLAC has gain 1.
  What comes back differs from the original float WAV by at most 2**-23.

Where a stem is: the `file` of its entry in the song's `stems.json`, else `<name>.wav` or
`<name>.flac` in the run folder.
"""
from __future__ import annotations

import io
import json
from pathlib import Path

GAIN_TAG = 'xld-gain='
SUFFIXES = ('.wav', '.flac')


def _gain_from_comment(comment) -> float:
    comment = (comment or '').strip()
    if comment.startswith(GAIN_TAG):
        value = float(comment[len(GAIN_TAG):])
        if not 0 < value <= 16:
            raise ValueError('无效的分轨增益标记')
        return value
    return 1.0


def gain_of(path) -> float:
    """The gain a stem file was marked with: 1 for a WAV or an unmarked FLAC."""
    path = Path(path)
    if path.suffix.lower() != '.flac':
        return 1.0
    import soundfile
    with soundfile.SoundFile(str(path)) as handle:
        return _gain_from_comment(handle.comment)


def read(path, **kwargs):
    """soundfile.read with the stem's gain applied. Same arguments and return value."""
    import soundfile
    data, rate = soundfile.read(str(path), **kwargs)
    gain = gain_of(path)
    if gain != 1:
        data = data * data.dtype.type(gain) if data.dtype.kind == 'f' else data * gain
    return data, rate


def is_marked_flac(data: bytes) -> bool:
    """These bytes are a FLAC carrying XLD's gain mark."""
    if data[:4] != b'fLaC':
        return False
    import soundfile
    try:
        with soundfile.SoundFile(io.BytesIO(data)) as handle:
            return handle.format == 'FLAC' and (handle.comment or '').strip().startswith(GAIN_TAG)
    except RuntimeError:
        return False


def flac_to_wav_bytes(data: bytes) -> bytes:
    """A FLAC stem's bytes as a 32-bit float WAV with its gain applied (what XLD wrote before it kept FLAC)."""
    import numpy as np
    import soundfile
    with soundfile.SoundFile(io.BytesIO(data)) as handle:
        gain = _gain_from_comment(handle.comment)
        rate = handle.samplerate
        audio = handle.read(dtype='float32', always_2d=True)
    out = io.BytesIO()
    soundfile.write(out, audio * np.float32(gain), rate, format='WAV', subtype='FLOAT')
    return out.getvalue()


def find(run_dir, name):
    """`<name>.wav` or `<name>.flac` in a run folder (the WAV first, when both are there), or None."""
    for suffix in SUFFIXES:
        path = Path(run_dir) / f'{name}{suffix}'
        if path.is_file():
            return path
    return None


def listed(folder):
    """{stem name: path} for every stem the song's `stems.json` lists with a `file` that is on disk."""
    manifest = Path(folder) / 'stems.json'
    try:
        entries = json.loads(manifest.read_text(encoding='utf-8')).get('stems') or []
    except (OSError, ValueError, AttributeError):
        return {}
    found = {}
    for entry in entries if isinstance(entries, list) else []:
        if not isinstance(entry, dict) or not entry.get('name') or not entry.get('file'):
            continue
        path = Path(folder) / entry['file']
        if path.suffix.lower() in SUFFIXES and path.is_file():
            found[entry['name']] = path
    return found
