"""Load and validate a kit: the meme samples plus the route -> voice mapping.

A kit is one JSON file next to its `samples/` directory. Sample pitch analysis stays
out of this program entirely — `rootHz` is measured offline once and written into the
JSON, so nothing here needs librosa (SPEC §10).

Routing resolves most specific first: a note on `guitar/distorted electric guitar`
takes that voice if the kit defines it, otherwise falls back to `guitar`. Two levels,
no deeper.
"""
import json
from dataclasses import dataclass, field
from pathlib import Path

import numpy as np
import soundfile


class KitError(Exception):
    """Raised with every problem found, so one run reports them all (SPEC §5)."""

    def __init__(self, problems):
        self.problems = list(problems)
        super().__init__('\n'.join(self.problems))


@dataclass(frozen=True)
class Sample:
    """One meme sample, mono, already at the project sample rate."""

    name: str
    path: Path
    root_hz: float
    audio: np.ndarray


@dataclass(frozen=True)
class Voice:
    """How one route is played: which sample, how it is pitched, how long it lasts.

    `follow` decides the single most audible parameter of the whole project — whether a
    note lasts as long as the score says (`note`) or as long as the sample naturally
    runs (`sample`). Default is `sample` for drums and `note` for everything else.
    `max_duration` caps either one.
    """

    route: str
    sample: str
    transpose: float = 0.0
    gain: float = 1.0
    pan: float = 0.0
    pitched: bool = True
    follow: str = 'auto'
    max_duration: float = 0.0
    fade: float = 0.005


@dataclass(frozen=True)
class Kit:
    """A loaded kit, ready for the renderer."""

    name: str
    sample_rate: int
    samples: dict
    voices: dict
    unresolved: set = field(default_factory=set)

    def resolve(self, route):
        """Return the voice for `route`, falling back to its stem, or None."""
        if route in self.voices:
            return self.voices[route]
        return self.voices.get(route.split('/')[0])


def load_sample_audio(path, sample_rate):
    """Read a wav as mono float32 at `sample_rate`, resampling by linear interpolation."""
    audio, source_rate = soundfile.read(str(path), dtype='float32', always_2d=True)
    audio = audio.mean(axis=1)
    if source_rate != sample_rate and audio.size:
        count = max(1, int(round(audio.size * sample_rate / source_rate)))
        audio = np.interp(np.linspace(0.0, audio.size - 1, count, dtype=np.float64),
                          np.arange(audio.size, dtype=np.float64), audio).astype(np.float32)
    return np.ascontiguousarray(audio, dtype=np.float32)


def load_kit(path, sample_rate=48000):
    """Load a kit JSON, read every sample, and validate the whole thing at once."""
    path = Path(path)
    try:
        data = json.loads(path.read_text(encoding='utf-8'))
    except FileNotFoundError:
        raise KitError([f'找不到 kit 文件：{path}']) from None
    except json.JSONDecodeError as error:
        raise KitError([f'kit JSON 解析失败：{path} 第 {error.lineno} 行 — {error.msg}']) from None

    problems, samples = [], {}
    root = path.parent
    for name, entry in (data.get('samples') or {}).items():
        file = entry.get('file') if isinstance(entry, dict) else entry
        if not file:
            problems.append(f'素材 "{name}" 没有 file 字段')
            continue
        sample_path = (root / file) if not Path(file).is_absolute() else Path(file)
        if not sample_path.is_file():
            problems.append(f'素材 "{name}" 的文件不存在：{sample_path}')
            continue
        root_hz = float(entry.get('rootHz', 0.0) if isinstance(entry, dict) else 0.0)
        if root_hz <= 0:
            problems.append(f'素材 "{name}" 缺少 rootHz（离线测好基频后写进 kit.json）')
            continue
        try:
            audio = load_sample_audio(sample_path, sample_rate)
        except Exception as error:  # noqa: BLE001 - surfaced as a validation problem
            problems.append(f'素材 "{name}" 读取失败：{type(error).__name__}: {error}')
            continue
        if audio.size == 0:
            problems.append(f'素材 "{name}" 是空文件：{sample_path}')
            continue
        samples[name] = Sample(name=name, path=sample_path, root_hz=root_hz, audio=audio)

    voices = {}
    for route, entry in (data.get('voices') or {}).items():
        key = '/'.join(part.strip().lower() for part in route.split('/') if part.strip())
        if not isinstance(entry, dict) or not entry.get('sample'):
            problems.append(f'路由 "{route}" 没有 sample 字段')
            continue
        if entry['sample'] not in samples:
            # A sample that failed to load already reported itself; don't say it twice.
            if not any(problem.startswith(f'素材 "{entry["sample"]}"') for problem in problems):
                problems.append(f'路由 "{route}" 引用了未定义的素材 "{entry["sample"]}"')
            continue
        follow = str(entry.get('follow', 'auto')).lower()
        if follow not in {'auto', 'note', 'sample'}:
            problems.append(f'路由 "{route}" 的 follow 只能是 auto / note / sample，收到 "{follow}"')
            continue
        voices[key] = Voice(route=key, sample=entry['sample'], transpose=float(entry.get('transpose', 0.0)),
                            gain=float(entry.get('gain', 1.0)), pan=float(np.clip(entry.get('pan', 0.0), -1.0, 1.0)),
                            pitched=bool(entry.get('pitched', True)), follow=follow,
                            max_duration=float(entry.get('maxDur', 0.0)), fade=float(entry.get('fade', 0.005)))

    # Only when nothing else went wrong: otherwise this restates the real cause.
    if not problems and not samples:
        problems.append('kit 没有定义任何素材')
    if not problems and not voices:
        problems.append('kit 没有定义任何路由')
    if problems:
        raise KitError(problems)
    return Kit(name=str(data.get('name') or path.stem), sample_rate=sample_rate,
               samples=samples, voices=voices)
