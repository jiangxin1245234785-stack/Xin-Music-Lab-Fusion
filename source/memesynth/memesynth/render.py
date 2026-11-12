"""Turn a routed `Score` plus a `Kit` into audio.

Pitching is plain resampling, so the formants move with the pitch. That chipmunk
effect is the sound the project is after, not a defect to correct (SPEC §8), which is
why nothing here needs a phase vocoder, a formant model, or scipy.

Resampled copies are cached per (sample, ratio). A track uses a few dozen distinct
pitches at most, so a 3000-note drum part resamples once per class rather than 3000
times.
"""
import math
from collections import Counter
from dataclasses import dataclass

import numpy as np

TAIL_SECONDS = 2.0


@dataclass(frozen=True)
class RenderResult:
    """Mixed audio, the per-route stems behind it, and what the run could not place.

    Stems stay mono and unpanned; `stereo_stem` applies the pan on demand. A full
    length song with ten routes would otherwise hold three gigabytes of stereo buffers
    at once, for stems a caller usually writes out one at a time.
    """

    mix: np.ndarray
    stems: dict
    pans: dict
    sample_rate: int
    rendered: int
    unresolved: dict
    truncated: int

    @property
    def peak(self):
        return float(np.abs(self.mix).max()) if self.mix.size else 0.0

    def stereo_stem(self, route):
        """The panned stereo form of one stem, built fresh each call."""
        return to_stereo(self.stems[route], self.pans.get(route, 0.0))

    def summary(self):
        lines = [f'渲染 {self.rendered} 个音符 / {len(self.stems)} 条分轨 / 峰值 {self.peak:.3f}'
                 f'（{20 * math.log10(self.peak):.1f} dBFS）' if self.peak > 0 else
                 f'渲染 {self.rendered} 个音符 / {len(self.stems)} 条分轨 / 输出为静音']
        if self.truncated:
            lines.append(f'  ! {self.truncated} 个音符被素材长度截断（素材比乐谱音符短）')
        for route, count in sorted(self.unresolved.items(), key=lambda item: -item[1]):
            lines.append(f'  ! 路由 "{route}" 在 kit 里没有对应声部，跳过 {count} 个音符')
        return lines


def pitch_to_hz(pitch, transpose=0.0):
    """Equal-tempered MIDI pitch (+ a semitone offset) to frequency."""
    return 440.0 * (2.0 ** ((pitch + transpose - 69) / 12.0))


def resample(audio, ratio):
    """Play `audio` back `ratio` times faster, by linear interpolation.

    Aliasing above Nyquist is left in: at these ratios it reads as grit, and removing
    it would mean the anti-aliasing filter this project explicitly does not want.
    """
    if audio.size == 0:
        return audio
    if abs(ratio - 1.0) < 1e-9:
        return audio
    count = int(round(audio.size / ratio))
    if count <= 1:
        return audio[:1].copy()
    index = np.arange(count, dtype=np.float64) * ratio
    index = index[index <= audio.size - 1]
    return np.interp(index, np.arange(audio.size, dtype=np.float64), audio).astype(np.float32)


def envelope(audio, fade_samples):
    """Apply a linear fade at both ends in place, to stop clicks at the splice points."""
    fade = min(int(fade_samples), audio.size // 2)
    if fade <= 0:
        return audio
    ramp = np.linspace(0.0, 1.0, fade, endpoint=False, dtype=np.float32)
    audio[:fade] *= ramp
    audio[-fade:] *= ramp[::-1]
    return audio


def to_stereo(mono, pan=0.0):
    """Constant-power pan of a mono buffer into an (n, 2) stereo buffer."""
    angle = (float(np.clip(pan, -1.0, 1.0)) + 1.0) * math.pi / 4.0
    return np.stack([mono * math.cos(angle), mono * math.sin(angle)], axis=1)


def peak_factor(buffers, ceiling_db=-1.0):
    """The one gain that brings the loudest of `buffers` to `ceiling_db`, else 1.0.

    One factor for the mix and every stem, so the stems still sum to the mix. Scaling
    stems individually would clip them apart from the mix, or make them unsummable.
    """
    peak = max((float(np.abs(buffer).max()) for buffer in buffers if buffer.size), default=0.0)
    ceiling = 10.0 ** (ceiling_db / 20.0)
    if peak <= ceiling or peak == 0.0:
        return 1.0
    return ceiling / peak


def render(score, kit, progress=None):
    """Render every routed note of `score` through `kit`.

    `progress` is called as `progress(fraction, message)` roughly every 2% so a caller
    can drive a progress bar without this module knowing what one is.
    """
    rate = kit.sample_rate
    longest = max((sample.audio.size for sample in kit.samples.values()), default=0) / rate
    total_samples = int((score.duration + longest + TAIL_SECONDS) * rate) + 1
    stems, cache, unresolved = {}, {}, Counter()
    rendered = truncated = 0
    step = max(1, len(score.notes) // 50)

    for index, note in enumerate(score.notes):
        if progress is not None and index % step == 0:
            progress(index / max(1, len(score.notes)), f'渲染 {note.route}')
        voice = kit.resolve(note.route)
        if voice is None:
            unresolved[note.route] += 1
            continue
        sample = kit.samples[voice.sample]
        ratio = (pitch_to_hz(note.pitch, voice.transpose) / sample.root_hz) if voice.pitched else \
            (2.0 ** (voice.transpose / 12.0))
        key = (voice.sample, round(ratio, 6))
        if key not in cache:
            cache[key] = resample(sample.audio, ratio)
        source = cache[key]
        if source.size == 0:
            continue

        follow = voice.follow if voice.follow != 'auto' else ('sample' if note.is_drum else 'note')
        length = source.size if follow == 'sample' else int(round(note.duration * rate))
        if voice.max_duration > 0:
            length = min(length, int(round(voice.max_duration * rate)))
        if length > source.size:
            truncated += 1
        length = max(1, min(length, source.size))

        grain = envelope(source[:length].copy(), voice.fade * rate)
        grain *= voice.gain * (note.velocity / 127.0)

        if note.route not in stems:
            stems[note.route] = np.zeros(total_samples, dtype=np.float32)
        start = int(round(note.start * rate))
        end = min(start + grain.size, total_samples)
        if end > start:
            stems[note.route][start:end] += grain[:end - start]
            rendered += 1

    if progress is not None:
        progress(1.0, '混合分轨')

    used = max((int(np.flatnonzero(buffer).max()) + 1 for buffer in stems.values()
                if buffer.any()), default=0)
    used = max(used, int(score.duration * rate))
    pans, mix = {}, np.zeros((used, 2), dtype=np.float32)
    for route in list(stems):
        stems[route] = np.ascontiguousarray(stems[route][:used])
        pans[route] = kit.resolve(route).pan
        mix += to_stereo(stems[route], pans[route])
    return RenderResult(mix=mix, stems=stems, pans=pans, sample_rate=rate, rendered=rendered,
                        unresolved=dict(unresolved), truncated=truncated)
