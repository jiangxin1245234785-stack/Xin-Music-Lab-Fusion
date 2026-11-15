"""The sung line for the listening score: lead-vocal notes and the pitch contour they were cut from.

    <roformer python> -X utf8 vocals_runner.py --engine score-vocals --input <original audio> --output <result.json>

Started by the analysis service like any other result engine; the result sits beside the
track's other results as `score-vocals.json`. It is the chain the score view's gate three
approved, moved here from the stage-one tools so that any track can have it:

    vocal stem  ->  lead split (karaoke BS-RoFormer; harmony and doubles go to the backing)
                ->  RMVPE on the lead, 100 frames a second
                ->  octave guard (octave_guard.py)
                ->  notes cut by analysis-midi/vocals.segment with the `vocals-pyin` settings

The lead split is what keeps the curve honest: measured on 七里香, RMVPE plus the guard on the
whole vocal stem still sits an octave off the approved curve for 3.3 s and off by some other
interval for about 5 % of the sung frames, because the stem also holds the harmony. So there
is no "stem only" fallback here: without the split model the runner fails and the score has
no curve, which is better than a wrong one.

Needs, beside this interpreter (the one the RoFormer separation uses): the karaoke model in
`<addons>/karaoke-v1/becruily` (XLD_KARAOKE_ROOT) and RMVPE in `<addons>/seedvc-v1`
(XLD_SEEDVC_ROOT); `<addons>` is the folder XLD_MUSCRIPTOR_ROOT sits in. A stem with next to
no singing gives `lane: null` and nothing else.

The lead split is kept (2026-11-14: XLD is where the vocal results come from; other programs
only read them). It is stored the way a full-song refinement is:

    refinement/<runId>/target.wav     the lead
    refinement/<runId>/residual.wav   the backing = vocal stem - lead (the two sum back to the stem)
    refinement/<cacheKey>.json        kind 'refinement', engine 'karaoke-lead', originalSource = the stem

32-bit float WAV at the stem's rate and channel count, the same as the stems and as XLR's own
`harmony/lead.wav` / `backing.wav`. The files are written into `refinement/.next.<runId>/`,
checked, and the folder is renamed; the manifest is written last. A split whose stem (run id,
size, modification time) is the one the track has now is read back instead of being made again.
`score-vocals.json` records the stem the same way in `source` and the two files in
`provenance.split`. Earlier splits are never removed here (the storage page lists them); only a staging folder of
this engine that a killed run left behind is cleared, the next time a split is saved (`clear_stale_staging`).
"""
import argparse
import hashlib
import json
import os
import shutil
import sys
import time
import uuid
from pathlib import Path

HERE = Path(__file__).resolve().parent
MIDI = HERE.parent / 'analysis-midi'
REFINE = HERE.parent / 'analysis-refine'
ENGINE = {'id': 'score-vocals', 'name': 'Score vocal line', 'family': 'score', 'version': 1}
FPS = 100                     # RMVPE: 160-sample hop at 16 kHz
LEVEL_FLOOR_DB = -40.0        # under the lead's own loud passages; RMVPE's voicing does the rest
FRAME = 1024
#: A stem whose loudest tenth of a second stays under this is not singing (an instrumental's
#: vocal stem is separation residue), and the split and the pitch model are not run on it.
SILENT_STEM_DB = -45.0
#: Fewer sung seconds than this in the whole song is not a vocal line.
MIN_SUNG_SECONDS = 5.0
#: The stored lead split. `version` changes only if the way the split is made changes.
SPLIT = {'engine': 'karaoke-lead', 'model': 'becruily/bs-roformer-karaoke', 'version': 1}


def say(progress, message, phase='analysis'):
    print(json.dumps({'progress': progress, 'phase': phase, 'message': message}, ensure_ascii=False), flush=True)


