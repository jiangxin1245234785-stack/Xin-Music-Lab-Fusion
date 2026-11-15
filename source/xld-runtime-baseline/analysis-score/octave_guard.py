"""The octave guard for an RMVPE pitch contour.

`lift_octave_dips` is taken as it is from `source/voiceswap/swap.py`, where it was written and
listened through for the voice-swap work (the cases it names are from 七里香). XLD cannot
import from that project (it is not part of a build), so the function lives here as a copy;
`tests/score-octave-guard.py` holds the two against each other on the same contours while both
are in the tree. Change it there first, then here.
"""


def lift_octave_dips(f0, fps, longest=0.6, tolerance=1.0, settle=0.15, spikes=True):
    """Lift short dips that sit exactly an octave under the note before them.

    Where a harmony doubles the lead an octave down, RMVPE can lock onto the lower voice for
    the length of a note, and every converted voice then sings that note an octave low:
    七里香's 「就像雨水」 at 251.0 s, where all 18 voices dropped D#4 → D#3 on 「水」.
    A real melody rarely falls a full octave for a fraction of a second and then stops or
    comes straight back, so only that shape is lifted. A longer stretch, any other interval,
    or a dip that carries on somewhere else is left exactly as RMVPE heard it.

    Notes are compared, not frames: RMVPE often slides into the dip (「水」 went D#4, a gap,
    then E3 → D#3 → D3), so the first frame alone is not an octave under. The contour is cut
    into notes at unvoiced frames and at frame-to-frame jumps over 4 semitones, and a note
    is lifted when its median sits an octave under the end of the note before it.

    Before the notes are cut, a single frame that leaps over 4 semitones away from two
    neighbours that agree with each other is put back between them (`spikes`). RMVPE throws
    such a frame now and then, and one inside a dip cuts it in two, after which neither half
    looks like a dip that comes back: 七里香's phrase end at 248.2 s went D#4, then D#3 …
    a lone C#5 … C#3, and stayed an octave low in every voice. The frame is changed in the
    returned f0 too, so that it is lifted with the dip instead of left an octave above it.

    Returns the repaired f0 and the lifted spans as (start s, end s, note before, note in dip).
    """
    import numpy as np

    f0 = np.asarray(f0).copy()
    note = np.full(f0.shape, np.nan)
    voiced = f0 > 1
    note[voiced] = 69 + 12 * np.log2(f0[voiced] / 440.0)
    n = len(f0)
    if spikes:
        for k in range(1, n - 1):
            left, here, right = note[k - 1], note[k], note[k + 1]
            if (np.isfinite(left) and np.isfinite(here) and np.isfinite(right) and abs(left - right) <= 2
                    and abs(here - left) > 4 and abs(here - right) > 4):
                note[k] = (left + right) / 2
                f0[k] = 440.0 * 2 ** ((note[k] - 69) / 12)
    segments, start = [], None
    for k in range(n):
        if not np.isfinite(note[k]):
            if start is not None:
                segments.append((start, k))
                start = None
        elif start is None:
            start = k
        elif abs(note[k] - note[k - 1]) > 4:
            segments.append((start, k))
            start = k
    if start is not None:
        segments.append((start, n))

    look, gap = max(1, int(settle * fps)), max(1, int(0.1 * fps))
    lifted = []
    for index in range(1, len(segments)):
        a, b = segments[index]
        before_start, before_end = segments[index - 1]
        if b - a > longest * fps or a - before_end > gap:
            continue
        # Read the note before from `note`, which is updated as notes are lifted, so a
        # glitch already put back does not become the level the next note is judged by.
        level = float(np.median(note[max(before_start, before_end - look):before_end]))
        dip = float(np.median(note[a:b]))
        if abs(level - dip - 12) > tolerance:
            continue
        if b < n and np.isfinite(note[b]):           # cut by a jump, not by silence:
            following = note[b:b + gap]               # it has to come straight back up
            if not np.any(np.abs(following[np.isfinite(following)] - level) <= 2):
                continue
        f0[a:b] = f0[a:b] * 2
        note[a:b] = note[a:b] + 12
        lifted.append((a / fps, b / fps, level, dip))
    return f0, lifted
