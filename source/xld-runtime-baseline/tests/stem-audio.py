"""Audit fix 2 (2026-11-15): analysis-midi/stem_audio.py, the one way Python writes and reads stems.
   python -I tests/stem-audio.py        (any runtime env with numpy + soundfile; writes only to a temp folder)"""
import json
import os
import subprocess
import sys
import tempfile
from pathlib import Path

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE.parent / 'analysis-midi'))
import numpy as np
import soundfile as sf
import stem_audio

rng = np.random.default_rng(7)
rate = 44100
data = (rng.standard_normal((rate, 2)) * 0.4).astype(np.float32)
data[1000:1100] = 1.7          # above full scale, as drum stems are
data[2000:2010, 1] = -1.95

with tempfile.TemporaryDirectory() as scratch:
    scratch = Path(scratch)
    flac = scratch / 'drums.flac'
    fields = stem_audio.write_stem(flac, data, rate)
    assert fields == {'encoding': 'flac-24', 'gain': 2}, fields
    assert stem_audio.gain_of(flac) == 2
    meta = sf.info(str(flac))
    assert (meta.format, meta.subtype, meta.frames, meta.channels) == ('FLAC', 'PCM_24', rate, 2)
    back, back_rate = stem_audio.read(flac, dtype='float32', always_2d=True)
    assert back_rate == rate and back.shape == data.shape
    error = float(np.abs(back - data).max())
    assert error <= stem_audio.LIMIT, error
    assert float(np.abs(back).max()) > 1.9, 'samples above 1 survive'
    raw, _ = sf.read(str(flac), dtype='float32', always_2d=True)
    assert float(np.abs(raw).max()) < 1, 'the file itself holds half level'
    assert stem_audio.check_written(flac, rate, 2, rate)
    assert not stem_audio.check_written(flac, rate + 1, 2, rate), 'a different length is not this stem'

    # decoded(): a float WAV with the gain applied, outside the analysis folder, removed afterwards.
    with stem_audio.decoded(flac) as path:
        assert path != flac and path.suffix == '.wav' and not str(path).startswith(str(scratch))
        wav, _ = sf.read(str(path), dtype='float32', always_2d=True)
        assert sf.info(str(path)).subtype == 'FLOAT'
        assert float(np.abs(wav - data).max()) <= stem_audio.LIMIT
        kept = path
    assert not kept.exists(), 'the temporary copy is gone'
    plain = scratch / 'old.wav'
    sf.write(str(plain), data, rate, subtype='FLOAT')
    with stem_audio.decoded(plain) as path:
        assert path == plain, 'a WAV stem is read as it is'
    assert stem_audio.gain_of(plain) == 1
    unmarked = scratch / 'song.flac'
    sf.write(str(unmarked), data * 0.5, rate, subtype='PCM_16', format='FLAC')
    assert stem_audio.gain_of(unmarked) == 1, 'an ordinary FLAC has no gain'
    assert not stem_audio.check_written(unmarked, rate, 2, rate), 'and is not a stem'

    # Too loud even at half level: refused, nothing written.
    loud = data.copy(); loud[5] = 2.5
    try:
        stem_audio.write_stem(scratch / 'loud.flac', loud, rate)
        raise AssertionError('a sample at 2.5 must be refused')
    except ValueError:
        pass
    assert not (scratch / 'loud.flac').exists()
    try:
        stem_audio.write_stem(scratch / 'x.wav', data, rate)
        raise AssertionError('only .flac')
    except ValueError:
        pass

    # The batch commands the migration tool uses.
    source = scratch / 'bass.wav'
    sf.write(str(source), data, rate, subtype='FLOAT')
    jobs = scratch / 'jobs.json'
    jobs.write_text(json.dumps([{'wav': str(source), 'flac': str(scratch / 'bass.partial.flac')}, {'wav': str(scratch / 'missing.wav'), 'flac': str(scratch / 'm.flac')}]))
    out = subprocess.run([sys.executable, '-I', str(HERE.parent / 'analysis-midi' / 'stem_audio.py'), 'encode', str(jobs)], capture_output=True, text=True, check=True)
    rows = [json.loads(line) for line in out.stdout.splitlines() if line.strip()]
    assert rows[0]['ok'] and rows[0]['maxError'] <= stem_audio.LIMIT and rows[0]['peak'] > 1.9, rows[0]
    assert not rows[1]['ok'], 'one failing job is reported, the others still run'
    mtime = 1_700_000_000_123_456_700  # NTFS keeps 100 ns steps
    jobs.write_text(json.dumps([{'flac': str(scratch / 'bass.partial.flac'), 'wav': str(scratch / 'bass.back.wav'), 'mtimeNs': str(mtime)}]))
    out = subprocess.run([sys.executable, '-I', str(HERE.parent / 'analysis-midi' / 'stem_audio.py'), 'decode', str(jobs)], capture_output=True, text=True, check=True)
    assert json.loads(out.stdout.splitlines()[0])['ok']
    restored = scratch / 'bass.back.wav'
    assert os.stat(restored).st_mtime_ns == mtime, 'the old modification time comes back'
    assert os.stat(restored).st_size == os.stat(source).st_size, 'a decoded WAV has the size the runner wrote'
    wav, _ = sf.read(str(restored), dtype='float32', always_2d=True)
    assert float(np.abs(wav - data).max()) <= stem_audio.LIMIT

print('stem_audio.py: ok (write / read within 2^-23 with samples to 1.95, half level in the file, decoded() temp copy removed, WAV and unmarked FLAC untouched, 2.5 refused, batch encode / decode with old mtime and same WAV size)')
