"""Rule-made listening captions for one pilot: what just changed, said in one line.

This twin covers captionStyle 'sentence' only. The 'mark' style ("object · event") lives in
adapter/cues.cjs alone and has no Python counterpart.

    <envs/basic>/python.exe -X utf8 source/scoreview/tools/make_captions.py <pilot>

Reads the pilot's `bundle.json` and writes `captions.json` beside it (`build_bundle.py` then
puts it in the model). Hand-written lines go in `captions.manual.json` in the same folder,
same shape (`[[start, end, text]]`); a hand-written line replaces any rule-made one it
overlaps.

The rules only say what happened (plan A4: get the *timing* right first, leave the writing
to later). Events, from the model alone:

    section   a named section starts
    enter     a stem that has been silent for a while starts playing
    leave     a stem that has been playing goes silent for a while
    return    the voice comes back after a gap (an `enter` of the vocal lane, said differently)
    denser / thinner   the number of note starts per second jumps or drops

A stem is "playing" in a second when a note of it sounds in that second; short holes are
bridged so that a rest between two phrases is not an exit. Events that fall together are
said in one line, the most telling first, and at most one line starts every `SPACING`
seconds, so the screen is never a ticker.
"""
import argparse
import json
import sys
from pathlib import Path

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE))
from make_layers import load_config  # noqa: E402

SPACING = 8.0            # at most one caption starts in this many seconds
SHOWN = 6.0              # how long a caption stays, unless the next one comes sooner
BRIDGE = 4               # seconds of silence inside a part that do not count as leaving
ABSENT = 8               # seconds a part must have been silent for its start to be an entrance
MERGE = 2.5              # an event this soon after the last one belongs to the same moment
SPAN = 4.0               # ... as long as the moment does not stretch past this
CLAUSES = 2              # a line says at most this many things, the most telling first
PRIORITY = {'section': 0, 'return': 1, 'leave': 2, 'enter': 3, 'thinner': 4, 'denser': 5}


def activity(model):
    """{group: [bool per second]} and the label of each group, in lane order."""
    seconds = int(model['track']['duration']) + 1
    playing, labels = {}, {}
    for lane in model['lanes']:
        group = lane.get('group') or lane['id']
        labels.setdefault(group, lane.get('groupLabel') or lane['label'])
        row = playing.setdefault(group, [False] * seconds)
        for item in lane.get('notes') or []:
            for second in range(int(item[0]), min(seconds, int(item[0] + item[1]) + 1)):
                row[second] = True
        for hit in lane.get('hits') or []:
            if int(hit[0]) < seconds:
                row[int(hit[0])] = True
    for row in playing.values():                      # bridge short holes
        last = None
        for second, on in enumerate(row):
            if on:
                if last is not None and 1 < second - last <= BRIDGE + 1:
                    for hole in range(last + 1, second):
                        row[hole] = True
                last = second
    return playing, labels


def onset_rate(model):
    seconds = int(model['track']['duration']) + 1
    rate = [0] * seconds
    for lane in model['lanes']:
        for item in (lane.get('notes') or []) + (lane.get('hits') or []):
            if int(item[0]) < seconds:
                rate[int(item[0])] += 1
    return rate


def events(model, hidden=()):
    playing, labels = activity(model)
    for group in hidden:
        playing.pop(group, None)
    found = []
    for start, _, name, source, *_ in model.get('sections') or []:
        if source in ('songformer', 'manual'):
            found.append((float(start), 'section', name))
    for group, row in playing.items():
        for second in range(1, len(row)):
            before = row[max(0, second - ABSENT):second]
            if row[second] and not any(before) and second >= ABSENT // 2:
                found.append((float(second), 'return' if group == 'vocals' else 'enter', group))
            after = row[second:second + ABSENT]
            if row[second - 1] and not any(after) and len(after) == ABSENT:
                found.append((float(second), 'leave', group))
    rate = onset_rate(model)
    for second in range(8, len(rate) - 4):
        now, before = sum(rate[second:second + 4]) / 4, sum(rate[second - 8:second]) / 8
        if before >= 2 and now >= before * 1.8:
            found.append((float(second), 'denser', ''))
        elif before >= 4 and now <= before * 0.4:
            found.append((float(second), 'thinner', ''))
    return sorted(found), playing, labels


