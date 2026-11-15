"""Makes the stem-audio fixtures (run once; the outputs are committed):
  source.wav     half a second of float stereo with silence, a constant, tones, noise, equal channels and samples
                 above full scale (so the encoder uses constant / verbatim / fixed / LPC subframes and the stereo modes)
  marked.flac    source.wav through stem_audio.write_stem (24-bit, half level, comment xld-gain=2)
  plain.flac     a short 16-bit FLAC with no mark (an ordinary FLAC file, like an original song)
   python -I make.py"""
import sys
from pathlib import Path
HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE.parents[2] / 'analysis-midi'))
import numpy as np
import soundfile as sf
import stem_audio

rate = 44100
n = rate // 2
t = np.arange(n) / rate
rng = np.random.default_rng(20261115)
left = np.zeros(n, np.float32)
right = np.zeros(n, np.float32)
# 0.00-0.05 silence; 0.05-0.10 a constant; 0.10-0.20 a tone, equal channels; 0.20-0.30 chirp + noise, different
# channels; 0.30-0.40 drums-like bursts over full scale; 0.40-0.50 noise only.
def span(a, b):
    return slice(int(a * rate), int(b * rate))
left[span(0.05, 0.10)] = right[span(0.05, 0.10)] = 0.25
tone = 0.6 * np.sin(2 * np.pi * 440 * t[span(0.10, 0.20)])
left[span(0.10, 0.20)] = right[span(0.10, 0.20)] = tone
chirp = 0.5 * np.sin(2 * np.pi * (200 + 3000 * t[span(0.20, 0.30)]) * t[span(0.20, 0.30)])
left[span(0.20, 0.30)] = chirp + 0.05 * rng.standard_normal(chirp.size)
right[span(0.20, 0.30)] = 0.7 * chirp + 0.05 * rng.standard_normal(chirp.size)
burst = np.exp(-40 * (t[span(0.30, 0.40)] % 0.025) / 0.025) * rng.standard_normal(int(0.1 * rate)) * 0.9
left[span(0.30, 0.40)] = burst
right[span(0.30, 0.40)] = -burst * 0.95
left[span(0.40, 0.50)] = 0.3 * rng.standard_normal(n - int(0.4 * rate))
right[span(0.40, 0.50)] = 0.2 * rng.standard_normal(n - int(0.4 * rate))
data = np.stack([left, right], axis=1).astype(np.float32)
data = np.clip(data, -1.9, 1.9)
print('peak', float(np.abs(data).max()))
sf.write(str(HERE / 'source.wav'), data, rate, subtype='FLOAT', format='WAV')
stem_audio.write_stem(HERE / 'marked.flac', data, rate)
sf.write(str(HERE / 'plain.flac'), (data[int(0.2 * rate):int(0.2 * rate) + 2205] * 0.4), rate, subtype='PCM_16', format='FLAC')
back, _ = stem_audio.read(HERE / 'marked.flac', dtype='float32', always_2d=True)
print('max error', float(np.abs(back - data).max()), 'limit', stem_audio.LIMIT)
