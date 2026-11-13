"""The vocal's second tier (SPEC v27): a vocoder, an octave up or down, tape wobble, a bit crusher.

Every treatment works on the whole sung vocal at once, here in Python, and the result is cached
(`vocals.treated`): the page plays that file and the export mixes the same file, so the two cannot
drift apart and no DSP is written twice. The parameters are fixed; a change of parameters is a new
`VERSION`, which is part of the cached file's name.

librosa and scipy are imported only inside the functions that need them, so the server starts as
fast as before and a vocal that is not treated never loads them.

Pitch shifting does not keep the formants: an octave up sounds small, an octave down sounds big.
That is the sound asked for (SPEC v27), not a defect.
"""
from __future__ import annotations

import math

import numpy as np

RATE = 48000
VERSION = 'v1'
CEILING = 0.999                                 # just under full scale: a 24-bit file cannot hold 1.0 itself
#: name → the words on the page
NAMES = {'none': '不处理', 'vocoder': '声码器', 'octave_up': '升八度', 'octave_down': '降八度加失真',
         'tape_light': '走带 · 轻', 'tape_deep': '走带 · 重', 'crush_11k': '降位数 · 11k', 'crush_8k': '降位数 · 8k',
         'crush_6k': '降位数 · 6k'}
CRUSH = {'crush_11k': (11025, 6), 'crush_8k': (8000, 8), 'crush_6k': (6000, 5)}            # hold rate, bits
TAPE = {'tape_light': ((0.8, 12.0), (6.0, 4.0)), 'tape_deep': ((0.35, 30.0),)}             # (Hz, ± cents) each


def rms(audio):
    audio = np.asarray(audio, dtype=np.float64)
    return float(np.sqrt(np.mean(np.square(audio)))) if audio.size else 0.0


# --- the treatments: mono float at RATE in, mono float out, the same length ------------------------------

def octave(audio, steps, drive=0.0):
    """`steps` semitones, the duration kept (librosa's phase vocoder + resampling; formants move with the pitch).
    With `drive`, a soft clip tanh(drive·x)/tanh(drive) after."""
    import librosa
    out = librosa.effects.pitch_shift(np.asarray(audio, dtype=np.float32), sr=RATE, n_steps=steps)
    out = np.asarray(out, dtype=np.float64)
    if drive:
        out = np.tanh(drive * out) / math.tanh(drive)
    return out


def tape(audio, wobbles):
    """Pitch that drifts and comes back, the duration kept: a delay line whose delay swings around 0.
    A delay d(t) = A·sin(2πft) plays at 1 − d′(t) times the speed, so ±c cents at f Hz takes A = (2^(c/1200) − 1) / (2πf).
    The delay is centred on 0 (it reads a little ahead as often as behind), so nothing moves against the band."""
    audio = np.asarray(audio, dtype=np.float64)
    t = np.arange(audio.size) / RATE
    delay = np.zeros(audio.size)
    for hz, cents in wobbles:
        delay += (2.0 ** (cents / 1200.0) - 1.0) / (2.0 * math.pi * hz) * np.sin(2.0 * math.pi * hz * t)
    position = np.clip(np.arange(audio.size) - delay * RATE, 0.0, audio.size - 1.0)
    return np.interp(position, np.arange(audio.size, dtype=np.float64), audio)


def crush(audio, hold_rate, bits):
    """Sample-and-hold to `hold_rate` (each value held for RATE / hold_rate samples), then `bits`-bit levels over ±1."""
    audio = np.asarray(audio, dtype=np.float64)
    # float64 positions: numpy's default integer is 32-bit on Windows, and n · hold_rate overflows it after ~4 minutes
    picked = np.floor(np.floor(np.arange(audio.size, dtype=np.float64) * hold_rate / RATE) * RATE / hold_rate).astype(np.int64)
    held = audio[np.minimum(picked, audio.size - 1)]
    steps = 2 ** (bits - 1)
    return np.clip(np.round(held * steps), -steps, steps - 1) / steps


def pitch_track(audio):
    """(f0 per 10 ms frame in Hz, voiced per frame) from librosa.pyin on 16 kHz mono: 65–1000 Hz, a frame unvoiced
    below 0.5 voiced probability, f0 smoothed by a 5-frame median over the voiced frames."""
    import librosa
    from scipy.signal import medfilt
    low = librosa.resample(np.asarray(audio, dtype=np.float32), orig_sr=RATE, target_sr=16000)
    f0, _, probability = librosa.pyin(low, fmin=65.0, fmax=1000.0, sr=16000, frame_length=1024, hop_length=160,
                                      center=True)
    voiced = np.nan_to_num(probability) >= 0.5
    f0 = np.where(voiced & np.isfinite(f0), f0, 0.0)
    smooth = medfilt(f0, 5)
    smooth = np.where(voiced & (smooth > 0), smooth, np.where(voiced, f0, 0.0))
    return smooth, voiced