def sentence(moment, playing, labels):
    """One line for the events of one moment."""
    at = int(moment[0][0])
    kinds = {}
    for _, kind, what in moment:
        kinds.setdefault(kind, []).append(what)
    names = lambda groups: '、'.join(labels[g] for g in dict.fromkeys(groups))
    sounding = [g for g, row in playing.items() if any(row[at:at + 3])]
    parts = []
    if 'section' in kinds:
        parts.append(f'进入{kinds["section"][0]}')
    if 'return' in kinds:
        parts.append('人声回来了' if any(playing['vocals'][:at]) else '人声进来了')
    if 'leave' in kinds:
        gone = [g for g in kinds['leave'] if g not in kinds.get('enter', [])]
        left = [g for g in sounding if g not in gone]
        if gone:
            parts.append(f'{names(gone)}退出' + (f'，只剩{names(left)}' if 0 < len(left) <= 2 else ''))
    if 'enter' in kinds:
        parts.append(f'{names(kinds["enter"])}进来了')
    if not parts and 'thinner' in kinds:
        parts.append('一下子空了下来' + (f'，只有{names(sounding)}' if 0 < len(sounding) <= 2 else ''))
    if not parts and 'denser' in kinds:
        parts.append('音符密了起来')
    if len(parts) == 1 and 'section' in kinds and sounding:
        parts.append(f'{names(sounding)}都在' if len(sounding) > 2 else f'只有{names(sounding)}')
    return '，'.join(parts[:CLAUSES]) + '。'


def captions(model, hidden=()):
    found, playing, labels = events(model, hidden)
    moments = []
    for event in found:
        if moments and event[0] - moments[-1][-1][0] <= MERGE and event[0] - moments[-1][0][0] <= SPAN:
            moments[-1].append(event)
        else:
            moments.append([event])
    # A line appears with the most telling thing in it, not with whatever came first.
    # One line per SPACING seconds: when two would start too close, the more telling stays.
    kept = []
    for moment in moments:
        rank, start = min((PRIORITY[kind], time) for time, kind, _ in moment)
        if kept and start - kept[-1][2] < SPACING:
            if rank < kept[-1][1]:
                kept[-1] = (moment, rank, start)
            continue
        kept.append((moment, rank, start))
    lines = []
    for index, (moment, _, start) in enumerate(kept):
        following = kept[index + 1][2] if index + 1 < len(kept) else model['track']['duration']
        end = min(start + SHOWN, following - 0.5)
        lines.append([round(start, 2), round(end, 2), sentence(moment, playing, labels), 'rule'])
    return lines


def merge_manual(rule, manual):
    kept = [line for line in rule if not any(line[0] < m[1] and m[0] < line[1] for m in manual)]
    return sorted(kept + [[float(m[0]), float(m[1]), str(m[2]), 'manual'] for m in manual])


def main(argv=None):
    parser = argparse.ArgumentParser(description='按规则生成导赏字幕')
    parser.add_argument('pilot')
    args = parser.parse_args(argv)
    config = load_config()
    data = config['dataRoot'] / args.pilot
    model = json.loads((data / 'bundle.json').read_text(encoding='utf-8'))
    page = json.loads((HERE.parent / 'audition' / 'page.json').read_text(encoding='utf-8'))
    hidden = page['songs'].get(args.pilot, {}).get('hidden', [])
    lines = captions(model, hidden)
    manual_path = data / 'captions.manual.json'
    manual = json.loads(manual_path.read_text(encoding='utf-8')) if manual_path.is_file() else []
    lines = merge_manual(lines, manual)
    (data / 'captions.json').write_text(json.dumps({'captions': lines}, ensure_ascii=False, indent=1), encoding='utf-8')
    print(f'■ {model["track"]["title"]}：{len(lines)} 条（手写 {len(manual)} 条），平均 {model["track"]["duration"] / max(1, len(lines)):.0f} 秒一条')
    for start, end, text, source in lines:
        print(f'  {int(start) // 60}:{int(start) % 60:02d}  {text}' + ('  ← 手写' if source == 'manual' else ''))
    return 0


if __name__ == '__main__':
    sys.exit(main())