def addons(need_split=True):
    """(karaoke model dir, RMVPE upstream dir, RMVPE weights). Only what this run needs must be installed."""
    anchor = os.environ.get('XLD_MUSCRIPTOR_ROOT')
    base = Path(anchor).resolve().parent if anchor else None
    karaoke = Path(os.environ.get('XLD_KARAOKE_ROOT') or (base / 'karaoke-v1' if base else ''))
    seedvc = Path(os.environ.get('XLD_SEEDVC_ROOT') or (base / 'seedvc-v1' if base else ''))
    model = karaoke / 'becruily'
    weights = next(iter(sorted((seedvc / 'upstream' / 'checkpoints').rglob('rmvpe.pt'))), None) if (seedvc / 'upstream').is_dir() else None
    checks = [('seedvc-v1 (RMVPE)', bool(weights) and (seedvc / 'upstream' / 'modules' / 'rmvpe.py').is_file())]
    if need_split:
        checks.insert(0, ('karaoke-v1 (主唱分离模型)', (model / 'model.ckpt').is_file() and (model / 'config.yaml').is_file()))
    missing = [name for name, ok in checks if not ok]
    if missing:
        raise SystemExit('人声曲线需要的扩展没有装：' + '、'.join(missing))
    return model, seedvc / 'upstream', weights


def stem_source(stem, run_id):
    """The vocal stem as score-vocals.json and the split manifest record it (as MIDI records its source)."""
    stat = stem.stat()
    return {'stemRunId': run_id, 'stem': 'vocals', 'path': str(stem.resolve()), 'size': stat.st_size, 'mtimeMs': stat.st_mtime_ns / 1e6}


def wave_ok(path, frames, channels, rate):
    import soundfile as sf
    try:
        info = sf.info(str(path))
    except Exception:
        return False
    return info.format == 'WAV' and info.subtype == 'FLOAT' and info.frames == frames and info.channels == channels and info.samplerate == rate


def find_split(track_dir, source, frames, channels, rate):
    """(manifest dict, relative manifest path) of a stored split made from this exact stem, or (None, None)."""
    folder = track_dir / 'refinement'
    if not folder.is_dir():
        return None, None
    for manifest in sorted(folder.glob('*.json')):
        try:
            saved = json.loads(manifest.read_text(encoding='utf-8'))
        except Exception:
            continue
        if not isinstance(saved, dict) or saved.get('kind') != 'refinement' or saved.get('engine') != SPLIT['engine'] or saved.get('splitVersion') != SPLIT['version']:
            continue
        ref = saved.get('originalSource') or {}
        if ref.get('runId') != source['stemRunId'] or ref.get('size') != source['size'] or not isinstance(ref.get('mtimeMs'), (int, float)) \
                or abs(ref['mtimeMs'] - source['mtimeMs']) > 1 or ref.get('frames') != frames:
            continue
        files = saved.get('files') or {}
        if all(isinstance(files.get(name), str) and wave_ok(folder / files[name], frames, channels, rate) for name in ('target', 'residual')):
            return saved, 'refinement/' + manifest.name
    return None, None


#: First line of the README every split folder starts with. It is written before the audio, so a staging folder left
#: by a killed run (cancel lands in the second or two of saving; Windows kills the process, no `except` runs) can be
#: told apart from anything else under refinement/.
README_MARK = 'XLD · 主唱 / 和声（score-vocals 的主唱分离）'
#: A staging folder nothing has written to for this long is not being written any more (saving takes seconds).
STALE_STAGING_SECONDS = 600


def clear_stale_staging(folder, now=None):
    """Remove refinement/.next.<uuid>/ folders this engine left behind. Only ones whose README carries our mark and
    whose newest file is older than STALE_STAGING_SECONDS; anything else is left alone. Returns the names removed."""
    removed = []
    now = time.time() if now is None else now
    for item in folder.glob('.next.*'):
        try:
            uuid.UUID(item.name[len('.next.'):])
            if not item.is_dir() or item.is_symlink():
                continue
            readme = item / 'README.txt'
            if not readme.is_file() or not readme.read_text(encoding='utf-8').startswith(README_MARK):
                continue
            children = list(item.iterdir())
            if any(not child.is_file() or child.name not in ('README.txt', 'target.wav', 'residual.wav') for child in children):
                continue
            if now - max(child.stat().st_mtime for child in children) < STALE_STAGING_SECONDS:
                continue
            shutil.rmtree(item)
            removed.append(item.name)
        except (ValueError, OSError):
            continue
    return removed


