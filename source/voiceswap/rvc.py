"""Convert a separated vocal stem with community RVC models, through Applio's inference core.

    python source/voiceswap/rvc.py vocals.wav --model miku iu
    python source/voiceswap/rvc.py vocals.wav --all --out 试听
    python source/voiceswap/rvc.py --list

The second backend next to `swap.py`, with the same contract: a vocal stem in, a stem of
the same length and sample rate out, named `<stem>__<name>.wav` in `--out`, so that
`make_bench.py` puts both kinds of voice on one page. Models come from `fetch_rvc.py`.

Applio lives in `runtime/addons/applio-v1` (override with `XLD_APPLIO_ROOT`), outside the
repo like seedvc-v1. Only its `VoiceConverter` is used, not its app or CLI, so the Gradio
stack is never installed: envs/highres already matches Applio's torch/numpy/librosa pins,
and the three packages it lacked (faiss-cpu, torchcrepe, onnxruntime) sit in the addon's
`deps`. Applio would otherwise read and create a settings file under %APPDATA%; it is
pointed at one inside the addon, so a separately installed Applio's settings never leak
into a render and nothing is written outside the addon.

The conversion settings are Applio's defaults (index rate 0.75, protect 0.5, no RMS mix),
the same for every model. The one setting per model is the octave, from the catalog.
"""
import argparse
import hashlib
import json
import os
import sys
import tempfile
import time
from pathlib import Path

HERE = Path(__file__).resolve().parent
REPO = HERE.parents[1]
ADDON = Path(os.environ.get('XLD_APPLIO_ROOT') or REPO / 'runtime' / 'addons' / 'applio-v1')

#: Pinned so a swapped-out addon is caught here rather than as a strange-sounding render.
#: Applio 3.7.1. RMVPE is byte-identical to the one Seed-VC uses.
UPSTREAM_COMMIT = '6f69726b140c615c8cc6831a7db8b7c5e48ba8af'
WEIGHTS_SHA256 = {
    'rvc/models/predictors/rmvpe.pt': '6d62215f4306e3ca278246188607209f09af3dc77ed4232efdd069798c4ec193',
    'rvc/models/embedders/contentvec/pytorch_model.bin':
        'd8dd400e054ddf4e6be75dab5a2549db748cc99e756a097c496c099f65a4854e',
}

sys.path.insert(0, str(HERE))
import rvc_models as catalog
from swap import follow_octaves, lift_octave_dips

#: Per-conversion state for the f0 guard, as in swap.py. RVC extracts f0 once per
#: conversion, from the source only, so every call is the one to guard. With `follow`
#: set (swap.py's guarded contour and its frame rate), this contour is put in that one's
#: octaves instead of being guarded on its own: `remix.py` does that so both backends sing
#: every note in the same octave. `offset` is the reflection padding in front of the
#: source, which this contour's clock includes.
REPAIR = {'enabled': True, 'follow': None, 'offset': 0.0, 'lifted': []}


def file_sha256(path):
    with path.open('rb') as handle:
        return hashlib.file_digest(handle, 'sha256').hexdigest()


def verify():
    """Check the addon is the one these settings were validated against."""
    upstream = ADDON / 'upstream'
    if not (upstream / 'rvc' / 'infer' / 'infer.py').is_file():
        raise SystemExit(f'找不到 Applio：{upstream}\n'
                         f'设 XLD_APPLIO_ROOT 指向 addon 目录，或按 SPEC.md 装一次。')
    head = (upstream / '.git' / 'HEAD').read_text(encoding='ascii').strip()
    if head != UPSTREAM_COMMIT:
        raise SystemExit(f'Applio 版本不对：{head}，验证用的是 {UPSTREAM_COMMIT}（3.7.1）')
    for relative, expected in WEIGHTS_SHA256.items():
        path = upstream / relative
        if not path.is_file() or file_sha256(path) != expected:
            raise SystemExit(f'权重缺失或校验失败：{path}')
    return upstream


