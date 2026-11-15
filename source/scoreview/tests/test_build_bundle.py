"""`tools/build_bundle.py` on a made-up track folder, so the rules are tested without the library.

    <envs/basic>/python.exe -X utf8 source/scoreview/tests/test_build_bundle.py

What it pins down: a song that has only notes yields a model with only `track`, `audio`
and `lanes` (stage two depends on that); timbre tracks become lanes; drums fold onto the
seven classes; a part written at one velocity gets its dynamics from its stem; the active
pointer is read the way XLD reads it; and the real analysis root is never touched.
"""
import json
import sys
import tempfile
import uuid
from pathlib import Path

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE.parent / 'tools'))

import numpy as np
import pretty_midi
import soundfile as sf

import build_bundle
import census

RATE = 22050
SECONDS = 12


def stem_audio(path, onsets):
    """A stem with bursts whose loudness rises with each onset, so stem-energy has a ramp to find."""
    audio = np.zeros(RATE * SECONDS, np.float32)
    for index, onset in enumerate(onsets):
        start = int(onset * RATE)
        audio[start:start + RATE // 10] = 0.05 + 0.9 * index / max(1, len(onsets) - 1)
    path.parent.mkdir(parents=True, exist_ok=True)
    sf.write(str(path), audio, RATE)


def write_stem(track, stem, engine, parts, source_run, is_drum=False, velocity=100):
    """One transcription run: `<stem>.mid`, its record, and the flat active pointer."""
    run = str(uuid.uuid4())
    folder = track / 'midi' / stem / run
    folder.mkdir(parents=True)
    midi = pretty_midi.PrettyMIDI()
    count = 0
    for name, notes in parts:
        part = pretty_midi.Instrument(program=0, is_drum=is_drum, name=name)
        for start, end, pitch in notes:
            part.notes.append(pretty_midi.Note(velocity if isinstance(velocity, int) else velocity[count % len(velocity)],
                                               pitch, start, end))
            count += 1
        midi.instruments.append(part)
    midi.write(str(folder / f'{stem}.mid'))
    audio = track / 'stems' / source_run / f'{stem}.wav'
    stem_audio(audio, sorted({start for _, notes in parts for start, _, _ in notes}))
    record = {'schemaVersion': 1, 'kind': 'midi', 'stem': stem, 'runId': run, 'sourceRunId': source_run,
              'engine': engine, 'noteCount': count, 'source': {'path': str(audio)},
              'file': f'midi/{stem}/{run}/{stem}.mid', 'notesFile': f'midi/{stem}/{run}/notes.json'}
    (track / 'midi' / f'{stem}.json').write_text(json.dumps(record), encoding='utf-8')
    return record


def make_track(root):
    track = root / 'Album' / '01 Song__abc'
    track.mkdir(parents=True)
    source_run = str(uuid.uuid4())
    (track / 'track.json').write_text(json.dumps(
        {'schemaVersion': 1, 'trackId': 'abc', 'title': 'Song', 'artist': 'Someone', 'album': 'Album',
         'source': str(root / 'nowhere.flac')}), encoding='utf-8')
    (track / 'stems.json').write_text(json.dumps(
        {'runId': source_run, 'stems': [{'name': 'bass', 'file': f'stems/{source_run}/bass.wav',
                                         'sampleRate': RATE, 'frames': RATE * SECONDS}]}), encoding='utf-8')
    steps = [(1 + i * 0.5, 1.4 + i * 0.5, 60 + i % 5) for i in range(16)]
    write_stem(track, 'guitar', 'muscriptor-large',
               [('clean electric guitar', steps[:10]), ('acoustic guitar', steps[10:])], source_run)
    write_stem(track, 'bass', 'bass-highres', [('bass', [(1 + i, 1.8 + i, 36 + i % 3) for i in range(8)])],
               source_run, velocity=[70, 80, 90, 100, 110, 75, 85, 95])
    write_stem(track, 'drums', 'drums-adtof',
               [('drums', [(1 + i * 0.5, 1.1 + i * 0.5, pitch) for i, pitch in enumerate([35, 42, 38, 42] * 4 + [99])])],
               source_run, is_drum=True)
    return track


def check(condition, message):
    if not condition:
        raise AssertionError(message)


def main():
    with tempfile.TemporaryDirectory() as scratch:
        root = Path(scratch)
        track = make_track(root)

        model, health = build_bundle.build(track)
        check(set(model) == {'contract', 'track', 'audio', 'lanes'},
              f'只有音符的歌，模型里多出了 {sorted(set(model) - {"contract", "track", "audio", "lanes"})}')
        check(model['contract'] == 'xin.score-view/1', model['contract'])
        check(abs(model['track']['duration'] - SECONDS) < 1e-6, '时长应当取自分轨')
        for key in ('chords', 'sections', 'bars', 'vocals', 'contour', 'captions', 'energy', 'audio'):
            check(health[key]['ok'] is False and health[key]['why'], f'缺的层 {key} 没有写明原因')

        ids = [lane['id'] for lane in model['lanes']]
        check(ids == ['guitar/clean electric guitar', 'guitar/acoustic guitar', 'bass', 'drums'], f'轨的拆分或顺序不对：{ids}')
        lanes = {lane['id']: lane for lane in model['lanes']}
        check(lanes['guitar/clean electric guitar']['label'] == '电吉他' and lanes['guitar/acoustic guitar']['group'] == 'guitar',
              '音色轨的名字或分组不对')
        check(len(lanes['guitar/clean electric guitar']['notes']) == 10 and len(lanes['guitar/acoustic guitar']['notes']) == 6,
              '音色轨的音符数不对')

        guitar = [note for key in ids[:2] for note in lanes[key]['notes']]
        check(len({note[3] for note in guitar}) > 6, '写成同一个力度的吉他，没有按分轨能量算出动态')
        ordered = sorted(guitar)
        check(ordered[0][3] < ordered[-1][3], '分轨越响，力度应当越大')
        check(lanes['guitar/acoustic guitar']['meta']['velocity'] == 'stem-energy', lanes['guitar/acoustic guitar']['meta'])
        check(sorted(note[3] for note in lanes['bass']['notes']) == [70, 75, 80, 85, 90, 95, 100, 110],
              '模型自己给了力度的声部不应当被改')
        check(lanes['bass']['meta']['velocity'] == 'model', lanes['bass']['meta'])

        drums = lanes['drums']
        check(drums['rows'] == ['kick', 'snare', 'hihat', 'openhat', 'tom', 'crash', 'ride'], drums['rows'])
        check(len(drums['hits']) == 16, f'鼓应当是 16 击（未知音高 99 丢掉），得到 {len(drums["hits"])}')
        check({hit[1] for hit in drums['hits']} == {0, 1, 2}, '底鼓 35、军鼓 38、踩镲 42 应当落在第 0、1、2 行')
        report = next(lane for lane in health['lanes'] if lane.get('lane') == 'drums')
        check(report['droppedUnknownPitches'] == {99: 1} and report['emptyRows'] == ['openhat', 'tom', 'crash', 'ride'], report)
        for lane in model['lanes']:
            times = [item[0] for item in lane.get('notes') or lane['hits']]
            check(times == sorted(times), f'{lane["id"]} 没按时间排序')

        # The by-source pointer wins over the flat one, as in XLD's derived-assets.read.
        stems = json.loads((track / 'stems.json').read_text(encoding='utf-8'))
        newer = write_stem(track, 'bass', 'bass-highres', [('bass', [(2, 3, 40), (4, 5, 41)])], stems['runId'], velocity=[60, 90])
        flat = json.loads((track / 'midi' / 'bass.json').read_text(encoding='utf-8'))
        pointer = track / 'midi' / 'bass' / 'by-source' / stems['runId'] / 'active.json'
        pointer.parent.mkdir(parents=True)
        older_run = next(p.name for p in (track / 'midi' / 'bass').iterdir() if p.is_dir() and p.name not in ('by-source', newer['runId']))
        older = dict(flat, runId=older_run, noteCount=8, file=f'midi/bass/{older_run}/bass.mid',
                     notesFile=f'midi/bass/{older_run}/notes.json')
        pointer.write_text(json.dumps(older), encoding='utf-8')
        record, disagree = census.active_record(track, 'bass')
        check(record['runId'] == older_run and disagree, 'by-source/active.json 应当优先于 midi/<stem>.json')
        model, _ = build_bundle.build(track)
        check(len(next(lane for lane in model['lanes'] if lane['id'] == 'bass')['notes']) == 8, '没有用激活的那一版')

        # A record that disagrees with its file is refused, not drawn.
        broken = dict(older, noteCount=9)
        pointer.write_text(json.dumps(broken), encoding='utf-8')
        try:
            build_bundle.build(track)
        except SystemExit as error:
            check('对不上' in str(error), str(error))
        else:
            raise AssertionError('记录和文件对不上时应当拒绝')
        pointer.write_text(json.dumps(older), encoding='utf-8')

        # Extra layers come from a data folder, and overrides replace the tags.
        data = root / 'data'
        data.mkdir()
        (data / 'energy.json').write_text(json.dumps({'hop': 0.1, 'db': [-20.0, -18.0]}), encoding='utf-8')
        (data / 'songformer.json').write_text(json.dumps(
            {'segments': [{'start': 0, 'end': 6, 'label': 'intro'}, {'start': 6, 'end': 12, 'label': 'verse'}]}), encoding='utf-8')
        (data / 'beats.json').write_text(json.dumps(
            {'beats': [0.5, 1.0, 1.5, 2.0, 2.5, 3.0, 3.5, 4.0, 4.5], 'bpm': 120.0, 'beatsPerBar': 4, 'firstDownbeat': 1.02,
             'stable': True, 'unstableBecause': []}), encoding='utf-8')
        model, health = build_bundle.build(track, data, {'title': 'Renamed'})
        check(model['track']['title'] == 'Renamed' and model['track']['artist'] == 'Someone', model['track'])
        check(model['energy'] == {'hop': 0.1, 'db': [-20.0, -18.0]}, '响度层没进模型')
        check(model['sections'] == [[0, 6, '引子', 'songformer', 'intro'], [6, 12, '主歌', 'songformer', 'verse']], model['sections'])

        # Section names: mapped, numbered when a name repeats, silence left out as a gap,
        # clipped to the song, slivers dropped, a few milliseconds of overlap closed.
        named = build_bundle.name_sections([
            {'start': 0, 'end': 3, 'label': 'silence'}, {'start': 3, 'end': 20, 'label': 'intro'},
            {'start': 20, 'end': 40.004, 'label': 'verse'}, {'start': 40, 'end': 60, 'label': 'chorus'},
            {'start': 60, 'end': 60.6, 'label': 'outro'}, {'start': 61, 'end': 80, 'label': 'verse'},
            {'start': 80, 'end': 100, 'label': 'Chorus'}, {'start': 100, 'end': 110, 'label': 'drop'},
            {'start': 110, 'end': 140, 'label': 'outro'}], 'songformer', 120)
        check([row[2] for row in named] == ['引子', '主歌 1', '副歌 1', '主歌 2', '副歌 2', 'drop', '尾奏'], [row[2] for row in named])
        check(named[1][:2] == [20, 40] and named[2][:2] == [40, 60], '相邻两段重叠了几毫秒，应当收到下一段的起点')
        check(named[-1][:2] == [110, 120], '段落不应当伸到曲子外面')
        check([row[4] for row in named] == ['intro', 'verse', 'chorus', 'verse', 'Chorus', 'drop', 'outro'], '原始标签应当留着')
        letters = build_bundle.name_sections([
            {'start': 0, 'end': 0.2, 'label': 'E'}, {'start': 0.2, 'end': 30, 'label': 'B'},
            {'start': 30, 'end': 60, 'label': 'A'}, {'start': 60, 'end': 90, 'label': 'B'}], 'msaf', 90)
        check([row[2:] for row in letters] == [['B', 'msaf', 'B'], ['A', 'msaf', 'A'], ['B', 'msaf', 'B']],
              f'只会聚类的引擎应当保留字母、不编号：{letters}')
        check(model['bars']['downbeats'] == [1.0, 3.0] and model['bars']['steady'] is True, model['bars'])
        check('chords' not in model and 'captions' not in model, '没有的层不应当出现')

        (data / 'beats.json').write_text(json.dumps(
            {'beats': [0.5, 1.0, 1.6, 2.0], 'bpm': 110.0, 'beatsPerBar': None, 'firstDownbeat': 0.5,
             'stable': False, 'unstableBecause': ['小节长度不一致，定不出拍号']}), encoding='utf-8')
        model, health = build_bundle.build(track, data)
        check(model['bars']['steady'] is False and model['bars']['downbeats'] == [] and model['bars']['beatsPerBar'] is None,
              '不稳定的网格不应当带小节线')
        check('D4' in health['bars']['why'], health['bars'])

        touched = [p for p in (build_bundle.REPO / 'artifacts' / 'refinement-three-20260915' / 'analysis').glob('scoreview*')]
        check(not touched, '分析根里出现了本项目的文件')
    print(json.dumps({'ok': True}, ensure_ascii=False))
    return 0


if __name__ == '__main__':
    sys.exit(main())