def save_split(track_dir, track_id, source, audio, rate, lead, model_dir, device):
    """Write lead and backing under refinement/, checked before they get their final names. Returns (manifest, relative path)."""
    import numpy as np
    import soundfile as sf
    folder = track_dir / 'refinement'
    folder.mkdir(exist_ok=True)
    clear_stale_staging(folder)
    run_id = str(uuid.uuid4())
    staging = folder / ('.next.' + run_id)
    staging.mkdir()
    frames, channels = audio.shape
    try:
        (staging / 'README.txt').write_text(
            README_MARK + '\ntarget.wav = 主唱，residual.wav = 和声（人声分轨减去主唱，两条相加等于人声分轨）\n'
            'Raw FLOAT WAV at the vocal stem\'s rate and channels. Lead = target, backing = residual.\n', encoding='utf-8')
        backing = (audio - lead).astype(np.float32)
        sf.write(str(staging / 'target.wav'), lead, rate, subtype='FLOAT', format='WAV')
        sf.write(str(staging / 'residual.wav'), backing, rate, subtype='FLOAT', format='WAV')
        if not all(wave_ok(staging / name, frames, channels, rate) for name in ('target.wav', 'residual.wav')):
            raise SystemExit('主唱 / 和声写盘后核对不符')
        error = 0.0
        for at in range(0, frames, rate * 10):
            error = max(error, float(np.max(np.abs(audio[at:at + rate * 10] - lead[at:at + rate * 10] - backing[at:at + rate * 10]))))
        os.replace(staging, folder / run_id)
    except BaseException:
        shutil.rmtree(staging, ignore_errors=True)
        raise
    config = (model_dir / 'config.yaml').read_bytes()
    identity = {'splitVersion': SPLIT['version'], 'engine': SPLIT['engine'], 'trackId': track_id, 'parentRunId': source['stemRunId'],
                'source': source['path'], 'size': source['size'], 'mtimeMs': source['mtimeMs']}
    key = hashlib.sha256(json.dumps(identity, sort_keys=True).encode('utf-8')).hexdigest()
    saved = {'schemaVersion': 3, 'kind': 'refinement', 'scope': 'full', 'engine': SPLIT['engine'], 'splitVersion': SPLIT['version'],
             'runId': run_id, 'trackId': track_id, 'parentRunId': source['stemRunId'], 'cacheKey': key, 'target': 'lead',
             'requestedDevice': 'auto', 'sourceStem': 'vocals', 'timeOrigin': 0, 'duration': frames / rate, 'sampleRate': rate,
             'frames': frames, 'channels': channels, 'reconstructionError': error,
             'backend': {'model': SPLIT['model'], 'checkpointBytes': (model_dir / 'model.ckpt').stat().st_size,
                         'configSha256': hashlib.sha256(config).hexdigest(), 'demix': 'analysis-refine/roformer.demix, 20 s chunks, overlap 2', 'device': device},
             'files': {'target': run_id + '/target.wav', 'residual': run_id + '/residual.wav'},
             'originalSource': {'kind': 'stem', 'runId': source['stemRunId'], 'stem': 'vocals', 'startFrame': 0, 'frames': frames,
                                'size': source['size'], 'mtimeMs': source['mtimeMs']},
             'createdAt': time.strftime('%Y-%m-%dT%H:%M:%S%z')}
    temporary = folder / ('.' + key + '.json.next')
    temporary.write_text(json.dumps(saved, indent=2, ensure_ascii=False), encoding='utf-8')
    os.replace(temporary, folder / (key + '.json'))
    return saved, 'refinement/' + key + '.json'


def profiles(node):
    if isinstance(node, dict):
        if 'id' in node and 'options' in node:
            yield node
        for value in node.values():
            yield from profiles(value)
    elif isinstance(node, list):
        for value in node:
            yield from profiles(value)


