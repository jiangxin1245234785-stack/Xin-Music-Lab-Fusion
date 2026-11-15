"""XLD's separated stems, in either format XLD keeps them (2026-11-15). Read-only.

Not an import of XLD's code: the same rule as XLD's `analysis-midi/stem_audio.py`, written out here.
- A 32-bit float WAV is read as it is.
- A 24-bit FLAC that XLD wrote at half level carries the comment `xld-gain=2` (its `stems.json`
  entry says `encoding: "flac-24", gain: 2`); the reader multiplies by that gain, or the stem is
  6 dB low. An unmarked FLAC has gain 1. The result differs from the original WAV by <= 2**-23.

Needs only soundfile (and numpy under it), so it runs under every env voiceswap uses (highres, roformer).
"""
import json
from pathlib import Path

GAIN_TAG = 'xld-gain='
SUFFIXES = ('.wav', '.flac')


def gain_of(path):
    """The gain a stem file was marked with: 1 for a WAV or an unmarked FLAC."""
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
        data = data * data.dtype.type(gain) if data.dtype.kind == 'f' else data * gain
    return data, rate


def run_stems(run_dir):
    """{stem name: path} for one XLD separation run folder (`stems/<run id>/`).

    A stem is `<name>.wav` or `<name>.flac`. When both are there (a migration that has not deleted the WAV
    yet), the one the song's `stems.json` lists for this run wins, else the WAV."""
    run_dir = Path(run_dir)
    listed = {}
    manifest = run_dir.parent.parent / 'stems.json'
    try:
        data = json.loads(manifest.read_text(encoding='utf-8'))
        if data.get('runId') == run_dir.name:
            listed = {entry['name']: (run_dir.parent.parent / entry['file']).resolve()
                      for entry in data.get('stems') or [] if entry.get('name') and entry.get('file')}
    except (OSError, ValueError, AttributeError, TypeError, KeyError):
        listed = {}
    found = {}
    for suffix in SUFFIXES:
        for path in sorted(run_dir.glob(f'*{suffix}')):
            name = path.stem
            if name not in found or listed.get(name) == path.resolve():
                found[name] = path
    return found
