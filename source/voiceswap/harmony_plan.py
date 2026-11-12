"""Where the second voice goes when the new voice cannot sing it where it is.

Rounds 1-4 of the 七里香 harmony test (`work/karaoke-20261027/`) showed how this goes wrong.
  - The original's second voice sat about an octave under the lead in every kind of
    stretch: 12.0 semitones where it doubled the lead, 13.5 where it went its own way.
  - 晓晓 cannot sing that low (公鸭嗓), so pieces of it were moved, each piece by its own rule.
    The second voice then jumped between unison and 12.7 (round 3) or 4.5 (round 4)
    semitones under the lead at every switch, 24 and 14 times. Heard as 割裂 / 跳脱.
  - An octave lift keeps note names but not intervals: the original's 9ths (28% of its own
    line) became 2nds (28%).
So the second voice is placed one phrase at a time (its own rests split phrases) and a
whole phrase moves together, keeping its distance to the lead and its contour. Candidates:
keep it, lift it an octave, replace it with the lead's unison double, drop it. Each is
scored by counting frames against the voice's measured range (`voice_range.py`) and the
lead; the lowest cost wins and ties go to the smaller change.

Notes are MIDI numbers per frame (NaN = silent), all arrays the same length.
"""
import numpy as np

FPS = 100
REST = 0.3                  # a gap this long in the second voice ends a phrase
UNISON = 1.0                # within this many semitones of the lead is a double, not a crossing:
                            # 七里香's double sits 20.6 cents off the lead (median), 95% within 71
CHOICES = ('keep', 'up', 'unison', 'drop')
# Per frame, ranked by what the ear said in rounds 1-4: out of range (公鸭嗓, rounds 1 and 3)
# and losing the harmony's own line ("主要是和声的设计被淹没的问题", round 2) weigh the same;
# a 2nd against the lead half that. With lost_own at 0.5 every phrase of 七里香 chose the
# unison double, i.e. round 2 again.
WEIGHTS = {'range': 1.0, 'cross': 1.0, 'second': 0.5, 'lost_own': 1.0, 'lost_follow': 0.5}
LABELS = {'keep': '原样', 'up': '整句升八度', 'unison': '换成同八度双轨', 'drop': '不要'}


def precheck(notes, low, high):
    """Share of a part's sung frames outside [low, high]: whether it needs a plan at all."""
    sung = notes[np.isfinite(notes)]
    if not len(sung):
        return {'sung': 0, 'below': 0.0, 'above': 0.0}
    return {'sung': int(len(sung)), 'below': float(np.mean(sung < low - 0.5)), 'above': float(np.mean(sung > high + 0.5))}


def kinds(lead, harmony):
    """'follow' where the second voice doubles the lead (octave or unison), 'own' where it
    sings something else, '' where it is silent."""
    out = np.full(len(lead), '', dtype=object)
    sings = np.isfinite(harmony)
    follow = sings & np.isfinite(lead) & ((np.abs(lead - harmony - 12) < UNISON) | (np.abs(lead - harmony) < UNISON))
    out[sings] = 'own'
    out[follow] = 'follow'
    return out


def phrases(harmony):
    """(start, end) frame ranges of the second voice, split where it rests ≥ REST."""
    sings = np.flatnonzero(np.isfinite(harmony))
    if not len(sings):
        return []
    cuts = np.flatnonzero(np.diff(sings) > REST * FPS)
    starts = np.concatenate([[sings[0]], sings[cuts + 1]])
    ends = np.concatenate([sings[cuts] + 1, [sings[-1] + 1]])
    return list(zip(starts.tolist(), ends.tolist()))


def second_voice(choice, lead, harmony):
    """What the second voice sings under each choice. 'up' leaves frames already on the
    lead's pitch where they are: in a separated harmony those are mostly leaked lead, and
    lifted they would become a ghost melody an octave above the lead."""
    if choice == 'keep':
        return harmony.copy()
    if choice == 'up':
        return np.where(np.abs(lead - harmony) < UNISON, harmony, harmony + 12)
    if choice == 'unison':
        return np.where(np.isfinite(harmony), lead, np.nan)
    return np.full(len(harmony), np.nan)


def score(choice, lead, harmony, kind, low, high):
    """Frame counts for one candidate over one phrase, and their weighted cost."""
    voice = second_voice(choice, lead, harmony)
    sung = np.isfinite(voice)
    under = lead - voice
    both = sung & np.isfinite(lead)
    counts = {
        'range': int(np.sum(sung & ((voice < low - 0.5) | (voice > high + 0.5)))),
        'cross': int(np.sum(both & (under < -UNISON))),
        'second': int(np.sum(both & (under > UNISON) & (under <= 2.5))),
        'lost_own': int(np.sum(kind == 'own')) if choice in ('unison', 'drop') else 0,
        'lost_follow': int(np.sum(kind == 'follow')) if choice == 'drop' else 0,
    }
    counts['cost'] = sum(WEIGHTS[k] * counts[k] for k in WEIGHTS)
    return counts


def plan(lead, harmony, low, high):
    """One choice per phrase: [{'start', 'end' (seconds), 'choice', 'scores': {choice: counts}}]."""
    kind = kinds(lead, harmony)
    out = []
    for a, b in phrases(harmony):
        scores = {c: score(c, lead[a:b], harmony[a:b], kind[a:b], low, high) for c in CHOICES}
        best = min(CHOICES, key=lambda c: (scores[c]['cost'], CHOICES.index(c)))
        out.append({'start': a / FPS, 'end': b / FPS, 'choice': best, 'scores': scores,
                    'own': int(np.sum(kind[a:b] == 'own')), 'follow': int(np.sum(kind[a:b] == 'follow'))})
    return out