def split_lead(audio, rate, model_dir):
    import torch
    import yaml
    from bs_roformer.inference import SafeLoaderWithTuple
    from bs_roformer.utils import get_model_from_config, load_checkpoint_state
    from ml_collections import ConfigDict
    sys.path.insert(0, str(REFINE))
    import roformer
    config = ConfigDict(yaml.load((model_dir / 'config.yaml').read_text(encoding='utf-8'), Loader=SafeLoaderWithTuple))
    model = get_model_from_config('bs_roformer', config)
    model.load_state_dict(load_checkpoint_state(model_dir / 'model.ckpt', map_location='cpu'), strict=True)
    model.eval()
    device = 'cuda' if torch.cuda.is_available() else 'cpu'
    lead, run = roformer.demix(model, audio, rate, device, 20, 2, lambda *a: None)
    del model
    if device == 'cuda':
        torch.cuda.empty_cache()
    return lead, run.get('device', device)


def track_pitch(mono, rate, upstream, weights):
    import librosa
    import numpy as np
    import torch
    sys.path.insert(0, str(upstream))
    from modules.rmvpe import RMVPE
    wave = librosa.resample(mono, orig_sr=rate, target_sr=16000)
    device = 'cuda' if torch.cuda.is_available() else 'cpu'
    f0 = np.asarray(RMVPE(str(weights), is_half=False, device=device).infer_from_audio(wave, thred=0.03), dtype=np.float64)
    return f0, len(f0) / (len(wave) / 16000)


