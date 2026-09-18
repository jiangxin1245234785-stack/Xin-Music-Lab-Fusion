"""Compatibility entry point. The analysis implementation belongs to XLD."""
from pathlib import Path
import runpy

_target = Path(__file__).resolve().parents[2] / "xld-runtime-baseline" / "analysis-separation" / "runner.py"
if __name__ == "__main__":
    runpy.run_path(str(_target), run_name="__main__")
else:
    globals().update({key: value for key, value in runpy.run_path(str(_target)).items() if not key.startswith("__")})
