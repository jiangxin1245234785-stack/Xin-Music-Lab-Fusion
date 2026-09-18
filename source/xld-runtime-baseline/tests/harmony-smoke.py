from __future__ import annotations

import json
import math
import subprocess
import sys
import tempfile
from pathlib import Path

import numpy as np
import soundfile as sf


ROOT = Path(__file__).resolve().parents[1]
RUNNER = ROOT / "analysis-harmony" / "harmony_runner.py"
SAMPLE_RATE = 22050
CHORDS = [
    ("C", (261.626, 329.628, 391.995)),
    ("Am", (220.000, 261.626, 329.628)),
    ("F", (174.614, 220.000, 261.626)),
    ("G", (195.998, 246.942, 293.665)),
]


def synthesize() -> np.ndarray:
    seconds = 4
    time = np.arange(seconds * SAMPLE_RATE, dtype=np.float32) / SAMPLE_RATE
    fade = np.minimum(np.minimum(time / .08, (seconds - time) / .08), 1).clip(0, 1)
    sections = []
    for _label, frequencies in CHORDS:
        signal = sum(
            np.sin(2 * math.pi * frequency * time)
            + .18 * np.sin(2 * math.pi * frequency * 2 * time)
            for frequency in frequencies
        )
        sections.append((signal * fade / max(np.max(np.abs(signal)), 1e-8)).astype(np.float32))
    return np.concatenate(sections)


def label_at(result: dict, second: float) -> str:
    return next(segment["label"] for segment in result["segments"] if segment["start"] <= second < segment["end"])


def main() -> None:
    with tempfile.TemporaryDirectory(prefix="xld-harmony-") as temporary:
        directory = Path(temporary)
        audio = directory / "progression.wav"
        sf.write(audio, synthesize(), SAMPLE_RATE)
        cache_hits = []
        summaries = {}
        for engine in ("chord-cqt", "chord-cens", "chord-hybrid"):
            output = directory / f"{engine}.json"
            completed = subprocess.run(
                [sys.executable, str(RUNNER), "--engine", engine, "--input", str(audio), "--output", str(output)],
                cwd=directory,
                capture_output=True,
                text=True,
                encoding="utf-8",
                check=True,
            )
            result = json.loads(output.read_text(encoding="utf-8"))
            observed = [label_at(result, 2 + index * 4) for index in range(4)]
            expected_roots = ["C", "A", "F", "G"]
            if any(not label.startswith(root) for label, root in zip(observed, expected_roots)):
                raise AssertionError(f"{engine}: expected roots {expected_roots}, observed {observed}\n{completed.stdout}")
            cache_hits.append(bool(result["featureCacheHit"]))
            summaries[engine] = observed
        if cache_hits != [False, True, True]:
            raise AssertionError(f"shared cache was not reused: {cache_hits}")
        print(json.dumps({"harmony": summaries, "cacheHits": cache_hits}, ensure_ascii=False))


if __name__ == "__main__":
    main()