def frame_levels(audio, rate, frames, fps):
    """Short-time level (dB) centred on each contour frame."""
    import numpy as np
    hop = rate / fps
    padded = np.pad(audio, (FRAME // 2, FRAME))
    level = np.full(frames, -140.0)
    for k in range(frames):
        chunk = padded[int(round(k * hop)):int(round(k * hop)) + FRAME]
        if chunk.size:
            level[k] = 20 * np.log10(max(float(np.sqrt(np.mean(chunk ** 2))), 1e-7))
    return level


def main(argv=None):
    parser = argparse.ArgumentParser()
    parser.add_argument('--engines', action='store_true')
    parser.add_argument('--engine')
    parser.add_argument('--input')
    parser.add_argument('--output')
    args = parser.parse_args(argv)
    if args.engines:
        print(json.dumps([{**ENGINE, 'available': True}]))
        return 0
    if args.engine != ENGINE['id'] or not args.output:
        parser.error('需要 --engine score-vocals --input <原曲> --output <结果>')
    import numpy as np
    import soundfile as sf
    output = Path(args.output).resolve()
    track_dir = output.parent
    started = time.monotonic()
    manifest = json.loads((track_dir / 'stems.json').read_text(encoding='utf-8'))
    stem = next((track_dir / item['file'] for item in manifest['stems'] if item['name'] == 'vocals'), None)
    if not stem or not stem.is_file():
        raise SystemExit('这首歌没有人声分轨，先做分轨')
    source = stem_source(stem, manifest.get('runId'))
    say(0.03, '正在读取人声分轨', 'decode')
    audio, rate = sf.read(str(stem), dtype='float32', always_2d=True)
    duration = len(audio) / rate
    print(json.dumps({'durationSeconds': duration}), flush=True)
    result = {'schemaVersion': 1, 'kind': 'score-vocals', 'engine': ENGINE, 'duration': duration, 'segments': [],
              'source': source, 'lane': None, 'why': None}

    tenths = np.abs(audio.mean(axis=1))[:len(audio) // (rate // 10) * (rate // 10)].reshape(-1, rate // 10)
    loudest = 20 * np.log10(max(float(np.percentile(np.sqrt(np.mean(tenths ** 2, axis=1)), 99)), 1e-7)) if len(tenths) else -140.0
    if loudest < SILENT_STEM_DB:
        result['why'] = f'人声分轨几乎是空的（最响处 {loudest:.0f} dB），当作没有人声'
    else:
        saved, saved_path = find_split(track_dir, source, len(audio), audio.shape[1], rate)
        model_dir, upstream, weights = addons(need_split=saved is None)
        if saved:
            say(0.08, '主唱 / 和声已经分过，直接读取', 'split')
            lead, _ = sf.read(str(track_dir / 'refinement' / saved['files']['target']), dtype='float32', always_2d=True)
            device = 'reused'
        else:
            say(0.08, '正在把主唱从和声里分出来', 'split')
            lead, device = split_lead(audio, rate, model_dir)
            if stem_source(stem, manifest.get('runId')) != source:
                raise SystemExit('处理期间人声分轨发生变化')
            say(0.62, '正在保存主唱和和声', 'save')
            saved, saved_path = save_split(track_dir, manifest.get('trackId'), source, audio, rate, lead, model_dir, device)
        result['provenance'] = {'split': {'engine': SPLIT['engine'], 'model': SPLIT['model'], 'version': SPLIT['version'], 'runId': saved['runId'],
                                          'manifest': saved_path, 'lead': 'refinement/' + saved['files']['target'],
                                          'backing': 'refinement/' + saved['files']['residual'], 'reused': device == 'reused'},
                                'pitch': {'model': 'RMVPE', 'weights': weights.name, 'fps': FPS}}
        mono = np.ascontiguousarray(lead.mean(axis=1))
        say(0.7, '正在跟主唱的音高', 'pitch')
        f0, fps = track_pitch(mono, rate, upstream, weights)
        if abs(fps - FPS) > 0.5:
            raise SystemExit(f'音高模型的帧率是 {fps:.2f}，不是 {FPS}')
        from octave_guard import lift_octave_dips
        f0, lifted = lift_octave_dips(f0, fps)
        voiced = f0 > 1
        level = frame_levels(mono, rate, len(f0), FPS)
        reference = float(np.percentile(level[voiced], 90)) if voiced.any() else 0.0
        keep = voiced & (level >= reference + LEVEL_FLOOR_DB)
        pitch = np.full(len(f0), np.nan)
        pitch[keep] = 69 + 12 * np.log2(f0[keep] / 440.0)
        if keep.sum() / FPS < MIN_SUNG_SECONDS:
            result['why'] = f'整首歌只跟到 {keep.sum() / FPS:.1f} 秒的人声，当作没有人声'
        else:
            say(0.9, '正在把音高切成音符', 'notes')
            sys.path.insert(0, str(MIDI))
            import vocals
            options = next(p for p in profiles(json.loads((MIDI / 'models.json').read_text(encoding='utf-8'))) if p['id'] == 'vocals-pyin')['options']
            # hop=1, rate=FPS makes vocals.segment's `frame * hop / rate` come out in seconds.
            spans = vocals.segment(pitch, keep, 1, FPS, int(options.get('medianFrames', 3)), max(1, int(options.get('hysteresisFrames', 2))),
                                   float(options.get('minNoteSeconds', .06)), float(options.get('joinGapSeconds', .06)))
            spans, outliers = vocals.drop_outliers(spans, float(options.get('outlierSpanSemitones', 24.0)))
            notes = []
            for start, end, value in sorted(spans):
                if not (0 <= value <= 127 and end > start):
                    continue
                # Louder notes brighter: the note's own level against the lead's loud passages.
                inside = level[int(start * FPS):max(int(start * FPS) + 1, int(end * FPS))]
                velocity = int(np.clip(round(100 + 2.0 * (float(np.median(inside)) - reference)), 45, 127))
                notes.append([round(float(start), 3), round(float(min(end, duration) - start), 3), int(value), velocity])
            result['lane'] = {'id': 'vocals', 'label': '人声', 'kind': 'melody', 'notes': notes,
                              'contour': {'hop': 1 / FPS, 'start': 0, 'midi': [None if not k else round(float(p), 2) for k, p in zip(keep, pitch)]}}
            result['provenance'] = {**result['provenance'], 'chain':'karaoke BS-RoFormer lead split -> RMVPE -> octave guard -> vocals.segment (vocals-pyin settings)',
                                    'device': device, 'octaveLifts': len(lifted), 'sungSeconds': round(float(keep.sum() / FPS), 1),
                                    'notes': len(notes), 'outliersDropped': int(outliers), 'velocity': 'lead level relative to its 90th percentile'}
    result['analysisSeconds'] = round(time.monotonic() - started, 1)
    output.write_text(json.dumps(result, ensure_ascii=False), encoding='utf-8')
    say(1.0, '人声曲线完成' if result['lane'] else '这首歌没有人声曲线', 'complete')
    return 0


if __name__ == '__main__':
    sys.path.insert(0, str(HERE))
    sys.exit(main())
