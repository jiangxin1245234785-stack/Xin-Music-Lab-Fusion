"""analysis-score/runner.py: the left / right level difference (levels.pan, score-layers version 2).

    <any python with numpy and scipy> -X utf8 tests/score-pan.py
"""
import sys
from pathlib import Path

import numpy as np

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE.parent / 'analysis-score'))
import runner

rate = 48000
rng = np.random.default_rng(3)
noise = rng.standard_normal(rate * 4).astype('float32') * 0.1

# Left 6 dB louder than right: +6 dB each second.
stereo = np.stack([noise, noise * 10 ** (-6 / 20)], axis=1)
pan = runner.pan_series(stereo, rate)
assert len(pan) == 4, pan
assert all(abs(v - 6.0) < 0.2 for v in pan), pan

# The same on both sides: 0. Right only: held at -PAN_LIMIT.
assert all(abs(v) < 0.05 for v in runner.pan_series(np.stack([noise, noise], axis=1), rate))
assert all(v == -runner.PAN_LIMIT for v in runner.pan_series(np.stack([noise * 0, noise], axis=1), rate))

# Silence on both sides claims no difference.
assert runner.pan_series(np.zeros((rate * 2, 2), dtype='float32'), rate) == [0.0, 0.0]

# A mono stem has no pan.
assert runner.pan_series(noise[:, None], rate) is None
assert runner.pan_series(noise, rate) is None

# The engine is version 2 in the runner and in the registry (core/score-identity.cjs reads models.json).
import json
assert runner.ENGINE['version'] == 2
assert json.loads((HERE.parent / 'analysis-score' / 'models.json').read_text(encoding='utf-8'))['score-layers']['version'] == 2
print('score pan: PASS (left minus right in dB per second, silence 0, one side held at the limit, mono none, version 2)')