def load_engine(upstream):
    """Import Applio with the octave guard on its RMVPE. Returns a `VoiceConverter`.

    Applio resolves its weights relative to the working directory, so that has to be the
    upstream root before the import and stay there for every call.
    """
    sys.path.insert(0, str(ADDON / 'deps'))
    sys.path.insert(0, str(upstream))
    os.chdir(upstream)
    os.environ['APPLIO_CONFIG_FILE'] = str(ADDON / 'config.json')

    from rvc.lib.predictors import f0 as predictors

    extract = predictors.RMVPE.get_f0

    def get_f0(self, x, *args, **kwargs):
        f0 = extract(self, x, *args, **kwargs)
        if REPAIR['enabled'] and len(f0):
            fps = len(f0) / (len(x) / 16000)
            if REPAIR['follow'] is None:
                f0, REPAIR['lifted'] = lift_octave_dips(f0, fps)
            else:
                f0, REPAIR['lifted'] = follow_octaves(f0, fps, *REPAIR['follow'], offset=REPAIR['offset'])
        return f0

    predictors.RMVPE.get_f0 = get_f0
    from rvc.infer.infer import VoiceConverter
    return VoiceConverter()


def convert(converter, source, model_dir, destination, octave, index_rate, protect):
    """Run one conversion and write it at the source's sample rate and length.

    Applio renders at the model's own rate (32–48 kHz) and its length can differ from the
    source's by a few milliseconds; both are put back here, because the result has to sit
    sample-aligned over the other stems.
    """
    import numpy as np
    import soundfile as sf
    import soxr

    meta = json.loads((model_dir / 'model.json').read_text(encoding='utf-8'))
    index = model_dir / 'model.index'
    info = sf.info(str(source))
    REPAIR.update(lifted=[], offset=converter.config.x_pad)
    with tempfile.TemporaryDirectory() as scratch:
        produced = Path(scratch) / 'out.wav'
        converter.convert_audio(
            audio_input_path=str(source), audio_output_path=str(produced),
            model_path=str(model_dir / 'model.pth'), index_path=str(index) if index.is_file() else '',
            pitch=12 * octave, f0_method='rmvpe', index_rate=index_rate, protect=protect,
            embedder_model=meta['checkpoint']['embedder'])
        audio, rate = sf.read(str(produced), dtype='float32')
    if rate != info.samplerate:
        audio = soxr.resample(audio, rate, info.samplerate, 'VHQ')
    audio = np.pad(audio, (0, max(0, info.frames - len(audio))))[:info.frames]
    destination.parent.mkdir(parents=True, exist_ok=True)
    sf.write(str(destination), audio, info.samplerate)

    # The contour was taken over the source with `x_pad` seconds of reflection on each
    # side, so its times run that much late, and a dip inside the padding is a mirror.
    pad, seconds = converter.config.x_pad, info.frames / info.samplerate
    return [(a - pad, b - pad, level, dip) for a, b, level, dip in REPAIR['lifted']
            if a - pad >= 0 and b - pad <= seconds]


