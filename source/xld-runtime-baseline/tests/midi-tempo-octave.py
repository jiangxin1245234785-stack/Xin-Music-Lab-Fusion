"""The octave cross-check: a half-speed tempo must be caught, a correct one left alone.

Beat This reports a minority of tracks at half or double speed, and R4 (2026-09-18) was
abandoned partly over it. Nothing the tracker says about itself can see the error — on
七里香 the half-speed reading scored 1.2% interval variance and 100% four-beat bars, the
best of the four tracks tested, and the v0.4 adapter still calls that track steady. So the
check compares against an estimator that did not make the mistake.

This tests the classification, not librosa's accuracy: the reference is whatever librosa
reports for the fixture, and the octave cases are built from that reference. A test that
asserted "librosa says 120" would fail on a librosa upgrade for no useful reason.
"""
import sys
from pathlib import Path

import numpy as np

sys.path.insert(0, str(Path(__file__).parents[1] / 'analysis-midi'))
from tempo import AGREE_TOLERANCE, OCTAVE_TOLERANCE, octave_check

RATE = 22050
BPM = 120.0
rng = np.random.default_rng(4)

# A plain click train: unambiguous tempo, nothing for an estimator to argue with.
seconds = 30.0
audio = np.zeros(int(seconds * RATE), np.float32)
period = 60.0 / BPM
for index in range(int(seconds / period)):
    at = int(index * period * RATE)
    length = int(.04 * RATE)
    t = np.arange(length) / RATE
    burst = (np.sin(2 * np.pi * 900 * t) + rng.standard_normal(length) * .4) * np.exp(-t * 40)
    audio[at:at + length] += burst.astype(np.float32) * .8

agree = octave_check(audio, RATE, BPM)
assert agree['status'] == 'checked', agree
reference = agree['reference']
assert abs(reference - BPM) < BPM * .12, f'固件本身不清晰，librosa 读成 {reference}'
assert agree['verdict'] == 'agree' and agree['metricalSplit'] is False, agree
assert agree['candidates'] is None and agree['needsEar'] is False, agree

half = octave_check(audio, RATE, reference / 2)
assert half['verdict'] == 'half-of-reference' and half['metricalSplit'] is True, half
assert half['candidates'] == [round(reference / 2, 2), round(reference, 2)] and half['needsEar'] is True, half
assert abs(half['ratio'] - 0.5) < .02, half

double = octave_check(audio, RATE, reference * 2)
assert double['verdict'] == 'double-of-reference' and double['metricalSplit'] is True, double
assert double['candidates'] == [round(reference * 2, 2), round(reference, 2)] and double['needsEar'] is True, double

# A disagreement that is not a doubling is reported, but is not a metrical split: the two
# estimators are arguing about something other than which level the beat sits on.
other = octave_check(audio, RATE, reference * 1.35)
assert other['verdict'] == 'differs' and other['metricalSplit'] is False, other
assert other['candidates'] is None, other

# Just inside and just outside the tolerance, so the boundary is not accidental.
inside = octave_check(audio, RATE, reference * 2 ** (1 + OCTAVE_TOLERANCE * .8))
assert inside['verdict'] == 'double-of-reference', inside
outside = octave_check(audio, RATE, reference * 2 ** (1 + OCTAVE_TOLERANCE * 2.5))
assert outside['verdict'] == 'differs', outside
near = octave_check(audio, RATE, reference * 2 ** (AGREE_TOLERANCE * .8))
assert near['verdict'] == 'agree', near

# The check is advisory: bad input degrades, it never raises.
assert octave_check(audio, RATE, 0)['status'] == 'unavailable'
assert octave_check(audio, RATE, -5)['status'] == 'unavailable'
assert octave_check(np.zeros(100, np.float32), RATE, 120)['status'] in ('unavailable', 'checked')
stereo = octave_check(np.stack([audio, audio], axis=1), RATE, BPM)
assert stereo['status'] == 'checked' and stereo['verdict'] == 'agree', stereo

# The whole point of the neutral vocabulary: 2026-10-26 the owner listened to 七里香 and
# confirmed the "half-speed" reading was the right one, so a check that named a culprit
# would have been wrong about the very track it was written for.
for result in (half, double):
    assert 'suggestedBpm' not in result, '不要给修正值：哪一个才对是听感问题'
    assert 'suspect' not in result, '不要用 suspect 措辞：两个读数都可能是对的'

print(f'midi-tempo-octave: ok (参考 {reference:.1f} BPM；2 倍分歧两侧都列为候选、不判谁错、'
      f'不给修正值，非倍频的分歧另记，边界内外分明，坏输入不抛异常)')