def vocoder(audio, bands=24, low=100.0, high=8000.0, seed=20261113):
    """A channel vocoder, all wet. Carrier: a band-limited saw (PolyBLEP) following the vocal's own f0, and in
    unvoiced frames white noise 20 dB under it, so the consonants stay. 24 log-spaced second-order band-passes
    100 Hz–8 kHz; in each band the vocal's envelope (rectified, 50 Hz low-pass) times the carrier in that band."""
    from scipy.signal import butter, sosfilt
    audio = np.asarray(audio, dtype=np.float64)
    f0, voiced = pitch_track(audio)
    frames = np.arange(audio.size) / RATE / 0.010                        # frame index of each sample (10 ms hop)
    index = np.minimum(frames.astype(np.int64), f0.size - 1)
    # f0 across unvoiced gaps holds the last voiced value, so the saw does not jump when a voice comes back
    held = f0.copy()
    last = 0.0
    for i in range(held.size):
        last = held[i] if held[i] > 0 else last
        held[i] = last
    first = held[held > 0][0] if (held > 0).any() else 110.0
    held = np.where(held > 0, held, first)
    hz = np.interp(frames, np.arange(f0.size), held)
    dt = hz / RATE
    phase = np.cumsum(dt) % 1.0
    saw = 2.0 * phase - 1.0
    head, tail = phase < dt, phase > 1.0 - dt                           # PolyBLEP at the wrap
    t = phase[head] / dt[head]
    saw[head] -= 2.0 * t - t * t - 1.0
    t = (phase[tail] - 1.0) / dt[tail]
    saw[tail] -= t * t + 2.0 * t + 1.0
    noise = np.random.default_rng(seed).standard_normal(audio.size) * (rms(saw) * 10.0 ** (-20 / 20))
    # voiced or not, per sample, eased over 5 ms so the switch does not click
    mask = voiced[index].astype(np.float64)
    ease = int(0.005 * RATE)
    mask = np.convolve(mask, np.ones(ease) / ease, mode='same')
    carrier = mask * saw + (1.0 - mask) * noise
    edges = np.geomspace(low, high, bands + 1)
    smooth = butter(2, 50.0, 'lowpass', fs=RATE, output='sos')
    out = np.zeros(audio.size)
    for lo, hi in zip(edges[:-1], edges[1:]):
        band = butter(1, [lo, hi], 'bandpass', fs=RATE, output='sos')      # order 1 per edge: a second-order band-pass
        envelope = sosfilt(smooth, np.abs(sosfilt(band, audio)))
        out += envelope * sosfilt(band, carrier)
    return out


def apply(audio, name):
    """`audio` (mono, RATE) treated by `name`. Returns (float32 audio, {'name', 'limitDb'}): the whole file's RMS is
    brought back to the input's, then, if the peak is over full scale, everything is pulled down by one factor
    (`limitDb`, ≤ 0). Deterministic: the same input gives the same samples."""
    if name not in NAMES:
        raise ValueError(f'不认识的人声处理：{name}')
    audio = np.asarray(audio, dtype=np.float64)
    if name == 'none' or not audio.size:
        return audio.astype(np.float32), {'name': name, 'limitDb': 0.0}
    if name == 'vocoder':
        out = vocoder(audio)
    elif name == 'octave_up':
        out = octave(audio, 12)
    elif name == 'octave_down':
        out = octave(audio, -12, drive=4.0)
    elif name in TAPE:
        out = tape(audio, TAPE[name])
        if name == 'tape_deep':
            from scipy.signal import butter, sosfilt
            out = sosfilt(butter(2, 4000.0, 'lowpass', fs=RATE, output='sos'), out)
    else:
        out = crush(audio, *CRUSH[name])
    out = np.asarray(out, dtype=np.float64)[:audio.size]
    if out.size < audio.size:
        out = np.pad(out, (0, audio.size - out.size))
    before, after = rms(audio), rms(out)
    if after > 0:
        out = out * (before / after)
    peak = float(np.abs(out).max()) if out.size else 0.0
    limit = 0.0
    if peak > CEILING:
        limit = 20.0 * math.log10(CEILING / peak)
        out = out * (CEILING / peak)
    return out.astype(np.float32), {'name': name, 'limitDb': round(limit, 2)}