def main(argv=None):
    parser = argparse.ArgumentParser(description='用社区 RVC 模型换人声分轨')
    parser.add_argument('source', type=Path, nargs='?', help='人声分轨 wav（XLD 分离出的 vocals.wav）')
    parser.add_argument('--model', nargs='+', default=[], help='模型名，可多个')
    parser.add_argument('--all', action='store_true', help='全部已下载的模型各转一遍')
    parser.add_argument('--out', type=Path, default=Path('voiceswap-out'))
    parser.add_argument('--octave', type=int, help='统一指定升降几个八度（默认按目录表，女声模型升一个）')
    parser.add_argument('--index-rate', type=float, default=0.75, help='越高越贴模型音色，也越容易糊')
    parser.add_argument('--protect', type=float, default=0.5, help='<0.5 时保护清辅音和气声，0.5 不保护')
    parser.add_argument('--list', action='store_true', help='列出模型')
    parser.add_argument('--keep-octaves', action='store_true',
                        help='不修音高曲线里的短八度下坠（默认会修，见 swap.lift_octave_dips）')
    parser.add_argument('--follow-octaves', type=Path, metavar='RECORD',
                        help='照 swap.py 写的 <源>.f0-repairs.json 定八度，不自己判断（见 swap.follow_octaves）')
    args = parser.parse_args(argv)

    models = ADDON / 'models'
    downloaded = [n for n in catalog.MODELS if (models / n / 'model.json').is_file()]
    if args.list:
        for name, recipe in catalog.MODELS.items():
            have = '' if name in downloaded else '  （未下载）'
            print(f'  {name:<10} {recipe["label"]}  [{recipe["who"]} · {recipe["license"]}]{have}')
        return 0
    REPAIR['enabled'] = not args.keep_octaves
    if args.follow_octaves:
        import numpy as np
        args.follow_octaves = args.follow_octaves.resolve()     # before load_engine's chdir
        record = json.loads(args.follow_octaves.read_text(encoding='utf-8'))
        if not record.get('contour'):
            raise SystemExit(f'{args.follow_octaves.name} 里没有音高曲线，用新版 swap.py 重转一次')
        REPAIR['follow'] = (np.load(args.follow_octaves.parent / record['contour']), record['fps'])
    names = downloaded if args.all else args.model
    if not names:
        raise SystemExit('要么 --model <名字>，要么 --all；--list 看有哪些')
    unknown = [n for n in names if n not in catalog.MODELS]
    if unknown:
        raise SystemExit(f'未知模型：{", ".join(unknown)}')
    missing = [n for n in names if n not in downloaded]
    if missing:
        raise SystemExit(f'这些模型还没下载：{", ".join(missing)}\n'
                         f'先跑 python -I source/voiceswap/fetch_rvc.py {" ".join(missing)}')
    if not args.source or not args.source.is_file():
        raise SystemExit(f'找不到人声分轨：{args.source}')

    source, out = args.source.resolve(), args.out.resolve()
    converter = load_engine(verify())          # chdir happens here; resolve paths first
    stem, started, settings = source.stem, time.monotonic(), {}
    for index, name in enumerate(names, 1):
        began = time.monotonic()
        octave = catalog.MODELS[name]['octave'] if args.octave is None else args.octave
        destination = out / f'{stem}__{name}.wav'
        lifted = convert(converter, source, models / name, destination,
                         octave, args.index_rate, args.protect)
        settings[name] = {'octave': octave, 'indexRate': args.index_rate, 'protect': args.protect}
        if index == 1 and REPAIR['enabled']:
            spans = '、'.join(f'{a:.2f}–{b:.2f}s' for a, b, *_ in lifted) or '无'
            how = f'照 {args.follow_octaves.name} 挪了八度' if args.follow_octaves else '抬回原八度'
            print(f'  音高曲线里{how}的短下坠：{spans}', flush=True)
            record = {'source': str(source), 'backend': 'rvc',
                      'followed': str(args.follow_octaves) if args.follow_octaves else None,
                      'lifted': [[round(a, 2), round(b, 2), round(level, 2), round(dip, 2)]
                                 for a, b, level, dip in lifted]}
            (out / f'{stem}.f0-repairs.json').write_text(
                json.dumps(record, ensure_ascii=False, indent=2), encoding='utf-8')
        shift = f'{octave:+d} 八度' if octave else '原调'
        print(f'  [{index}/{len(names)}] {name:<10} {time.monotonic() - began:5.1f}s  {shift}  '
              f'{destination.name}  {catalog.MODELS[name]["label"]}', flush=True)
    (out / f'{stem}.rvc-run.json').write_text(
        json.dumps({'source': str(source), 'models': settings}, ensure_ascii=False, indent=2),
        encoding='utf-8')
    print(f'\n共 {len(names)} 个 → {out}  用时 {time.monotonic() - started:.0f}s')
    return 0


if __name__ == '__main__':
    sys.exit(main())
